import type { NetworkDevice, NetworkPort, PacketPdu, RipEntry, RipPacket, RouteEntry } from '../types/network'
import { getNetworkAddress, ipToNumber, isInSameSubnet, isValidIpv4 } from './protocols/ip'
import { SIMULATION_TICK_MS } from './ospf'

export interface RipOutbound { deviceId: string; portId: string; pdu: PacketPdu }
export const RIP_UPDATE_MS = 30000
export const RIP_INVALID_MS = 180000
export const RIP_FLUSH_MS = 240000
const MAX_ROUTES = 2000
const up = (d: NetworkDevice, p: NetworkPort): boolean => {
  if (d.power === false || p.adminStatus !== 'up') return false
  if (!p.isGreTunnel) return p.status === 'up'
  const source = d.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === p.greSourceInterface || candidate.shortName === p.greSourceInterface || candidate.id === p.greSourceInterface))
  return d.type === 'router' && p.greMode === 'gre ip' && p.greKeepaliveOperational !== false && isValidIpv4(p.greDestinationIp ?? '') && !!source?.ipAddress && up(d, source)
}
export const classfulMask = (ip: string) => Number(ip.split('.')[0]) < 128 ? '255.0.0.0' : Number(ip.split('.')[0]) < 192 ? '255.255.0.0' : '255.255.255.0'
export const ripMajorNetwork = (ip: string) => getNetworkAddress(ip, classfulMask(ip))
export const hasRip = (d: NetworkDevice) => (d.type === 'router' && d.config.ipRouting !== false || d.type === 'switch' && d.config.ipRouting === true) && !!d.config.ripNetworks?.length
export const ripEnabled = (d: NetworkDevice, p: NetworkPort) => !!p.ipAddress && !!d.config.ripNetworks?.some(n => ripMajorNetwork(n) === ripMajorNetwork(p.ipAddress!))
export const ripPassive = (d: NetworkDevice, p: NetworkPort) => !!d.config.ripPassiveInterfaces?.includes(p.name) || !!d.config.ripPassiveDefault && !d.config.ripActiveInterfaces?.includes(p.name)
const ports = (d: NetworkDevice) => d.ports.filter(p => up(d, p) && p.ipAddress && isValidIpv4(p.ipAddress) && p.subnetMask && ripEnabled(d, p))
const prefix = (r: RipEntry) => `${r.network}/${r.netmask}`

function selectRoutes(d: NetworkDevice) {
  const local = new Set(ports(d).map(p => `${getNetworkAddress(p.ipAddress!, p.subnetMask!)}/${p.subnetMask}`))
  const best = new Map<string, RouteEntry>()
  for (const c of d.rip!.candidates) {
    if (c.metric >= 16 || c.invalidAt !== undefined || local.has(prefix(c))) continue
    const p = d.ports.find(p => p.id === c.portId)
    if (!p || !up(d, p) || !ripEnabled(d, p)) continue
    const previous = best.get(prefix(c))
    if (!previous || c.metric < previous.metric || c.metric === previous.metric && ipToNumber(c.nextHop) < ipToNumber(previous.nextHop)) best.set(prefix(c), { network: c.network, netmask: c.netmask, metric: c.metric, nextHop: c.nextHop, interfaceName: p.name, type: 'R' })
  }
  d.routingTable = [...d.routingTable.filter(r => r.type !== 'R'), ...best.values()]
}

function advertised(d: NetworkDevice, p: NetworkPort, version: 1 | 2): RipEntry[] {
  const entries = new Map<string, RipEntry>()
  const put = (r: RipEntry) => {
    let entry = r
    if (version === 1 || d.config.ripAutoSummary !== false && ripMajorNetwork(r.network) !== ripMajorNetwork(p.ipAddress!)) {
      const netmask = version === 1 && ripMajorNetwork(r.network) === ripMajorNetwork(p.ipAddress!) ? p.subnetMask! : classfulMask(r.network)
      entry = { ...r, network: getNetworkAddress(r.network, netmask), netmask }
    }
    const old = entries.get(prefix(entry))
    if (!old || entry.metric < old.metric) entries.set(prefix(entry), entry)
  }
  for (const local of ports(d)) put({ network: getNetworkAddress(local.ipAddress!, local.subnetMask!), netmask: local.subnetMask!, metric: 1 })
  for (const route of d.routingTable.filter(r => r.type === 'R')) put({ network: route.network, netmask: route.netmask, metric: route.interfaceName === p.name ? 16 : Math.min(16, route.metric + 1) })
  for (const c of d.rip!.candidates.filter(c => c.invalidAt !== undefined)) {
    if (!d.routingTable.some(r => r.type === 'R' && prefix(r) === prefix(c))) put({ network: c.network, netmask: c.netmask, metric: 16 })
  }
  return [...entries.values()].slice(0, MAX_ROUTES)
}

