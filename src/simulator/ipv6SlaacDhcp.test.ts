import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { useNetworkStore } from '../store/networkStore'
import { stepSimulationTick } from './engine'
import { completePingResults } from '../store/pingResults'
import { ipv6InterfaceIdFromMac, ipv6LinkLocalFromMac, ipv6AddressFromPrefixAndInterfaceId } from './protocols/ipv6'

function noShutdown(deviceId: string, portIndexes: number[]) {
  const device = useNetworkStore.getState().devices.find(d => d.id === deviceId)!
  const commands = ['enable', 'configure terminal']
  for (const index of portIndexes) commands.push(`interface ${device.ports[index].shortName.toLowerCase()}`, 'no shutdown', 'exit')
  commands.push('end')
  commands.forEach(command => useNetworkStore.getState().executeIosCommand(deviceId, command))
}

function runCli(deviceId: string, ...commands: string[]) {
  return commands.map(command => useNetworkStore.getState().executeIosCommand(deviceId, command))
}

function drainTicks(maxTicks = 80) {
  let { devices, inFlightPackets } = useNetworkStore.getState()
  const { links } = useNetworkStore.getState()
  const seen = { rs: false, ra: false, nd: false, dhcpv6: false }
  for (let tick = 0; tick < maxTicks && inFlightPackets.length; tick++) {
    for (const frame of inFlightPackets) {
      seen.rs ||= frame.pdu.payload.icmpv6Type === 'router-solicitation'
      seen.ra ||= frame.pdu.payload.icmpv6Type === 'router-advertisement'
      seen.nd ||= frame.pdu.payload.icmpv6Type === 'neighbor-solicitation' || frame.pdu.payload.icmpv6Type === 'neighbor-advertisement'
      seen.dhcpv6 ||= Boolean(frame.pdu.payload.dhcpv6Type)
    }
    const step = stepSimulationTick(devices, links, inFlightPackets, [], [], tick + 1)
    devices = step.updatedDevices
    inFlightPackets = step.newInFlightPackets
  }
  useNetworkStore.setState({ devices, inFlightPackets })
  return seen
}

function runPing(sourceId: string, targetIp: string) {
  const pingId = useNetworkStore.getState().sendPing(sourceId, targetIp)
  let { devices, inFlightPackets, pingResults } = useNetworkStore.getState()
  const { links } = useNetworkStore.getState()
  for (let tick = 0; tick < 300 && inFlightPackets.length; tick++) {
    const step = stepSimulationTick(devices, links, inFlightPackets, [], [], tick + 1)
    devices = step.updatedDevices
    pingResults = completePingResults(pingResults, inFlightPackets, step)
    inFlightPackets = step.newInFlightPackets
  }
  useNetworkStore.setState({ devices, inFlightPackets, pingResults })
  return { pingId, pingResults }
}

function deviceById(id: string) {
  return useNetworkStore.getState().devices.find(d => d.id === id)!
}

test('SLAAC: a host forms an EUI-64 address and default gateway from a router advertisement', () => {
  const router = createDevice('router', 0, 0, '2811')
  const pc = createDevice('pc', 200, 0)
  useNetworkStore.getState().loadLab([router, pc], [])
  const state = useNetworkStore.getState()
  state.connectPorts(pc.id, pc.ports[0].id, router.id, router.ports[0].id, 'straight')
  noShutdown(router.id, [0])
  runCli(router.id, 'enable', 'configure terminal', `interface ${router.ports[0].shortName.toLowerCase()}`, 'ipv6 address 2001:db8:1::1/64', 'end')
  runCli(pc.id, 'enable', 'configure terminal', `interface ${pc.ports[0].shortName.toLowerCase()}`, 'ipv6 address autoconfig', 'end')

  const seen = drainTicks()
  assert.ok(seen.rs, 'a router solicitation was generated for the autoconfig interface')
  assert.ok(seen.ra, 'the router answered with a router advertisement')

  const pcAfter = deviceById(pc.id)
  const interfaceId = ipv6InterfaceIdFromMac(pc.ports[0].macAddress)!
  const expectedAddress = ipv6AddressFromPrefixAndInterfaceId('2001:db8:1::1', interfaceId)!
  const formed = (pcAfter.ports[0].ipv6Addresses ?? []).find(address => address.address === expectedAddress)
  assert.ok(formed, `expected SLAAC address ${expectedAddress} on the host`)
  assert.equal(formed.prefixLength, 64)
  assert.equal(formed.source, 'slaac')
  assert.equal(pcAfter.config.ipv6DefaultGateway, ipv6LinkLocalFromMac(router.ports[0].macAddress))

  const { pingResults } = runPing(pc.id, '2001:db8:1::1')
  assert.equal(pingResults.at(-1)?.status, 'successful', 'the SLAAC host can ping the router global address')

  const running = useNetworkStore.getState().executeIosCommand(pc.id, 'show running-config')
  assert.match(running, /ipv6 address autoconfig/)
  assert.ok(!running.toUpperCase().includes(expectedAddress.toUpperCase()), 'running-config must not print the SLAAC address')

  // Removing autoconfig also strips the SLAAC address and the flag.
  runCli(pc.id, 'configure terminal', `interface ${pc.ports[0].shortName.toLowerCase()}`, 'no ipv6 address autoconfig', 'end')
  const cleaned = deviceById(pc.id)
  assert.equal(cleaned.ports[0].ipv6Autoconfig, false)
  assert.ok(!(cleaned.ports[0].ipv6Addresses ?? []).some(address => address.source === 'slaac'))
})

