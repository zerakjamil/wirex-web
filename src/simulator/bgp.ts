import type { BgpEntry, BgpPacket, BgpPath, BgpPeer, NetworkDevice, NetworkPort, PacketPdu, RouteEntry } from '../types/network'
import { getNetworkAddress, ipToNumber, isInSameSubnet, isValidIpv4 } from './protocols/ip'
import { SIMULATION_TICK_MS } from './ospf'

export interface BgpOutbound { deviceId: string; pdu: PacketPdu }
export const BGP_PORT = 179
export const BGP_KEEPALIVE_MS = 60000
export const BGP_HOLD_MS = 180000
export const BGP_RETRY_MS = 5000
const MAX_ROUTES = 2048
const MAX_ENTRIES_PER_UPDATE = 100
const MAX_AS_PATH = 64
const UNRESOLVED_MAC = '00:00:00:00:00:00'

const up = (d: NetworkDevice, p: NetworkPort): boolean => {
  if (d.power === false || p.adminStatus !== 'up') return false
  if (!p.isGreTunnel) return p.status === 'up'
  const source = d.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === p.greSourceInterface || candidate.shortName === p.greSourceInterface || candidate.id === p.greSourceInterface))
  return d.type === 'router' && p.greMode === 'gre ip' && p.greKeepaliveOperational !== false && isValidIpv4(p.greDestinationIp ?? '') && !!source?.ipAddress && up(d, source)
}

export const bgpRuns = (d: NetworkDevice) => (d.type === 'router' && d.config.ipRouting !== false || d.type === 'switch' && d.config.ipRouting === true) && d.config.bgpAs !== undefined
export const classfulMask = (ip: string) => Number(ip.split('.')[0]) < 128 ? '255.0.0.0' : Number(ip.split('.')[0]) < 192 ? '255.255.0.0' : '255.255.255.0'
export const hasBgp = (d: NetworkDevice) => bgpRuns(d) && !!d.config.bgpNeighbors?.length
export const bgpRouterId = (d: NetworkDevice): string | undefined => {
  if (d.config.bgpRouterId) return d.config.bgpRouterId
  const addresses = d.ports.filter(p => p.ipAddress && isValidIpv4(p.ipAddress)).map(p => p.ipAddress!).sort((a, b) => ipToNumber(b) - ipToNumber(a))
  return addresses[0]
}
export const bgpPeerPort = (d: NetworkDevice, address: string) => d.ports.find(p => up(d, p) && p.ipAddress && p.subnetMask && isValidIpv4(p.ipAddress) && isInSameSubnet(address, p.ipAddress, p.subnetMask))
const prefix = (network: string, netmask: string) => `${network}/${netmask}`

function bgpLocalNetworks(d: NetworkDevice) {
  return (d.config.bgpNetworks ?? []).flatMap(n => {
    const port = d.ports.find(p => up(d, p) && p.ipAddress && p.subnetMask && isValidIpv4(p.ipAddress) && getNetworkAddress(p.ipAddress, p.subnetMask) === n.network && p.subnetMask === n.mask)
    return port ? [{ network: n.network, netmask: n.mask, nextHop: port.ipAddress! }] : []
  })
}

export interface BgpBestPath { path: BgpPath; peer: BgpPeer }

export function bgpBestPaths(d: NetworkDevice): Map<string, BgpBestPath> {
  const best = new Map<string, BgpBestPath>()
  for (const peer of d.bgp?.peers ?? []) {
    if (peer.state !== 'established') continue
    for (const path of peer.learned) {
      const key = prefix(path.network, path.netmask)
      const previous = best.get(key)
      if (!previous || path.asPath.length < previous.path.asPath.length || path.asPath.length === previous.path.asPath.length && ipToNumber(peer.address) < ipToNumber(previous.peer.address)) best.set(key, { path, peer })
    }
  }
  return best
}

