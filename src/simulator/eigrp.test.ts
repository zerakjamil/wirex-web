import test from 'node:test'
import assert from 'node:assert/strict'
import { getOspfPracticeLab } from './ospfLab'
import { createDevice } from './deviceFactory'
import { useNetworkStore } from '../store/networkStore'
import { stepSimulationTick, createPingPackets } from './engine'
import { parseIosCommand } from './ios/ciscoParser'
import type { NetworkDevice } from '../types/network'

function campus() {
  const lab = getOspfPracticeLab()
  for (const d of lab.devices.filter(d => d.type === 'router')) {
    d.config.ospfNetworks = []; d.config.ospfProcessId = undefined
  }
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  const [r1, r2, r3, a, b] = lab.devices
  const backup = lab.links.find(l => l.fromDeviceId === r1.id && l.toDeviceId === r3.id)!
  useNetworkStore.getState().deleteLink(backup.id)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  for (const r of [r1, r2, r3]) cli(r.id, 'enable', 'configure terminal', 'router eigrp 1', 'no auto-summary', 'network 10.0.0.0', 'network 192.168.1.0', 'network 192.168.3.0', 'end')
  return { r1, r2, r3, a, b, cli }
}

function run(ticks = 600) {
  const { links } = useNetworkStore.getState()
  let { devices, inFlightPackets: packets } = useNetworkStore.getState()
  const protocols = new Set<string>()
  for (let i = 0; i < ticks; i++) {
    const step = stepSimulationTick(devices, links, packets)
    devices = step.updatedDevices; packets = step.newInFlightPackets
    packets.forEach(p => protocols.add(p.pdu.protocol))
    assert.ok(packets.length <= 256)
  }
  useNetworkStore.setState({ devices, inFlightPackets: packets })
  return { devices, links, protocols }
}

test('EIGRP forms adjacencies, learns composite-metric routes and the CLI shows them', () => {
  const { r1, r2 } = campus()
  assert.equal(useNetworkStore.getState().devices[0].routingTable.some(r => String(r.type) === 'D'), false)
  const { devices, protocols } = run(600)
  assert.ok(protocols.has('EIGRP'))
  const router = devices.find(d => d.id === r1.id)!
  const route = router.routingTable.find(r => String(r.type) === 'D' && r.network === '192.168.3.0')
  assert.equal(route?.nextHop, '10.0.12.2')
  assert.equal(route?.metric, 3328)
  const middle = devices.find(d => d.id === r2.id)!
  const middleRoute = middle.routingTable.find(r => String(r.type) === 'D' && r.network === '192.168.3.0')
  assert.equal(middleRoute?.metric, 3072)
  assert.equal(middleRoute?.nextHop, '10.0.23.3')
  assert.match(parseIosCommand(router, 'show ip route').output, /D .*192\.168\.3\.0.*\[90\/3328\].*10\.0\.12\.2/)
  assert.match(parseIosCommand(router, 'show ip eigrp neighbors').output, /10\.0\.12\.2\s+Gi0\/1/)
  assert.match(parseIosCommand(router, 'show ip eigrp topology').output, /P 192\.168\.3\.0\/24, 1 successors, FD is 3328/)
  assert.match(parseIosCommand(router, 'show ip eigrp topology').output, /via 10\.0\.12\.2 \(3328\/3072\), GigabitEthernet0\/1/)
  assert.match(parseIosCommand(router, 'show ip protocols').output, /Routing Protocol is "eigrp 1"/)
})

test('EIGRP-learned paths carry a real echo reply across three routers', () => {
  const { a } = campus(); run()
  const { links } = useNetworkStore.getState()
  const { devices } = useNetworkStore.getState()
  let packets = createPingPackets(devices.find(d => d.id === a.id)!, devices, links, '192.168.3.10')
  let replied = false
  for (let i = 0; i < 500; i++) {
    const incoming = packets, step = stepSimulationTick(devices, links, packets)
    replied ||= step.packetDeliveries.some(d => d.status === 'delivered' && d.receiverDeviceId === a.id && incoming.some(p => p.id === d.packetId && p.pdu.payload.icmpType === 'echo-reply'))
    packets = step.newInFlightPackets
  }
  assert.equal(replied, true)
})

test('an EIGRP autonomous-system mismatch blocks the adjacency and the route', () => {
  const { r1, r2 } = campus()
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  cli(r2.id, 'configure terminal', 'no router eigrp 1', 'router eigrp 2', 'network 10.0.0.0', 'network 192.168.1.0', 'network 192.168.3.0', 'end')
  const { devices, links } = run(400)
  const router = devices.find(d => d.id === r1.id)!
  assert.equal(router.routingTable.some(r => String(r.type) === 'D'), false)
  assert.doesNotMatch(parseIosCommand(router, 'show ip eigrp neighbors').output, /10\.0\.12\.2/)
  assert.match(parseIosCommand(router, 'show ip protocols').output, /Last rejected packet: EIGRP AS mismatch/)
  let packets = createPingPackets(devices.find(d => d.id === r1.id)!, devices, links, '192.168.3.10')
  let replied = false
  for (let i = 0; i < 300; i++) {
    const incoming = packets, step = stepSimulationTick(devices, links, packets)
    replied ||= step.packetDeliveries.some(d => d.status === 'delivered' && incoming.some(p => p.id === d.packetId && p.pdu.payload.icmpType === 'echo-reply'))
    packets = step.newInFlightPackets
  }
  assert.equal(replied, false)
})

