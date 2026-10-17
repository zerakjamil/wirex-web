import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { useNetworkStore } from '../store/networkStore'
import { createPingPackets, stepSimulationTick } from './engine'
import { completePingResults } from '../store/pingResults'

function setIpv6(deviceId: string, portIndex: number, address: string, prefixLength: number, gateway?: string) {
  useNetworkStore.setState(state => ({
    devices: state.devices.map(device => device.id === deviceId ? {
      ...device,
      config: gateway === undefined ? device.config : { ...device.config, ipv6DefaultGateway: gateway },
      ports: device.ports.map((port, index) => index === portIndex ? { ...port, ipv6Addresses: [{ address, prefixLength }] } : port),
    } : device),
  }))
}

function noShutdown(deviceId: string, portIndexes: number[]) {
  const device = useNetworkStore.getState().devices.find(d => d.id === deviceId)!
  const commands = ['enable', 'configure terminal']
  for (const index of portIndexes) commands.push(`interface ${device.ports[index].shortName.toLowerCase()}`, 'no shutdown', 'exit')
  commands.push('end')
  commands.forEach(command => useNetworkStore.getState().executeIosCommand(deviceId, command))
}

function runPing(sourceId: string, targetIp: string) {
  const pingId = useNetworkStore.getState().sendPing(sourceId, targetIp)
  let sawNeighborDiscovery = false
  let sawEchoRequest = false
  let sawEchoReply = false
  let { devices, inFlightPackets, pingResults } = useNetworkStore.getState()
  const { links } = useNetworkStore.getState()
  for (let tick = 0; tick < 300 && inFlightPackets.length; tick++) {
    for (const frame of inFlightPackets) {
      sawNeighborDiscovery ||= frame.pdu.payload.icmpv6Type === 'neighbor-solicitation' || frame.pdu.payload.icmpv6Type === 'neighbor-advertisement'
      sawEchoRequest ||= frame.pdu.payload.icmpv6Type === 'echo-request'
      sawEchoReply ||= frame.pdu.payload.icmpv6Type === 'echo-reply'
    }
    const step = stepSimulationTick(devices, links, inFlightPackets, [], [], tick + 1)
    devices = step.updatedDevices
    pingResults = completePingResults(pingResults, inFlightPackets, step)
    inFlightPackets = step.newInFlightPackets
  }
  return { pingId, devices, pingResults, remaining: inFlightPackets.length, sawNeighborDiscovery, sawEchoRequest, sawEchoReply }
}

function sameSubnetLab() {
  const sw = createDevice('switch', 200, 0)
  const a = createDevice('pc', 200, 200)
  const b = createDevice('pc', 400, 200)
  sw.config.portfastDefault = true
  useNetworkStore.getState().loadLab([sw, a, b], [])
  const state = useNetworkStore.getState()
  state.connectPorts(a.id, a.ports[0].id, sw.id, sw.ports[0].id, 'straight')
  state.connectPorts(b.id, b.ports[0].id, sw.id, sw.ports[1].id, 'straight')
  setIpv6(a.id, 0, '2001:db8:1::2', 64)
  setIpv6(b.id, 0, '2001:db8:1::3', 64)
  return { sw, a, b }
}

function routedLab() {
  const router = createDevice('router', 0, 0, '2811')
  const a = createDevice('pc', 200, 0)
  const b = createDevice('pc', 200, 300)
  useNetworkStore.getState().loadLab([router, a, b], [])
  const state = useNetworkStore.getState()
  state.connectPorts(a.id, a.ports[0].id, router.id, router.ports[0].id, 'straight')
  state.connectPorts(b.id, b.ports[0].id, router.id, router.ports[1].id, 'straight')
  noShutdown(router.id, [0, 1])
  setIpv6(router.id, 0, '2001:db8:1::1', 64)
  setIpv6(router.id, 1, '2001:db8:2::1', 64)
  setIpv6(a.id, 0, '2001:db8:1::2', 64, '2001:db8:1::1')
  setIpv6(b.id, 0, '2001:db8:2::2', 64, '2001:db8:2::1')
  return { router, a, b }
}

function staticRouteLab() {
  const r1 = createDevice('router', 0, 0, '2811')
  const r2 = createDevice('router', 300, 0, '2811')
  const a = createDevice('pc', 150, 200)
  const b = createDevice('pc', 300, 200)
  useNetworkStore.getState().loadLab([r1, r2, a, b], [])
  const state = useNetworkStore.getState()
  state.connectPorts(a.id, a.ports[0].id, r1.id, r1.ports[0].id, 'straight')
  state.connectPorts(r1.id, r1.ports[1].id, r2.id, r2.ports[0].id, 'straight')
  state.connectPorts(r2.id, r2.ports[1].id, b.id, b.ports[0].id, 'straight')
  noShutdown(r1.id, [0, 1])
  noShutdown(r2.id, [0, 1])
  setIpv6(r1.id, 0, '2001:db8:1::1', 64)
  setIpv6(r1.id, 1, '2001:db8:12::1', 64)
  setIpv6(r2.id, 0, '2001:db8:12::2', 64)
  setIpv6(r2.id, 1, '2001:db8:2::1', 64)
  setIpv6(a.id, 0, '2001:db8:1::2', 64, '2001:db8:1::1')
  setIpv6(b.id, 0, '2001:db8:2::2', 64, '2001:db8:2::1')
  useNetworkStore.setState(current => ({
    devices: current.devices.map(device => device.id === r1.id
      ? { ...device, ipv6RoutingTable: [{ network: '2001:db8:2::', prefixLength: 64, nextHop: '2001:db8:12::2', interfaceName: device.ports[1].name, metric: 0, type: 'S' as const }] }
      : device.id === r2.id
        ? { ...device, ipv6RoutingTable: [{ network: '2001:db8:1::', prefixLength: 64, nextHop: '2001:db8:12::1', interfaceName: device.ports[0].name, metric: 0, type: 'S' as const }] }
        : device),
  }))
  return { r1, r2, a, b }
}

