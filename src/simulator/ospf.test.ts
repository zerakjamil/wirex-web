import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { stepSimulationTick, createPingPackets } from './engine'
import { useNetworkStore } from '../store/networkStore'
import { parseIosCommand } from './ios/ciscoParser'
import type { NetworkDevice } from '../types/network'
import { generatePktXml } from './pktEncoder'
import { parsePktXml } from './packetImport'
import { parseWorkspace } from './workspaceSchema'
import { getOspfPracticeLab } from './ospfLab'

function campus() {
  const routers = [0, 1, 2].map(i => {
    const d = createDevice('router', i * 200, 100, '2911')
    d.id = `r${i + 1}`; d.name = d.id; d.config.hostname = d.id
    return d
  })
  const [a, b] = [createDevice('pc', 0, 300), createDevice('pc', 600, 300)]
  a.id = 'a'; b.id = 'b'
  useNetworkStore.getState().loadLab([...routers, a, b], [])
  const connect = (d: NetworkDevice, p: number, e: NetworkDevice, q: number) => {
    assert.equal(useNetworkStore.getState().connectPorts(d.id, d.ports[p].id, e.id, e.ports[q].id, 'crossover'), true)
  }
  for (const r of routers) for (const p of r.ports.slice(0, 3)) p.adminStatus = 'up'
  useNetworkStore.setState({ devices: [...routers, a, b] })
  connect(routers[0], 1, routers[1], 0); connect(routers[1], 1, routers[2], 0)
  connect(routers[0], 0, a, 0); connect(routers[2], 1, b, 0)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  const addresses = [['192.168.1.1', '10.0.12.1'], ['10.0.12.2', '10.0.23.2'], ['10.0.23.3', '192.168.3.1']]
  for (let i = 0; i < 3; i++) {
    const r = routers[i]
    cli(r.id, 'enable', 'configure terminal')
    for (let j = 0; j < 2; j++) cli(r.id, `interface ${r.ports[j].shortName}`, `ip address ${addresses[i][j]} 255.255.255.0`, 'no shutdown', 'ip ospf network point-to-point', 'exit')
    cli(r.id, `router ospf ${i + 1}`, `router-id ${i + 1}.${i + 1}.${i + 1}.${i + 1}`, 'network 0.0.0.0 255.255.255.255 area 0', 'end')
  }
  useNetworkStore.setState(s => ({ devices: s.devices.map(d => [a.id, b.id].includes(d.id) ? { ...d, config: { ...d.config, defaultGateway: d.id === a.id ? '192.168.1.1' : '192.168.3.1' }, ports: d.ports.map((p, i) => i ? p : { ...p, ipAddress: d.id === a.id ? '192.168.1.10' : '192.168.3.10', subnetMask: '255.255.255.0' }) } : d) }))
  return { cli, routers, a, b }
}

function run(ticks = 1200) {
  const { links } = useNetworkStore.getState()
  let { devices, inFlightPackets: packets } = useNetworkStore.getState()
  const packetTypes = new Set<string>(), states = new Set<string>()
  for (let i = 0; i < ticks; i++) {
    const step = stepSimulationTick(devices, links, packets)
    devices = step.updatedDevices; packets = step.newInFlightPackets
    packets.forEach(p => { if (p.pdu.protocol === 'OSPF') packetTypes.add(p.pdu.payload.ospf!.type) })
    devices.forEach(d => d.ospf?.neighbors.forEach(n => states.add(n.state)))
    assert.ok(packets.length <= 256)
  }
  useNetworkStore.setState({ devices, inFlightPackets: packets })
  return { devices, links, packets, packetTypes, states }
}

