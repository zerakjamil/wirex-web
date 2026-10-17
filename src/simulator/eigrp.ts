import type { EigrpCandidate, EigrpEntry, EigrpPacket, NetworkDevice, NetworkPort, PacketPdu, RouteEntry } from '../types/network'
import { getNetworkAddress, ipToNumber, isInSameSubnet, isValidIpv4 } from './protocols/ip'
import { matchesWildcard } from './acl'
import { SIMULATION_TICK_MS } from './ospf'

export interface EigrpOutbound { deviceId: string; portId: string; pdu: PacketPdu }
export const EIGRP_HELLO_MS = 5000
export const EIGRP_HOLD_MS = 15000
export const EIGRP_MULTICAST_IP = '224.0.0.10'
export const EIGRP_MULTICAST_MAC = '01:00:5e:00:00:0a'
const MAX_ROUTES = 2048
const MAX_ENTRIES_PER_PACKET = 25

const up = (d: NetworkDevice, p: NetworkPort): boolean => {
  if (d.power === false || p.adminStatus !== 'up') return false
  if (!p.isGreTunnel) return p.status === 'up'
  const source = d.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === p.greSourceInterface || candidate.shortName === p.greSourceInterface || candidate.id === p.greSourceInterface))
  return d.type === 'router' && p.greMode === 'gre ip' && p.greKeepaliveOperational !== false && isValidIpv4(p.greDestinationIp ?? '') && !!source?.ipAddress && up(d, source)
}

export const classfulWildcard = (ip: string) => Number(ip.split('.')[0]) < 128 ? '0.255.255.255' : Number(ip.split('.')[0]) < 192 ? '0.0.255.255' : '0.0.0.255'
export const eigrpRuns = (d: NetworkDevice) => (d.type === 'router' && d.config.ipRouting !== false || d.type === 'switch' && d.config.ipRouting === true) && d.config.eigrpAs !== undefined
export const hasEigrp = (d: NetworkDevice) => eigrpRuns(d) && !!d.config.eigrpNetworks?.length
export const eigrpEnabled = (d: NetworkDevice, p: NetworkPort) => !!p.ipAddress && !!d.config.eigrpNetworks?.some(n => matchesWildcard(p.ipAddress!, n.network, n.wildcard))
export const eigrpPassive = (d: NetworkDevice, p: NetworkPort) => !!d.config.eigrpPassiveInterfaces?.includes(p.name) || !!d.config.eigrpPassiveDefault && !d.config.eigrpActiveInterfaces?.includes(p.name)
export const portBandwidthKbps = (p: NetworkPort) => p.type === 'serial' ? 1544 : p.type === 'fastethernet' ? 100000 : 1000000
export const portDelayMicroseconds = (p: NetworkPort) => p.type === 'serial' ? 20000 : p.type === 'fastethernet' ? 100 : 10
export const eigrpMetric = (bandwidthKbps: number, delayMicroseconds: number) => (Math.floor(10000000 / Math.max(1, bandwidthKbps)) + Math.floor(Math.max(0, delayMicroseconds) / 10)) * 256
const ports = (d: NetworkDevice) => d.ports.filter(p => up(d, p) && p.ipAddress && isValidIpv4(p.ipAddress) && p.subnetMask && eigrpEnabled(d, p))
const prefix = (r: { network: string; netmask: string }) => `${r.network}/${r.netmask}`

function selectRoutes(d: NetworkDevice) {
  const local = new Set(ports(d).map(p => `${getNetworkAddress(p.ipAddress!, p.subnetMask!)}/${p.subnetMask}`))
  const best = new Map<string, { candidate: EigrpCandidate; port: NetworkPort }>()
  for (const c of d.eigrp!.candidates) {
    const p = d.ports.find(candidate => candidate.id === c.portId)
    if (!p || !up(d, p) || !eigrpEnabled(d, p) || local.has(prefix(c))) continue
    const previous = best.get(prefix(c))
    if (!previous || c.metric < previous.candidate.metric || c.metric === previous.candidate.metric && ipToNumber(c.nextHop) < ipToNumber(previous.candidate.nextHop)) best.set(prefix(c), { candidate: c, port: p })
  }
  d.routingTable = [...d.routingTable.filter(r => r.type !== 'D'), ...[...best.values()].map(({ candidate, port }): RouteEntry => ({ network: candidate.network, netmask: candidate.netmask, metric: candidate.metric, nextHop: candidate.nextHop, interfaceName: port.name, type: 'D' }))]
}

