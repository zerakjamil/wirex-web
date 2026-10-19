import type { AsaNatTranslation, EmailMessage, EmailTransactionResult, NetworkDevice, NetworkLink, NetworkPort, PacketPdu, InFlightPacket, SimulationEvent, HttpTransactionResult, DnsTransactionResult, UdpTransactionResult, DhcpTransactionResult, TcpReassemblyBuffer, TcpOutstandingSegment, WlcApEntry, IotThingState } from '@/types/network'
import { isInSameSubnet, ipToNumber, isValidIpv4 } from './protocols/ip'
import { isInSameIpv6Subnet, ipv6LinkLocalFromMac, ipv6SolicitedNodeMulticastAddress, ipv6SolicitedNodeMulticastMac, isValidIpv6, parseIpv6, formatIpv6, ipv6PrefixMask, ipv6AddressFromPrefixAndInterfaceId, ipv6InterfaceIdFromMac, isIpv6LinkLocal, isIpv6Multicast } from './protocols/ipv6'
import { getStpTopology,getOperationalChannels,prepareStpTick,receiveStpBpdu,advanceStpPortStates } from './spanningTree'
import { ageLearnedMacTables } from './macLearning'
import { evaluateAcl } from './acl'
import { allocateDhcpLease } from './dhcp'
import { prepareOspfTick, receiveOspfPacket, hasOspf, ospfArea } from './ospf'
import { prepareIpv6OspfTick, receiveOspfv3Packet } from './ospfv3'
import { prepareIpv6EigrpTick, receiveIpv6EigrpPacket } from './eigrpv6'
import type { OspfOutbound } from './ospf'
import { prepareRipTick, receiveRipPacket, hasRip, ripEnabled } from './rip'
import type { RipOutbound } from './rip'
import { prepareEigrpTick, receiveEigrpPacket, hasEigrp, eigrpEnabled } from './eigrp'
import type { EigrpOutbound } from './eigrp'
import { prepareBgpTick, receiveBgpPacket, hasBgp, bgpRuns } from './bgp'
import type { BgpOutbound } from './bgp'
import { prepareCapwapTick, receiveCapwapPacket, isWlcDevice, isLightweightAp, apRuntimeOf, apWiredPort, apWirelessPort, wlcRuntimeOf, clientLinkFor, capwapDataPdu, type CapwapIntent } from './capwap'
import { applyIotControl, iotKindOf, iotServerRuntimeOf, iotStateOf, iotStateSummary, isIotServer, isIotThing, markIotRegistered, prepareIotTick, recordIotClient, touchIotClient, IOT_BROADCAST_ADDRESS, IOT_CLIENT_PORT, IOT_SERVER_PORT, type IotIntent } from './iot'
import { isValidTftpFileName, MAX_TFTP_FILE_BYTES, TFTP_BLOCK_SIZE, tftpBlockCount, tftpBlockDataHex } from './tftp'
import { isValidSnmpCommunity, isValidSnmpOid, resolveSnmpSystemObject, type SnmpOperation } from './snmp'
import { activeHsrpGroup, hsrpVirtualMac, prepareHsrpTick } from './hsrp'
import { buildSmtpSubmissionTranscript, parseSmtpServerTranscript, processSmtpSubmissionTranscript } from './smtp'
import { buildPop3DeleteTranscript, buildPop3FetchTranscript, buildPop3ListTranscript, createPop3Session, parsePop3DeleteTranscript, parsePop3FetchTranscript, parsePop3ListTranscript, parsePop3RetrResponse, parsePop3UidlResponse, processPop3Command, processPop3DeleteTranscript, processPop3FetchTranscript, processPop3ListTranscript } from './pop3'
import type { Pop3SessionState } from './pop3'

export const MAX_IN_FLIGHT_PACKETS = 256
export const MAX_TOPOLOGY_PACKET_QUEUE = 4096
const MAX_FRAME_HOPS = 64
const PACKET_PROGRESS_PER_TICK = 0.25
const TCP_MSS = 1460
const MAX_TCP_SEGMENTS = 64
const TCP_RETRANSMISSION_TIMEOUT_TICKS = 16
const MAX_TCP_RETRANSMISSIONS = 3
const ASA_NAT_TIMEOUT_MS = 60_000
const MAX_ASA_NAT_TRANSLATIONS = 1024
const BROADCAST = 'ff:ff:ff:ff:ff:ff'
export function packetQueueLimitForTopology(linkCount: number, concurrentPackets = 1): number {
  const topologyLinkCount = Number.isFinite(linkCount) ? Math.max(0, Math.ceil(linkCount)) : 0
  const concurrentPacketCount = Number.isFinite(concurrentPackets) ? Math.max(1, Math.ceil(concurrentPackets)) : 1
  const topologyHeadroom = topologyLinkCount * 2 * concurrentPacketCount
  return Math.min(MAX_TOPOLOGY_PACKET_QUEUE, Math.max(MAX_IN_FLIGHT_PACKETS, topologyHeadroom))
}
const isBridge = (device: NetworkDevice) => ['switch', 'hub', 'phone', 'wireless', 'cloud', 'modem'].includes(device.type)
const isDataCable = (link: NetworkLink) => !['console', 'usb', 'octal'].includes(link.type)
const isUp = (device: NetworkDevice, port: NetworkPort | undefined): boolean => {
  if (device.power === false || !port || port.adminStatus !== 'up') return false
  if (!port.isGreTunnel) return port.status === 'up'
  const source = device.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === port.greSourceInterface || candidate.shortName === port.greSourceInterface || candidate.id === port.greSourceInterface))
  return device.type === 'router' && port.greMode === 'gre ip' && port.greKeepaliveOperational !== false && isValidIpv4(port.greDestinationIp ?? '') && !!source?.ipAddress && isUp(device, source)
}
const carriesVlan = (port: NetworkPort, vlan: number) => port.portMode === 'trunk'
  ? !port.allowedVlans || port.allowedVlans.includes(vlan)
  : (port.vlan ?? 1) === vlan
const egressVlan=(port:NetworkPort,vlan:number|undefined)=>port.portMode==='trunk'&&vlan!==(port.nativeVlan??1)?vlan:undefined
const packetId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

function ipv4CidrContains(ip: string, cidr: string): boolean {
  const [network, prefixText, extra] = cidr.split('/')
  const prefix = Number(prefixText)
  if (extra !== undefined || !isValidIpv4(ip) || !isValidIpv4(network ?? '') || !/^\d{1,2}$/.test(prefixText ?? '') || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (ipToNumber(ip) & mask) === (ipToNumber(network!) & mask)
}

function allocateIcmpPatIdentifier(translations: AsaNatTranslation[], outsideIp: string): number | undefined {
  const used = new Set(translations.filter((translation): translation is Extract<AsaNatTranslation, { protocol: 'ICMP' }> => translation.protocol === 'ICMP' && translation.translatedSourceIp === outsideIp).map(translation => translation.translatedIdentifier))
  for (let identifier = 1; identifier <= 65_535; identifier++) if (!used.has(identifier)) return identifier
  return undefined
}

function allocateTransportPatPort(translations: AsaNatTranslation[], protocol: 'UDP' | 'TCP', outsideIp: string): number | undefined {
  const used = new Set(translations.filter((translation): translation is Extract<AsaNatTranslation, { protocol: typeof protocol }> => translation.protocol === protocol && translation.translatedSourceIp === outsideIp).map(translation => translation.translatedSourcePort))
  for (let port = 49_152; port <= 65_535; port++) if (!used.has(port)) return port
  return undefined
}

export interface SimulationStepResult {
  updatedDevices: NetworkDevice[]
  newInFlightPackets: InFlightPacket[]
  newEvents: SimulationEvent[]
  discardedPackets: number
  queueLimitReached: boolean
  packetDeliveries: Array<{ packetId: string; status: 'delivered' | 'dropped'; receiverDeviceId: string; reason?: string }>
  applicationResults: HttpTransactionResult[]
  emailResults: EmailTransactionResult[]
  dnsResults: DnsTransactionResult[]
  udpResults: UdpTransactionResult[]
  dhcpResults: DhcpTransactionResult[]
  tcpReceiveBuffers: TcpReassemblyBuffer[]
  tcpOutstandingSegments: TcpOutstandingSegment[]
}

function tcpTransmissionKey(pdu: PacketPdu): string | undefined {
  const payload = pdu.payload
  const requestId = payload.tcpRequestId ?? payload.httpRequestId
  const senderId = payload.tcpSenderDeviceId
  const flags = payload.tcpFlags
  if (pdu.protocol !== 'TCP' || !requestId || !senderId || !flags || !['SYN', 'SYN-ACK', 'ACK+PSH', 'FIN-ACK'].includes(flags)) return undefined
  return JSON.stringify([requestId, senderId, flags, payload.tcpSequenceNumber ?? 0, payload.tcpDataLength ?? 0])
}

function tcpSegmentEnd(pdu: PacketPdu): number {
  const flags = pdu.payload.tcpFlags
  return ((pdu.payload.tcpSequenceNumber ?? 0) + (pdu.payload.tcpDataLength ?? 0) + (flags === 'SYN' || flags === 'FIN-ACK' ? 1 : 0)) >>> 0
}

function tcpAckCovers(acknowledgment: number, sequenceEnd: number): boolean {
  return ((acknowledgment - sequenceEnd) >>> 0) < 0x80000000
}

export function createArpRequestPdu(sourceDevice: NetworkDevice, sourcePortId: string, targetIp: string, pingTargetIp: string | undefined = targetIp): PacketPdu {
  const port = sourceDevice.ports.find(p => p.id === sourcePortId)!
  return {
    id: packetId('arp'), protocol: 'ARP', summary: `ARP: Who has ${targetIp}? Tell ${port.ipAddress || sourceDevice.name}`,
    sourceMac: port.macAddress, destMac: BROADCAST, etherType: '0x0806', sourceIp: port.ipAddress || '0.0.0.0', destIp: targetIp, ttl: 255,
    payload: { arpType: 'request', targetIp, targetMac: '00:00:00:00:00:00', pingTargetIp },
    explanation: {
      layer1: `Outbound interface: ${port.name}. Media: Ethernet.`,
      layer2: `Ethernet II: ${port.macAddress} to broadcast (${BROADCAST}). EtherType: ARP (0x0806).`,
      layer3: `ARP request for ${targetIp} from ${port.ipAddress}.`, layer4AndAbove: 'N/A (Layer 2 address resolution)',
      deviceDecision: `${sourceDevice.name} broadcasts an ARP request within its local broadcast domain.`,
    },
  }
}

export function createNeighborSolicitationPdu(sourceDevice: NetworkDevice, sourcePortId: string, targetIp: string, sourceIp: string, pendingPacket?: PacketPdu): PacketPdu {
  const port = sourceDevice.ports.find(p => p.id === sourcePortId)!
  const solicitedMulticast = ipv6SolicitedNodeMulticastAddress(targetIp) ?? 'ff02::1'
  const destMac = ipv6SolicitedNodeMulticastMac(targetIp) ?? '33:33:00:00:00:01'
  return {
    id: packetId('ndp'), protocol: 'ICMPv6', summary: `ICMPv6: Neighbor Solicitation for ${targetIp} from ${sourceIp}`,
    sourceMac: port.macAddress, destMac, etherType: '0x86DD', sourceIp, destIp: solicitedMulticast, ttl: 255,
    pendingPacket,
    payload: { icmpv6Type: 'neighbor-solicitation', ndpTargetAddress: targetIp },
    explanation: {
      layer1: `Outbound interface: ${port.name}. Media: Ethernet.`,
      layer2: `Ethernet II: ${port.macAddress} to multicast ${destMac}. EtherType: IPv6 (0x86DD).`,
      layer3: `ICMPv6 Neighbor Solicitation: who has ${targetIp}? Sent to solicited-node multicast ${solicitedMulticast}.`,
      layer4AndAbove: 'N/A (IPv6 address resolution)',
      deviceDecision: `${sourceDevice.name} resolves the IPv6 neighbor before sending data.`,
    },
  }
}

export function createIcmpv6EchoPdu(sourceDevice: NetworkDevice, sourcePortId: string, destMac: string, targetIp: string, sourceIp: string, seq = 1): PacketPdu {
  const port = sourceDevice.ports.find(p => p.id === sourcePortId)!
  return {
    id: packetId('icmpv6'), protocol: 'ICMPv6', summary: `ICMPv6: Echo Request ${sourceIp} to ${targetIp}`,
    sourceMac: port.macAddress, destMac, etherType: '0x86DD', sourceIp, destIp: targetIp, ttl: 64,
    payload: { icmpv6Type: 'echo-request', icmpSeq: seq, icmpIdentifier: 0 },
    explanation: {
      layer1: `Outbound interface: ${port.name}. Media: Ethernet.`,
      layer2: `Ethernet II: ${port.macAddress} to ${destMac}. EtherType: IPv6 (0x86DD).`,
      layer3: `IPv6: ${sourceIp} to ${targetIp}, Hop Limit 64.`,
      layer4AndAbove: `ICMPv6: Type 128 (Echo Request), Seq ${seq}.`,
      deviceDecision: `${sourceDevice.name} sends an IPv6 echo request.`,
    },
  }
}

export function createIcmpEchoPdu(sourceDevice: NetworkDevice, sourcePortId: string, destMac: string, targetIp: string, seq = 1): PacketPdu {
  const port = sourceDevice.ports.find(p => p.id === sourcePortId)!
  return {
    id: packetId('icmp'), protocol: 'ICMP', summary: `ICMP: Echo Request (ping) to ${targetIp}, seq=${seq}`,
    sourceMac: port.macAddress, destMac, etherType: '0x0800', sourceIp: port.ipAddress || '0.0.0.0', destIp: targetIp, ttl: 128,
    payload: { icmpType: 'echo-request', icmpSeq: seq, icmpIdentifier: 0 },
    explanation: {
      layer1: `Outbound interface: ${port.name}. Media: Ethernet.`,
      layer2: `Ethernet II: ${port.macAddress} to ${destMac}. EtherType: IPv4 (0x0800).`,
      layer3: `IPv4: ${port.ipAddress} to ${targetIp}, TTL: 128, Protocol: ICMP (1).`,
      layer4AndAbove: `ICMP: Type 8 (Echo Request), Code 0, Seq ${seq}.`,
      deviceDecision: `${sourceDevice.name} sends an ICMP Echo Request to ${targetIp}.`,
    },
  }
}

function operationalLinks(devices: Map<string, NetworkDevice>, links: NetworkLink[]) {
  return links.filter(link => {
    const from = devices.get(link.fromDeviceId); const to = devices.get(link.toDeviceId)
    return link.status === 'up' && isDataCable(link) && from && to &&
      isUp(from, from.ports.find(p => p.id === link.fromPortId)) && isUp(to, to.ports.find(p => p.id === link.toPortId))
  })
}

export function getForwardingLinks(devices: NetworkDevice[], links: NetworkLink[], vlan: number): Set<string> {
  return getStpTopology(devices,links,vlan).forwardingLinks
}

export function outgoingRoute(device: NetworkDevice, targetIp: string, excludeGreTunnels = false): { port: NetworkPort; nextHop: string } | undefined {
  const routes = device.routingTable.filter(r => isInSameSubnet(targetIp, r.network, r.netmask))
    .map(r => ({
      port: device.ports.find(p => p.name === r.interfaceName || p.shortName === r.interfaceName || p.id === r.interfaceName)
        ?? device.ports.find(p => isUp(device, p) && p.connectedLinkId && p.ipAddress && p.subnetMask && isValidIpv4(r.nextHop) && isInSameSubnet(r.nextHop, p.ipAddress, p.subnetMask)),
      nextHop: r.type === 'C' || r.nextHop === '0.0.0.0' || r.nextHop === 'connected' ? targetIp : r.nextHop,
      mask: ipToNumber(r.netmask),
      distance: r.type === 'C' ? 0 : r.type === 'S' ? 1 : r.type === 'O' ? 110 : r.type === 'B' ? (r.distance ?? 20) : 120,
      metric: r.metric,
    }))
  for (const port of device.ports) {
    if (port.ipAddress && port.subnetMask && isInSameSubnet(targetIp, port.ipAddress, port.subnetMask)) routes.push({ port, nextHop: targetIp, mask: ipToNumber(port.subnetMask), distance: 0, metric: 0 })
  }
  routes.sort((a, b) => b.mask - a.mask || a.distance - b.distance || a.metric - b.metric)
  const route = routes.find(r => r.port && (!excludeGreTunnels || !r.port.isGreTunnel) && isUp(device, r.port) && (r.port.isGreTunnel || r.port.connectedLinkId || r.port.parentPortId && device.ports.some(p=>p.id===r.port!.parentPortId&&isUp(device,p)&&p.connectedLinkId) || r.port.virtualVlan!==undefined&&device.ports.some(p=>p.virtualVlan===undefined&&isUp(device,p)&&p.connectedLinkId&&carriesVlan(p,r.port!.virtualVlan!))))
  if (route?.port) return { port: route.port, nextHop: route.nextHop }
  const gateway = device.config.defaultGateway
  if (gateway) {
    const port = device.ports.find(p => (!excludeGreTunnels || !p.isGreTunnel) && isUp(device, p) && p.connectedLinkId && p.ipAddress && p.subnetMask && isInSameSubnet(gateway, p.ipAddress, p.subnetMask))
    if (port) return { port, nextHop: gateway }
  }
  return undefined
}

function ipv6PortOwnsAddress(port: NetworkPort, address: string): boolean {
  const target = parseIpv6(address)
  if (target === null) return false
  if ((port.ipv6Addresses ?? []).some(candidate => parseIpv6(candidate.address) === target)) return true
  const linkLocal = port.macAddress ? ipv6LinkLocalFromMac(port.macAddress) : null
  return linkLocal !== null && parseIpv6(linkLocal) === target
}

function ipv6SourceAddressFor(port: NetworkPort, nextHop: string): string | undefined {
  const configured = port.ipv6Addresses ?? []
  const onLink = configured.find(address => isInSameIpv6Subnet(nextHop, address.address, address.prefixLength))
  return (onLink ?? configured[0])?.address
}

function isIpv6ablePort(device: NetworkDevice, port: NetworkPort): boolean {
  return isUp(device, port) && (Boolean(port.connectedLinkId) || Boolean(port.parentPortId && device.ports.some(p => p.id === port.parentPortId && isUp(device, p) && p.connectedLinkId)))
}

function outgoingIpv6Route(device: NetworkDevice, targetIp: string): { port: NetworkPort; nextHop: string; sourceAddress: string } | undefined {
  if (parseIpv6(targetIp) === null) return undefined
  const candidates: Array<{ port: NetworkPort; nextHop: string; prefixLength: number; distance: number; metric: number }> = []
  for (const route of device.ipv6RoutingTable ?? []) {
    if (parseIpv6(route.network) === null || !isInSameIpv6Subnet(targetIp, route.network, route.prefixLength)) continue
    const port = device.ports.find(p => p.name === route.interfaceName || p.shortName === route.interfaceName || p.id === route.interfaceName)
      ?? device.ports.find(p => (p.ipv6Addresses ?? []).some(address => isInSameIpv6Subnet(route.nextHop, address.address, address.prefixLength)))
    if (!port) continue
    candidates.push({ port, nextHop: route.type === 'C' || route.nextHop === '::' ? targetIp : route.nextHop, prefixLength: route.prefixLength, distance: route.type === 'C' ? 0 : route.type === 'S' ? 1 : 110, metric: route.metric })
  }
  for (const port of device.ports) {
    for (const address of port.ipv6Addresses ?? []) {
      if (isInSameIpv6Subnet(targetIp, address.address, address.prefixLength)) candidates.push({ port, nextHop: targetIp, prefixLength: address.prefixLength, distance: 0, metric: 0 })
    }
  }
  candidates.sort((a, b) => b.prefixLength - a.prefixLength || a.distance - b.distance || a.metric - b.metric)
  for (const candidate of candidates) {
    if (!isIpv6ablePort(device, candidate.port)) continue
    const sourceAddress = ipv6SourceAddressFor(candidate.port, candidate.nextHop)
    if (sourceAddress) return { port: candidate.port, nextHop: candidate.nextHop, sourceAddress }
  }
  const gateway = device.config.ipv6DefaultGateway
  if (gateway && parseIpv6(gateway) !== null) {
    const port = device.ports.find(p => isIpv6ablePort(device, p) && (p.ipv6Addresses ?? []).some(address => isInSameIpv6Subnet(gateway, address.address, address.prefixLength)))
    if (port) {
      const sourceAddress = ipv6SourceAddressFor(port, gateway)
      if (sourceAddress) return { port, nextHop: gateway, sourceAddress }
    }
  }
  return undefined
}

function onWire(device: NetworkDevice, port: NetworkPort, link: NetworkLink, pdu: PacketPdu, hops = 0, vlanId?: number): InFlightPacket {
  return {
    id: packetId('pkt'), linkId: link.id, fromDeviceId: device.id,
    toDeviceId: link.fromDeviceId === device.id ? link.toDeviceId : link.fromDeviceId,
    progress: 0, direction: link.fromDeviceId === device.id ? 'forward' : 'reverse', pdu, hops, vlanId,
  }
}

function ipFrames(device:NetworkDevice,route:{port:NetworkPort;nextHop:string},pdu:PacketPdu,devices:NetworkDevice[],links:NetworkLink[],hops:number):InFlightPacket[]{
  if (route.port.isGreTunnel) {
    const tunnel = route.port
    const source = device.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === tunnel.greSourceInterface || candidate.shortName === tunnel.greSourceInterface || candidate.id === tunnel.greSourceInterface))
    if (device.type !== 'router' || tunnel.greMode !== 'gre ip' || !tunnel.greDestinationIp || !source?.ipAddress || !isUp(device, tunnel)) return []
    const underlay = outgoingRoute(device, tunnel.greDestinationIp, true)
    if (!underlay) return []
    const outer: PacketPdu = {
      id: packetId('gre'), protocol: 'GRE', summary: `GRE: Encapsulate ${pdu.protocol} ${pdu.sourceIp} to ${pdu.destIp} through ${tunnel.name}`,
      sourceMac: underlay.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800',
      sourceIp: source.ipAddress, destIp: tunnel.greDestinationIp, ttl: 64,
      pingId: pdu.pingId,
      payload: { greInnerPacket: pdu, greTunnelInterface: tunnel.name },
      explanation: {
        layer1: `Underlay interface: ${underlay.port.name}.`,
        layer2: `Outer Ethernet frame uses ${underlay.port.name} to reach ${underlay.nextHop}.`,
        layer3: `Outer IPv4: ${source.ipAddress} to ${tunnel.greDestinationIp}, protocol GRE (47), TTL 64.`,
        layer4AndAbove: `GRE carries the inner ${pdu.protocol} packet from ${pdu.sourceIp} to ${pdu.destIp}.`,
        deviceDecision: `${device.name} encapsulates the routed packet in ${tunnel.name}.`,
      },
    }
    return ipFrames(device, underlay, outer, devices, links, hops)
  }
  const vlan=route.port.dot1qVlan ?? route.port.virtualVlan
  const entry=device.arpTable.find(a=>a.ipAddress===route.nextHop&&a.interfaceName===route.port.name)
  const known=entry&&device.macTable.find(m=>m.macAddress===entry.macAddress&&m.vlan===vlan)
  const physical=route.port.parentPortId ? device.ports.filter(p=>p.id===route.port.parentPortId&&isUp(device,p)) : vlan===undefined?[route.port]:device.ports.filter(p=>p.virtualVlan===undefined&&!p.parentPortId&&isUp(device,p)&&carriesVlan(p,vlan)&&(!known||p.id===known.portId||p.name===known.portId||p.shortName===known.portId))
  const live=operationalLinks(new Map(devices.map(d=>[d.id,d])),links)
  const forwarding=vlan===undefined?undefined:getForwardingLinks(devices,links,vlan)
  const frames:InFlightPacket[]=[]
  const peers=new Set<string>()
  for(const port of physical)for(const link of live){
    if(!((link.fromDeviceId===device.id&&link.fromPortId===port.id)||(link.toDeviceId===device.id&&link.toPortId===port.id))||forwarding&&!forwarding.has(link.id))continue
    const peerId=link.fromDeviceId===device.id?link.toDeviceId:link.fromDeviceId
    if(vlan!==undefined&&peers.has(peerId))continue
    peers.add(peerId)
    const peerPortId=link.fromDeviceId===device.id?link.toPortId:link.fromPortId
    const serialMac=port.type==='serial'?devices.find(d=>d.id===peerId)?.ports.find(p=>p.id===peerPortId)?.macAddress:undefined
    const mac=entry?.macAddress??serialMac
    let outgoing:PacketPdu
    if(mac)outgoing={...pdu,sourceMac:route.port.macAddress,destMac:mac,explanation:{...pdu.explanation,layer1:`Outbound interface: ${route.port.name}.`,layer2:`${route.port.macAddress} to ${mac}.`,layer3:`IPv4: ${pdu.sourceIp} to ${pdu.destIp}, TTL: ${pdu.ttl}.`,deviceDecision:`${device.name} sends to next hop ${route.nextHop} using ${route.port.name}.`}}
    else{
      outgoing=createArpRequestPdu(device,route.port.id,route.nextHop,undefined)
      outgoing.payload.pingTargetIp=undefined;outgoing.pendingPacket=pdu;outgoing.pingId=pdu.pingId
    }
    frames.push(onWire(device,port,link,outgoing,hops,route.port.parentPortId ? (route.port.dot1qNative ? undefined : route.port.dot1qVlan) : egressVlan(port,vlan)))
  }
  return frames
}

function ipv6Frames(device: NetworkDevice, route: { port: NetworkPort; nextHop: string; sourceAddress: string }, pdu: PacketPdu, devices: NetworkDevice[], links: NetworkLink[], hops: number): InFlightPacket[] {
  const neighbor = device.ipv6NeighborTable?.find(entry => entry.address === route.nextHop && entry.interfaceName === route.port.name)
  const physical = route.port.parentPortId ? device.ports.filter(p => p.id === route.port.parentPortId && isUp(device, p)) : [route.port]
  const live = operationalLinks(new Map(devices.map(d => [d.id, d])), links)
  const frames: InFlightPacket[] = []
  for (const port of physical) for (const link of live) {
    if (!((link.fromDeviceId === device.id && link.fromPortId === port.id) || (link.toDeviceId === device.id && link.toPortId === port.id))) continue
    let outgoing: PacketPdu
    if (neighbor) outgoing = { ...pdu, sourceMac: route.port.macAddress, destMac: neighbor.macAddress, explanation: { ...pdu.explanation, layer1: `Outbound interface: ${route.port.name}.`, layer2: `Ethernet II: ${route.port.macAddress} to ${neighbor.macAddress}.`, deviceDecision: `${device.name} sends to neighbor ${route.nextHop} using ${route.port.name}.` } }
    else { outgoing = createNeighborSolicitationPdu(device, route.port.id, route.nextHop, route.sourceAddress, pdu); outgoing.pingId = pdu.pingId }
    frames.push(onWire(device, port, link, outgoing, hops))
  }
  return frames
}

export function createPingPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], targetIp: string): InFlightPacket[] {
  if (isValidIpv6(targetIp)) {
    const route = outgoingIpv6Route(source, targetIp)
    if (!route) return []
    const echo = createIcmpv6EchoPdu(source, route.port.id, '00:00:00:00:00:00', targetIp, route.sourceAddress)
    return ipv6Frames(source, route, echo, devices, links, 0)
  }
  if (!isValidIpv4(targetIp)) return []
  const route = outgoingRoute(source, targetIp)
  if (!route) return []
  if (route.port.outboundAcl) {
    const acl = source.config.accessLists?.find((a) => a.id === route.port.outboundAcl)
    if (acl) {
      const evalResult = evaluateAcl(acl, {
        sourceIp: route.port.ipAddress || '0.0.0.0',
        destIp: targetIp,
        protocol: 'ICMP',
      })
      if (evalResult.action === 'deny') return []
    }
  }
  const frames=ipFrames(source,route,createIcmpEchoPdu(source,route.port.id,'00:00:00:00:00:00',targetIp),devices,links,0)
  for(const frame of frames)if(frame.pdu.protocol==='ARP')frame.pdu.payload.pingTargetIp=targetIp
  return frames
}

type TcpFlags = NonNullable<PacketPdu['payload']['tcpFlags']>

function splitUtf8Segments(value: string, maximumBytes = TCP_MSS): string[] {
  const encoder = new TextEncoder()
  const chunks: string[] = []
  let chunk = ''
  let byteLength = 0
  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength
    if (chunk && byteLength + characterBytes > maximumBytes) {
      chunks.push(chunk)
      chunk = ''
      byteLength = 0
    }
    chunk += character
    byteLength += characterBytes
  }
  if (chunk || chunks.length === 0) chunks.push(chunk)
  return chunks
}

interface TcpSegmentOptions {
  flags: TcpFlags
  sourceDeviceId: string
  serverDeviceId?: string
  sourcePort: number
  destinationPort: number
  sequence: number
  acknowledgment: number
  summary: string
  detail: string
  dataLength?: number
  dataChunk?: string
  segmentIndex?: number
  segmentCount?: number
  segmentOffset?: number
  httpMethod?: string
  httpPath?: string
  httpResponse?: string
  httpStatus?: number
  errorReason?: string
  tcpDataKind?: 'request' | 'response'
  emailPop3SessionState?: Pop3SessionState
  emailPop3TurnIndex?: number
  emailPop3MessageIds?: string[]
  emailPop3Messages?: EmailMessage[]
  emailPop3CommittedDeletedMessageIds?: string[]
}

function createTcpSegment(base: PacketPdu, options: TcpSegmentOptions): PacketPdu {
  const clientDeviceId = base.payload.tcpClientDeviceId ?? base.payload.httpSourceDeviceId ?? options.sourceDeviceId
  const serverDeviceId = options.serverDeviceId ?? base.payload.tcpServerDeviceId
  const clientIp = base.payload.tcpClientIp ?? (options.sourceDeviceId === clientDeviceId ? base.sourceIp : base.destIp)
  const serverIp = base.payload.tcpServerIp ?? (options.sourceDeviceId === serverDeviceId ? base.sourceIp : base.destIp)
  const sourceIp = options.sourceDeviceId === clientDeviceId ? clientIp : serverIp
  const destIp = options.sourceDeviceId === clientDeviceId ? serverIp : clientIp
  const payload = {
    tcpApplication: base.payload.tcpApplication ?? 'HTTP' as const,
    tcpRequestId: base.payload.tcpRequestId ?? base.payload.httpRequestId,
    tcpFlags: options.flags,
    tcpSequenceNumber: options.sequence >>> 0,
    tcpAcknowledgmentNumber: options.acknowledgment >>> 0,
    tcpSourcePort: options.sourcePort,
    tcpDestinationPort: options.destinationPort,
    tcpSenderDeviceId: options.sourceDeviceId,
    tcpDataLength: options.dataLength ?? 0,
    tcpSegmentIndex: options.segmentIndex ?? 0,
    tcpSegmentCount: options.segmentCount ?? 1,
    tcpSegmentOffset: options.segmentOffset ?? 0,
    httpRequestChunk: options.httpMethod === 'GET' ? options.dataChunk : undefined,
    tcpDataChunk: options.dataChunk,
    tcpDataKind: options.tcpDataKind,
    tcpClientDeviceId: clientDeviceId,
    tcpServerDeviceId: serverDeviceId,
    tcpClientIp: clientIp,
    tcpServerIp: serverIp,
    tcpServerInitialSequence: base.payload.tcpServerInitialSequence,
    tcpErrorReason: options.errorReason,
    httpMethod: options.httpMethod,
    httpPath: options.httpPath ?? base.payload.httpPath,
    httpResponse: options.httpResponse,
    httpStatus: options.httpStatus,
    httpRequestId: base.payload.httpRequestId,
    httpSourceDeviceId: clientDeviceId,
    emailAction: base.payload.emailAction,
    emailFrom: base.payload.emailFrom,
    emailTo: base.payload.emailTo,
    emailSubject: base.payload.emailSubject,
    emailBody: base.payload.emailBody,
    emailMessageId: base.payload.emailMessageId,
    emailUsername: base.payload.emailUsername,
    emailPassword: base.payload.emailPassword,
    emailPop3Phase: base.payload.emailPop3Phase,
    emailPop3MessageIds: options.emailPop3MessageIds ?? base.payload.emailPop3MessageIds,
    emailPop3TurnIndex: options.emailPop3TurnIndex ?? base.payload.emailPop3TurnIndex,
    emailPop3SessionState: options.emailPop3SessionState ?? base.payload.emailPop3SessionState,
    emailPop3Messages: options.emailPop3Messages ?? base.payload.emailPop3Messages,
    emailPop3CommittedDeletedMessageIds: options.emailPop3CommittedDeletedMessageIds ?? base.payload.emailPop3CommittedDeletedMessageIds,
  }
  return {
    ...base,
    id: packetId('tcp'),
    protocol: 'TCP',
    summary: options.summary,
    sourceIp,
    destIp,
    ttl: 64,
    pendingPacket: undefined,
    payload,
    explanation: {
      ...base.explanation,
      layer3: `IPv4: ${sourceIp} to ${destIp}, TTL 64.`,
      layer4AndAbove: `TCP ${options.flags}: ${options.sourcePort} -> ${options.destinationPort}, Seq ${options.sequence >>> 0}, Ack ${options.acknowledgment >>> 0}, ${options.dataLength ?? 0} data bytes. ${options.detail}`,
      deviceDecision: options.detail,
    },
  }
}

