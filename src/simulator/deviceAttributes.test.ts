import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from '@/simulator/deviceFactory'
import { deviceCatalog } from '@/simulator/deviceCatalog'
import { deviceAttributes } from '@/simulator/deviceAttributes'
import type { DeviceType, NetworkDevice } from '@/types/network'

function build(model: string, type: DeviceType = 'router'): NetworkDevice {
  return createDevice(type, 0, 0, model)
}

test('attributes match Packet Tracer values for the common device families', () => {
  assert.deepEqual(deviceAttributes(build('ISR4331')), {
    mtbf: 587250, cost: 3000, powerSource: 0, rackUnits: 1, wattage: 530,
    ptModel: 'ISR4331', ptVersion: '16.6.4',
  })
  const sw = deviceAttributes(build('2960 IOS15', 'switch'))
  assert.equal(sw.ptModel, '2960-24TT')
  assert.equal(sw.ptVersion, '15.0(2)SE')
  assert.deepEqual([sw.mtbf, sw.cost, sw.powerSource, sw.rackUnits, sw.wattage], [300000, 250, 1, 2, 5])
  assert.deepEqual(deviceAttributes(build('PC-PT', 'pc')), {
    mtbf: 43800, cost: 1000, powerSource: 0, rackUnits: 3, wattage: 150,
    ptModel: 'PC-PT', ptVersion: '1.0',
  })
  assert.deepEqual(deviceAttributes(build('Laptop-PT', 'laptop')), {
    mtbf: 26280, cost: 1000, powerSource: 0, rackUnits: 2, wattage: 60,
    ptModel: 'Laptop-PT', ptVersion: '1.0',
  })
  assert.deepEqual(deviceAttributes(build('Server-PT', 'server')), {
    mtbf: 61320, cost: 1000, powerSource: 0, rackUnits: 1, wattage: 10,
    ptModel: 'Server-PT', ptVersion: '1.0',
  })
  assert.deepEqual(deviceAttributes(build('7960', 'phone')), {
    mtbf: 43800, cost: 0, powerSource: 0, rackUnits: 1, wattage: 10,
    ptModel: '7960', ptVersion: '1.0',
  })
})

test('every shelf model resolves to finite, non-negative attributes', () => {
  for (const groups of Object.values(deviceCatalog)) {
    for (const group of groups ?? []) {
      for (const model of group.models) {
        const attributes = deviceAttributes(build(model, group.type))
        for (const key of ['mtbf', 'cost', 'rackUnits', 'wattage'] as const) {
          assert.ok(Number.isFinite(attributes[key]) && attributes[key] >= 0, `${model} has ${key}=${attributes[key]}`)
        }
        assert.ok(attributes.powerSource === 0 || attributes.powerSource === 1, `${model} has powerSource=${attributes.powerSource}`)
        assert.ok(attributes.ptModel.length > 0, `${model} has no PT_MODEL`)
        assert.ok(attributes.ptVersion.length > 0, `${model} has no PT_VERSION`)
      }
    }
  }
})

test('legacy model strings keep the Packet Tracer model and attribute set', () => {
  assert.equal(deviceAttributes(build('4331')).ptModel, 'ISR4331')
  assert.equal(deviceAttributes(build('2960', 'switch')).ptModel, '2960-24TT')
  assert.deepEqual(deviceAttributes(build('Router-PT-Empty')), deviceAttributes(build('Router-PT')))
})