function selectedCandidates(d: NetworkDevice): EigrpCandidate[] {
  const best = new Map<string, EigrpCandidate>()
  for (const selected of d.eigrp?.candidates ?? []) {
    const p = d.ports.find(candidate => candidate.id === selected.portId)
    if (!p || !up(d, p) || !eigrpEnabled(d, p)) continue
    const previous = best.get(prefix(selected))
    if (!previous || selected.metric < previous.metric || selected.metric === previous.metric && ipToNumber(selected.nextHop) < ipToNumber(previous.nextHop)) best.set(prefix(selected), selected)
  }
  return [...best.values()]
}

function advertisedEntries(d: NetworkDevice, egress: NetworkPort): EigrpEntry[] {
  const entries = new Map<string, EigrpEntry>()
  const put = (entry: EigrpEntry) => {
    const old = entries.get(prefix(entry))
    if (!old || entry.metric < old.metric) entries.set(prefix(entry), entry)
  }
  const connected = ports(d)
  for (const local of connected) {
    const bandwidthKbps = portBandwidthKbps(local), delayMicroseconds = portDelayMicroseconds(local)
    put({ network: getNetworkAddress(local.ipAddress!, local.subnetMask!), netmask: local.subnetMask!, bandwidthKbps, delayMicroseconds, hopCount: 0, metric: eigrpMetric(bandwidthKbps, delayMicroseconds) })
  }
  for (const c of selectedCandidates(d)) {
    if (c.portId === egress.id || connected.some(local => getNetworkAddress(local.ipAddress!, local.subnetMask!) === c.network && local.subnetMask === c.netmask)) continue
    put({ network: c.network, netmask: c.netmask, bandwidthKbps: c.bandwidthKbps, delayMicroseconds: c.delayMicroseconds, hopCount: c.hopCount, metric: c.metric })
  }
  return [...entries.values()].slice(0, MAX_ROUTES)
}

function packet(d: NetworkDevice, p: NetworkPort, body: EigrpPacket, dest: { ip: string; mac: string }, summary: string, decision: string): PacketPdu {
  return {
    id: `eigrp-${crypto.randomUUID()}`, protocol: 'EIGRP', sourceIp: p.ipAddress!, destIp: dest.ip, sourceMac: p.macAddress, destMac: dest.mac, etherType: '0x0800', ttl: 1,
    summary, payload: { eigrp: body },
    explanation: { layer1: `EIGRP outbound interface: ${p.name}.`, layer2: `${p.macAddress} to ${dest.mac}.`, layer3: `IPv4, IP protocol 88: ${p.ipAddress} to ${dest.ip}.`, layer4AndAbove: `EIGRP ${body.type} for autonomous system ${body.asNumber}. Composite metric = 256 x (10^7 / min bandwidth + cumulative delay / 10).`, deviceDecision: decision },
  }
}

function hello(d: NetworkDevice, p: NetworkPort): EigrpOutbound {
  return { deviceId: d.id, portId: p.id, pdu: packet(d, p, { type: 'hello', asNumber: d.config.eigrpAs!, holdTimeSeconds: Math.floor(EIGRP_HOLD_MS / 1000) }, { ip: EIGRP_MULTICAST_IP, mac: EIGRP_MULTICAST_MAC }, `EIGRP Hello (AS ${d.config.eigrpAs})`, `${d.name} advertises its presence on ${p.name} to the EIGRP multicast group.`) }
}

function updates(d: NetworkDevice, p: NetworkPort, peer?: PacketPdu): EigrpOutbound[] {
  const entries = advertisedEntries(d, p)
  const chunks: EigrpEntry[][] = []
  for (let i = 0; i < entries.length; i += MAX_ENTRIES_PER_PACKET) chunks.push(entries.slice(i, i + MAX_ENTRIES_PER_PACKET))
  if (!chunks.length) chunks.push([])
  const dest = peer ? { ip: peer.sourceIp, mac: peer.sourceMac } : { ip: EIGRP_MULTICAST_IP, mac: EIGRP_MULTICAST_MAC }
  return chunks.map(chunk => ({ deviceId: d.id, portId: p.id, pdu: packet(d, p, { type: 'update', asNumber: d.config.eigrpAs!, holdTimeSeconds: Math.floor(EIGRP_HOLD_MS / 1000), entries: chunk, complete: chunks.length === 1 }, dest, `EIGRP Update (AS ${d.config.eigrpAs}): ${chunk.length} route entries`, peer ? `${d.name} sends its current EIGRP topology to one newly discovered neighbor.` : `${d.name} sends a triggered EIGRP update for a topology change.`) }))
}

