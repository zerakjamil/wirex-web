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

test('routing timers and learned tables do not rebuild visible canvas devices', () => {
  const select = createCanvasDeviceSelector(), d = createDevice('router', 0, 0)
  const before = select([d])
  const ticking = { ...d, ospf: { clock: 60, routerId: '1.1.1.1', neighbors: [], interfaces: [], database: [], lastOrigination: 0 }, routingTable: [{ network: '10.0.0.0', netmask: '255.255.255.0', nextHop: '10.0.1.2', interfaceName: d.ports[0].name, metric: 2, type: 'O' as const }] }
  assert.equal(select([ticking]), before)
  const moved = select([{ ...ticking, x: 200 }])
  assert.notEqual(moved, before)
  assert.equal(moved[0].x, 200)
  const shutdown = select([{ ...ticking, x: 200, ports: ticking.ports.map(p => ({ ...p, status: 'down' as const })) }])
  assert.notEqual(shutdown, moved)
})
