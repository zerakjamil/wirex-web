import assert from 'node:assert/strict'
import test from 'node:test'
import type { NetworkDevice, NetworkLink } from '../types/network'
import { createDevice } from './deviceFactory'
import {
  currentNetworkControllerDiscovery,
  discoverNetworkController,
  hashNetworkControllerPassword,
  isHttpServerDevice,
  isHttpServiceEnabled,
  isNetworkController,
  networkControllerAddresses,
  networkControllerDeviceStatus,
  networkControllerInventory,
  networkControllerState,
} from './networkController'

function controller(): NetworkDevice {
  const device = createDevice('pc', 100, 100, 'NetworkController')
  device.id = 'nc'
  device.name = 'NetworkController0'
  device.ports[0].ipAddress = '192.168.10.2'
  device.ports[0].subnetMask = '255.255.255.0'
  device.ports[0].adminStatus = 'up'
  device.ports[0].status = 'up'
  return device
}

function host(ip: string, id = 'pc'): NetworkDevice {
  const device = createDevice('pc', 500, 100)
  device.id = id
  device.name = id.toUpperCase()
  device.ports[0].ipAddress = ip
  device.ports[0].subnetMask = '255.255.255.0'
  device.ports[0].adminStatus = 'up'
  device.ports[0].status = 'up'
  return device
}

function connect(from: NetworkDevice, fromPortIndex: number, to: NetworkDevice, toPortIndex: number): NetworkLink {
  const link: NetworkLink = {
    id: `${from.id}-${to.id}`,
    type: 'straight',
    fromDeviceId: from.id,
    fromPortId: from.ports[fromPortIndex].id,
    toDeviceId: to.id,
    toPortId: to.ports[toPortIndex].id,
    status: 'up',
  }
  from.ports[fromPortIndex].adminStatus = 'up'
  from.ports[fromPortIndex].status = 'up'
  to.ports[toPortIndex].adminStatus = 'up'
  to.ports[toPortIndex].status = 'up'
  return link
}

test('NetworkController is a fixed two-NIC end device with no module slots', () => {
  const nc = controller()
  assert.equal(isNetworkController(nc), true)
  assert.equal(nc.ports.length, 2)
  assert.equal(nc.ports[0].name, 'GigabitEthernet0')
  assert.equal(nc.ports[1].name, 'GigabitEthernet1')
  assert.equal(nc.modules?.length ?? 0, 0)
  assert.ok(nc.ports.every(port => port.moduleSlot === undefined))
  assert.deepEqual(networkControllerState(nc), { accounts: [], discoveries: [] })
  assert.equal(isHttpServerDevice(nc), true)
  assert.equal(isHttpServiceEnabled(nc), true)
})

test('NetworkController management addresses exclude unconfigured and down interfaces', () => {
  const nc = controller()
  nc.ports[1].ipAddress = '10.10.10.2'
  nc.ports[1].subnetMask = '255.255.255.0'
  nc.ports[1].adminStatus = 'down'
  const addresses = networkControllerAddresses(nc)
  assert.equal(addresses.length, 1)
  assert.equal(addresses[0].ip, '192.168.10.2')
  assert.equal(addresses[0].portName, 'GigabitEthernet0')
})

test('connected discovery walks active links and omits unreachable devices', () => {
  const nc = controller()
  const pc = host('192.168.10.10', 'pc')
  const server = host('192.168.10.20', 'server')
  const link = connect(nc, 0, pc, 0)
  const result = discoverNetworkController(nc, [nc, pc, server], [link], {
    id: 'discovery-1',
    name: 'Lab',
    mode: 'cdp',
    atMs: 1000,
  })
  assert.equal(result.ok, true)
  assert.equal(result.discovery.status, 'complete')
  assert.deepEqual(result.deviceIds, ['pc'])
  assert.equal(result.discovery.id, 'discovery-1')
})

test('connected discovery traverses an intermediate switch without a management address', () => {
  const nc = controller()
  const sw = createDevice('switch', 300, 100)
  sw.id = 'sw'
  sw.name = 'SW1'
  const pc = host('192.168.10.10', 'pc')
  const links = [connect(nc, 0, sw, 0), connect(sw, 1, pc, 0)]
  const result = discoverNetworkController(nc, [nc, sw, pc], links, { mode: 'cdp', atMs: 2000 })
  assert.equal(result.ok, true)
  assert.deepEqual(result.deviceIds, ['pc'])
})

