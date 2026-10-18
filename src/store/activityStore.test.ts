import test from 'node:test'
import assert from 'node:assert/strict'
import { useNetworkStore } from './networkStore'
import { useWorkspaceStore } from './workspaceStore'
import { useTrainingStore } from './trainingStore'
import { ACTIVITY_STORAGE_KEY, restoreActivityFromStorage, saveActivityToStorage, useActivityStore } from './activityStore'
import { STORAGE_KEY, saveWorkspaceToStorage } from './workspacePersistence'
import { collectAssessmentCandidates, deriveInitialNetwork, serializeActivity, type AssessmentActivity } from '@/simulator/activity'
import { createDevice } from '@/simulator/deviceFactory'

function setupAnswer() {
  if (useActivityStore.getState().session) useActivityStore.getState().exit()
  if (useTrainingStore.getState().active) useTrainingStore.getState().exit()
  useNetworkStore.getState().resetTopology()
  const router = createDevice('router', 200, 200)
  router.name = 'R1'
  router.ports[0].ipAddress = '10.0.0.1'
  router.ports[0].subnetMask = '255.255.255.0'
  router.ports[0].adminStatus = 'up'
  useNetworkStore.getState().loadLab([router], [], [])
  useWorkspaceStore.setState({ fileName: 'original.pkt' })
  const devices = useNetworkStore.getState().devices
  const activity: AssessmentActivity = {
    version: 1,
    name: 'Store Lab',
    author: 'Instructor',
    instructions: ['Address the interface'],
    createdAt: '2026-01-01T00:00:00.000Z',
    items: collectAssessmentCandidates(devices),
    answer: { devices: structuredClone(devices), links: [], annotations: [] },
  }
  return { activity, backupDevices: structuredClone(devices) }
}

function memoryStorage() {
  const map = new Map<string, string>()
  return { map, storage: { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } } }
}

test('a trial clears assessed items, grades live state, and exit restores the workspace', () => {
  const { activity, backupDevices } = setupAnswer()
  assert.ok(activity.items.length >= 2)
  useActivityStore.getState().start(activity)
  assert.equal(useActivityStore.getState().session!.activity.name, 'Store Lab')
  assert.deepEqual(useNetworkStore.getState().devices, deriveInitialNetwork(activity).devices)
  assert.equal(useWorkspaceStore.getState().fileName, '')

  useActivityStore.getState().check()
  const failed = useActivityStore.getState().session!.checks!
  assert.equal(failed.length, activity.items.length)
  assert.equal(failed.every(check => check.status === 'failed'), true)

  const deviceId = useNetworkStore.getState().devices[0].id
  useNetworkStore.setState(state => ({
    devices: state.devices.map(device => device.id === deviceId
      ? { ...device, ports: device.ports.map((port, index) => index === 0 ? { ...port, ipAddress: '10.0.0.1', subnetMask: '255.255.255.0' } : port) }
      : device),
  }))
  useActivityStore.getState().check()
  assert.equal(useActivityStore.getState().session!.checks!.filter(check => check.status === 'successful').length, 1)

  useActivityStore.getState().reset()
  assert.equal(useActivityStore.getState().session!.checks, null)
  assert.deepEqual(useNetworkStore.getState().devices, deriveInitialNetwork(activity).devices)

  useActivityStore.getState().exit()
  assert.equal(useActivityStore.getState().session, null)
  assert.deepEqual(useNetworkStore.getState().devices, backupDevices)
  assert.equal(useWorkspaceStore.getState().fileName, 'original.pkt')
})

test('activity files load from text and surface errors without touching the workspace', () => {
  const { activity, backupDevices } = setupAnswer()
  assert.equal(useActivityStore.getState().loadFromFile(serializeActivity(activity)), true)
  assert.equal(useActivityStore.getState().session!.activity.name, 'Store Lab')
  assert.equal(useActivityStore.getState().error, null)
  useActivityStore.getState().exit()
  assert.deepEqual(useNetworkStore.getState().devices, backupDevices)

  assert.equal(useActivityStore.getState().loadFromFile('{ not json'), false)
  assert.match(useActivityStore.getState().error ?? '', /valid wireX activity file/)
  assert.equal(useActivityStore.getState().session, null)
  assert.deepEqual(useNetworkStore.getState().devices, backupDevices)

  useActivityStore.getState().dismissError()
  assert.equal(useActivityStore.getState().error, null)

  assert.equal(useActivityStore.getState().loadFromFile(JSON.stringify({ ...activity, version: 2 })), false)
  assert.equal(useActivityStore.getState().error, 'This activity file version is not supported.')
  useActivityStore.getState().dismissError()
})

test('results export and activity storage round-trip', () => {
  const { activity } = setupAnswer()
  useActivityStore.getState().start(activity)
  assert.equal(useActivityStore.getState().resultsJson(), null)
  useActivityStore.getState().check()
  const results = JSON.parse(useActivityStore.getState().resultsJson()!)
  assert.equal(results.format, 'wirex-activity')
  assert.equal(results.activity.name, 'Store Lab')
  assert.equal(results.score.total, activity.items.length)
  assert.equal(results.items.length, activity.items.length)

  const { map, storage } = memoryStorage()
  assert.equal(saveActivityToStorage(storage), true)
  assert.ok((map.get(ACTIVITY_STORAGE_KEY) ?? '').includes('Store Lab'))
  useActivityStore.getState().exit()
  assert.equal(useActivityStore.getState().session, null)
  assert.equal(restoreActivityFromStorage(storage), true)
  const restored = useActivityStore.getState().session!
  assert.equal(restored.activity.name, 'Store Lab')
  assert.equal(restored.checks!.length, activity.items.length)
  assert.deepEqual(useNetworkStore.getState().devices, deriveInitialNetwork(activity).devices)

  useActivityStore.getState().exit()
  assert.equal(saveActivityToStorage(storage), true)
  assert.equal(restoreActivityFromStorage(storage), false)
  assert.equal(useActivityStore.getState().session, null)
})

test('workspace autosave during an activity stores the pre-activity network', () => {
  const { activity } = setupAnswer()
  useActivityStore.getState().start(activity)
  assert.equal(useNetworkStore.getState().devices[0].ports[0].ipAddress, undefined)

  const { map, storage } = memoryStorage()
  assert.equal(saveWorkspaceToStorage(storage), true)
  const saved = JSON.parse(map.get(STORAGE_KEY)!)
  assert.equal(saved.fileName, 'original.pkt')
  assert.equal(saved.devices[0].ports[0].ipAddress, '10.0.0.1')
  assert.equal(saved.physical, undefined)
  useActivityStore.getState().exit()
})

test('starting a training lesson exits an active activity and restores it on exit', () => {
  const { activity, backupDevices } = setupAnswer()
  useActivityStore.getState().start(activity)
  assert.ok(useActivityStore.getState().session)
  useTrainingStore.getState().start('vlans', 'guided')
  assert.equal(useActivityStore.getState().session, null)
  assert.ok(useNetworkStore.getState().devices.some(device => device.id === 'campus-sw-a'))
  useTrainingStore.getState().exit()
  assert.deepEqual(useNetworkStore.getState().devices, backupDevices)
})
