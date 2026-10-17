import type { NetworkDevice, NetworkPort, PacketPdu, OspfNeighbor, OspfLsa, OspfLsaHeader, OspfPacket, RouteEntry } from '../types/network'
import { getNetworkAddress, ipToNumber, isInSameSubnet, isValidIpv4 } from './protocols/ip'
import { matchesWildcard } from './acl'

export interface OspfOutbound { deviceId: string; portId: string; pdu: PacketPdu }
const MAX_DATABASE = 2000
const RETRANSMIT_MS = 5000
const MAX_AGE_MS = 3600000
export const SIMULATION_TICK_MS = 60
const key = (lsa: OspfLsaHeader) => `${lsa.area}|${lsa.routerId}`
const sameHeader = (a: OspfLsaHeader, b: OspfLsaHeader) => key(a) === key(b) && a.sequence === b.sequence
const up = (d: NetworkDevice, p: NetworkPort): boolean => {
  if (d.power === false || p.adminStatus !== 'up') return false
  if (!p.isGreTunnel) return p.status === 'up'
  const source = d.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === p.greSourceInterface || candidate.shortName === p.greSourceInterface || candidate.id === p.greSourceInterface))
  return d.type === 'router' && p.greMode === 'gre ip' && p.greKeepaliveOperational !== false && isValidIpv4(p.greDestinationIp ?? '') && !!source?.ipAddress && up(d, source)
}
export const ospfCost = (p: NetworkPort) => p.ospfCost ?? (p.type === 'serial' ? 64 : 1)
export const ospfHello = (p: NetworkPort) => p.ospfHelloInterval ?? 10
export const ospfDead = (p: NetworkPort) => p.ospfDeadInterval ?? 40
export const ospfNetwork = (p: NetworkPort) => p.ospfNetworkType ?? (p.isGreTunnel || p.type === 'serial' ? 'point-to-point' : 'broadcast')
export const ospfPassive = (d: NetworkDevice, p: NetworkPort) => (d.config.ospfPassiveInterfaces ?? []).includes(p.name) || !!d.config.ospfPassiveDefault && !(d.config.ospfActiveInterfaces ?? []).includes(p.name)
export const ospfArea = (d: NetworkDevice, p: NetworkPort) => d.config.ospfNetworks?.find(n => p.ipAddress && matchesWildcard(p.ipAddress, n.network, n.wildcard))?.area
export const hasOspf = (d: NetworkDevice) => (d.type === 'router' && d.config.ipRouting !== false || d.type === 'switch' && d.config.ipRouting === true) && !!d.config.ospfNetworks?.length