function selectBgpRoutes(d: NetworkDevice) {
  const local = new Set(d.ports.filter(p => up(d, p) && p.ipAddress && p.subnetMask && isValidIpv4(p.ipAddress)).map(p => prefix(getNetworkAddress(p.ipAddress!, p.subnetMask!), p.subnetMask!)))
  const routes: RouteEntry[] = []
  for (const { path, peer } of bgpBestPaths(d).values()) {
    if (local.has(prefix(path.network, path.netmask))) continue
    const port = d.ports.find(p => p.id === peer.portId)
    if (!port) continue
    routes.push({ network: path.network, netmask: path.netmask, metric: 0, nextHop: path.nextHop, interfaceName: port.name, type: 'B' })
  }
  d.routingTable = [...d.routingTable.filter(r => r.type !== 'B'), ...routes]
}

function advertisedEntries(d: NetworkDevice, peer: BgpPeer): BgpEntry[] {
  const egressIp = d.ports.find(p => p.id === peer.portId)?.ipAddress
  const entries = new Map<string, BgpEntry>()
  for (const local of bgpLocalNetworks(d)) {
    entries.set(prefix(local.network, local.netmask), { network: local.network, netmask: local.netmask, nextHop: egressIp ?? local.nextHop, asPath: [d.config.bgpAs!] })
  }
  for (const { path, peer: owner } of bgpBestPaths(d).values()) {
    if (owner.address === peer.address) continue
    const key = prefix(path.network, path.netmask)
    if (!entries.has(key)) entries.set(key, { network: path.network, netmask: path.netmask, nextHop: egressIp ?? path.nextHop, asPath: [d.config.bgpAs!, ...path.asPath] })
  }
  return [...entries.values()].slice(0, MAX_ROUTES)
}

function packet(d: NetworkDevice, p: NetworkPort, body: BgpPacket, peer: BgpPeer, summary: string, decision: string): PacketPdu {
  return {
    id: `bgp-${crypto.randomUUID()}`, protocol: 'BGP', sourceIp: p.ipAddress!, destIp: peer.address, sourceMac: p.macAddress, destMac: peer.macAddress || UNRESOLVED_MAC, etherType: '0x0800', ttl: 1,
    summary, payload: { bgp: body },
    explanation: {
      layer1: `BGP outbound interface: ${p.name}.`,
      layer2: `${p.macAddress} to ${peer.macAddress || 'next-hop MAC resolved by ARP'}.`,
      layer3: `IPv4, TCP port ${BGP_PORT}: ${p.ipAddress} to ${peer.address}, TTL 1 because eBGP peering is link-local.`,
      layer4AndAbove: `BGP ${body.type.toUpperCase()} for autonomous system ${body.asNumber}.${body.type === 'open' ? ` Hold time ${body.holdTimeSeconds ?? Math.floor(BGP_HOLD_MS / 1000)} seconds, router ID ${body.routerId ?? d.bgp?.routerId ?? 'unset'}.` : ''}${body.type === 'update' ? ` ${body.entries?.length ?? 0} announced, ${body.withdrawn?.length ?? 0} withdrawn.` : ''}`,
      deviceDecision: decision,
    },
  }
}

function openOutbound(d: NetworkDevice, p: NetworkPort, peer: BgpPeer): BgpOutbound {
  return { deviceId: d.id, pdu: packet(d, p, { type: 'open', asNumber: d.config.bgpAs!, routerId: d.bgp?.routerId, holdTimeSeconds: Math.floor(BGP_HOLD_MS / 1000) }, peer, `BGP Open (AS ${d.config.bgpAs}) to ${peer.address}`, `${d.name} sends a BGP Open to neighbor ${peer.address}, proposing autonomous system ${d.config.bgpAs}.`) }
}

