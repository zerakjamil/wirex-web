import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { stepSimulationTick } from './engine'
import { useNetworkStore } from '../store/networkStore'
import { parseIosCommand } from './ios/ciscoParser'
import { completePingResults } from '../store/pingResults'
import type { NetworkDevice } from '../types/network'
import { ipv6LinkLocalFromMac, ipv6NetworkAddress } from './protocols/ipv6'

function campus() {
  const routers = [0, 1, 2].map(i => {
    const d = createDevice('router', i * 200, 100, '2911')
    d.id = `v3r${i + 1}`; d.name = d.id; d.config.hostname = d.id
    return d
  })
  const [a, b] = [createDevice('pc', 0, 300), createDevice('pc', 600, 300)]
  a.id = 'v3a'; b.id = 'v3b'
  useNetworkStore.getState().loadLab([...routers, a, b], [])
  const connect = (d: NetworkDevice, p: number, e: NetworkDevice, q: number) => {
    assert.equal(useNetworkStore.getState().connectPorts(d.id, d.ports[p].id, e.id, e.ports[q].id, 'crossover'), true)
  }
  for (const r of routers) for (const p of r.ports.slice(0, 3)) p.adminStatus = 'up'
  useNetworkStore.setState({ devices: [...routers, a, b] })
  connect(routers[0], 1, routers[1], 0); connect(routers[1], 1, routers[2], 0)
  connect(routers[0], 0, a, 0); connect(routers[2], 1, b, 0)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  const addresses = [
    ['2001:db8:1::1/64', '2001:db8:12::1/64'],
    ['2001:db8:12::2/64', '2001:db8:23::2/64'],
    ['2001:db8:23::3/64', '2001:db8:3::1/64'],
  ]
  for (let i = 0; i < 3; i++) {
    const r = routers[i]
    cli(r.id, 'enable', 'configure terminal', 'ipv6 router ospf 1', `router-id ${i + 1}.${i + 1}.${i + 1}.${i + 1}`, 'end')
    for (let j = 0; j < 2; j++) cli(r.id, 'configure terminal', `interface ${r.ports[j].shortName}`, `ipv6 address ${addresses[i][j]}`, 'no shutdown', 'ipv6 ospf 1 area 0', 'end')
  }
  useNetworkStore.setState(s => ({ devices: s.devices.map(d => [a.id, b.id].includes(d.id) ? {
    ...d,
    config: { ...d.config, ipv6DefaultGateway: d.id === a.id ? '2001:db8:1::1' : '2001:db8:3::1' },
    ports: d.ports.map((port, i) => i ? port : { ...port, ipv6Addresses: [{ address: d.id === a.id ? '2001:db8:1::10' : '2001:db8:3::10', prefixLength: 64 }] }),
  } : d) }))
  return { cli, routers, a, b }
}

function run(ticks = 1200) {
  const { links } = useNetworkStore.getState()
  let { devices, inFlightPackets: packets } = useNetworkStore.getState()
  const packetTypes = new Set<string>(), states = new Set<string>()
  for (let i = 0; i < ticks; i++) {
    const step = stepSimulationTick(devices, links, packets)
    devices = step.updatedDevices; packets = step.newInFlightPackets
    packets.forEach(p => { if (p.pdu.protocol === 'OSPF' && p.pdu.payload.ospfv3) packetTypes.add(p.pdu.payload.ospfv3.type) })
    devices.forEach(d => d.ospfv3?.neighbors.forEach(n => states.add(n.state)))
    assert.ok(packets.length <= 256)
  }
  useNetworkStore.setState({ devices, inFlightPackets: packets })
  return { devices, links, packets, packetTypes, states }
}

function runPing(sourceId: string, targetIp: string) {
  const pingId = useNetworkStore.getState().sendPing(sourceId, targetIp)
  let sawEchoRequest = false
  let sawEchoReply = false
  let { devices, inFlightPackets, pingResults } = useNetworkStore.getState()
  const { links } = useNetworkStore.getState()
  for (let tick = 0; tick < 300 && inFlightPackets.length; tick++) {
    for (const frame of inFlightPackets) {
      sawEchoRequest ||= frame.pdu.payload.icmpv6Type === 'echo-request'
      sawEchoReply ||= frame.pdu.payload.icmpv6Type === 'echo-reply'
    }
    const step = stepSimulationTick(devices, links, inFlightPackets, [], [], tick + 1)
    devices = step.updatedDevices
    pingResults = completePingResults(pingResults, inFlightPackets, step)
    inFlightPackets = step.newInFlightPackets
  }
  return { pingId, devices, pingResults, remaining: inFlightPackets.length, sawEchoRequest, sawEchoReply }
}

