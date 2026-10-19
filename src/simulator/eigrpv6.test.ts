import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { stepSimulationTick } from './engine'
import { useNetworkStore } from '../store/networkStore'
import { parseIosCommand } from './ios/ciscoParser'
import { completePingResults } from '../store/pingResults'
import type { NetworkDevice } from '../types/network'
import { ipv6LinkLocalFromMac, ipv6NetworkAddress } from './protocols/ipv6'

interface Lab { routers: NetworkDevice[]; pcs: NetworkDevice[]; cli: (id: string, ...lines: string[]) => string[] }

function lab(asNumbers: [number, number] = [1, 1], options: { passivePcInterface?: boolean } = {}): Lab {
  const routers = [0, 1].map(i => {
    const device = createDevice('router', i * 400, 100, '2911')
    device.id = `e6r${i + 1}`; device.name = device.id; device.config.hostname = device.id
    return device
  })
  const [a, b] = [createDevice('pc', 0, 300), createDevice('pc', 800, 300)]
  a.id = 'e6a'; b.id = 'e6b'
  useNetworkStore.getState().loadLab([...routers, a, b], [])
  const connect = (device: NetworkDevice, p: number, peer: NetworkDevice, q: number) => {
    assert.equal(useNetworkStore.getState().connectPorts(device.id, device.ports[p].id, peer.id, peer.ports[q].id, 'crossover'), true)
  }
  for (const router of routers) for (const port of router.ports.slice(0, 3)) port.adminStatus = 'up'
  useNetworkStore.setState({ devices: [...routers, a, b] })
  connect(routers[0], 0, a, 0)
  connect(routers[0], 1, routers[1], 0)
  connect(routers[1], 1, b, 0)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  const addresses = [
    ['2001:db8:1::1/64', '2001:db8:12::1/64'],
    ['2001:db8:12::2/64', '2001:db8:2::1/64'],
  ]
  for (let i = 0; i < 2; i++) {
    const router = routers[i]
    cli(router.id, 'enable', 'configure terminal', 'ipv6 unicast-routing', `ipv6 router eigrp ${asNumbers[i]}`, `eigrp router-id ${i + 1}.${i + 1}.${i + 1}.${i + 1}`, 'no shutdown', 'end')
    for (const j of [1, 0]) cli(router.id, 'configure terminal', `interface ${router.ports[j].shortName}`, `ipv6 address ${addresses[i][j]}`, 'no shutdown', `ipv6 eigrp ${asNumbers[i]}`, 'end')
  }
  if (options.passivePcInterface) cli(routers[0].id, 'configure terminal', 'ipv6 router eigrp 1', `passive-interface ${routers[0].ports[0].shortName}`, 'end')
  useNetworkStore.setState(state => ({
    devices: state.devices.map(device => [a.id, b.id].includes(device.id) ? {
      ...device,
      config: { ...device.config, ipv6DefaultGateway: device.id === a.id ? '2001:db8:1::1' : '2001:db8:2::1' },
      ports: device.ports.map((port, index) => index ? port : { ...port, ipv6Addresses: [{ address: device.id === a.id ? '2001:db8:1::10' : '2001:db8:2::10', prefixLength: 64 }] }),
    } : device),
  }))
  return { routers, pcs: [a, b], cli }
}