function packet(d: NetworkDevice, p: NetworkPort, command: RipPacket['command'], entries: RipEntry[], version: 1 | 2, peer?: PacketPdu): RipOutbound {
  const destIp = peer?.sourceIp ?? (version === 2 ? '224.0.0.9' : '255.255.255.255')
  const destMac = peer?.sourceMac ?? (version === 2 ? '01:00:5e:00:00:09' : 'ff:ff:ff:ff:ff:ff')
  return { deviceId: d.id, portId: p.id, pdu: {
    id: `rip-${crypto.randomUUID()}`, protocol: 'RIP', sourceIp: p.ipAddress!, destIp, sourceMac: p.macAddress, destMac, etherType: '0x0800', ttl: 1,
    summary: `RIPv${version} ${command}: ${entries.length} route entries`, payload: { rip: { command, version, entries } },
    explanation: { layer1: `RIP outbound interface: ${p.name}.`, layer2: `${p.macAddress} to ${destMac}.`, layer3: `IPv4, TTL 1: ${p.ipAddress} to ${destIp}.`, layer4AndAbove: `UDP port 520, RIPv${version} ${command}. Metric 16 marks an unreachable route.`, deviceDecision: `${d.name} advertises its own connected networks and routes learned from received RIP updates.` },
  } }
}
function responses(d: NetworkDevice, p: NetworkPort, version: 1 | 2, peer?: PacketPdu) {
  const entries = advertised(d, p, version), out: RipOutbound[] = []
  for (let i = 0; i < entries.length; i += 25) out.push(packet(d, p, 'response', entries.slice(i, i + 25), version, peer))
  return out
}

export function prepareRipTick(devices: NetworkDevice[]) {
  const outbound: RipOutbound[] = []
  if (!devices.some(d => hasRip(d) || d.rip || d.routingTable.some(r => r.type === 'R'))) return { devices, outbound }
  const updated = devices.map(original => {
    if (!hasRip(original)) return original.rip || original.routingTable.some(r => r.type === 'R') ? { ...original, rip: undefined, routingTable: original.routingTable.filter(r => r.type !== 'R') } : original
    const first = !original.rip
    const d: NetworkDevice = { ...original, rip: original.rip ? { ...original.rip, candidates: original.rip.candidates.map(c => ({ ...c })), neighbors: [...original.rip.neighbors] } : { clock: 0, lastUpdate: -RIP_UPDATE_MS, signature: '', candidates: [], neighbors: [] } }
    const rt = d.rip!, active = ports(d)
    rt.clock += SIMULATION_TICK_MS
    const connected = active.map(p => ({ network: getNetworkAddress(p.ipAddress!, p.subnetMask!), netmask: p.subnetMask!, metric: 1 }))
    for (const old of rt.connected ?? []) {
      if (connected.some(n => prefix(n) === prefix(old))) continue
      rt.candidates = [...rt.candidates.filter(c => !(c.nextHop === 'connected' && prefix(c) === prefix(old))), { ...old, metric: 16, portId: '', nextHop: 'connected', updatedAt: rt.clock, invalidAt: rt.clock }].slice(-MAX_ROUTES)
      rt.triggerAt ??= rt.clock + 1000
    }
    rt.candidates = rt.candidates.filter(c => c.nextHop !== 'connected' || !connected.some(n => prefix(n) === prefix(c)))
    rt.connected = connected
    for (const c of rt.candidates) {
      if (c.invalidAt !== undefined) continue
      const p = active.find(p => p.id === c.portId)
      if (!p || rt.clock - c.updatedAt >= RIP_INVALID_MS) { c.metric = 16; c.invalidAt = rt.clock; rt.triggerAt ??= rt.clock + 1000 }
    }
    rt.candidates = rt.candidates.filter(c => c.invalidAt === undefined || rt.clock - c.invalidAt < RIP_FLUSH_MS - RIP_INVALID_MS)
    rt.neighbors = rt.neighbors.filter(n => rt.clock - n.lastUpdate < RIP_INVALID_MS && active.some(p => p.id === n.portId))
    selectRoutes(d)
    const signature = JSON.stringify([active.map(p => [p.id, p.ipAddress, p.subnetMask]), d.config.ripVersion, d.config.ripAutoSummary, d.config.ripPassiveDefault, d.config.ripPassiveInterfaces, d.config.ripActiveInterfaces, d.routingTable.filter(r => r.type === 'R')])
    if (signature !== rt.signature) { rt.signature = signature; rt.triggerAt ??= rt.clock + 1000 }
    const periodic = rt.clock - rt.lastUpdate >= RIP_UPDATE_MS
    if (periodic || rt.triggerAt !== undefined && rt.clock >= rt.triggerAt) {
      for (const p of active.filter(p => !ripPassive(d, p))) {
        const version = d.config.ripVersion ?? 1
        if (first) outbound.push(packet(d, p, 'request', [], version))
        outbound.push(...responses(d, p, version))
      }
      if (periodic) rt.lastUpdate = rt.clock
      rt.triggerAt = undefined
    }
    return d
  })
  return { devices: updated, outbound }
}

