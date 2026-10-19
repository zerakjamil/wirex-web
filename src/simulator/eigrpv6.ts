import type { EigrpV6Candidate, EigrpV6Entry, EigrpV6Packet, Ipv6RouteEntry, NetworkDevice, NetworkPort, PacketPdu } from '../types/network'
import { ipToNumber, isValidIpv4 } from './protocols/ip'
import { ipv6LinkLocalFromMac, ipv6NetworkAddress, isIpv6LinkLocal, isValidIpv6 } from './protocols/ipv6'
import { eigrpMetric, portBandwidthKbps, portDelayMicroseconds } from './eigrp'

// EIGRPv6 (RFC 7868) for IPv6: the IPv6 process is enabled per interface with
// `ipv6 eigrp <as>` (there are no network statements), adjacencies run between
// link-local addresses over ff02::a, and connected global prefixes are
// advertised with the same composite metric as EIGRP for IPv4.
export interface EigrpV6Outbound { deviceId: string; portId: string; pdu: PacketPdu }

const SIMULATION_TICK_MS = 60
const EIGRP_V6_HELLO_MS = 5000
const EIGRP_V6_HOLD_MS = 15000
const MAX_ROUTES = 2000
const MAX_ENTRIES_PER_PACKET = 25
const ALL_EIGRP_ROUTERS = 'ff02::a'
const ALL_EIGRP_ROUTERS_MAC = '33:33:00:00:00:0a'

const up = (d: NetworkDevice, p: NetworkPort): boolean => d.power !== false && p.adminStatus === 'up' && p.status === 'up'
const globalAddresses = (p: NetworkPort) => (p.ipv6Addresses ?? []).filter(address => isValidIpv6(address.address) && !isIpv6LinkLocal(address.address))
const prefixKey = (prefix: string, prefixLength: number) => `${prefix}/${prefixLength}`

export const ipv6EigrpPassive = (d: NetworkDevice, p: NetworkPort) =>
  !!d.config.ipv6EigrpPassiveInterfaces?.includes(p.name) || !!d.config.ipv6EigrpPassiveDefault && !d.config.ipv6EigrpActiveInterfaces?.includes(p.name)

export const ipv6EigrpEnabled = (d: NetworkDevice, p: NetworkPort) =>
  d.config.ipv6EigrpAs !== undefined && d.config.ipv6EigrpShutdown !== true && p.ipv6EigrpAs === d.config.ipv6EigrpAs

export const hasIpv6Eigrp = (d: NetworkDevice) =>
  ((d.type === 'router' && d.config.ipRouting !== false) || (d.type === 'switch' && d.config.ipRouting === true)) && d.config.ipv6EigrpAs !== undefined

function routerId(d: NetworkDevice) {
  return d.config.ipv6EigrpRouterId || d.ipv6Eigrp?.routerId || d.ports.filter(p => p.ipAddress && isValidIpv4(p.ipAddress) && p.ipAddress !== '0.0.0.0').sort((a, b) => ipToNumber(b.ipAddress!) - ipToNumber(a.ipAddress!))[0]?.ipAddress
}

function ports(d: NetworkDevice) {
  return d.ports.filter(p => up(d, p) && ipv6EigrpEnabled(d, p) && globalAddresses(p).length > 0 && ipv6LinkLocalFromMac(p.macAddress))
}

function copy(d: NetworkDevice): NetworkDevice {
  return { ...d, ipv6Eigrp: d.ipv6Eigrp && { ...d.ipv6Eigrp, neighbors: d.ipv6Eigrp.neighbors.map(n => ({ ...n })), candidates: d.ipv6Eigrp.candidates.map(c => ({ ...c })), lastHelloAt: { ...d.ipv6Eigrp.lastHelloAt } } }
}

