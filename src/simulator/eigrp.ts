import type { EigrpCandidate, EigrpEntry, EigrpPacket, EigrpTopologyEntry, NetworkDevice, NetworkPort, PacketPdu, RouteEntry } from '../types/network'
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

// DUAL: a prefix whose successor is lost with no feasible alternative goes
// Active and queries the remaining neighbors; replies resolve it and the
// stuck-in-active timer resets neighbors that never answer.
export const EIGRP_INFINITY = 4294967295
export const EIGRP_SIA_MS = 180000
const prefixKey = (network: string, netmask: string) => `${network}/${netmask}`
const neighborKey = (address: string, portId: string) => `${address}|${portId}`

function activePrefixes(d: NetworkDevice): Set<string> {
  return new Set((d.eigrp?.topology ?? []).map(entry => prefixKey(entry.network, entry.netmask)))
}

function bestUsable(d: NetworkDevice, network: string, netmask: string): EigrpCandidate | undefined {
  let best: EigrpCandidate | undefined
  for (const candidate of d.eigrp?.candidates ?? []) {
    if (candidate.network !== network || candidate.netmask !== netmask) continue
    const port = d.ports.find(candidatePort => candidatePort.id === candidate.portId)
    if (!port || !up(d, port) || !eigrpEnabled(d, port)) continue
    if (!best || candidate.metric < best.metric || candidate.metric === best.metric && ipToNumber(candidate.nextHop) < ipToNumber(best.nextHop)) best = candidate
  }
  return best
}

function entryFor(best: EigrpCandidate | undefined, network: string, netmask: string): EigrpEntry {
  return { network, netmask, bandwidthKbps: best?.bandwidthKbps ?? 1, delayMicroseconds: best?.delayMicroseconds ?? 0, hopCount: best?.hopCount ?? 0, metric: best?.metric ?? EIGRP_INFINITY }
}

function queryPacket(d: NetworkDevice, port: NetworkPort, entry: EigrpTopologyEntry): EigrpOutbound {
  return { deviceId: d.id, portId: port.id, pdu: packet(d, port, { type: 'query', asNumber: d.config.eigrpAs!, holdTimeSeconds: Math.floor(EIGRP_HOLD_MS / 1000), entries: [entryFor(undefined, entry.network, entry.netmask)] }, { ip: EIGRP_MULTICAST_IP, mac: EIGRP_MULTICAST_MAC }, `EIGRP Query (AS ${d.config.eigrpAs}): ${entry.network}/${entry.netmask}`, `${d.name} lost its successor for ${entry.network}/${entry.netmask} and searches for an alternative path.`) }
}

function replyPacket(d: NetworkDevice, port: NetworkPort, to: { address: string; macAddress: string }, entries: EigrpEntry[], summary: string): EigrpOutbound {
  return { deviceId: d.id, portId: port.id, pdu: packet(d, port, { type: 'reply', asNumber: d.config.eigrpAs!, holdTimeSeconds: Math.floor(EIGRP_HOLD_MS / 1000), entries }, { ip: to.address, mac: to.macAddress }, summary, `${d.name} answers the DUAL query with its current distance.`) }
}

function enterActive(d: NetworkDevice, network: string, netmask: string, origin?: { address: string; portId: string }): EigrpOutbound[] {
  const runtime = d.eigrp!, outbound: EigrpOutbound[] = []
  const existing = (runtime.topology ?? []).find(entry => entry.network === network && entry.netmask === netmask)
  if (existing) {
    if (origin && !existing.origins.some(candidate => candidate.address === origin.address && candidate.portId === origin.portId)) existing.origins.push(origin)
    return outbound
  }
  const pending = [...new Set(runtime.neighbors.filter(neighbor => !origin || neighborKey(neighbor.address, neighbor.portId) !== neighborKey(origin.address, origin.portId)).map(neighbor => neighborKey(neighbor.address, neighbor.portId)))]
  const entry: EigrpTopologyEntry = { network, netmask, state: 'Active', since: runtime.clock, pending, origins: origin ? [origin] : [] }
  runtime.topology = [...(runtime.topology ?? []), entry]
  runtime.siaNotice = undefined
  if (pending.length) {
    for (const port of ports(d).filter(candidate => !eigrpPassive(d, candidate))) outbound.push(queryPacket(d, port, entry))
  } else outbound.push(...resolveActive(d, entry))
  return outbound
}