function pop3SessionCommand(turn: number, action: 'retrieve' | 'delete', username: string, password: string, messageIds: string[], targetMessageId: string): string | undefined {
  if (turn === 0) return `USER ${username}`
  if (turn === 1) return `PASS ${password}`
  if (turn === 2) return 'STAT'
  if (turn === 3) return 'LIST'
  if (turn === 4) return 'UIDL'
  if (action === 'retrieve') {
    const messageNumber = turn - 4
    return messageNumber <= messageIds.length ? `RETR ${messageNumber}` : 'QUIT'
  }
  if (turn === 5) {
    const messageNumber = messageIds.indexOf(targetMessageId) + 1
    return messageNumber > 0 ? `DELE ${messageNumber}` : undefined
  }
  return turn === 6 ? 'QUIT' : undefined
}

export function createEmailPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], requestId: string, action: 'send' | 'retrieve' | 'delete', message?: Pick<EmailMessage, 'to' | 'subject' | 'body'> | { messageId: string; pop3Phase?: 'delete-list' | 'delete-commit' | 'session'; messageIds?: string[] } | { pop3Phase: 'list' | 'fetch' | 'session'; messageIds?: string[] }): InFlightPacket[] {
  const account = source.config.emailAccount
  if (!account || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.emailAddress)) return []
  if (action === 'send' && (!message || !('to' in message) || !('subject' in message) || !('body' in message) || !message.to || message.to.length > 254 || message.subject.length > 255 || new TextEncoder().encode(message.body).byteLength > 65_536)) return []
  if (action === 'delete' && (!message || !('messageId' in message) || !message.messageId || message.messageId.length > 128)) return []
  const targetIp = action === 'send' ? account.outgoingServer : account.incomingServer
  if (!isValidIpv4(targetIp)) return []
  const route = outgoingRoute(source, targetIp)
  if (!route || source.power === false || !isUp(source, route.port) || !route.port.ipAddress) return []
  const destinationPort = action === 'send' ? 25 : 110
  if (route.port.outboundAcl) {
    const acl = source.config.accessLists?.find(item => item.id === route.port.outboundAcl)
    if (acl && evaluateAcl(acl, { sourceIp: route.port.ipAddress, destIp: targetIp, protocol: 'TCP', port: destinationPort }).action === 'deny') return []
  }
  const server = devices.find(device => device.ports.some(port => port.ipAddress === targetIp))
  const requestedPhase = (action === 'retrieve' || action === 'delete') && message && 'pop3Phase' in message ? message.pop3Phase : 'session'
  const sessionTag = requestedPhase
  const seedText = `${requestId}:${source.id}:${action}:${sessionTag}`
  const sequenceSeed = Array.from(seedText).reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381)
  const clientSequence = sequenceSeed || 1
  const serverSequence = (sequenceSeed ^ 0x5a5a5a5a) >>> 0 || 1
  const sourcePort = 49_152 + (sequenceSeed % 16_384)
  const context: PacketPdu = {
    id: packetId('tcp-email-open'), protocol: 'TCP', summary: `TCP SYN to ${targetIp}:${destinationPort}`,
    sourceMac: route.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp: route.port.ipAddress, destIp: targetIp, ttl: 64,
    payload: {
      tcpApplication: action === 'send' ? 'SMTP' : 'POP3', tcpRequestId: requestId,
      tcpClientDeviceId: source.id, tcpServerDeviceId: server?.id, tcpClientIp: route.port.ipAddress, tcpServerIp: targetIp,
      tcpServerInitialSequence: serverSequence, emailAction: action, emailFrom: account.emailAddress,
      emailTo: message && 'to' in message ? message.to : undefined,
      emailSubject: message && 'subject' in message ? message.subject : undefined,
      emailBody: message && 'body' in message ? message.body : undefined,
      emailMessageId: message && 'messageId' in message ? message.messageId : undefined,
      emailUsername: account.username, emailPassword: account.password,
      emailPop3Phase: action === 'retrieve' || action === 'delete' ? requestedPhase : undefined,
      emailPop3MessageIds: (action === 'retrieve' || action === 'delete') && message && 'messageIds' in message ? message.messageIds : undefined,
      emailPop3TurnIndex: (action === 'retrieve' || action === 'delete') && requestedPhase === 'session' ? 0 : undefined,
      emailPop3SessionState: (action === 'retrieve' || action === 'delete') && requestedPhase === 'session' ? createPop3Session().state : undefined,
      emailPop3Messages: (action === 'retrieve' || action === 'delete') && requestedPhase === 'session' ? [] : undefined,
    },
    explanation: {
      layer1: `Outbound interface: ${route.port.name}.`, layer2: `Ethernet II: ${route.port.macAddress} to the next hop.`,
      layer3: `IPv4: ${route.port.ipAddress} to ${targetIp}, TTL 64.`,
      layer4AndAbove: `TCP SYN: ${sourcePort} -> ${destinationPort}. ${action === 'send' ? 'SMTP' : 'POP3'} waits for connection setup.`,
      deviceDecision: `${source.name} opens a TCP connection to ${action === 'send' ? 'SMTP' : 'POP3'} service port ${destinationPort} at ${targetIp}.`,
    },
  }
  const syn = createTcpSegment(context, {
    flags: 'SYN', sourceDeviceId: source.id, serverDeviceId: server?.id, sourcePort, destinationPort,
    sequence: clientSequence, acknowledgment: 0, summary: `TCP SYN to ${targetIp}:${destinationPort}`,
    detail: `${source.name} begins a ${action === 'send' ? 'SMTP send' : action === 'delete' ? 'POP3 server-message deletion' : `POP3 ${requestedPhase === 'session' ? 'mailbox retrieval' : message && 'pop3Phase' in message && message.pop3Phase === 'fetch' ? 'RETR message fetch' : 'mailbox listing'}`} session.`,
  })
  return ipFrames(source, route, syn, devices, links, 0)
}

export function createHttpGetPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], requestId: string, targetIp: string, path: string): InFlightPacket[] {
  if (!isValidIpv4(targetIp) || !path.startsWith('/') || path.length > 2048 || /[\u0000-\u001f\u007f]/.test(path)) return []
  const route = outgoingRoute(source, targetIp)
  if (!route || source.power === false || !isUp(source, route.port)) return []
  if (route.port.outboundAcl) {
    const acl = source.config.accessLists?.find(item => item.id === route.port.outboundAcl)
    if (acl && evaluateAcl(acl, { sourceIp: route.port.ipAddress || '0.0.0.0', destIp: targetIp, protocol: 'TCP', port: 80 }).action === 'deny') return []
  }
  const sourceIp = route.port.ipAddress
  if (!sourceIp) return []
  const sequenceSeed = Array.from(requestId).reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381)
  const clientSequence = sequenceSeed || 1
  const serverSequence = (sequenceSeed ^ 0x5a5a5a5a) >>> 0 || 1
  const sourcePort = 49152 + (sequenceSeed % 16384)
  const server = devices.find(device => device.ports.some(port => port.ipAddress === targetIp))
  const context: PacketPdu = {
    id: packetId('tcp-open'), protocol: 'TCP', summary: `TCP SYN to ${targetIp}:80`,
    sourceMac: route.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp, destIp: targetIp, ttl: 64,
    payload: { tcpApplication: 'HTTP', tcpRequestId: requestId, tcpClientDeviceId: source.id, tcpServerDeviceId: server?.id, tcpClientIp: sourceIp, tcpServerIp: targetIp, tcpServerInitialSequence: serverSequence, httpPath: path, httpRequestId: requestId, httpSourceDeviceId: source.id },
    explanation: { layer1: `Outbound interface: ${route.port.name}.`, layer2: `Ethernet II: ${route.port.macAddress} to the next hop.`, layer3: `IPv4: ${sourceIp} to ${targetIp}, TTL 64.`, layer4AndAbove: `TCP SYN: ${sourcePort} -> 80. HTTP request waits for connection setup.`, deviceDecision: `${source.name} resolves the route to ${targetIp} and opens a TCP connection to web service port 80.` },
  }
  const syn = createTcpSegment(context, { flags: 'SYN', sourceDeviceId: source.id, serverDeviceId: server?.id, sourcePort, destinationPort: 80, sequence: clientSequence, acknowledgment: 0, summary: `TCP SYN to ${targetIp}:80`, detail: `${source.name} begins a TCP connection for HTTP ${path}.` })
  return ipFrames(source, route, syn, devices, links, 0)
}

export function createDnsQueryPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], requestId: string, domain: string): InFlightPacket[] {
  const normalizedDomain = domain.trim().toLowerCase().replace(/\.$/, '')
  const labels = normalizedDomain.split('.')
  if (!normalizedDomain || normalizedDomain.length > 253 || labels.some(label => label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return []
  const resolverIp = source.config.dnsServer
  if (!resolverIp || !isValidIpv4(resolverIp)) return []
  const route = outgoingRoute(source, resolverIp)
  if (!route || source.power === false || !isUp(source, route.port) || !route.port.ipAddress) return []
  if (route.port.outboundAcl) {
    const acl = source.config.accessLists?.find(item => item.id === route.port.outboundAcl)
    if (acl && evaluateAcl(acl, { sourceIp: route.port.ipAddress, destIp: resolverIp, protocol: 'DNS', port: 53 }).action === 'deny') return []
  }
  const pdu: PacketPdu = {
    id: packetId('dns-query'), protocol: 'DNS', summary: `DNS query: ${normalizedDomain} A record`,
    sourceMac: route.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp: route.port.ipAddress, destIp: resolverIp, ttl: 64,
    payload: { dnsMessageType: 'query', dnsQuery: normalizedDomain, dnsRequestId: requestId, dnsSourceDeviceId: source.id, udpSourcePort: 53000, udpDestinationPort: 53 },
    explanation: { layer1: `Outbound interface: ${route.port.name}.`, layer2: `Ethernet II: ${route.port.macAddress} to the next hop.`, layer3: `IPv4: ${route.port.ipAddress} to DNS resolver ${resolverIp}, TTL 64.`, layer4AndAbove: `UDP: source port 53000 to destination port 53. DNS query for A ${normalizedDomain}.`, deviceDecision: `${source.name} sends a DNS query to its configured resolver ${resolverIp} through the active route.` },
  }
  return ipFrames(source, route, pdu, devices, links, 0)
}

export function createUdpEchoPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], requestId: string, targetIp: string, destinationPort: number, data: string): InFlightPacket[] {
  const byteLength = new TextEncoder().encode(data).byteLength
  if (!requestId || !isValidIpv4(targetIp) || !Number.isInteger(destinationPort) || destinationPort < 1 || destinationPort > 65535 || byteLength > 65507) return []
  const route = outgoingRoute(source, targetIp)
  if (!route || source.power === false || !isUp(source, route.port) || !route.port.ipAddress) return []
  if (route.port.outboundAcl) {
    const acl = source.config.accessLists?.find(item => item.id === route.port.outboundAcl)
    if (acl && evaluateAcl(acl, { sourceIp: route.port.ipAddress, destIp: targetIp, protocol: 'UDP', port: destinationPort }).action === 'deny') return []
  }
  const hash = Array.from(requestId).reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381)
  const sourcePort = 49152 + (hash % 16384)
  const pdu: PacketPdu = {
    id: packetId('udp-echo-request'), protocol: 'UDP', summary: `UDP Echo request to ${targetIp}:${destinationPort}`,
    sourceMac: route.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp: route.port.ipAddress, destIp: targetIp, ttl: 64,
    payload: { udpMessageType: 'request', udpRequestId: requestId, udpSourceDeviceId: source.id, udpService: 'echo', udpData: data, udpSourcePort: sourcePort, udpDestinationPort: destinationPort },
    explanation: { layer1: `Outbound interface: ${route.port.name}.`, layer2: `Ethernet II: ${route.port.macAddress} to the next hop.`, layer3: `IPv4: ${route.port.ipAddress} to ${targetIp}, TTL 64.`, layer4AndAbove: `UDP: source port ${sourcePort} to destination port ${destinationPort}. Echo payload ${byteLength} bytes.`, deviceDecision: `${source.name} sends a UDP Echo request to ${targetIp}:${destinationPort} through the active route.` },
  }
  return ipFrames(source, route, pdu, devices, links, 0)
}

// Raw injectors for the traffic generator. They craft bare UDP datagrams and TCP segments from a
// workspace host: an optional pinned outgoing port and L2/L3 source overrides let a lab show how a
// packet is built before it is routed, and the receiver answers the TCP SYN with the modeled
// handshake or a reset.
export interface TrafficGeneratorFrameOptions {
  sourcePort?: number
  payloadSize?: number
  data?: string
  portId?: string
  sourceIp?: string
  sourceMac?: string
  packetColor?: string
  dscp?: number
}

function trafficGeneratorHash(seed: string) {
  return Array.from(seed).reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381)
}

function trafficGeneratorRoute(source: NetworkDevice, targetIp: string, portId: string | undefined) {
  if (!portId) return outgoingRoute(source, targetIp)
  const port = source.ports.find(candidate => candidate.id === portId)
  if (!port || !isUp(source, port)) return undefined
  const reachable = port.isGreTunnel
    || Boolean(port.connectedLinkId)
    || Boolean(port.parentPortId && source.ports.some(candidate => candidate.id === port.parentPortId && isUp(source, candidate) && candidate.connectedLinkId))
    || Boolean(port.virtualVlan !== undefined && source.ports.some(candidate => candidate.virtualVlan === undefined && isUp(source, candidate) && candidate.connectedLinkId && carriesVlan(candidate, port.virtualVlan!)))
  if (!reachable) return undefined
  return { port, nextHop: targetIp }
}

function trafficGeneratorAclDenied(source: NetworkDevice, egress: NetworkPort, targetIp: string, protocol: 'UDP' | 'TCP', destinationPort: number) {
  if (!egress.outboundAcl) return false
  const acl = source.config.accessLists?.find(item => item.id === egress.outboundAcl)
  return acl ? evaluateAcl(acl, { sourceIp: egress.ipAddress ?? '0.0.0.0', destIp: targetIp, protocol, port: destinationPort }).action === 'deny' : false
}

function colorTrafficGeneratorFrames(frames: InFlightPacket[], color: string | undefined): InFlightPacket[] {
  if (!color) return frames
  return frames.map(frame => ({
    ...frame,
    pdu: {
      ...frame.pdu,
      generatorColor: color,
      ...(frame.pdu.pendingPacket ? { pendingPacket: { ...frame.pdu.pendingPacket, generatorColor: color } } : {}),
    },
  }))
}

export function createRawUdpPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], targetIp: string, destinationPort: number, options: TrafficGeneratorFrameOptions = {}): InFlightPacket[] {
  if (!isValidIpv4(targetIp) || !Number.isInteger(destinationPort) || destinationPort < 1 || destinationPort > 65535) return []
  const base = options.data ?? ''
  const baseBytes = new TextEncoder().encode(base).byteLength
  const requestedBytes = options.payloadSize ?? 0
  if (baseBytes > 1472 || requestedBytes > 1472) return []
  const payloadText = requestedBytes > baseBytes ? base + '.'.repeat(requestedBytes - baseBytes) : base
  const byteLength = new TextEncoder().encode(payloadText).byteLength
  if (byteLength > 1472) return []
  const route = trafficGeneratorRoute(source, targetIp, options.portId)
  if (!route || source.power === false || !isUp(source, route.port)) return []
  const sourceIp = options.sourceIp ?? route.port.ipAddress
  if (!sourceIp || !isValidIpv4(sourceIp)) return []
  if (trafficGeneratorAclDenied(source, route.port, targetIp, 'UDP', destinationPort)) return []
  const sourceMac = options.sourceMac ?? route.port.macAddress
  const sourcePort = options.sourcePort && options.sourcePort >= 1 && options.sourcePort <= 65535
    ? options.sourcePort
    : 49152 + (trafficGeneratorHash(`${source.id}:${targetIp}:${destinationPort}`) % 16384)
  const pdu: PacketPdu = {
    id: packetId('raw-udp'), protocol: 'UDP', summary: `Raw UDP datagram to ${targetIp}:${destinationPort}`,
    sourceMac, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp, destIp: targetIp, ttl: 64,
    ...(options.packetColor ? { generatorColor: options.packetColor } : {}),
    payload: {
      udpMessageType: 'request', udpService: 'raw', udpData: payloadText, udpSourcePort: sourcePort, udpDestinationPort: destinationPort,
      ...(options.dscp !== undefined ? { dscp: options.dscp } : {}),
    },
    explanation: {
      layer1: `Outbound interface: ${route.port.name}.`,
      layer2: `Ethernet II: ${sourceMac} to the next hop.`,
      layer3: `IPv4: ${sourceIp} to ${targetIp}, TTL 64.`,
      layer4AndAbove: `UDP: source port ${sourcePort} to destination port ${destinationPort}. Injected payload ${byteLength} bytes with no application handshake.`,
      deviceDecision: `${source.name} injects a raw UDP datagram to ${targetIp}:${destinationPort} through ${route.port.name}.`,
    },
  }
  return colorTrafficGeneratorFrames(ipFrames(source, route, pdu, devices, links, 0), options.packetColor)
}

export function createRawTcpPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], targetIp: string, destinationPort: number, options: TrafficGeneratorFrameOptions = {}): InFlightPacket[] {
  if (!isValidIpv4(targetIp) || !Number.isInteger(destinationPort) || destinationPort < 1 || destinationPort > 65535) return []
  const route = trafficGeneratorRoute(source, targetIp, options.portId)
  if (!route || source.power === false || !isUp(source, route.port)) return []
  const sourceIp = options.sourceIp ?? route.port.ipAddress
  if (!sourceIp || !isValidIpv4(sourceIp)) return []
  if (trafficGeneratorAclDenied(source, route.port, targetIp, 'TCP', destinationPort)) return []
  const sourceMac = options.sourceMac ?? route.port.macAddress
  const hash = trafficGeneratorHash(`${source.id}:${targetIp}:${destinationPort}`)
  const sourcePort = options.sourcePort && options.sourcePort >= 1 && options.sourcePort <= 65535
    ? options.sourcePort
    : 49152 + (hash % 16384)
  const sequence = hash === 0 ? 1 : hash
  const pdu: PacketPdu = {
    id: packetId('raw-tcp'), protocol: 'TCP', summary: `Raw TCP SYN to ${targetIp}:${destinationPort}`,
    sourceMac, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp, destIp: targetIp, ttl: 64,
    ...(options.packetColor ? { generatorColor: options.packetColor } : {}),
    payload: {
      tcpApplication: 'RAW', tcpFlags: 'SYN', tcpSequenceNumber: sequence, tcpSourcePort: sourcePort, tcpDestinationPort: destinationPort,
      tcpClientDeviceId: source.id, tcpClientIp: sourceIp, tcpServerIp: targetIp, tcpDataLength: 0,
      ...(options.dscp !== undefined ? { dscp: options.dscp } : {}),
    },
    explanation: {
      layer1: `Outbound interface: ${route.port.name}.`,
      layer2: `Ethernet II: ${sourceMac} to the next hop.`,
      layer3: `IPv4: ${sourceIp} to ${targetIp}, TTL 64.`,
      layer4AndAbove: `TCP: source port ${sourcePort} to destination port ${destinationPort}, flags SYN, sequence number ${sequence}.`,
      deviceDecision: `${source.name} injects a raw TCP SYN to ${targetIp}:${destinationPort} through ${route.port.name}.`,
    },
  }
  return colorTrafficGeneratorFrames(ipFrames(source, route, pdu, devices, links, 0), options.packetColor)
}

export function createIotControlPackets(server: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], commandId: string, clientDeviceId: string, patch: IotThingState): InFlightPacket[] {
  if (!commandId || server.power === false) return []
  const client = devices.find(device => device.id === clientDeviceId)
  if (!client || !isIotThing(client)) return []
  const registered = iotServerRuntimeOf(server).clients.find(entry => entry.deviceId === clientDeviceId)
  const targetIp = registered?.address ?? client.ports.find(port => port.ipAddress)?.ipAddress
  if (!targetIp || !isValidIpv4(targetIp)) return []
  const route = outgoingRoute(server, targetIp)
  if (!route || !isUp(server, route.port) || !route.port.ipAddress) return []
  const kind = iotKindOf(client)
  const summary = iotStateSummary(kind, { ...iotStateOf(client), ...patch })
  const pdu: PacketPdu = {
    id: packetId('iot-control'), protocol: 'UDP', summary: `IoT command ${commandId.slice(0, 8)} from ${server.name} to ${client.name}`,
    sourceMac: route.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp: route.port.ipAddress, destIp: targetIp, ttl: 64,
    payload: { udpMessageType: 'request', udpService: 'iot', udpSourcePort: IOT_SERVER_PORT, udpDestinationPort: IOT_CLIENT_PORT, iotMessageType: 'control', iotClientDeviceId: client.id, iotServerDeviceId: server.id, iotCommandId: commandId, iotControlPatch: patch, iotStateSummary: summary },
    explanation: { layer1: `Outbound interface: ${route.port.name}.`, layer2: `Ethernet II: ${route.port.macAddress} to the next hop.`, layer3: `IPv4: ${route.port.ipAddress} to ${targetIp}, TTL 64.`, layer4AndAbove: `UDP: server port ${IOT_SERVER_PORT} to client port ${IOT_CLIENT_PORT}. IoT control command (${summary}).`, deviceDecision: `${server.name} sends a remote IoT command to ${client.name} through the routing table.` },
  }
  return ipFrames(server, route, pdu, devices, links, 0)
}

export function createNtpQueryPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], requestId: string, targetIp: string): InFlightPacket[] {
  if (!requestId || !isValidIpv4(targetIp)) return []
  const route = outgoingRoute(source, targetIp)
  if (!route || source.power === false || !isUp(source, route.port) || !route.port.ipAddress) return []
  if (route.port.outboundAcl) {
    const acl = source.config.accessLists?.find(item => item.id === route.port.outboundAcl)
    if (acl && evaluateAcl(acl, { sourceIp: route.port.ipAddress, destIp: targetIp, protocol: 'UDP', port: 123 }).action === 'deny') return []
  }
  const hash = Array.from(requestId).reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381)
  const sourcePort = 49152 + (hash % 16384)
  const clientTransmitTimeMs = Date.now()
  const pdu: PacketPdu = {
    id: packetId('ntp-request'), protocol: 'UDP', summary: `NTP request to ${targetIp}:123`,
    sourceMac: route.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp: route.port.ipAddress, destIp: targetIp, ttl: 64,
    payload: { udpMessageType: 'request', udpRequestId: requestId, udpSourceDeviceId: source.id, udpService: 'ntp', udpSourcePort: sourcePort, udpDestinationPort: 123, ntpMessageType: 'request', ntpClientTransmitTimeMs: clientTransmitTimeMs },
    explanation: { layer1: `Outbound interface: ${route.port.name}.`, layer2: `Ethernet II: ${route.port.macAddress} to the next hop.`, layer3: `IPv4: ${route.port.ipAddress} to NTP server ${targetIp}, TTL 64.`, layer4AndAbove: `UDP: source port ${sourcePort} to destination port 123. NTP client request.`, deviceDecision: `${source.name} sends an NTP request to ${targetIp} through the active route.` },
  }
  return ipFrames(source, route, pdu, devices, links, 0)
}

export function createSnmpQueryPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], requestId: string, targetIp: string, operation: SnmpOperation, oid: string, community: string): InFlightPacket[] {
  if (!requestId || !isValidIpv4(targetIp) || !isValidSnmpOid(oid) || !isValidSnmpCommunity(community) || !['get', 'get-next'].includes(operation)) return []
  const route = outgoingRoute(source, targetIp)
  if (!route || source.power === false || !isUp(source, route.port) || !route.port.ipAddress) return []
  if (route.port.outboundAcl) {
    const acl = source.config.accessLists?.find(item => item.id === route.port.outboundAcl)
    if (acl && evaluateAcl(acl, { sourceIp: route.port.ipAddress, destIp: targetIp, protocol: 'UDP', port: 161 }).action === 'deny') return []
  }
  const hash = Array.from(requestId).reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381)
  const sourcePort = 49152 + (hash % 16384)
  const operationLabel = operation === 'get-next' ? 'GETNEXT' : 'GET'
  const pdu: PacketPdu = {
    id: packetId('snmp-request'), protocol: 'UDP', summary: `SNMPv2c ${operationLabel} request for ${oid} to ${targetIp}:161`,
    sourceMac: route.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp: route.port.ipAddress, destIp: targetIp, ttl: 64,
    payload: { udpMessageType: 'request', udpRequestId: requestId, udpSourceDeviceId: source.id, udpService: 'snmp', udpSourcePort: sourcePort, udpDestinationPort: 161, snmpVersion: '2c', snmpMessageType: operation, snmpOperation: operation, snmpOid: oid, snmpCommunity: community },
    explanation: { layer1: `Outbound interface: ${route.port.name}.`, layer2: `Ethernet II: ${route.port.macAddress} to the next hop.`, layer3: `IPv4: ${route.port.ipAddress} to SNMP agent ${targetIp}, TTL 64.`, layer4AndAbove: `UDP: source port ${sourcePort} to destination port 161. SNMPv2c ${operationLabel} for ${oid}.`, deviceDecision: `${source.name} sends an SNMPv2c ${operationLabel} request to ${targetIp} through the active route.` },
  }
  return ipFrames(source, route, pdu, devices, links, 0)
}

export function createTftpReadPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], requestId: string, targetIp: string, fileName: string): InFlightPacket[] {
  if (!requestId || !isValidIpv4(targetIp) || !isValidTftpFileName(fileName)) return []
  const route = outgoingRoute(source, targetIp)
  if (!route || source.power === false || !isUp(source, route.port) || !route.port.ipAddress) return []
  if (route.port.outboundAcl) {
    const acl = source.config.accessLists?.find(item => item.id === route.port.outboundAcl)
    if (acl && evaluateAcl(acl, { sourceIp: route.port.ipAddress, destIp: targetIp, protocol: 'UDP', port: 69 }).action === 'deny') return []
  }
  const hash = Array.from(requestId).reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381)
  const sourcePort = 49152 + (hash % 16384)
  const pdu: PacketPdu = {
    id: packetId('tftp-rrq'), protocol: 'UDP', summary: `TFTP RRQ for ${fileName} to ${targetIp}:69`,
    sourceMac: route.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800', sourceIp: route.port.ipAddress, destIp: targetIp, ttl: 64,
    payload: { udpMessageType: 'request', udpRequestId: requestId, udpSourceDeviceId: source.id, udpService: 'tftp', udpSourcePort: sourcePort, udpDestinationPort: 69, tftpMessageType: 'rrq', tftpFileName: fileName, tftpBlockNumber: 0 },
    explanation: { layer1: `Outbound interface: ${route.port.name}.`, layer2: `Ethernet II: ${route.port.macAddress} to the next hop.`, layer3: `IPv4: ${route.port.ipAddress} to TFTP server ${targetIp}, TTL 64.`, layer4AndAbove: `UDP: source port ${sourcePort} to destination port 69. TFTP read request for ${fileName}.`, deviceDecision: `${source.name} requests ${fileName} from ${targetIp} through the active route.` },
  }
  return ipFrames(source, route, pdu, devices, links, 0)
}

export function dhcpBroadcastFrames(device: NetworkDevice, logicalPort: NetworkPort, pdu: PacketPdu, devices: NetworkDevice[], links: NetworkLink[]): InFlightPacket[] {
  const physicalPort = logicalPort.parentPortId
    ? device.ports.find(port => port.id === logicalPort.parentPortId)
    : logicalPort
  if (!physicalPort || !isUp(device, physicalPort)) return []
  const vlan = logicalPort.dot1qVlan ?? logicalPort.virtualVlan ?? logicalPort.vlan ?? physicalPort.vlan ?? 1
  const physicalPorts = logicalPort.virtualVlan !== undefined
    ? device.ports.filter(port => port.virtualVlan === undefined && !port.parentPortId && isUp(device, port) && carriesVlan(port, vlan))
    : [physicalPort]
  const live = operationalLinks(new Map(devices.map(item => [item.id, item])), links)
  return physicalPorts.flatMap(port => {
    const taggedVlan = logicalPort.parentPortId
      ? logicalPort.dot1qNative ? undefined : logicalPort.dot1qVlan
      : egressVlan(port, vlan)
    return live.filter(link => link.fromDeviceId === device.id && link.fromPortId === port.id || link.toDeviceId === device.id && link.toPortId === port.id)
      .filter(link => {
        const peerId = link.fromDeviceId === device.id ? link.toDeviceId : link.fromDeviceId
        const peerPortId = link.fromDeviceId === device.id ? link.toPortId : link.fromPortId
        const peer = devices.find(item => item.id === peerId)
        const peerPort = peer?.ports.find(item => item.id === peerPortId)
        const peerVlan = peerPort?.portMode === 'trunk' ? peerPort.nativeVlan ?? 1 : peerPort?.vlan ?? 1
        const wireVlan = taggedVlan ?? (isBridge(device) ? vlan : isBridge(peer!) ? peerVlan : vlan)
        return getForwardingLinks(devices, links, wireVlan).has(link.id)
      })
      .map(link => onWire(device, port, link, pdu, 0, taggedVlan))
  })
}

export function createDhcpDiscoverPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], requestId: string): InFlightPacket[] {
  if (!requestId || source.power === false) return []
  const port = source.ports.find(candidate => candidate.connectedLinkId && isUp(source, candidate) && candidate.type !== 'phone')
  const link = port && links.find(candidate => candidate.id === port.connectedLinkId && candidate.status === 'up')
  if (!port || !link) return []
  const clientIdentifier=`01${port.macAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()}`
  const pdu: PacketPdu = {
    id: packetId('dhcp-discover'), protocol: 'DHCP', summary: `DHCP Discover from ${source.name}`,
    sourceMac: port.macAddress, destMac: BROADCAST, etherType: '0x0800', sourceIp: '0.0.0.0', destIp: '255.255.255.255', ttl: 64,
    payload: { dhcpType: 'discover', dhcpRequestId: requestId, dhcpClientDeviceId: source.id, dhcpClientPortId: port.id, dhcpClientIdentifier: clientIdentifier, udpSourcePort: 68, udpDestinationPort: 67 },
    explanation: {
      layer1: `Outbound interface: ${port.name}. Media: Ethernet.`,
      layer2: `DHCP Discover is broadcast to ${BROADCAST} in the local VLAN.`,
      layer3: 'IPv4: 0.0.0.0 to 255.255.255.255, TTL 64.',
      layer4AndAbove: 'UDP: client port 68 to server port 67. DHCP Discover.',
      deviceDecision: `${source.name} broadcasts a DHCP Discover to locate an address server.`,
    },
  }
  return dhcpBroadcastFrames(source, port, pdu, devices, links)
}

// Which DHCPv6 pool serves a frame arriving on this port: the pool named by
// `ipv6 dhcp server <pool>` on the interface, or — on non-router devices such
// as the server workspace device — its first configured pool.
function dhcpv6PoolFor(device: NetworkDevice, port: NetworkPort): { name: string; prefix: string; prefixLength: number; startAddress?: string } | undefined {
  const pools = device.config.dhcpv6Pools ?? []
  if (port.ipv6DhcpServerPool) return pools.find(pool => pool.name === port.ipv6DhcpServerPool)
  if (device.type !== 'router') return pools[0]
  return undefined
}

// DHCPv6 address allocation: start at <prefix>::100 (or the pool's configured
// start address), skip the network address, the server's own addresses and any
// address already bound to a client. Bounded so a full pool cannot spin.
function ipv6AllocatePoolAddress(pool: { name: string; prefix: string; prefixLength: number; startAddress?: string }, server: NetworkDevice, preferred?: string): string | null {
  const network = parseIpv6(pool.prefix)
  if (network === null) return null
  const mask = ipv6PrefixMask(pool.prefixLength)
  const base = network & mask
  const inUse = new Set<string>()
  for (const binding of server.config.dhcpv6Bindings ?? []) inUse.add(binding.address)
  for (const port of server.ports) for (const address of port.ipv6Addresses ?? []) inUse.add(address.address)
  const withinPool = (value: bigint) => (value & mask) === base
  if (preferred) {
    const parsedPreferred = parseIpv6(preferred)
    if (parsedPreferred !== null && withinPool(parsedPreferred) && parsedPreferred !== base && !inUse.has(formatIpv6(parsedPreferred))) return formatIpv6(parsedPreferred)
  }
  let start = base + BigInt(0x100)
  if (pool.startAddress) {
    const parsedStart = parseIpv6(pool.startAddress)
    if (parsedStart !== null && withinPool(parsedStart) && parsedStart !== base) start = parsedStart
  }
  for (let offset = BigInt(0); offset < BigInt(4096); offset += BigInt(1)) {
    const candidate = start + offset
    if (!withinPool(candidate) || candidate === base) continue
    const formatted = formatIpv6(candidate)
    if (inUse.has(formatted)) continue
    return formatted
  }
  return null
}