function ports(d: NetworkDevice) {
  return d.ports.filter(p => up(d, p) && p.ipAddress && isValidIpv4(p.ipAddress) && p.subnetMask && isValidIpv4(p.subnetMask) && ospfArea(d, p) !== undefined)
}
function routerId(d: NetworkDevice) {
  return d.config.ospfRouterId || d.ospf?.routerId || d.ports.filter(p => p.ipAddress && isValidIpv4(p.ipAddress) && p.ipAddress !== '0.0.0.0').sort((a, b) => ipToNumber(b.ipAddress!) - ipToNumber(a.ipAddress!))[0]?.ipAddress
}
function copy(d: NetworkDevice): NetworkDevice {
  return { ...d, ospf: d.ospf && { ...d.ospf, neighbors: d.ospf.neighbors.map(n => ({ ...n, requests: [...n.requests], retransmissions: [...n.retransmissions] })), interfaces: d.ospf.interfaces.map(i => ({ ...i })), database: [...d.ospf.database] } }
}
function packet(d: NetworkDevice, p: NetworkPort, type: OspfPacket['type'], extra: Partial<OspfPacket> = {}, neighbor?: OspfNeighbor): OspfOutbound {
  const runtime = d.ospf!
  const iface = runtime.interfaces.find(i => i.portId === p.id)!
  const ospf: OspfPacket = { type, routerId: runtime.routerId, area: iface.area, netmask: p.subnetMask!, helloInterval: ospfHello(p), deadInterval: ospfDead(p), networkType: ospfNetwork(p), ...extra }
  const destIp = neighbor?.address ?? '224.0.0.5'
  const destMac = neighbor?.macAddress ?? '01:00:5e:00:00:05'
  return { deviceId: d.id, portId: p.id, pdu: {
    id: `ospf-${crypto.randomUUID()}`, protocol: 'OSPF', summary: `OSPF ${type}: router ${runtime.routerId}, area ${iface.area}`,
    sourceIp: p.ipAddress!, destIp, sourceMac: p.macAddress, destMac, etherType: '0x0800', ttl: 1, payload: { ospf },
    explanation: { layer1: `OSPF outbound interface: ${p.name}.`, layer2: `${p.macAddress} to ${destMac}.`, layer3: `IPv4 protocol 89, TTL 1: ${p.ipAddress} to ${destIp}.`, layer4AndAbove: `OSPFv2 ${type}, area ${iface.area}, router ID ${runtime.routerId}.`, deviceDecision: `${d.name} sends ${type} on its enabled OSPF interface.` },
  } }
}
function hello(d: NetworkDevice, p: NetworkPort) {
  const rt = d.ospf!, iface = rt.interfaces.find(i => i.portId === p.id)!
  iface.lastHello = rt.clock
  return packet(d, p, 'hello', { neighbors: rt.neighbors.filter(n => n.portId === p.id).map(n => n.routerId), priority: p.ospfPriority ?? 1, designatedRouter: iface.designatedRouter, backupRouter: iface.backupRouter })
}
function headers(d: NetworkDevice, area: number) { return d.ospf!.database.filter(entry => entry.lsa.area === area).map(entry => ({ routerId: entry.lsa.routerId, area, sequence: entry.lsa.sequence })) }
function databaseDescription(d: NetworkDevice, p: NetworkPort, n: OspfNeighbor) {
  n.lastExchange = d.ospf!.clock
  return packet(d, p, 'database-description', { headers: headers(d, n.area) }, n)
}
function sendUpdate(d: NetworkDevice, p: NetworkPort, n: OspfNeighbor, lsas: OspfLsa[]) {
  const unique = [...new Map(lsas.map(lsa => [key(lsa), lsa])).values()]
  for (const lsa of unique) n.retransmissions = [...n.retransmissions.filter(r => key(r.lsa) !== key(lsa)), { lsa, sentAt: d.ospf!.clock }].slice(-MAX_DATABASE)
  return packet(d, p, 'link-state-update', { lsas: unique }, n)
}
function flood(d: NetworkDevice, lsas: OspfLsa[], except?: OspfNeighbor) {
  const out: OspfOutbound[] = []
  for (const n of d.ospf!.neighbors) {
    if (n === except || n.state !== 'Full') continue
    const p = d.ports.find(p => p.id === n.portId)!
    const areaLsas = lsas.filter(lsa => lsa.area === n.area)
    if (areaLsas.length) out.push(sendUpdate(d, p, n, areaLsas))
  }
  return out
}
function originate(d: NetworkDevice, force = false) {
  const rt = d.ospf!, out: OspfOutbound[] = [], active = ports(d)
  for (const area of new Set(active.map(p => ospfArea(d, p)!))) {
    const links = rt.neighbors.filter(n => n.area === area && ['Full', '2-Way'].includes(n.state)).map(n => ({ routerId: n.routerId, cost: ospfCost(active.find(p => p.id === n.portId)!) })).sort((a, b) => a.routerId.localeCompare(b.routerId) || a.cost - b.cost)
    const networks = active.filter(p => ospfArea(d, p) === area).map(p => ({ network: getNetworkAddress(p.ipAddress!, p.subnetMask!), netmask: p.subnetMask!, cost: ospfCost(p) })).sort((a, b) => a.network.localeCompare(b.network))
    const previous = rt.database.find(entry => entry.lsa.routerId === rt.routerId && entry.lsa.area === area)
    if (!force && previous && JSON.stringify([previous.lsa.links, previous.lsa.networks]) === JSON.stringify([links, networks])) continue
    const sequence = Math.max(previous?.lsa.sequence ?? 0, d.ospfSequence ?? 0) + 1
    d.ospfSequence = sequence
    const lsa: OspfLsa = { routerId: rt.routerId, area, sequence, links, networks }
    rt.database = [...rt.database.filter(e => key(e.lsa) !== key(lsa)), { lsa, receivedAt: rt.clock }].slice(-MAX_DATABASE)
    out.push(...flood(d, [lsa]))
  }
  // A lost last interface must withdraw its area, rather than leave an old LAN advertised.
  for (const previous of [...rt.database]) if (previous.lsa.routerId === rt.routerId && !active.some(p => ospfArea(d, p) === previous.lsa.area) && previous.lsa.networks.length) {
    const sequence = Math.max(previous.lsa.sequence, d.ospfSequence ?? 0) + 1
    d.ospfSequence = sequence
    const lsa = { ...previous.lsa, sequence, links: [], networks: [] }
    rt.database = rt.database.map(e => key(e.lsa) === key(lsa) ? { lsa, receivedAt: rt.clock } : e)
    out.push(...flood(d, [lsa]))
  }
  return out
}

