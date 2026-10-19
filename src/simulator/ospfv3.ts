import type { NetworkDevice, NetworkPort, PacketPdu, Ospfv3Neighbor, Ospfv3Lsa, Ospfv3LsaHeader, Ospfv3Packet, Ipv6RouteEntry } from '../types/network'
import { ipToNumber, isValidIpv4 } from './protocols/ip'
import { ipv6LinkLocalFromMac, ipv6NetworkAddress, isInSameIpv6Subnet, isIpv6LinkLocal, isValidIpv6 } from './protocols/ipv6'

// OSPFv3 (RFC 5340) for IPv6, mirroring the OSPFv2 state machine in ospf.ts:
// the same Hello/DBD/LSR/LSU/LSAck exchange, DR/BDR election and flooding, but
// with link-local sources, AllSPFRouters multicast (ff02::5), prefix (not
// netmask) LSAs and IPv6 route installation.
export interface Ospfv3Outbound { deviceId: string; portId: string; pdu: PacketPdu }
const MAX_DATABASE = 2000
const RETRANSMIT_MS = 5000
const MAX_AGE_MS = 3600000
export const SIMULATION_TICK_MS = 60
const ALL_SPF_ROUTERS_MAC = '33:33:00:00:00:05'
const key = (lsa: Ospfv3LsaHeader) => `${lsa.area}|${lsa.routerId}`
const sameHeader = (a: Ospfv3LsaHeader, b: Ospfv3LsaHeader) => key(a) === key(b) && a.sequence === b.sequence
const up = (d: NetworkDevice, p: NetworkPort): boolean => d.power !== false && p.adminStatus === 'up' && p.status === 'up'

function globalAddresses(p: NetworkPort) {
  return (p.ipv6Addresses ?? []).filter(address => isValidIpv6(address.address) && !isIpv6LinkLocal(address.address))
}
export const ipv6OspfCost = (p: NetworkPort) => p.ipv6OspfCost ?? (p.type === 'serial' ? 64 : 1)
export const ipv6OspfHello = (p?: NetworkPort) => p?.ipv6OspfHelloInterval ?? 10
export const ipv6OspfDead = (p?: NetworkPort) => p?.ipv6OspfDeadInterval ?? 40
export const ipv6OspfNetwork = (p: NetworkPort) => p.ipv6OspfNetworkType ?? (p.type === 'serial' ? 'point-to-point' : 'broadcast')
export const ipv6OspfPassive = (d: NetworkDevice, p: NetworkPort) => (d.config.ipv6OspfPassiveInterfaces ?? []).includes(p.name) || !!d.config.ipv6OspfPassiveDefault && !(d.config.ipv6OspfActiveInterfaces ?? []).includes(p.name)
export const hasIpv6Ospf = (d: NetworkDevice) =>
  ((d.type === 'router' && d.config.ipRouting !== false) || (d.type === 'switch' && d.config.ipRouting === true)) &&
  d.ports.some(p => p.ipv6OspfArea !== undefined)

