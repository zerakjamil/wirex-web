import { stepSimulationTick } from '../src/simulator/engine'
import { createDevice } from '../src/simulator/deviceFactory'
import { useNetworkStore } from '../src/store/networkStore'
import { synchronizeLinkState } from '../src/simulator/linkState'
import type { InFlightPacket, NetworkDevice, NetworkLink, NetworkPort } from '../src/types/network'

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
server.name = 'IoTServer'; sw.name = 'SW1'; lamp.name = 'Lamp1'
sw.ports.forEach(p => { p.portfast = true })
addressPort(server, server.ports[0], '192.168.10.10')
server.config.iotServiceEnabled = true
addressPort(lamp, lamp.ports[0], '192.168.10.21')
const links = [connect(server, 0, sw, 0), connect(lamp, 0, sw, 1)]
useNetworkStore.getState().loadLab([server, sw, lamp], links)

const sync0 = synchronizeLinkState(useNetworkStore.getState().devices, links, 0)
useNetworkStore.setState({ devices: sync0.devices, links: sync0.links })
let devices = useNetworkStore.getState().devices
let current: InFlightPacket[] = []
for (let tick = 1; tick <= 90; tick++) {
  const step = stepSimulationTick(devices, links, current, [], [], tick)
  for (const delivery of step.packetDeliveries) {
    const reason = delivery.reason ?? ''
    if (reason.includes('IoT') || reason.includes('registered') || reason.includes('report')) console.log(`t${tick} delivery:`, delivery.status, reason)
  }
  if (step.newInFlightPackets.length) {
    for (const p of step.newInFlightPackets) {
      const flags = `| proto=${p.pdu.protocol} service=${p.pdu.payload.udpService} msg=${p.pdu.payload.iotMessageType} destIp=${p.pdu.destIp}`
      console.log(`t${tick} packet:`, p.pdu.summary, '| from', p.fromDeviceId?.slice(0,6), '-> to', p.toDeviceId?.slice(0,6), flags)
    }
  }
  if (step.discardedPackets) console.log(`t${tick} DISCARDED ${step.discardedPackets}`)
  devices = step.updatedDevices
  current = step.newInFlightPackets
}
const lampAfter = devices.find(d => d.id === lamp.id)!
const serverAfter = devices.find(d => d.id === server.id)!
console.log('lamp runtime:', JSON.stringify(lampAfter.iotRuntime))
console.log('server runtime:', JSON.stringify(serverAfter.iotServerRuntime))
