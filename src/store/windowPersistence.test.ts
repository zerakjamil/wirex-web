import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from '../simulator/deviceFactory'
import { useNetworkStore } from './networkStore'
import { restoreWorkspaceFromStorage, saveWorkspaceToStorage, STORAGE_KEY } from './workspacePersistence'
import type { NetworkAnnotation, NetworkLink } from '../types/network'

class MapStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function fixture() {
  const router = createDevice('router', 430, 170)
  router.id = 'persisted-router'
  router.config.hostname = 'SavedVoiceRouter'
  router.config.telephony = {
    sourceIp: '192.168.20.1', port: 2000, maxEphones: 2, maxDn: 2,
    directoryNumbers: [{ id: 1, number: '101' }], ephones: [],
  }
  router.importedRunningConfig = ['hostname SavedVoiceRouter', 'telephony-service', ' max-ephones 2']
  const phone = createDevice('phone', 90, 280)
  phone.id = 'persisted-phone'
  const pc = createDevice('pc', 700, 390)
  pc.id = 'persisted-pc'
  const link: NetworkLink = {
    id: 'persisted-cable', type: 'straight', status: 'up',
    fromDeviceId: router.id, fromPortId: router.ports[0].id,
    toDeviceId: phone.id, toPortId: phone.ports[0].id,
  }
  Object.assign(router.ports[0], { status: 'up', adminStatus: 'up', connectedLinkId: link.id, connectedDeviceId: phone.id, connectedPortId: phone.ports[0].id })
  Object.assign(phone.ports[0], { status: 'up', adminStatus: 'up', connectedLinkId: link.id, connectedDeviceId: router.id, connectedPortId: router.ports[0].id })
  const note: NetworkAnnotation = { id: 'saved-note', type: 'note', x: 100, y: 100, text: 'Voice VLAN 20' }
  useNetworkStore.setState({ deviceWindows: [], activeModal: null })
  useNetworkStore.getState().loadLab([router, phone, pc], [link], [note])
  return { router, phone, pc }
}

function snapshot() {
  const { devices, links, annotations, deviceWindows } = useNetworkStore.getState()
  return structuredClone({ devices, links, annotations, deviceWindows })
}

test('router, phone and PC windows open independently without replacing other devices', () => {
  const { router, phone, pc } = fixture()
  for (const item of [router, phone, pc]) useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: item.id })
  const windows = useNetworkStore.getState().deviceWindows
  assert.equal(windows.length, 3)
  assert.deepEqual(new Set(windows.map(window => window.deviceId)), new Set([router.id, phone.id, pc.id]))
  for (const window of windows) {
    assert.ok(Number.isFinite(window.x) && Number.isFinite(window.y))
    assert.ok(window.width > 0 && window.height > 0)
    assert.equal(window.minimized, false)
  }
})

test('opening an existing device focuses its single window and restores it from minimized state', () => {
  const { router, phone } = fixture()
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: router.id })
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: phone.id })
  useNetworkStore.getState().minimizeDeviceWindow(router.id)
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: router.id })
  const windows = useNetworkStore.getState().deviceWindows
  assert.equal(windows.length, 2)
  const active = windows.find(window => window.deviceId === router.id)!
  assert.equal(active.minimized, false)
  assert.ok(active.z > windows.find(window => window.deviceId === phone.id)!.z)
})

test('moving and resizing one window preserves the other window geometry', () => {
  const { router, phone } = fixture()
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: router.id })
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: phone.id })
  const before = structuredClone(useNetworkStore.getState().deviceWindows.find(window => window.deviceId === phone.id))
  useNetworkStore.getState().updateDeviceWindow(router.id, { x: 120, y: 180, width: 850, height: 650 })
  const state = useNetworkStore.getState()
  const moved = state.deviceWindows.find(window => window.deviceId === router.id)!
  assert.deepEqual({ x: moved.x, y: moved.y, width: moved.width, height: moved.height }, { x: 120, y: 180, width: 850, height: 650 })
  assert.deepEqual(state.deviceWindows.find(window => window.deviceId === phone.id), before)
})

test('minimizing, focusing and closing a device window leaves other windows open', () => {
  const { router, phone } = fixture()
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: router.id })
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: phone.id })
  useNetworkStore.getState().minimizeDeviceWindow(router.id)
  assert.equal(useNetworkStore.getState().deviceWindows.find(window => window.deviceId === router.id)?.minimized, true)
  useNetworkStore.getState().focusDeviceWindow(router.id)
  assert.equal(useNetworkStore.getState().deviceWindows.find(window => window.deviceId === router.id)?.minimized, false)
  useNetworkStore.getState().closeDeviceWindow(router.id)
  assert.deepEqual(useNetworkStore.getState().deviceWindows.map(window => window.deviceId), [phone.id])
})

test('loading a replacement topology prunes windows whose device no longer exists', () => {
  const { router, phone } = fixture()
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: router.id })
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: phone.id })
  useNetworkStore.getState().loadLab([router], [])
  assert.equal(useNetworkStore.getState().deviceWindows.some(window => window.deviceId === phone.id), false)
  assert.ok(useNetworkStore.getState().deviceWindows.every(window => window.deviceId === router.id))
})

test('opening an unknown device cannot create an orphan window', () => {
  fixture()
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: 'missing-device' })
  assert.equal(useNetworkStore.getState().deviceWindows.length, 0)
})