export function prepareEigrpTick(devices: NetworkDevice[]) {
  const outbound: EigrpOutbound[] = []
  if (!devices.some(d => hasEigrp(d) || d.eigrp || d.routingTable.some(r => r.type === 'D'))) return { devices, outbound }
  const updated = devices.map(original => {
    if (!hasEigrp(original)) return original.eigrp || original.routingTable.some(r => r.type === 'D') ? { ...original, eigrp: undefined, routingTable: original.routingTable.filter(r => r.type !== 'D') } : original
    const first = !original.eigrp
    const d: NetworkDevice = { ...original, eigrp: original.eigrp ? { ...original.eigrp, neighbors: original.eigrp.neighbors.map(n => ({ ...n })), candidates: original.eigrp.candidates.map(c => ({ ...c })), lastHelloAt: { ...original.eigrp.lastHelloAt } } : { clock: 0, neighbors: [], candidates: [], lastHelloAt: {}, signature: '' } }
    const rt = d.eigrp!, active = ports(d)
    rt.clock += SIMULATION_TICK_MS
    const expired = rt.neighbors.filter(n => rt.clock - n.lastHello > n.holdTimeMs || !active.some(p => p.id === n.portId))
    if (expired.length) {
      const lost = new Set(expired.map(n => `${n.address}|${n.portId}`))
      rt.neighbors = rt.neighbors.filter(n => !lost.has(`${n.address}|${n.portId}`))
      rt.candidates = rt.candidates.filter(c => !lost.has(`${c.nextHop}|${c.portId}`))
    }
    selectRoutes(d)
    const signature = JSON.stringify([active.map(p => [p.id, p.ipAddress, p.subnetMask]), d.config.eigrpAs, d.routingTable.filter(r => r.type === 'D')])
    if (signature !== rt.signature) {
      rt.signature = signature
      if (!first) for (const p of active.filter(p => !eigrpPassive(d, p))) outbound.push(...updates(d, p))
    }
    for (const p of active.filter(p => !eigrpPassive(d, p))) {
      if (rt.clock - (rt.lastHelloAt[p.id] ?? -EIGRP_HELLO_MS) >= EIGRP_HELLO_MS) {
        rt.lastHelloAt[p.id] = rt.clock
        outbound.push(hello(d, p))
      }
    }
    return d
  })
  return { devices: updated, outbound }
}

