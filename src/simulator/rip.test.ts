import test from 'node:test'
import assert from 'node:assert/strict'
import { getOspfPracticeLab } from './ospfLab'
import { createDevice } from './deviceFactory'
import { useNetworkStore } from '../store/networkStore'
import { stepSimulationTick, createPingPackets } from './engine'
import { parseIosCommand } from './ios/ciscoParser'
import { generatePktXml } from './pktEncoder'
import { parsePktXml } from './packetImport'
import { parseWorkspace } from './workspaceSchema'
import { receiveRipPacket, prepareRipTick } from './rip'
import type { NetworkDevice, PacketPdu } from '../types/network'
import { getRipPracticeLab } from './ripLab'

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
  for (const r of [r1, r2, r3]) cli(r.id, 'enable', 'configure terminal', 'router rip', 'version 2', 'no auto-summary', 'network 10.0.0.0', 'network 192.168.1.0', 'network 192.168.3.0', 'end')
  return { r1, r2, r3, a, b, cli }
}

function run(ticks = 1100) {
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

test('RIPv2 learns hop-count routes from control packets and CLI shows actual next hops', () => {
  const { r1 } = campus()
  assert.equal(useNetworkStore.getState().devices[0].routingTable.some(r => String(r.type) === 'R'), false)
  const { devices, protocols } = run()
  assert.ok(protocols.has('RIP'))
  const router = devices.find(d => d.id === r1.id)!
  const route = router.routingTable.find(r => String(r.type) === 'R' && r.network === '192.168.3.0')
  assert.equal(route?.nextHop, '10.0.12.2'); assert.equal(route?.metric, 2)
  assert.match(parseIosCommand(router, 'show ip route').output, /R .*192\.168\.3\.0.*\[120\/2\].*10\.0\.12\.2/)
  assert.match(parseIosCommand(router, 'show ip protocols').output, /Routing Protocol is "rip"/)
})

test('RIP-learned paths carry a real echo reply across three routers', () => {
  const { a } = campus(); run()
  const { links } = useNetworkStore.getState()
  let { devices } = useNetworkStore.getState()
  let packets = createPingPackets(devices.find(d => d.id === a.id)!, devices, links, '192.168.3.10')
  let replied = false
  for (let i = 0; i < 500; i++) {
    const incoming = packets, step = stepSimulationTick(devices, links, packets)
    replied ||= step.packetDeliveries.some(d => d.status === 'delivered' && d.receiverDeviceId === a.id && incoming.some(p => p.id === d.packetId && p.pdu.payload.icmpType === 'echo-reply'))
    devices = step.updatedDevices; packets = step.newInFlightPackets
  }
  assert.equal(replied, true)
})

test('RIPv2 sends updates over GRE, learns the remote LAN and returns a routed echo reply', () => {
  const routers = [0, 1].map(i => {
    const device = createDevice('router', i * 300, 0, '2811')
    device.id = `rip-gre-r${i + 1}`; device.name = device.id; device.config.hostname = device.id
    return device
  })
  const clients = [0, 1].map(i => {
    const device = createDevice('pc', i * 300, 200)
    device.id = `rip-gre-pc${i + 1}`; device.name = device.id
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
    cli(router.id, 'enable', 'configure terminal', `interface ${router.ports[0].shortName}`, `ip address ${underlay[i]} 255.255.255.0`, 'no shutdown', 'exit', `interface ${router.ports[1].shortName}`, `ip address ${lan[i]} 255.255.255.0`, 'no shutdown', 'exit', 'interface Tunnel0', `ip address ${tunnel[i]} 255.255.255.252`, `tunnel source ${router.ports[0].shortName}`, `tunnel destination ${underlay[1 - i]}`, 'tunnel mode gre ip', 'no shutdown', 'exit', 'router rip', 'version 2', 'no auto-summary', 'network 172.16.0.0', 'network 10.0.0.0', 'end')
  })
  useNetworkStore.setState(state => ({ devices: state.devices.map(device => clients.some(client => client.id === device.id) ? {
    ...device,
    config: { ...device.config, defaultGateway: device.id === clients[0].id ? lan[0] : lan[1] },
    ports: device.ports.map((port, index) => index === 0 ? { ...port, ipAddress: device.id === clients[0].id ? '10.1.0.10' : '10.2.0.10', subnetMask: '255.255.255.0' } : port),
  } : device) }))

  const { devices, links, protocols } = run(1100)
  const leftRouter = devices.find(device => device.id === routers[0].id)!
  const learned = leftRouter.routingTable.find(route => route.type === 'R' && route.network === '10.2.0.0')
  assert.ok(protocols.has('GRE'))
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
  let localRouter = state.devices.find(device => device.id === routers[0].id)!
  assert.equal(localRouter.routingTable.some(route => route.type === 'R' && route.network === '10.2.0.0'), false)

  cli(routers[1].id, 'configure terminal', 'interface Tunnel0', 'tunnel destination 198.51.100.1', 'end')
  advance(750)
  state = useNetworkStore.getState()
  localRouter = state.devices.find(device => device.id === routers[0].id)!
  assert.equal(localRouter.routingTable.find(route => route.type === 'R' && route.network === '10.2.0.0')?.interfaceName, 'Tunnel0')
})

test('RIP poisons a lost path, withdraws it and learns it again after link restoration', () => {
  const { r1, r2, r3 } = campus(); run()
  const link = useNetworkStore.getState().links.find(l => l.fromDeviceId === r2.id && l.toDeviceId === r3.id)!
  useNetworkStore.getState().deleteLink(link.id); run(300)
  assert.equal(useNetworkStore.getState().devices.find(d => d.id === r1.id)!.routingTable.some(r => String(r.type) === 'R' && r.network === '192.168.3.0'), false)
  assert.ok(useNetworkStore.getState().connectPorts(r2.id, r2.ports[1].id, r3.id, r3.ports[0].id, 'crossover'))
  run()
  assert.ok(useNetworkStore.getState().devices.find(d => d.id === r1.id)!.routingTable.some(r => String(r.type) === 'R' && r.network === '192.168.3.0'))
})

test('passive RIP interfaces receive updates but do not send them', () => {
  const { r1, r2, cli } = campus()
  cli(r2.id, 'configure terminal', 'router rip', `passive-interface ${r2.ports[0].name}`, 'end')
  const { devices } = run()
  assert.equal(devices.find(d => d.id === r1.id)!.routingTable.some(r => String(r.type) === 'R' && r.network === '192.168.3.0'), false)
  assert.ok(devices.find(d => d.id === r2.id)!.routingTable.some(r => String(r.type) === 'R' && r.network === '192.168.1.0'))
})

test('a lost local LAN is advertised as unreachable without waiting for the neighbor timeout', () => {
  const { r1, r3, cli } = campus(); run()
  cli(r3.id, 'configure terminal', `interface ${r3.ports[1].name}`, 'shutdown', 'end')
  run(300)
  assert.equal(useNetworkStore.getState().devices.find(d => d.id === r1.id)!.routingTable.some(r => r.type === 'R' && r.network === '192.168.3.0'), false)
})

test('show ip route hides a connected network while its interface is shut and restores it when up', () => {
  const { r1, cli } = campus(); run()
  cli(r1.id, 'configure terminal', `interface ${r1.ports[0].name}`, 'shutdown', 'end')
  const output = () => parseIosCommand(useNetworkStore.getState().devices.find(d => d.id === r1.id)!, 'show ip route').output
  assert.doesNotMatch(output(), /C .*192\.168\.1\.0/)
  cli(r1.id, 'configure terminal', `interface ${r1.ports[0].name}`, 'no shutdown', 'end')
  assert.match(output(), /C .*192\.168\.1\.0/)
})

test('RIP version mismatch rejects updates and names the receiving interface', () => {
  const { r1, r2, cli } = campus()
  cli(r2.id, 'configure terminal', 'router rip', 'version 1', 'end')
  const { devices } = run()
  const router = devices.find(d => d.id === r1.id)!
  assert.equal(router.routingTable.some(r => r.type === 'R'), false)
  assert.match(router.rip?.lastError ?? '', /version mismatch.*GigabitEthernet0\/1.*local version 2.*received version 1/)
})

test('an inbound UDP port 520 ACL blocks RIP learning without inventing routes', () => {
  const { r1, cli } = campus()
  cli(r1.id, 'configure terminal', 'access-list 101 deny udp any any eq 520', 'access-list 101 permit ip any any', `interface ${r1.ports[1].name}`, 'ip access-group 101 in', 'end')
  const router = run().devices.find(d => d.id === r1.id)!
  assert.equal(router.routingTable.some(r => r.type === 'R'), false)
})

test('RIP pause freezes timers and manual forwarding starts updates with an empty queue', () => {
  campus()
  useNetworkStore.setState({ simulationMode: 'simulation', simulationPlaying: false, inFlightPackets: [] })
  useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().devices[0].rip, undefined)
  useNetworkStore.getState().stepSimulation()
  assert.ok(useNetworkStore.getState().devices[0].rip!.clock > 0)
  assert.ok(useNetworkStore.getState().inFlightPackets.some(p => p.pdu.protocol === 'RIP'))
  const clock = useNetworkStore.getState().devices[0].rip!.clock
  useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().devices[0].rip!.clock, clock)
})