function election(d: NetworkDevice, p: NetworkPort) {
  const rt = d.ospf!, iface = rt.interfaces.find(i => i.portId === p.id)!
  if (ospfNetwork(p) === 'point-to-point') return
  const candidates = [{ routerId: rt.routerId, address: p.ipAddress!, priority: p.ospfPriority ?? 1, designatedRouter: iface.designatedRouter, backupRouter: iface.backupRouter }, ...rt.neighbors.filter(n => n.portId === p.id && n.state !== 'Init')].filter(n => n.priority > 0)
  if (rt.clock < iface.waitUntil && !candidates.some(n => n.designatedRouter === n.address && n.designatedRouter !== '0.0.0.0')) return
  candidates.sort((a, b) => b.priority - a.priority || ipToNumber(b.routerId) - ipToNumber(a.routerId))
  const claimedDr = candidates.filter(n => n.designatedRouter === n.address)
  const claimedBdr = candidates.filter(n => n.backupRouter === n.address && n.designatedRouter !== n.address)
  const dr = claimedDr[0] ?? claimedBdr[0] ?? candidates[0]
  const bdr = claimedBdr.find(n => n.address !== dr?.address) ?? candidates.find(n => n.address !== dr?.address)
  iface.designatedRouter = dr?.address ?? '0.0.0.0'; iface.backupRouter = bdr?.address ?? '0.0.0.0'
}
function shouldAdjacent(d: NetworkDevice, p: NetworkPort, n: OspfNeighbor) {
  if (ospfNetwork(p) === 'point-to-point') return true
  const i = d.ospf!.interfaces.find(i => i.portId === p.id)!
  return [i.designatedRouter, i.backupRouter].some(address => address === p.ipAddress || address === n.address)
}