test('OSPF forms adjacencies through Hello and database exchange packets before learning routes', () => {
  campus()
  const initial = useNetworkStore.getState().devices[0]
  assert.equal(initial.routingTable.some(r => r.type === 'O'), false)
  const { devices, packetTypes, states } = run()
  assert.ok(packetTypes.has('hello'))
  assert.ok(packetTypes.has('database-description'))
  assert.ok(packetTypes.has('link-state-request'))
  assert.ok(packetTypes.has('link-state-update'))
  assert.ok(packetTypes.has('link-state-ack'))
  assert.ok(states.has('Init')); assert.ok(states.has('Loading')); assert.ok(states.has('Full'))
  const route = devices[0].routingTable.find(r => r.type === 'O' && r.network === '192.168.3.0')
  assert.equal(route?.nextHop, '10.0.12.2')
  assert.equal(route?.interfaceName, devices[0].ports[1].name)
  assert.equal(route?.metric, 3)
  assert.match(parseIosCommand(devices[0], 'show ip ospf neighbor').output, /2\.2\.2\.2.*FULL/)
  assert.match(parseIosCommand(devices[0], 'show ip route').output, /O .*192\.168\.3\.0.*\[110\/3\].*10\.0\.12\.2/)
})

test('OSPF forms a point-to-point adjacency over GRE and carries a routed ping between LANs', () => {
  const routers = [0, 1].map(i => {
    const device = createDevice('router', i * 300, 0, '2811')
    device.id = `gre-r${i + 1}`; device.name = device.id; device.config.hostname = device.id
    return device
  })
  const clients = [0, 1].map(i => {
    const device = createDevice('pc', i * 300, 200)
    device.id = `gre-pc${i + 1}`; device.name = device.id
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
    cli(router.id, 'enable', 'configure terminal', `interface ${router.ports[0].shortName}`, `ip address ${underlay[i]} 255.255.255.0`, 'no shutdown', 'exit', `interface ${router.ports[1].shortName}`, `ip address ${lan[i]} 255.255.255.0`, 'no shutdown', 'exit', 'interface Tunnel0', `ip address ${tunnel[i]} 255.255.255.252`, `tunnel source ${router.ports[0].shortName}`, `tunnel destination ${underlay[1 - i]}`, 'tunnel mode gre ip', 'no shutdown', 'exit', `router ospf ${i + 1}`, `router-id ${i + 1}.${i + 1}.${i + 1}.${i + 1}`, `network ${tunnel[0].replace(/\.1$/, '.0')} 0.0.0.3 area 0`, `network ${lan[i].replace(/\.1$/, '.0')} 0.0.0.255 area 0`, 'end')
  })
  useNetworkStore.setState(state => ({ devices: state.devices.map(device => clients.some(client => client.id === device.id) ? {
    ...device,
    config: { ...device.config, defaultGateway: device.id === clients[0].id ? lan[0] : lan[1] },
    ports: device.ports.map((port, index) => index === 0 ? { ...port, ipAddress: device.id === clients[0].id ? '10.1.0.10' : '10.2.0.10', subnetMask: '255.255.255.0' } : port),
  } : device) }))

  const { devices, links } = run(1200)
  const leftRouter = devices.find(device => device.id === routers[0].id)!
  assert.equal(leftRouter.ospf?.neighbors.find(neighbor => neighbor.portId === leftRouter.ports.find(port => port.name === 'Tunnel0')?.id)?.state, 'Full')
  assert.equal(leftRouter.routingTable.find(route => route.type === 'O' && route.network === '10.2.0.0')?.interfaceName, 'Tunnel0')

  let currentDevices = useNetworkStore.getState().devices
  let packets = createPingPackets(currentDevices.find(device => device.id === clients[0].id)!, currentDevices, links, '10.2.0.10')
  let replyReceived = false
  for (let tick = 0; tick < 500; tick++) {
    const incoming = packets
    const step = stepSimulationTick(currentDevices, links, packets)
    currentDevices = step.updatedDevices; packets = step.newInFlightPackets
    replyReceived ||= step.packetDeliveries.some(delivery => delivery.status === 'delivered' && delivery.receiverDeviceId === clients[0].id && incoming.some(packet => packet.id === delivery.packetId && packet.pdu.payload.icmpType === 'echo-reply'))
  }
  assert.equal(replyReceived, true)

  useNetworkStore.setState({ devices: currentDevices, inFlightPackets: packets })
  cli(routers[0].id, 'configure terminal', 'interface Tunnel0', 'keepalive 1 2', 'end')
  cli(routers[1].id, 'configure terminal', 'interface Tunnel0', 'tunnel destination 198.51.100.99', 'end')
  const advance = (ticks: number) => {
    let inFlight = useNetworkStore.getState().inFlightPackets
    for (let tick = 0; tick < ticks; tick++) {
      const state = useNetworkStore.getState()
      const step = stepSimulationTick(state.devices, links, inFlight)
      inFlight = step.newInFlightPackets
      useNetworkStore.setState({ devices: step.updatedDevices, inFlightPackets: inFlight })
    }
  }
  advance(60)
  let state = useNetworkStore.getState()
  let local = state.devices.find(device => device.id === routers[0].id)!
  assert.equal(local.routingTable.some(route => route.type === 'O' && route.network === '10.2.0.0'), false)
  assert.equal(local.ospf?.neighbors.some(neighbor => neighbor.portId === local.ports.find(port => port.name === 'Tunnel0')?.id), false)

  cli(routers[1].id, 'configure terminal', 'interface Tunnel0', 'tunnel destination 198.51.100.1', 'end')
  advance(180)
  state = useNetworkStore.getState()
  local = state.devices.find(device => device.id === routers[0].id)!
  assert.equal(local.routingTable.find(route => route.type === 'O' && route.network === '10.2.0.0')?.interfaceName, 'Tunnel0')
  assert.equal(local.ospf?.neighbors.find(neighbor => neighbor.portId === local.ports.find(port => port.name === 'Tunnel0')?.id)?.state, 'Full')
})