test('RIP reload restarts route learning and internal PKT round trips retain controls', () => {
  const { r1, cli } = campus()
  cli(r1.id, 'configure terminal', 'router rip', 'passive-interface default', `no passive-interface ${r1.ports[1].name}`, 'end')
  const { devices, links } = run()
  const parsed = parseWorkspace({ version: 1, devices: structuredClone(devices), links, annotations: [], deviceWindows: [], fileName: 'rip.pkt' })
  assert.equal(parsed.devices.some(d => d.rip || d.routingTable.some(r => r.type === 'R')), false)
  const imported = parsePktXml(generatePktXml(devices, links)).devices[0]
  assert.equal(imported.config.ripVersion, 2)
  assert.equal(imported.config.ripAutoSummary, false)
  assert.equal(imported.config.ripPassiveDefault, true)
  assert.deepEqual(imported.config.ripActiveInterfaces, [r1.ports[1].name])
})

test('RIP silence keeps a route before 180 seconds, invalidates it and later flushes it', () => {
  campus(); run()
  let router = useNetworkStore.getState().devices[0]
  const before = router.rip!.candidates.find(c => c.network === '192.168.3.0')!
  while (router.rip!.clock - before.updatedAt < 179000) router = prepareRipTick([router]).devices[0]
  assert.ok(router.routingTable.some(r => r.type === 'R' && r.network === '192.168.3.0'))
  while (router.rip!.clock - before.updatedAt < 181000) router = prepareRipTick([router]).devices[0]
  assert.equal(router.routingTable.some(r => r.type === 'R' && r.network === '192.168.3.0'), false)
  assert.equal(router.rip!.candidates.find(c => c.network === '192.168.3.0')?.metric, 16)
  while (router.rip!.clock - before.updatedAt < 242000) router = prepareRipTick([router]).devices[0]
  assert.equal(router.rip!.candidates.some(c => c.network === '192.168.3.0'), false)
})