function ports(d: NetworkDevice) {
  return d.ports.filter(p => up(d, p) && p.ipv6OspfArea !== undefined && globalAddresses(p).length > 0 && ipv6LinkLocalFromMac(p.macAddress))
}
function routerId(d: NetworkDevice) {
  return d.config.ipv6OspfRouterId || d.ospfv3?.routerId || d.ports.filter(p => p.ipAddress && isValidIpv4(p.ipAddress) && p.ipAddress !== '0.0.0.0').sort((a, b) => ipToNumber(b.ipAddress!) - ipToNumber(a.ipAddress!))[0]?.ipAddress
}
function copy(d: NetworkDevice): NetworkDevice {
  return { ...d, ospfv3: d.ospfv3 && { ...d.ospfv3, neighbors: d.ospfv3.neighbors.map(n => ({ ...n, requests: [...n.requests], retransmissions: [...n.retransmissions] })), interfaces: d.ospfv3.interfaces.map(i => ({ ...i })), database: [...d.ospfv3.database] } }
}
function packet(d: NetworkDevice, p: NetworkPort, type: Ospfv3Packet['type'], extra: Partial<Ospfv3Packet> = {}, neighbor?: Ospfv3Neighbor): Ospfv3Outbound {
  const runtime = d.ospfv3!
  const iface = runtime.interfaces.find(i => i.portId === p.id)!
  const linkLocal = ipv6LinkLocalFromMac(p.macAddress)!
  const ospfv3: Ospfv3Packet = { type, routerId: runtime.routerId, area: iface.area, helloInterval: ipv6OspfHello(p), deadInterval: ipv6OspfDead(p), networkType: ipv6OspfNetwork(p), ...extra }
  const destIp = neighbor?.address ?? 'ff02::5'
  const destMac = neighbor?.macAddress ?? ALL_SPF_ROUTERS_MAC
  return { deviceId: d.id, portId: p.id, pdu: {
    id: `ospfv3-${crypto.randomUUID()}`, protocol: 'OSPF', summary: `OSPFv3 ${type}: router ${runtime.routerId}, area ${iface.area}`,
    sourceIp: linkLocal, destIp, sourceMac: p.macAddress, destMac, etherType: '0x86DD', ttl: 1, payload: { ospfv3 },
    explanation: { layer1: `OSPFv3 outbound interface: ${p.name}.`, layer2: `${p.macAddress} to ${destMac}.`, layer3: `IPv6 next header 89, hop limit 1: ${linkLocal} to ${destIp}.`, layer4AndAbove: `OSPFv3 ${type}, area ${iface.area}, router ID ${runtime.routerId}.`, deviceDecision: `${d.name} sends ${type} on its OSPFv3-enabled interface.` },
  } }
}
function hello(d: NetworkDevice, p: NetworkPort) {
  const rt = d.ospfv3!, iface = rt.interfaces.find(i => i.portId === p.id)!
  iface.lastHello = rt.clock
  return packet(d, p, 'hello', { neighbors: rt.neighbors.filter(n => n.portId === p.id).map(n => n.routerId), priority: p.ipv6OspfPriority ?? 1, designatedRouter: iface.designatedRouter, backupRouter: iface.backupRouter })
}
function headers(d: NetworkDevice, area: number) { return d.ospfv3!.database.filter(entry => entry.lsa.area === area).map(entry => ({ routerId: entry.lsa.routerId, area, sequence: entry.lsa.sequence })) }
function databaseDescription(d: NetworkDevice, p: NetworkPort, n: Ospfv3Neighbor) {
  n.lastExchange = d.ospfv3!.clock
  return packet(d, p, 'database-description', { headers: headers(d, n.area) }, n)
}
function sendUpdate(d: NetworkDevice, p: NetworkPort, n: Ospfv3Neighbor, lsas: Ospfv3Lsa[]) {
  const unique = [...new Map(lsas.map(lsa => [key(lsa), lsa])).values()]
  for (const lsa of unique) n.retransmissions = [...n.retransmissions.filter(r => key(r.lsa) !== key(lsa)), { lsa, sentAt: d.ospfv3!.clock }].slice(-MAX_DATABASE)
  return packet(d, p, 'link-state-update', { lsas: unique }, n)
}
function flood(d: NetworkDevice, lsas: Ospfv3Lsa[], except?: Ospfv3Neighbor) {
  const out: Ospfv3Outbound[] = []
  for (const n of d.ospfv3!.neighbors) {
    if (n === except || n.state !== 'Full') continue
    const p = d.ports.find(p => p.id === n.portId)!
    const areaLsas = lsas.filter(lsa => lsa.area === n.area)
    if (areaLsas.length) out.push(sendUpdate(d, p, n, areaLsas))
  }
  return out
}
function originate(d: NetworkDevice, force = false) {
  const rt = d.ospfv3!, out: Ospfv3Outbound[] = [], active = ports(d)
  for (const area of new Set(active.map(p => p.ipv6OspfArea!))) {
    const links = rt.neighbors.filter(n => n.area === area && ['Full', '2-Way'].includes(n.state)).map(n => ({ routerId: n.routerId, cost: ipv6OspfCost(active.find(p => p.id === n.portId)!) })).sort((a, b) => a.routerId.localeCompare(b.routerId) || a.cost - b.cost)
    const networks = active.filter(p => p.ipv6OspfArea === area).flatMap(p => globalAddresses(p).map(a => ({ prefix: a.address, prefixLength: a.prefixLength, cost: ipv6OspfCost(p) }))).sort((a, b) => a.prefix.localeCompare(b.prefix) || a.prefixLength - b.prefixLength)
    const previous = rt.database.find(entry => entry.lsa.routerId === rt.routerId && entry.lsa.area === area)
    if (!force && previous && JSON.stringify([previous.lsa.links, previous.lsa.networks]) === JSON.stringify([links, networks])) continue
    const sequence = Math.max(previous?.lsa.sequence ?? 0, d.ipv6OspfSequence ?? 0) + 1
    d.ipv6OspfSequence = sequence
    const lsa: Ospfv3Lsa = { routerId: rt.routerId, area, sequence, links, networks }
    rt.database = [...rt.database.filter(e => key(e.lsa) !== key(lsa)), { lsa, receivedAt: rt.clock }].slice(-MAX_DATABASE)
    out.push(...flood(d, [lsa]))
  }
  for (const previous of [...rt.database]) if (previous.lsa.routerId === rt.routerId && !active.some(p => p.ipv6OspfArea === previous.lsa.area) && previous.lsa.networks.length) {
    const sequence = Math.max(previous.lsa.sequence, d.ipv6OspfSequence ?? 0) + 1
    d.ipv6OspfSequence = sequence
    const lsa = { ...previous.lsa, sequence, links: [], networks: [] }
    rt.database = rt.database.map(e => key(e.lsa) === key(lsa) ? { lsa, receivedAt: rt.clock } : e)
    out.push(...flood(d, [lsa]))
  }
  return out
}