function packet(d: NetworkDevice, p: NetworkPort, body: EigrpV6Packet, dest: { ip: string; mac: string }, summary: string, decision: string): PacketPdu {
  return {
    id: `eigrpv6-${crypto.randomUUID()}`, protocol: 'EIGRP', sourceIp: ipv6LinkLocalFromMac(p.macAddress)!, destIp: dest.ip, sourceMac: p.macAddress, destMac: dest.mac, etherType: '0x86DD', ttl: 255,
    summary, payload: { eigrpV6: body },
    explanation: { layer1: `EIGRPv6 outbound interface: ${p.name}.`, layer2: `${p.macAddress} to ${dest.mac}.`, layer3: `IPv6, IP protocol 88: link-local source to ${dest.ip}.`, layer4AndAbove: `EIGRPv6 ${body.type} for autonomous system ${body.asNumber}.`, deviceDecision: decision },
  }
}

function hello(d: NetworkDevice, p: NetworkPort): EigrpV6Outbound {
  const body: EigrpV6Packet = { type: 'hello', asNumber: d.config.ipv6EigrpAs!, holdTimeSeconds: Math.floor(EIGRP_V6_HOLD_MS / 1000), routerId: d.ipv6Eigrp!.routerId }
  return { deviceId: d.id, portId: p.id, pdu: packet(d, p, body, { ip: ALL_EIGRP_ROUTERS, mac: ALL_EIGRP_ROUTERS_MAC }, `EIGRPv6 Hello (AS ${d.config.ipv6EigrpAs})`, `${d.name} advertises its presence to the EIGRPv6 multicast group on ${p.name}.`) }
}

function advertisedEntries(d: NetworkDevice): EigrpV6Entry[] {
  const best = new Map<string, EigrpV6Entry>()
  for (const p of ports(d)) for (const address of globalAddresses(p)) {
    const prefix = ipv6NetworkAddress(address.address, address.prefixLength)
    if (!prefix) continue
    const entry: EigrpV6Entry = { prefix, prefixLength: address.prefixLength, bandwidthKbps: portBandwidthKbps(p), delayMicroseconds: portDelayMicroseconds(p), hopCount: 0, metric: 0 }
    if (!best.has(prefixKey(entry.prefix, entry.prefixLength))) best.set(prefixKey(entry.prefix, entry.prefixLength), entry)
  }
  for (const candidate of selectedCandidates(d)) {
    const entry: EigrpV6Entry = { prefix: candidate.prefix, prefixLength: candidate.prefixLength, bandwidthKbps: candidate.bandwidthKbps, delayMicroseconds: candidate.delayMicroseconds, hopCount: candidate.hopCount, metric: candidate.metric }
    const prior = best.get(prefixKey(entry.prefix, entry.prefixLength))
    if (!prior || entry.metric < prior.metric) best.set(prefixKey(entry.prefix, entry.prefixLength), entry)
  }
  return [...best.values()]
}

function updates(d: NetworkDevice, p: NetworkPort, peer?: PacketPdu): EigrpV6Outbound[] {
  const entries = advertisedEntries(d)
  const chunks: EigrpV6Entry[][] = []
  for (let i = 0; i < entries.length; i += MAX_ENTRIES_PER_PACKET) chunks.push(entries.slice(i, i + MAX_ENTRIES_PER_PACKET))
  if (!chunks.length) chunks.push([])
  const dest = peer ? { ip: peer.sourceIp, mac: peer.sourceMac } : { ip: ALL_EIGRP_ROUTERS, mac: ALL_EIGRP_ROUTERS_MAC }
  return chunks.map(chunk => {
    const body: EigrpV6Packet = { type: 'update', asNumber: d.config.ipv6EigrpAs!, holdTimeSeconds: Math.floor(EIGRP_V6_HOLD_MS / 1000), routerId: d.ipv6Eigrp!.routerId, entries: chunk, complete: chunks.length === 1 }
    return { deviceId: d.id, portId: p.id, pdu: packet(d, p, body, dest, `EIGRPv6 Update (AS ${d.config.ipv6EigrpAs}): ${chunk.length} prefix entries`, peer ? `${d.name} sends its current IPv6 topology to one newly discovered neighbor.` : `${d.name} sends a triggered EIGRPv6 update for a topology change.`) }
  })
}

