import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import {
  ALGORITHM_DEFAULTS,
  algorithmSettings,
  configGroups,
  equivalentIosCommands,
  findPage,
  isRoutingCapable,
  supportsVlanDatabase,
} from './configPages'
import type { NetworkDevice } from '../types/network'

function router(model = '2911'): NetworkDevice {
  return createDevice('router', 0, 0, model)
}

function switchDevice(model = '2960-24TT'): NetworkDevice {
  return createDevice('switch', 0, 0, model)
}

function groups(device: NetworkDevice): Record<string, string[]> {
  return Object.fromEntries(configGroups(device).map((group) => [group.id, group.pages.map((page) => page.name)]))
}

test('router config tree matches the Packet Tracer four-level layout', () => {
  const device = router()
  const tree = groups(device)
  assert.deepEqual(tree.GLOBAL, ['Settings', 'Algorithm Settings'])
  assert.deepEqual(tree.ROUTING, ['Static', 'RIP'])
  assert.equal(tree.SWITCHING, undefined, 'a 2911 has no SWITCHING level in Packet Tracer')
  assert.ok(tree.INTERFACE.length > 0)
  assert.equal(tree.INTERFACE[0], device.ports[0].name)
})

test('1841 and 2811 routers expose the SWITCHING / VLAN Database level', () => {
  assert.equal(supportsVlanDatabase(router('1841')), true)
  assert.equal(supportsVlanDatabase(router('2811')), true)
  assert.deepEqual(groups(router('1841')).SWITCHING, ['VLAN Database'])
})

test('switches get SWITCHING but no ROUTING unless they are multilayer', () => {
  const access = switchDevice('2960-24TT')
  assert.equal(isRoutingCapable(access), false)
  const tree = groups(access)
  assert.deepEqual(tree.SWITCHING, ['VLAN Database'])
  assert.equal(tree.ROUTING, undefined)
  assert.deepEqual(tree.GLOBAL, ['Settings', 'Algorithm Settings'])

  const multilayer = switchDevice('3560-24PS')
  assert.equal(isRoutingCapable(multilayer), true)
  assert.deepEqual(groups(multilayer).ROUTING, ['Static', 'RIP'])
})

test('end devices keep Settings and their interfaces but no routing or algorithm pages', () => {
  const pc = createDevice('pc', 0, 0)
  const tree = groups(pc)
  assert.deepEqual(tree.GLOBAL, ['Settings'])
  assert.ok(tree.INTERFACE.length === pc.ports.length && pc.ports.length > 0)
  assert.equal(tree.ROUTING, undefined)
  assert.equal(tree.SWITCHING, undefined)
})

test('findPage resolves interface pages by id', () => {
  const device = router()
  const port = device.ports[1]
  const page = findPage(device, `interface:${port.id}`)
  assert.equal(page?.name, port.name)
  assert.equal(findPage(device, 'interface:missing'), undefined)
})

test('algorithm settings fall back to the Packet Tracer defaults', () => {
  const device = router()
  assert.deepEqual(algorithmSettings(device), ALGORITHM_DEFAULTS)
  device.config.algorithmSettings = { ...ALGORITHM_DEFAULTS, maximumConnections: 250 }
  assert.equal(algorithmSettings(device).maximumConnections, 250)
  assert.equal(algorithmSettings(device).maximumOpenedSessions, 1000)
})

test('settings page emits the hostname command with mode prompts', () => {
  const device = router()
  device.config.hostname = 'R1'
  const commands = equivalentIosCommands(device, 'settings')
  assert.match(commands, /^R1>enable$/m)
  assert.match(commands, /^R1#configure terminal$/m)
  assert.match(commands, /^R1\(config\)#hostname R1$/m)
})

test('static routes page lists ip route commands for type S entries only', () => {
  const device = router()
  device.config.hostname = 'R1'
  device.routingTable.push(
    { network: '10.0.0.0', netmask: '255.255.255.0', nextHop: '192.168.1.2', interfaceName: 'GigabitEthernet0/0', metric: 0, type: 'S' },
    { network: '192.168.1.0', netmask: '255.255.255.0', nextHop: '0.0.0.0', interfaceName: 'GigabitEthernet0/0', metric: 0, type: 'C' },
  )
  const commands = equivalentIosCommands(device, 'static-routes')
  assert.match(commands, /ip route 10\.0\.0\.0 255\.255\.255\.0 192\.168\.1\.2/)
  assert.doesNotMatch(commands, /192\.168\.1\.0 255\.255\.255\.0 0\.0\.0\.0/)
  device.routingTable = []
  assert.match(equivalentIosCommands(device, 'static-routes'), /ip route <network> <netmask> <next-hop>/)
})

test('RIP page reflects version, auto-summary and networks', () => {
  const device = router()
  device.config.hostname = 'R1'
  device.config.ripNetworks = ['10.0.0.0', '192.168.5.0']
  device.config.ripVersion = 2
  const commands = equivalentIosCommands(device, 'rip')
  assert.match(commands, /router rip/)
  assert.match(commands, /version 2/)
  assert.match(commands, /no auto-summary/)
  assert.match(commands, /network 10\.0\.0\.0/)
  assert.match(commands, /network 192\.168\.5\.0/)
  device.config.ripAutoSummary = true
  assert.doesNotMatch(equivalentIosCommands(device, 'rip'), /no auto-summary/)
})

test('VLAN Database page lists VLANs except the default VLAN 1', () => {
  const device = switchDevice()
  device.config.hostname = 'SW1'
  device.config.vlans = [
    { id: 1, name: 'default' },
    { id: 10, name: 'faculty' },
  ]
  const commands = equivalentIosCommands(device, 'vlan-database')
  assert.match(commands, /vlan 10/)
  assert.match(commands, /name faculty/)
  assert.doesNotMatch(commands, /vlan 1\b/)
})

test('interface page shows address, state and switchport commands', () => {
  const device = switchDevice()
  device.config.hostname = 'SW1'
  const port = device.ports[0]
  port.vlan = 20
  port.adminStatus = 'down'
  const commands = equivalentIosCommands(device, `interface:${port.id}`)
  assert.match(commands, new RegExp(`interface ${port.name}`))
  assert.match(commands, /switchport mode access/)
  assert.match(commands, /switchport access vlan 20/)
  assert.match(commands, /^SW1\(config\)#shutdown$/m)

  const routerDevice = router()
  const routedPort = routerDevice.ports[0]
  routedPort.ipAddress = '192.168.1.1'
  routedPort.subnetMask = '255.255.255.0'
  routedPort.adminStatus = 'up'
  const routedCommands = equivalentIosCommands(routerDevice, `interface:${routedPort.id}`)
  assert.match(routedCommands, /ip address 192\.168\.1\.1 255\.255\.255\.0/)
  assert.match(routedCommands, /no shutdown/)
})

test('algorithm settings page has no Cisco IOS equivalent', () => {
  const device = router()
  assert.equal(equivalentIosCommands(device, 'algorithm-settings'), '')
})