function election(d: NetworkDevice, p: NetworkPort) {
  const rt = d.ospfv3!, iface = rt.interfaces.find(i => i.portId === p.id)!
  if (ipv6OspfNetwork(p) === 'point-to-point') return
  const candidates = [{ routerId: rt.routerId, priority: p.ipv6OspfPriority ?? 1, designatedRouter: iface.designatedRouter, backupRouter: iface.backupRouter }, ...rt.neighbors.filter(n => n.portId === p.id && n.state !== 'Init')].filter(n => n.priority > 0)
  if (rt.clock < iface.waitUntil && !candidates.some(n => n.designatedRouter === n.routerId && n.designatedRouter !== '0.0.0.0')) return
  candidates.sort((a, b) => b.priority - a.priority || ipToNumber(b.routerId) - ipToNumber(a.routerId))
  const claimedDr = candidates.filter(n => n.designatedRouter === n.routerId)
  const claimedBdr = candidates.filter(n => n.backupRouter === n.routerId && n.designatedRouter !== n.routerId)
  const dr = claimedDr[0] ?? claimedBdr[0] ?? candidates[0]
  const bdr = claimedBdr.find(n => n.routerId !== dr?.routerId) ?? candidates.find(n => n.routerId !== dr?.routerId)
  iface.designatedRouter = dr?.routerId ?? '0.0.0.0'; iface.backupRouter = bdr?.routerId ?? '0.0.0.0'
}
function shouldAdjacent(d: NetworkDevice, p: NetworkPort, n: Ospfv3Neighbor) {
  if (ipv6OspfNetwork(p) === 'point-to-point') return true
  const i = d.ospfv3!.interfaces.find(i => i.portId === p.id)!
  return [i.designatedRouter, i.backupRouter].some(id => id === d.ospfv3!.routerId || id === n.routerId)
}