// Router Solicitation (ICMPv6 type 133) to the all-routers multicast group.
export function createRouterSolicitationPackets(source: NetworkDevice, links: NetworkLink[], portIds?: string[]): InFlightPacket[] {
  if (source.power === false) return []
  const port = source.ports.find(candidate => (!portIds || portIds.includes(candidate.id)) && candidate.connectedLinkId && isUp(source, candidate) && candidate.type !== 'phone')
  if (!port) return []
  const link = links.find(candidate => candidate.id === port.connectedLinkId && candidate.status === 'up')
  const linkLocal = link ? ipv6LinkLocalFromMac(port.macAddress) : null
  if (!link || !linkLocal) return []
  const pdu: PacketPdu = {
    id: packetId('rs'), protocol: 'ICMPv6', summary: `ICMPv6: Router Solicitation from ${linkLocal}`,
    sourceMac: port.macAddress, destMac: '33:33:00:00:00:02', etherType: '0x86DD', sourceIp: linkLocal, destIp: 'ff02::2', ttl: 255,
    payload: { icmpv6Type: 'router-solicitation' },
    explanation: {
      layer1: `Outbound interface: ${port.name}. Media: Ethernet.`,
      layer2: `Ethernet II: ${port.macAddress} to multicast 33:33:00:00:00:02. EtherType: IPv6 (0x86DD).`,
      layer3: 'ICMPv6 Router Solicitation to the all-routers multicast address ff02::2, Hop Limit 255.',
      layer4AndAbove: 'N/A (IPv6 router discovery)',
      deviceDecision: `${source.name} solicits a router advertisement on ${port.name}.`,
    },
  }
  return [onWire(source, port, link, pdu, 0)]
}

// DHCPv6 Solicit (UDP 546 to 547) to the All_DHCP_Servers link-local multicast
// group ff02::1:2, sourced from the interface link-local address.
export function createDhcpv6SolicitPackets(source: NetworkDevice, links: NetworkLink[], transactionId: string, portIds?: string[]): InFlightPacket[] {
  if (!transactionId || source.power === false) return []
  const port = source.ports.find(candidate => (!portIds || portIds.includes(candidate.id)) && candidate.connectedLinkId && isUp(source, candidate) && candidate.type !== 'phone')
  if (!port) return []
  const link = links.find(candidate => candidate.id === port.connectedLinkId && candidate.status === 'up')
  const linkLocal = link ? ipv6LinkLocalFromMac(port.macAddress) : null
  if (!link || !linkLocal) return []
  const pdu: PacketPdu = {
    id: packetId('dhcpv6-solicit'), protocol: 'DHCPv6', summary: `DHCPv6: Solicit from ${source.name}`,
    sourceMac: port.macAddress, destMac: '33:33:00:01:00:02', etherType: '0x86DD', sourceIp: linkLocal, destIp: 'ff02::1:2', ttl: 1,
    payload: { dhcpv6Type: 'solicit', dhcpv6TransactionId: transactionId, dhcpv6ClientDeviceId: source.id, dhcpv6ClientPortId: port.id, udpSourcePort: 546, udpDestinationPort: 547 },
    explanation: {
      layer1: `Outbound interface: ${port.name}. Media: Ethernet.`,
      layer2: `Ethernet II: ${port.macAddress} to multicast 33:33:00:01:00:02. EtherType: IPv6 (0x86DD).`,
      layer3: `IPv6: ${linkLocal} to ff02::1:2 (All DHCP Servers), Hop Limit 1.`,
      layer4AndAbove: 'UDP: client port 546 to server port 547. DHCPv6 Solicit.',
      deviceDecision: `${source.name} multicasts a DHCPv6 Solicit to locate an address server.`,
    },
  }
  return [onWire(source, port, link, pdu, 0)]
}

export function createDhcpRenewalPackets(source: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[], requestId: string, phase: 'renew' | 'rebind'): InFlightPacket[] {
  const lease=source.config.dhcpLease
  if(!requestId||source.power===false||!lease||!isValidIpv4(lease.ipAddress))return []
  const port=source.ports.find(candidate=>candidate.connectedLinkId&&isUp(source,candidate)&&candidate.type!=='phone')
  if(!port)return []
  const pdu:PacketPdu={
    id:packetId(`dhcp-${phase}`),protocol:'DHCP',summary:`DHCP ${phase==='renew'?'Renew':'Rebind'} Request from ${source.name}`,
    sourceMac:port.macAddress,destMac:BROADCAST,etherType:'0x0800',sourceIp:lease.ipAddress,destIp:'255.255.255.255',ttl:64,
    payload:{dhcpType:'request',dhcpRequestId:requestId,dhcpClientDeviceId:source.id,dhcpClientPortId:port.id,
      dhcpClientIdentifier:`01${port.macAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()}`,
      dhcpServerDeviceId:phase==='renew'?lease.serverId:undefined,dhcpRequestedIp:lease.ipAddress,dhcpRenewalPhase:phase,
      udpSourcePort:68,udpDestinationPort:67},
    explanation:{layer1:`Outbound interface: ${port.name}. Media: Ethernet.`,layer2:`DHCP ${phase} request is sent on the lease VLAN.`,
      layer3:`IPv4: ${lease.ipAddress} to 255.255.255.255, TTL 64.`,layer4AndAbove:`UDP: client port 68 to server port 67. DHCP ${phase} request for ${lease.ipAddress}.`,
      deviceDecision:`${source.name} requests renewal of its DHCP lease.`},
  }
  return dhcpBroadcastFrames(source,port,pdu,devices,links)
}

export function createPingPacket(source:NetworkDevice,devices:NetworkDevice[],links:NetworkLink[],targetIp:string):InFlightPacket|null{
  return createPingPackets(source,devices,links,targetIp)[0]??null
}