function selectedCandidates(d: NetworkDevice): EigrpV6Candidate[] {
  const best = new Map<string, EigrpV6Candidate>()
  for (const candidate of d.ipv6Eigrp?.candidates ?? []) {
    const port = d.ports.find(p => p.id === candidate.portId)
    if (!port || !up(d, port) || !ipv6EigrpEnabled(d, port)) continue
    const key = prefixKey(candidate.prefix, candidate.prefixLength)
    const prior = best.get(key)
    if (!prior || candidate.metric < prior.metric || candidate.metric === prior.metric && candidate.nextHop < prior.nextHop) best.set(key, candidate)
  }
  return [...best.values()]
}

function selectRoutes(d: NetworkDevice) {
  const local = new Set(ports(d).flatMap(p => globalAddresses(p).map(a => prefixKey(ipv6NetworkAddress(a.address, a.prefixLength) ?? a.address, a.prefixLength))))
  const best = new Map<string, { candidate: EigrpV6Candidate; port: NetworkPort }>()
  for (const candidate of d.ipv6Eigrp?.candidates ?? []) {
    const port = d.ports.find(p => p.id === candidate.portId)
    if (!port || !up(d, port) || !ipv6EigrpEnabled(d, port) || local.has(prefixKey(candidate.prefix, candidate.prefixLength))) continue
    const key = prefixKey(candidate.prefix, candidate.prefixLength), prior = best.get(key)
    if (!prior || candidate.metric < prior.candidate.metric || candidate.metric === prior.candidate.metric && candidate.nextHop < prior.candidate.nextHop) best.set(key, { candidate, port })
  }
  const learned: Ipv6RouteEntry[] = [...best.values()].map(({ candidate, port }) => ({ network: candidate.prefix, prefixLength: candidate.prefixLength, nextHop: candidate.nextHop, interfaceName: port.name, metric: candidate.metric, type: 'D' as const }))
  d.ipv6RoutingTable = [...(d.ipv6RoutingTable ?? []).filter(route => route.type !== 'D'), ...learned]
}

export function prepareIpv6EigrpTick(devices: NetworkDevice[]) {
  const outbound: EigrpV6Outbound[] = []
  if (!devices.some(d => hasIpv6Eigrp(d) || d.ipv6Eigrp || (d.ipv6RoutingTable ?? []).some(r => r.type === 'D'))) return { devices, outbound }
  const updated = devices.map(original => {
    if (!hasIpv6Eigrp(original) || original.power === false || original.config.ipv6EigrpShutdown === true || !routerId(original)) {
      const learned = (original.ipv6RoutingTable ?? []).filter(r => r.type === 'D')
      return original.ipv6Eigrp || learned.length ? { ...original, ipv6Eigrp: undefined, ipv6RoutingTable: (original.ipv6RoutingTable ?? []).filter(r => r.type !== 'D').length ? (original.ipv6RoutingTable ?? []).filter(r => r.type !== 'D') : undefined } : original
    }
    const first = !original.ipv6Eigrp
    const d: NetworkDevice = copy(original)
    d.ipv6Eigrp = d.ipv6Eigrp ?? { clock: 0, routerId: routerId(d)!, neighbors: [], candidates: [], lastHelloAt: {}, signature: '' }
    const runtime = d.ipv6Eigrp, active = ports(d)
    runtime.clock += SIMULATION_TICK_MS
    const expired = runtime.neighbors.filter(n => runtime.clock - n.lastHello > n.holdTimeMs || !active.some(p => p.id === n.portId))
    if (expired.length) {
      const lost = new Set(expired.map(n => `${n.address}|${n.portId}`))
      runtime.neighbors = runtime.neighbors.filter(n => !lost.has(`${n.address}|${n.portId}`))
      runtime.candidates = runtime.candidates.filter(c => !lost.has(`${c.nextHop}|${c.portId}`))
    }
    selectRoutes(d)
    const signature = JSON.stringify([active.map(p => [p.id, globalAddresses(p).map(a => `${a.address}/${a.prefixLength}`)]), d.config.ipv6EigrpAs, (d.ipv6RoutingTable ?? []).filter(r => r.type === 'D')])
    if (signature !== runtime.signature) {
      runtime.signature = signature
      if (!first) for (const p of active.filter(p => !ipv6EigrpPassive(d, p))) outbound.push(...updates(d, p))
    }
    for (const p of active.filter(p => !ipv6EigrpPassive(d, p))) {
      if (runtime.clock - (runtime.lastHelloAt[p.id] ?? -EIGRP_V6_HELLO_MS) >= EIGRP_V6_HELLO_MS) {
        runtime.lastHelloAt[p.id] = runtime.clock
        outbound.push(hello(d, p))
      }
    }
    return d
  })
  return { devices: updated, outbound }
}