function keepaliveOutbound(d: NetworkDevice, p: NetworkPort, peer: BgpPeer): BgpOutbound {
  return { deviceId: d.id, pdu: packet(d, p, { type: 'keepalive', asNumber: d.config.bgpAs! }, peer, `BGP Keepalive (AS ${d.config.bgpAs}) to ${peer.address}`, `${d.name} keeps the session with ${peer.address} alive.`) }
}

function notificationOutbound(d: NetworkDevice, p: NetworkPort, peer: BgpPeer, text: string): BgpOutbound {
  return { deviceId: d.id, pdu: packet(d, p, { type: 'notification', asNumber: d.config.bgpAs!, notification: text }, peer, `BGP Notification (AS ${d.config.bgpAs}) to ${peer.address}`, `${d.name} rejects the session with ${peer.address} and sends a notification: ${text}`) }
}

function updateOutbounds(d: NetworkDevice, p: NetworkPort, peer: BgpPeer, withdrawn: Array<{ network: string; netmask: string }> = []): BgpOutbound[] {
  const entries = advertisedEntries(d, peer)
  const chunks: BgpEntry[][] = []
  for (let i = 0; i < entries.length; i += MAX_ENTRIES_PER_UPDATE) chunks.push(entries.slice(i, i + MAX_ENTRIES_PER_UPDATE))
  if (!chunks.length) chunks.push([])
  return chunks.map((chunk, index) => {
    const complete = index === chunks.length - 1
    const body: BgpPacket = { type: 'update', asNumber: d.config.bgpAs!, entries: chunk, complete, withdrawn: index === 0 && withdrawn.length ? withdrawn : undefined }
    return { deviceId: d.id, pdu: packet(d, p, body, peer, `BGP Update (AS ${d.config.bgpAs}): ${chunk.length} announced${withdrawn.length ? `, ${withdrawn.length} withdrawn` : ''}`, `${d.name} advertises its current BGP table to ${peer.address}.`) }
  })
}

function cloneRuntime(d: NetworkDevice): NetworkDevice {
  if (!d.bgp) return d
  return { ...d, bgp: { ...d.bgp, peers: d.bgp.peers.map(peer => ({ ...peer, learned: peer.learned.map(path => ({ ...path, asPath: [...path.asPath] })) })), lastOpenAt: { ...d.bgp.lastOpenAt }, lastKeepaliveAt: { ...d.bgp.lastKeepaliveAt }, advertised: [...d.bgp.advertised], localAdvertised: [...d.bgp.localAdvertised] } }
}