function resolveActive(d: NetworkDevice, entry: EigrpTopologyEntry): EigrpOutbound[] {
  const runtime = d.eigrp!, outbound: EigrpOutbound[] = []
  runtime.topology = (runtime.topology ?? []).filter(candidate => candidate !== entry)
  entry.pending = []
  const best = bestUsable(d, entry.network, entry.netmask)
  for (const origin of entry.origins) {
    const port = d.ports.find(candidate => candidate.id === origin.portId)
    const neighbor = runtime.neighbors.find(candidate => candidate.address === origin.address && candidate.portId === origin.portId)
    if (!port || !neighbor) continue
    outbound.push(replyPacket(d, port, { address: neighbor.address, macAddress: neighbor.macAddress }, [entryFor(best, entry.network, entry.netmask)], `EIGRP Reply (AS ${d.config.eigrpAs}): ${entry.network}/${entry.netmask}`))
  }
  return outbound
}

function selectRoutes(d: NetworkDevice) {
  const local = new Set(ports(d).map(p => `${getNetworkAddress(p.ipAddress!, p.subnetMask!)}/${p.subnetMask}`))
  const active = activePrefixes(d)
  const best = new Map<string, { candidate: EigrpCandidate; port: NetworkPort }>()
  for (const c of d.eigrp!.candidates) {
    const p = d.ports.find(candidate => candidate.id === c.portId)
    if (!p || !up(d, p) || !eigrpEnabled(d, p) || local.has(prefix(c)) || active.has(prefix(c))) continue
    const previous = best.get(prefix(c))
    if (!previous || c.metric < previous.candidate.metric || c.metric === previous.candidate.metric && ipToNumber(c.nextHop) < ipToNumber(previous.candidate.nextHop)) best.set(prefix(c), { candidate: c, port: p })
  }
  d.routingTable = [...d.routingTable.filter(r => r.type !== 'D'), ...[...best.values()].map(({ candidate, port }): RouteEntry => ({ network: candidate.network, netmask: candidate.netmask, metric: candidate.metric, nextHop: candidate.nextHop, interfaceName: port.name, type: 'D' }))]
}