export function prepareOspfTick(devices: NetworkDevice[], deltaMs = SIMULATION_TICK_MS) {
  const outbound: OspfOutbound[] = []
  if (!devices.some(d => hasOspf(d) || d.ospf || d.routingTable.some(r => r.type === 'O'))) return { devices, outbound }
  const updatedDevices = devices.map(original => {
    if (!hasOspf(original) || original.power === false || !routerId(original)) {
      return original.ospf || original.routingTable.some(r => r.type === 'O') ? { ...original, ospf: undefined, routingTable: original.routingTable.filter(r => r.type !== 'O') } : original
    }
    const d = copy(original), rid = routerId(d)!
    if (!d.ospf || d.ospf.routerId !== rid) d.ospf = { clock: 0, routerId: rid, neighbors: [], interfaces: [], database: [], lastOrigination: 0 }
    const rt = d.ospf; rt.clock += deltaMs
    const active = ports(d)
    rt.interfaces = active.map(p => {
      const area = ospfArea(d, p)!, signature = JSON.stringify([p.ipAddress, p.subnetMask, area, ospfHello(p), ospfDead(p), ospfNetwork(p), ospfPassive(d, p)])
      const old = rt.interfaces.find(i => i.portId === p.id && i.signature === signature)
      return old ?? { portId: p.id, area, signature, lastHello: -Infinity, waitUntil: rt.clock + ospfDead(p) * 1000, designatedRouter: '0.0.0.0', backupRouter: '0.0.0.0' }
    })
    rt.neighbors = rt.neighbors.filter(n => {
      const p = active.find(p => p.id === n.portId), old = original.ospf?.interfaces.find(i => i.portId === n.portId), current = rt.interfaces.find(i => i.portId === n.portId)
      return p && !ospfPassive(d, p) && n.area === ospfArea(d, p) && rt.clock - n.lastHello < ospfDead(p) * 1000 && (!old || old.signature === current?.signature)
    })
    rt.database = rt.database.filter(e => rt.clock - e.receivedAt < MAX_AGE_MS)
    for (const p of active) {
      if (ospfPassive(d, p)) continue
      election(d, p)
      for (const n of rt.neighbors.filter(n => n.portId === p.id)) {
        if (n.state === '2-Way' && shouldAdjacent(d, p, n)) { n.state = 'ExStart'; outbound.push(databaseDescription(d, p, n)) }
        else if (['ExStart', 'Exchange'].includes(n.state) && rt.clock - n.lastExchange >= RETRANSMIT_MS) outbound.push(databaseDescription(d, p, n))
        else if (n.state === 'Loading' && rt.clock - n.lastExchange >= RETRANSMIT_MS) { n.lastExchange = rt.clock; outbound.push(packet(d, p, 'link-state-request', { headers: n.requests }, n)) }
        if (n.state === 'Full' && !shouldAdjacent(d, p, n)) { n.state = '2-Way'; n.requests = []; n.retransmissions = [] }
        const due = n.retransmissions.filter(r => rt.clock - r.sentAt >= RETRANSMIT_MS)
        if (due.length) outbound.push(sendUpdate(d, p, n, due.map(r => r.lsa)))
      }
      if (rt.clock - rt.interfaces.find(i => i.portId === p.id)!.lastHello >= ospfHello(p) * 1000) outbound.push(hello(d, p))
    }
    const refresh = rt.clock - rt.lastOrigination >= 1800000
    outbound.push(...originate(d, refresh))
    if (refresh) rt.lastOrigination = rt.clock
    return installOspfRoutes(d)
  })
  return { devices: updatedDevices, outbound }
}