test('learned OSPF routes carry a real end-to-end ICMP echo request and reply', () => {
  const { a } = campus(); run()
  const { links } = useNetworkStore.getState()
  let { devices } = useNetworkStore.getState()
  let packets = createPingPackets(devices.find(d => d.id === a.id)!, devices, links, '192.168.3.10')
  let replied = false
  const drops: string[] = []
  for (let i = 0; i < 500; i++) {
    const incoming = packets
    const step = stepSimulationTick(devices, links, packets); devices = step.updatedDevices; packets = step.newInFlightPackets
    replied ||= step.packetDeliveries.some(delivery => delivery.status === 'delivered' && delivery.receiverDeviceId === a.id && incoming.some(p => p.id === delivery.packetId && p.pdu.payload.icmpType === 'echo-reply'))
    drops.push(...step.packetDeliveries.filter(d => d.status === 'dropped' && incoming.some(p => p.id === d.packetId && p.pdu.protocol !== 'OSPF')).map(d => d.reason ?? ''))
  }
  assert.equal(replied, true, drops.join('; '))
})

test('link loss withdraws learned routes and restoration reconverges', () => {
  campus(); run()
  const link = useNetworkStore.getState().links.find(l => l.fromDeviceId === 'r2' && l.toDeviceId === 'r3')!
  useNetworkStore.getState().deleteLink(link.id)
  run()
  assert.equal(useNetworkStore.getState().devices[0].routingTable.some(r => r.type === 'O' && r.network === '192.168.3.0'), false)
  const state = useNetworkStore.getState(), r2 = state.devices.find(d => d.id === 'r2')!, r3 = state.devices.find(d => d.id === 'r3')!
  assert.ok(state.connectPorts(r2.id, r2.ports[1].id, r3.id, r3.ports[0].id, 'crossover'))
  run()
  assert.ok(useNetworkStore.getState().devices[0].routingTable.some(r => r.type === 'O' && r.network === '192.168.3.0'))
})

test('an area mismatch cannot form an adjacency or learn the remote LAN', () => {
  campus()
  useNetworkStore.setState(s => ({ devices: s.devices.map(d => d.id === 'r3' ? { ...d, config: { ...d.config, ospfNetworks: [{ network: '0.0.0.0', wildcard: '255.255.255.255', area: 1 }] } } : d) }))
  run()
  assert.equal(useNetworkStore.getState().devices[0].routingTable.some(r => r.type === 'O' && r.network === '192.168.3.0'), false)
  assert.equal(useNetworkStore.getState().devices.find(d => d.id === 'r3')!.ospf?.neighbors.length ?? 0, 0)
})