function selectedCandidates(d: NetworkDevice): EigrpCandidate[] {
  const best = new Map<string, EigrpCandidate>(), active = activePrefixes(d)
  for (const selected of d.eigrp?.candidates ?? []) {
    if (active.has(prefix(selected))) continue
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
    const d: NetworkDevice = { ...original, eigrp: original.eigrp ? { ...original.eigrp, neighbors: original.eigrp.neighbors.map(n => ({ ...n })), candidates: original.eigrp.candidates.map(c => ({ ...c })), lastHelloAt: { ...original.eigrp.lastHelloAt }, topology: (original.eigrp.topology ?? []).map(t => ({ ...t, pending: [...t.pending], origins: t.origins.map(o => ({ ...o })) })) } : { clock: 0, neighbors: [], candidates: [], lastHelloAt: {}, signature: '', topology: [] } }
    const rt = d.eigrp!, active = ports(d)
    rt.clock += SIMULATION_TICK_MS
    const successors = new Map<string, EigrpCandidate>()
    for (const c of rt.candidates) {
      const candidatePort = d.ports.find(candidate => candidate.id === c.portId)
      if (!candidatePort || !up(d, candidatePort) || !eigrpEnabled(d, candidatePort)) continue
      const previous = successors.get(prefix(c))
      if (!previous || c.metric < previous.metric || c.metric === previous.metric && ipToNumber(c.nextHop) < ipToNumber(previous.nextHop)) successors.set(prefix(c), c)
    }
    const expired = rt.neighbors.filter(n => rt.clock - n.lastHello > n.holdTimeMs || !active.some(p => p.id === n.portId))
    if (expired.length) {
      const lost = new Set(expired.map(n => neighborKey(n.address, n.portId)))
      rt.neighbors = rt.neighbors.filter(n => !lost.has(neighborKey(n.address, n.portId)))
      rt.candidates = rt.candidates.filter(c => !lost.has(neighborKey(c.nextHop, c.portId)))
      for (const successor of successors.values()) {
        if (!lost.has(neighborKey(successor.nextHop, successor.portId))) continue
        if ((rt.topology ?? []).some(entry => prefixKey(entry.network, entry.netmask) === prefix(successor))) continue
        const remaining = bestUsable(d, successor.network, successor.netmask)
        if (remaining && remaining.reportedMetric < successor.metric) continue
        outbound.push(...enterActive(d, successor.network, successor.netmask))
      }
    }
    for (const stale of [...(rt.topology ?? [])]) {
      if (rt.clock - stale.since <= EIGRP_SIA_MS) continue
      for (const key of stale.pending) {
        const [address, portId] = key.split('|')
        rt.neighbors = rt.neighbors.filter(n => !(n.address === address && n.portId === portId))
        rt.candidates = rt.candidates.filter(c => !(c.nextHop === address && c.portId === portId))
      }
      rt.siaNotice = `${stale.network}/${stale.netmask}: ${stale.pending.join(', ') || 'no reply'} did not answer within ${Math.round(EIGRP_SIA_MS / 1000)} seconds; stuck-in-active neighbor reset.`
      stale.pending = []
      outbound.push(...resolveActive(d, stale))
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

function learnCandidate(d: NetworkDevice, p: NetworkPort, nextHop: string, entry: EigrpEntry) {
  const rt = d.eigrp!, network = getNetworkAddress(entry.network, entry.netmask)
  if (ports(d).some(local => getNetworkAddress(local.ipAddress!, local.subnetMask!) === network && local.subnetMask === entry.netmask)) return
  const bandwidthKbps = Math.min(entry.bandwidthKbps, portBandwidthKbps(p))
  const delayMicroseconds = entry.delayMicroseconds + portDelayMicroseconds(p)
  const existing = rt.candidates.find(c => c.network === network && c.netmask === entry.netmask && c.portId === p.id && c.nextHop === nextHop)
  if (!existing && rt.candidates.length >= MAX_ROUTES) return
  const next: EigrpCandidate = { network, netmask: entry.netmask, portId: p.id, nextHop, bandwidthKbps, delayMicroseconds, hopCount: entry.hopCount + 1, reportedMetric: entry.metric, metric: eigrpMetric(bandwidthKbps, delayMicroseconds), updatedAt: rt.clock }
  rt.candidates = [...rt.candidates.filter(c => c !== existing), next]
}

export function receiveEigrpPacket(original: NetworkDevice, p: NetworkPort, pdu: PacketPdu): { device: NetworkDevice; outbound: EigrpOutbound[]; reason?: string } {
  const outbound: EigrpOutbound[] = [], body = pdu.payload.eigrp
  const reject = (reason: string) => ({ device: original.eigrp ? { ...original, eigrp: { ...original.eigrp, lastError: reason } } : original, outbound, reason })
  if (!hasEigrp(original) || !eigrpEnabled(original, p) || !up(original, p) || !original.eigrp || !body) return reject(`EIGRP is not enabled on ${original.name} ${p.name}.`)
  if (!['hello', 'update', 'query', 'reply'].includes(body.type)) return reject(`Malformed EIGRP packet rejected on ${p.name}.`)
  if (!isValidIpv4(pdu.sourceIp) || !isInSameSubnet(p.ipAddress!, pdu.sourceIp, p.subnetMask!) || original.ports.some(port => port.ipAddress === pdu.sourceIp)) return reject(`EIGRP rejected on ${p.name}: peer ${pdu.sourceIp} is not a distinct neighbor in ${p.ipAddress}/${p.subnetMask}.`)
  if (body.asNumber !== original.config.eigrpAs) return reject(`EIGRP AS mismatch on ${p.name}: local AS ${original.config.eigrpAs}, received AS ${body.asNumber}.`)
  if (!Number.isFinite(body.holdTimeSeconds) || body.holdTimeSeconds < 1 || body.holdTimeSeconds > 65535) return reject(`Malformed EIGRP hold time rejected on ${p.name}.`)
  const d: NetworkDevice = { ...original, eigrp: { ...original.eigrp, neighbors: original.eigrp.neighbors.map(n => ({ ...n })), candidates: original.eigrp.candidates.map(c => ({ ...c })), lastHelloAt: { ...original.eigrp.lastHelloAt }, topology: (original.eigrp.topology ?? []).map(t => ({ ...t, pending: [...t.pending], origins: t.origins.map(o => ({ ...o })) })) } }, rt = d.eigrp!
  rt.lastError = undefined
  const prior = rt.neighbors.find(n => n.address === pdu.sourceIp && n.portId === p.id)
  rt.neighbors = [...rt.neighbors.filter(n => !(n.address === pdu.sourceIp && n.portId === p.id)), { address: pdu.sourceIp, portId: p.id, macAddress: pdu.sourceMac, lastHello: rt.clock, holdTimeMs: body.type === 'hello' ? body.holdTimeSeconds * 1000 : prior?.holdTimeMs ?? EIGRP_HOLD_MS, since: prior?.since ?? rt.clock }].slice(-512)
  if (body.type === 'hello') {
    if (!prior) outbound.push(...updates(d, p, pdu))
    return { device: d, outbound }
  }
  if (!Array.isArray(body.entries) || body.entries.length > MAX_ENTRIES_PER_PACKET || body.entries.some(e => !isValidIpv4(e.network) || !isValidIpv4(e.netmask) || !/^1*0*$/.test(ipToNumber(e.netmask).toString(2).padStart(32, '0')) || !Number.isFinite(e.metric) || e.metric < 0)) return reject(`Malformed EIGRP ${body.type} rejected on ${p.name}.`)
  const peerKey = neighborKey(pdu.sourceIp, p.id)
  if (body.type === 'update') {
    if (body.entries.some(e => !Number.isFinite(e.bandwidthKbps) || e.bandwidthKbps < 1 || !Number.isFinite(e.delayMicroseconds) || e.delayMicroseconds < 0 || !Number.isInteger(e.hopCount) || e.hopCount < 0)) return reject(`Malformed EIGRP update rejected on ${p.name}.`)
    if (body.complete !== false) rt.candidates = rt.candidates.filter(c => `${c.nextHop}|${c.portId}` !== peerKey || body.entries!.some(e => e.network === c.network && e.netmask === c.netmask))
    for (const entry of body.entries) learnCandidate(d, p, pdu.sourceIp, entry)
    selectRoutes(d)
    return { device: d, outbound }
  }
  if (body.type === 'query') {
    for (const entry of body.entries) {
      const network = getNetworkAddress(entry.network, entry.netmask)
      rt.candidates = rt.candidates.filter(c => !(c.network === network && c.netmask === entry.netmask && c.nextHop === pdu.sourceIp && c.portId === p.id))
      const best = bestUsable(d, network, entry.netmask)
      const others = rt.neighbors.filter(n => neighborKey(n.address, n.portId) !== peerKey)
      if (best) outbound.push(replyPacket(d, p, { address: pdu.sourceIp, macAddress: pdu.sourceMac }, [entryFor(best, network, entry.netmask)], `EIGRP Reply (AS ${body.asNumber}): ${network}/${entry.netmask}`))
      else if (others.length) outbound.push(...enterActive(d, network, entry.netmask, { address: pdu.sourceIp, portId: p.id }))
      else outbound.push(replyPacket(d, p, { address: pdu.sourceIp, macAddress: pdu.sourceMac }, [entryFor(undefined, network, entry.netmask)], `EIGRP Reply (AS ${body.asNumber}): ${network}/${entry.netmask}`))
    }
    selectRoutes(d)
    return { device: d, outbound }
  }
  for (const entry of body.entries) {
    const network = getNetworkAddress(entry.network, entry.netmask)
    if (entry.metric !== EIGRP_INFINITY && Number.isFinite(entry.bandwidthKbps) && entry.bandwidthKbps >= 1 && Number.isFinite(entry.delayMicroseconds) && entry.delayMicroseconds >= 0 && Number.isInteger(entry.hopCount) && entry.hopCount >= 0) learnCandidate(d, p, pdu.sourceIp, { ...entry, network })
    const activeEntry = (rt.topology ?? []).find(t => prefixKey(t.network, t.netmask) === prefixKey(network, entry.netmask) && t.pending.includes(peerKey))
    if (!activeEntry) continue
    activeEntry.pending = activeEntry.pending.filter(key => key !== peerKey)
    if (!activeEntry.pending.length) outbound.push(...resolveActive(d, activeEntry))
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
