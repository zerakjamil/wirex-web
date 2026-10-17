import assert from 'node:assert/strict'
import test from 'node:test'
import { useNetworkStore } from './networkStore'
import { useWorkspaceStore } from './workspaceStore'

function reset() {
  useNetworkStore.getState().resetTopology()
  useWorkspaceStore.setState({ placement:null, past:[], future:[], canvasAction:null })
}

test('choosing a shelf device waits for placement and a single placement uses the requested coordinates',()=>{
  reset()
  const ws=useWorkspaceStore.getState()
  ws.selectDeviceForPlacement('router','2811',false)
  assert.equal(useNetworkStore.getState().devices.length,0)
  ws.placeDevice(345,678)
  const device=useNetworkStore.getState().devices[0]
  assert.equal(device.model,'2811')
  assert.deepEqual([device.x,device.y],[345,678])
  assert.equal(useWorkspaceStore.getState().placement,null)
  assert.equal(useWorkspaceStore.getState().canvasAction,null)
  ws.placeDevice(900,900)
  assert.equal(useNetworkStore.getState().devices.length,1)
})

test('Ctrl placement repeats across different positions until the same shelf icon is clicked again',()=>{
  reset()
  const ws=useWorkspaceStore.getState()
  ws.selectDeviceForPlacement('pc','PC-PT',true)
  ws.placeDevice(10,20)
  ws.placeDevice(400,500)
  assert.deepEqual(useNetworkStore.getState().devices.map(d=>[d.x,d.y]),[[10,20],[400,500]])
  assert.equal(useWorkspaceStore.getState().placement?.repeat,true)
  ws.selectDeviceForPlacement('pc','PC-PT',false)
  assert.equal(useWorkspaceStore.getState().placement,null)
  ws.placeDevice(800,800)
  assert.equal(useNetworkStore.getState().devices.length,2)
})

test('changing tools cancels placement and undo removes only the last placed device',()=>{
  reset()
  const ws=useWorkspaceStore.getState()
  ws.selectDeviceForPlacement('switch','2960-24TT',true)
  ws.placeDevice(10,20)
  ws.placeDevice(300,400)
  ws.setTool('delete')
  assert.equal(useWorkspaceStore.getState().placement,null)
  ws.undo()
  assert.equal(useNetworkStore.getState().devices.length,1)
})

test('non-finite positions cannot create devices or consume the active placement',()=>{
  reset()
  const ws=useWorkspaceStore.getState()
  ws.selectDeviceForPlacement('phone','IP-Phone-PT',false)
  ws.placeDevice(NaN,30)
  assert.equal(useNetworkStore.getState().devices.length,0)
  assert.ok(useWorkspaceStore.getState().placement)
})