test('poison reverse advertises metric 16 back to the interface that supplied a route', () => {
  campus(); run()
  const router = useNetworkStore.getState().devices[0]
  const packet = prepareRipTick([{ ...router, rip: { ...router.rip!, lastUpdate: -30000 } }]).outbound.find(p => p.portId === router.ports[1].id && p.pdu.payload.rip?.command === 'response')!
  assert.equal(packet.pdu.payload.rip!.entries.find(e => e.network === '192.168.3.0')?.metric, 16)
})

test('metric 16, invalid metrics and off-subnet peers cannot install a route', () => {
  campus(); run()
  const router = useNetworkStore.getState().devices[0], port = router.ports[1]
  const packet: PacketPdu = { id: 'rip-fixture', protocol: 'RIP', summary: 'RIP fixture', sourceIp: '10.0.12.2', destIp: '224.0.0.9', sourceMac: '00:00:00:00:00:01', destMac: '01:00:5e:00:00:09', etherType: '0x0800', ttl: 1, payload: { rip: { version: 2, command: 'response', entries: [{ network: '172.16.4.0', netmask: '255.255.255.0', metric: 16 }] } }, explanation: { layer1: '', layer2: '', layer3: '', layer4AndAbove: '', deviceDecision: '' } }
  assert.equal(receiveRipPacket(router, port, packet).device.routingTable.some(r => r.network === '172.16.4.0'), false)
  for (const metric of [0, 17, 1.5]) assert.match(receiveRipPacket(router, port, { ...packet, payload: { rip: { ...packet.payload.rip!, entries: [{ ...packet.payload.rip!.entries[0], metric }] } } }).reason ?? '', /Malformed/)
  assert.match(receiveRipPacket(router, port, { ...packet, sourceIp: '10.0.23.3' }).reason ?? '', /not a distinct neighbor/)
})

