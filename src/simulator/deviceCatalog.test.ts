import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from '@/simulator/deviceFactory'
import { deviceCatalog } from '@/simulator/deviceCatalog'
import { IOT_THINGS } from '@/simulator/iot'
import type { NetworkDevice } from '@/types/network'

function build(model: string, type: Parameters<typeof createDevice>[0] = 'router'): NetworkDevice {
  return createDevice(type, 0, 0, model)
}

test('the device shelf has unique model names across every category', () => {
  const seen = new Map<string, string>()
  for (const [category, groups] of Object.entries(deviceCatalog)) {
    for (const group of groups ?? []) {
      for (const model of group.models) {
        const previous = seen.get(model)
        assert.equal(previous, undefined, `${model} appears in ${previous} and ${category}`)
        seen.set(model, category)
      }
    }
  }
  assert.ok(seen.size >= 70, `shelf only lists ${seen.size} models`)
})

test('every shelf model is created under its own name and has a usable interface set', () => {
  const empty = new Set(['Router-PT-Empty', 'Switch-PT-Empty', 'Cloud-PT-Empty'])
  for (const groups of Object.values(deviceCatalog)) {
    for (const group of groups ?? []) {
      for (const model of group.models) {
        const device = createDevice(group.type, 0, 0, model)
        assert.equal(device.model, model, `${model} was substituted`)
        assert.equal(device.type, group.type, `${model} changed device type`)
        if (empty.has(model)) {
          assert.equal(device.ports.length, 0, `${model} should start empty`)
        } else {
          assert.ok(device.ports.length > 0, `${model} has no interfaces`)
        }
        assert.equal(new Set(device.ports.map(port => port.id)).size, device.ports.length, `${model} has duplicate port ids`)
      }
    }
  }
})

test('industrial and small-form routers keep their physical interface counts', () => {
  assert.equal(build('819HG-4G-IOX').ports.length, 5)
  assert.equal(build('CGR1240').ports.length, 5)
  assert.equal(build('IR1101').ports.length, 4)
  assert.equal(build('IR8340').ports.length, 6)
  assert.equal(build('PT8200').ports.length, 4)
  assert.equal(build('IR8340').ports.filter(port => port.type === 'serial').length, 2)
  assert.equal(build('IR1101').ports.filter(port => port.type === 'wireless').length, 1)
})

test('industrial, bridge and compact switches expose the right port counts', () => {
  assert.equal(build('IE-2000', 'switch').ports.length, 10)
  assert.equal(build('IE-3400', 'switch').ports.length, 10)
  assert.equal(build('IE-9320', 'switch').ports.length, 28)
  assert.equal(build('Bridge-PT', 'switch').ports.length, 2)
  assert.equal(build('2960 IOS15', 'switch').ports.length, 26)
  assert.equal(build('Repeater-PT', 'hub').ports.length, 2)
})

test('wireless shelf carries the PT models with their radio roles', () => {
  assert.equal(build('HomeRouter-PT-AC', 'wireless').ports.length, 6)
  assert.equal(build('Linksys-WRT300N', 'wireless').ports.length, 6)
  const lightweight = build('3702i', 'wireless')
  assert.equal(lightweight.config.apMode, 'lightweight')
  assert.equal(lightweight.ports.length, 2)
  assert.equal(build('WLC-2504', 'wlc').ports.length, 2)
  assert.equal(build('WLC-3504', 'wlc').ports.length, 2)
})

test('end devices use PT names without changing their behavior', () => {
  assert.equal(build('7960', 'phone').ports.length, 2)
  assert.equal(build('TabletPC-PT', 'tablet').ports[0].type, 'wireless')
  assert.equal(build('SMARTPHONE-PT', 'smartphone').ports.length, 2)
  assert.equal(build('DSL-Modem-PT', 'modem').ports[0].type, 'phone')
  assert.equal(build('Cable-Modem-PT', 'modem').ports[0].type, 'coaxial')
})

test('the IoT shelf only advertises things the simulator can drive', () => {
  const iot = deviceCatalog.iot?.flatMap(group => group.models) ?? []
  assert.equal(iot.length, IOT_THINGS.length)
  for (const model of iot) {
    assert.ok(IOT_THINGS.some(spec => spec.model === model), `${model} has no IoT spec`)
  }
})