test('OSPFv3 forms link-local adjacencies through the database exchange and learns IPv6 routes for a routed ping', () => {
  const { routers, a } = campus()
  const { devices, packetTypes, states } = run()
  assert.ok(packetTypes.has('hello'))
  assert.ok(packetTypes.has('database-description'))
  assert.ok(packetTypes.has('link-state-request'))
  assert.ok(packetTypes.has('link-state-update'))
  assert.ok(packetTypes.has('link-state-ack'))
  assert.ok(states.has('Init')); assert.ok(states.has('Full'))
  const r1 = devices.find(d => d.id === routers[0].id)!
  const route = (r1.ipv6RoutingTable ?? []).find(r => r.type === 'O' && r.network === '2001:db8:3::1')
  assert.equal(route?.prefixLength, 64)
  assert.equal(route?.nextHop, ipv6LinkLocalFromMac(routers[1].ports[0].macAddress))
  assert.equal(route?.interfaceName, routers[0].ports[1].name)
  assert.equal(route?.metric, 3)
  assert.match(parseIosCommand(r1, 'show ipv6 ospf neighbor').output, /2\.2\.2\.2.*FULL/)
  assert.match(parseIosCommand(r1, 'show ipv6 route').output, /O   2001:DB8:3::\/64 \[110\/3\]/)
  assert.match(parseIosCommand(r1, 'show ip protocols').output, /Routing Protocol is "ospfv3 1"/)
  const ping = runPing(a.id, '2001:db8:3::10')
  assert.equal(ping.remaining, 0)
  assert.equal(ping.pingResults.find(result => result.id === ping.pingId)?.status, 'successful')
  assert.ok(ping.sawEchoRequest && ping.sawEchoReply)
})

test('an OSPFv3 area mismatch cannot form an adjacency and the ping fails cleanly', () => {
  const { cli, routers, a } = campus()
  cli(routers[1].id, 'enable', 'configure terminal', `interface ${routers[1].ports[0].shortName}`, 'ipv6 ospf 1 area 1', 'end')
  cli(routers[1].id, 'configure terminal', `interface ${routers[1].ports[1].shortName}`, 'ipv6 ospf 1 area 1', 'end')
  const { devices } = run()
  const r1 = devices.find(d => d.id === routers[0].id)!
  assert.equal((r1.ipv6RoutingTable ?? []).filter(r => r.type === 'O').length, 0)
  assert.ok(!(r1.ospfv3?.neighbors ?? []).some(n => n.state === 'Full'))
  assert.match(parseIosCommand(r1, 'show ipv6 ospf neighbor').output, /OSPFv3 area mismatch/)
  const ping = runPing(a.id, '2001:db8:3::10')
  assert.equal(ping.pingResults.find(result => result.id === ping.pingId)?.status, 'failed')
})

test('removing the OSPFv3 process withdraws learned routes from the topology after the dead interval', () => {
  const { cli, routers } = campus()
  run(800)
  const before = useNetworkStore.getState().devices.find(d => d.id === routers[2].id)!
  assert.ok((before.ipv6RoutingTable ?? []).some(r => r.type === 'O' && r.network === '2001:db8:1::1'), 'converged first')
  assert.match(parseIosCommand(before, 'show ipv6 ospf neighbor').output, /FULL/)
  cli(routers[0].id, 'enable', 'configure terminal', 'no ipv6 router ospf 1', 'end')
  const { devices } = run(900)
  const r1 = devices.find(d => d.id === routers[0].id)!
  assert.equal((r1.ipv6RoutingTable ?? []).some(r => r.type === 'O'), false)
  assert.equal(r1.ospfv3, undefined)
  const r3 = devices.find(d => d.id === routers[2].id)!
  assert.equal((r3.ipv6RoutingTable ?? []).some(r => r.type === 'O' && r.network === '2001:db8:1::1'), false)
})

test('disabling OSPFv3 on one interface withdraws only that prefix from remote routers', () => {
  const { cli, routers } = campus()
  run(800)
  const converged = useNetworkStore.getState().devices.find(d => d.id === routers[2].id)!
  assert.ok((converged.ipv6RoutingTable ?? []).some(r => r.type === 'O' && r.network === '2001:db8:1::1'), 'r3 learned r1 LAN before the change')
  cli(routers[0].id, 'enable', 'configure terminal', `interface ${routers[0].ports[0].shortName}`, 'no ipv6 ospf 1 area 0', 'end')
  const { devices } = run(300)
  const r3 = devices.find(d => d.id === routers[2].id)!
  const routes = r3.ipv6RoutingTable ?? []
  const prefixOf = (r: { network: string; prefixLength: number }) => ipv6NetworkAddress(r.network, r.prefixLength)
  assert.equal(routes.some(r => r.type === 'O' && prefixOf(r) === '2001:db8:1::'), false, 'the withdrawn LAN prefix is gone')
  assert.ok(routes.some(r => r.type === 'O' && prefixOf(r) === '2001:db8:12::'), 'the still-enabled WAN interface keeps advertising')
  const r1 = devices.find(d => d.id === routers[0].id)!
  assert.match(parseIosCommand(r1, 'show running-config').output, /ipv6 ospf 1 area 0/)
  assert.match(parseIosCommand(r1, 'show ipv6 ospf interface').output, /area 0/)
})