test('IPv6 ping between hosts on one segment resolves the neighbor with NDP before sending echo requests', () => {
  const { a, b } = sameSubnetLab()
  const { devices, links } = useNetworkStore.getState()
  const initial = createPingPackets(devices.find(d => d.id === a.id)!, devices, links, '2001:db8:1::3')
  assert.equal(initial.length, 1)
  assert.equal(initial[0].pdu.protocol, 'ICMPv6')
  assert.equal(initial[0].pdu.payload.icmpv6Type, 'neighbor-solicitation')
  assert.equal(initial[0].pdu.payload.ndpTargetAddress, '2001:db8:1::3')
  assert.equal(initial[0].pdu.sourceIp, '2001:db8:1::2')
  assert.equal(initial[0].pdu.destIp, 'ff02::1:ff00:3')
  assert.equal(initial[0].pdu.destMac, '33:33:ff:00:00:03')
  assert.equal(initial[0].pdu.pendingPacket?.payload.icmpv6Type, 'echo-request')

  const run = runPing(a.id, '2001:db8:1::3')
  assert.ok(run.pingId)
  assert.ok(run.sawNeighborDiscovery, 'expected neighbor solicitation/advertisement frames')
  assert.ok(run.sawEchoRequest)
  assert.ok(run.sawEchoReply)
  assert.equal(run.remaining, 0)
  assert.equal(run.pingResults.find(result => result.id === run.pingId)?.status, 'successful')
  const finalA = run.devices.find(d => d.id === a.id)!
  const finalB = run.devices.find(d => d.id === b.id)!
  assert.ok(finalA.ipv6NeighborTable?.some(entry => entry.address === '2001:db8:1::3'), 'host should learn the target neighbor entry')
  assert.ok(finalB.ipv6NeighborTable?.some(entry => entry.address === '2001:db8:1::2'), 'target should learn the source neighbor entry')
})

test('IPv6 ping across a router follows the default gateway in both directions', () => {
  const { router, a, b } = routedLab()
  const run = runPing(a.id, '2001:db8:2::2')
  assert.ok(run.pingId)
  assert.ok(run.sawNeighborDiscovery)
  assert.ok(run.sawEchoRequest)
  assert.ok(run.sawEchoReply)
  assert.equal(run.remaining, 0)
  assert.equal(run.pingResults.find(result => result.id === run.pingId)?.status, 'successful')
  const finalRouter = run.devices.find(d => d.id === router.id)!
  assert.ok(finalRouter.ipv6NeighborTable?.some(entry => entry.address === '2001:db8:1::2'))
  const finalB = run.devices.find(d => d.id === b.id)!
  assert.ok(finalB.ipv6NeighborTable?.some(entry => entry.address === '2001:db8:2::1'))
})

test('IPv6 static routes forward across two routers using neighbor resolution for the next hop', () => {
  const { a } = staticRouteLab()
  const run = runPing(a.id, '2001:db8:2::2')
  assert.ok(run.pingId)
  assert.ok(run.sawNeighborDiscovery)
  assert.ok(run.sawEchoRequest)
  assert.ok(run.sawEchoReply)
  assert.equal(run.remaining, 0)
  assert.equal(run.pingResults.find(result => result.id === run.pingId)?.status, 'successful')
})

test('IPv6 ping without a route or gateway is rejected before any frame is built', () => {
  const { a } = sameSubnetLab()
  const { devices, links } = useNetworkStore.getState()
  assert.deepEqual(createPingPackets(devices.find(d => d.id === a.id)!, devices, links, '2001:db8:99::1'), [])
  assert.equal(useNetworkStore.getState().sendPing(a.id, '2001:db8:99::1'), null)
  assert.match(useNetworkStore.getState().simulationWarning ?? '', /Could not send ping/)
})

test('IPv6 ping to an unused address never fabricates an echo and fails once the solicitation drains', () => {
  const { a } = sameSubnetLab()
  const run = runPing(a.id, '2001:db8:1::99')
  assert.ok(run.pingId)
  assert.ok(run.sawNeighborDiscovery)
  assert.equal(run.sawEchoRequest, false)
  assert.equal(run.sawEchoReply, false)
  assert.equal(run.remaining, 0)
  assert.equal(run.pingResults.find(result => result.id === run.pingId)?.status, 'failed')
})