export function prepareIpv6OspfTick(devices: NetworkDevice[], deltaMs = SIMULATION_TICK_MS) {
  const outbound: Ospfv3Outbound[] = []
  if (!devices.some(d => hasIpv6Ospf(d) || d.ospfv3 || (d.ipv6RoutingTable ?? []).some(r => r.type === 'O'))) return { devices, outbound }
  const updatedDevices = devices.map(original => {
    if (!hasIpv6Ospf(original) || original.power === false || !routerId(original)) {
      const learned = (original.ipv6RoutingTable ?? []).filter(r => r.type === 'O')
      return original.ospfv3 || learned.length ? { ...original, ospfv3: undefined, ipv6RoutingTable: (original.ipv6RoutingTable ?? []).filter(r => r.type !== 'O').length ? (original.ipv6RoutingTable ?? []).filter(r => r.type !== 'O') : undefined } : original
    }
    const d = copy(original), rid = routerId(d)!
    if (!d.ospfv3 || d.ospfv3.routerId !== rid) d.ospfv3 = { clock: 0, routerId: rid, neighbors: [], interfaces: [], database: [], lastOrigination: 0 }
    const rt = d.ospfv3; rt.clock += deltaMs
    const active = ports(d), talking = active.filter(p => !ipv6OspfPassive(d, p))
    rt.interfaces = active.map(p => {
      const addressSignature = globalAddresses(p).map(a => `${a.address}/${a.prefixLength}`).sort().join(',')
      const signature = JSON.stringify([addressSignature, p.ipv6OspfArea, ipv6OspfHello(p), ipv6OspfDead(p), ipv6OspfNetwork(p), ipv6OspfPassive(d, p)])
      const old = rt.interfaces.find(i => i.portId === p.id && i.signature === signature)
      return old ?? { portId: p.id, area: p.ipv6OspfArea!, signature, lastHello: -Infinity, waitUntil: rt.clock + ipv6OspfDead(p) * 1000, designatedRouter: '0.0.0.0', backupRouter: '0.0.0.0' }
    })
    rt.neighbors = rt.neighbors.filter(n => {
      const p = talking.find(p => p.id === n.portId), old = original.ospfv3?.interfaces.find(i => i.portId === n.portId), current = rt.interfaces.find(i => i.portId === n.portId)
      return p && n.area === p.ipv6OspfArea && rt.clock - n.lastHello < ipv6OspfDead(p) * 1000 && (!old || old.signature === current?.signature)
    })
    rt.database = rt.database.filter(e => rt.clock - e.receivedAt < MAX_AGE_MS)
    for (const p of talking) {
      election(d, p)
      for (const n of rt.neighbors.filter(n => n.portId === p.id)) {
        if (n.state === '2-Way' && shouldAdjacent(d, p, n)) { n.state = 'ExStart'; outbound.push(databaseDescription(d, p, n)) }
        else if (['ExStart', 'Exchange'].includes(n.state) && rt.clock - n.lastExchange >= RETRANSMIT_MS) outbound.push(databaseDescription(d, p, n))
        else if (n.state === 'Loading' && rt.clock - n.lastExchange >= RETRANSMIT_MS) { n.lastExchange = rt.clock; outbound.push(packet(d, p, 'link-state-request', { headers: n.requests }, n)) }
        if (n.state === 'Full' && !shouldAdjacent(d, p, n)) { n.state = '2-Way'; n.requests = []; n.retransmissions = [] }
        const due = n.retransmissions.filter(r => rt.clock - r.sentAt >= RETRANSMIT_MS)
        if (due.length) outbound.push(sendUpdate(d, p, n, due.map(r => r.lsa)))
      }
      if (rt.clock - rt.interfaces.find(i => i.portId === p.id)!.lastHello >= ipv6OspfHello(p) * 1000) outbound.push(hello(d, p))
    }
    const refresh = rt.clock - rt.lastOrigination >= 1800000
    outbound.push(...originate(d, refresh))
    if (refresh) rt.lastOrigination = rt.clock
    return installIpv6OspfRoutes(d)
  })
  return { devices: updatedDevices, outbound }
}