function learnCandidate(d: NetworkDevice, p: NetworkPort, nextHop: string, entry: EigrpV6Entry) {
  const runtime = d.ipv6Eigrp!, network = ipv6NetworkAddress(entry.prefix, entry.prefixLength)
  if (!network) return
  if (ports(d).some(local => globalAddresses(local).some(address => address.prefixLength === entry.prefixLength && ipv6NetworkAddress(address.address, address.prefixLength) === network))) return
  const existing = runtime.candidates.find(c => c.prefix === network && c.prefixLength === entry.prefixLength && c.portId === p.id && c.nextHop === nextHop)
  if (!existing && runtime.candidates.length >= MAX_ROUTES) return
  const bandwidthKbps = Math.min(entry.bandwidthKbps, portBandwidthKbps(p))
  const delayMicroseconds = entry.delayMicroseconds + portDelayMicroseconds(p)
  const next: EigrpV6Candidate = { prefix: network, prefixLength: entry.prefixLength, portId: p.id, nextHop, bandwidthKbps, delayMicroseconds, hopCount: entry.hopCount + 1, reportedMetric: entry.metric, metric: eigrpMetric(bandwidthKbps, delayMicroseconds), updatedAt: runtime.clock }
  runtime.candidates = [...runtime.candidates.filter(c => c !== existing), next]
}