test('passive LAN interfaces advertise their subnet but emit no Hello and cannot form neighbors', () => {
  const { cli, routers } = campus()
  cli('r1', 'configure terminal', 'router ospf 1', `passive-interface ${routers[0].ports[0].shortName}`, 'end')
  const { devices, packets } = run()
  assert.ok(devices.find(d => d.id === 'r3')!.routingTable.some(r => r.type === 'O' && r.network === '192.168.1.0'))
  assert.ok(packets.every(p => !(p.fromDeviceId === 'r1' && p.linkId === routers[0].ports[0].connectedLinkId && p.pdu.protocol === 'OSPF')))
  cli('r1', 'configure terminal', 'router ospf 1', `passive-interface ${routers[0].ports[1].shortName}`, 'end')
  run()
  assert.equal(useNetworkStore.getState().devices[0].routingTable.some(r => r.type === 'O'), false)
})

test('OSPF timer mismatch, subnet mismatch and duplicate router IDs prevent learning', () => {
  for (const change of ['timer', 'subnet', 'router-id']) {
    const { cli, routers } = campus()
    cli('r3', 'configure terminal')
    if (change === 'router-id') cli('r3', 'router ospf 3', 'router-id 2.2.2.2')
    else cli('r3', `interface ${routers[2].ports[0].shortName}`, change === 'timer' ? 'ip ospf hello-interval 5' : 'ip address 10.99.23.3 255.255.255.0')
    cli('r3', 'end'); run()
    assert.equal(useNetworkStore.getState().devices[0].routingTable.some(r => r.type === 'O' && r.network === '192.168.3.0'), false, change)
    const peer = useNetworkStore.getState().devices.find(d => d.id === 'r2')!
    assert.match(parseIosCommand(peer, 'show ip ospf neighbor').output, change === 'timer' ? /timer mismatch.*10\/40.*5\/40/ : change === 'subnet' ? /subnet mismatch.*10\.0\.23\.2.*10\.99\.23\.3/ : /Duplicate OSPF router ID 2\.2\.2\.2/)
  }
})

test('simulation pause freezes OSPF and Capture Forward progresses it even without user traffic', () => {
  campus(); useNetworkStore.setState({ simulationMode: 'simulation', simulationPlaying: false })
  const before = useNetworkStore.getState().devices
  useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().devices, before)
  useNetworkStore.getState().stepSimulation()
  assert.ok(useNetworkStore.getState().inFlightPackets.some(p => p.pdu.protocol === 'OSPF'))
})

test('stopping the routing process removes only learned OSPF routes', () => {
  const { cli } = campus(); run()
  cli('r1', 'configure terminal', 'ip route 203.0.113.0 255.255.255.0 10.0.12.2', 'no router ospf 1', 'end')
  run()
  const r = useNetworkStore.getState().devices[0]
  assert.equal(r.routingTable.some(r => r.type === 'O'), false)
  assert.ok(r.routingTable.some(r => r.type === 'S' && r.network === '203.0.113.0'))
})

test('a cheaper alternate OSPF path is selected, failed over, and restored', () => {
  const { cli, routers } = campus()
  assert.ok(useNetworkStore.getState().connectPorts('r1', routers[0].ports[2].id, 'r3', routers[2].ports[2].id, 'crossover'))
  for (const [id, ip, router] of [['r1', '10.0.13.1', routers[0]], ['r3', '10.0.13.3', routers[2]]] as const) cli(id, 'configure terminal', `interface ${router.ports[2].shortName}`, `ip address ${ip} 255.255.255.0`, 'ip ospf network point-to-point', 'ip ospf cost 10', 'no shutdown', 'end')
  run()
  const remote = () => useNetworkStore.getState().devices[0].routingTable.find(r => r.type === 'O' && r.network === '192.168.3.0')
  assert.equal(remote()?.nextHop, '10.0.12.2')
  cli('r1', 'configure terminal', `interface ${routers[0].ports[1].shortName}`, 'shutdown', 'end')
  run(); assert.equal(remote()?.nextHop, '10.0.13.3'); assert.equal(remote()?.metric, 11)
  cli('r1', 'configure terminal', `interface ${routers[0].ports[1].shortName}`, 'no shutdown', 'end')
  run(); assert.equal(remote()?.nextHop, '10.0.12.2'); assert.equal(remote()?.metric, 3)
})