test('storage restores imported configuration, topology positions, cables, notes and window geometry', () => {
  const { router, phone } = fixture()
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: router.id })
  useNetworkStore.getState().updateDeviceWindow(router.id, { x: 140, y: 110, width: 850, height: 650 })
  useNetworkStore.getState().setActiveModal({ type: 'device', deviceId: phone.id })
  useNetworkStore.getState().minimizeDeviceWindow(phone.id)
  const expected = snapshot()
  const storage = new MapStorage()
  assert.equal(saveWorkspaceToStorage(storage), true)
  assert.ok(storage.getItem(STORAGE_KEY))
  useNetworkStore.getState().resetTopology()
  assert.equal(useNetworkStore.getState().devices.length, 0)
  assert.equal(restoreWorkspaceFromStorage(storage), true)
  assert.deepEqual(snapshot(), expected)
})

test('workspace files omit transient per-VLAN STP timers',()=>{
 const sw=createDevice('switch',0,0)
 useNetworkStore.getState().loadLab([sw],[])
 const current=useNetworkStore.getState().devices[0]
 current.ports[0].stpVlanStates={'10':{state:'learning',sinceTick:12},'20':{state:'forwarding',sinceTick:4}}
 useNetworkStore.setState({devices:[current]})
 const storage=new MapStorage()
 assert.equal(saveWorkspaceToStorage(storage),true)
 const saved=storage.getItem(STORAGE_KEY)??''
 assert.doesNotMatch(saved,/stpVlanStates|sinceTick/)
})

test('workspace files keep configured HSRP groups but omit the elected runtime role',()=>{
 const router=createDevice('router',0,0,'2811')
 Object.assign(router.ports[0],{ipAddress:'192.0.2.2',subnetMask:'255.255.255.0',hsrpGroups:[{group:10,virtualIp:'192.0.2.1',priority:120,preempt:true}],hsrpRuntime:{'10':{state:'active',activeDeviceId:router.id,activeDeviceName:router.name,lastChangeTick:42}}})
 useNetworkStore.getState().loadLab([router],[])
 const current=useNetworkStore.getState().devices[0]
 current.ports[0].hsrpRuntime={'10':{state:'active',activeDeviceId:router.id,activeDeviceName:router.name,lastChangeTick:42}}
 useNetworkStore.setState({devices:[current]})
 const storage=new MapStorage()
 assert.equal(saveWorkspaceToStorage(storage),true)
 const saved=storage.getItem(STORAGE_KEY)??''
 assert.match(saved,/"hsrpGroups"/)
 assert.doesNotMatch(saved,/hsrpRuntime|lastChangeTick/)
 useNetworkStore.getState().resetTopology()
 assert.equal(restoreWorkspaceFromStorage(storage),true)
 const restored=useNetworkStore.getState().devices[0].ports[0]
 assert.deepEqual(restored.hsrpGroups,[{group:10,virtualIp:'192.0.2.1',priority:120,preempt:true}])
 assert.equal(restored.hsrpRuntime,undefined)
})

test('workspace files preserve displayed MAC age and omit transient aging ticks',()=>{
 const sw=createDevice('switch',0,0)
 sw.macTable=[{macAddress:'02:00:00:00:aa:03',portId:sw.ports[0].shortName,vlan:1,age:42,lastSeenTick:900}]
 useNetworkStore.getState().loadLab([sw],[])
 const current=useNetworkStore.getState().devices[0]
 current.macTable=[{...current.macTable[0],lastSeenTick:900}]
 useNetworkStore.setState({devices:[current]})
 const storage=new MapStorage()
 assert.equal(saveWorkspaceToStorage(storage),true)
 const saved=storage.getItem(STORAGE_KEY)??''
 assert.match(saved,/"age":42/)
 assert.doesNotMatch(saved,/lastSeenTick/)
})

test('an intentionally empty saved workspace restores as empty', () => {
  fixture()
  useNetworkStore.getState().resetTopology()
  const storage = new MapStorage()
  assert.equal(saveWorkspaceToStorage(storage), true)
  fixture()
  assert.equal(restoreWorkspaceFromStorage(storage), true)
  assert.equal(useNetworkStore.getState().devices.length, 0)
  assert.equal(useNetworkStore.getState().links.length, 0)
  assert.equal(useNetworkStore.getState().annotations.length, 0)
  assert.equal(useNetworkStore.getState().deviceWindows.length, 0)
})

test('missing storage data leaves the current workspace untouched', () => {
  fixture()
  const before = snapshot()
  assert.equal(restoreWorkspaceFromStorage(new MapStorage()), false)
  assert.deepEqual(snapshot(), before)
})

for (const [description, corrupt] of [
  ['malformed JSON', () => '{broken'],
  ['unsupported version', (saved: string) => JSON.stringify({ ...JSON.parse(saved), version: 999 })],
  ['a device without required config and ports', (saved: string) => JSON.stringify({ ...JSON.parse(saved), devices: [{ id: 'broken', type: 'router', x: 0, y: 0 }] })],
] as const) {
  test(`restoring ${description} rejects the cache without changing the current topology`, () => {
    fixture()
    const storage = new MapStorage()
    assert.equal(saveWorkspaceToStorage(storage), true)
    storage.setItem(STORAGE_KEY, corrupt(storage.getItem(STORAGE_KEY)!))
    const before = snapshot()
    assert.equal(restoreWorkspaceFromStorage(storage), false)
    assert.deepEqual(snapshot(), before)
  })
}

test('storage read and quota exceptions return false without disturbing the lab', () => {
  fixture()
  const before = snapshot()
  const storage = {
    getItem() { throw new Error('Storage disabled') },
    setItem() { throw new Error('Quota exceeded') },
  }
  assert.equal(saveWorkspaceToStorage(storage), false)
  assert.equal(restoreWorkspaceFromStorage(storage), false)
  assert.deepEqual(snapshot(), before)
})