function run(ticks = 900) {
  const { links } = useNetworkStore.getState()
  let { devices, inFlightPackets } = useNetworkStore.getState()
  let transmittedTypes = 0
  for (let i = 0; i < ticks; i++) {
    const step = stepSimulationTick(devices, links, inFlightPackets)
    devices = step.updatedDevices
    inFlightPackets = step.newInFlightPackets
    transmittedTypes += inFlightPackets.filter(packet => packet.pdu.payload.eigrpV6).length ? 1 : 0
    assert.ok(inFlightPackets.length <= 256)
  }
  useNetworkStore.setState({ devices, inFlightPackets })
  return { devices, packets: inFlightPackets, transmittedTypes }
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

function routeTo(device: NetworkDevice, prefix: string) {
  return (device.ipv6RoutingTable ?? []).find(route => route.type === 'D' && ipv6NetworkAddress(route.network, route.prefixLength) === prefix)
}

test('EIGRPv6 forms link-local adjacencies, installs D routes and carries a routed ping', () => {
  const { routers, pcs } = lab()
  const { devices } = run()
  const [r1, r2] = devices.filter(device => routers.some(router => router.id === device.id))
  const peerLinkLocal = ipv6LinkLocalFromMac(routers[1].ports[0].macAddress)!
  assert.deepEqual(r1.ipv6Eigrp?.neighbors.map(neighbor => neighbor.address), [peerLinkLocal])
  assert.ok(r1.ipv6Eigrp?.neighbors.every(neighbor => neighbor.address.startsWith('fe80::')))
  assert.equal(routeTo(r1, '2001:db8:2::')?.nextHop, peerLinkLocal)
  assert.equal(routeTo(r2, '2001:db8:1::')?.nextHop, ipv6LinkLocalFromMac(routers[0].ports[1].macAddress)!)
  assert.match(parseIosCommand(r1, 'show ipv6 eigrp neighbors').output, /EIGRP-IPv6 Neighbors for AS\(1\)/)
  assert.match(parseIosCommand(r1, 'show ipv6 eigrp neighbors').output, new RegExp(peerLinkLocal))
  const topology = parseIosCommand(r1, 'show ipv6 eigrp topology').output
  assert.match(topology, /EIGRP-IPv6 Topology Table for AS\(1\)\/ID\(1\.1\.1\.1\)/)
  assert.match(topology, /P 2001:DB8:2::\/64, 1 successors, FD is \d+/)
  assert.match(topology, /via FE80::[0-9A-F:]+ \(\d+\/\d+\), GigabitEthernet0\/1/)
  assert.match(parseIosCommand(r1, 'show ipv6 eigrp interfaces').output, /GigabitEthernet0\/0\s+0/)
  assert.match(parseIosCommand(r1, 'show ipv6 route').output, /D   2001:DB8:2::\/64 \[90\/\d+\]/)
  assert.match(parseIosCommand(r1, 'show running-config').output, /ipv6 router eigrp 1\n eigrp router-id 1\.1\.1\.1/)
  assert.match(parseIosCommand(r1, 'show running-config').output, /ipv6 eigrp 1/)
  const ping = runPing(pcs[0].id, '2001:db8:2::10')
  assert.equal(ping.sawEchoRequest, true)
  assert.equal(ping.sawEchoReply, true)
  assert.equal(ping.remaining, 0)
  assert.equal(ping.pingResults.at(-1)?.status, 'successful')
})

test('a passive interface keeps its prefixes advertised without forming an adjacency', () => {
  const { routers } = lab([1, 1], { passivePcInterface: true })
  const { devices } = run()
  const r1 = devices.find(device => device.id === routers[0].id)!
  const r2 = devices.find(device => device.id === routers[1].id)!
  const interfaces = parseIosCommand(r1, 'show ipv6 eigrp interfaces').output
  assert.match(interfaces, /GigabitEthernet0\/0\s+0/)
  assert.match(interfaces, /GigabitEthernet0\/1\s+1/)
  assert.equal(r1.ipv6Eigrp?.neighbors.length, 1)
  assert.equal(routeTo(r2, '2001:db8:1::')?.nextHop, ipv6LinkLocalFromMac(routers[0].ports[1].macAddress)!)
})

test('an EIGRPv6 autonomous-system mismatch blocks the adjacency and the route', () => {
  const { routers } = lab([1, 2])
  const { devices } = run()
  const r1 = devices.find(device => device.id === routers[0].id)!
  assert.equal(r1.ipv6Eigrp?.neighbors.length, 0)
  assert.equal(routeTo(r1, '2001:db8:2::'), undefined)
  assert.doesNotMatch(parseIosCommand(r1, 'show ipv6 eigrp neighbors').output, /FE80::/)
})

test('shutdown stops the EIGRPv6 process and no shutdown restores the routes', () => {
  const { routers, cli } = lab()
  run()
  cli(routers[0].id, 'configure terminal', 'ipv6 router eigrp 1', 'shutdown', 'end')
  const stopped = run(400).devices.find(device => device.id === routers[0].id)!
  assert.equal(stopped.ipv6Eigrp, undefined)
  assert.equal(routeTo(stopped, '2001:db8:2::'), undefined)
  assert.equal(stopped.ipv6RoutingTable?.some(route => route.type === 'D') ?? false, false)
  cli(routers[0].id, 'configure terminal', 'ipv6 router eigrp 1', 'no shutdown', 'end')
  const resumed = run(900).devices.find(device => device.id === routers[0].id)!
  assert.ok(routeTo(resumed, '2001:db8:2::'))
})

test('no ipv6 router eigrp flushes the adjacency and D routes', () => {
  const { routers, cli } = lab()
  run()
  const output = cli(routers[0].id, 'configure terminal', 'no ipv6 router eigrp 1', 'end').at(-1)
  assert.equal(output ?? '', '')
  const flushed = useNetworkStore.getState().devices.find(device => device.id === routers[0].id)!
  assert.equal(flushed.config.ipv6EigrpAs, undefined)
  assert.equal(flushed.ipv6Eigrp, undefined)
  assert.equal(flushed.ipv6RoutingTable?.some(route => route.type === 'D') ?? false, false)
})