test('loss of received Hellos expires the neighbor and withdraws its routes after the dead interval', () => {
  campus(); run()
  const { links } = useNetworkStore.getState()
  let { devices } = useNetworkStore.getState()
  let packets = useNetworkStore.getState().inFlightPackets
  const cutoff = devices.find(d => d.id === 'r2')!.ospf!.clock
  for (let i = 0; i < 800; i++) {
    packets = packets.filter(p => !(p.fromDeviceId === 'r3' && p.toDeviceId === 'r2' && p.pdu.protocol === 'OSPF'))
    const step = stepSimulationTick(devices, links, packets); devices = step.updatedDevices; packets = step.newInFlightPackets
    if (i === 400) assert.ok(devices[1].ospf!.neighbors.some(n => n.routerId === '3.3.3.3' && n.state === 'Full'))
  }
  assert.ok(devices[1].ospf!.clock - cutoff >= 40000)
  assert.equal(devices[1].ospf!.neighbors.some(n => n.routerId === '3.3.3.3'), false)
  assert.equal(devices[0].routingTable.some(r => r.type === 'O' && r.network === '192.168.3.0'), false)
})

test('broadcast OSPF elects DR and BDR while DROTHER pairs remain 2-Way', () => {
  const sw = createDevice('switch', 0, 0); sw.config.portfastDefault = true
  const routers = Array.from({ length: 4 }, (_, i) => {
    const d = createDevice('router', i * 100, 100, '2911'); d.id = `broadcast${i}`
    Object.assign(d.ports[0], { ipAddress: `10.100.0.${i + 1}`, subnetMask: '255.255.255.0', adminStatus: 'up' })
    d.config.ospfProcessId = 1; d.config.ospfRouterId = `${i + 1}.${i + 1}.${i + 1}.${i + 1}`
    d.config.ospfNetworks = [{ network: '10.100.0.0', wildcard: '0.0.0.255', area: 0 }]
    return d
  })
  useNetworkStore.getState().loadLab([...routers, sw], [])
  routers.forEach((r, i) => assert.ok(useNetworkStore.getState().connectPorts(r.id, r.ports[0].id, sw.id, sw.ports[i].id, 'straight')))
  const { devices } = run(1500)
  for (const r of devices.slice(0, 4)) {
    assert.equal(r.ospf?.interfaces[0].designatedRouter, '10.100.0.4')
    assert.equal(r.ospf?.interfaces[0].backupRouter, '10.100.0.3')
  }
  assert.equal(devices[0].ospf?.neighbors.find(n => n.routerId === '2.2.2.2')?.state, '2-Way')
  assert.equal(devices[0].ospf?.neighbors.find(n => n.routerId === '4.4.4.4')?.state, 'Full')
  assert.equal(devices[2].ospf?.neighbors.filter(n => n.state === 'Full').length, 3)
})

test('PKT serialization and import preserve operational OSPF settings', () => {
  const { cli, routers } = campus()
  cli('r1', 'configure terminal', `interface ${routers[0].ports[1].shortName}`, 'ip ospf cost 7', 'ip ospf hello-interval 5', 'ip ospf dead-interval 20', 'exit', 'router ospf 1', `passive-interface ${routers[0].ports[0].shortName}`, 'end')
  const state = useNetworkStore.getState(), imported = parsePktXml(generatePktXml(state.devices, state.links)).devices[0]
  assert.deepEqual(imported.config.ospfNetworks, state.devices[0].config.ospfNetworks)
  assert.equal(imported.config.ospfRouterId, '1.1.1.1')
  assert.deepEqual(imported.config.ospfPassiveInterfaces, [routers[0].ports[0].name])
  assert.equal(imported.ports[1].ospfCost, 7)
  assert.equal(imported.ports[1].ospfHelloInterval, 5)
  assert.equal(imported.ports[1].ospfDeadInterval, 20)
  assert.equal(imported.ports[1].ospfNetworkType, 'point-to-point')
})