export function receiveIpv6EigrpPacket(original: NetworkDevice, p: NetworkPort, pdu: PacketPdu): { device: NetworkDevice; outbound: EigrpV6Outbound[]; reason?: string } {
  const outbound: EigrpV6Outbound[] = [], body = pdu.payload.eigrpV6
  const reject = (reason: string) => {
    const device = original.ipv6Eigrp ? { ...original, ipv6Eigrp: { ...original.ipv6Eigrp, lastError: reason } } : original
    return { device, outbound, reason }
  }
  if (!hasIpv6Eigrp(original) || !original.ipv6Eigrp || !body) return reject(`EIGRPv6 is not enabled on ${original.name}.`)
  if (!up(original, p) || !ipv6EigrpEnabled(original, p)) return reject(`EIGRPv6 is not enabled on ${original.name} ${p.name}.`)
  if (!isIpv6LinkLocal(pdu.sourceIp)) return reject(`EIGRPv6 neighbor on ${p.name} used ${pdu.sourceIp} instead of a link-local source.`)
  if (body.asNumber !== original.config.ipv6EigrpAs) return reject(`EIGRPv6 AS mismatch on ${p.name}: local AS ${original.config.ipv6EigrpAs}, received AS ${body.asNumber}.`)
  if (body.routerId === original.ipv6Eigrp.routerId) return reject(`Duplicate EIGRPv6 router ID ${body.routerId} received from ${pdu.sourceIp} on ${p.name}.`)
  if (!['hello', 'update'].includes(body.type)) return reject(`Malformed EIGRPv6 packet rejected on ${p.name}.`)
  if (!Number.isFinite(body.holdTimeSeconds) || body.holdTimeSeconds < 1 || body.holdTimeSeconds > 65535) return reject(`Malformed EIGRPv6 hold time rejected on ${p.name}.`)
  const d = copy(original), runtime = d.ipv6Eigrp!
  runtime.lastError = undefined
  const prior = runtime.neighbors.find(n => n.address === pdu.sourceIp && n.portId === p.id)
  runtime.neighbors = [...runtime.neighbors.filter(n => !(n.address === pdu.sourceIp && n.portId === p.id)), { address: pdu.sourceIp, portId: p.id, macAddress: pdu.sourceMac, routerId: body.routerId, lastHello: runtime.clock, holdTimeMs: body.type === 'hello' ? body.holdTimeSeconds * 1000 : prior?.holdTimeMs ?? EIGRP_V6_HOLD_MS, since: prior?.since ?? runtime.clock }].slice(-512)
  if (body.type === 'hello') {
    if (!prior) outbound.push(...updates(d, p, pdu))
    return { device: d, outbound }
  }
  if (!Array.isArray(body.entries) || body.entries.length > MAX_ENTRIES_PER_PACKET) return reject(`Malformed EIGRPv6 update rejected on ${p.name}.`)
  const valid = body.entries.every(entry => typeof entry.prefix === 'string' && isValidIpv6(entry.prefix) && Number.isInteger(entry.prefixLength) && entry.prefixLength >= 0 && entry.prefixLength <= 128 && Number.isFinite(entry.bandwidthKbps) && entry.bandwidthKbps >= 1 && Number.isFinite(entry.delayMicroseconds) && entry.delayMicroseconds >= 0 && Number.isInteger(entry.hopCount) && entry.hopCount >= 0 && Number.isFinite(entry.metric) && entry.metric >= 0)
  if (!valid) return reject(`Malformed EIGRPv6 update rejected on ${p.name}.`)
  const peerKey = `${pdu.sourceIp}|${p.id}`
  if (body.complete !== false) runtime.candidates = runtime.candidates.filter(c => `${c.nextHop}|${c.portId}` !== peerKey || body.entries!.some(entry => entry.prefix === c.prefix && entry.prefixLength === c.prefixLength))
  for (const entry of body.entries) learnCandidate(d, p, pdu.sourceIp, entry)
  selectRoutes(d)
  return { device: d, outbound }
}

export function ipv6EigrpConfigLines(d: NetworkDevice): string[] {
  const lines: string[] = []
  for (const p of d.ports) if (p.ipv6EigrpAs !== undefined) lines.push(`interface ${p.name}`, ` ipv6 eigrp ${p.ipv6EigrpAs}`, '!')
  if (d.config.ipv6EigrpAs !== undefined) {
    lines.push(`ipv6 router eigrp ${d.config.ipv6EigrpAs}`)
    if (d.config.ipv6EigrpRouterId) lines.push(` eigrp router-id ${d.config.ipv6EigrpRouterId}`)
    if (d.config.ipv6EigrpPassiveDefault) lines.push(' passive-interface default')
    for (const name of d.config.ipv6EigrpPassiveInterfaces ?? []) lines.push(` passive-interface ${name}`)
    for (const name of d.config.ipv6EigrpActiveInterfaces ?? []) lines.push(` no passive-interface ${name}`)
    if (d.config.ipv6EigrpShutdown) lines.push(' shutdown')
    lines.push('!')
  }
  return lines
}

export function stripIpv6EigrpRuntime(devices: NetworkDevice[]) {
  return devices.map(d => d.ipv6Eigrp || (d.ipv6RoutingTable ?? []).some(r => r.type === 'D')
    ? { ...d, ipv6Eigrp: undefined, ipv6RoutingTable: (d.ipv6RoutingTable ?? []).filter(r => r.type !== 'D').length ? (d.ipv6RoutingTable ?? []).filter(r => r.type !== 'D') : undefined }
    : d)
}
