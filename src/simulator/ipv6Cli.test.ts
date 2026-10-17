import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { useNetworkStore } from '../store/networkStore'
import { stepSimulationTick } from './engine'
import { completePingResults } from '../store/pingResults'
import { parseIpv6, ipv6InterfaceIdFromMac } from './protocols/ipv6'

function cli(id: string, commands: string[]) {
  return commands.map((command) => useNetworkStore.getState().executeIosCommand(id, command))
}

function runPing(id: string, target: string) {
  useNetworkStore.getState().executeIosCommand(id, 'enable')
  useNetworkStore.getState().executeIosCommand(id, `ping ${target}`)
  let { devices, inFlightPackets, pingResults } = useNetworkStore.getState()
  const { links } = useNetworkStore.getState()
  for (let tick = 0; tick < 120 && inFlightPackets.length; tick++) {
    const step = stepSimulationTick(devices, links, inFlightPackets, [], [], tick + 1)
    devices = step.updatedDevices
    pingResults = completePingResults(pingResults, inFlightPackets, step)
    inFlightPackets = step.newInFlightPackets
  }
  return { result: pingResults[pingResults.length - 1], devices }
}

function hostLab() {
  const a = createDevice('pc', 200, 0)
  const b = createDevice('pc', 200, 300)
  const router = createDevice('router', 0, 0, '2811')
  useNetworkStore.getState().loadLab([router, a, b], [])
  const state = useNetworkStore.getState()
  state.connectPorts(a.id, a.ports[0].id, router.id, router.ports[0].id, 'straight')
  state.connectPorts(b.id, b.ports[0].id, router.id, router.ports[1].id, 'straight')
  return { router, a, b }
}

test('CLI ipv6 address configuration produces a successful ping across the router', () => {
  const { router, a, b } = hostLab()
  cli(router.id, ['enable', 'configure terminal', 'ipv6 unicast-routing', 'interface fa0/0', 'no shutdown', 'ipv6 address 2001:db8:1::1/64', 'exit', 'interface fa0/1', 'no shutdown', 'ipv6 address 2001:db8:2::1/64', 'end'])
  const savedRouter = useNetworkStore.getState().devices.find((d) => d.id === router.id)!
  assert.deepEqual(savedRouter.ports[0].ipv6Addresses, [{ address: '2001:db8:1::1', prefixLength: 64 }])
  assert.equal(savedRouter.config.ipv6Routing, true)
  cli(a.id, ['enable', 'configure terminal', `interface ${a.ports[0].shortName}`, 'ipv6 address 2001:db8:1::2/64', 'end'])
  cli(b.id, ['enable', 'configure terminal', `interface ${b.ports[0].shortName}`, 'ipv6 address 2001:db8:2::2/64', 'end'])
  useNetworkStore.getState().updateDeviceConfig(a.id, { ipv6DefaultGateway: '2001:db8:1::1' })
  useNetworkStore.getState().updateDeviceConfig(b.id, { ipv6DefaultGateway: '2001:db8:2::1' })
  const { result } = runPing(a.id, '2001:db8:2::2')
  assert.equal(result.status, 'successful', result.reason)
})

test('CLI ipv6 route statics appear in show ipv6 route and forward across two routers', () => {
  const r1 = createDevice('router', 0, 0, '2811')
  const r2 = createDevice('router', 300, 0, '2811')
  const a = createDevice('pc', 0, 200)
  const b = createDevice('pc', 300, 200)
  useNetworkStore.getState().loadLab([r1, r2, a, b], [])
  const state = useNetworkStore.getState()
  state.connectPorts(a.id, a.ports[0].id, r1.id, r1.ports[0].id, 'straight')
  state.connectPorts(b.id, b.ports[0].id, r2.id, r2.ports[1].id, 'straight')
  state.connectPorts(r1.id, r1.ports[1].id, r2.id, r2.ports[0].id, 'straight')
  cli(r1.id, ['enable', 'configure terminal', 'ipv6 unicast-routing', 'interface fa0/0', 'no shutdown', 'ipv6 address 2001:db8:1::1/64', 'exit', 'interface fa0/1', 'no shutdown', 'ipv6 address 2001:db8:12::1/64', 'exit', 'ipv6 route 2001:db8:2::/64 2001:db8:12::2', 'end'])
  cli(r2.id, ['enable', 'configure terminal', 'ipv6 unicast-routing', 'interface fa0/0', 'no shutdown', 'ipv6 address 2001:db8:12::2/64', 'exit', 'interface fa0/1', 'no shutdown', 'ipv6 address 2001:db8:2::1/64', 'exit', 'ipv6 route 2001:db8:1::/64 2001:db8:12::1', 'end'])
  cli(a.id, ['enable', 'configure terminal', `interface ${a.ports[0].shortName}`, 'ipv6 address 2001:db8:1::2/64', 'end'])
  cli(b.id, ['enable', 'configure terminal', `interface ${b.ports[0].shortName}`, 'ipv6 address 2001:db8:2::2/64', 'end'])
  useNetworkStore.getState().updateDeviceConfig(a.id, { ipv6DefaultGateway: '2001:db8:1::1' })
  useNetworkStore.getState().updateDeviceConfig(b.id, { ipv6DefaultGateway: '2001:db8:2::1' })
  const show = useNetworkStore.getState().executeIosCommand(r1.id, 'show ipv6 route')
  assert.match(show, /S\s+2001:DB8:2::\/64 \[1\/0\]/)
  assert.match(show, /via 2001:DB8:12::2/)
  assert.match(show, /C\s+2001:DB8:1::\/64 \[0\/0\]/)
  const running = useNetworkStore.getState().executeIosCommand(r1.id, 'show running-config')
  assert.match(running, /ipv6 unicast-routing/)
  assert.match(running, /ipv6 route 2001:db8:2::\/64 2001:db8:12::2/)
  const withdrawn = cli(r1.id, ['configure terminal', 'no ipv6 route 2001:db8:2::/64 2001:db8:12::2'])
  assert.equal(withdrawn[withdrawn.length - 1], '')
  assert.equal(useNetworkStore.getState().devices.find((d) => d.id === r1.id)!.ipv6RoutingTable?.filter((r) => r.type === 'S').length ?? 0, 0)
  cli(r1.id, ['ipv6 route 2001:db8:2::/64 2001:db8:12::2', 'end'])
  const { result } = runPing(a.id, '2001:db8:2::2')
  assert.equal(result.status, 'successful', result.reason)
})