test('the RIP practice lab converges through its shortest path and fails over to an alternate', () => {
  const lab = getRipPracticeLab()
  parseWorkspace({ version: 1, devices: structuredClone(lab.devices), links: lab.links, annotations: lab.annotations, deviceWindows: [], fileName: '' })
  useNetworkStore.getState().loadLab(lab.devices, lab.links, lab.annotations)
  const [r1, r2, r3] = lab.devices
  let router = run().devices.find(d => d.id === r1.id)!
  assert.equal(router.routingTable.find(r => r.type === 'R' && r.network === '192.168.3.0')?.metric, 1)
  const direct = lab.links.find(l => l.fromDeviceId === r1.id && l.toDeviceId === r3.id)!
  useNetworkStore.getState().deleteLink(direct.id)
  router = run().devices.find(d => d.id === r1.id)!
  const route = router.routingTable.find(r => r.type === 'R' && r.network === '192.168.3.0')
  assert.equal(route?.metric, 2); assert.equal(route?.nextHop, '10.0.12.2')
  assert.ok(useNetworkStore.getState().devices.find(d => d.id === r2.id)!.rip)
})

test('removing RIP clears learned routes while preserving a configured static route', () => {
  const { r1, cli } = campus(); run()
  cli(r1.id, 'configure terminal', 'ip route 172.16.0.0 255.255.0.0 10.0.12.2', 'no router rip', 'end')
  const router = useNetworkStore.getState().devices[0]
  assert.equal(router.rip, undefined)
  assert.equal(router.routingTable.some(r => r.type === 'R'), false)
  assert.ok(router.routingTable.some(r => r.type === 'S' && r.network === '172.16.0.0'))
})

test('auto-summary aggregates across major networks and no auto-summary carries VLSM masks', () => {
  campus(); run()
  const original = useNetworkStore.getState().devices[0], candidate = { network: '172.16.8.0', netmask: '255.255.255.192', metric: 2, portId: original.ports[1].id, nextHop: '10.0.12.2', updatedAt: original.rip!.clock }
  for (const summary of [true, false]) {
    const router = { ...original, config: { ...original.config, ripAutoSummary: summary }, rip: { ...original.rip!, lastUpdate: -30000, candidates: [...original.rip!.candidates, candidate] } }
    const messages = prepareRipTick([router]).outbound.filter(p => p.portId === original.ports[0].id)
    const entry = messages.flatMap(p => p.pdu.payload.rip?.entries ?? []).find(e => e.network.startsWith('172.16.'))!
    assert.equal(entry.network, summary ? '172.16.0.0' : '172.16.8.0')
    assert.equal(entry.netmask, summary ? '255.255.0.0' : '255.255.255.192')
  }
})

test('the default RIP mode sends classful version 1 broadcasts', () => {
  const { r1, cli } = campus()
  cli(r1.id, 'configure terminal', 'router rip', 'no version', 'end')
  const messages = prepareRipTick(useNetworkStore.getState().devices).outbound.filter(p => p.deviceId === r1.id)
  assert.ok(messages.length)
  assert.ok(messages.every(p => p.pdu.destIp === '255.255.255.255' && p.pdu.destMac === 'ff:ff:ff:ff:ff:ff' && p.pdu.payload.rip?.version === 1))
})
