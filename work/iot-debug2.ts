import { dhcpBroadcastFrames } from '../src/simulator/engine'
import { createDevice } from '../src/simulator/deviceFactory'
import { getForwardingLinks } from '../src/simulator/engine'
import { useNetworkStore } from '../src/store/networkStore'
import type { NetworkDevice, NetworkLink, NetworkPort, PacketPdu } from '../src/types/network'

function connect(a: NetworkDevice, ai: number, b: NetworkDevice, bi: number): NetworkLink {
  const ap = a.ports[ai]; const bp = b.ports[bi]
  const link: NetworkLink = { id: `${a.id}-${ap.id}-${b.id}-${bp.id}`, type: 'straight', fromDeviceId: a.id, fromPortId: ap.id, toDeviceId: b.id, toPortId: bp.id, status: 'up' }
  Object.assign(ap, { connectedLinkId: link.id, connectedDeviceId: b.id, connectedPortId: bp.id })
  Object.assign(bp, { connectedLinkId: link.id, connectedDeviceId: a.id, connectedPortId: ap.id })
  return link
}
function addressPort(device: NetworkDevice, item: NetworkPort, ip: string, mask = '255.255.255.0') {
  Object.assign(item, { ipAddress: ip, subnetMask: mask, adminStatus: 'up' as const, status: 'up' as const })
  device.routingTable.push({ network: ip.replace(/\.\d+$/, '.0'), netmask: mask, nextHop: 'connected', interfaceName: item.name, metric: 0, type: 'C' })
  return item
}
const server = createDevice('server', 0, 0, 'Server-PT')
const sw = createDevice('switch', 0, 0, '2960-24TT')
const lamp = createDevice('iot', 0, 0, 'Lamp-PT')
sw.ports.forEach(p => { p.portfast = true })
addressPort(server, server.ports[0], '192.168.10.10')
server.config.iotServiceEnabled = true
addressPort(lamp, lamp.ports[0], '192.168.10.21')
const links = [connect(server, 0, sw, 0), connect(lamp, 0, sw, 1)]
useNetworkStore.getState().loadLab([server, sw, lamp], links)
const devices = useNetworkStore.getState().devices
const lampLive = devices.find(d => d.id === lamp.id)!
const swLive = devices.find(d => d.id === sw.id)!
const port = lampLive.ports[0]
console.log('lamp port:', JSON.stringify({ id: port.id, vlan: port.vlan, status: port.status, admin: port.adminStatus, connected: port.connectedLinkId }))
console.log('sw port0:', JSON.stringify({ id: swLive.ports[0].id, vlan: swLive.ports[0].vlan, portMode: swLive.ports[0].portMode, status: swLive.ports[0].status, portfast: swLive.ports[0].portfast }))
console.log('sw port1:', JSON.stringify({ id: swLive.ports[1].id, vlan: swLive.ports[1].vlan, portMode: swLive.ports[1].portMode, status: swLive.ports[1].status, portfast: swLive.ports[1].portfast }))
const fwd1 = getForwardingLinks(devices, links, 1)
console.log('forwarding links vlan1:', JSON.stringify([...fwd1]))
const pdu: PacketPdu = {
  id: 'test-bcast', protocol: 'UDP', summary: 'test', sourceMac: port.macAddress, destMac: 'ff:ff:ff:ff:ff:ff', etherType: '0x0800',
  sourceIp: '192.168.10.21', destIp: '255.255.255.255', ttl: 64,
  payload: { udpMessageType: 'request', udpService: 'iot', iotMessageType: 'discovery', iotClientDeviceId: lampLive.id },
  explanation: { layer1: '', layer2: '', layer3: '', layer4AndAbove: '', deviceDecision: '' },
}
const frames = dhcpBroadcastFrames(lampLive, port, pdu, devices, links)
console.log('frames:', frames.length)
if (frames.length) console.log('frame0:', JSON.stringify({ id: frames[0].id, from: frames[0].fromDeviceId?.slice(0,6), to: frames[0].toDeviceId?.slice(0,6), onWire: frames[0].pdu.summary }))