export function prepareBgpTick(devices: NetworkDevice[]) {
  const outbound: BgpOutbound[] = []
  if (!devices.some(d => hasBgp(d) || d.bgp || d.routingTable.some(r => r.type === 'B'))) return { devices, outbound }
  const updated = devices.map(original => {
    if (!hasBgp(original)) return original.bgp || original.routingTable.some(r => r.type === 'B') ? { ...original, bgp: undefined, routingTable: original.routingTable.filter(r => r.type !== 'B') } : original
    const first = !original.bgp
    const d: NetworkDevice = original.bgp ? cloneRuntime(original) : { ...original, bgp: { clock: 0, routerId: '', peers: [], lastOpenAt: {}, lastKeepaliveAt: {}, advertised: [], localAdvertised: [], signature: '' } }
    const rt = d.bgp!
    rt.clock += SIMULATION_TICK_MS
    rt.routerId = bgpRouterId(d) ?? rt.routerId
    const configured = d.config.bgpNeighbors ?? []
    rt.peers = rt.peers.filter(peer => configured.some(n => n.ip === peer.address))
    const iBgpNeighbor = configured.find(n => n.remoteAs === d.config.bgpAs)
    if (iBgpNeighbor) rt.lastError = `Neighbor ${iBgpNeighbor.ip} is configured with the local autonomous system ${d.config.bgpAs}; iBGP sessions are not supported in this reduced model.`

    for (const neighbor of configured) {
      if (neighbor.remoteAs === d.config.bgpAs) continue
      const port = bgpPeerPort(d, neighbor.ip)
      let peer = rt.peers.find(candidate => candidate.address === neighbor.ip)
      if (!peer) {
        peer = { address: neighbor.ip, portId: port?.id ?? '', macAddress: '', remoteAs: neighbor.remoteAs, state: 'idle', lastKeepalive: rt.clock, since: rt.clock, learned: [], messagesSent: 0, messagesReceived: 0 }
        rt.peers = [...rt.peers, peer]
      }
      if (peer.remoteAs !== neighbor.remoteAs) {
        peer.remoteAs = neighbor.remoteAs
        peer.state = 'idle'
        peer.learned = []
        peer.remoteRouterId = undefined
        peer.since = rt.clock
      }
      if (port && peer.state === 'idle') peer.portId = port.id
      const holdTimeMs = (peer.remoteHoldTimeSeconds ?? Math.floor(BGP_HOLD_MS / 1000)) * 1000
      if ((peer.state === 'openconfirm' || peer.state === 'established') && rt.clock - peer.lastKeepalive > holdTimeMs) {
        peer.state = 'idle'
        peer.learned = []
        peer.remoteRouterId = undefined
        peer.since = rt.clock
      }
      if (!port || !port.ipAddress || !up(d, port)) continue
      if (peer.state === 'idle' || peer.state === 'opensent') {
        if (rt.clock - (rt.lastOpenAt[peer.address] ?? -BGP_RETRY_MS) >= BGP_RETRY_MS) {
          rt.lastOpenAt[peer.address] = rt.clock
          peer.state = 'opensent'
          peer.messagesSent += 1
          outbound.push(openOutbound(d, port, peer))
        }
      } else if (peer.state === 'established') {
        if (rt.clock - (rt.lastKeepaliveAt[peer.address] ?? -BGP_KEEPALIVE_MS) >= BGP_KEEPALIVE_MS) {
          rt.lastKeepaliveAt[peer.address] = rt.clock
          peer.messagesSent += 1
          outbound.push(keepaliveOutbound(d, port, peer))
        }
      }
    }

    selectBgpRoutes(d)
    const advertisedNow = [...bgpLocalNetworks(d).map(local => prefix(local.network, local.netmask)), ...bgpBestPaths(d).keys()]
    const signature = JSON.stringify([d.config.bgpAs, rt.routerId, advertisedNow])
    if (signature !== rt.signature) {
      const localNow = bgpLocalNetworks(d).map(local => prefix(local.network, local.netmask))
      const withdrawn = first ? [] : rt.localAdvertised.filter(lost => !localNow.includes(lost)).map(lost => ({ network: lost.split('/')[0], netmask: lost.split('/')[1] }))
      rt.signature = signature
      rt.advertised = advertisedNow
      rt.localAdvertised = localNow
      if (!first) for (const peer of rt.peers.filter(candidate => candidate.state === 'established')) {
        const port = d.ports.find(candidate => candidate.id === peer.portId)
        if (!port?.ipAddress || !up(d, port)) continue
        const updates = updateOutbounds(d, port, peer, withdrawn)
        peer.messagesSent += updates.length
        outbound.push(...updates)
      }
    }
    return d
  })
  return { devices: updated, outbound }
}

