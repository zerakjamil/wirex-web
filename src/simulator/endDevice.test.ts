import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { GENERIC_END_DEVICE_MODELS, hashGuiPassword, isGenericEndDevice, isGenericEndDeviceModel } from './endDevice'

test('generic end device models are distinct from a normal PC', () => {
  for (const model of GENERIC_END_DEVICE_MODELS) {
    assert.equal(isGenericEndDeviceModel(model), true)
    const device = createDevice('pc', 0, 0, model)
    assert.equal(isGenericEndDevice(device), true)
    assert.equal(device.modules?.length, 0)
    assert.equal(device.ports.length, 1)
  }
  assert.equal(isGenericEndDevice(createDevice('pc', 0, 0)), false)
  assert.equal(isGenericEndDevice(createDevice('laptop', 0, 0)), false)
  assert.equal(isGenericEndDeviceModel('Wireless PC'), false)
})

test('GUI password hashes are stable, salted by context, and not the plaintext', () => {
  assert.equal(hashGuiPassword('packet'), hashGuiPassword('packet'))
  assert.notEqual(hashGuiPassword('packet'), hashGuiPassword('Packet'))
  assert.notEqual(hashGuiPassword('packet'), 'packet')
  assert.match(hashGuiPassword('packet'), /^[0-9a-f]{8}$/)
})