test('DHCPv6: a client leases from a router pool and the server records the binding', () => {
  const router = createDevice('router', 0, 0, '2811')
  const pc = createDevice('pc', 200, 0)
  useNetworkStore.getState().loadLab([router, pc], [])
  const state = useNetworkStore.getState()
  state.connectPorts(pc.id, pc.ports[0].id, router.id, router.ports[0].id, 'straight')
  noShutdown(router.id, [0])
  runCli(router.id,
    'enable', 'configure terminal',
    'ipv6 unicast-routing',
    'ipv6 dhcp pool POOL1',
    'address prefix 2001:db8:2::/64',
    'exit',
    `interface ${router.ports[0].shortName.toLowerCase()}`,
    'ipv6 address 2001:db8:2::1/64',
    'ipv6 dhcp server POOL1',
    'end',
  )
  runCli(pc.id, 'enable', 'configure terminal', `interface ${pc.ports[0].shortName.toLowerCase()}`, 'ipv6 address dhcp', 'end')

  const seen = drainTicks()
  assert.ok(seen.dhcpv6, 'a DHCPv6 solicit was generated for the dhcp interface')
  assert.ok(seen.ra, 'the router advertisement also reached the DHCPv6 client')

  const pcAfter = deviceById(pc.id)
  const lease = (pcAfter.ports[0].ipv6Addresses ?? []).find(address => address.source === 'dhcpv6')
  assert.ok(lease, 'the client received a DHCPv6 address')
  assert.equal(lease.address, '2001:db8:2::100')
  assert.equal(pcAfter.config.ipv6DefaultGateway, ipv6LinkLocalFromMac(router.ports[0].macAddress))
  assert.equal(pcAfter.config.dhcpv6Lease?.address, '2001:db8:2::100')

  const bindingOutput = useNetworkStore.getState().executeIosCommand(router.id, 'show ipv6 dhcp binding')
  assert.match(bindingOutput, /2001:DB8:2::100/)
  assert.match(bindingOutput, new RegExp(pc.ports[0].macAddress.toUpperCase()))
  const poolOutput = useNetworkStore.getState().executeIosCommand(router.id, 'show ipv6 dhcp pool')
  assert.match(poolOutput, /DHCPv6 pool: POOL1/)
  assert.match(poolOutput, /2001:DB8:2::\/64/)
  assert.match(poolOutput, /Active clients: 1/)

  const { pingResults } = runPing(pc.id, '2001:db8:2::1')
  assert.equal(pingResults.at(-1)?.status, 'successful', 'the DHCPv6 client can ping the router')

  const running = useNetworkStore.getState().executeIosCommand(router.id, 'show running-config')
  assert.match(running, /ipv6 dhcp pool POOL1/)
  assert.match(running, / address prefix 2001:db8:2::\/64/)
  assert.match(running, / ipv6 dhcp server POOL1/)

  // Releasing the client removes the leased address and the flag.
  runCli(pc.id, 'configure terminal', `interface ${pc.ports[0].shortName.toLowerCase()}`, 'no ipv6 address dhcp', 'end')
  const released = deviceById(pc.id)
  assert.equal(released.ports[0].ipv6Dhcp, false)
  assert.ok(!(released.ports[0].ipv6Addresses ?? []).some(address => address.source === 'dhcpv6'))
})