test('saved labs restart OSPF discovery rather than restoring stale adjacencies or learned routes', () => {
  campus(); run()
  const { devices, links } = useNetworkStore.getState()
  const saved = parseWorkspace(JSON.parse(JSON.stringify({ version: 1, devices, links })))
  assert.equal(saved.devices[0].ospf, undefined)
  assert.equal(saved.devices[0].routingTable.some(r => r.type === 'O'), false)
  useNetworkStore.getState().loadLab(saved.devices, saved.links); run()
  assert.ok(useNetworkStore.getState().devices[0].routingTable.some(r => r.type === 'O' && r.network === '192.168.3.0'))
})

test('a restarted process converges with neighbors retaining an older link-state database', () => {
  const { cli } = campus(); run()
  cli('r1', 'configure terminal', 'no router ospf 1', 'end'); run(800)
  cli('r1', 'configure terminal', 'router ospf 1', 'router-id 1.1.1.1', 'network 0.0.0.0 255.255.255.255 area 0', 'end'); run()
  const routes = useNetworkStore.getState().devices.find(d => d.id === 'r3')!.routingTable
  assert.ok(routes.some(r => r.type === 'O' && r.network === '192.168.1.0'))
})

test('a lost link-state update is retransmitted and acknowledged before convergence', () => {
  campus()
  const { links } = useNetworkStore.getState()
  let { devices } = useNetworkStore.getState()
  let packets = useNetworkStore.getState().inFlightPackets
  let lost = false
  for (let i = 0; i < 1200; i++) {
    if (!lost && packets.some(p => p.pdu.payload.ospf?.type === 'link-state-update')) {
      packets = packets.filter(p => p.pdu.payload.ospf?.type !== 'link-state-update'); lost = true
    }
    const step = stepSimulationTick(devices, links, packets); devices = step.updatedDevices; packets = step.newInFlightPackets
  }
  assert.equal(lost, true)
  assert.ok(devices[0].routingTable.some(r => r.type === 'O' && r.network === '192.168.3.0'))
  assert.ok(devices.slice(0, 3).every(d => d.ospf!.neighbors.every(n => n.retransmissions.length === 0)))
})

test('clear ip ospf process restarts discovery while keeping configuration and increasing LSA sequences', () => {
  const { cli } = campus(); run()
  const before = useNetworkStore.getState().devices[0]
  assert.match(cli('r1', 'clear ip ospf process')[0], /restart/i)
  const restarted = useNetworkStore.getState().devices[0]
  assert.equal(restarted.ospf, undefined)
  assert.equal(restarted.routingTable.some(r => r.type === 'O'), false)
  assert.deepEqual(restarted.config, before.config)
  run()
  assert.ok(useNetworkStore.getState().devices.find(d => d.id === 'r3')!.routingTable.some(r => r.type === 'O' && r.network === '192.168.1.0'))
})

test('the selectable OSPF practice lab converges and has a working backup route', () => {
  const lab = getOspfPracticeLab()
  const saved = parseWorkspace({ version: 1, ...lab })
  useNetworkStore.getState().loadLab(saved.devices, saved.links, saved.annotations)
  const r1 = saved.devices.find(d => d.name === 'R1')!
  run()
  const remote = () => useNetworkStore.getState().devices.find(d => d.id === r1.id)!.routingTable.find(r => r.type === 'O' && r.network === '192.168.3.0')
  assert.equal(remote()?.nextHop, '10.0.12.2')
  assert.equal(remote()?.metric, 3)
  const cli = useNetworkStore.getState().executeIosCommand
  cli(r1.id, 'enable'); cli(r1.id, 'configure terminal'); cli(r1.id, `interface ${r1.ports[1].shortName}`); cli(r1.id, 'shutdown'); cli(r1.id, 'end')
  run()
  assert.equal(remote()?.nextHop, '10.0.13.3')
  assert.equal(remote()?.metric, 11)
})