test('eui-64 addressing derives the interface ID from the MAC and invalid forms are rejected', () => {
  const { router } = hostLab()
  const portName = router.ports[0].shortName
  const applied = cli(router.id, ['enable', 'configure terminal', `interface ${portName}`, 'no shutdown', 'ipv6 address 2001:db8:1::/64 eui-64'])
  assert.equal(applied[applied.length - 1], '')
  const port = useNetworkStore.getState().devices.find((d) => d.id === router.id)!.ports[0]
  const interfaceId = ipv6InterfaceIdFromMac(port.macAddress)
  assert.ok(interfaceId)
  const expected = parseIpv6('2001:db8:1::')! | parseIpv6(`::${interfaceId}`)!
  assert.equal(parseIpv6(port.ipv6Addresses![0].address), expected)
  assert.equal(port.ipv6Addresses![0].prefixLength, 64)
  assert.match(cli(router.id, ['ipv6 address 2001:db8:1::1'])[0], /Invalid IPv6 address/)
  assert.match(cli(router.id, ['ipv6 address ff02::1/64'])[0], /Multicast/)
  assert.match(cli(router.id, ['ipv6 address 2001:db8:1::/48 eui-64'])[0], /\/64 prefix/)
  assert.match(cli(router.id, ['ipv6 address fe80::1 link-local'])[0], /derives its link-local address/)
  assert.equal(cli(router.id, ['no ipv6 address'])[0], '')
  assert.equal(useNetworkStore.getState().devices.find((d) => d.id === router.id)!.ports[0].ipv6Addresses, undefined)
})

test('show ipv6 interface brief lists global and link-local addresses and neighbors are learnable', () => {
  const { router, a } = hostLab()
  const host = a.ports[0]
  cli(router.id, ['enable', 'configure terminal', 'interface fa0/0', 'no shutdown', 'ipv6 address 2001:db8:1::1/64', 'end'])
  cli(a.id, ['enable', 'configure terminal', `interface ${host.shortName}`, 'ipv6 address 2001:db8:1::2/64', 'end'])
  const brief = useNetworkStore.getState().executeIosCommand(router.id, 'show ipv6 interface brief')
  assert.match(brief, /Fa0\/0\s+\[up\/up\]/)
  assert.match(brief, /2001:DB8:1::1/)
  assert.match(brief, /FE80::[0-9A-F:]+/)
  const detail = useNetworkStore.getState().executeIosCommand(router.id, 'show ipv6 interface fa0/0')
  assert.match(detail, /IPv6 is enabled, link-local address is FE80::/)
  assert.match(detail, /2001:DB8:1::1, subnet is 2001:DB8:1::\/64/)
  const { result, devices } = runPing(a.id, '2001:db8:1::1')
  assert.equal(result.status, 'successful', result.reason)
  useNetworkStore.setState({ devices })
  const neighbors = useNetworkStore.getState().executeIosCommand(router.id, 'show ipv6 neighbors')
  assert.match(neighbors, /2001:DB8:1::2/)
  const savedNeighbors = useNetworkStore.getState().devices.find((d) => d.id === router.id)!.ipv6NeighborTable ?? []
  assert.ok(savedNeighbors.some((entry) => entry.address === '2001:db8:1::2'))
})