export function receiveOspfPacket(original: NetworkDevice, p: NetworkPort, pdu: PacketPdu) {
  const body = pdu.payload.ospf, outbound: OspfOutbound[] = []
  const reject = (reason: string) => {
    const device = original.ospf ? copy(original) : original
    const iface = device.ospf?.interfaces.find(i => i.portId === p.id)
    if (iface) iface.lastError = reason
    else if (device.ospf) device.ospf.lastError = reason
    return { device, outbound, reason }
  }
  if (!original.ospf || !body || !up(original, p) || ospfPassive(original, p)) return reject(`OSPF is disabled or passive on ${p.name}.`)
  if (ospfArea(original, p) !== body.area) return reject(`OSPF area mismatch on ${p.name}: local ${ospfArea(original, p) ?? 'not enabled'}, received ${body.area} from ${pdu.sourceIp}.`)
  if (body.routerId === original.ospf.routerId) return reject(`Duplicate OSPF router ID ${body.routerId} received from ${pdu.sourceIp} on ${p.name}.`)
  if (body.helloInterval !== ospfHello(p) || body.deadInterval !== ospfDead(p)) return reject(`OSPF timer mismatch on ${p.name}: local Hello/Dead ${ospfHello(p)}/${ospfDead(p)}, peer ${pdu.sourceIp} ${body.helloInterval}/${body.deadInterval}.`)
  if (body.networkType !== ospfNetwork(p)) return reject(`OSPF network type mismatch on ${p.name}: local ${ospfNetwork(p)}, peer ${pdu.sourceIp} ${body.networkType}.`)
  if (body.netmask !== p.subnetMask || !isInSameSubnet(pdu.sourceIp, p.ipAddress!, p.subnetMask!)) return reject(`OSPF subnet mismatch on ${p.name}: local ${p.ipAddress} mask ${p.subnetMask}, peer ${pdu.sourceIp} mask ${body.netmask}.`)
  const d = copy(original), rt = d.ospf!
  rt.interfaces.find(i => i.portId === p.id)!.lastError = undefined
  let n = rt.neighbors.find(n => n.routerId === body.routerId && n.portId === p.id)
  if (body.type === 'hello') {
    if (!n) {
      n = { routerId: body.routerId, portId: p.id, address: pdu.sourceIp, macAddress: pdu.sourceMac, area: body.area, state: 'Init', lastHello: rt.clock, priority: body.priority ?? 1, designatedRouter: body.designatedRouter ?? '0.0.0.0', backupRouter: body.backupRouter ?? '0.0.0.0', lastExchange: 0, requests: [], retransmissions: [] }
      if (rt.neighbors.length >= 512) return { device: original, outbound, reason: 'OSPF neighbor limit reached.' }
      rt.neighbors.push(n); outbound.push(hello(d, p))
    }
    n.lastHello = rt.clock; n.priority = body.priority ?? 1; n.designatedRouter = body.designatedRouter ?? '0.0.0.0'; n.backupRouter = body.backupRouter ?? '0.0.0.0'
    if (body.neighbors?.includes(rt.routerId)) {
      if (n.state === 'Init') { n.state = '2-Way'; outbound.push(hello(d, p)) }
      election(d, p)
      if (n.state === '2-Way' && shouldAdjacent(d, p, n)) { n.state = 'ExStart'; outbound.push(databaseDescription(d, p, n)) }
    } else if (n.state !== 'Init') { n.state = 'Init'; n.requests = []; n.retransmissions = []; outbound.push(hello(d, p)) }
  } else {
    if (!n || n.address !== pdu.sourceIp || n.state === 'Init' || n.state === '2-Way') return { device: original, outbound, reason: 'OSPF database packet arrived before an adjacency was established.' }
    if (body.type === 'database-description') {
      if (n.state === 'ExStart') { n.state = 'Exchange'; outbound.push(databaseDescription(d, p, n)) }
      n.requests = (body.headers ?? []).filter(h => !rt.database.some(e => key(e.lsa) === key(h) && e.lsa.sequence >= h.sequence)).slice(0, MAX_DATABASE)
      if (n.requests.length) { n.state = 'Loading'; n.lastExchange = rt.clock; outbound.push(packet(d, p, 'link-state-request', { headers: n.requests }, n)) }
      else if (n.state !== 'Full') n.state = 'Full'
    } else if (body.type === 'link-state-request') {
      const requested = (body.headers ?? []).flatMap(h => rt.database.filter(e => key(e.lsa) === key(h) && e.lsa.sequence >= h.sequence).map(e => e.lsa))
      if (requested.length) outbound.push(sendUpdate(d, p, n, requested))
    } else if (body.type === 'link-state-update') {
      const received: OspfLsa[] = []
      for (const lsa of (body.lsas ?? []).slice(0, MAX_DATABASE)) {
        if (lsa.area !== body.area || lsa.routerId === rt.routerId) continue
        const old = rt.database.find(e => key(e.lsa) === key(lsa))
        if (!old || old.lsa.sequence < lsa.sequence) { rt.database = [...rt.database.filter(e => key(e.lsa) !== key(lsa)), { lsa, receivedAt: rt.clock }].slice(-MAX_DATABASE); received.push(lsa) }
        n.requests = n.requests.filter(h => key(h) !== key(lsa) || h.sequence > lsa.sequence)
      }
      outbound.push(packet(d, p, 'link-state-ack', { headers: (body.lsas ?? []).map(l => ({ routerId: l.routerId, area: l.area, sequence: l.sequence })) }, n))
      if (n.state === 'Loading' && !n.requests.length) n.state = 'Full'
      outbound.push(...flood(d, received, n))
    } else if (body.type === 'link-state-ack') n.retransmissions = n.retransmissions.filter(r => !body.headers?.some(h => sameHeader(h, r.lsa)))
  }
  outbound.push(...originate(d))
  const previous = original.ospf!.neighbors.find(old => old.routerId === n!.routerId && old.portId === n!.portId)
  if (n.state === 'Full' && previous?.state !== 'Full') outbound.push(sendUpdate(d, p, n, rt.database.filter(e => e.lsa.area === n!.area).map(e => e.lsa)))
  return { device: installOspfRoutes(d), outbound, reason: undefined }
}

