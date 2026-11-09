import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from './deviceFactory'
import { createCanvasNodes, getTopologyFitNodes, createCanvasDeviceSelector } from '../components/canvas/canvasNodes'

test('device measurements survive simulation updates so nodes remain visible and fit can find them', () => {
  const device = createDevice('pc', 427, 361)
  const dimensions = { [device.id]: { width: 96, height: 112 } }
  const first = createCanvasNodes([device], [], dimensions)
  const updated = createCanvasNodes([{ ...device, power: false }], [], dimensions)
  assert.deepEqual(first[0].measured, dimensions[device.id])
  assert.deepEqual(updated[0].measured, dimensions[device.id])
  assert.deepEqual(updated[0].position, { x: 427, y: 361 })
  assert.equal((updated[0].data.device as typeof device).power, false)
})

test('unchanged devices keep node identity while selection and device changes move it', () => {
  const device = createDevice('pc', 427, 361)
  const dimensions = { [device.id]: { width: 96, height: 112 } }
  const first = createCanvasNodes([device], [], dimensions)
  const again = createCanvasNodes([device], [], dimensions)
  assert.equal(again[0], first[0])
  const selected = createCanvasNodes([device], [], dimensions, new Set([device.id]))
  assert.equal(selected[0].selected, true)
  assert.notEqual(selected[0], first[0])
  const deselected = createCanvasNodes([device], [], dimensions, new Set())
  assert.equal(deselected[0].selected, false)
  assert.deepEqual(deselected[0], first[0])
  const poweredWrapper = { ...device, power: false }
  const powered = createCanvasNodes([poweredWrapper], [], dimensions)
  assert.equal((powered[0].data.device as typeof device).power, false)
  assert.notEqual(powered[0], first[0])
  const poweredAgain = createCanvasNodes([poweredWrapper], [], dimensions)
  assert.equal(poweredAgain[0], powered[0])
})

test('opening a topology focuses its connected devices without moving a distant accessory', () => {
  const pc = createDevice('pc', 427, 361)
  const router = createDevice('router', 787, 160)
  const accessory = createDevice('hub', 3899, 3900)
  const links = [{ fromDeviceId: pc.id, toDeviceId: router.id }]
  assert.deepEqual(getTopologyFitNodes([pc, router, accessory], links), [{ id: pc.id }, { id: router.id }])
  assert.equal(accessory.x, 3899)
  assert.deepEqual(getTopologyFitNodes([accessory], []), [{ id: accessory.id }])
})

test('routing timers stay invisible while movement and operational port changes refresh canvas devices', () => {
  const select = createCanvasDeviceSelector(), d = createDevice('router', 0, 0)
  const before = select([d])
  const ticking = { ...d, ospf: { clock: 60, routerId: '1.1.1.1', neighbors: [], interfaces: [], database: [], lastOrigination: 0 }, routingTable: [{ network: '10.0.0.0', netmask: '255.255.255.0', nextHop: '10.0.1.2', interfaceName: d.ports[0].name, metric: 2, type: 'O' as const }] }
  assert.equal(select([ticking]), before)
  const moved = select([{ ...ticking, x: 200 }])
  assert.notEqual(moved, before)
  assert.equal(moved[0].x, 200)
  const linkUp = select([{ ...ticking, x: 200, ports: ticking.ports.map((port, index) => index === 0 ? { ...port, status: 'up' as const, adminStatus: 'up' as const } : port) }])
  assert.notEqual(linkUp, moved)
})

test('packet and routing telemetry churn does not rebuild canvas nodes', () => {
  const select = createCanvasDeviceSelector(), d = createDevice('router', 0, 0)
  const before = select([d])
  const telemetryOnly = {
    ...d,
    arpTable: [{ ipAddress: '192.0.2.1', macAddress: '00:11:22:33:44:55', interfaceName: 'GigabitEthernet0/0', age: 1 }],
    macTable: [{ macAddress: '00:11:22:33:44:55', vlan: 1, portName: 'GigabitEthernet0/0', portId: d.ports[0].id, age: 1, type: 'dynamic' as const }],
    routingTable: [{ network: '198.51.100.0', netmask: '255.255.255.0', nextHop: '192.0.2.1', interfaceName: 'GigabitEthernet0/0', metric: 1, type: 'O' as const }],
    ports: d.ports.map(port => ({ ...port, ipv6Addresses: [{ address: '2001:db8::1', prefixLength: 64 as const }] })),
    config: { ...d.config, dnsServer: '192.0.2.53' },
  }

  assert.equal(select([telemetryOnly]), before)
  const nodeBefore = createCanvasNodes(before, [], {})[0]
  const nodeAfter = createCanvasNodes(select([telemetryOnly]), [], {})[0]
  assert.equal(nodeAfter, nodeBefore)
})

test('canvas selector skips port scans when unchanged device objects are reused', () => {
  const select = createCanvasDeviceSelector()
  let portReads = 0
  const device = new Proxy(createDevice('pc', 0, 0), {
    get(target, property, receiver) {
      if (property === 'ports') portReads++
      return Reflect.get(target, property, receiver)
    },
  })

  const first = select([device])
  portReads = 0
  const next = select([device])

  assert.equal(next, first)
  assert.equal(portReads, 0, 'unchanged object references should not compare every port')
})

test('canvas device selector refreshes every field rendered on the node', () => {
  const select = createCanvasDeviceSelector(), d = createDevice('router', 0, 0)
  const before = select([d])
  const renamed = { ...d, config: { ...d.config, hostname: 'Core-Router' } }
  const afterRename = select([renamed])
  assert.notEqual(afterRename, before)
  assert.equal(afterRename[0]?.config.hostname, 'Core-Router')

  const withAddress = { ...renamed, ports: renamed.ports.map((port, index) => index === 0 ? { ...port, ipAddress: '192.0.2.1' } : port) }
  const afterAddress = select([withAddress])
  assert.notEqual(afterAddress, afterRename)
  assert.equal(afterAddress[0]?.ports[0]?.ipAddress, '192.0.2.1')
})

test('canvas selection still refreshes switch state used to draw the spanning tree', () => {
  const select = createCanvasDeviceSelector(), d = createDevice('switch', 0, 0)
  const before = select([d])
  const priorityChanged = { ...d, config: { ...d.config, stpPriorities: { '10': 4096 } } }
  const afterPriority = select([priorityChanged])
  assert.notEqual(afterPriority, before)
  const runtimeChanged = { ...priorityChanged, stpRuntime: { vlans: { '10': { rootBridgeId: 'root', rootDeviceId: d.id, rootPathCost: 0, neighbors: [], lastSent: {} } } } }
  assert.notEqual(select([runtimeChanged]), afterPriority)
})