export function receiveRipPacket(original: NetworkDevice, p: NetworkPort, pdu: PacketPdu): { device: NetworkDevice; outbound: RipOutbound[]; reason?: string } {
  const outbound: RipOutbound[] = [], body = pdu.payload.rip
  const reject = (reason: string) => ({ device: original.rip ? { ...original, rip: { ...original.rip, lastError: reason } } : original, outbound, reason })
  if (!hasRip(original) || !ripEnabled(original, p) || !up(original, p) || !original.rip || !body) return reject(`RIP is not enabled on ${original.name} ${p.name}.`)
  if (!isValidIpv4(pdu.sourceIp) || !isInSameSubnet(p.ipAddress!, pdu.sourceIp, p.subnetMask!) || original.ports.some(port => port.ipAddress === pdu.sourceIp)) return reject(`RIP rejected on ${p.name}: peer ${pdu.sourceIp} is not a distinct neighbor in ${p.ipAddress}/${p.subnetMask}.`)
  if (![1, 2].includes(body.version) || original.config.ripVersion !== undefined && body.version !== original.config.ripVersion) return reject(`RIP version mismatch on ${p.name}: local version ${original.config.ripVersion}, received version ${body.version}.`)
  if (!['request', 'response'].includes(body.command) || body.entries.length > 25 || body.entries.some(e => !isValidIpv4(e.network) || !isValidIpv4(e.netmask) || !Number.isInteger(e.metric) || e.metric < 1 || e.metric > 16 || !/^1*0*$/.test(ipToNumber(e.netmask).toString(2).padStart(32, '0')))) return reject(`Malformed RIP update rejected on ${p.name}.`)
  const d: NetworkDevice = { ...original, rip: { ...original.rip, candidates: original.rip.candidates.map(c => ({ ...c })), neighbors: [...original.rip.neighbors] } }, rt = d.rip!
  rt.lastError = undefined
  if (body.command === 'request') {
    if (!ripPassive(d, p)) outbound.push(...responses(d, p, body.version, pdu))
    return { device: d, outbound }
  }
  rt.neighbors = [...rt.neighbors.filter(n => !(n.address === pdu.sourceIp && n.portId === p.id)), { address: pdu.sourceIp, portId: p.id, lastUpdate: rt.clock, version: body.version }].slice(-512)
  for (const entry of body.entries) {
    const netmask = body.version === 1 ? (ripMajorNetwork(entry.network) === ripMajorNetwork(p.ipAddress!) ? p.subnetMask! : classfulMask(entry.network)) : entry.netmask
    const network = getNetworkAddress(entry.network, netmask)
    if (ports(d).some(local => getNetworkAddress(local.ipAddress!, local.subnetMask!) === network && local.subnetMask === netmask)) continue
    const existing = rt.candidates.find(c => c.network === network && c.netmask === netmask && c.portId === p.id && c.nextHop === pdu.sourceIp)
    if (entry.metric === 16 && !existing) continue
    if (!existing && rt.candidates.length >= MAX_ROUTES) continue
    const next = { network, netmask, metric: entry.metric, portId: p.id, nextHop: pdu.sourceIp, updatedAt: rt.clock, invalidAt: entry.metric === 16 ? existing?.invalidAt ?? rt.clock : undefined }
    if (!existing || existing.metric !== next.metric || existing.invalidAt !== next.invalidAt) rt.triggerAt ??= rt.clock + 1000
    rt.candidates = [...rt.candidates.filter(c => c !== existing), next]
  }
  selectRoutes(d)
  return { device: d, outbound }
}

export function ripConfigLines(d: NetworkDevice) {
  if (!d.config.ripNetworks?.length) return []
  return ['router rip', ...(d.config.ripVersion ? [` version ${d.config.ripVersion}`] : []), ...(d.config.ripAutoSummary === false ? [' no auto-summary'] : []), ...d.config.ripNetworks.map(n => ` network ${n}`), ...(d.config.ripPassiveDefault ? [' passive-interface default'] : []), ...(d.config.ripPassiveInterfaces ?? []).map(n => ` passive-interface ${n}`), ...(d.config.ripActiveInterfaces ?? []).map(n => ` no passive-interface ${n}`), '!']
}

export function stripRipRuntime(devices: NetworkDevice[]) {
  return devices.map(d => d.rip || d.routingTable.some(r => r.type === 'R') ? { ...d, rip: undefined, routingTable: d.routingTable.filter(r => r.type !== 'R') } : d)
}