export function installOspfRoutes(d: NetworkDevice): NetworkDevice {
  const rt = d.ospf
  if (!rt) return d
  const learned: RouteEntry[] = []
  for (const area of new Set(rt.interfaces.map(i => i.area))) {
    const db = new Map(rt.database.filter(e => e.lsa.area === area).map(e => [e.lsa.routerId, e.lsa]))
    const distance = new Map<string, number>([[rt.routerId, 0]]), firstHop = new Map<string, OspfNeighbor>(), visited = new Set<string>()
    while (true) {
      const current = [...distance.keys()].filter(id => !visited.has(id)).sort((a, b) => distance.get(a)! - distance.get(b)! || a.localeCompare(b))[0]
      if (!current) break
      visited.add(current)
      for (const edge of db.get(current)?.links ?? []) {
        const peer = db.get(edge.routerId)
        if (!peer?.links.some(back => back.routerId === current)) continue
        const hop = current === rt.routerId ? rt.neighbors.find(n => n.routerId === edge.routerId && n.area === area && (n.state === 'Full' || n.state === '2-Way') && ospfCost(d.ports.find(p => p.id === n.portId)!) === edge.cost) : firstHop.get(current)
        if (!hop) continue
        const cost = distance.get(current)! + edge.cost
        if (cost < (distance.get(edge.routerId) ?? Infinity)) { distance.set(edge.routerId, cost); firstHop.set(edge.routerId, hop) }
      }
    }
    const localNetworks = d.ports.filter(p => up(d, p) && p.ipAddress && p.subnetMask).map(p => `${getNetworkAddress(p.ipAddress!, p.subnetMask!)}|${p.subnetMask}`)
    for (const [id, cost] of distance) {
      if (id === rt.routerId) continue
      const hop = firstHop.get(id), port = d.ports.find(p => p.id === hop?.portId)
      if (!hop || !port) continue
      for (const prefix of db.get(id)?.networks ?? []) {
        if (localNetworks.includes(`${prefix.network}|${prefix.netmask}`)) continue
        const route: RouteEntry = { network: prefix.network, netmask: prefix.netmask, nextHop: hop.address, interfaceName: port.name, metric: cost + prefix.cost, type: 'O', area }
        const prior = learned.find(r => r.network === route.network && r.netmask === route.netmask)
        if (!prior) learned.push(route)
        else if (route.metric < prior.metric) Object.assign(prior, route)
      }
    }
  }
  const routingTable = [...d.routingTable.filter(r => r.type !== 'O'), ...learned]
  return JSON.stringify(routingTable) === JSON.stringify(d.routingTable) ? d : { ...d, routingTable }
}

export function ospfConfigLines(d: NetworkDevice): string[] {
  const lines: string[] = []
  for (const p of d.ports) {
    const settings = [p.ospfNetworkType && ` ip ospf network ${p.ospfNetworkType}`, p.ospfCost !== undefined && ` ip ospf cost ${p.ospfCost}`, p.ospfPriority !== undefined && ` ip ospf priority ${p.ospfPriority}`, p.ospfHelloInterval !== undefined && ` ip ospf hello-interval ${p.ospfHelloInterval}`, p.ospfDeadInterval !== undefined && ` ip ospf dead-interval ${p.ospfDeadInterval}`].filter((line): line is string => typeof line === 'string')
    if (settings.length) lines.push(`interface ${p.name}`, ...settings, '!')
  }
  if (d.config.ospfNetworks?.length || d.config.ospfProcessId) {
    lines.push(`router ospf ${d.config.ospfProcessId ?? 1}`)
    if (d.config.ospfRouterId) lines.push(` router-id ${d.config.ospfRouterId}`)
    if (d.config.ospfPassiveDefault) lines.push(' passive-interface default')
    for (const name of d.config.ospfPassiveInterfaces ?? []) lines.push(` passive-interface ${name}`)
    for (const name of d.config.ospfActiveInterfaces ?? []) lines.push(` no passive-interface ${name}`)
    for (const n of d.config.ospfNetworks ?? []) lines.push(` network ${n.network} ${n.wildcard} area ${n.area}`)
    lines.push('!')
  }
  return lines
}

export function stripOspfRuntime(devices: NetworkDevice[]) {
  return devices.map(d => d.ospf || d.routingTable.some(r => r.type === 'O') ? { ...d, ospf: undefined, routingTable: d.routingTable.filter(r => r.type !== 'O') } : d)
}