export function receiveEigrpPacket(original: NetworkDevice, p: NetworkPort, pdu: PacketPdu): { device: NetworkDevice; outbound: EigrpOutbound[]; reason?: string } {
  const outbound: EigrpOutbound[] = [], body = pdu.payload.eigrp
  const reject = (reason: string) => ({ device: original.eigrp ? { ...original, eigrp: { ...original.eigrp, lastError: reason } } : original, outbound, reason })
  if (!hasEigrp(original) || !eigrpEnabled(original, p) || !up(original, p) || !original.eigrp || !body) return reject(`EIGRP is not enabled on ${original.name} ${p.name}.`)
  if (body.type !== 'hello' && body.type !== 'update') return reject(`Malformed EIGRP packet rejected on ${p.name}.`)
  if (!isValidIpv4(pdu.sourceIp) || !isInSameSubnet(p.ipAddress!, pdu.sourceIp, p.subnetMask!) || original.ports.some(port => port.ipAddress === pdu.sourceIp)) return reject(`EIGRP rejected on ${p.name}: peer ${pdu.sourceIp} is not a distinct neighbor in ${p.ipAddress}/${p.subnetMask}.`)
  if (body.asNumber !== original.config.eigrpAs) return reject(`EIGRP AS mismatch on ${p.name}: local AS ${original.config.eigrpAs}, received AS ${body.asNumber}.`)
  if (!Number.isFinite(body.holdTimeSeconds) || body.holdTimeSeconds < 1 || body.holdTimeSeconds > 65535) return reject(`Malformed EIGRP hold time rejected on ${p.name}.`)
  const d: NetworkDevice = { ...original, eigrp: { ...original.eigrp, neighbors: original.eigrp.neighbors.map(n => ({ ...n })), candidates: original.eigrp.candidates.map(c => ({ ...c })), lastHelloAt: { ...original.eigrp.lastHelloAt } } }, rt = d.eigrp!
  rt.lastError = undefined
  const prior = rt.neighbors.find(n => n.address === pdu.sourceIp && n.portId === p.id)
  rt.neighbors = [...rt.neighbors.filter(n => !(n.address === pdu.sourceIp && n.portId === p.id)), { address: pdu.sourceIp, portId: p.id, macAddress: pdu.sourceMac, lastHello: rt.clock, holdTimeMs: body.type === 'hello' ? body.holdTimeSeconds * 1000 : prior?.holdTimeMs ?? EIGRP_HOLD_MS, since: prior?.since ?? rt.clock }].slice(-512)
  if (body.type === 'hello') {
    if (!prior) outbound.push(...updates(d, p, pdu))
    return { device: d, outbound }
  }
  if (!Array.isArray(body.entries) || body.entries.length > MAX_ENTRIES_PER_PACKET || body.entries.some(e => !isValidIpv4(e.network) || !isValidIpv4(e.netmask) || !/^1*0*$/.test(ipToNumber(e.netmask).toString(2).padStart(32, '0')) || !Number.isFinite(e.bandwidthKbps) || e.bandwidthKbps < 1 || !Number.isFinite(e.delayMicroseconds) || e.delayMicroseconds < 0 || !Number.isInteger(e.hopCount) || e.hopCount < 0 || !Number.isFinite(e.metric) || e.metric < 0)) return reject(`Malformed EIGRP update rejected on ${p.name}.`)
  const peerKey = `${pdu.sourceIp}|${p.id}`
  if (body.complete !== false) rt.candidates = rt.candidates.filter(c => `${c.nextHop}|${c.portId}` !== peerKey || body.entries!.some(e => e.network === c.network && e.netmask === c.netmask))
  for (const entry of body.entries) {
    const network = getNetworkAddress(entry.network, entry.netmask)
    if (ports(d).some(local => getNetworkAddress(local.ipAddress!, local.subnetMask!) === network && local.subnetMask === entry.netmask)) continue
    const bandwidthKbps = Math.min(entry.bandwidthKbps, portBandwidthKbps(p))
    const delayMicroseconds = entry.delayMicroseconds + portDelayMicroseconds(p)
    const existing = rt.candidates.find(c => c.network === network && c.netmask === entry.netmask && c.portId === p.id && c.nextHop === pdu.sourceIp)
    if (!existing && rt.candidates.length >= MAX_ROUTES) continue
    const next: EigrpCandidate = { network, netmask: entry.netmask, portId: p.id, nextHop: pdu.sourceIp, bandwidthKbps, delayMicroseconds, hopCount: entry.hopCount + 1, reportedMetric: entry.metric, metric: eigrpMetric(bandwidthKbps, delayMicroseconds), updatedAt: rt.clock }
    rt.candidates = [...rt.candidates.filter(c => c !== existing), next]
  }
  selectRoutes(d)
  return { device: d, outbound }
}

export function eigrpConfigLines(d: NetworkDevice) {
  if (d.config.eigrpAs === undefined) return []
  return ['router eigrp ' + d.config.eigrpAs,
    ...(d.config.eigrpRouterId ? [` eigrp router-id ${d.config.eigrpRouterId}`] : []),
    ...(d.config.eigrpAutoSummary ? [' auto-summary'] : [' no auto-summary']),
    ...(d.config.eigrpNetworks ?? []).map(n => ` network ${n.network}${n.wildcard === classfulWildcard(n.network) ? '' : ` ${n.wildcard}`}`),
    ...(d.config.eigrpPassiveDefault ? [' passive-interface default'] : []),
    ...(d.config.eigrpPassiveInterfaces ?? []).map(n => ` passive-interface ${n}`),
    ...(d.config.eigrpActiveInterfaces ?? []).map(n => ` no passive-interface ${n}`),
    '!']
}

export function eigrpRouterId(d: NetworkDevice): string | undefined {
  if (d.config.eigrpRouterId) return d.config.eigrpRouterId
  const addresses = d.ports.filter(p => p.ipAddress && isValidIpv4(p.ipAddress)).map(p => p.ipAddress!).sort((a, b) => ipToNumber(b) - ipToNumber(a))
  return addresses[0]
}