test('shutting the EIGRP link withdraws the learned route and no router eigrp flushes state', () => {
  const { r1, r2 } = campus()
  run(600)
  let router = useNetworkStore.getState().devices.find(d => d.id === r1.id)!
  assert.ok(router.routingTable.some(r => String(r.type) === 'D' && r.network === '192.168.3.0'))
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  cli(r2.id, 'configure terminal', `interface ${r2.ports[1].shortName}`, 'shutdown', 'end')
  run(200)
  router = useNetworkStore.getState().devices.find(d => d.id === r1.id)!
  assert.equal(router.routingTable.some(r => String(r.type) === 'D' && r.network === '192.168.3.0'), false)
  assert.match(parseIosCommand(router, 'show ip eigrp neighbors').output, /10\.0\.12\.2/)
  cli(r1.id, 'configure terminal', 'no router eigrp 1', 'end')
  const cleared = useNetworkStore.getState().devices.find(d => d.id === r1.id)!
  assert.equal(cleared.eigrp, undefined)
  assert.equal(cleared.config.eigrpAs, undefined)
  assert.equal(cleared.routingTable.some(r => String(r.type) === 'D'), false)
})

test('EIGRP runs over GRE, learns the remote LAN through the tunnel and returns a routed echo reply', () => {
  const routers = [0, 1].map(i => {
    const device = createDevice('router', i * 300, 0, '2811')
    device.id = `eigrp-gre-r${i + 1}`; device.name = device.id; device.config.hostname = device.id
    return device
  })
  const clients = [0, 1].map(i => {
    const device = createDevice('pc', i * 300, 200)
    device.id = `eigrp-gre-pc${i + 1}`; device.name = device.id
    return device
  })
  useNetworkStore.getState().loadLab([...routers, ...clients], [])
  for (const router of routers) router.ports.slice(0, 2).forEach(port => { port.adminStatus = 'up' })
  useNetworkStore.setState({ devices: [...routers, ...clients] })
  const connect = (left: NetworkDevice, leftPort: number, right: NetworkDevice, rightPort: number) => {
    assert.equal(useNetworkStore.getState().connectPorts(left.id, left.ports[leftPort].id, right.id, right.ports[rightPort].id, 'crossover'), true)
  }
  connect(routers[0], 0, routers[1], 0)
  connect(routers[0], 1, clients[0], 0)
  connect(routers[1], 1, clients[1], 0)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  const underlay = ['198.51.100.1', '198.51.100.2']
  const tunnel = ['172.16.0.1', '172.16.0.2']
  const lan = ['10.1.0.1', '10.2.0.1']
  routers.forEach((router, i) => {
    cli(router.id, 'enable', 'configure terminal', `interface ${router.ports[0].shortName}`, `ip address ${underlay[i]} 255.255.255.0`, 'no shutdown', 'exit', `interface ${router.ports[1].shortName}`, `ip address ${lan[i]} 255.255.255.0`, 'no shutdown', 'exit', 'interface Tunnel0', `ip address ${tunnel[i]} 255.255.255.252`, `tunnel source ${router.ports[0].shortName}`, `tunnel destination ${underlay[1 - i]}`, 'tunnel mode gre ip', 'no shutdown', 'exit', 'router eigrp 7', 'no auto-summary', 'network 172.16.0.0', 'network 10.0.0.0', 'end')
  })
  useNetworkStore.setState(state => ({ devices: state.devices.map(device => clients.some(client => client.id === device.id) ? {
    ...device,
    config: { ...device.config, defaultGateway: device.id === clients[0].id ? lan[0] : lan[1] },
    ports: device.ports.map((port, index) => index === 0 ? { ...port, ipAddress: device.id === clients[0].id ? '10.1.0.10' : '10.2.0.10', subnetMask: '255.255.255.0' } : port),
  } : device) }))

  const { devices, links } = run(300)
  const leftRouter = devices.find(device => device.id === routers[0].id)!
  const learned = leftRouter.routingTable.find(route => String(route.type) === 'D' && route.network === '10.2.0.0')
  assert.equal(learned?.interfaceName, 'Tunnel0')
  assert.equal(learned?.nextHop, tunnel[1])

  let currentDevices = useNetworkStore.getState().devices
  let packets = createPingPackets(currentDevices.find(device => device.id === clients[0].id)!, currentDevices, links, '10.2.0.10')
  let replyReceived = false
  for (let tick = 0; tick < 500; tick++) {
    const incoming = packets, step = stepSimulationTick(currentDevices, links, packets)
    currentDevices = step.updatedDevices; packets = step.newInFlightPackets
    replyReceived ||= step.packetDeliveries.some(delivery => delivery.status === 'delivered' && delivery.receiverDeviceId === clients[0].id && incoming.some(packet => packet.id === delivery.packetId && packet.pdu.payload.icmpType === 'echo-reply'))
  }
  assert.equal(replyReceived, true)
})