export function receiveBgpPacket(original: NetworkDevice, p: NetworkPort, pdu: PacketPdu): { device: NetworkDevice; outbound: BgpOutbound[]; reason?: string } {
  const outbound: BgpOutbound[] = [], body = pdu.payload.bgp
  const reject = (reason: string) => ({ device: original.bgp ? { ...original, bgp: { ...original.bgp, lastError: reason } } : original, outbound, reason })
  if (!hasBgp(original) || !original.bgp) return reject(`BGP is not configured on ${original.name}.`)
  if (!body) return reject(`Malformed BGP message rejected on ${p.name}.`)
  if (!up(original, p)) return reject(`BGP rejected on ${p.name}: the interface is not operational.`)
  if (body.type !== 'open' && body.type !== 'keepalive' && body.type !== 'update' && body.type !== 'notification') return reject(`Malformed BGP message rejected on ${p.name}.`)
  if (!Number.isInteger(body.asNumber) || body.asNumber < 1 || body.asNumber > 65535) return reject(`Malformed BGP AS number rejected on ${p.name}.`)
  const neighbor = original.config.bgpNeighbors?.find(n => n.ip === pdu.sourceIp)
  if (!neighbor) return reject(`BGP rejected on ${p.name}: ${pdu.sourceIp} is not a configured neighbor.`)
  if (neighbor.remoteAs !== body.asNumber) {
    const rejected = cloneRuntime(original)
    const rt = rejected.bgp!
    let peer = rt.peers.find(candidate => candidate.address === pdu.sourceIp)
    if (!peer) {
      peer = { address: pdu.sourceIp, portId: p.id, macAddress: pdu.sourceMac, remoteAs: neighbor.remoteAs, state: 'idle', lastKeepalive: rt.clock, since: rt.clock, learned: [], messagesSent: 0, messagesReceived: 0 }
      rt.peers = [...rt.peers, peer]
    }
    peer.messagesReceived += 1
    peer.lastKeepalive = rt.clock
    peer.state = 'idle'
    peer.learned = []
    peer.since = rt.clock
    rt.lastError = `BGP AS mismatch on ${p.name}: neighbor ${pdu.sourceIp} sent AS ${body.asNumber}, but AS ${neighbor.remoteAs} is configured. Session reset.`
    outbound.push(notificationOutbound(rejected, p, peer, `AS mismatch: expected AS ${neighbor.remoteAs}, received AS ${body.asNumber}`))
    selectBgpRoutes(rejected)
    return { device: rejected, outbound, reason: `BGP AS mismatch from ${pdu.sourceIp}: expected AS ${neighbor.remoteAs}, received AS ${body.asNumber}.` }
  }
  if (neighbor.remoteAs === original.config.bgpAs) return reject(`iBGP sessions are not supported in this reduced model.`)

  const d = cloneRuntime(original)
  const rt = d.bgp!
  rt.lastError = undefined
  let peer = rt.peers.find(candidate => candidate.address === pdu.sourceIp)
  if (!peer) {
    peer = { address: pdu.sourceIp, portId: p.id, macAddress: pdu.sourceMac, remoteAs: neighbor.remoteAs, state: 'idle', lastKeepalive: rt.clock, since: rt.clock, learned: [], messagesSent: 0, messagesReceived: 0 }
    rt.peers = [...rt.peers, peer]
  }
  peer.messagesReceived += 1
  peer.lastKeepalive = rt.clock
  peer.portId = p.id
  peer.macAddress = pdu.sourceMac
  peer.remoteAs = neighbor.remoteAs

  if (body.type === 'open') {
    if (body.holdTimeSeconds !== undefined && (!Number.isFinite(body.holdTimeSeconds) || body.holdTimeSeconds < 3 || body.holdTimeSeconds > 65535)) return reject(`Malformed BGP hold time rejected on ${p.name}.`)
    if (body.routerId !== undefined && !isValidIpv4(body.routerId)) return reject(`Malformed BGP router ID rejected on ${p.name}.`)
    peer.remoteRouterId = body.routerId
    peer.remoteHoldTimeSeconds = body.holdTimeSeconds
    if (peer.state === 'established' || peer.state === 'idle') {
      peer.learned = []
      peer.state = 'openconfirm'
      peer.since = rt.clock
      peer.messagesSent += 2
      rt.lastOpenAt[peer.address] = rt.clock
      outbound.push(openOutbound(d, p, peer), keepaliveOutbound(d, p, peer))
    } else if (peer.state === 'opensent') {
      peer.state = 'openconfirm'
      peer.messagesSent += 1
      outbound.push(keepaliveOutbound(d, p, peer))
    } else {
      peer.messagesSent += 1
      outbound.push(keepaliveOutbound(d, p, peer))
    }
  } else if (body.type === 'keepalive') {
    if (peer.state === 'openconfirm') {
      peer.state = 'established'
      peer.since = rt.clock
      rt.lastKeepaliveAt[peer.address] = rt.clock
      const updates = updateOutbounds(d, p, peer)
      peer.messagesSent += updates.length
      outbound.push(...updates)
    }
  } else if (body.type === 'update') {
    if (peer.state !== 'established') return reject(`BGP update discarded on ${p.name}: the session with ${pdu.sourceIp} is not established.`)
    if ((body.entries?.length ?? 0) > MAX_ENTRIES_PER_UPDATE || (body.withdrawn?.length ?? 0) > MAX_ROUTES) return reject(`Malformed BGP update rejected on ${p.name}.`)
    const withdrawn = body.withdrawn ?? []
    if (withdrawn.some(w => !isValidIpv4(w.network) || !isValidIpv4(w.netmask) || !/^1*0*$/.test(ipToNumber(w.netmask).toString(2).padStart(32, '0')))) return reject(`Malformed BGP withdrawal rejected on ${p.name}.`)
    const entries = body.entries ?? []
    if (entries.some(e => !isValidIpv4(e.network) || !isValidIpv4(e.netmask) || !/^1*0*$/.test(ipToNumber(e.netmask).toString(2).padStart(32, '0')) || !Array.isArray(e.asPath) || !e.asPath.length || e.asPath.length > MAX_AS_PATH || e.asPath.some(as => !Number.isInteger(as) || as < 1 || as > 65535) || !isValidIpv4(e.nextHop) || !isInSameSubnet(e.nextHop, p.ipAddress!, p.subnetMask!))) return reject(`Malformed BGP update rejected on ${p.name}.`)
    if (withdrawn.length) peer.learned = peer.learned.filter(path => !withdrawn.some(w => path.network === getNetworkAddress(w.network, w.netmask) && path.netmask === w.netmask))
    let loopSkipped = 0
    const accepted: BgpPath[] = entries.flatMap(entry => {
      if (entry.asPath.includes(d.config.bgpAs!)) { loopSkipped += 1; return [] }
      return [{ network: getNetworkAddress(entry.network, entry.netmask), netmask: entry.netmask, nextHop: entry.nextHop, asPath: [...entry.asPath], updatedAt: rt.clock }]
    })
    if (body.complete === false) {
      for (const path of accepted) peer.learned = [...peer.learned.filter(existing => !(existing.network === path.network && existing.netmask === path.netmask)), path]
    } else {
      peer.learned = accepted
    }
    peer.learned = peer.learned.slice(-MAX_ROUTES)
    if (loopSkipped) rt.lastError = `BGP rejected ${loopSkipped} advertised route${loopSkipped === 1 ? '' : 's'} from ${pdu.sourceIp} because the AS path contains local AS ${d.config.bgpAs}.`
  } else {
    peer.state = 'idle'
    peer.learned = []
    peer.remoteRouterId = undefined
    peer.since = rt.clock
    rt.lastError = `Received a BGP notification from ${pdu.sourceIp}${body.notification ? `: ${body.notification}` : ''}. The session was reset.`
  }

  selectBgpRoutes(d)
  return { device: d, outbound }
}

export function bgpConfigLines(d: NetworkDevice) {
  if (d.config.bgpAs === undefined) return []
  return ['router bgp ' + d.config.bgpAs,
    ...(d.config.bgpRouterId ? [` bgp router-id ${d.config.bgpRouterId}`] : []),
    ...(d.config.bgpNeighbors ?? []).map(n => ` neighbor ${n.ip} remote-as ${n.remoteAs}`),
    ...(d.config.bgpNetworks ?? []).map(n => ` network ${n.network} mask ${n.mask}`),
    '!']
}
