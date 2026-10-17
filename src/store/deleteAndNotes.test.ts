import test from 'node:test'
import assert from 'node:assert/strict'
import { useWorkspaceStore } from './workspaceStore'
import { useNetworkStore } from './networkStore'

test('device deletion waits for confirmation and cancel preserves the device',()=>{
  useNetworkStore.getState().resetTopology()
  useNetworkStore.getState().addDevice('pc',100,100)
  const id=useNetworkStore.getState().devices[0].id
  useWorkspaceStore.getState().requestDeletion({deviceIds:[id]})
  assert.equal(useNetworkStore.getState().devices.length,1)
  useWorkspaceStore.getState().setDialog(null)
  assert.equal(useNetworkStore.getState().devices.length,1)
  useWorkspaceStore.getState().requestDeletion({deviceIds:[id]})
  useWorkspaceStore.getState().confirmDeletion()
  assert.equal(useNetworkStore.getState().devices.length,0)
  useWorkspaceStore.getState().undo()
  assert.equal(useNetworkStore.getState().devices.length,1)
})
test('drawing deletion is immediate and undoable',()=>{
  useNetworkStore.getState().loadLab([],[],[{id:'drawing',type:'rect',x:0,y:0}])
  useWorkspaceStore.getState().requestDeletion({annotationIds:['drawing']})
  assert.equal(useNetworkStore.getState().annotations.length,0)
  useWorkspaceStore.getState().undo()
  assert.equal(useNetworkStore.getState().annotations.length,1)
})
test('deleting a cable removes it immediately without a device confirmation and releases both ports',()=>{
  const net=useNetworkStore.getState()
  net.resetTopology()
  net.addDevice('pc',0,0)
  net.addDevice('switch',200,0)
  const [pc,sw]=useNetworkStore.getState().devices
  net.autoConnectDevices(pc.id,sw.id)
  const link=useNetworkStore.getState().links[0]
  assert.ok(link)
  useWorkspaceStore.getState().requestDeletion({linkIds:[link.id]})
  assert.equal(useNetworkStore.getState().links.length,0)
  assert.equal(useWorkspaceStore.getState().dialog,null)
  assert.equal(useNetworkStore.getState().devices.length,2)
  assert.equal(useNetworkStore.getState().devices[0].ports[0].connectedLinkId,undefined)
  useWorkspaceStore.getState().undo()
  assert.equal(useNetworkStore.getState().links.length,1)
})
test('the note modal saves text at the clicked position without a browser prompt',()=>{
  useNetworkStore.getState().resetTopology()
  useWorkspaceStore.getState().openNoteEditor({x:123,y:456,text:''})
  assert.equal(useWorkspaceStore.getState().dialog,'note')
  useWorkspaceStore.getState().saveNote('  VLAN 20  ')
  assert.equal(useNetworkStore.getState().annotations[0].text,'VLAN 20')
  assert.equal(useNetworkStore.getState().annotations[0].x,123)
  assert.equal(useWorkspaceStore.getState().dialog,null)
})