test('switch VLAN management interfaces are preferred and discovered', () => {
  const nc = controller()
  const sw = createDevice('switch', 300, 100)
  sw.id = 'sw'
  sw.name = 'SW1'
  sw.ports[0].ipAddress = '192.168.10.254'
  sw.ports[0].subnetMask = '255.255.255.0'
  const svi = {
    ...sw.ports[0],
    id: 'sw-vlan1',
    name: 'Vlan1',
    shortName: 'Vl1',
    virtualVlan: 1,
    vlan: 1,
    ipAddress: '192.168.10.1',
    subnetMask: '255.255.255.0',
  }
  sw.ports.push(svi)
  const link = connect(nc, 0, sw, 0)
  assert.equal(networkControllerAddresses(sw)[0].portName, 'Vlan1')
  const result = discoverNetworkController(nc, [nc, sw], [link], { mode: 'cdp', atMs: 2500 })
  assert.equal(result.ok, true)
  assert.deepEqual(result.deviceIds, ['sw'])
})

test('IP range discovery only returns reachable addresses in range', () => {
  const nc = controller()
  const pc = host('192.168.10.10', 'pc')
  const server = host('192.168.10.40', 'server')
  const links = [connect(nc, 0, pc, 0), connect(pc, 0, server, 0)]
  const inside = discoverNetworkController(nc, [nc, pc, server], links, {
    mode: 'ip-range', rangeStart: '192.168.10.1', rangeEnd: '192.168.10.20', atMs: 3000,
  })
  assert.equal(inside.ok, true)
  assert.deepEqual(inside.deviceIds, ['pc'])
  const outside = discoverNetworkController(nc, [nc, pc, server], links, {
    mode: 'ip-range', rangeStart: '192.168.10.100', rangeEnd: '192.168.10.200', atMs: 4000,
  })
  assert.equal(outside.ok, true)
  assert.deepEqual(outside.deviceIds, [])
})

test('discovery reports stable failure reasons without mutating the controller', () => {
  const nc = controller()
  const pc = host('192.168.10.10', 'pc')
  const off = discoverNetworkController({ ...nc, power: false }, [nc, pc], [], { mode: 'cdp', atMs: 5000 })
  assert.equal(off.ok, false)
  assert.equal(off.discovery.reason, 'power-off')
  const noLink = discoverNetworkController(nc, [nc, pc], [], { mode: 'cdp', atMs: 5001 })
  assert.equal(noLink.ok, false)
  assert.equal(noLink.discovery.reason, 'no-active-link')
  const noIp = discoverNetworkController({ ...nc, ports: nc.ports.map(port => ({ ...port, ipAddress: undefined })) }, [nc, pc], [], { mode: 'cdp', atMs: 5002 })
  assert.equal(noIp.ok, false)
  assert.equal(noIp.discovery.reason, 'no-ip')
  const invalid = discoverNetworkController(nc, [nc, pc], [connect(nc, 0, pc, 0)], {
    mode: 'ip-range', rangeStart: '192.168.10.200', rangeEnd: '192.168.10.1', atMs: 5003,
  })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.discovery.reason, 'invalid-range')
  assert.deepEqual(networkControllerState(nc).discoveries, [])
})

test('inventory follows the selected discovery snapshot', () => {
  const nc = controller()
  const pc = host('192.168.10.10', 'pc')
  nc.config.networkController = {
    accounts: [],
    discoveries: [
      { id: 'new', name: 'New', mode: 'cdp', createdAtMs: 2, status: 'complete', deviceIds: ['pc'] },
      { id: 'old', name: 'Old', mode: 'cdp', createdAtMs: 1, status: 'complete', deviceIds: [] },
    ],
    lastDiscoveryId: 'new',
  }
  assert.equal(currentNetworkControllerDiscovery(nc)?.id, 'new')
  assert.deepEqual(networkControllerInventory(nc, [nc, pc]).map(device => device.id), ['pc'])
  nc.config.networkController.lastDiscoveryId = 'old'
  assert.deepEqual(networkControllerInventory(nc, [nc, pc]), [])
})

test('device status reflects power, addressing and active ports', () => {
  const nc = controller()
  assert.equal(networkControllerDeviceStatus(nc), 'active')
  nc.ports[0].status = 'down'
  assert.equal(networkControllerDeviceStatus(nc), 'idle')
  nc.ports[0].ipAddress = undefined
  assert.equal(networkControllerDeviceStatus(nc), 'no-ip')
  nc.power = false
  assert.equal(networkControllerDeviceStatus(nc), 'off')
})

test('account digest is deterministic and does not contain the password', () => {
  const first = hashNetworkControllerPassword('classroom')
  const second = hashNetworkControllerPassword('classroom')
  assert.equal(first, second)
  assert.notEqual(first, hashNetworkControllerPassword('classroom2'))
  assert.equal(first.includes('classroom'), false)
})
