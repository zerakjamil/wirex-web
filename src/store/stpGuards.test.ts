import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from '../simulator/deviceFactory'
import { useNetworkStore } from './networkStore'

test('clearing Root Guard or recovering an admin-down port clears guard runtime state', () => {
  const device = createDevice('switch', 0, 0)
  device.id = 'stp-guard-store'
  const port = device.ports[0]
  port.adminStatus = 'down'
  port.errDisabled = 'bpduguard'
  port.rootGuard = true
  port.rootInconsistentVlans = { '10': 4 }
  useNetworkStore.setState({ devices: [device], links: [], inFlightPackets: [], selectedDeviceId: null, selectedLinkId: null, connectingSource: null, simulationTick: 0, simulationMode: 'realtime', simulationPlaying: false })

  useNetworkStore.getState().updatePortConfig(device.id, port.id, { rootGuard: undefined })
  let updated = useNetworkStore.getState().devices[0].ports[0]
  assert.equal(updated.rootGuard, undefined)
  assert.equal(updated.rootInconsistentVlans, undefined)
  assert.equal(updated.errDisabled, 'bpduguard')
  assert.equal(updated.adminStatus, 'down')

  useNetworkStore.getState().updatePortConfig(device.id, port.id, { adminStatus: 'up' })
  updated = useNetworkStore.getState().devices[0].ports[0]
  assert.equal(updated.adminStatus, 'up')
  assert.equal(updated.errDisabled, undefined)
  assert.equal(updated.rootInconsistentVlans, undefined)
})