test('DHCPv6 without any server leaves the client unconfigured and fails the ping cleanly', () => {
  const sw = createDevice('switch', 200, 0)
  const pc = createDevice('pc', 200, 200)
  sw.config.portfastDefault = true
  useNetworkStore.getState().loadLab([sw, pc], [])
  const state = useNetworkStore.getState()
  state.connectPorts(pc.id, pc.ports[0].id, sw.id, sw.ports[0].id, 'straight')
  runCli(pc.id, 'enable', 'configure terminal', `interface ${pc.ports[0].shortName.toLowerCase()}`, 'ipv6 address dhcp', 'end')

  const seen = drainTicks()
  assert.ok(seen.dhcpv6, 'the solicit was placed on the wire even with no server present')
  const pcAfter = deviceById(pc.id)
  assert.ok(!(pcAfter.ports[0].ipv6Addresses ?? []).length, 'no address is configured without a server')
  assert.equal(pcAfter.config.dhcpv6Lease, undefined)

  const pingId = useNetworkStore.getState().sendPing(pc.id, '2001:db8:ffff::1')
  assert.equal(pingId, null)
  assert.match(useNetworkStore.getState().simulationWarning ?? '', /Could not send ping/)
})

test('router advertisement without prefixes supplies only the default gateway', () => {
  const router = createDevice('router', 0, 0, '2811')
  const pc = createDevice('pc', 200, 0)
  useNetworkStore.getState().loadLab([router, pc], [])
  const state = useNetworkStore.getState()
  state.connectPorts(pc.id, pc.ports[0].id, router.id, router.ports[0].id, 'straight')
  noShutdown(router.id, [0])
  runCli(pc.id, 'enable', 'configure terminal', `interface ${pc.ports[0].shortName.toLowerCase()}`, 'ipv6 address autoconfig', 'end')

  const seen = drainTicks()
  assert.ok(seen.ra, 'the unaddressed router still answers the solicitation')
  const pcAfter = deviceById(pc.id)
  assert.equal(pcAfter.config.ipv6DefaultGateway, ipv6LinkLocalFromMac(router.ports[0].macAddress))
  assert.ok(!(pcAfter.ports[0].ipv6Addresses ?? []).length, 'no prefixes are advertised, so no address is formed')
})

test('host IPv6 mode selection (Desktop IP app action) drives SLAAC and can be reverted', () => {
  const router = createDevice('router', 0, 0, '2811')
  const pc = createDevice('pc', 200, 0)
  useNetworkStore.getState().loadLab([router, pc], [])
  const state = useNetworkStore.getState()
  state.connectPorts(pc.id, pc.ports[0].id, router.id, router.ports[0].id, 'straight')
  noShutdown(router.id, [0])
  runCli(router.id, 'enable', 'configure terminal', `interface ${router.ports[0].shortName.toLowerCase()}`, 'ipv6 address 2001:db8:5::1/64', 'end')

  useNetworkStore.getState().setIpv6HostMode(pc.id, pc.ports[0].id, 'auto')
  assert.equal(deviceById(pc.id).ports[0].ipv6Autoconfig, true)
  const seen = drainTicks()
  assert.ok(seen.rs && seen.ra)
  const interfaceId = ipv6InterfaceIdFromMac(pc.ports[0].macAddress)!
  const expectedAddress = ipv6AddressFromPrefixAndInterfaceId('2001:db8:5::1', interfaceId)!
  assert.ok((deviceById(pc.id).ports[0].ipv6Addresses ?? []).some(address => address.address === expectedAddress && address.source === 'slaac'))

  useNetworkStore.getState().setIpv6HostMode(pc.id, pc.ports[0].id, 'static')
  const reverted = deviceById(pc.id)
  assert.equal(reverted.ports[0].ipv6Autoconfig, false)
  assert.ok(!(reverted.ports[0].ipv6Addresses ?? []).some(address => address.source === 'slaac'))
})
