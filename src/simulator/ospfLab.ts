import { createDevice } from './deviceFactory'
import { getNetworkAddress } from './protocols/ip'
import type { NetworkDevice, NetworkLink, NetworkAnnotation } from '../types/network'

export function getOspfPracticeLab() {
  const r1 = createDevice('router', 150, 160, '2911'), r2 = createDevice('router', 440, 50, '2911'), r3 = createDevice('router', 730, 160, '2911')
  const a = createDevice('pc', 150, 390), b = createDevice('pc', 730, 390)
  const routers = [r1, r2, r3], devices = [...routers, a, b], links: NetworkLink[] = []
  const addresses = [['192.168.1.1', '10.0.12.1', '10.0.13.1'], ['10.0.12.2', '10.0.23.2'], ['10.0.23.3', '192.168.3.1', '10.0.13.3']]
  routers.forEach((r, i) => {
    r.name = `R${i + 1}`; r.config.hostname = r.name
    r.config.ospfProcessId = 1; r.config.ospfRouterId = `${i + 1}.${i + 1}.${i + 1}.${i + 1}`
    r.config.ospfNetworks = [{ network: '0.0.0.0', wildcard: '255.255.255.255', area: 0 }]
    addresses[i].forEach((ip, j) => Object.assign(r.ports[j], { ipAddress: ip, subnetMask: '255.255.255.0', adminStatus: 'up', ospfNetworkType: 'point-to-point', ...(j === 2 ? { ospfCost: 10 } : {}) }))
    r.routingTable = addresses[i].map((ip, j) => ({ network: getNetworkAddress(ip, '255.255.255.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: r.ports[j].name, metric: 0, type: 'C' }))
  })
  r1.config.ospfPassiveInterfaces = [r1.ports[0].name]; r3.config.ospfPassiveInterfaces = [r3.ports[1].name]
  for (const [pc, ip, gateway, name] of [[a, '192.168.1.10', '192.168.1.1', 'Student-A'], [b, '192.168.3.10', '192.168.3.1', 'Student-B']] as const) {
    pc.name = name; pc.config.hostname = name; pc.config.defaultGateway = gateway
    Object.assign(pc.ports[0], { ipAddress: ip, subnetMask: '255.255.255.0' })
  }
  function connect(d: NetworkDevice, p: number, e: NetworkDevice, q: number) {
    const link: NetworkLink = { id: crypto.randomUUID(), type: 'crossover', status: 'up', fromDeviceId: d.id, fromPortId: d.ports[p].id, toDeviceId: e.id, toPortId: e.ports[q].id }
    links.push(link)
    Object.assign(d.ports[p], { status: 'up', connectedLinkId: link.id, connectedDeviceId: e.id, connectedPortId: e.ports[q].id })
    Object.assign(e.ports[q], { status: 'up', connectedLinkId: link.id, connectedDeviceId: d.id, connectedPortId: d.ports[p].id })
  }
  connect(r1, 0, a, 0); connect(r1, 1, r2, 0); connect(r2, 1, r3, 0); connect(r3, 1, b, 0); connect(r1, 2, r3, 2)
  const annotations: NetworkAnnotation[] = [{ id: crypto.randomUUID(), type: 'note', x: 310, y: 370, title: 'OSPF area 0', text: 'show ip ospf neighbor\nshow ip route\nshow ip ospf database\n\nStudent-A: ping 192.168.3.10\n\nR1: shut Gi0/1 to use the backup path.\nRestore with no shutdown.', color: '#fff8cc' }]
  return { devices, links, annotations }
}