export function stepSimulationTick(devices: NetworkDevice[], links: NetworkLink[], inFlightPackets: InFlightPacket[], previousTcpReceiveBuffers: TcpReassemblyBuffer[] = [], previousTcpOutstandingSegments: TcpOutstandingSegment[] = [], simulationTick = 1, collectEvents = false): SimulationStepResult {
  const packetQueueLimit = packetQueueLimitForTopology(links.length, inFlightPackets.length)
  const hsrpDevices=prepareHsrpTick(devices,links,simulationTick)
  const ospfControl = prepareOspfTick(hsrpDevices)
  const ospfv3Control = prepareIpv6OspfTick(ospfControl.devices)
  const ripControl = prepareRipTick(ospfv3Control.devices)
  const eigrpControl = prepareEigrpTick(ripControl.devices)
  const eigrpV6Control = prepareIpv6EigrpTick(eigrpControl.devices)
  const bgpControl = prepareBgpTick(eigrpV6Control.devices)
  const capwapControl = prepareCapwapTick(bgpControl.devices, links, simulationTick)
  const iotControl = prepareIotTick(capwapControl.devices, links, simulationTick)
  const control = { devices: iotControl.devices, outbound: [...ospfControl.outbound, ...ripControl.outbound, ...ospfv3Control.outbound, ...eigrpControl.outbound, ...eigrpV6Control.outbound] }
  const stpControl=prepareStpTick(control.devices,links,simulationTick)
  let updatedDevices = ageLearnedMacTables(advanceStpPortStates(stpControl.devices,links,simulationTick),simulationTick)
  const byId = new Map(updatedDevices.map(d => [d.id, d]))
  const deviceIndices = new Map(devices.map((d, i) => [d.id, i]))
  const mutable = new Set<string>()
  const linksById = new Map(links.map(l => [l.id, l]))
  const liveLinks = new Set(operationalLinks(byId, links).map(l => l.id))
  let bundledLinks:Set<string>|undefined
  const linksByPort=new Map<string,NetworkLink[]>()
  for(const link of links)for(const [deviceId,portId] of [[link.fromDeviceId,link.fromPortId],[link.toDeviceId,link.toPortId]]){
    const key=`${deviceId}|${portId}`
    linksByPort.set(key,[...(linksByPort.get(key)??[]),link])
  }
  const forwardingByVlan = new Map<number, Set<string>>()
  const stpTopologyByVlan=new Map<number,ReturnType<typeof getStpTopology>>()
  const stpTopology=(vlan:number)=>{
    if(!stpTopologyByVlan.has(vlan))stpTopologyByVlan.set(vlan,getStpTopology(updatedDevices,links,vlan))
    return stpTopologyByVlan.get(vlan)!
  }
  const remaining: InFlightPacket[] = []
  const packetDeliveries: SimulationStepResult['packetDeliveries'] = []
  const applicationResults: HttpTransactionResult[] = []
  const emailResults: EmailTransactionResult[] = []
  const dnsResults: DnsTransactionResult[] = []
  const udpResults: UdpTransactionResult[] = []
  const dhcpResults: DhcpTransactionResult[] = []
  let tcpReceiveBuffers = previousTcpReceiveBuffers.map(buffer => ({ ...buffer, segments: { ...buffer.segments }, segmentLengths: { ...buffer.segmentLengths }, ageTicks: buffer.ageTicks + 1 })).filter(buffer => buffer.ageTicks <= 512)
  let tcpOutstandingSegments = previousTcpOutstandingSegments.map(segment => ({ ...segment, ageTicks: segment.ageTicks + 1 }))
  let discardedPackets = Math.max(0, inFlightPackets.length - packetQueueLimit)
  let queueLimitReached = discardedPackets > 0
  const forwardingLinks = (vlan: number) => {
    if (!forwardingByVlan.has(vlan)) forwardingByVlan.set(vlan, stpTopology(vlan).forwardingLinks)
    return forwardingByVlan.get(vlan)!
  }
  const editDevice = (id: string): NetworkDevice => {
    if (!mutable.has(id)) {
      if (updatedDevices === devices) updatedDevices = [...devices]
      const current = byId.get(id)!
      const edited = { ...current, ports: current.ports.map(port => ({ ...port })), arpTable: [...current.arpTable], macTable: [...current.macTable], asaNatTranslations: current.asaNatTranslations ? [...current.asaNatTranslations] : undefined }
      byId.set(id, edited); updatedDevices[deviceIndices.get(id)!] = edited; mutable.add(id)
    }
    return byId.get(id)!
  }
  const recordTcpFailure = (pdu: PacketPdu, reason: string) => {
    const requestId = pdu.payload.tcpRequestId ?? pdu.payload.httpRequestId
    if (!requestId) return
    if (pdu.payload.tcpApplication === 'SMTP' || pdu.payload.tcpApplication === 'POP3') {
      if (!emailResults.some(result => result.requestId === requestId)) emailResults.push({
        requestId,
        sourceDeviceId: pdu.payload.tcpClientDeviceId ?? pdu.payload.httpSourceDeviceId ?? '',
        action: pdu.payload.emailAction ?? (pdu.payload.tcpApplication === 'SMTP' ? 'send' : 'retrieve'),
        status: 'failed', reason,
      })
    } else if (!applicationResults.some(result => result.requestId === requestId)) {
      applicationResults.push({ requestId, sourceDeviceId: pdu.payload.tcpClientDeviceId ?? pdu.payload.httpSourceDeviceId ?? '', status: 'failed', reason })
    }
  }
  const trackTcpTransmission = (pdu: PacketPdu) => {
    const key = tcpTransmissionKey(pdu)
    if (!key || tcpOutstandingSegments.some(segment => segment.key === key)) return
    if (tcpOutstandingSegments.length >= MAX_IN_FLIGHT_PACKETS) {
      queueLimitReached = true
      discardedPackets++
      recordTcpFailure(pdu, 'TCP retransmission queue is full.')
      return
    }
    tcpOutstandingSegments.push({
      key,
      requestId: pdu.payload.tcpRequestId ?? pdu.payload.httpRequestId!,
      ownerDeviceId: pdu.payload.tcpSenderDeviceId!,
      pdu,
      ageTicks: 0,
      retries: 0,
      failApplicationOnTimeout: true,
    })
  }
  const acknowledgeTcpTransmission = (pdu: PacketPdu) => {
    const requestId = pdu.payload.tcpRequestId ?? pdu.payload.httpRequestId
    if (!requestId || pdu.protocol !== 'TCP') return
    if (pdu.payload.tcpFlags === 'RST-ACK') {
      tcpOutstandingSegments = tcpOutstandingSegments.filter(segment => segment.requestId !== requestId)
      return
    }
    const senderId = pdu.payload.tcpSenderDeviceId
    const acknowledgment = pdu.payload.tcpAcknowledgmentNumber
    if (!senderId || !Number.isInteger(acknowledgment) || pdu.payload.tcpFlags === 'SYN') return
    tcpOutstandingSegments = tcpOutstandingSegments.filter(segment => {
      if (segment.requestId !== requestId || segment.ownerDeviceId === senderId) return true
      return !tcpAckCovers(acknowledgment!, tcpSegmentEnd(segment.pdu))
    })
  }
  const packetCarriesTcpSegment = (packet: InFlightPacket, segment: TcpOutstandingSegment) => {
    const candidates = [packet.pdu, packet.pdu.pendingPacket].filter((pdu): pdu is PacketPdu => Boolean(pdu))
    return candidates.some(pdu => tcpTransmissionKey(pdu) === segment.key)
  }
  const packetCarriesTcpAck = (packet: InFlightPacket, segment: TcpOutstandingSegment) => {
    const candidates = [packet.pdu, packet.pdu.pendingPacket].filter((pdu): pdu is PacketPdu => Boolean(pdu))
    const end = tcpSegmentEnd(segment.pdu)
    return candidates.some(pdu => pdu.protocol === 'TCP' && (pdu.payload.tcpRequestId ?? pdu.payload.httpRequestId) === segment.requestId &&
      pdu.payload.tcpSenderDeviceId !== segment.ownerDeviceId && pdu.payload.tcpAcknowledgmentNumber !== undefined &&
      pdu.payload.tcpFlags !== 'SYN' && tcpAckCovers(pdu.payload.tcpAcknowledgmentNumber, end))
  }
  const failDhcp = (pdu: PacketPdu, reason: string) => {
    const requestId = pdu.payload.dhcpRequestId
    const sourceDeviceId = pdu.payload.dhcpClientDeviceId
    if (!requestId || !sourceDeviceId || dhcpResults.some(result => result.requestId === requestId && result.status === 'successful')) return
    if (!dhcpResults.some(result => result.requestId === requestId && result.status === 'failed')) {
      dhcpResults.push({ requestId, sourceDeviceId, clientPortId: pdu.payload.dhcpClientPortId, phase: 'failed', status: 'failed', serverDeviceId: pdu.payload.dhcpServerDeviceId, reason })
    }
  }
  const drop = (packet: InFlightPacket, reason: string) => {
    discardedPackets++
    packetDeliveries.push({ packetId: packet.id, status: 'dropped', receiverDeviceId: packet.toDeviceId, reason })
    const hasTcpRequest = (candidate: PacketPdu | undefined) => Boolean(candidate && (candidate.payload.tcpRequestId || candidate.payload.httpRequestId))
    const pdu = hasTcpRequest(packet.pdu) ? packet.pdu : hasTcpRequest(packet.pdu.pendingPacket) ? packet.pdu.pendingPacket : undefined
    const requestId = pdu?.payload.tcpRequestId ?? pdu?.payload.httpRequestId
    if (pdu && requestId) {
      const retryableTcp = pdu.protocol === 'TCP' && tcpOutstandingSegments.some(segment => segment.requestId === requestId)
      if (retryableTcp) {
        tcpOutstandingSegments = tcpOutstandingSegments.map(segment => segment.requestId === requestId ? { ...segment, lastError: reason } : segment)
      } else {
        recordTcpFailure(pdu, reason)
      }
    }
    const dns = packet.pdu.protocol === 'DNS' ? packet.pdu : packet.pdu.pendingPacket?.protocol === 'DNS' ? packet.pdu.pendingPacket : undefined
    if (dns?.payload.dnsRequestId && dns.payload.dnsMessageType && !dnsResults.some(result => result.requestId === dns.payload.dnsRequestId)) {
      dnsResults.push({ requestId: dns.payload.dnsRequestId, sourceDeviceId: dns.payload.dnsSourceDeviceId ?? '', domain: dns.payload.dnsQuery ?? '', status: 'failed', reason })
    }
    const udp = packet.pdu.protocol === 'UDP' ? packet.pdu : packet.pdu.pendingPacket?.protocol === 'UDP' ? packet.pdu.pendingPacket : undefined
    if (udp?.payload.udpRequestId && !udpResults.some(result => result.requestId === udp.payload.udpRequestId)) {
      const service = udp.payload.udpService ?? 'echo'
      const serviceLabel = service === 'ntp' ? 'NTP' : service === 'tftp' ? 'TFTP' : service === 'snmp' ? 'SNMP' : 'UDP Echo'
      const responseBlocked = udp.payload.udpMessageType === 'response'
      udpResults.push({ requestId: udp.payload.udpRequestId, sourceDeviceId: udp.payload.udpSourceDeviceId ?? '', targetIp: responseBlocked ? udp.sourceIp : udp.destIp, port: responseBlocked ? udp.payload.udpSourcePort ?? 0 : udp.payload.udpDestinationPort ?? 0, service, fileName: udp.payload.tftpFileName, status: 'failed', reason: responseBlocked ? `${serviceLabel} response was blocked: ${reason}` : `No ${serviceLabel} response arrived: ${reason}` })
    }
    const dhcpCandidates=[packet.pdu,packet.pdu.pendingPacket].filter((pdu):pdu is PacketPdu=>Boolean(pdu))
    const dhcp=dhcpCandidates.find(pdu=>pdu.payload.dhcpRequestId&&(pdu.protocol==='DHCP'||pdu.payload.dhcpProbeIp))
    if(dhcp&&(['discover','request'].includes(dhcp.payload.dhcpType??'')||dhcp.payload.dhcpProbeIp))failDhcp(dhcp,`${byId.get(packet.toDeviceId)?.name??'Network'}: ${reason}`)
  }
  const receiveTcpData = (packet: InFlightPacket, kind: TcpReassemblyBuffer['kind'], chunk: string, retainComplete = false) => {
    const pdu = packet.pdu
    const requestId = pdu.payload.tcpRequestId ?? pdu.payload.httpRequestId
    const count = pdu.payload.tcpSegmentCount ?? 1
    const index = pdu.payload.tcpSegmentIndex ?? 0
    const offset = pdu.payload.tcpSegmentOffset ?? 0
    const byteLength = new TextEncoder().encode(chunk).byteLength
    if (!requestId || !Number.isInteger(count) || count < 1 || count > MAX_TCP_SEGMENTS || !Number.isInteger(index) || index < 0 || index >= count || !Number.isInteger(offset) || offset < 0 || pdu.payload.tcpDataLength !== byteLength || byteLength > TCP_MSS) {
      drop(packet, 'Invalid TCP segment metadata or payload length.')
      return undefined
    }
    const keyMatches = (buffer: TcpReassemblyBuffer) => buffer.requestId === requestId && buffer.kind === kind
    let buffer = tcpReceiveBuffers.find(keyMatches)
    if (!buffer) {
      buffer = {
        requestId, kind, expectedSegments: count,
        sequenceStart: ((pdu.payload.tcpSequenceNumber ?? 0) - offset) >>> 0,
        segments: {}, segmentLengths: {}, httpStatus: pdu.payload.httpStatus, ageTicks: 0,
      }
      tcpReceiveBuffers = [...tcpReceiveBuffers.slice(-(MAX_IN_FLIGHT_PACKETS - 1)), buffer]
    }
    const expectedSequenceStart = ((pdu.payload.tcpSequenceNumber ?? 0) - offset) >>> 0
    if (buffer.expectedSegments !== count || buffer.sequenceStart !== expectedSequenceStart) {
      drop(packet, 'TCP segment does not match the active stream sequence.')
      return undefined
    }
    const existingSegment = buffer.segments[index]
    if (existingSegment !== undefined && (existingSegment !== chunk || buffer.segmentLengths[index] !== byteLength)) {
      drop(packet, 'Duplicate TCP segment has conflicting data.')
      return undefined
    }
    buffer.segments[index] = chunk
    buffer.segmentLengths[index] = byteLength
    buffer.httpStatus ??= pdu.payload.httpStatus
    buffer.ageTicks = 0
    let contiguousBytes = 0
    for (let segmentIndex = 0; segmentIndex < count && buffer.segments[segmentIndex] !== undefined; segmentIndex++) {
      contiguousBytes += buffer.segmentLengths[segmentIndex] ?? 0
    }
    const complete = Array.from({ length: count }, (_, segmentIndex) => buffer!.segments[segmentIndex] !== undefined).every(Boolean)
    const data = complete ? Array.from({ length: count }, (_, segmentIndex) => buffer!.segments[segmentIndex]).join('') : undefined
    const totalBytes = complete ? Object.values(buffer.segmentLengths).reduce((total, length) => total + length, 0) : undefined
    const sequenceStart = buffer.sequenceStart
    const httpStatus = buffer.httpStatus
    if (complete && !retainComplete) tcpReceiveBuffers = tcpReceiveBuffers.filter(candidate => !keyMatches(candidate))
    return { complete, data, totalBytes, acknowledgment: (sequenceStart + contiguousBytes) >>> 0, httpStatus }
  }
  const enqueue = (packet: InFlightPacket) => {
    if (remaining.length >= packetQueueLimit) { queueLimitReached = true; drop(packet, 'Simulation packet queue is full.'); return }
    remaining.push(packet)
  }
  const sendControl = (intent: OspfOutbound | RipOutbound | EigrpOutbound) => {
    const d = byId.get(intent.deviceId)!, logical = d.ports.find(p => p.id === intent.portId)!
    if (logical.outboundAcl) {
      const acl = d.config.accessLists?.find(a => a.id === logical.outboundAcl)
      if (acl && evaluateAcl(acl, { sourceIp: intent.pdu.sourceIp, destIp: intent.pdu.destIp, protocol: intent.pdu.protocol }).action === 'deny') return
    }
    if (logical.isGreTunnel) {
      if (!logical.greDestinationIp || !isUp(d, logical)) return
      ipFrames(d, { port: logical, nextHop: logical.greDestinationIp }, intent.pdu, updatedDevices, links, 0).forEach(enqueue)
      return
    }
    const vlan = logical.dot1qVlan ?? logical.virtualVlan
    const physical = logical.parentPortId ? d.ports.filter(p => p.id === logical.parentPortId) : logical.virtualVlan !== undefined ? d.ports.filter(p => p.virtualVlan === undefined && !p.parentPortId && carriesVlan(p, vlan!)) : [logical]
    for (const p of physical) for (const link of linksByPort.get(`${d.id}|${p.id}`) ?? []) {
      if (!liveLinks.has(link.id) || !isUp(d, p) || logical.virtualVlan !== undefined && !forwardingLinks(vlan!).has(link.id)) continue
      enqueue(onWire(d, p, link, intent.pdu, 0, logical.parentPortId ? (logical.dot1qNative ? undefined : vlan) : egressVlan(p, vlan)))
    }
  }
  control.outbound.forEach(sendControl)
  for(const intent of stpControl.outbound){
    const device=byId.get(intent.deviceId),port=device?.ports.find(candidate=>candidate.id===intent.portId),link=linksById.get(intent.linkId)
    if(device&&port&&link&&liveLinks.has(link.id))enqueue(onWire(device,port,link,intent.pdu,0,intent.vlan))
  }
  const sendCapwap = (intent: CapwapIntent) => {
    const device = byId.get(intent.deviceId), port = device?.ports.find(candidate => candidate.id === intent.portId)
    if (!device || !port || !isUp(device, port)) return
    const vlan = port.vlan ?? 1
    for (const link of linksByPort.get(`${device.id}|${port.id}`) ?? []) {
      if (!liveLinks.has(link.id) || !forwardingLinks(vlan).has(link.id)) continue
      enqueue(onWire(device, port, link, intent.pdu, 0))
    }
  }
  for (const intent of capwapControl.outbound) sendCapwap(intent)
  const sendIot = (intent: IotIntent) => {
    const device = byId.get(intent.deviceId)
    if (!device) return
    const port = device.ports.find(candidate => candidate.id === intent.portId)
    if (!port || !isUp(device, port)) return
    if (intent.broadcast) {
      dhcpBroadcastFrames(device, port, intent.pdu, updatedDevices, links).forEach(enqueue)
      return
    }
    const route = outgoingRoute(device, intent.targetIp)
    if (!route || !route.port.ipAddress) return
    ipFrames(device, route, { ...intent.pdu, sourceMac: route.port.macAddress, sourceIp: route.port.ipAddress }, updatedDevices, links, 0).forEach(enqueue)
  }
  iotControl.outbound.forEach(sendIot)
  const sendBgp = (intent: BgpOutbound) => {
    const device = byId.get(intent.deviceId)
    if (!device) return
    const route = outgoingRoute(device, intent.pdu.destIp)
    if (!route || !route.port.ipAddress) return
    ipFrames(device, route, { ...intent.pdu, sourceMac: route.port.macAddress, sourceIp: route.port.ipAddress }, updatedDevices, links, 0).forEach(enqueue)
  }
  bgpControl.outbound.forEach(sendBgp)
  const learnArp = (device: NetworkDevice, port: NetworkPort, ip: string, mac: string) => {
    const existing = device.arpTable.find(a => a.ipAddress === ip && a.interfaceName === port.name)
    if (existing?.macAddress === mac) return
    const edited = editDevice(device.id)
    edited.arpTable = [...edited.arpTable.filter(a => !(a.ipAddress === ip && a.interfaceName === port.name)).slice(-255), { ipAddress: ip, macAddress: mac, interfaceName: port.name, age: 0 }]
  }
  const sendIp = (device: NetworkDevice, pdu: PacketPdu, hops: number, incoming: InFlightPacket): boolean => {
    trackTcpTransmission(pdu)
    // A GRE packet is already an outer underlay packet. If it was queued behind
    // ARP, resolve it over a physical route instead of recursively selecting
    // the overlay tunnel that originally produced it.
    const route = outgoingRoute(device, pdu.destIp, pdu.protocol === 'GRE')
    if (!route) { drop(incoming, `No route to ${pdu.destIp}.`); return false }
    if (route.port.outboundAcl) {
      const acl = device.config.accessLists?.find((a) => a.id === route.port.outboundAcl)
      if (acl) {
        const evalResult = evaluateAcl(acl, {
          sourceIp: pdu.sourceIp,
          destIp: pdu.destIp,
          protocol: pdu.protocol,
          port: pdu.payload.tcpDestinationPort ?? pdu.payload.udpDestinationPort,
        })
        if (evalResult.action === 'deny') {
          const transportPort = pdu.payload.tcpDestinationPort ?? pdu.payload.udpDestinationPort
          const flow = `${pdu.protocol} ${pdu.sourceIp} -> ${pdu.destIp}${transportPort === undefined ? '' : `:${transportPort}`}`
          drop(incoming, `Packet filtered by outbound ACL ${route.port.outboundAcl} on ${route.port.name} for ${flow}: ${evalResult.reason}`)
          return false
        }
      }
    }
    if (route.port.isGreTunnel && !outgoingRoute(device, route.port.greDestinationIp ?? '', true)) {
      drop(incoming, `GRE tunnel ${route.port.name} has no physical underlay route to ${route.port.greDestinationIp ?? 'its configured endpoint'}.`)
      return false
    }
    const frames=ipFrames(byId.get(device.id)!,route,pdu,updatedDevices,links,hops)
    if(!frames.length){drop(incoming,'Outgoing link is down or its VLAN is blocked.');return false}
    frames.forEach(enqueue)
    return true
  }
  const learnIpv6Neighbor = (device: NetworkDevice, port: NetworkPort, address: string, mac: string) => {
    const existing = (device.ipv6NeighborTable ?? []).find(entry => entry.address === address && entry.interfaceName === port.name)
    if (existing?.macAddress === mac) return
    const edited = editDevice(device.id)
    edited.ipv6NeighborTable = [...(edited.ipv6NeighborTable ?? []).filter(entry => !(entry.address === address && entry.interfaceName === port.name)).slice(-255), { address, macAddress: mac, interfaceName: port.name, age: 0 }]
  }
  const sendIpv6 = (device: NetworkDevice, pdu: PacketPdu, hops: number, incoming: InFlightPacket): boolean => {
    const live = byId.get(device.id)!
    const route = outgoingIpv6Route(live, pdu.destIp)
    if (!route) { drop(incoming, `No IPv6 route to ${pdu.destIp}.`); return false }
    const frames = ipv6Frames(live, route, pdu, updatedDevices, links, hops)
    if (!frames.length) { drop(incoming, 'Outgoing link is down or its VLAN is blocked.'); return false }
    frames.forEach(enqueue)
    return true
  }
  const handleIpv6Frame = (receiver: NetworkDevice, packet: InFlightPacket, link: NetworkLink, receivingPort: NetworkPort, vlan: number): void => {
    const pdu = packet.pdu
    const hops = (packet.hops ?? 0) + 1
    const multicastDestination = pdu.destMac === BROADCAST || pdu.destMac.toLowerCase().startsWith('33:33')
    if (!multicastDestination && pdu.destMac.toLowerCase() !== receivingPort.macAddress.toLowerCase()) { drop(packet, 'IPv6 frame is addressed to another interface.'); return }
    if (pdu.payload.icmpv6Type === 'neighbor-solicitation' && pdu.payload.ndpTargetAddress) {
      const targetAddress = pdu.payload.ndpTargetAddress
      if (!isUp(receiver, receivingPort) || !ipv6PortOwnsAddress(receivingPort, targetAddress)) {
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} received a neighbor solicitation for ${targetAddress} that is not assigned to ${receivingPort.name} and ignored it.` })
        return
      }
      learnIpv6Neighbor(receiver, receivingPort, pdu.sourceIp, pdu.sourceMac)
      const advertisement: PacketPdu = {
        ...pdu, id: packetId('ndp-advertisement'), summary: `ICMPv6: Neighbor Advertisement ${targetAddress} is at ${receivingPort.macAddress}`,
        sourceMac: receivingPort.macAddress, destMac: pdu.sourceMac, sourceIp: targetAddress, destIp: pdu.sourceIp, ttl: 255,
        payload: { ...pdu.payload, icmpv6Type: 'neighbor-advertisement', ndpTargetAddress: targetAddress },
        explanation: { ...pdu.explanation, layer2: `Unicast neighbor advertisement: ${receivingPort.macAddress} to ${pdu.sourceMac}.`, layer3: `ICMPv6: ${targetAddress} is at ${receivingPort.macAddress}.`, deviceDecision: `${receiver.name} owns ${targetAddress} and answers the neighbor solicitation.` },
      }
      enqueue(onWire(receiver, receivingPort, link, advertisement, 0, egressVlan(receivingPort, vlan)))
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} answered the neighbor solicitation for ${targetAddress}.` })
      return
    }
    if (pdu.payload.icmpv6Type === 'neighbor-advertisement' && pdu.payload.ndpTargetAddress) {
      learnIpv6Neighbor(receiver, receivingPort, pdu.payload.ndpTargetAddress, pdu.sourceMac)
      if (pdu.pendingPacket) {
        const pending = { ...pdu.pendingPacket, pingId: pdu.pingId ?? pdu.pendingPacket.pingId }
        if (!sendIpv6(receiver, pending, hops, packet)) return
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} resolved ${pdu.payload.ndpTargetAddress} and sent the pending packet.` })
        return
      }
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} learned the IPv6 neighbor ${pdu.payload.ndpTargetAddress}.` })
      return
    }
    if (pdu.payload.icmpv6Type === 'router-solicitation') {
      const solicitedRoutingEnabled = receiver.config.ipv6Routing === true || (receiver.type === 'router' && receiver.config.ipv6Routing !== false)
      if (!solicitedRoutingEnabled || !isUp(receiver, receivingPort)) {
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} is not an IPv6 router and ignored the router solicitation.` })
        return
      }
      learnIpv6Neighbor(receiver, receivingPort, pdu.sourceIp, pdu.sourceMac)
      const linkLocal = ipv6LinkLocalFromMac(receivingPort.macAddress)
      if (!linkLocal) { drop(packet, 'Router solicitation could not be answered: no link-local address for this interface.'); return }
      const prefixes = (receivingPort.ipv6Addresses ?? [])
        .filter(address => address.prefixLength === 64 && isValidIpv6(address.address) && !isIpv6LinkLocal(address.address) && !isIpv6Multicast(address.address))
        .map(address => ({ prefix: address.address, prefixLength: address.prefixLength }))
      const advertisement: PacketPdu = {
        ...pdu, id: packetId('ra'), summary: `ICMPv6: Router Advertisement from ${linkLocal}`,
        sourceMac: receivingPort.macAddress, destMac: '33:33:00:00:00:01', sourceIp: linkLocal, destIp: 'ff02::1', ttl: 255, pendingPacket: undefined,
        payload: { icmpv6Type: 'router-advertisement', ndpPrefixes: prefixes, ndpManagedFlag: receivingPort.ipv6NdManagedConfig === true, ndpOtherFlag: receivingPort.ipv6NdOtherConfig === true, ndpRouterLifetime: 1800 },
        explanation: {
          ...pdu.explanation,
          layer2: `Ethernet II: ${receivingPort.macAddress} to multicast 33:33:00:00:00:01.`,
          layer3: `ICMPv6 Router Advertisement from ${linkLocal} to ff02::1${prefixes.length ? ` advertising ${prefixes.map(prefix => `${prefix.prefix}/${prefix.prefixLength}`).join(', ')}` : ''}.`,
          layer4AndAbove: 'N/A (IPv6 router discovery)',
          deviceDecision: `${receiver.name} answers the router solicitation on ${receivingPort.name}.`,
        },
      }
      enqueue(onWire(receiver, receivingPort, link, advertisement, 0, egressVlan(receivingPort, vlan)))
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} answered the router solicitation with an advertisement.` })
      return
    }
    if (pdu.payload.icmpv6Type === 'router-advertisement') {
      const watchesAutoconfig = receivingPort.ipv6Autoconfig === true
      const watchesDhcpv6 = receivingPort.ipv6Dhcp === true
      if (!watchesAutoconfig && !watchesDhcpv6) {
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} ignored the router advertisement: auto-configuration is disabled on ${receivingPort.name}.` })
        return
      }
      learnIpv6Neighbor(receiver, receivingPort, pdu.sourceIp, pdu.sourceMac)
      const edited = editDevice(receiver.id)
      edited.config = { ...edited.config, ipv6DefaultGateway: pdu.sourceIp }
      if (watchesAutoconfig) {
        const interfaceId = ipv6InterfaceIdFromMac(receivingPort.macAddress)
        const formed: NonNullable<NetworkPort['ipv6Addresses']> = []
        for (const advertised of pdu.payload.ndpPrefixes ?? []) {
          if (advertised.prefixLength !== 64 || !interfaceId) continue
          const address = ipv6AddressFromPrefixAndInterfaceId(advertised.prefix, interfaceId)
          if (address && !formed.some(entry => entry.address === address)) formed.push({ address, prefixLength: 64, source: 'slaac' })
        }
        if (formed.length) {
          const current = edited.ports.find(port => port.id === receivingPort.id)?.ipv6Addresses ?? []
          const kept = current.filter(address => address.source !== 'slaac' && !formed.some(entry => entry.address === address.address))
          edited.ports = edited.ports.map(port => port.id === receivingPort.id ? { ...port, ipv6Addresses: [...kept, ...formed] } : port)
        }
      }
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} processed the router advertisement from ${pdu.sourceIp} (gateway${watchesAutoconfig ? ' and SLAAC prefixes' : ''}).` })
      return
    }
    if (pdu.payload.dhcpv6Type) {
      if (pdu.payload.dhcpv6Type === 'solicit') {
        const pool = dhcpv6PoolFor(receiver, receivingPort)
        if (!pool || !isUp(receiver, receivingPort)) {
          packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} has no DHCPv6 service on ${receivingPort.name} and ignored the solicit.` })
          return
        }
        const linkLocal = ipv6LinkLocalFromMac(receivingPort.macAddress)
        if (!linkLocal) { drop(packet, 'DHCPv6 solicit could not be answered: no link-local address for this interface.'); return }
        const offered = ipv6AllocatePoolAddress(pool, receiver)
        if (!offered) { drop(packet, `${receiver.name} has no free address in DHCPv6 pool ${pool.name}.`); return }
        learnIpv6Neighbor(receiver, receivingPort, pdu.sourceIp, pdu.sourceMac)
        const advertise: PacketPdu = {
          ...pdu, id: packetId('dhcpv6-advertise'), summary: `DHCPv6: Advertise ${offered} from ${receiver.name}`,
          sourceMac: receivingPort.macAddress, destMac: pdu.sourceMac, sourceIp: linkLocal, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
          payload: { ...pdu.payload, dhcpv6Type: 'advertise', dhcpv6ServerDeviceId: receiver.id, dhcpv6ServerPortId: receivingPort.id, dhcpv6OfferedAddress: offered, dhcpv6PrefixLength: pool.prefixLength, udpSourcePort: 547, udpDestinationPort: 546 },
          explanation: {
            ...pdu.explanation,
            layer2: `Unicast DHCPv6 Advertise: ${receivingPort.macAddress} to ${pdu.sourceMac}.`,
            layer3: `IPv6: ${linkLocal} to ${pdu.sourceIp}.`,
            layer4AndAbove: `UDP: server port 547 to client port 546. DHCPv6 Advertise offering ${offered}.`,
            deviceDecision: `${receiver.name} offers ${offered} from pool ${pool.name}.`,
          },
        }
        enqueue(onWire(receiver, receivingPort, link, advertise, 0, egressVlan(receivingPort, vlan)))
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} offered ${offered} to ${pdu.sourceIp}.` })
        return
      }
      if (pdu.payload.dhcpv6Type === 'advertise' && pdu.payload.dhcpv6ClientDeviceId === receiver.id) {
        learnIpv6Neighbor(receiver, receivingPort, pdu.sourceIp, pdu.sourceMac)
        const request: PacketPdu = {
          ...pdu, id: packetId('dhcpv6-request'), summary: `DHCPv6: Request ${pdu.payload.dhcpv6OfferedAddress} from ${receiver.name}`,
          sourceMac: receivingPort.macAddress, destMac: pdu.sourceMac, sourceIp: pdu.destIp, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
          payload: { ...pdu.payload, dhcpv6Type: 'request', dhcpv6ClientDeviceId: receiver.id, dhcpv6ClientPortId: receivingPort.id, udpSourcePort: 546, udpDestinationPort: 547 },
          explanation: {
            ...pdu.explanation,
            layer2: `Unicast DHCPv6 Request: ${receivingPort.macAddress} to ${pdu.sourceMac}.`,
            layer3: `IPv6: ${pdu.destIp} to ${pdu.sourceIp}.`,
            layer4AndAbove: `UDP: client port 546 to server port 547. DHCPv6 Request for ${pdu.payload.dhcpv6OfferedAddress ?? 'the offered address'}.`,
            deviceDecision: `${receiver.name} requests ${pdu.payload.dhcpv6OfferedAddress ?? 'the offered address'} from the server.`,
          },
        }
        enqueue(onWire(receiver, receivingPort, link, request, 0, egressVlan(receivingPort, vlan)))
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} requested the offered DHCPv6 address.` })
        return
      }
      if (pdu.payload.dhcpv6Type === 'request') {
        const pool = dhcpv6PoolFor(receiver, receivingPort)
        if (!pool || !isUp(receiver, receivingPort)) {
          packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} has no DHCPv6 service on ${receivingPort.name} and ignored the request.` })
          return
        }
        const clientId = pdu.payload.dhcpv6ClientDeviceId
        if (!clientId) { drop(packet, 'Malformed DHCPv6 request: no client identifier.'); return }
        const existingBinding = (receiver.config.dhcpv6Bindings ?? []).find(binding => binding.clientDeviceId === clientId)?.address
        const assigned = existingBinding ?? ipv6AllocatePoolAddress(pool, receiver, pdu.payload.dhcpv6OfferedAddress)
        if (!assigned) { drop(packet, `${receiver.name} has no free address in DHCPv6 pool ${pool.name}.`); return }
        const editedServer = editDevice(receiver.id)
        editedServer.config = { ...editedServer.config, dhcpv6Bindings: [...(editedServer.config.dhcpv6Bindings ?? []).filter(binding => binding.clientDeviceId !== clientId), { address: assigned, clientDeviceId: clientId, clientMac: pdu.sourceMac, acquiredAtMs: Date.now() }] }
        learnIpv6Neighbor(receiver, receivingPort, pdu.sourceIp, pdu.sourceMac)
        const linkLocal = ipv6LinkLocalFromMac(receivingPort.macAddress)
        if (!linkLocal) { drop(packet, 'DHCPv6 request could not be answered: no link-local address for this interface.'); return }
        const reply: PacketPdu = {
          ...pdu, id: packetId('dhcpv6-reply'), summary: `DHCPv6: Reply ${assigned} from ${receiver.name}`,
          sourceMac: receivingPort.macAddress, destMac: pdu.sourceMac, sourceIp: linkLocal, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
          payload: { ...pdu.payload, dhcpv6Type: 'reply', dhcpv6ServerDeviceId: receiver.id, dhcpv6ServerPortId: receivingPort.id, dhcpv6AssignedAddress: assigned, dhcpv6PrefixLength: pool.prefixLength, udpSourcePort: 547, udpDestinationPort: 546 },
          explanation: {
            ...pdu.explanation,
            layer2: `Unicast DHCPv6 Reply: ${receivingPort.macAddress} to ${pdu.sourceMac}.`,
            layer3: `IPv6: ${linkLocal} to ${pdu.sourceIp}.`,
            layer4AndAbove: `UDP: server port 547 to client port 546. DHCPv6 Reply assigning ${assigned}.`,
            deviceDecision: `${receiver.name} binds ${assigned} to the client.`,
          },
        }
        enqueue(onWire(receiver, receivingPort, link, reply, 0, egressVlan(receivingPort, vlan)))
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} assigned ${assigned} to the requesting client.` })
        return
      }
      if (pdu.payload.dhcpv6Type === 'reply' && pdu.payload.dhcpv6ClientDeviceId === receiver.id) {
        const assigned = pdu.payload.dhcpv6AssignedAddress
        const prefixLength = pdu.payload.dhcpv6PrefixLength ?? 64
        if (!assigned || !isValidIpv6(assigned)) { drop(packet, 'DHCPv6 reply carried no usable address.'); return }
        learnIpv6Neighbor(receiver, receivingPort, pdu.sourceIp, pdu.sourceMac)
        const edited = editDevice(receiver.id)
        edited.ports = edited.ports.map(port => port.id === receivingPort.id ? { ...port, ipv6Addresses: [...(port.ipv6Addresses ?? []).filter(address => address.source !== 'dhcpv6'), { address: assigned, prefixLength, source: 'dhcpv6' as const }] } : port)
        edited.config = { ...edited.config, dhcpv6Lease: { serverId: pdu.payload.dhcpv6ServerDeviceId ?? '', address: assigned, prefixLength } }
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} configured ${assigned}/${prefixLength} from the DHCPv6 reply.` })
        return
      }
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} received a DHCPv6 ${pdu.payload.dhcpv6Type} that does not apply to it and ignored it.` })
      return
    }
    const ownsDestination = isUp(receiver, receivingPort) && ipv6PortOwnsAddress(receivingPort, pdu.destIp)
    if (pdu.payload.icmpv6Type === 'echo-request' && ownsDestination) {
      const reply: PacketPdu = {
        ...pdu, id: packetId('icmpv6-reply'), summary: `ICMPv6: Echo Reply from ${pdu.destIp}, seq=${pdu.payload.icmpSeq ?? 1}`,
        sourceMac: receivingPort.macAddress, destMac: pdu.sourceMac, sourceIp: pdu.destIp, destIp: pdu.sourceIp, ttl: 64,
        pendingPacket: undefined,
        payload: { icmpv6Type: 'echo-reply', icmpSeq: pdu.payload.icmpSeq, icmpIdentifier: pdu.payload.icmpIdentifier },
        explanation: { ...pdu.explanation, layer2: `Ethernet II: ${receivingPort.macAddress} to ${pdu.sourceMac}.`, layer3: `IPv6: ${pdu.destIp} to ${pdu.sourceIp}, Hop Limit 64.`, layer4AndAbove: `ICMPv6: Type 129 (Echo Reply), Seq ${pdu.payload.icmpSeq ?? 1}.`, deviceDecision: `${receiver.name} received its IPv6 ping and returns one echo reply.` },
      }
      if ((receivingPort.ipv6Addresses ?? []).some(address => isInSameIpv6Subnet(pdu.sourceIp, address.address, address.prefixLength))) learnIpv6Neighbor(receiver, receivingPort, pdu.sourceIp, pdu.sourceMac)
      if (!sendIpv6(receiver, reply, hops, packet)) return
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} received an IPv6 echo request and replied.` })
      return
    }
    if (pdu.payload.icmpv6Type === 'echo-reply' && ownsDestination) {
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} received an IPv6 echo reply from ${pdu.sourceIp}.` })
      return
    }
    const routingEnabled = receiver.config.ipv6Routing === true || (receiver.type === 'router' && receiver.config.ipv6Routing !== false)
    if (routingEnabled) {
      if (pdu.ttl <= 1) { drop(packet, 'IPv6 hop limit expired.'); return }
      if (!sendIpv6(receiver, { ...pdu, ttl: pdu.ttl - 1 }, hops, packet)) return
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} routed the IPv6 packet toward ${pdu.destIp}.` })
      return
    }
    drop(packet, `${receiver.name} has no IPv6 route to ${pdu.destIp}.`)
  }
  const sendGreKeepalive = (device: NetworkDevice, tunnel: NetworkPort, type: 'request' | 'reply', sequence: number, tunnelName = tunnel.name): boolean => {
    const source = device.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === tunnel.greSourceInterface || candidate.shortName === tunnel.greSourceInterface || candidate.id === tunnel.greSourceInterface))
    const sourceIp = source?.ipAddress
    const destinationIp = tunnel.greDestinationIp
    if (device.type !== 'router' || !sourceIp || !destinationIp || !isValidIpv4(destinationIp)) return false
    const route = outgoingRoute(device, destinationIp, true)
    if (!route) return false
    if (route.port.outboundAcl) {
      const acl = device.config.accessLists?.find(entry => entry.id === route.port.outboundAcl)
      if (acl && evaluateAcl(acl, { sourceIp, destIp: destinationIp, protocol: 'GRE' }).action === 'deny') return false
    }
    const pdu: PacketPdu = {
      id: packetId('gre-keepalive'), protocol: 'GRE',
      summary: `GRE Keepalive: ${type} ${sequence} ${sourceIp} to ${destinationIp} via ${tunnelName}`,
      sourceMac: route.port.macAddress, destMac: '00:00:00:00:00:00', etherType: '0x0800',
      sourceIp, destIp: destinationIp, ttl: 64,
      payload: { greKeepaliveType: type, greKeepaliveTunnel: tunnelName, greKeepaliveSequence: sequence },
      explanation: {
        layer1: `Underlay interface: ${route.port.name}.`,
        layer2: `GRE keepalive uses the ordinary underlay route through ${route.port.name}.`,
        layer3: `Outer IPv4: ${sourceIp} to ${destinationIp}, protocol GRE (47), TTL 64.`,
        layer4AndAbove: `GRE keepalive ${type}, sequence ${sequence}; the peer returns the probe to verify the path.`,
        deviceDecision: `${device.name} sends a GRE keepalive ${type} for ${tunnelName}.`,
      },
    }
    const frames = ipFrames(device, route, pdu, updatedDevices, links, 0)
    if (!frames.length) return false
    frames.forEach(enqueue)
    return true
  }
  for (const original of updatedDevices) {
    for (const originalTunnel of original.ports) {
      if (!originalTunnel.isGreTunnel || !originalTunnel.greKeepalivePeriodSeconds) continue
      const source = original.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === originalTunnel.greSourceInterface || candidate.shortName === originalTunnel.greSourceInterface || candidate.id === originalTunnel.greSourceInterface))
      if (original.power === false || originalTunnel.adminStatus !== 'up' || !source?.ipAddress || !isUp(original, source)) continue
      const device = editDevice(original.id)
      const tunnel = device.ports.find(port => port.id === originalTunnel.id)!
      const periodSeconds = tunnel.greKeepalivePeriodSeconds
      if (!periodSeconds) continue
      const elapsed = (tunnel.greKeepaliveElapsedMs ?? 0) + 60
      const intervalMs = periodSeconds * 1000
      if (elapsed < intervalMs) {
        tunnel.greKeepaliveElapsedMs = elapsed
        continue
      }
      tunnel.greKeepaliveElapsedMs = elapsed % intervalMs
      tunnel.greKeepaliveMissed = (tunnel.greKeepaliveMissed ?? 0) + 1
      tunnel.greKeepaliveSequence = (tunnel.greKeepaliveSequence ?? 0) + 1
      if (tunnel.greKeepaliveMissed >= (tunnel.greKeepaliveRetries ?? 3)) tunnel.greKeepaliveOperational = false
      sendGreKeepalive(device, tunnel, 'request', tunnel.greKeepaliveSequence)
    }
  }
  const recordDhcpPhase = (pdu: PacketPdu, phase: DhcpTransactionResult['phase'], status: DhcpTransactionResult['status'], reason?: string): void => {
    const requestId = pdu.payload.dhcpRequestId
    const sourceDeviceId = pdu.payload.dhcpClientDeviceId
    if (!requestId || !sourceDeviceId || dhcpResults.some(result => result.requestId === requestId && result.status === 'successful')) return
    if (status === 'failed' && dhcpResults.some(result => result.requestId === requestId && result.status === 'failed')) return
    dhcpResults.push({
      requestId, sourceDeviceId, clientPortId: pdu.payload.dhcpClientPortId, phase, status,
      serverDeviceId: pdu.payload.dhcpServerDeviceId, assignedIp: pdu.payload.assignedIp,
      subnetMask: pdu.payload.dhcpSubnetMask, gateway: pdu.payload.dhcpGateway,
      dnsServer: pdu.payload.dhcpDnsServer, leaseDurationSeconds:pdu.payload.dhcpLeaseDurationSeconds,
      renewalPhase:pdu.payload.dhcpRenewalPhase, reason,
    })
  }
  const sendDhcpBroadcast = (device: NetworkDevice, port: NetworkPort, pdu: PacketPdu): boolean => {
    const frames = dhcpBroadcastFrames(device, port, pdu, updatedDevices, links)
    if (!frames.length) return false
    frames.forEach(enqueue)
    return true
  }
  const sendDhcpServerResponse = (device: NetworkDevice, base: PacketPdu, receiving: InFlightPacket, responseType: 'offer' | 'ack' | 'nak', lease?: NonNullable<ReturnType<typeof allocateDhcpLease>['lease']>): boolean => {
    const clientId = base.payload.dhcpClientDeviceId
    const serverPort = lease
      ? device.ports.find(port => isUp(device, port) && port.ipAddress && isInSameSubnet(port.ipAddress, lease.ipAddress, lease.mask))
      : undefined
    const localPort = serverPort ?? device.ports.find(port => isUp(device, port) && port.ipAddress && port.connectedLinkId)
    if (!clientId || !localPort) {
      failDhcp(base, `${device.name} cannot reply to DHCP because it has no active IPv4 interface.`)
      return false
    }
    const relayAddress = base.payload.dhcpRelayAgentIp
    const response: PacketPdu = {
      ...base, id: packetId(`dhcp-${responseType}`), protocol: 'DHCP',
      summary: responseType === 'nak' ? `DHCP NAK from ${device.name}` : `DHCP ${responseType.toUpperCase()}: ${lease?.ipAddress} for ${clientId}`,
      sourceMac: localPort.macAddress, destMac: relayAddress ? '00:00:00:00:00:00' : BROADCAST,
      sourceIp: localPort.ipAddress ?? '0.0.0.0', destIp: relayAddress ?? '255.255.255.255', ttl: 64, pendingPacket: undefined,
      payload: {
        ...base.payload, dhcpType: responseType, dhcpServerDeviceId: device.id,
        assignedIp: lease?.ipAddress, dhcpSubnetMask: lease?.mask,
        dhcpGateway: lease?.gateway, dhcpDnsServer: lease?.dns,dhcpLeaseDurationSeconds:lease?.leaseDurationSeconds,
        udpSourcePort: 67, udpDestinationPort: 68,
      },
      explanation: {
        ...base.explanation,
        layer2: relayAddress ? `DHCP server reply from ${localPort.macAddress} to relay ${relayAddress}.` : `DHCP server reply is broadcast to ${BROADCAST}.`,
        layer3: `IPv4: ${localPort.ipAddress ?? '0.0.0.0'} to ${relayAddress ?? '255.255.255.255'}, TTL 64.`,
        layer4AndAbove: `UDP: server port 67 to client port 68. DHCP ${responseType.toUpperCase()}${lease ? ` offers ${lease.ipAddress}/${lease.mask}` : ''}.`,
        deviceDecision: `${device.name} ${responseType === 'offer' ? 'offers' : responseType === 'ack' ? 'acknowledges' : 'declines'} the DHCP request.`,
      },
    }
    if (relayAddress) return sendIp(byId.get(device.id)!, response, 0, receiving)
    return sendDhcpBroadcast(device, localPort, response)
  }
  const relayDhcpRequest = (device: NetworkDevice, logicalPort: NetworkPort, pdu: PacketPdu, incoming: InFlightPacket): boolean => {
    const helperAddress = logicalPort.helperAddress
    if (!helperAddress || !isValidIpv4(helperAddress)) {
      failDhcp(pdu, `${device.name} received DHCP ${pdu.payload.dhcpType} on ${logicalPort.name}, but no valid ip helper-address or matching local DHCP pool is configured.`)
      return false
    }
    if (!logicalPort.ipAddress || device.config.ipRouting === false) {
      failDhcp(pdu, `${device.name} cannot relay DHCP on ${logicalPort.name}: the interface needs an IPv4 address and IP routing must be enabled.`)
      return false
    }
    const target: PacketPdu = {
      ...pdu, id: packetId(`dhcp-relay-${pdu.payload.dhcpType}`),
      summary: `DHCP Relay: ${pdu.payload.dhcpType} via ${device.name} to ${helperAddress}`,
      sourceMac: logicalPort.macAddress, destMac: '00:00:00:00:00:00',
      sourceIp: logicalPort.ipAddress, destIp: helperAddress, ttl: 64,
      payload: { ...pdu.payload, dhcpRelayAgentIp: logicalPort.ipAddress, dhcpRelayDeviceId: device.id, dhcpRelayPortId: logicalPort.id },
      explanation: {
        ...pdu.explanation,
        layer2: `DHCP relay receives the client broadcast on ${logicalPort.name}.`,
        layer3: `Relay agent ${logicalPort.ipAddress} forwards the request to DHCP server ${helperAddress}.`,
        layer4AndAbove: `UDP: relay port 67 to server port 67. DHCP ${pdu.payload.dhcpType?.toUpperCase()}.`,
        deviceDecision: `${device.name} relays the DHCP ${pdu.payload.dhcpType} to ${helperAddress} using ip helper-address.`,
      },
    }
    return sendIp(byId.get(device.id)!, target, 0, incoming)
  }

  const learnWirelessClient = (ap: NetworkDevice, macAddress: string, link: NetworkLink) => {
    const wirelessPort = apWirelessPort(ap)
    if (!wirelessPort) return
    const edited = editDevice(ap.id)
    edited.macTable = [...edited.macTable.filter(entry => entry.macAddress.toLowerCase() !== macAddress.toLowerCase()).slice(-1023), { macAddress, portId: wirelessPort.shortName, linkId: link.id, vlan: 1, age: 0, lastSeenTick: simulationTick }]
  }
  const deliverInnerToWireless = (ap: NetworkDevice, inner: PacketPdu, tunnelHops: number) => {
    const wirelessPort = apWirelessPort(ap)
    if (!wirelessPort) return
    const clientLink = clientLinkFor(updatedDevices, links, ap, inner.sourceMac)
    const edited = editDevice(ap.id)
    edited.macTable = [...edited.macTable.filter(entry => entry.macAddress.toLowerCase() !== inner.sourceMac.toLowerCase()).slice(-1023), { macAddress: inner.sourceMac, portId: wirelessPort.shortName, linkId: clientLink?.id, vlan: 1, age: 0, lastSeenTick: simulationTick }]
    const lower = inner.destMac.toLowerCase()
    const group = lower === BROADCAST || lower.startsWith('01:') || lower.startsWith('33:33')
    const known = group ? undefined : edited.macTable.find(entry => entry.macAddress.toLowerCase() === lower)
    for (const outLink of linksByPort.get(`${ap.id}|${wirelessPort.id}`) ?? []) {
      if (!liveLinks.has(outLink.id)) continue
      if (!group && known?.linkId && outLink.id !== known.linkId) continue
      enqueue(onWire(ap, wirelessPort, outLink, inner, tunnelHops))
    }
  }
  const tunnelInnerToAp = (wlc: NetworkDevice, entry: WlcApEntry, inner: PacketPdu, tunnelHops: number, apName: string): boolean => {
    const port = wlc.ports.find(candidate => candidate.id === entry.portId)
    const outLink = linksById.get(entry.linkId)
    if (!port || !outLink || !liveLinks.has(outLink.id) || !isUp(wlc, port)) return false
    enqueue(onWire(wlc, port, outLink, capwapDataPdu(wlc, port, entry.apMac, inner, apName, entry.apId, apName, wlc.id), tunnelHops))
    return true
  }
  const wlcForwardInner = (wlc: NetworkDevice, inner: PacketPdu, apId: string, tunnelHops: number): number => {
    const edited = editDevice(wlc.id)
    const runtime = edited.wlcRuntime ?? wlcRuntimeOf(wlc)
    const tunnels = [...runtime.clientTunnels.filter(tunnel => tunnel.macAddress.toLowerCase() !== inner.sourceMac.toLowerCase()), { macAddress: inner.sourceMac, apId }]
    const aps = runtime.aps.map(entry => entry.apId === apId ? { ...entry, lastSeenTick: simulationTick } : entry)
    edited.wlcRuntime = { ...runtime, clientTunnels: tunnels, aps }
    const lower = inner.destMac.toLowerCase()
    const group = lower === BROADCAST || lower.startsWith('01:') || lower.startsWith('33:33')
    const nameOf = (entryId: string) => byId.get(entryId)?.name ?? entryId
    const tunnelTarget = group ? undefined : tunnels.find(tunnel => tunnel.macAddress.toLowerCase() === lower)
    if (tunnelTarget) {
      const entry = aps.find(candidate => candidate.apId === tunnelTarget.apId)
      if (entry && tunnelInnerToAp(wlc, entry, inner, tunnelHops, nameOf(entry.apId))) return 1
    }
    if (!group && !tunnelTarget) {
      const wiredTarget = edited.macTable.find(entry => entry.macAddress.toLowerCase() === lower)
      const port = wiredTarget && wlc.ports.find(candidate => candidate.id === wiredTarget.portId || candidate.shortName === wiredTarget.portId || candidate.name === wiredTarget.portId)
      const outLink = wiredTarget?.linkId ? linksById.get(wiredTarget.linkId) : undefined
      if (port && outLink && liveLinks.has(outLink.id) && isUp(wlc, port)) { enqueue(onWire(wlc, port, outLink, inner, tunnelHops)); return 0 }
    }
    // Flood toward the wired LAN and the remaining wireless tunnels.
    for (const port of wlc.ports) {
      if (!isUp(wlc, port)) continue
      for (const outLink of linksByPort.get(`${wlc.id}|${port.id}`) ?? []) {
        if (!liveLinks.has(outLink.id)) continue
        enqueue(onWire(wlc, port, outLink, inner, tunnelHops))
      }
    }
    let forwarded = 0
    for (const entry of aps) if (tunnelInnerToAp(wlc, entry, inner, tunnelHops, nameOf(entry.apId))) forwarded += 1
    return forwarded
  }

  for (const packet of inFlightPackets.slice(0, packetQueueLimit)) {
    trackTcpTransmission(packet.pdu)
    if (packet.pdu.pendingPacket) trackTcpTransmission(packet.pdu.pendingPacket)
  }

  for (const packet of inFlightPackets.slice(0, packetQueueLimit)) {
    const link = linksById.get(packet.linkId)
    const receiver = byId.get(packet.toDeviceId)
    if (!link || !receiver || !liveLinks.has(link.id)) { drop(packet, 'Link, device, or port is down, blocked, removed, or is a console cable.'); continue }
    const expectedReceiver = link.fromDeviceId === packet.fromDeviceId ? link.toDeviceId : link.toDeviceId === packet.fromDeviceId ? link.fromDeviceId : undefined
    if (expectedReceiver !== receiver.id) { drop(packet, 'Packet endpoints do not match the link.'); continue }
    const receivingPortId = link.fromDeviceId === receiver.id ? link.fromPortId : link.toPortId
    const receivingPort = receiver.ports.find(p => p.id === receivingPortId)!
    const vlan = packet.vlanId ?? (receivingPort.portMode==='trunk'?receivingPort.nativeVlan??1:receivingPort.vlan??1)
    if ((packet.hops ?? 0) >= MAX_FRAME_HOPS) { drop(packet, 'Frame hop limit exceeded.'); continue }
    const progress = packet.progress + PACKET_PROGRESS_PER_TICK
    if (progress < 1) { enqueue({ ...packet, progress }); continue }
    if(packet.pdu.protocol==='STP'){
      const senderId=link.fromDeviceId===receiver.id?link.toDeviceId:link.fromDeviceId
      const vlanId=packet.pdu.payload.stpVlan
      const validSender=packet.fromDeviceId===senderId&&packet.pdu.payload.stpSenderDeviceId===senderId
      const receivingVlan=vlanId??(receivingPort.portMode==='trunk'?receivingPort.nativeVlan??1:receivingPort.vlan??1)
      if(receiver.type!=='switch'||!validSender||!carriesVlan(receivingPort,receivingVlan)){
        drop(packet,'Invalid or ineligible STP BPDU on this interface.')
        continue
      }
      const accepted=receiveStpBpdu(editDevice(receiver.id),receivingPort.id,link.id,senderId,packet.pdu,simulationTick)
      if(!accepted){drop(packet,'Malformed STP BPDU was rejected.');continue}
      packetDeliveries.push({packetId:packet.id,status:'delivered',receiverDeviceId:receiver.id,reason:`${receiver.name} received an STP BPDU from ${byId.get(senderId)?.name??senderId}.`})
      continue
    }
    const ingressStpState=isBridge(receiver)?stpTopology(vlan).ports.get(`${receiver.id}|${receivingPort.id}`)?.state:undefined
    if (isBridge(receiver) && !forwardingLinks(vlan).has(link.id) && ingressStpState!=='LRN') { drop(packet, 'Spanning tree or VLAN membership blocks this path.'); continue }
    if (packet.pdu.protocol === 'EIGRP' && packet.pdu.etherType === '0x86DD' && !isBridge(receiver)) {
      const received = receiveIpv6EigrpPacket(byId.get(receiver.id)!, receivingPort, packet.pdu)
      updatedDevices[deviceIndices.get(receiver.id)!] = received.device
      byId.set(receiver.id, received.device); mutable.add(receiver.id)
      if (received.reason) { drop(packet, received.reason); continue }
      received.outbound.forEach(sendControl)
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} processed EIGRPv6 ${packet.pdu.payload.eigrpV6?.type}.` })
      continue
    }
    if (packet.pdu.protocol === 'OSPF' && packet.pdu.etherType === '0x86DD' && !isBridge(receiver)) {
      const received = receiveOspfv3Packet(byId.get(receiver.id)!, receivingPort, packet.pdu)
      updatedDevices[deviceIndices.get(receiver.id)!] = received.device
      byId.set(receiver.id, received.device); mutable.add(receiver.id)
      if (received.reason) { drop(packet, received.reason); continue }
      received.outbound.forEach(sendControl)
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} processed OSPFv3 ${packet.pdu.payload.ospfv3?.type}.` })
      continue
    }
    if ((packet.pdu.protocol === 'ICMPv6' || packet.pdu.protocol === 'DHCPv6') && !isBridge(receiver)) { handleIpv6Frame(receiver, packet, link, receivingPort, vlan); continue }
    let pdu = packet.pdu
    const hops = (packet.hops ?? 0) + 1
    if (packet.pdu.protocol === 'CAPWAP' && (isWlcDevice(receiver) || isLightweightAp(receiver))) {
      const received = receiveCapwapPacket(byId.get(receiver.id)!, receivingPort, link.id, packet.pdu, simulationTick)
      updatedDevices[deviceIndices.get(receiver.id)!] = received.device
      byId.set(receiver.id, received.device); mutable.add(receiver.id)
      if (received.reason) { drop(packet, received.reason); continue }
      for (const intent of received.outbound) sendCapwap(intent)
      if (received.inner) {
        if (isWlcDevice(receiver)) {
          const forwardedTunnels = wlcForwardInner(byId.get(receiver.id)!, received.inner, received.innerApId ?? '', hops)
          if (forwardedTunnels > 0) packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} forwarded the frame into ${forwardedTunnels} CAPWAP tunnel${forwardedTunnels === 1 ? '' : 's'}.` })
        } else {
          deliverInnerToWireless(byId.get(receiver.id)!, received.inner, hops)
        }
      }
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: received.note ?? `${receiver.name} processed a CAPWAP frame.` })
      continue
    }
    if (isLightweightAp(receiver) && receivingPort.type === 'wireless') {
      const runtime = apRuntimeOf(byId.get(receiver.id)!)
      const wired = apWiredPort(receiver)
      learnWirelessClient(receiver, packet.pdu.sourceMac, link)
      if (runtime.state !== 'run' || !runtime.wlcMac || !wired || !isUp(receiver, wired)) {
        drop(packet, `${receiver.name} is a lightweight access point without an operational CAPWAP Run state; the frame is not forwarded.`)
        continue
      }
      const controller = runtime.selectedWlcId ? byId.get(runtime.selectedWlcId) : undefined
      const outer = capwapDataPdu(receiver, wired, runtime.wlcMac, packet.pdu, controller?.name ?? 'the wireless LAN controller', receiver.id, receiver.name, runtime.selectedWlcId)
      let tunnelled = false
      for (const outLink of linksByPort.get(`${receiver.id}|${wired.id}`) ?? []) {
        if (!liveLinks.has(outLink.id)) continue
        enqueue(onWire(receiver, wired, outLink, outer, hops)); tunnelled = true
      }
      if (!tunnelled) { drop(packet, `${receiver.name} has no operational CAPWAP path to its controller.`); continue }
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} encapsulated the ${packet.pdu.protocol} frame for central switching by ${controller?.name ?? 'its controller'}.` })
      continue
    }
    if (isLightweightAp(receiver)) {
      drop(packet, `${receiver.name} is a lightweight access point and does not forward wired frames locally.`)
      continue
    }
    if (isWlcDevice(receiver)) {
      const lowerDest = packet.pdu.destMac.toLowerCase()
      const addressedToController = receiver.ports.some(port => port.macAddress.toLowerCase() === lowerDest)
      const arpForController = packet.pdu.protocol === 'ARP' && packet.pdu.payload.arpType === 'request' && receiver.ports.some(port => port.ipAddress && port.ipAddress === packet.pdu.payload.targetIp)
      if (!addressedToController && !arpForController) {
        const group = lowerDest === BROADCAST || lowerDest.startsWith('01:') || lowerDest.startsWith('33:33')
        const runtime = wlcRuntimeOf(receiver)
        const edited = editDevice(receiver.id)
        if (!group) {
          edited.macTable = [...edited.macTable.filter(entry => entry.macAddress.toLowerCase() !== packet.pdu.sourceMac.toLowerCase()).slice(-1023), { macAddress: packet.pdu.sourceMac, portId: receivingPort.shortName, linkId: link.id, vlan, age: 0, lastSeenTick: simulationTick }]
        }
        const tunnelHit = group ? undefined : runtime.clientTunnels.find(tunnel => tunnel.macAddress.toLowerCase() === lowerDest)
        const tunnelTargets = group ? runtime.aps.map(entry => entry.apId) : tunnelHit ? [tunnelHit.apId] : []
        let forwarded = 0
        for (const apId of tunnelTargets) {
          const entry = (edited.wlcRuntime ?? runtime).aps.find(candidate => candidate.apId === apId)
          if (!entry) continue
          const apName = byId.get(entry.apId)?.name ?? entry.apId
          if (tunnelInnerToAp(receiver, entry, packet.pdu, hops, apName)) forwarded += 1
        }
        if (forwarded) {
          packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} forwarded the frame into ${forwarded} CAPWAP tunnel${forwarded === 1 ? '' : 's'}.` })
          continue
        }
        drop(packet, group ? `${receiver.name} has no registered access points to forward the broadcast to.` : `${receiver.name} is a wireless LAN controller and does not forward wired frames between its own ports.`)
        continue
      }
      // ARP requests for the management address and frames addressed to the controller fall through to the normal host handling below.
    }
    const subinterfaces = receiver.ports.filter(p => p.parentPortId === receivingPort.id)
    const subinterface = subinterfaces.find(p => isUp(receiver,p) && (packet.vlanId === undefined ? p.dot1qNative : p.dot1qVlan === packet.vlanId))
    if (receiver.type === 'router' && (packet.vlanId !== undefined || subinterfaces.length > 0 && !receivingPort.ipAddress) && !subinterface) { drop(packet, `No operational 802.1Q subinterface on ${receivingPort.name} for ${packet.vlanId === undefined ? 'untagged traffic' : `VLAN ${packet.vlanId}`}.`); continue }
    const receivedAtMs = Date.now()
    const reverseNat = receiver.type !== 'security' ? undefined
      : pdu.protocol === 'ICMP' && pdu.payload.icmpType === 'echo-reply'
        ? receiver.asaNatTranslations?.find(translation => translation.protocol === 'ICMP' && translation.destInterface === receivingPort.nameif && translation.translatedSourceIp === pdu.destIp && translation.remoteDestinationIp === pdu.sourceIp && translation.translatedIdentifier === (pdu.payload.icmpIdentifier ?? 0) && translation.expiresAtMs > receivedAtMs)
        : pdu.protocol === 'UDP' && pdu.payload.udpMessageType === 'response'
          ? receiver.asaNatTranslations?.find(translation => translation.protocol === 'UDP' && translation.destInterface === receivingPort.nameif && translation.translatedSourceIp === pdu.destIp && translation.remoteDestinationIp === pdu.sourceIp && translation.translatedSourcePort === pdu.payload.udpDestinationPort && translation.expiresAtMs > receivedAtMs && (
            translation.remoteDestinationPort === pdu.payload.udpSourcePort
            || pdu.payload.udpService === 'tftp' && pdu.payload.tftpMessageType === 'data' && pdu.payload.tftpBlockNumber === 1 && translation.remoteDestinationPort === 69 && receiver.config.asaInspection?.udp !== false && receiver.config.asaInspection?.tftp !== false
          ))
          : pdu.protocol === 'TCP'
            ? receiver.asaNatTranslations?.find(translation => translation.protocol === 'TCP' && translation.destInterface === receivingPort.nameif && translation.translatedSourceIp === pdu.destIp && translation.remoteDestinationIp === pdu.sourceIp && translation.remoteDestinationPort === pdu.payload.tcpSourcePort && translation.translatedSourcePort === pdu.payload.tcpDestinationPort && translation.expiresAtMs > receivedAtMs)
          : undefined
    const svi=receiver.ports.find(p=>p.virtualVlan===vlan&&isUp(receiver,p))
    const logicalPort=subinterface??svi??receivingPort
    const addressedIp=pdu.protocol==='ARP'?pdu.payload.targetIp:pdu.destIp
    const localPhysicalIp=reverseNat?undefined:receiver.ports.find(p=>p.ipAddress===addressedIp&&isUp(receiver,p)&&(pdu.protocol!=='ARP'||p.id===(subinterface??receivingPort).id||p.virtualVlan===vlan))
    const hsrpLocal=reverseNat?undefined:receiver.ports.flatMap(port=>(port.hsrpGroups??[]).map(group=>({port,group}))).find(({port,group})=>group.virtualIp===addressedIp&&isUp(receiver,port)&&(port.id===logicalPort.id||port.virtualVlan===vlan)&&activeHsrpGroup(receiver,port,addressedIp))
    const localIp=localPhysicalIp??(hsrpLocal?{...hsrpLocal.port,ipAddress:hsrpLocal.group.virtualIp,macAddress:hsrpVirtualMac(hsrpLocal.group.group)}:undefined)
    const activeHsrpMac=receiver.ports.some(port=>(port.id===logicalPort.id||port.virtualVlan===vlan)&&isUp(receiver,port)&&(port.hsrpGroups??[]).some(group=>group.virtualIp&&activeHsrpGroup(receiver,port,group.virtualIp)&&hsrpVirtualMac(group.group)===pdu.destMac))
    const standbyHsrpMac=receiver.ports.some(port=>(port.id===logicalPort.id||port.virtualVlan===vlan)&&(port.hsrpGroups??[]).some(group=>hsrpVirtualMac(group.group)===pdu.destMac&&!activeHsrpGroup(receiver,port,group.virtualIp)))
    const gatewayFrame=receiver.type==='switch'&&pdu.protocol!=='ARP'&&(pdu.destMac===svi?.macAddress||activeHsrpMac||receivingPort.ipAddress&&pdu.destMac===receivingPort.macAddress)
    const dhcpRelayRecipient=pdu.protocol==='DHCP'&&receiver.type==='switch'&&receiver.config.ipRouting===true&&logicalPort.virtualVlan!==undefined&&Boolean(logicalPort.helperAddress)
    if (isBridge(receiver) && receiver.type !== 'hub') {
        const previous = receiver.macTable.find(m => m.macAddress === pdu.sourceMac && m.vlan === vlan)
        if (!previous || previous.portId !== receivingPort.shortName || previous.linkId!==link.id || previous.age !== 0 || previous.lastSeenTick!==simulationTick) {
          editDevice(receiver.id).macTable = [...receiver.macTable.filter(m => !(m.macAddress === pdu.sourceMac && m.vlan === vlan)).slice(-1023), { macAddress: pdu.sourceMac, portId: receivingPort.shortName, linkId:link.id, vlan, age: 0,lastSeenTick:simulationTick }]
        }
        const currentMacTable=byId.get(receiver.id)!.macTable
        const usableMacTable=currentMacTable.filter(entry=>{
          if(!entry.linkId)return true
          if(!liveLinks.has(entry.linkId))return false
          if(forwardingLinks(entry.vlan).has(entry.linkId))return true
          const learnedPort=receiver.ports.find(port=>port.shortName===entry.portId&&port.connectedLinkId===entry.linkId)
          return !!learnedPort&&stpTopology(entry.vlan).ports.get(`${receiver.id}|${learnedPort.id}`)?.state==='LRN'
        })
        if(usableMacTable.length!==currentMacTable.length)editDevice(receiver.id).macTable=usableMacTable
    }
    if(isBridge(receiver)&&ingressStpState==='LRN'){drop(packet,`${receiver.name} learned the source MAC, but ${receivingPort.name} is still in the STP learning state and cannot forward data.`);continue}
    const ospfRecipient = pdu.protocol === 'OSPF' && hasOspf(receiver) && ospfArea(receiver, logicalPort) !== undefined
    const ripRecipient = pdu.protocol === 'RIP' && hasRip(receiver) && ripEnabled(receiver, logicalPort)
    const eigrpRecipient = pdu.protocol === 'EIGRP' && hasEigrp(receiver) && eigrpEnabled(receiver, logicalPort)
    const bgpRecipient = pdu.protocol === 'BGP' && (hasBgp(receiver) || (!!pdu.payload.bgpTcp && bgpRuns(receiver))) && receiver.ports.some(port => port.ipAddress === pdu.destIp)
    if (isBridge(receiver) && !localIp && !gatewayFrame) {
      const known = receiver.type === 'hub' ? undefined : byId.get(receiver.id)!.macTable.find(m => m.macAddress === pdu.destMac && m.vlan === vlan)
      const outPorts = known && pdu.destMac !== BROADCAST
        ? receiver.ports.filter(p => p.id === known.portId || p.shortName === known.portId || p.name === known.portId)
        : receiver.ports
      const forwardedPeers = new Set<string>()
      bundledLinks??=new Set(getOperationalChannels(devices,links).flatMap(c=>c.links.map(l=>l.id)))
      for (const port of outPorts) {
        if (port.id === receivingPort.id && port.type!=='wireless' || !isUp(receiver, port) || !carriesVlan(port, vlan)) continue
        for(const outLink of linksByPort.get(`${receiver.id}|${port.id}`)??[]){
        if(outLink.id===link.id||!forwardingLinks(vlan).has(outLink.id))continue
        if(port.type==='wireless'&&known?.linkId&&outLink.id!==known.linkId&&pdu.destMac!==BROADCAST)continue
        const peer = outLink.fromDeviceId === receiver.id ? outLink.toDeviceId : outLink.fromDeviceId
        if (bundledLinks.has(outLink.id) && (peer === packet.fromDeviceId || forwardedPeers.has(peer))) continue
        forwardedPeers.add(peer)
        enqueue(onWire(receiver, port, outLink, pdu, hops, egressVlan(port,vlan)))
        }
      }
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} switched the frame within VLAN ${vlan}.` })
      if (!ospfRecipient && !ripRecipient && !eigrpRecipient && !dhcpRelayRecipient) continue
    }

    const serial = receivingPort.type === 'serial'
    const ospfMulticast = pdu.protocol === 'OSPF' && pdu.destMac === '01:00:5e:00:00:05' || pdu.protocol === 'RIP' && pdu.destMac === '01:00:5e:00:00:09' || pdu.protocol === 'EIGRP' && (pdu.destMac === '01:00:5e:00:00:0a' || pdu.destMac === '33:33:00:00:00:0a')
    if(standbyHsrpMac&&pdu.protocol!=='ARP'){
      packetDeliveries.push({packetId:packet.id,status:'delivered',receiverDeviceId:receiver.id,reason:`${receiver.name} is not active for this HSRP virtual MAC and ignores the frame.`})
      continue
    }
    if (!serial && !ospfMulticast && pdu.destMac !== BROADCAST && pdu.destMac.toLowerCase() !== receivingPort.macAddress.toLowerCase() && pdu.destMac.toLowerCase()!==svi?.macAddress.toLowerCase()&&!activeHsrpMac) { drop(packet, 'Unicast frame is addressed to another interface.'); continue }
    if (pdu.protocol !== 'ARP' && (receiver.type === 'router' || receiver.type === 'security' || ospfRecipient || ripRecipient || eigrpRecipient || bgpRecipient) && logicalPort.inboundAcl) {
      const acl = receiver.config.accessLists?.find((a) => a.id === logicalPort.inboundAcl)
      if (acl) {
        const evalResult = evaluateAcl(acl, {
          sourceIp: pdu.sourceIp,
          destIp: pdu.destIp,
          protocol: pdu.protocol,
          port: pdu.payload.tcpDestinationPort ?? pdu.payload.udpDestinationPort,
        })
        if (evalResult.action === 'deny') {
          drop(packet, `Packet filtered by inbound ACL ${receivingPort.inboundAcl} on ${receivingPort.name}: ${evalResult.reason}`)
          continue
        }
      }
    }
    if (receiver.type === 'security' && pdu.protocol === 'ICMP' && pdu.payload.icmpType === 'echo-reply' && receivingPort.nameif && pdu.destIp === receivingPort.ipAddress && !reverseNat) {
      drop(packet, `ASA firewall dropped ICMP Echo Reply without a matching ASA translation on ${receivingPort.nameif}.`)
      continue
    }
    if (receiver.type === 'security' && pdu.protocol === 'UDP' && pdu.payload.udpMessageType === 'response' && receivingPort.nameif && pdu.destIp === receivingPort.ipAddress && !reverseNat) {
      drop(packet, `ASA firewall dropped UDP response without a matching ASA translation on ${receivingPort.nameif}.`)
      continue
    }
    if (receiver.type === 'security' && pdu.protocol === 'TCP' && receivingPort.nameif && pdu.destIp === receivingPort.ipAddress && !reverseNat) {
      drop(packet, `ASA firewall dropped TCP segment without a matching ASA translation on ${receivingPort.nameif}.`)
      continue
    }
    if (reverseNat) {
      const learnedTftpPort = reverseNat.protocol === 'UDP' && pdu.payload.udpService === 'tftp' && pdu.payload.tftpMessageType === 'data' && pdu.payload.tftpBlockNumber === 1 && reverseNat.remoteDestinationPort === 69
        ? pdu.payload.udpSourcePort
        : undefined
      const reversePayload = reverseNat.protocol === 'ICMP'
        ? { ...pdu.payload, icmpIdentifier: reverseNat.originalIdentifier }
        : reverseNat.protocol === 'UDP'
          ? { ...pdu.payload, udpDestinationPort: reverseNat.originalSourcePort }
          : { ...pdu.payload, tcpDestinationPort: reverseNat.originalSourcePort, tcpClientIp: reverseNat.originalSourceIp }
      const reverseLayer4 = reverseNat.protocol === 'ICMP'
        ? `ICMP Echo Reply identifier translated from ${reverseNat.translatedIdentifier} to ${reverseNat.originalIdentifier}.`
        : reverseNat.protocol === 'UDP'
          ? `UDP destination port translated from ${reverseNat.translatedSourcePort} to ${reverseNat.originalSourcePort}.`
          : `TCP destination port translated from ${reverseNat.translatedSourcePort} to ${reverseNat.originalSourcePort}.`
      pdu = {
        ...pdu,
        destIp: reverseNat.originalSourceIp,
        summary: `ASA reverse PAT: ${pdu.sourceIp} to ${reverseNat.originalSourceIp}`,
        payload: reversePayload,
        explanation: {
          ...pdu.explanation,
          layer3: `IPv4 destination translated from ${reverseNat.translatedSourceIp} to ${reverseNat.originalSourceIp}.`,
          layer4AndAbove: reverseLayer4,
          deviceDecision: `ASA reverse-translates the reply using active translation ${reverseNat.id}.`,
        },
      }
      const updatedAsa = editDevice(receiver.id)
      updatedAsa.asaNatTranslations = (updatedAsa.asaNatTranslations ?? []).map(translation => translation.id === reverseNat.id
        ? translation.protocol === 'UDP'
          ? { ...translation, remoteDestinationPort: learnedTftpPort ?? translation.remoteDestinationPort, expiresAtMs: receivedAtMs + ASA_NAT_TIMEOUT_MS }
          : { ...translation, expiresAtMs: receivedAtMs + ASA_NAT_TIMEOUT_MS }
        : translation)
    }
    if (pdu.protocol === 'BGP' && bgpRecipient) {
      const received = receiveBgpPacket(byId.get(receiver.id)!, logicalPort, pdu)
      updatedDevices[deviceIndices.get(receiver.id)!] = received.device
      byId.set(receiver.id, received.device); mutable.add(receiver.id)
      received.outbound.forEach(sendBgp)
      if (received.reason) { drop(packet, received.reason); continue }
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} processed BGP ${pdu.payload.bgp?.type ?? `TCP ${pdu.payload.bgpTcp?.flags} on port 179`}.` })
      continue
    }
    if (pdu.protocol === 'OSPF' || pdu.protocol === 'RIP' || pdu.protocol === 'EIGRP') {
      const received = pdu.protocol === 'OSPF' ? receiveOspfPacket(byId.get(receiver.id)!, logicalPort, pdu) : pdu.protocol === 'RIP' ? receiveRipPacket(byId.get(receiver.id)!, logicalPort, pdu) : receiveEigrpPacket(byId.get(receiver.id)!, logicalPort, pdu)
      updatedDevices[deviceIndices.get(receiver.id)!] = received.device
      byId.set(receiver.id, received.device); mutable.add(receiver.id)
      if (received.reason) { drop(packet, received.reason); continue }
      received.outbound.forEach(sendControl)
      packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} processed ${pdu.protocol} ${pdu.payload.ospf?.type ?? pdu.payload.rip?.command ?? pdu.payload.eigrp?.type}.` })
      continue
    }
    if (pdu.protocol === 'UDP' && pdu.payload.udpService === 'iot' && pdu.payload.iotMessageType) {
      const iotMessageType = pdu.payload.iotMessageType
      const iotClientDeviceId = pdu.payload.iotClientDeviceId
      const iotServerDeviceId = pdu.payload.iotServerDeviceId
      const iotClientDevice = iotClientDeviceId ? byId.get(iotClientDeviceId) : undefined
      const iotLocalIp = localIp ?? (receivingPort.ipAddress ? receivingPort : undefined) ?? receiver.ports.find(port => isUp(receiver, port) && port.ipAddress && port.connectedLinkId)
      if (!iotLocalIp?.ipAddress) continue
      const iotLocalAddress = iotLocalIp.ipAddress
      const editIotReceiver = (editor: (device: NetworkDevice) => NetworkDevice) => {
        const edited = editor(byId.get(receiver.id)!)
        updatedDevices[deviceIndices.get(receiver.id)!] = edited
        byId.set(receiver.id, edited)
        mutable.add(receiver.id)
      }
      if (iotMessageType === 'discovery') {
        if (!isIotServer(receiver) || (pdu.destIp !== IOT_BROADCAST_ADDRESS && pdu.destIp !== iotLocalAddress)) continue
        const reply: PacketPdu = {
          ...pdu, id: packetId('iot-discovery-reply'), summary: `IoT discovery reply from ${receiver.name}`,
          sourceMac: iotLocalIp.macAddress, destMac: pdu.sourceMac, sourceIp: iotLocalAddress, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
          payload: { udpMessageType: 'response', udpService: 'iot', udpSourcePort: IOT_SERVER_PORT, udpDestinationPort: pdu.payload.udpSourcePort ?? IOT_CLIENT_PORT, iotMessageType: 'discovery-reply', iotClientDeviceId, iotServerDeviceId: receiver.id, iotStateSummary: pdu.payload.iotStateSummary },
          explanation: { ...pdu.explanation, layer1: `Outbound interface: ${iotLocalIp.name}.`, layer2: `Ethernet II: ${iotLocalIp.macAddress} to ${pdu.sourceMac}.`, layer3: `IPv4: ${iotLocalAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: server registration port ${IOT_SERVER_PORT} to client port ${pdu.payload.udpSourcePort ?? IOT_CLIENT_PORT}. IoT discovery reply.`, deviceDecision: `${receiver.name} answered the IoT discovery broadcast from ${iotClientDevice?.name ?? 'a device'}.` },
        }
        if (!sendIp(byId.get(receiver.id)!, reply, 0, packet)) continue
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} answered the IoT discovery broadcast from ${iotClientDevice?.name ?? 'a device'}.` })
        continue
      }
      if (iotMessageType === 'discovery-reply') {
        if (!isIotThing(receiver) || receiver.id !== iotClientDeviceId || pdu.destIp !== iotLocalAddress) continue
        const server = iotServerDeviceId ? byId.get(iotServerDeviceId) : undefined
        editIotReceiver(current => markIotRegistered(current, { serverId: iotServerDeviceId, serverName: server?.name, serverAddress: pdu.sourceIp }, simulationTick))
        const kind = iotKindOf(receiver)
        const summary = iotStateSummary(kind, iotStateOf(receiver))
        const register: PacketPdu = {
          ...pdu, id: packetId('iot-register'), summary: `IoT registration from ${receiver.name}`,
          sourceMac: iotLocalIp.macAddress, destMac: pdu.sourceMac, sourceIp: iotLocalAddress, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
          payload: { udpMessageType: 'request', udpService: 'iot', udpSourcePort: IOT_CLIENT_PORT, udpDestinationPort: IOT_SERVER_PORT, iotMessageType: 'register', iotClientDeviceId: receiver.id, iotServerDeviceId, iotStateSummary: summary },
          explanation: { ...pdu.explanation, layer1: `Outbound interface: ${iotLocalIp.name}.`, layer2: `Ethernet II: ${iotLocalIp.macAddress} to ${pdu.sourceMac}.`, layer3: `IPv4: ${iotLocalAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: client port ${IOT_CLIENT_PORT} to server registration port ${IOT_SERVER_PORT}. Registration request.`, deviceDecision: `${receiver.name} learned IoT server ${server?.name ?? pdu.sourceIp} and registers with its current state (${summary}).` },
        }
        if (!sendIp(byId.get(receiver.id)!, register, 0, packet)) continue
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} learned IoT server ${server?.name ?? pdu.sourceIp} and started registration.` })
        continue
      }
      if (iotMessageType === 'register' || iotMessageType === 'report') {
        if (!isIotServer(receiver) || iotServerDeviceId !== receiver.id || pdu.destIp !== iotLocalAddress) continue
        if (!iotClientDevice || !isIotThing(iotClientDevice)) {
          drop(packet, `IoT ${iotMessageType} from ${pdu.sourceIp} references an unknown client device.`)
          continue
        }
        const kind = iotKindOf(iotClientDevice)
        editIotReceiver(current => recordIotClient(current, { deviceId: iotClientDevice.id, address: pdu.sourceIp, kind }, simulationTick))
        const summary = pdu.payload.iotStateSummary ?? iotStateSummary(kind, iotStateOf(iotClientDevice))
        packetDeliveries.push({
          packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id,
          reason: iotMessageType === 'register'
            ? `${receiver.name} registered ${iotClientDevice.name} as an IoT device with address ${pdu.sourceIp}.`
            : `${receiver.name} recorded an IoT state report from ${iotClientDevice.name} (${summary}).`,
        })
        continue
      }
      if (iotMessageType === 'control') {
        if (!isIotThing(receiver) || receiver.id !== iotClientDeviceId || pdu.destIp !== iotLocalAddress) continue
        if (receiver.iotRuntime?.serverId && iotServerDeviceId && receiver.iotRuntime.serverId !== iotServerDeviceId) {
          drop(packet, `${receiver.name} is registered to ${byId.get(receiver.iotRuntime.serverId)?.name ?? 'another IoT server'} and rejected the command.`)
          continue
        }
        editIotReceiver(current => applyIotControl(current, pdu.payload.iotControlPatch ?? {}, simulationTick))
        const edited = byId.get(receiver.id)!
        const summary = iotStateSummary(iotKindOf(edited), iotStateOf(edited))
        const acknowledgement: PacketPdu = {
          ...pdu, id: packetId('iot-control-ack'), summary: `IoT command acknowledgement from ${receiver.name}`,
          sourceMac: iotLocalIp.macAddress, destMac: pdu.sourceMac, sourceIp: iotLocalAddress, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
          payload: { udpMessageType: 'response', udpService: 'iot', udpSourcePort: IOT_CLIENT_PORT, udpDestinationPort: IOT_SERVER_PORT, iotMessageType: 'control-ack', iotClientDeviceId: receiver.id, iotServerDeviceId, iotCommandId: pdu.payload.iotCommandId, iotStateSummary: summary },
          explanation: { ...pdu.explanation, layer1: `Outbound interface: ${iotLocalIp.name}.`, layer2: `Ethernet II: ${iotLocalIp.macAddress} to ${pdu.sourceMac}.`, layer3: `IPv4: ${iotLocalAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: client port ${IOT_CLIENT_PORT} to server registration port ${IOT_SERVER_PORT}. Command acknowledgement.`, deviceDecision: `${receiver.name} applied the remote IoT command and now reports ${summary}.` },
        }
        if (!sendIp(byId.get(receiver.id)!, acknowledgement, 0, packet)) continue
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} applied the remote IoT command from ${byId.get(iotServerDeviceId ?? '')?.name ?? 'its server'} (${summary}).` })
        continue
      }
      if (iotMessageType === 'control-ack') {
        if (!isIotServer(receiver) || iotServerDeviceId !== receiver.id || pdu.destIp !== iotLocalAddress) continue
        if (iotClientDeviceId) editIotReceiver(current => touchIotClient(current, iotClientDeviceId, simulationTick))
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} received an IoT command acknowledgement from ${iotClientDevice?.name ?? 'a client'} (${pdu.payload.iotStateSummary ?? 'state updated'}).` })
        continue
      }
      continue
    }
    if (pdu.protocol === 'DHCP') {
      const clientId = pdu.payload.dhcpClientDeviceId
      const requestId = pdu.payload.dhcpRequestId
      const messageType = pdu.payload.dhcpType
      if (!clientId || !requestId || !messageType) {
        drop(packet, 'DHCP packet is missing its client, transaction ID, or message type.')
        continue
      }
      const dhcpRoutingDevice = receiver.type === 'router' || receiver.type === 'switch' && receiver.config.ipRouting === true
      const dhcpRelayResponseTransit = ['offer', 'ack', 'nak'].includes(messageType)
        && receiver.id !== clientId && receiver.id !== pdu.payload.dhcpRelayDeviceId
        && pdu.destIp !== '255.255.255.255' && !localIp
        && (receiver.type === 'router' || receiver.type === 'switch' && receiver.config.ipRouting === true)
      if ((messageType === 'discover' || messageType === 'request') && receiver.id !== clientId && dhcpRoutingDevice) {
        if (receiver.config.ipRouting === false) {
          failDhcp(pdu, `${receiver.name} has IP routing disabled, so it cannot process or relay DHCP traffic.`)
          packetDeliveries.push({ packetId: packet.id, status: 'dropped', receiverDeviceId: receiver.id, reason: 'IP routing is disabled.' })
          continue
        }
        const allocation = allocateDhcpLease(updatedDevices, links, clientId)
        if (allocation.lease?.serverId === receiver.id) {
          if (messageType === 'discover') {
            if (!sendDhcpServerResponse(receiver, pdu, packet, 'offer', allocation.lease)) failDhcp(pdu, `${receiver.name} could not place a DHCP Offer on the client VLAN.`)
          } else if (allocation.lease.ipAddress === pdu.payload.dhcpRequestedIp && (pdu.payload.dhcpServerDeviceId === receiver.id || pdu.payload.dhcpRenewalPhase === 'rebind')) {
            if (!sendDhcpServerResponse(receiver, pdu, packet, 'ack', allocation.lease)) failDhcp(pdu, `${receiver.name} could not place a DHCP ACK on the client VLAN.`)
          } else {
            const reason = `${receiver.name} rejected the DHCP Request because the selected address is no longer available in its pool.`
            failDhcp(pdu, reason)
            sendDhcpServerResponse(receiver, { ...pdu, payload: { ...pdu.payload, dhcpErrorReason: reason } }, packet, 'nak')
          }
          packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} processed DHCP ${messageType}.` })
        } else if (allocation.lease && !allocation.reason.includes('DHCP Relay')) {
          packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} leaves DHCP ${messageType} for directly reachable server ${allocation.lease.serverId}.` })
        } else if (logicalPort.helperAddress) {
          if (!relayDhcpRequest(receiver, logicalPort, pdu, packet)) {
            packetDeliveries.push({ packetId: packet.id, status: 'dropped', receiverDeviceId: receiver.id, reason: dhcpResults.find(result => result.requestId === requestId)?.reason })
          } else {
            packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} relayed DHCP ${messageType} to ${logicalPort.helperAddress}.` })
          }
        } else {
          const reason = `${receiver.name} received DHCP ${messageType.toUpperCase()} on ${logicalPort.name}, but no matching local DHCP pool or ip helper-address is configured. ${allocation.reason}`
          failDhcp(pdu, reason)
          packetDeliveries.push({ packetId: packet.id, status: 'dropped', receiverDeviceId: receiver.id, reason })
        }
        continue
      }
      if ((messageType === 'discover' || messageType === 'request') && receiver.id !== clientId && receiver.type === 'server') {
        const allocation = allocateDhcpLease(updatedDevices, links, clientId)
        const hasPool = Boolean(receiver.config.dhcpPools?.length || receiver.config.dhcpEnabled && receiver.config.dhcpPool)
        if (allocation.lease?.serverId === receiver.id) {
          if (messageType === 'discover') {
            if (!sendDhcpServerResponse(receiver, pdu, packet, 'offer', allocation.lease)) failDhcp(pdu, `${receiver.name} could not return its DHCP Offer.`)
          } else if (allocation.lease.ipAddress === pdu.payload.dhcpRequestedIp && (pdu.payload.dhcpServerDeviceId === receiver.id || pdu.payload.dhcpRenewalPhase === 'rebind')) {
            if (!sendDhcpServerResponse(receiver, pdu, packet, 'ack', allocation.lease)) failDhcp(pdu, `${receiver.name} could not return its DHCP ACK.`)
          } else {
            const reason = `${receiver.name} rejected the DHCP Request because ${pdu.payload.dhcpRequestedIp ?? 'the requested address'} is no longer available in its pool.`
            failDhcp({ ...pdu, payload: { ...pdu.payload, dhcpErrorReason: reason } }, reason)
            sendDhcpServerResponse(receiver, { ...pdu, payload: { ...pdu.payload, dhcpErrorReason: reason } }, packet, 'nak')
          }
        } else if (pdu.payload.dhcpRelayAgentIp || hasPool) {
          const reason = `${receiver.name} has no matching DHCP pool for client subnet ${pdu.payload.dhcpRelayAgentIp ?? pdu.sourceIp}. ${allocation.reason}`
          failDhcp(pdu, reason)
        }
        packetDeliveries.push({ packetId: packet.id, status: allocation.lease?.serverId === receiver.id ? 'delivered' : 'dropped', receiverDeviceId: receiver.id, reason: `${receiver.name} ${allocation.lease?.serverId === receiver.id ? 'processed' : 'did not match'} DHCP ${messageType}.` })
        continue
      }
      if (messageType === 'offer' && receiver.id === pdu.payload.dhcpRelayDeviceId && dhcpRoutingDevice) {
        const relayPort = receiver.ports.find(port => port.id === pdu.payload.dhcpRelayPortId)
        if (!relayPort || !sendDhcpBroadcast(receiver, relayPort, {
          ...pdu, id: packetId('dhcp-relay-offer'), summary: `DHCP Relay: Offer ${pdu.payload.assignedIp} to ${clientId}`,
          sourceMac: relayPort.macAddress, destMac: BROADCAST, sourceIp: pdu.payload.dhcpRelayAgentIp ?? relayPort.ipAddress ?? '0.0.0.0', destIp: '255.255.255.255',
          explanation: { ...pdu.explanation, layer2: `DHCP relay broadcasts the server Offer on ${relayPort.name}.`, layer3: `Relay broadcasts the offered address ${pdu.payload.assignedIp} to the client VLAN.`, deviceDecision: `${receiver.name} forwards the DHCP Offer to the original client broadcast domain.` },
        })) failDhcp(pdu, `${receiver.name} received an Offer but could not broadcast it on the client VLAN.`)
        continue
      }
      if ((messageType === 'ack' || messageType === 'nak') && receiver.id === pdu.payload.dhcpRelayDeviceId && dhcpRoutingDevice) {
        const relayPort = receiver.ports.find(port => port.id === pdu.payload.dhcpRelayPortId)
        if (!relayPort || !sendDhcpBroadcast(receiver, relayPort, {
          ...pdu, id: packetId(`dhcp-relay-${messageType}`), summary: `DHCP Relay: ${messageType.toUpperCase()} to ${clientId}`,
          sourceMac: relayPort.macAddress, destMac: BROADCAST, sourceIp: pdu.payload.dhcpRelayAgentIp ?? relayPort.ipAddress ?? '0.0.0.0', destIp: '255.255.255.255',
          explanation: { ...pdu.explanation, layer2: `DHCP relay broadcasts the server ${messageType.toUpperCase()} on ${relayPort.name}.`, layer3: `Relay returns DHCP ${messageType.toUpperCase()} to the client VLAN.`, deviceDecision: `${receiver.name} forwards the DHCP ${messageType.toUpperCase()} to the original client broadcast domain.` },
        })) failDhcp(pdu, `${receiver.name} received DHCP ${messageType.toUpperCase()} but could not broadcast it on the client VLAN.`)
        continue
      }
      if (receiver.id === clientId && messageType === 'offer') {
        recordDhcpPhase(pdu, 'offer', 'pending')
        const requestAlreadySent = [...inFlightPackets, ...remaining].some(frame => {
          const candidates = [frame.pdu, frame.pdu.pendingPacket].filter((candidate): candidate is PacketPdu => Boolean(candidate))
          return candidates.some(candidate => candidate.protocol === 'DHCP' && candidate.payload.dhcpRequestId === requestId && candidate.payload.dhcpType === 'request')
        })
        if (requestAlreadySent) continue
        const request: PacketPdu = {
          ...pdu, id: packetId('dhcp-request'), summary: `DHCP Request: ${pdu.payload.assignedIp} from ${pdu.payload.dhcpServerDeviceId}`,
          sourceMac: logicalPort.macAddress, destMac: BROADCAST, sourceIp: '0.0.0.0', destIp: '255.255.255.255', ttl: 64,
          payload: { ...pdu.payload, dhcpType: 'request', dhcpRequestedIp: pdu.payload.assignedIp, dhcpRelayAgentIp: undefined, dhcpRelayDeviceId: undefined, dhcpRelayPortId: undefined, udpSourcePort: 68, udpDestinationPort: 67 },
          explanation: { ...pdu.explanation, layer2: `DHCP Request is broadcast to ${BROADCAST} in the client VLAN.`, layer3: 'IPv4: 0.0.0.0 to 255.255.255.255, TTL 64.', layer4AndAbove: `UDP: client port 68 to server port 67. DHCP Request for ${pdu.payload.assignedIp}.`, deviceDecision: `${receiver.name} requests the offered address from ${pdu.payload.dhcpServerDeviceId}.` },
        }
        if (!sendDhcpBroadcast(receiver, logicalPort, request)) failDhcp(request, `${receiver.name} received a DHCP Offer but has no active link to send the Request.`)
        continue
      }
      if (receiver.id === clientId && messageType === 'ack') {
        if (!pdu.payload.assignedIp || !pdu.payload.dhcpSubnetMask || !isValidIpv4(pdu.payload.assignedIp) || !isValidIpv4(pdu.payload.dhcpSubnetMask)) {
          failDhcp(pdu, 'DHCP ACK is missing a valid offered address or subnet mask.')
        } else {
          recordDhcpPhase(pdu, 'probe', 'pending')
          const probeIp=pdu.payload.assignedIp
          const probe:PacketPdu={
            ...pdu,id:packetId('dhcp-arp-probe'),protocol:'ARP',summary:`ARP DHCP conflict probe for ${probeIp}`,
            sourceMac:logicalPort.macAddress,destMac:BROADCAST,etherType:'0x0806',sourceIp:'0.0.0.0',destIp:probeIp,ttl:255,pendingPacket:undefined,
            payload:{arpType:'request',targetIp:probeIp,targetMac:'00:00:00:00:00:00',dhcpRequestId:requestId,dhcpClientDeviceId:clientId,
              dhcpClientPortId:pdu.payload.dhcpClientPortId,dhcpServerDeviceId:pdu.payload.dhcpServerDeviceId,dhcpProbeIp:probeIp,
              assignedIp:probeIp,dhcpSubnetMask:pdu.payload.dhcpSubnetMask,dhcpGateway:pdu.payload.dhcpGateway,dhcpDnsServer:pdu.payload.dhcpDnsServer,
              dhcpLeaseDurationSeconds:pdu.payload.dhcpLeaseDurationSeconds},
            explanation:{layer1:`Outbound interface: ${logicalPort.name}. Media: Ethernet.`,layer2:`ARP probe is broadcast before ${probeIp} is assigned.`,
              layer3:`ARP probe checks whether ${probeIp} is already in use.`,layer4AndAbove:'N/A (Layer 2 address conflict detection)',
              deviceDecision:`${receiver.name} verifies the offered DHCP address before configuring the interface.`},
          }
          if(!sendDhcpBroadcast(receiver,logicalPort,probe))failDhcp(pdu,`${receiver.name} received a DHCP ACK but could not probe the offered address for a conflict.`)
        }
        continue
      }
      if (receiver.id === clientId && messageType === 'nak') {
        failDhcp(pdu, pdu.payload.dhcpErrorReason ?? 'DHCP server declined the requested address.')
        continue
      }
      if (receiver.id !== clientId && ['offer', 'ack', 'nak'].includes(messageType) && !dhcpRelayResponseTransit) {
        packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} received a DHCP broadcast not addressed to its transaction and ignored it.` })
        continue
      }
      if (!dhcpRelayResponseTransit) continue
    }
    if (pdu.protocol === 'ARP') {
      if(pdu.payload.arpType==='reply'&&pdu.payload.dhcpProbeIp&&receiver.id===pdu.payload.dhcpClientDeviceId){
        const conflictOwner=devices.find(device=>device.id!==receiver.id&&device.ports.some(port=>port.ipAddress===pdu.payload.dhcpProbeIp&&port.macAddress===pdu.sourceMac))
        const reason=`DHCP address conflict: ${pdu.payload.dhcpProbeIp} is already in use${conflictOwner?` by ${conflictOwner.name}`:` by ${pdu.sourceMac}`}. The client rejected the offered address.`
        failDhcp(pdu,reason)
        packetDeliveries.push({packetId:packet.id,status:'dropped',receiverDeviceId:receiver.id,reason})
      } else if (pdu.payload.arpType === 'request' && localIp) {
        learnArp(receiver, logicalPort, pdu.sourceIp, pdu.sourceMac)
        const reply: PacketPdu = {
          ...pdu, id: packetId('arp-reply'), summary: `ARP: ${localIp.ipAddress} is at ${localIp.macAddress}`,
          sourceMac: localIp.macAddress, destMac: pdu.sourceMac, sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp,
          payload: { arpType: 'reply', targetIp: pdu.sourceIp, targetMac: pdu.sourceMac, pingTargetIp: pdu.payload.pingTargetIp,
            dhcpRequestId:pdu.payload.dhcpRequestId,dhcpClientDeviceId:pdu.payload.dhcpClientDeviceId,dhcpClientPortId:pdu.payload.dhcpClientPortId,
            dhcpServerDeviceId:pdu.payload.dhcpServerDeviceId,dhcpProbeIp:pdu.payload.dhcpProbeIp,assignedIp:pdu.payload.assignedIp,
            dhcpSubnetMask:pdu.payload.dhcpSubnetMask,dhcpGateway:pdu.payload.dhcpGateway,dhcpDnsServer:pdu.payload.dhcpDnsServer,dhcpLeaseDurationSeconds:pdu.payload.dhcpLeaseDurationSeconds },
          explanation: { ...pdu.explanation, layer2: `Unicast ARP reply: ${localIp.macAddress} to ${pdu.sourceMac}.`, layer3: `ARP: ${localIp.ipAddress} is at ${localIp.macAddress}.`, deviceDecision: `${receiver.name} owns the requested IP and replies to the requester.` },
        }
        enqueue(onWire(receiver, receivingPort, link, reply, 0, subinterface ? (subinterface.dot1qNative ? undefined : subinterface.dot1qVlan) : egressVlan(receivingPort,vlan)))
      } else if (pdu.payload.arpType === 'reply' && localIp) {
        learnArp(receiver, logicalPort, pdu.sourceIp, pdu.sourceMac)
        const pending = pdu.pendingPacket || (pdu.payload.pingTargetIp ? createIcmpEchoPdu(receiver, logicalPort.id, pdu.sourceMac, pdu.payload.pingTargetIp) : undefined)
        if (pending&&!sendIp(byId.get(receiver.id)!,{...pending,pingId:pdu.pingId},hops,packet))continue
      }
    } else {
      if (localIp) {
        if (pdu.protocol === 'GRE') {
          if (pdu.payload.greKeepaliveType === 'reply') {
            const tunnel = receiver.ports.find(port => {
              if (!port.isGreTunnel || !port.greKeepalivePeriodSeconds || port.name !== pdu.payload.greKeepaliveTunnel) return false
              const source = receiver.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === port.greSourceInterface || candidate.shortName === port.greSourceInterface || candidate.id === port.greSourceInterface))
              return port.greDestinationIp === pdu.sourceIp && source?.ipAddress === pdu.destIp
            })
            if (!tunnel || !Number.isInteger(pdu.payload.greKeepaliveSequence)) {
              drop(packet, `GRE keepalive reply ${pdu.sourceIp} to ${pdu.destIp} has no matching configured tunnel.`)
              continue
            }
            const edited = editDevice(receiver.id)
            const liveTunnel = edited.ports.find(port => port.id === tunnel.id)!
            liveTunnel.greKeepaliveMissed = 0
            liveTunnel.greKeepaliveOperational = true
            packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} received GRE keepalive reply ${pdu.payload.greKeepaliveSequence} for ${liveTunnel.name}; line protocol is up.` })
            continue
          }
          if (pdu.payload.greKeepaliveType === 'request') {
            const tunnel = receiver.type === 'router' && receiver.ports.find(port => {
              if (!port.isGreTunnel || port.adminStatus !== 'up' || port.greMode !== 'gre ip' || port.greDestinationIp !== pdu.sourceIp) return false
              const source = receiver.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === port.greSourceInterface || candidate.shortName === port.greSourceInterface || candidate.id === port.greSourceInterface))
              return source?.ipAddress === pdu.destIp && isUp(receiver, source)
            })
            if (!tunnel) {
              drop(packet, `GRE keepalive request ${pdu.sourceIp} to ${pdu.destIp} has no matching configured tunnel.`)
              continue
            }
            sendGreKeepalive(receiver, tunnel, 'reply', pdu.payload.greKeepaliveSequence ?? 0, pdu.payload.greKeepaliveTunnel ?? tunnel.name)
            packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} replied to GRE keepalive ${pdu.payload.greKeepaliveSequence ?? 0} on ${tunnel.name}, including while its own keepalive state is down.` })
            continue
          }
          const tunnel = receiver.type === 'router' && receiver.ports.find(port => {
            if (!port.isGreTunnel || !isUp(receiver, port) || port.greDestinationIp !== pdu.sourceIp) return false
            const source = receiver.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === port.greSourceInterface || candidate.shortName === port.greSourceInterface || candidate.id === port.greSourceInterface))
            return source?.ipAddress === pdu.destIp
          })
          const inner = pdu.payload.greInnerPacket
          if (!tunnel || !inner || inner.protocol === 'GRE') {
            drop(packet, `GRE packet ${pdu.sourceIp} to ${pdu.destIp} has no matching operational tunnel or valid inner packet.`)
            continue
          }
          if (inner.protocol === 'OSPF') {
            const received = receiveOspfPacket(byId.get(receiver.id)!, tunnel, inner)
            updatedDevices[deviceIndices.get(receiver.id)!] = received.device
            byId.set(receiver.id, received.device); mutable.add(receiver.id)
            if (received.reason) drop(packet, received.reason)
            else {
              received.outbound.forEach(sendControl)
              packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} decapsulated and processed OSPF ${inner.payload.ospf?.type ?? 'control'} on ${tunnel.name}.` })
            }
            continue
          }
          if (inner.protocol === 'RIP') {
            const received = receiveRipPacket(byId.get(receiver.id)!, tunnel, inner)
            updatedDevices[deviceIndices.get(receiver.id)!] = received.device
            byId.set(receiver.id, received.device); mutable.add(receiver.id)
            if (received.reason) drop(packet, received.reason)
            else {
              received.outbound.forEach(sendControl)
              packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} decapsulated and processed RIP ${inner.payload.rip?.command ?? 'control'} on ${tunnel.name}.` })
            }
            continue
          }
          if (inner.protocol === 'EIGRP') {
            const received = receiveEigrpPacket(byId.get(receiver.id)!, tunnel, inner)
            updatedDevices[deviceIndices.get(receiver.id)!] = received.device
            byId.set(receiver.id, received.device); mutable.add(receiver.id)
            if (received.reason) drop(packet, received.reason)
            else {
              received.outbound.forEach(sendControl)
              packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} decapsulated and processed EIGRP ${inner.payload.eigrp?.type ?? 'control'} on ${tunnel.name}.` })
            }
            continue
          }
          if (inner.protocol === 'BGP' && hasBgp(byId.get(receiver.id)!) && receiver.ports.some(port => port.ipAddress === inner.destIp)) {
            const received = receiveBgpPacket(byId.get(receiver.id)!, tunnel, inner)
            updatedDevices[deviceIndices.get(receiver.id)!] = received.device
            byId.set(receiver.id, received.device); mutable.add(receiver.id)
            received.outbound.forEach(sendBgp)
            if (received.reason) drop(packet, received.reason)
            else packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} decapsulated and processed BGP ${inner.payload.bgp?.type ?? 'control'} on ${tunnel.name}.` })
            continue
          }
          if (receiver.config.ipRouting === false) { drop(packet, `IP routing is disabled on ${receiver.name}; GRE traffic cannot be forwarded.`); continue }
          if (inner.ttl <= 1) { drop(packet, `Inner IPv4 TTL expired while decapsulating GRE on ${receiver.name}.`); continue }
          const decapsulated: PacketPdu = {
            ...inner, ttl: inner.ttl - 1, sourceMac: receivingPort.macAddress, destMac: '00:00:00:00:00:00',
            summary: `GRE: Decapsulate ${inner.protocol} ${inner.sourceIp} to ${inner.destIp} on ${tunnel.name}`,
            explanation: { ...inner.explanation, layer3: `Inner IPv4 packet continues with TTL ${inner.ttl - 1}.`, deviceDecision: `${receiver.name} validates ${tunnel.name}, removes the outer GRE header, and routes the inner packet.` },
          }
          packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} decapsulated GRE on ${tunnel.name}.` })
          sendIp(byId.get(receiver.id)!, decapsulated, hops, packet)
          continue
        }
        if (pdu.protocol === 'TCP') acknowledgeTcpTransmission(pdu)
        if (pdu.protocol === 'TCP' && pdu.payload.tcpApplication === 'RAW' && pdu.payload.tcpFlags) {
          const tcp = pdu.payload
          const servicePort = tcp.tcpDestinationPort ?? 0
          const clientPort = tcp.tcpSourcePort ?? 49152
          const localAddress = localIp?.ipAddress ?? pdu.destIp
          const sendTcp = (segment: PacketPdu) => sendIp(byId.get(receiver.id)!, segment, 0, packet)
          if (tcp.tcpFlags === 'SYN') {
            const listener = servicePort === 80 && receiver.type === 'server' && receiver.config.httpServiceEnabled === true
            const response = createTcpSegment(pdu, {
              flags: listener ? 'SYN-ACK' : 'RST-ACK', sourceDeviceId: receiver.id, serverDeviceId: receiver.id,
              sourcePort: servicePort, destinationPort: clientPort,
              sequence: 1, acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
              summary: listener ? `TCP SYN-ACK from ${localAddress}:${servicePort}` : `TCP RST-ACK: no listener on ${localAddress}:${servicePort}`,
              detail: listener ? `${receiver.name} accepts the injected TCP connection on port ${servicePort}.` : `No TCP application listens on ${localAddress}:${servicePort}.`,
              errorReason: listener ? undefined : `No TCP application listens on ${localAddress}:${servicePort}.`,
            })
            if (!sendTcp(response)) continue
          } else if (tcp.tcpFlags === 'SYN-ACK' && receiver.id === tcp.tcpClientDeviceId) {
            const acknowledgement = createTcpSegment(pdu, {
              flags: 'ACK', sourceDeviceId: receiver.id, serverDeviceId: tcp.tcpServerDeviceId,
              sourcePort: clientPort, destinationPort: servicePort,
              sequence: tcp.tcpAcknowledgmentNumber ?? 1, acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
              summary: `TCP ACK to ${tcp.tcpServerIp ?? pdu.sourceIp}:${servicePort}`,
              detail: `${receiver.name} completes the handshake for the injected TCP connection.`,
            })
            if (!sendTcp(acknowledgement)) continue
          }
        }
        if (pdu.protocol === 'TCP' && pdu.payload.tcpApplication === 'HTTP' && pdu.payload.httpRequestId) {
          const tcp = pdu.payload
          const requestId = tcp.httpRequestId
          if (!requestId) continue
          const clientDeviceId = tcp.tcpClientDeviceId ?? tcp.httpSourceDeviceId
          const serverDeviceId = tcp.tcpServerDeviceId
          const isClient = receiver.id === clientDeviceId
          const isServer = receiver.id === serverDeviceId
          const serverInitialSequence = tcp.tcpServerInitialSequence ?? 1
          const sendTcp = (segment: PacketPdu) => sendIp(byId.get(receiver.id)!, segment, 0, packet)
          const httpServiceError = () => receiver.type !== 'server'
            ? `${receiver.name} has no HTTP service at ${localIp.ipAddress}:80.`
            : tcp.tcpDestinationPort !== 80
              ? `No TCP service is listening on ${localIp.ipAddress}:${tcp.tcpDestinationPort ?? 'unknown'}.`
              : !receiver.config.httpServiceEnabled
                ? `HTTP service is disabled on ${receiver.name} at ${localIp.ipAddress}:80.`
                : undefined
          const resetHttpConnection = (reason: string) => {
            const reset = createTcpSegment(pdu, {
              flags: 'RST-ACK', sourceDeviceId: receiver.id, serverDeviceId: receiver.id,
              sourcePort: tcp.tcpDestinationPort ?? 80, destinationPort: tcp.tcpSourcePort ?? 49152,
              sequence: tcp.tcpAcknowledgmentNumber || serverInitialSequence,
              acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + (tcp.tcpDataLength ?? 0) + (tcp.tcpFlags === 'SYN' ? 1 : 0)) >>> 0,
              summary: `TCP RST-ACK: ${reason}`, detail: reason, errorReason: reason,
            })
            return sendTcp(reset)
          }
          const acknowledgeTcpData = (acknowledgment: number, description: string) => {
            const ack = createTcpSegment(pdu, {
              flags: 'ACK', sourceDeviceId: receiver.id, serverDeviceId,
              sourcePort: tcp.tcpDestinationPort ?? (isServer ? 80 : 49152),
              destinationPort: tcp.tcpSourcePort ?? (isServer ? 49152 : 80),
              sequence: tcp.tcpAcknowledgmentNumber ?? 1, acknowledgment,
              summary: `TCP ACK: ${description}`, detail: `${receiver.name} acknowledges contiguous TCP data.`,
            })
            return sendTcp(ack)
          }

          if (tcp.tcpFlags === 'SYN' && isServer) {
            const failure = httpServiceError()
            if (failure) {
              if (!resetHttpConnection(failure)) continue
            } else {
              const synAck = createTcpSegment(pdu, {
                flags: 'SYN-ACK', sourceDeviceId: receiver.id, serverDeviceId: receiver.id,
                sourcePort: tcp.tcpDestinationPort ?? 80, destinationPort: tcp.tcpSourcePort ?? 49152,
                sequence: serverInitialSequence, acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
                summary: `TCP SYN-ACK from ${localIp.ipAddress}:80`, detail: `${receiver.name} accepts the TCP connection for HTTP.`,
              })
              if (!sendTcp(synAck)) continue
            }
          } else if (tcp.tcpFlags === 'SYN-ACK' && isClient) {
            const requestAlreadyStarted = tcpOutstandingSegments.some(segment => segment.requestId === requestId && (
              segment.ownerDeviceId === receiver.id && segment.pdu.payload.httpMethod === 'GET' ||
              segment.pdu.payload.httpMethod === 'RESPONSE' || segment.pdu.payload.tcpFlags === 'FIN-ACK'
            )) || tcpReceiveBuffers.some(buffer => buffer.requestId === requestId && buffer.kind === 'http-response') ||
              applicationResults.some(result => result.requestId === requestId)
            if (requestAlreadyStarted) {
              acknowledgeTcpData(((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0, 'duplicate SYN-ACK')
            } else {
              const path = tcp.httpPath ?? '/'
              const host = tcp.tcpServerIp ?? pdu.sourceIp
              const requestText = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`
              const chunks = splitUtf8Segments(requestText)
              let offset = 0
              for (let index = 0; index < chunks.length; index++) {
                const chunk = chunks[index]
                const dataLength = new TextEncoder().encode(chunk).byteLength
                const request = createTcpSegment(pdu, {
                  flags: 'ACK+PSH', sourceDeviceId: receiver.id, serverDeviceId,
                  sourcePort: tcp.tcpDestinationPort ?? 49152, destinationPort: tcp.tcpSourcePort ?? 80,
                  sequence: ((tcp.tcpAcknowledgmentNumber ?? 1) + offset) >>> 0, acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
                  dataLength, dataChunk: chunk, segmentIndex: index, segmentCount: chunks.length, segmentOffset: offset,
                  httpMethod: 'GET', httpPath: path,
                  summary: `TCP ACK+PSH: HTTP GET ${path}, segment ${index + 1}/${chunks.length}`,
                  detail: `${receiver.name} completes the handshake and sends HTTP request segment ${index + 1} of ${chunks.length}.`,
                })
                if (!sendTcp(request)) break
                offset += dataLength
              }
            }
          } else if (tcp.tcpFlags === 'ACK+PSH' && tcp.httpMethod === 'GET' && isServer) {
            const failure = httpServiceError()
            if (failure) {
              if (!resetHttpConnection(failure)) continue
            } else {
              const requestBuffer = tcpReceiveBuffers.find(buffer => buffer.requestId === requestId && buffer.kind === 'http-request')
              const requestAlreadyComplete = requestBuffer !== undefined && Array.from({ length: requestBuffer.expectedSegments }, (_, index) => requestBuffer.segments[index] !== undefined).every(Boolean)
              const received = receiveTcpData(packet, 'http-request', tcp.httpRequestChunk ?? '', true)
              if (!received) continue
              if (!acknowledgeTcpData(received.acknowledgment, `HTTP request segment ${(tcp.tcpSegmentIndex ?? 0) + 1}`)) continue
              if (requestAlreadyComplete) {
                packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} acknowledged a retransmitted HTTP request without starting a second response.` })
                continue
              }
              if (!received.complete || received.data === undefined || received.totalBytes === undefined) {
                packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} buffered an HTTP request segment.` })
                continue
              }
              const configuredBody = receiver.config.htmlContent || '<h1>wireX Web Server</h1><p>HTTP service operational.</p>'
              const tooLarge = new TextEncoder().encode(configuredBody).byteLength > 65536
              const body = tooLarge ? '<h1>413 Content Too Large</h1>' : configuredBody
              const status = tooLarge ? 413 : 200
              const responseChunks = splitUtf8Segments(body)
              let responseOffset = 0
              const clientNext = (received.totalBytes + ((tcp.tcpSequenceNumber ?? 0) - (tcp.tcpSegmentOffset ?? 0))) >>> 0
              const responseSequence = tcp.tcpAcknowledgmentNumber ?? serverInitialSequence
              for (let index = 0; index < responseChunks.length; index++) {
                const chunk = responseChunks[index]
                const dataLength = new TextEncoder().encode(chunk).byteLength
                const response = createTcpSegment(pdu, {
                  flags: 'ACK+PSH', sourceDeviceId: receiver.id, serverDeviceId: receiver.id,
                  sourcePort: tcp.tcpDestinationPort ?? 80, destinationPort: tcp.tcpSourcePort ?? 49152,
                  sequence: (responseSequence + responseOffset) >>> 0, acknowledgment: clientNext,
                  dataLength, dataChunk: chunk, segmentIndex: index, segmentCount: responseChunks.length, segmentOffset: responseOffset,
                  httpMethod: 'RESPONSE', httpPath: tcp.httpPath, httpResponse: chunk, httpStatus: status,
                  summary: `TCP ACK+PSH: HTTP ${status} response segment ${index + 1}/${responseChunks.length} for ${tcp.httpPath ?? '/'}`,
                  detail: `${receiver.name} returns HTTP status ${status}, segment ${index + 1} of ${responseChunks.length}.`,
                })
                if (!sendTcp(response)) break
                responseOffset += dataLength
              }
            }
          } else if (tcp.tcpFlags === 'ACK+PSH' && tcp.httpMethod === 'RESPONSE' && isClient) {
            const received = receiveTcpData(packet, 'http-response', tcp.httpResponse ?? '')
            if (!received) continue
            if (!received.complete || received.data === undefined || received.totalBytes === undefined) {
              if (!acknowledgeTcpData(received.acknowledgment, `HTTP response segment ${(tcp.tcpSegmentIndex ?? 0) + 1}`)) continue
              packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} buffered an HTTP response segment.` })
              continue
            }
            const status = received.httpStatus ?? tcp.httpStatus ?? 500
            if (!applicationResults.some(result => result.requestId === requestId)) {
              applicationResults.push({ requestId, sourceDeviceId: receiver.id, status: status === 200 ? 'successful' : 'failed', response: received.data, httpStatus: status, reason: status === 200 ? undefined : `HTTP ${status}.` })
            }
            const clientNext = tcp.tcpAcknowledgmentNumber ?? 0
            const serverNext = (received.acknowledgment) >>> 0
            const fin = createTcpSegment(pdu, {
              flags: 'FIN-ACK', sourceDeviceId: receiver.id, serverDeviceId,
              sourcePort: tcp.tcpDestinationPort ?? 49152, destinationPort: tcp.tcpSourcePort ?? 80,
              sequence: clientNext, acknowledgment: serverNext,
              summary: `TCP FIN-ACK from ${receiver.name}`, detail: `${receiver.name} closes its HTTP connection after receiving the response.`,
            })
            if (!sendTcp(fin)) continue
          } else if (tcp.tcpFlags === 'RST-ACK' && isClient) {
            if (!applicationResults.some(result => result.requestId === requestId)) {
              applicationResults.push({ requestId, sourceDeviceId: receiver.id, status: 'failed', reason: tcp.tcpErrorReason ?? 'The remote host reset the TCP connection.' })
            }
          } else if (tcp.tcpFlags === 'FIN-ACK' && isServer) {
            const fin = createTcpSegment(pdu, {
              flags: 'FIN-ACK', sourceDeviceId: receiver.id, serverDeviceId: receiver.id,
              sourcePort: tcp.tcpDestinationPort ?? 80, destinationPort: tcp.tcpSourcePort ?? 49152,
              sequence: tcp.tcpAcknowledgmentNumber ?? serverInitialSequence,
              acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
              summary: `TCP FIN-ACK from ${receiver.name}`, detail: `${receiver.name} acknowledges the client close and closes its half of the TCP session.`,
            })
            if (!sendTcp(fin)) continue
          } else if (tcp.tcpFlags === 'FIN-ACK' && isClient) {
            const ack = createTcpSegment(pdu, {
              flags: 'ACK', sourceDeviceId: receiver.id, serverDeviceId,
              sourcePort: tcp.tcpDestinationPort ?? 49152, destinationPort: tcp.tcpSourcePort ?? 80,
              sequence: tcp.tcpAcknowledgmentNumber ?? 1, acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
              summary: `TCP ACK: connection closed by ${receiver.name}`, detail: `${receiver.name} acknowledges the server close and completes the TCP session teardown.`,
            })
            if (!sendTcp(ack)) continue
          }
        } else if (pdu.protocol === 'TCP' && (pdu.payload.tcpApplication === 'SMTP' || pdu.payload.tcpApplication === 'POP3') && pdu.payload.tcpRequestId) {
          const tcp = pdu.payload
          const requestId = tcp.tcpRequestId!
          const application = tcp.tcpApplication!
          const action = tcp.emailAction ?? (application === 'SMTP' ? 'send' : 'retrieve')
          const servicePort = application === 'SMTP' ? 25 : 110
          const clientDeviceId = tcp.tcpClientDeviceId
          const serverDeviceId = tcp.tcpServerDeviceId
          const isClient = receiver.id === clientDeviceId
          const isServer = receiver.id === serverDeviceId
          const serverInitialSequence = tcp.tcpServerInitialSequence ?? 1
          const sendTcp = (segment: PacketPdu) => sendIp(byId.get(receiver.id)!, segment, 0, packet)
          const serviceFailure = () => receiver.type !== 'server'
            ? `${receiver.name} has no ${application} service at ${localIp.ipAddress}:${servicePort}.`
            : (tcp.tcpDestinationPort ?? servicePort) !== servicePort
              ? `No TCP service is listening on ${localIp.ipAddress}:${tcp.tcpDestinationPort ?? 'unknown'}.`
              : application === 'SMTP' && !receiver.config.emailService?.smtpEnabled
                ? `SMTP service is disabled on ${receiver.name} at ${localIp.ipAddress}:25.`
                : application === 'POP3' && !receiver.config.emailService?.pop3Enabled
                  ? `POP3 service is disabled on ${receiver.name} at ${localIp.ipAddress}:110.`
                  : undefined
          const resetConnection = (reason: string) => sendTcp(createTcpSegment(pdu, {
            flags: 'RST-ACK', sourceDeviceId: receiver.id, serverDeviceId: receiver.id,
            sourcePort: tcp.tcpDestinationPort ?? servicePort, destinationPort: tcp.tcpSourcePort ?? 49_152,
            sequence: tcp.tcpAcknowledgmentNumber || serverInitialSequence,
            acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + (tcp.tcpDataLength ?? 0) + (tcp.tcpFlags === 'SYN' ? 1 : 0)) >>> 0,
            summary: `TCP RST-ACK: ${reason}`, detail: reason, errorReason: reason,
          }))
          const acknowledgeTcpData = (acknowledgment: number, description: string) => sendTcp(createTcpSegment(pdu, {
            flags: 'ACK', sourceDeviceId: receiver.id, serverDeviceId,
            sourcePort: tcp.tcpDestinationPort ?? (isServer ? servicePort : 49_152),
            destinationPort: tcp.tcpSourcePort ?? (isServer ? 49_152 : servicePort),
            sequence: tcp.tcpAcknowledgmentNumber ?? 1, acknowledgment,
            summary: `TCP ACK: ${description}`, detail: `${receiver.name} acknowledges contiguous TCP data.`,
          }))

          if (tcp.tcpFlags === 'SYN' && isServer) {
            const failure = serviceFailure()
            if (failure) {
              if (!resetConnection(failure)) continue
            } else {
              const synAck = createTcpSegment(pdu, {
                flags: 'SYN-ACK', sourceDeviceId: receiver.id, serverDeviceId: receiver.id,
                sourcePort: servicePort, destinationPort: tcp.tcpSourcePort ?? 49_152,
                sequence: serverInitialSequence, acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
                summary: `TCP SYN-ACK from ${localIp.ipAddress}:${servicePort}`,
                detail: `${receiver.name} accepts the TCP ${application} connection.`,
              })
              if (!sendTcp(synAck)) continue
            }
          } else if (tcp.tcpFlags === 'SYN-ACK' && isClient) {
            const isSameEmailSession = (candidate: PacketPdu) => application !== 'POP3' || (action !== 'retrieve' && action !== 'delete') || candidate.payload.emailPop3Phase === tcp.emailPop3Phase
            const alreadyStarted = tcpOutstandingSegments.some(segment => segment.requestId === requestId && segment.pdu.payload.tcpDataKind === 'request' && isSameEmailSession(segment.pdu)) ||
              tcpReceiveBuffers.some(buffer => buffer.requestId === requestId && buffer.kind === 'application-response') ||
              emailResults.some(result => result.requestId === requestId)
            if (alreadyStarted) {
              acknowledgeTcpData(((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0, 'duplicate email SYN-ACK')
            } else {
              const sessionCommand = application === 'POP3' && tcp.emailPop3Phase === 'session'
                ? pop3SessionCommand(tcp.emailPop3TurnIndex ?? 0, action === 'delete' ? 'delete' : 'retrieve', tcp.emailUsername ?? '', tcp.emailPassword ?? '', tcp.emailPop3MessageIds ?? [], tcp.emailMessageId ?? '')
                : undefined
              const requestText = application === 'POP3' && tcp.emailPop3Phase === 'session'
                ? sessionCommand ? `${sessionCommand}\r\n` : ''
                : application === 'SMTP'
                ? buildSmtpSubmissionTranscript({
                  requestId, username: tcp.emailUsername ?? '', password: tcp.emailPassword ?? '',
                  from: tcp.emailFrom ?? '', to: tcp.emailTo ?? '', subject: tcp.emailSubject ?? '', body: tcp.emailBody ?? '',
                })
                : application === 'POP3' && action === 'retrieve'
                  ? tcp.emailPop3Phase === 'fetch'
                    ? buildPop3FetchTranscript({ username: tcp.emailUsername ?? '', password: tcp.emailPassword ?? '', messageIds: tcp.emailPop3MessageIds ?? [] })
                    : buildPop3ListTranscript({ username: tcp.emailUsername ?? '', password: tcp.emailPassword ?? '' })
                  : application === 'POP3' && action === 'delete' && tcp.emailPop3Phase === 'delete-commit'
                    ? buildPop3DeleteTranscript({ username: tcp.emailUsername ?? '', password: tcp.emailPassword ?? '', messageIds: tcp.emailPop3MessageIds ?? [], messageId: tcp.emailMessageId ?? '' })
                    : application === 'POP3' && action === 'delete'
                      ? buildPop3ListTranscript({ username: tcp.emailUsername ?? '', password: tcp.emailPassword ?? '' })
                  : JSON.stringify({
                  action, username: tcp.emailUsername, password: tcp.emailPassword,
                  from: tcp.emailFrom, to: tcp.emailTo, subject: tcp.emailSubject, body: tcp.emailBody,
                  messageId: tcp.emailMessageId,
                })
              if (!requestText) {
                if (!emailResults.some(result => result.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'failed', reason: 'POP3 could not continue because the UIDL response did not contain the requested mailbox message.' })
                continue
              }
              const chunks = splitUtf8Segments(requestText)
              let offset = 0
              for (let index = 0; index < chunks.length; index++) {
                const chunk = chunks[index]
                const dataLength = new TextEncoder().encode(chunk).byteLength
                const request = createTcpSegment(pdu, {
                  flags: 'ACK+PSH', sourceDeviceId: receiver.id, serverDeviceId,
                  sourcePort: tcp.tcpDestinationPort ?? 49_152, destinationPort: servicePort,
                  sequence: ((tcp.tcpAcknowledgmentNumber ?? 1) + offset) >>> 0,
                  acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
                  dataLength, dataChunk: chunk, segmentIndex: index, segmentCount: chunks.length, segmentOffset: offset,
                  httpMethod: 'EMAIL-REQUEST', tcpDataKind: 'request',
                  summary: `TCP ACK+PSH: ${application} request segment ${index + 1}/${chunks.length}`,
                  detail: `${receiver.name} sends ${application} request data segment ${index + 1} of ${chunks.length}.`,
                })
                if (!sendTcp(request)) break
                offset += dataLength
              }
            }
          } else if (tcp.tcpFlags === 'ACK+PSH' && tcp.tcpDataKind === 'request' && isServer) {
            const failure = serviceFailure()
            if (failure) {
              if (!resetConnection(failure)) continue
            } else {
              const kind = 'application-request' as const
              const previous = tcpReceiveBuffers.find(buffer => buffer.requestId === requestId && buffer.kind === kind)
              const wasComplete = previous !== undefined && Array.from({ length: previous.expectedSegments }, (_, index) => previous.segments[index] !== undefined).every(Boolean)
              const received = receiveTcpData(packet, kind, tcp.tcpDataChunk ?? '')
              if (!received) continue
              if (!acknowledgeTcpData(received.acknowledgment, `${application} request segment ${(tcp.tcpSegmentIndex ?? 0) + 1}`)) continue
              if (wasComplete) {
                packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} acknowledged a retransmitted ${application} request without delivering it twice.` })
                continue
              }
              if (!received.complete || received.data === undefined || received.totalBytes === undefined) {
                packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} buffered a ${application} request segment.` })
                continue
              }

              let responseText: string
              let pop3SessionStateForResponse: Pop3SessionState | undefined
              let pop3CommittedDeletedIdsForResponse: string[] | undefined
              if (application === 'SMTP' && action === 'send') {
                const service = byId.get(receiver.id)?.config.emailService
                const smtpResult = processSmtpSubmissionTranscript(received.data, service, requestId, simulationTick)
                if (smtpResult.message && service) {
                  const recipientUsername = smtpResult.message.to.slice(0, smtpResult.message.to.indexOf('@'))
                  const edited = editDevice(receiver.id)
                  edited.config.emailService = {
                    ...service,
                    users: service.users.map(candidate => candidate.username.toLowerCase() === recipientUsername
                      ? { ...candidate, mailbox: [...candidate.mailbox, smtpResult.message!] }
                      : candidate),
                  }
                }
                responseText = smtpResult.transcript
              } else if (application === 'POP3' && tcp.emailPop3Phase === 'session') {
                const service = byId.get(receiver.id)?.config.emailService
                const currentSessionState = tcp.emailPop3SessionState ?? createPop3Session().state
                const commandText = received.data.endsWith('\r\n') ? received.data.slice(0, -2) : received.data
                const result = processPop3Command(commandText, service, currentSessionState)
                responseText = result.response
                pop3SessionStateForResponse = result.state
                pop3CommittedDeletedIdsForResponse = result.committedDeletedMessageIds
                if (result.committedDeletedMessageIds?.length && currentSessionState.phase === 'transaction' && service) {
                  const deletedIds = new Set(result.committedDeletedMessageIds)
                  const edited = editDevice(receiver.id)
                  edited.config.emailService = {
                    ...service,
                    users: service.users.map(candidate => candidate.username.toLowerCase() === currentSessionState.username.toLowerCase()
                      ? { ...candidate, mailbox: candidate.mailbox.filter(message => !deletedIds.has(message.id)) }
                      : candidate),
                  }
                }
              } else if (application === 'POP3' && action === 'retrieve') {
                const service = byId.get(receiver.id)?.config.emailService
                responseText = tcp.emailPop3Phase === 'fetch'
                  ? processPop3FetchTranscript(received.data, service, tcp.emailPop3MessageIds ?? [])
                  : processPop3ListTranscript(received.data, service)
              } else if (application === 'POP3' && action === 'delete') {
                const service = byId.get(receiver.id)?.config.emailService
                if (tcp.emailPop3Phase === 'delete-commit') {
                  const deletion = processPop3DeleteTranscript(received.data, service, tcp.emailPop3MessageIds ?? [], tcp.emailMessageId ?? '')
                  if (deletion.deletedMessageId && service) {
                    const username = (tcp.emailUsername ?? '').toLowerCase()
                    const edited = editDevice(receiver.id)
                    edited.config.emailService = {
                      ...service,
                      users: service.users.map(candidate => candidate.username.toLowerCase() === username
                        ? { ...candidate, mailbox: candidate.mailbox.filter(message => message.id !== deletion.deletedMessageId) }
                        : candidate),
                    }
                  }
                  responseText = deletion.response
                } else {
                  responseText = processPop3ListTranscript(received.data, service)
                }
              } else {
                let response: { ok: boolean; reason?: string; message?: EmailMessage; messages?: EmailMessage[] }
                try {
                  const request = JSON.parse(received.data) as { action?: string; username?: string; password?: string; messageId?: string }
                  const service = byId.get(receiver.id)?.config.emailService
                  const username = request.username ?? ''
                  const user = service?.users.find(candidate => candidate.username === username && candidate.password === request.password)
                  if (!service || !user) response = { ok: false, reason: 'Email authentication failed. Check the username and password on the mail server.' }
                  else if (application === 'POP3' && request.action === 'retrieve' && action === 'retrieve') {
                  const messages = user.mailbox
                  if (new TextEncoder().encode(JSON.stringify(messages)).byteLength > 65_536) response = { ok: false, reason: 'POP3 mailbox exceeds the 64 KiB transfer limit. Remove or archive messages before checking mail.' }
                  else response = { ok: true, messages }
                  } else if (application === 'POP3' && request.action === 'delete' && action === 'delete') {
                    const messageId = typeof request.messageId === 'string' ? request.messageId : ''
                    if (!messageId) response = { ok: false, reason: 'POP3 deletion requires a message ID from the selected inbox message.' }
                    else if (!user.mailbox.some(message => message.id === messageId)) response = { ok: false, reason: `POP3 message ${messageId} was not found in ${username}@${service.domain}.` }
                    else {
                      const edited = editDevice(receiver.id)
                      edited.config.emailService = {
                        ...service,
                        users: service.users.map(candidate => candidate.username === username
                          ? { ...candidate, mailbox: candidate.mailbox.filter(message => message.id !== messageId) }
                          : candidate),
                      }
                      response = { ok: true }
                    }
                  } else response = { ok: false, reason: `${application} cannot process the requested email operation.` }
                } catch {
                  response = { ok: false, reason: 'The email request was malformed and could not be processed.' }
                }
                responseText = JSON.stringify(response)
              }
              const responseChunks = splitUtf8Segments(responseText)
              let responseOffset = 0
              const clientNext = (received.totalBytes + ((tcp.tcpSequenceNumber ?? 0) - (tcp.tcpSegmentOffset ?? 0))) >>> 0
              const responseSequence = tcp.tcpAcknowledgmentNumber ?? serverInitialSequence
              for (let index = 0; index < responseChunks.length; index++) {
                const chunk = responseChunks[index]
                const dataLength = new TextEncoder().encode(chunk).byteLength
                const segment = createTcpSegment(pdu, {
                  flags: 'ACK+PSH', sourceDeviceId: receiver.id, serverDeviceId: receiver.id,
                  sourcePort: servicePort, destinationPort: tcp.tcpSourcePort ?? 49_152,
                  sequence: (responseSequence + responseOffset) >>> 0, acknowledgment: clientNext,
                  dataLength, dataChunk: chunk, segmentIndex: index, segmentCount: responseChunks.length, segmentOffset: responseOffset,
                  httpMethod: 'EMAIL-RESPONSE', tcpDataKind: 'response',
                  summary: `TCP ACK+PSH: ${application} response segment ${index + 1}/${responseChunks.length}`,
                  detail: `${receiver.name} returns ${application} response data segment ${index + 1} of ${responseChunks.length}.`,
                })
                if (tcp.emailPop3Phase === 'session') {
                  segment.payload.emailPop3SessionState = pop3SessionStateForResponse
                  segment.payload.emailPop3CommittedDeletedMessageIds = pop3CommittedDeletedIdsForResponse
                }
                if (!sendTcp(segment)) break
                responseOffset += dataLength
              }
            }
          } else if (tcp.tcpFlags === 'ACK+PSH' && tcp.tcpDataKind === 'response' && isClient) {
            const received = receiveTcpData(packet, 'application-response', tcp.tcpDataChunk ?? '')
            if (!received) continue
            if (!received.complete || received.data === undefined) {
              if (!acknowledgeTcpData(received.acknowledgment, `${application} response segment ${(tcp.tcpSegmentIndex ?? 0) + 1}`)) continue
              packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} buffered a ${application} response segment.` })
              continue
            }
            try {
              if (application === 'SMTP' && action === 'send') {
                const result = parseSmtpServerTranscript(received.data, {
                  requestId, username: tcp.emailUsername ?? '', password: tcp.emailPassword ?? '',
                  from: tcp.emailFrom ?? '', to: tcp.emailTo ?? '', subject: tcp.emailSubject ?? '', body: tcp.emailBody ?? '',
                }, simulationTick)
                if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({
                  requestId, sourceDeviceId: receiver.id, action,
                  status: result.ok ? 'successful' : 'failed', message: result.message, reason: result.reason,
                })
              } else if (application === 'POP3' && tcp.emailPop3Phase === 'session') {
                const turn = tcp.emailPop3TurnIndex ?? 0
                const messageIds = tcp.emailPop3MessageIds ?? []
                let messages = tcp.emailPop3Messages ?? []
                const command = pop3SessionCommand(turn, action === 'delete' ? 'delete' : 'retrieve', tcp.emailUsername ?? '', tcp.emailPassword ?? '', messageIds, tcp.emailMessageId ?? '')
                const failureLine = received.data.split('\r\n').find(line => line.startsWith('-ERR '))
                let failure = failureLine?.slice(5)

                if (!failure && (!command || !received.data.startsWith('+OK '))) failure = 'POP3 server returned an invalid response for command ' + (command ?? 'unknown') + '.'
                let nextMessageIds = messageIds
                if (!failure && turn === 4) {
                  const listing = parsePop3UidlResponse(received.data)
                  if (!listing.ok) failure = listing.reason ?? 'POP3 server returned a malformed UIDL response.'
                  else nextMessageIds = listing.messageIds ?? []
                  if (!failure && action === 'delete' && !nextMessageIds.includes(tcp.emailMessageId ?? '')) failure = `POP3 message ${tcp.emailMessageId ?? ''} was not found in the current server mailbox.`
                } else if (!failure && command?.startsWith('RETR ')) {
                  const expectedId = messageIds[turn - 5]
                  const fetched = expectedId ? parsePop3RetrResponse(received.data, expectedId) : { ok: false, reason: 'POP3 RETR has no matching UIDL.' }
                  if (!fetched.ok || !fetched.messages?.[0]) failure = fetched.reason ?? 'POP3 server returned an invalid RETR response.'
                  else messages = [...messages, fetched.messages[0]]
                } else if (!failure && command?.startsWith('DELE ') && !received.data.startsWith('+OK message ')) {
                  failure = 'POP3 server did not confirm the selected message for deletion.'
                }

                if (!failure && command === 'QUIT') {
                  if (received.data !== '+OK goodbye\r\n') failure = 'POP3 server returned an invalid QUIT response.'
                  else if (action === 'delete' && !tcp.emailPop3CommittedDeletedMessageIds?.includes(tcp.emailMessageId ?? '')) failure = 'POP3 server did not commit the selected deletion at QUIT.'
                  else if (action === 'retrieve' && messages.length !== messageIds.length) failure = 'POP3 session ended before every UIDL message was retrieved.'
                  if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({
                    requestId, sourceDeviceId: receiver.id, action,
                    status: failure ? 'failed' : 'successful',
                    messages: action === 'retrieve' && !failure ? messages : undefined,
                    reason: failure,
                  })
                } else if (failure) {
                  if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'failed', reason: `POP3 ${failure}` })
                } else {
                  const nextTurn = turn + 1
                  const nextCommand = pop3SessionCommand(nextTurn, action === 'delete' ? 'delete' : 'retrieve', tcp.emailUsername ?? '', tcp.emailPassword ?? '', nextMessageIds, tcp.emailMessageId ?? '')
                  if (!nextCommand) {
                    if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'failed', reason: 'POP3 could not continue because the UIDL response did not contain the requested mailbox message.' })
                  } else {
                    const requestText = `${nextCommand}\r\n`
                    const dataLength = new TextEncoder().encode(requestText).byteLength
                    const request = createTcpSegment(pdu, {
                      flags: 'ACK+PSH', sourceDeviceId: receiver.id, serverDeviceId,
                      sourcePort: tcp.tcpDestinationPort ?? 49_152, destinationPort: servicePort,
                      sequence: tcp.tcpAcknowledgmentNumber ?? 1, acknowledgment: received.acknowledgment,
                      dataLength, dataChunk: requestText, segmentIndex: 0, segmentCount: 1, segmentOffset: 0,
                      httpMethod: 'EMAIL-REQUEST', tcpDataKind: 'request',
                      emailPop3TurnIndex: nextTurn, emailPop3MessageIds: nextMessageIds, emailPop3Messages: messages,
                      summary: `TCP ACK+PSH: POP3 ${nextCommand}`,
                      detail: `${receiver.name} sends the next POP3 command on the existing TCP connection.`,
                    })
                    if (sendTcp(request)) continue
                    if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'failed', reason: 'POP3 could not send the next command on its TCP connection.' })
                  }
                }
              } else if (application === 'POP3' && action === 'retrieve') {
                if (tcp.emailPop3Phase === 'fetch') {
                  const result = parsePop3FetchTranscript(received.data, tcp.emailPop3MessageIds ?? [])
                  if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({
                    requestId, sourceDeviceId: receiver.id, action,
                    status: result.ok ? 'successful' : 'failed', messages: result.messages, reason: result.reason,
                  })
                } else {
                  const result = parsePop3ListTranscript(received.data)
                  if (!result.ok) {
                    if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'failed', reason: result.reason })
                  } else if (!result.messageIds?.length) {
                    if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'successful', messages: [] })
                  } else {
                    const source = byId.get(receiver.id)
                    const fetchPackets = source ? createEmailPackets(source, updatedDevices, links, requestId, 'retrieve', { pop3Phase: 'fetch', messageIds: result.messageIds }) : []
                    if (!fetchPackets.length) {
                      if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'failed', reason: 'POP3 mailbox was listed, but the RETR connection could not be opened. Check the server route, ACL, power, and link status.' })
                    } else if (remaining.length + fetchPackets.length > MAX_IN_FLIGHT_PACKETS) {
                      queueLimitReached = true
                      discardedPackets += fetchPackets.length
                      if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'failed', reason: 'Packet queue is full before POP3 RETR can begin. Pause or reset the simulation before checking mail again.' })
                    } else {
                      remaining.push(...fetchPackets)
                      tcpReceiveBuffers = tcpReceiveBuffers.filter(buffer => buffer.requestId !== requestId)
                    }
                  }
                }
              } else if (application === 'POP3' && action === 'delete') {
                if (tcp.emailPop3Phase === 'delete-commit') {
                  const result = parsePop3DeleteTranscript(received.data, tcp.emailMessageId ?? '')
                  if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({
                    requestId, sourceDeviceId: receiver.id, action,
                    status: result.ok ? 'successful' : 'failed', reason: result.reason,
                  })
                } else {
                  const listing = parsePop3ListTranscript(received.data)
                  const targetMessageId = tcp.emailMessageId ?? ''
                  if (!listing.ok) {
                    if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'failed', reason: listing.reason })
                  } else if (!listing.messageIds?.includes(targetMessageId)) {
                    if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({
                      requestId, sourceDeviceId: receiver.id, action, status: 'failed',
                      reason: 'POP3 message ' + targetMessageId + ' was not found in the current server mailbox. Check mail before deleting it.',
                    })
                  } else {
                    const source = byId.get(receiver.id)
                    const deletePackets = source ? createEmailPackets(source, updatedDevices, links, requestId, 'delete', {
                      messageId: targetMessageId, pop3Phase: 'delete-commit', messageIds: listing.messageIds,
                    }) : []
                    if (!deletePackets.length) {
                      if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({
                        requestId, sourceDeviceId: receiver.id, action, status: 'failed',
                        reason: 'POP3 mailbox was listed, but the DELE connection could not be opened. Check the server route, ACL, power, and link status.',
                      })
                    } else if (remaining.length + deletePackets.length > MAX_IN_FLIGHT_PACKETS) {
                      queueLimitReached = true
                      discardedPackets += deletePackets.length
                      if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({
                        requestId, sourceDeviceId: receiver.id, action, status: 'failed',
                        reason: 'Packet queue is full before POP3 DELE can begin. Pause or reset the simulation before deleting mail.',
                      })
                    } else {
                      remaining.push(...deletePackets)
                      tcpReceiveBuffers = tcpReceiveBuffers.filter(buffer => buffer.requestId !== requestId)
                    }
                  }
                }
              } else {
                const result = JSON.parse(received.data) as { ok?: boolean; reason?: string; message?: EmailMessage; messages?: EmailMessage[] }
              if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({
                requestId, sourceDeviceId: receiver.id, action,
                status: result.ok === true ? 'successful' : 'failed',
                message: result.message, messages: result.messages,
                reason: result.ok === true ? undefined : result.reason ?? 'The mail server rejected the request.',
              })
              }
            } catch {
              if (!emailResults.some(item => item.requestId === requestId)) emailResults.push({ requestId, sourceDeviceId: receiver.id, action, status: 'failed', reason: 'The mail server returned a malformed response.' })
            }
            const fin = createTcpSegment(pdu, {
              flags: 'FIN-ACK', sourceDeviceId: receiver.id, serverDeviceId,
              sourcePort: tcp.tcpDestinationPort ?? 49_152, destinationPort: tcp.tcpSourcePort ?? servicePort,
              sequence: tcp.tcpAcknowledgmentNumber ?? 0, acknowledgment: received.acknowledgment,
              summary: `TCP FIN-ACK from ${receiver.name}`, detail: `${receiver.name} closes the ${application} connection after receiving the response.`,
            })
            if (!sendTcp(fin)) continue
          } else if (tcp.tcpFlags === 'RST-ACK' && isClient) {
            recordTcpFailure(pdu, tcp.tcpErrorReason ?? `${application} connection was reset by the server.`)
          } else if (tcp.tcpFlags === 'FIN-ACK' && isServer) {
            const fin = createTcpSegment(pdu, {
              flags: 'FIN-ACK', sourceDeviceId: receiver.id, serverDeviceId: receiver.id,
              sourcePort: servicePort, destinationPort: tcp.tcpSourcePort ?? 49_152,
              sequence: tcp.tcpAcknowledgmentNumber ?? serverInitialSequence,
              acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
              summary: `TCP FIN-ACK from ${receiver.name}`, detail: `${receiver.name} acknowledges the client close and closes its ${application} session.`,
            })
            if (!sendTcp(fin)) continue
          } else if (tcp.tcpFlags === 'FIN-ACK' && isClient) {
            const ack = createTcpSegment(pdu, {
              flags: 'ACK', sourceDeviceId: receiver.id, serverDeviceId,
              sourcePort: tcp.tcpDestinationPort ?? 49_152, destinationPort: tcp.tcpSourcePort ?? servicePort,
              sequence: tcp.tcpAcknowledgmentNumber ?? 1, acknowledgment: ((tcp.tcpSequenceNumber ?? 0) + 1) >>> 0,
              summary: `TCP ACK: connection closed by ${receiver.name}`, detail: `${receiver.name} acknowledges the server close and completes the TCP session teardown.`,
            })
            if (!sendTcp(ack)) continue
          }
        } else if (pdu.protocol === 'DNS' && pdu.payload.dnsMessageType === 'query' && pdu.payload.dnsRequestId) {
          const domain = (pdu.payload.dnsQuery ?? '').toLowerCase()
          const record = receiver.type === 'server' && receiver.config.dnsServiceEnabled
            ? receiver.config.dnsRecords?.find(item => item.domain.toLowerCase().replace(/\.$/, '') === domain)
            : undefined
          const resolved = record && isValidIpv4(record.ip) ? record.ip : undefined
          const serviceReady = receiver.type === 'server' && receiver.config.dnsServiceEnabled
          const dnsStatus = resolved ? 'resolved' : serviceReady ? 'not-found' : 'server-failure'
          const reason = dnsStatus === 'not-found' ? `${domain} does not exist in DNS records on ${receiver.name}.` : dnsStatus === 'server-failure' ? `DNS service is unavailable on ${receiver.name}.` : undefined
          const response: PacketPdu = {
            ...pdu, id: packetId('dns-response'), summary: `DNS ${dnsStatus}: ${domain}${resolved ? ` -> ${resolved}` : ''}`,
            sourceMac: localIp.macAddress, destMac: pdu.sourceMac, sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
            payload: { dnsMessageType: 'response', dnsQuery: domain, dnsResolvedIp: resolved, dnsRequestId: pdu.payload.dnsRequestId, dnsSourceDeviceId: pdu.payload.dnsSourceDeviceId, dnsStatus, udpSourcePort: 53, udpDestinationPort: pdu.payload.udpSourcePort ?? 53000 },
            explanation: { ...pdu.explanation, layer2: `DNS response from ${localIp.macAddress}.`, layer3: `IPv4: ${localIp.ipAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: source port 53 to destination port ${pdu.payload.udpSourcePort ?? 53000}. DNS ${dnsStatus.toUpperCase()}${resolved ? `: ${domain} A ${resolved}` : `: ${reason}`}.`, deviceDecision: `${receiver.name} ${serviceReady ? 'checked its configured DNS records' : 'has no enabled DNS service'} and returns a DNS response through the route to the client.` },
          }
          if (!sendIp(byId.get(receiver.id)!, response, 0, packet)) continue
        } else if (pdu.protocol === 'DNS' && pdu.payload.dnsMessageType === 'response' && pdu.payload.dnsSourceDeviceId === receiver.id && pdu.payload.dnsRequestId) {
          const resolved = pdu.payload.dnsStatus === 'resolved' && pdu.payload.dnsResolvedIp
          const reason = pdu.payload.dnsStatus === 'not-found' ? `${pdu.payload.dnsQuery ?? 'Name'} does not exist in DNS records.` : pdu.payload.dnsStatus === 'server-failure' ? 'The configured DNS server does not provide DNS service.' : undefined
          if (!dnsResults.some(result => result.requestId === pdu.payload.dnsRequestId)) dnsResults.push({ requestId: pdu.payload.dnsRequestId, sourceDeviceId: receiver.id, domain: pdu.payload.dnsQuery ?? '', status: resolved ? 'successful' : 'failed', resolvedIp: resolved ? pdu.payload.dnsResolvedIp : undefined, reason })
        } else if (pdu.protocol === 'UDP' && pdu.payload.udpMessageType === 'request' && pdu.payload.udpRequestId) {
          const destinationPort = pdu.payload.udpDestinationPort ?? 0
          const service = pdu.payload.udpService ?? 'echo'
          if (service === 'tftp') {
            if (receiver.type !== 'server' || receiver.config.tftpServiceEnabled !== true) {
              drop(packet, `TFTP service is disabled on ${receiver.name}.`)
              continue
            }
            const fileName = pdu.payload.tftpFileName
            const file = receiver.config.tftpFiles?.find(item => item.name === fileName)
            if (!file || !fileName) {
              drop(packet, `TFTP file ${fileName || '(unspecified)'} was not found on ${receiver.name}.`)
              continue
            }
            const fileByteLength = new TextEncoder().encode(file.contents).byteLength
            if (fileByteLength > MAX_TFTP_FILE_BYTES) {
              drop(packet, `TFTP file ${fileName} exceeds the ${MAX_TFTP_FILE_BYTES}-byte transfer limit.`)
              continue
            }
            const blockCount = tftpBlockCount(fileByteLength)
            if (pdu.payload.tftpMessageType === 'rrq' && destinationPort === 69) {
              const hash = Array.from(pdu.payload.udpRequestId).reduce((value, char) => (value * 33 + char.charCodeAt(0)) >>> 0, 5381)
              const transferPort = 49152 + (hash % 16384)
              const clientPort = pdu.payload.udpSourcePort ?? 49152
              const blockNumber = 1
              const blockDataHex = tftpBlockDataHex(file.contents, blockNumber)
              const response: PacketPdu = {
                ...pdu, id: packetId('tftp-data'), summary: `TFTP DATA block ${blockNumber}/${blockCount} for ${fileName} (${blockDataHex.length / 2} bytes)`,
                sourceMac: localIp.macAddress, destMac: pdu.sourceMac, sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
                payload: { udpMessageType: 'response', udpRequestId: pdu.payload.udpRequestId, udpSourceDeviceId: pdu.payload.udpSourceDeviceId, udpService: 'tftp', udpSourcePort: transferPort, udpDestinationPort: clientPort, tftpMessageType: 'data', tftpFileName: fileName, tftpBlockNumber: blockNumber, tftpBlockCount: blockCount, tftpBlockDataHex: blockDataHex },
                explanation: { ...pdu.explanation, layer2: `TFTP data from ${localIp.macAddress}.`, layer3: `IPv4: ${localIp.ipAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: server transfer port ${transferPort} to client port ${clientPort}. TFTP DATA block ${blockNumber}, ${blockDataHex.length / 2} bytes.`, deviceDecision: `${receiver.name} found ${fileName} and starts a stop-and-wait TFTP read transfer.` },
              }
              if (!sendIp(byId.get(receiver.id)!, response, 0, packet)) continue
              continue
            }
            if (pdu.payload.tftpMessageType === 'ack') {
              const blockNumber = pdu.payload.tftpBlockNumber ?? 0
              const declaredBlockCount = pdu.payload.tftpBlockCount ?? 0
              if (!Number.isInteger(blockNumber) || blockNumber < 1 || blockNumber > blockCount || declaredBlockCount !== blockCount) {
                drop(packet, `TFTP acknowledgement for ${fileName} has an invalid block number or transfer length.`)
                continue
              }
              if (blockNumber === blockCount) {
                if (!udpResults.some(result => result.requestId === pdu.payload.udpRequestId)) udpResults.push({ requestId: pdu.payload.udpRequestId, sourceDeviceId: pdu.payload.udpSourceDeviceId ?? '', targetIp: pdu.destIp, port: 69, service: 'tftp', status: 'successful', fileName, response: file.contents })
                continue
              }
              const nextBlock = blockNumber + 1
              const blockDataHex = tftpBlockDataHex(file.contents, nextBlock)
              const transferPort = pdu.payload.udpDestinationPort ?? 0
              const clientPort = pdu.payload.udpSourcePort ?? 49152
              const response: PacketPdu = {
                ...pdu, id: packetId('tftp-data'), summary: `TFTP DATA block ${nextBlock}/${blockCount} for ${fileName} (${blockDataHex.length / 2} bytes)`,
                sourceMac: localIp.macAddress, destMac: pdu.sourceMac, sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
                payload: { udpMessageType: 'response', udpRequestId: pdu.payload.udpRequestId, udpSourceDeviceId: pdu.payload.udpSourceDeviceId, udpService: 'tftp', udpSourcePort: transferPort, udpDestinationPort: clientPort, tftpMessageType: 'data', tftpFileName: fileName, tftpBlockNumber: nextBlock, tftpBlockCount: blockCount, tftpBlockDataHex: blockDataHex },
                explanation: { ...pdu.explanation, layer2: `TFTP data from ${localIp.macAddress}.`, layer3: `IPv4: ${localIp.ipAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: server transfer port ${transferPort} to client port ${clientPort}. TFTP DATA block ${nextBlock}, ${blockDataHex.length / 2} bytes.`, deviceDecision: `${receiver.name} accepted ACK block ${blockNumber} and sends the next block of ${fileName}.` },
              }
              if (!sendIp(byId.get(receiver.id)!, response, 0, packet)) continue
              continue
            }
            drop(packet, `Unsupported TFTP message for ${fileName}.`)
            continue
          }
          if (service === 'ntp') {
            const enabled = (receiver.type === 'router' || receiver.type === 'server') && receiver.config.ntpMaster === true
            const stratum = receiver.config.ntpMasterStratum ?? 8
            if (destinationPort !== 123 || !enabled || !Number.isInteger(stratum) || stratum < 1 || stratum > 15) {
              const reason = destinationPort !== 123 ? `${receiver.name} received an NTP request on UDP port ${destinationPort}, expected port 123.` : enabled ? `NTP master stratum on ${receiver.name} must be between 1 and 15.` : `NTP service is not configured on ${receiver.name}.`
              drop(packet, reason)
              continue
            }
            const receiveTimeMs = Date.now()
            const transmitTimeMs = Date.now()
            const sourcePort = pdu.payload.udpSourcePort ?? 49152
            const response: PacketPdu = {
              ...pdu, id: packetId('ntp-response'), summary: `NTP response from ${localIp.ipAddress}:123`,
              sourceMac: localIp.macAddress, destMac: pdu.sourceMac, sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
              payload: { udpMessageType: 'response', udpRequestId: pdu.payload.udpRequestId, udpSourceDeviceId: pdu.payload.udpSourceDeviceId, udpService: 'ntp', udpSourcePort: 123, udpDestinationPort: sourcePort, ntpMessageType: 'response', ntpClientTransmitTimeMs: pdu.payload.ntpClientTransmitTimeMs, ntpServerReceiveTimeMs: receiveTimeMs, ntpServerTransmitTimeMs: transmitTimeMs, ntpStratum: stratum },
              explanation: { ...pdu.explanation, layer2: `NTP response from ${localIp.macAddress}.`, layer3: `IPv4: ${localIp.ipAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: source port 123 to destination port ${sourcePort}. NTP server stratum ${stratum}.`, deviceDecision: `${receiver.name} accepted the request as an NTP master and returns clock timestamps through the route to the client.` },
            }
            if (!sendIp(byId.get(receiver.id)!, response, 0, packet)) continue
            continue
          }
          if (service === 'snmp') {
            const enabled = ['router', 'switch', 'server'].includes(receiver.type) && (receiver.config.snmpCommunities?.length ?? 0) > 0
            const community = pdu.payload.snmpCommunity ?? ''
            const operation = pdu.payload.snmpOperation
            const oid = pdu.payload.snmpOid ?? ''
            if (destinationPort !== 161 || !enabled || !isValidSnmpCommunity(community) || !receiver.config.snmpCommunities?.includes(community)) {
              const reason = destinationPort !== 161
                ? `${receiver.name} received an SNMP request on UDP port ${destinationPort}, expected port 161.`
                : !enabled ? `SNMP agent is not configured on ${receiver.name}. Configure a read-only community first.` : `SNMP community is invalid on ${receiver.name}.`
              drop(packet, reason)
              continue
            }
            if ((operation !== 'get' && operation !== 'get-next') || !isValidSnmpOid(oid)) {
              drop(packet, `SNMP request to ${receiver.name} contains an unsupported operation or malformed OID.`)
              continue
            }
            const result = resolveSnmpSystemObject(receiver, operation, oid)
            const sourcePort = pdu.payload.udpSourcePort ?? 49152
            const operationLabel = operation === 'get-next' ? 'GETNEXT' : 'GET'
            const response: PacketPdu = {
              ...pdu, id: packetId('snmp-response'), summary: `SNMPv2c ${operationLabel} response from ${localIp.ipAddress}:161 for ${result.oid}`,
              sourceMac: localIp.macAddress, destMac: pdu.sourceMac, sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
              payload: { udpMessageType: 'response', udpRequestId: pdu.payload.udpRequestId, udpSourceDeviceId: pdu.payload.udpSourceDeviceId, udpService: 'snmp', udpData: `${result.oid} = ${result.value}`, udpSourcePort: 161, udpDestinationPort: sourcePort, snmpVersion: '2c', snmpMessageType: 'response', snmpOperation: operation, snmpOid: result.oid, snmpValue: result.value },
              explanation: { ...pdu.explanation, layer2: `SNMP response from ${localIp.macAddress}.`, layer3: `IPv4: ${localIp.ipAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: source port 161 to destination port ${sourcePort}. SNMPv2c ${operationLabel} response: ${result.oid} = ${result.value}.`, deviceDecision: `${receiver.name} accepted the read-only community and returned the requested system MIB value.` },
            }
            if (!sendIp(byId.get(receiver.id)!, response, 0, packet)) continue
            continue
          }
          const enabled = receiver.type === 'server' && receiver.config.udpEchoServiceEnabled === true
          const listening = enabled && (receiver.config.udpEchoPorts ?? [7]).includes(destinationPort)
          if (!listening) {
            const reason = enabled ? `${receiver.name} is not listening on UDP port ${destinationPort}.` : `UDP Echo service is disabled on ${receiver.name}.`
            drop(packet, reason)
            continue
          }
          const sourcePort = pdu.payload.udpSourcePort ?? 49152
          const data = pdu.payload.udpData ?? ''
          const response: PacketPdu = {
            ...pdu, id: packetId('udp-echo-response'), summary: `UDP Echo response from ${localIp.ipAddress}:${destinationPort}`,
            sourceMac: localIp.macAddress, destMac: pdu.sourceMac, sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
            payload: { udpMessageType: 'response', udpRequestId: pdu.payload.udpRequestId, udpSourceDeviceId: pdu.payload.udpSourceDeviceId, udpService: 'echo', udpData: data, udpSourcePort: destinationPort, udpDestinationPort: sourcePort },
            explanation: { ...pdu.explanation, layer2: `UDP Echo response from ${localIp.macAddress}.`, layer3: `IPv4: ${localIp.ipAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: source port ${destinationPort} to destination port ${sourcePort}. Echoed ${new TextEncoder().encode(data).byteLength} bytes.`, deviceDecision: `${receiver.name} accepted the request on UDP port ${destinationPort} and echoed the payload to the client.` },
          }
          if (!sendIp(byId.get(receiver.id)!, response, 0, packet)) continue
        } else if (pdu.protocol === 'UDP' && pdu.payload.udpMessageType === 'response' && pdu.payload.udpService === 'tftp' && pdu.payload.tftpMessageType === 'data' && pdu.payload.udpSourceDeviceId === receiver.id && pdu.payload.udpRequestId) {
          const blockNumber = pdu.payload.tftpBlockNumber ?? 0
          const blockCount = pdu.payload.tftpBlockCount ?? 0
          const dataHex = pdu.payload.tftpBlockDataHex ?? ''
          if (!Number.isInteger(blockNumber) || !Number.isInteger(blockCount) || blockNumber < 1 || blockNumber > blockCount || dataHex.length > TFTP_BLOCK_SIZE * 2 || dataHex.length % 2 !== 0 || !/^(?:[0-9a-f]{2})*$/i.test(dataHex)) {
            drop(packet, 'TFTP DATA block contains an invalid block number or payload.')
            continue
          }
          const clientPort = pdu.payload.udpDestinationPort ?? 49152
          const serverPort = pdu.payload.udpSourcePort ?? 0
          const acknowledgement: PacketPdu = {
            ...pdu, id: packetId('tftp-ack'), summary: `TFTP ACK block ${blockNumber} for ${pdu.payload.tftpFileName ?? 'file'}`,
            sourceMac: localIp.macAddress, destMac: pdu.sourceMac, sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
            payload: { udpMessageType: 'request', udpRequestId: pdu.payload.udpRequestId, udpSourceDeviceId: pdu.payload.udpSourceDeviceId, udpService: 'tftp', udpSourcePort: clientPort, udpDestinationPort: serverPort, tftpMessageType: 'ack', tftpFileName: pdu.payload.tftpFileName, tftpBlockNumber: blockNumber, tftpBlockCount: blockCount },
            explanation: { ...pdu.explanation, layer2: `TFTP ACK from ${localIp.macAddress}.`, layer3: `IPv4: ${localIp.ipAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `UDP: client port ${clientPort} to server transfer port ${serverPort}. TFTP ACK block ${blockNumber}.`, deviceDecision: `${receiver.name} accepted TFTP DATA block ${blockNumber} and acknowledges it to the server.` },
          }
          if (!sendIp(byId.get(receiver.id)!, acknowledgement, 0, packet)) continue
        } else if (pdu.protocol === 'UDP' && pdu.payload.udpMessageType === 'response' && pdu.payload.udpSourceDeviceId === receiver.id && pdu.payload.udpRequestId) {
          if (!udpResults.some(result => result.requestId === pdu.payload.udpRequestId)) {
            const service = pdu.payload.udpService ?? 'echo'
            const t1 = pdu.payload.ntpClientTransmitTimeMs
            const t2 = pdu.payload.ntpServerReceiveTimeMs
            const t3 = pdu.payload.ntpServerTransmitTimeMs
            const t4 = Date.now()
            const offsetMs = service === 'ntp' && [t1, t2, t3].every(Number.isFinite) ? ((t2! - t1!) + (t3! - t4)) / 2 : undefined
            const serverStratum = pdu.payload.ntpStratum ?? 16
            const validNtpResponse = service !== 'ntp' || Number.isFinite(offsetMs) && Number.isInteger(serverStratum) && serverStratum >= 1 && serverStratum <= 14
            udpResults.push({ requestId: pdu.payload.udpRequestId, sourceDeviceId: receiver.id, targetIp: pdu.sourceIp, port: pdu.payload.udpSourcePort ?? 0, service, status: validNtpResponse ? 'successful' : 'failed', response: pdu.payload.udpData ?? '', stratum: service === 'ntp' ? serverStratum + 1 : undefined, offsetMs, oid: service === 'snmp' ? pdu.payload.snmpOid : undefined, value: service === 'snmp' ? pdu.payload.snmpValue : undefined, operation: service === 'snmp' ? pdu.payload.snmpOperation : undefined, reason: validNtpResponse ? undefined : `NTP server stratum ${serverStratum} cannot synchronize a client.` })
          }
        } else if (pdu.protocol === 'HTTP' && pdu.payload.httpMethod === 'GET') {
          if (receiver.type !== 'server' || !receiver.config.httpServiceEnabled) { drop(packet, `HTTP service is disabled on ${receiver.name} at ${localIp.ipAddress}:80.`); continue }
          const body = receiver.config.htmlContent || '<h1>wireX Web Server</h1><p>HTTP service operational.</p>'
          const tooLarge = new TextEncoder().encode(body).byteLength > 65536
          const response: PacketPdu = {
            ...pdu, id: packetId('http-response'), summary: `HTTP ${tooLarge ? 413 : 200} response for ${pdu.payload.httpPath ?? '/'}`,
            sourceMac: localIp.macAddress, destMac: pdu.sourceMac, sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp, ttl: 64, pendingPacket: undefined,
            payload: { httpMethod: 'RESPONSE', httpPath: pdu.payload.httpPath, httpResponse: tooLarge ? '<h1>413 Content Too Large</h1>' : body, httpRequestId: pdu.payload.httpRequestId, httpSourceDeviceId: pdu.payload.httpSourceDeviceId, httpStatus: tooLarge ? 413 : 200 },
            explanation: { ...pdu.explanation, layer2: `HTTP response from ${localIp.macAddress}.`, layer3: `IPv4: ${localIp.ipAddress} to ${pdu.sourceIp}, TTL 64.`, layer4AndAbove: `HTTP ${tooLarge ? 413 : 200} response, source service port 80.`, deviceDecision: `${receiver.name} returned its configured HTTP page through the routing table.` },
          }
          if (!sendIp(byId.get(receiver.id)!, response, 0, packet)) continue
        } else if (pdu.protocol === 'HTTP' && pdu.payload.httpMethod === 'RESPONSE' && pdu.payload.httpSourceDeviceId === receiver.id && pdu.payload.httpRequestId) {
          if (!applicationResults.some(result => result.requestId === pdu.payload.httpRequestId)) applicationResults.push({ requestId: pdu.payload.httpRequestId, sourceDeviceId: receiver.id, status: pdu.payload.httpStatus === 200 ? 'successful' : 'failed', response: pdu.payload.httpResponse, httpStatus: pdu.payload.httpStatus, reason: pdu.payload.httpStatus === 200 ? undefined : `HTTP ${pdu.payload.httpStatus ?? 500}.` })
        } else if (pdu.payload.icmpType === 'echo-request') {
          const reply: PacketPdu = {
            ...pdu, id: packetId('icmp-reply'), summary: `ICMP: Echo Reply from ${localIp.ipAddress}, seq=${pdu.payload.icmpSeq || 1}`,
            sourceIp: localIp.ipAddress!, destIp: pdu.sourceIp, sourceMac: receivingPort.macAddress, destMac: pdu.sourceMac, ttl: 128,
            pendingPacket: undefined, payload: { icmpType: 'echo-reply', icmpSeq: pdu.payload.icmpSeq, icmpIdentifier: pdu.payload.icmpIdentifier },
            explanation: { ...pdu.explanation, layer3: `IPv4: ${localIp.ipAddress} to ${pdu.sourceIp}, TTL: 128.`, layer4AndAbove: `ICMP: Type 0 (Echo Reply), Seq ${pdu.payload.icmpSeq || 1}.`, deviceDecision: `${receiver.name} received its ping and returns one echo reply.` },
          }
          if(logicalPort.ipAddress&&logicalPort.subnetMask&&isInSameSubnet(pdu.sourceIp,logicalPort.ipAddress,logicalPort.subnetMask))learnArp(receiver, logicalPort, pdu.sourceIp, pdu.sourceMac)
          if(!sendIp(byId.get(receiver.id)!, reply, 0, packet))continue
        }
      } else if (receiver.type === 'router' || receiver.type === 'security' || gatewayFrame) {
        if(gatewayFrame&&!receiver.config.ipRouting||receiver.type==='router'&&receiver.config.ipRouting===false){drop(packet,`IP routing is disabled on ${receiver.name}.`);continue}
        if (pdu.ttl <= 1) { drop(packet, 'IPv4 TTL expired.'); continue }
        let routedPdu: PacketPdu = { ...pdu, ttl: pdu.ttl - 1 }
        let natTranslations: AsaNatTranslation[] | undefined
        if (receiver.type === 'security') {
          const route = outgoingRoute(receiver, pdu.destIp)
          if (route) {
            const inSec = receivingPort.securityLevel !== undefined ? receivingPort.securityLevel : 100
            const outSec = route.port.securityLevel !== undefined ? route.port.securityLevel : 0
            if (inSec < outSec) {
              const isInspectedReturn = reverseNat?.protocol === 'ICMP' && receiver.config.asaInspection?.icmp !== false
                || reverseNat?.protocol === 'UDP' && receiver.config.asaInspection?.udp !== false && (pdu.payload.udpService !== 'tftp' || receiver.config.asaInspection?.tftp !== false)
                || reverseNat?.protocol === 'TCP' && receiver.config.asaInspection?.tcp !== false
              const hasPermitAcl = receivingPort.inboundAcl && receiver.config.accessLists?.some(a => a.id === receivingPort.inboundAcl && evaluateAcl(a, { sourceIp: pdu.sourceIp, destIp: pdu.destIp, protocol: pdu.protocol, port: pdu.payload.tcpDestinationPort ?? pdu.payload.udpDestinationPort }).action === 'permit')
              if (!isInspectedReturn && !hasPermitAcl) {
                drop(packet, `ASA firewall dropped unsolicited packet from lower security zone (${receivingPort.nameif || receivingPort.name}: ${inSec}) to higher security zone (${route.port.nameif || route.port.name}: ${outSec}).`)
                continue
              }
            }
            if (pdu.protocol === 'ICMP' && pdu.payload.icmpType === 'echo-request' && receivingPort.nameif && route.port.nameif) {
              const rule = receiver.config.asaNatRules?.find(candidate => candidate.sourceInterface === receivingPort.nameif && candidate.destInterface === route.port.nameif && ipv4CidrContains(pdu.sourceIp, candidate.sourceNet))
              if (rule?.type === 'static') {
                drop(packet, `ASA static NAT rule ${rule.id} is not implemented in this simulator.`)
                continue
              }
              if (rule) {
                const outsideIp = route.port.ipAddress
                if (!outsideIp || !isValidIpv4(outsideIp)) {
                  drop(packet, `ASA dynamic PAT rule ${rule.id} has no active IPv4 address on ${route.port.nameif}.`)
                  continue
                }
                const originalIdentifier = pdu.payload.icmpIdentifier ?? 0
                if (!Number.isInteger(originalIdentifier) || originalIdentifier < 0 || originalIdentifier > 65_535) {
                  drop(packet, `ASA dynamic PAT received an invalid ICMP identifier (${originalIdentifier}).`)
                  continue
                }
                const activeTranslations = (receiver.asaNatTranslations ?? []).filter(translation => translation.expiresAtMs > receivedAtMs)
                let translation = activeTranslations.find((candidate): candidate is Extract<AsaNatTranslation, { protocol: 'ICMP' }> => candidate.protocol === 'ICMP' && candidate.sourceInterface === rule.sourceInterface && candidate.destInterface === rule.destInterface && candidate.originalSourceIp === pdu.sourceIp && candidate.remoteDestinationIp === pdu.destIp && candidate.originalIdentifier === originalIdentifier)
                if (!translation) {
                  if (activeTranslations.length >= MAX_ASA_NAT_TRANSLATIONS) {
                    drop(packet, `ASA dynamic PAT translation table is full (${MAX_ASA_NAT_TRANSLATIONS} entries).`)
                    continue
                  }
                  const translatedIdentifier = allocateIcmpPatIdentifier(activeTranslations, outsideIp)
                  if (translatedIdentifier === undefined) {
                    drop(packet, `ASA dynamic PAT has no available ICMP identifier on ${outsideIp}.`)
                    continue
                  }
                  translation = {
                    id: packetId('xlate'), protocol: 'ICMP', sourceInterface: rule.sourceInterface, destInterface: rule.destInterface,
                    originalSourceIp: pdu.sourceIp, translatedSourceIp: outsideIp, remoteDestinationIp: pdu.destIp,
                    originalIdentifier, translatedIdentifier, expiresAtMs: receivedAtMs + ASA_NAT_TIMEOUT_MS,
                  }
                } else {
                  translation = { ...translation, expiresAtMs: receivedAtMs + ASA_NAT_TIMEOUT_MS }
                }
                natTranslations = [...activeTranslations.filter(candidate => candidate.id !== translation!.id), translation]
                routedPdu = {
                  ...routedPdu,
                  sourceIp: translation.translatedSourceIp,
                  summary: `ICMP: Echo Request to ${pdu.destIp} through ASA dynamic PAT`,
                  payload: { ...pdu.payload, icmpIdentifier: translation.translatedIdentifier },
                  explanation: {
                    ...pdu.explanation,
                    layer3: `IPv4 source translated from ${pdu.sourceIp} to ${translation.translatedSourceIp}; destination ${pdu.destIp}.`,
                    layer4AndAbove: `ICMP Echo Request identifier translated from ${translation.originalIdentifier} to ${translation.translatedIdentifier}.`,
                    deviceDecision: `${receiver.name} applies dynamic PAT from ${rule.sourceInterface} to ${rule.destInterface} and records translation ${translation.id}.`,
                  },
                }
              }
            } else if (pdu.protocol === 'UDP' && pdu.payload.udpMessageType === 'request' && receivingPort.nameif && route.port.nameif) {
              const rule = receiver.config.asaNatRules?.find(candidate => candidate.sourceInterface === receivingPort.nameif && candidate.destInterface === route.port.nameif && ipv4CidrContains(pdu.sourceIp, candidate.sourceNet))
              if (rule?.type === 'static') {
                drop(packet, `ASA static NAT rule ${rule.id} is not implemented in this simulator.`)
                continue
              }
              if (rule) {
                const sourcePort = pdu.payload.udpSourcePort
                const destinationPort = pdu.payload.udpDestinationPort
                if (!Number.isInteger(sourcePort) || sourcePort! < 1 || sourcePort! > 65_535 || !Number.isInteger(destinationPort) || destinationPort! < 1 || destinationPort! > 65_535) {
                  drop(packet, `ASA dynamic PAT received invalid UDP ports (${sourcePort ?? 'missing'} to ${destinationPort ?? 'missing'}).`)
                  continue
                }
                const outsideIp = route.port.ipAddress
                if (!outsideIp || !isValidIpv4(outsideIp)) {
                  drop(packet, `ASA dynamic PAT rule ${rule.id} has no active IPv4 address on ${route.port.nameif}.`)
                  continue
                }
                const activeTranslations = (receiver.asaNatTranslations ?? []).filter(translation => translation.expiresAtMs > receivedAtMs)
                let translation = activeTranslations.find((candidate): candidate is Extract<AsaNatTranslation, { protocol: 'UDP' }> => candidate.protocol === 'UDP' && candidate.sourceInterface === rule.sourceInterface && candidate.destInterface === rule.destInterface && candidate.originalSourceIp === pdu.sourceIp && candidate.originalSourcePort === sourcePort && candidate.remoteDestinationIp === pdu.destIp && candidate.remoteDestinationPort === destinationPort)
                if (!translation) {
                  if (activeTranslations.length >= MAX_ASA_NAT_TRANSLATIONS) {
                    drop(packet, `ASA dynamic PAT translation table is full (${MAX_ASA_NAT_TRANSLATIONS} entries).`)
                    continue
                  }
                  const translatedSourcePort = allocateTransportPatPort(activeTranslations, 'UDP', outsideIp)
                  if (translatedSourcePort === undefined) {
                    drop(packet, `ASA dynamic PAT has no available UDP source port on ${outsideIp}.`)
                    continue
                  }
                  translation = {
                    id: packetId('xlate'), protocol: 'UDP', sourceInterface: rule.sourceInterface, destInterface: rule.destInterface,
                    originalSourceIp: pdu.sourceIp, translatedSourceIp: outsideIp, remoteDestinationIp: pdu.destIp,
                    originalSourcePort: sourcePort!, translatedSourcePort, remoteDestinationPort: destinationPort!,
                    expiresAtMs: receivedAtMs + ASA_NAT_TIMEOUT_MS,
                  }
                } else {
                  translation = { ...translation, expiresAtMs: receivedAtMs + ASA_NAT_TIMEOUT_MS }
                }
                natTranslations = [...activeTranslations.filter(candidate => candidate.id !== translation!.id), translation]
                routedPdu = {
                  ...routedPdu,
                  sourceIp: translation.translatedSourceIp,
                  summary: `UDP: request to ${pdu.destIp}:${destinationPort} through ASA dynamic PAT`,
                  payload: { ...pdu.payload, udpSourcePort: translation.translatedSourcePort },
                  explanation: {
                    ...pdu.explanation,
                    layer3: `IPv4 source translated from ${pdu.sourceIp} to ${translation.translatedSourceIp}; destination ${pdu.destIp}.`,
                    layer4AndAbove: `UDP source port translated from ${translation.originalSourcePort} to ${translation.translatedSourcePort}; destination port ${destinationPort}.`,
                    deviceDecision: `${receiver.name} applies dynamic PAT from ${rule.sourceInterface} to ${rule.destInterface} and records translation ${translation.id}.`,
                  },
                }
              }
            } else if (pdu.protocol === 'TCP' && receivingPort.nameif && route.port.nameif) {
              const rule = receiver.config.asaNatRules?.find(candidate => candidate.sourceInterface === receivingPort.nameif && candidate.destInterface === route.port.nameif && ipv4CidrContains(pdu.sourceIp, candidate.sourceNet))
              if (rule?.type === 'static') {
                drop(packet, `ASA static NAT rule ${rule.id} is not implemented in this simulator.`)
                continue
              }
              if (rule) {
                const sourcePort = pdu.payload.tcpSourcePort
                const destinationPort = pdu.payload.tcpDestinationPort
                if (!Number.isInteger(sourcePort) || sourcePort! < 1 || sourcePort! > 65_535 || !Number.isInteger(destinationPort) || destinationPort! < 1 || destinationPort! > 65_535) {
                  drop(packet, `ASA dynamic PAT received invalid TCP ports (${sourcePort ?? 'missing'} to ${destinationPort ?? 'missing'}).`)
                  continue
                }
                const outsideIp = route.port.ipAddress
                if (!outsideIp || !isValidIpv4(outsideIp)) {
                  drop(packet, `ASA dynamic PAT rule ${rule.id} has no active IPv4 address on ${route.port.nameif}.`)
                  continue
                }
                const activeTranslations = (receiver.asaNatTranslations ?? []).filter(translation => translation.expiresAtMs > receivedAtMs)
                let translation = activeTranslations.find((candidate): candidate is Extract<AsaNatTranslation, { protocol: 'TCP' }> => candidate.protocol === 'TCP' && candidate.sourceInterface === rule.sourceInterface && candidate.destInterface === rule.destInterface && candidate.originalSourceIp === pdu.sourceIp && candidate.originalSourcePort === sourcePort && candidate.remoteDestinationIp === pdu.destIp && candidate.remoteDestinationPort === destinationPort)
                if (!translation) {
                  if (activeTranslations.length >= MAX_ASA_NAT_TRANSLATIONS) {
                    drop(packet, `ASA dynamic PAT translation table is full (${MAX_ASA_NAT_TRANSLATIONS} entries).`)
                    continue
                  }
                  const translatedSourcePort = allocateTransportPatPort(activeTranslations, 'TCP', outsideIp)
                  if (translatedSourcePort === undefined) {
                    drop(packet, `ASA dynamic PAT has no available TCP source port on ${outsideIp}.`)
                    continue
                  }
                  translation = {
                    id: packetId('xlate'), protocol: 'TCP', sourceInterface: rule.sourceInterface, destInterface: rule.destInterface,
                    originalSourceIp: pdu.sourceIp, translatedSourceIp: outsideIp, remoteDestinationIp: pdu.destIp,
                    originalSourcePort: sourcePort!, translatedSourcePort, remoteDestinationPort: destinationPort!,
                    expiresAtMs: receivedAtMs + ASA_NAT_TIMEOUT_MS,
                  }
                } else {
                  translation = { ...translation, expiresAtMs: receivedAtMs + ASA_NAT_TIMEOUT_MS }
                }
                natTranslations = [...activeTranslations.filter(candidate => candidate.id !== translation!.id), translation]
                routedPdu = {
                  ...routedPdu,
                  sourceIp: translation.translatedSourceIp,
                  summary: `TCP ${pdu.payload.tcpFlags ?? 'segment'} to ${pdu.destIp}:${destinationPort} through ASA dynamic PAT`,
                  payload: { ...pdu.payload, tcpSourcePort: translation.translatedSourcePort, tcpClientIp: translation.translatedSourceIp },
                  explanation: {
                    ...pdu.explanation,
                    layer3: `IPv4 source translated from ${pdu.sourceIp} to ${translation.translatedSourceIp}; destination ${pdu.destIp}.`,
                    layer4AndAbove: `TCP source port translated from ${translation.originalSourcePort} to ${translation.translatedSourcePort}; destination port ${destinationPort}.`,
                    deviceDecision: `${receiver.name} applies dynamic PAT from ${rule.sourceInterface} to ${rule.destInterface} and records translation ${translation.id}.`,
                  },
                }
              }
            }
          }
        }
        if (!sendIp(receiver, routedPdu, hops, packet)) continue
        if (natTranslations) editDevice(receiver.id).asaNatTranslations = natTranslations
      } else { drop(packet, 'Destination IP belongs to another device.'); continue }
    }
    packetDeliveries.push({ packetId: packet.id, status: 'delivered', receiverDeviceId: receiver.id, reason: `${receiver.name} processed ${pdu.protocol}.` })
  }
  const terminalApplicationRequests = new Set([...applicationResults, ...emailResults].map(result => result.requestId))
  if (terminalApplicationRequests.size) {
    tcpOutstandingSegments = tcpOutstandingSegments.map(segment => terminalApplicationRequests.has(segment.requestId)
      ? { ...segment, failApplicationOnTimeout: false }
      : segment)
  }
  for (const pending of [...tcpOutstandingSegments]) {
    const current = tcpOutstandingSegments.find(segment => segment.key === pending.key)
    if (!current) continue
    const trafficInFlight = remaining.some(packet => packetCarriesTcpSegment(packet, current) || packetCarriesTcpAck(packet, current))
    if (trafficInFlight) {
      tcpOutstandingSegments = tcpOutstandingSegments.map(segment => segment.key === current.key ? { ...segment, ageTicks: 0 } : segment)
      continue
    }
    if (current.ageTicks < TCP_RETRANSMISSION_TIMEOUT_TICKS) continue
    if (current.retries >= MAX_TCP_RETRANSMISSIONS) {
      if (current.failApplicationOnTimeout && !terminalApplicationRequests.has(current.requestId)) {
        const reason = `TCP ${current.pdu.payload.tcpFlags ?? 'segment'} timed out after ${MAX_TCP_RETRANSMISSIONS} retransmissions.${current.lastError ? ` Last observed failure: ${current.lastError}` : ''}`
        recordTcpFailure(current.pdu, reason)
        terminalApplicationRequests.add(current.requestId)
      }
      tcpOutstandingSegments = tcpOutstandingSegments.filter(segment => segment.requestId !== current.requestId)
      continue
    }

    const retryNumber = current.retries + 1
    const retryPdu: PacketPdu = {
      ...current.pdu,
      id: packetId('tcp-retry'),
      summary: `TCP retransmission ${retryNumber}/${MAX_TCP_RETRANSMISSIONS}: ${current.pdu.summary.replace(/^TCP retransmission \d+\/\d+: /, '')}`,
      explanation: {
        ...current.pdu.explanation,
        layer4AndAbove: `TCP retransmission ${retryNumber}/${MAX_TCP_RETRANSMISSIONS}. ${current.pdu.explanation.layer4AndAbove.replace(/^TCP retransmission \d+\/\d+\. /, '')}`,
        deviceDecision: `${byId.get(current.ownerDeviceId)?.name ?? current.ownerDeviceId} retransmits unacknowledged TCP data after the retransmission timer expired.`,
      },
    }
    const retryState = { ...current, ageTicks: 0, retries: retryNumber, lastError: undefined }
    tcpOutstandingSegments = tcpOutstandingSegments.map(segment => segment.key === current.key ? retryState : segment)
    const sender = byId.get(current.ownerDeviceId)
    const route = sender && outgoingRoute(sender, retryPdu.destIp)
    let failure: string | undefined
    if (!sender || sender.power === false) failure = `TCP sender ${sender?.name ?? current.ownerDeviceId} is unavailable.`
    else if (!route || !isUp(sender, route.port)) failure = `No operational route to ${retryPdu.destIp}.`
    else if (route.port.outboundAcl) {
      const acl = sender.config.accessLists?.find(item => item.id === route.port.outboundAcl)
      if (acl && evaluateAcl(acl, { sourceIp: route.port.ipAddress || '0.0.0.0', destIp: retryPdu.destIp, protocol: 'TCP', port: retryPdu.payload.tcpDestinationPort }).action === 'deny') {
        failure = `Outbound ACL ${route.port.outboundAcl} denied TCP retransmission to port ${retryPdu.payload.tcpDestinationPort ?? 'unknown'}.`
      }
    }
    if (!failure && sender && route) {
      const frames = ipFrames(sender, route, retryPdu, updatedDevices, links, 0)
      if (!frames.length) failure = 'Outgoing link is down or its VLAN is blocked.'
      else frames.forEach(enqueue)
    }
    if (failure) {
      discardedPackets++
      tcpOutstandingSegments = tcpOutstandingSegments.map(segment => segment.key === current.key ? { ...segment, lastError: failure } : segment)
      packetDeliveries.push({ packetId: retryPdu.id, status: 'dropped', receiverDeviceId: current.pdu.payload.tcpServerDeviceId ?? current.ownerDeviceId, reason: failure })
    }
  }
  const probes=new Map<string,PacketPdu>()
  for(const packet of inFlightPackets.slice(0,packetQueueLimit)){
    const probe=[packet.pdu,packet.pdu.pendingPacket].find(candidate=>candidate?.payload.dhcpProbeIp&&candidate.payload.dhcpRequestId)
    if(probe?.payload.dhcpRequestId)probes.set(probe.payload.dhcpRequestId,probe)
  }
  for(const [requestId,probe] of probes){
    const stillInFlight=remaining.some(packet=>[packet.pdu,packet.pdu.pendingPacket].some(candidate=>candidate?.payload.dhcpRequestId===requestId&&candidate.payload.dhcpProbeIp))
    if(stillInFlight||dhcpResults.some(result=>result.requestId===requestId&&(result.status==='failed'||result.status==='successful')))continue
    dhcpResults.push({requestId,sourceDeviceId:probe.payload.dhcpClientDeviceId??'',clientPortId:probe.payload.dhcpClientPortId,
      phase:'ack',status:'successful',serverDeviceId:probe.payload.dhcpServerDeviceId,assignedIp:probe.payload.assignedIp??probe.payload.dhcpProbeIp,
      subnetMask:probe.payload.dhcpSubnetMask,gateway:probe.payload.dhcpGateway,dnsServer:probe.payload.dhcpDnsServer,
      leaseDurationSeconds:probe.payload.dhcpLeaseDurationSeconds})
  }
  const newEvents: SimulationEvent[] = []
  if (collectEvents && packetDeliveries.length > 0) {
    const deliveredPackets = new Map<string, InFlightPacket>()
    for (const candidate of inFlightPackets.slice(0, packetQueueLimit)) deliveredPackets.set(candidate.id, candidate)
    const recordedEventIds = new Set<string>()
    for (const delivery of packetDeliveries) {
      const packet = deliveredPackets.get(delivery.packetId)
      if (!packet) continue
      const id = `${delivery.packetId}:${delivery.status}`
      if (recordedEventIds.has(id)) continue
      recordedEventIds.add(id)
      newEvents.push({
        id,
        timestamp: simulationTick,
        sourceDeviceId: packet.fromDeviceId,
        destDeviceId: delivery.receiverDeviceId,
        protocol: packet.pdu.protocol,
        summary: delivery.reason ?? (delivery.status === 'delivered' ? 'Frame delivered.' : 'Frame dropped.'),
        pdu: packet.pdu,
        status: delivery.status === 'delivered' ? 'received' : 'dropped',
      })
    }
  }
  return { updatedDevices, newInFlightPackets: remaining, newEvents, packetDeliveries, applicationResults, emailResults, dnsResults, udpResults, dhcpResults, tcpReceiveBuffers, tcpOutstandingSegments, discardedPackets, queueLimitReached }
}
