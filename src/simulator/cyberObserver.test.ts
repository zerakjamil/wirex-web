import assert from 'node:assert/strict'
import test from 'node:test'
import type { NetworkDevice, NetworkLink } from '../types/network'
import { createDevice } from './deviceFactory'
import {
  cyberObserverAddresses,
  cyberObserverDeviceStatus,
  cyberObserverFindings,
  cyberObserverInventory,
  cyberObserverState,
  currentCyberObserverDiscovery,
  discoverCyberObserver,
  hashCyberObserverPassword,
  isCyberObserver,
} from './cyberObserver'
import { hashNetworkControllerPassword } from './networkController'
import { httpResponseBody, isHttpServerDevice, isHttpServiceEnabled } from './httpService'
import { parseWorkspace } from './workspaceSchema'

function controller(): NetworkDevice {
  const device = createDevice('security', 100, 100, 'CyberObserver')
  device.id = 'co'
  device.name = 'CyberObserver0'
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

function withDiscovery(controllerDevice: NetworkDevice, deviceIds: string[]) {
  controllerDevice.config.cyberObserver = {
    ...cyberObserverState(controllerDevice),
    discoveries: [{ id: 'snapshot', name: 'Lab', mode: 'connected', createdAtMs: 1, status: 'complete', deviceIds }],
    lastDiscoveryId: 'snapshot',
  }
}

test('CyberObserver is a fixed two-NIC monitoring appliance with no modules', () => {
  const co = controller()
  assert.equal(isCyberObserver(co), true)
  assert.equal(co.model, 'CyberObserver')
  assert.equal(co.ports.length, 2)
  assert.equal(co.ports[0].name, 'GigabitEthernet0')
  assert.equal(co.ports[1].name, 'GigabitEthernet1')
  assert.equal(co.modules?.length ?? 0, 0)
  assert.ok(co.ports.every(port => port.moduleSlot === undefined))
  assert.equal(co.config.hostname, 'CyberObserver0')
  assert.deepEqual(co.config.vlans, [{ id: 1, name: 'default' }])
  assert.equal(co.config.asaInspection, undefined)
  assert.equal(co.config.asaNatRules, undefined)
  assert.equal(co.routingTable?.length ?? 0, 0)
  assert.deepEqual(cyberObserverState(co), { accounts: [], discoveries: [] })
  assert.equal(isHttpServerDevice(co), true)
  assert.equal(isHttpServiceEnabled(co), true)
  assert.match(httpResponseBody(co), /Cyber Observer/)
})

test('CyberObserver management addresses exclude unconfigured and down interfaces', () => {
  const co = controller()
  co.ports[1].ipAddress = '10.10.10.2'
  co.ports[1].subnetMask = '255.255.255.0'
  co.ports[1].adminStatus = 'down'
  const addresses = cyberObserverAddresses(co)
  assert.equal(addresses.length, 1)
  assert.equal(addresses[0].ip, '192.168.10.2')
  assert.equal(addresses[0].portName, 'GigabitEthernet0')
})

test('connected discovery includes the appliance and addressed managed devices', () => {
  const co = controller()
  const pc = host('192.168.10.10', 'pc')
  const server = host('192.168.10.20', 'server')
  const result = discoverCyberObserver(co, [co, pc, server], [connect(co, 0, pc, 0)], {
    id: 'discovery-1',
    name: 'Lab',
    mode: 'connected',
    atMs: 1000,
  })
  assert.equal(result.ok, true)
  assert.equal(result.discovery.status, 'complete')
  assert.deepEqual(result.deviceIds, ['co', 'pc'])
  assert.equal(result.discovery.id, 'discovery-1')
})

test('discovery omits an unmanaged switch and fragments its downstream topology', () => {
  const co = controller()
  const sw = createDevice('switch', 300, 100)
  sw.id = 'sw'
  sw.name = 'SW1'
  const pc = host('192.168.10.10', 'pc')
  const result = discoverCyberObserver(co, [co, sw, pc], [connect(co, 0, sw, 0), connect(sw, 1, pc, 0)], {
    mode: 'connected',
    atMs: 2000,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.deviceIds, ['co', 'pc'])
})

test('IP range discovery keeps the appliance and filters managed devices by address', () => {
  const co = controller()
  const pc = host('192.168.10.10', 'pc')
  const server = host('192.168.10.40', 'server')
  const links = [connect(co, 0, pc, 0), connect(pc, 0, server, 0)]
  const inside = discoverCyberObserver(co, [co, pc, server], links, {
    mode: 'range', rangeStart: '192.168.10.1', rangeEnd: '192.168.10.20', atMs: 3000,
  })
  assert.equal(inside.ok, true)
  assert.deepEqual(inside.deviceIds, ['co', 'pc'])
  const outside = discoverCyberObserver(co, [co, pc, server], links, {
    mode: 'range', rangeStart: '192.168.10.100', rangeEnd: '192.168.10.200', atMs: 4000,
  })
  assert.equal(outside.ok, true)
  assert.deepEqual(outside.deviceIds, ['co'])
})

test('discovery bounds names and preserves trimmed range input on failure', () => {
  const co = controller()
  const pc = host('192.168.10.10', 'pc')
  const link = connect(co, 0, pc, 0)
  const named = discoverCyberObserver(co, [co, pc], [link], { name: 'x'.repeat(120), mode: 'connected', atMs: 5500 })
  assert.equal(named.discovery.name.length, 80)
  const failed = discoverCyberObserver(co, [co, pc], [link], {
    mode: 'range', rangeStart: ' 192.168.10.200 ', rangeEnd: '192.168.10.1', atMs: 5501,
  })
  assert.equal(failed.ok, false)
  assert.equal(failed.discovery.rangeStart, '192.168.10.200')
  assert.equal(failed.discovery.rangeEnd, '192.168.10.1')
})

test('discovery reports stable failure reasons without mutating the appliance', () => {
  const co = controller()
  const pc = host('192.168.10.10', 'pc')
  const off = discoverCyberObserver({ ...co, power: false }, [co, pc], [], { mode: 'connected', atMs: 5000 })
  assert.equal(off.ok, false)
  assert.equal(off.discovery.reason, 'power-off')
  const noLink = discoverCyberObserver(co, [co, pc], [], { mode: 'connected', atMs: 5001 })
  assert.equal(noLink.ok, false)
  assert.equal(noLink.discovery.reason, 'no-active-link')
  const noIp = discoverCyberObserver({ ...co, ports: co.ports.map(port => ({ ...port, ipAddress: undefined })) }, [co, pc], [], { mode: 'connected', atMs: 5002 })
  assert.equal(noIp.ok, false)
  assert.equal(noIp.discovery.reason, 'no-ip')
  const invalid = discoverCyberObserver(co, [co, pc], [connect(co, 0, pc, 0)], {
    mode: 'range', rangeStart: '192.168.10.200', rangeEnd: '192.168.10.1', atMs: 5003,
  })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.discovery.reason, 'invalid-range')
  assert.deepEqual(cyberObserverState(co).discoveries, [])
})

test('inventory follows the selected discovery snapshot', () => {
  const co = controller()
  const pc = host('192.168.10.10', 'pc')
  co.config.cyberObserver = {
    accounts: [],
    discoveries: [
      { id: 'new', name: 'New', mode: 'connected', createdAtMs: 2, status: 'complete', deviceIds: ['co', 'pc'] },
      { id: 'old', name: 'Old', mode: 'connected', createdAtMs: 1, status: 'complete', deviceIds: ['co'] },
    ],
    lastDiscoveryId: 'new',
  }
  assert.equal(currentCyberObserverDiscovery(co)?.id, 'new')
  assert.deepEqual(cyberObserverInventory(co, [co, pc]).map(device => device.id), ['co', 'pc'])
  co.config.cyberObserver.lastDiscoveryId = 'old'
  assert.deepEqual(cyberObserverInventory(co, [co, pc]).map(device => device.id), ['co'])
})

test('device status reflects power, addressing and active ports', () => {
  const co = controller()
  assert.equal(cyberObserverDeviceStatus(co), 'active')
  co.ports[0].status = 'down'
  assert.equal(cyberObserverDeviceStatus(co), 'idle')
  co.ports[0].ipAddress = undefined
  assert.equal(cyberObserverDeviceStatus(co), 'no-ip')
  co.power = false
  assert.equal(cyberObserverDeviceStatus(co), 'off')
})

test('findings report real configuration exposures without fabricating CVEs', () => {
  const co = controller()
  const ap = createDevice('wireless', 500, 100, 'AccessPoint-PT')
  ap.id = 'ap'
  ap.name = 'AP1'
  ap.config.wirelessSsid = 'Guest'
  ap.config.wirelessAuthentication = 'open'
  const router = createDevice('router', 600, 100, '2911')
  router.id = 'r1'
  router.name = 'R1'
  router.config.snmpCommunities = ['public']
  const isa = createDevice('security', 700, 100, 'ISA-3000')
  isa.id = 'isa'
  isa.name = 'ISA1'
  const nc = createDevice('pc', 800, 100, 'NetworkController')
  nc.id = 'nc'
  nc.name = 'NC1'
  nc.config.networkController = {
    accounts: [{ username: 'admin', passwordHash: hashNetworkControllerPassword('cisco'), role: 'admin' }],
    discoveries: [],
  }
  co.config.cyberObserver = {
    accounts: [{ username: 'admin', passwordHash: hashCyberObserverPassword('cisco'), role: 'admin' }],
    discoveries: [{ id: 'snapshot', name: 'Lab', mode: 'connected', createdAtMs: 1, status: 'complete', deviceIds: ['co', 'ap', 'r1', 'isa', 'nc'] }],
    lastDiscoveryId: 'snapshot',
  }
  const findings = cyberObserverFindings(co, [co, ap, router, isa, nc])
  assert.ok(findings.some(finding => finding.code === 'default-password' && finding.deviceId === 'co'))
  assert.ok(findings.some(finding => finding.code === 'http-management' && finding.deviceId === 'co'))
  assert.ok(findings.some(finding => finding.code === 'open-wireless' && finding.evidence === 'Guest'))
  assert.ok(findings.some(finding => finding.code === 'default-snmp' && finding.evidence === 'public'))
  assert.ok(findings.some(finding => finding.code === 'permit-any-inbound' && finding.deviceId === 'isa'))
  assert.ok(findings.some(finding => finding.code === 'default-password' && finding.deviceId === 'nc'))
  assert.equal(findings.some(finding => /CVE-/i.test(finding.evidence)), false)
})

test('wireless findings distinguish WEP and open WLANs', () => {
  const co = controller()
  const ap = createDevice('wireless', 500, 100, 'AccessPoint-PT')
  ap.id = 'ap'
  ap.config.wirelessSsid = 'Legacy'
  ap.config.wirelessAuthentication = 'wep'
  const wlc = createDevice('wlc', 600, 100, 'WLC-PT')
  wlc.id = 'wlc'
  wlc.config.wlans = [{ id: 1, name: 'Guest', ssid: 'WLC-Guest', enabled: true, vlan: 0, security: 'none' }]
  withDiscovery(co, ['co', 'ap', 'wlc'])
  const findings = cyberObserverFindings(co, [co, ap, wlc])
  assert.ok(findings.some(finding => finding.code === 'wep-wireless' && finding.deviceId === 'ap'))
  assert.ok(findings.some(finding => finding.code === 'open-wireless' && finding.deviceId === 'wlc' && finding.evidence === 'WLC-Guest'))
})

test('findings flag unreachable and addressless snapshot members', () => {
  const co = controller()
  const ap = createDevice('wireless', 500, 100, 'AccessPoint-PT')
  ap.id = 'ap'
  ap.power = false
  const pc = host('192.168.10.10', 'pc')
  pc.ports[0].ipAddress = undefined
  withDiscovery(co, ['co', 'ap', 'pc'])
  const findings = cyberObserverFindings(co, [co, ap, pc])
  assert.ok(findings.some(finding => finding.code === 'unreachable' && finding.deviceId === 'ap'))
  assert.ok(findings.some(finding => finding.code === 'management-address-missing' && finding.deviceId === 'pc'))
})

test('account digest is deterministic and does not contain the password', () => {
  const first = hashCyberObserverPassword('classroom')
  const second = hashCyberObserverPassword('classroom')
  assert.equal(first, second)
  assert.notEqual(first, hashCyberObserverPassword('classroom2'))
  assert.notEqual(first, hashNetworkControllerPassword('classroom'))
  assert.equal(first.includes('classroom'), false)
})

test('CyberObserver accounts and discovery snapshots validate and survive workspace restore', () => {
  const co = controller()
  co.config.cyberObserver = {
    accounts: [{ username: 'analyst', passwordHash: hashCyberObserverPassword('classroom'), role: 'admin' }],
    discoveries: [{ id: 'range-1', name: 'Students', mode: 'range', rangeStart: '192.168.10.1', rangeEnd: '192.168.10.254', createdAtMs: 100, status: 'complete', deviceIds: ['co'] }],
    lastDiscoveryId: 'range-1',
  }
  const restored = parseWorkspace({ version: 1, devices: [co], links: [] })
  assert.deepEqual(restored.devices[0].config.cyberObserver, co.config.cyberObserver)

  const invalidRange = { ...co, config: { ...co.config, cyberObserver: { ...co.config.cyberObserver, discoveries: [{ ...co.config.cyberObserver.discoveries![0], rangeStart: '192.168.10.20', rangeEnd: '192.168.10.1' }] } } }
  assert.throws(() => parseWorkspace({ version: 1, devices: [invalidRange], links: [] }), /Cyber Observer discovery range/)
  const plaintextPassword = { ...co, config: { ...co.config, cyberObserver: { accounts: [{ username: 'analyst', passwordHash: 'classroom', role: 'admin' }] } } }
  assert.throws(() => parseWorkspace({ version: 1, devices: [plaintextPassword], links: [] }), /Cyber Observer account/)
})