export function receiveOspfv3Packet(original: NetworkDevice, p: NetworkPort, pdu: PacketPdu) {
  const body = pdu.payload.ospfv3, outbound: Ospfv3Outbound[] = []
  const reject = (reason: string) => {
    const device = original.ospfv3 ? copy(original) : original
    const iface = device.ospfv3?.interfaces.find(i => i.portId === p.id)
    if (iface) iface.lastError = reason
    else if (device.ospfv3) device.ospfv3.lastError = reason
    return { device, outbound, reason }
  }
  if (!original.ospfv3 || !body) return reject(`OSPFv3 is not enabled on ${original.name}.`)
  if (!up(original, p) || p.ipv6OspfArea === undefined) return reject(`OSPFv3 is not enabled on ${p.name}.`)
  if (!isIpv6LinkLocal(pdu.sourceIp)) return reject(`OSPFv3 neighbor on ${p.name} used ${pdu.sourceIp} instead of a link-local source.`)
  if (p.ipv6OspfArea !== body.area) return reject(`OSPFv3 area mismatch on ${p.name}: local ${p.ipv6OspfArea}, received ${body.area} from ${pdu.sourceIp}.`)
  if (body.routerId === original.ospfv3.routerId) return reject(`Duplicate OSPFv3 router ID ${body.routerId} received from ${pdu.sourceIp} on ${p.name}.`)
  if (ipv6OspfPassive(original, p)) return reject(`OSPFv3 is passive on ${p.name}; incoming Hello from ${pdu.sourceIp} ignored.`)
  if (body.helloInterval !== ipv6OspfHello(p) || body.deadInterval !== ipv6OspfDead(p)) return reject(`OSPFv3 timer mismatch on ${p.name}: local Hello/Dead ${ipv6OspfHello(p)}/${ipv6OspfDead(p)}, peer ${pdu.sourceIp} ${body.helloInterval}/${body.deadInterval}.`)
  if (body.networkType !== ipv6OspfNetwork(p)) return reject(`OSPFv3 network type mismatch on ${p.name}: local ${ipv6OspfNetwork(p)}, peer ${pdu.sourceIp} ${body.networkType}.`)
  const d = copy(original), rt = d.ospfv3!
  rt.interfaces.find(i => i.portId === p.id)!.lastError = undefined
  let n = rt.neighbors.find(n => n.routerId === body.routerId && n.portId === p.id)
  if (body.type === 'hello') {
    if (!n) {
      n = { routerId: body.routerId, portId: p.id, address: pdu.sourceIp, macAddress: pdu.sourceMac, area: body.area, state: 'Init', lastHello: rt.clock, priority: body.priority ?? 1, designatedRouter: body.designatedRouter ?? '0.0.0.0', backupRouter: body.backupRouter ?? '0.0.0.0', lastExchange: 0, requests: [], retransmissions: [] }
      if (rt.neighbors.length >= 512) return { device: original, outbound, reason: 'OSPFv3 neighbor limit reached.' }
      rt.neighbors.push(n); outbound.push(hello(d, p))
    }
    n.address = pdu.sourceIp; n.macAddress = pdu.sourceMac
    n.lastHello = rt.clock; n.priority = body.priority ?? 1; n.designatedRouter = body.designatedRouter ?? '0.0.0.0'; n.backupRouter = body.backupRouter ?? '0.0.0.0'
    if (body.neighbors?.includes(rt.routerId)) {
      if (n.state === 'Init') { n.state = '2-Way'; outbound.push(hello(d, p)) }
      election(d, p)
      if (n.state === '2-Way' && shouldAdjacent(d, p, n)) { n.state = 'ExStart'; outbound.push(databaseDescription(d, p, n)) }
    } else if (n.state !== 'Init') { n.state = 'Init'; n.requests = []; n.retransmissions = []; outbound.push(hello(d, p)) }
  } else {
    if (!n || n.address !== pdu.sourceIp || n.state === 'Init' || n.state === '2-Way') return { device: original, outbound, reason: 'OSPFv3 database packet arrived before an adjacency was established.' }
    if (body.type === 'database-description') {
      if (n.state === 'ExStart') { n.state = 'Exchange'; outbound.push(databaseDescription(d, p, n)) }
      n.requests = (body.headers ?? []).filter(h => !rt.database.some(e => key(e.lsa) === key(h) && e.lsa.sequence >= h.sequence)).slice(0, MAX_DATABASE)
      if (n.requests.length) { n.state = 'Loading'; n.lastExchange = rt.clock; outbound.push(packet(d, p, 'link-state-request', { headers: n.requests }, n)) }
      else if (n.state !== 'Full') n.state = 'Full'
    } else if (body.type === 'link-state-request') {
      const requested = (body.headers ?? []).flatMap(h => rt.database.filter(e => key(e.lsa) === key(h) && e.lsa.sequence >= h.sequence).map(e => e.lsa))
      if (requested.length) outbound.push(sendUpdate(d, p, n, requested))
    } else if (body.type === 'link-state-update') {
      const received: Ospfv3Lsa[] = []
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
  const previous = original.ospfv3!.neighbors.find(old => old.routerId === n!.routerId && old.portId === n!.portId)
  if (n.state === 'Full' && previous?.state !== 'Full') outbound.push(sendUpdate(d, p, n, rt.database.filter(e => e.lsa.area === n!.area).map(e => e.lsa)))
  return { device: installIpv6OspfRoutes(d), outbound, reason: undefined }
}

export function installIpv6OspfRoutes(d: NetworkDevice): NetworkDevice {
  const rt = d.ospfv3
  if (!rt) return d
  const learned: Ipv6RouteEntry[] = []
  for (const area of new Set(rt.interfaces.map(i => i.area))) {
    const db = new Map(rt.database.filter(e => e.lsa.area === area).map(e => [e.lsa.routerId, e.lsa]))
    const distance = new Map<string, number>([[rt.routerId, 0]]), firstHop = new Map<string, Ospfv3Neighbor>(), visited = new Set<string>()
    while (true) {
      const current = [...distance.keys()].filter(id => !visited.has(id)).sort((a, b) => distance.get(a)! - distance.get(b)! || a.localeCompare(b))[0]
      if (!current) break
      visited.add(current)
      for (const edge of db.get(current)?.links ?? []) {
        const peer = db.get(edge.routerId)
        if (!peer?.links.some(back => back.routerId === current)) continue
        const hop = current === rt.routerId ? rt.neighbors.find(n => n.routerId === edge.routerId && n.area === area && (n.state === 'Full' || n.state === '2-Way') && ipv6OspfCost(d.ports.find(p => p.id === n.portId)!) === edge.cost) : firstHop.get(current)
        if (!hop) continue
        const cost = distance.get(current)! + edge.cost
        if (cost < (distance.get(edge.routerId) ?? Infinity)) { distance.set(edge.routerId, cost); firstHop.set(edge.routerId, hop) }
      }
    }
    const localPrefixes = d.ports.flatMap(p => globalAddresses(p).map(a => ({ address: a.address, prefixLength: a.prefixLength })))
    for (const [id, cost] of distance) {
      if (id === rt.routerId) continue
      const hop = firstHop.get(id), port = d.ports.find(p => p.id === hop?.portId)
      if (!hop || !port) continue
      for (const prefix of db.get(id)?.networks ?? []) {
        if (localPrefixes.some(local => prefix.prefixLength >= local.prefixLength && isInSameIpv6Subnet(prefix.prefix, local.address, local.prefixLength))) continue
        const route: Ipv6RouteEntry = { network: prefix.prefix, prefixLength: prefix.prefixLength, nextHop: hop.address, interfaceName: port.name, metric: cost + prefix.cost, type: 'O' }
        const prefixKey = (r: Ipv6RouteEntry) => `${ipv6NetworkAddress(r.network, r.prefixLength) ?? r.network}/${r.prefixLength}`
        const prior = learned.find(r => prefixKey(r) === prefixKey(route))
        if (!prior) learned.push(route)
        else if (route.metric < prior.metric) Object.assign(prior, route)
      }
    }
  }
  const ipv6RoutingTable = [...(d.ipv6RoutingTable ?? []).filter(r => r.type !== 'O'), ...learned]
  const next = ipv6RoutingTable.length ? ipv6RoutingTable : undefined
  return JSON.stringify(next) === JSON.stringify(d.ipv6RoutingTable ?? undefined) ? d : { ...d, ipv6RoutingTable: next }
}

export function ipv6OspfConfigLines(d: NetworkDevice): string[] {
  const lines: string[] = []
  const processId = d.config.ipv6OspfProcessId
  for (const p of d.ports) {
    const settings = [
      p.ipv6OspfArea !== undefined && ` ipv6 ospf ${p.ipv6OspfProcess ?? processId ?? 1} area ${p.ipv6OspfArea}`,
      p.ipv6OspfCost !== undefined && ` ipv6 ospf cost ${p.ipv6OspfCost}`,
      p.ipv6OspfPriority !== undefined && ` ipv6 ospf priority ${p.ipv6OspfPriority}`,
      p.ipv6OspfHelloInterval !== undefined && ` ipv6 ospf hello-interval ${p.ipv6OspfHelloInterval}`,
      p.ipv6OspfDeadInterval !== undefined && ` ipv6 ospf dead-interval ${p.ipv6OspfDeadInterval}`,
      p.ipv6OspfNetworkType !== undefined && ` ipv6 ospf network ${p.ipv6OspfNetworkType}`,
    ].filter((line): line is string => typeof line === 'string')
    if (settings.length) lines.push(`interface ${p.name}`, ...settings, '!')
  }
  if (processId !== undefined) {
    lines.push(`ipv6 router ospf ${processId}`)
    if (d.config.ipv6OspfRouterId) lines.push(` router-id ${d.config.ipv6OspfRouterId}`)
    if (d.config.ipv6OspfPassiveDefault) lines.push(' passive-interface default')
    for (const name of d.config.ipv6OspfPassiveInterfaces ?? []) lines.push(` passive-interface ${name}`)
    for (const name of d.config.ipv6OspfActiveInterfaces ?? []) lines.push(` no passive-interface ${name}`)
    lines.push('!')
  }
  return lines
}

export function stripIpv6OspfRuntime(devices: NetworkDevice[]) {
  return devices.map(d => d.ospfv3 || (d.ipv6RoutingTable ?? []).some(r => r.type === 'O')
    ? { ...d, ospfv3: undefined, ipv6RoutingTable: (d.ipv6RoutingTable ?? []).filter(r => r.type !== 'O').length ? (d.ipv6RoutingTable ?? []).filter(r => r.type !== 'O') : undefined }
    : d)
}
