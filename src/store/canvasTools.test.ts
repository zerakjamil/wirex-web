import test from 'node:test'
import assert from 'node:assert/strict'
import { makeDrawing } from '../components/canvas/drawingGeometry'
import { useWorkspaceStore } from './workspaceStore'
import { useNetworkStore } from './networkStore'

test('reverse rectangle drag creates bounds around both endpoints',()=>{
  const shape=makeDrawing('rect',[{x:300,y:240},{x:50,y:60}])!
  assert.deepEqual([shape.x,shape.y,shape.width,shape.height],[50,60,250,180])
})
test('a horizontal line remains horizontal and a click does not create a phantom shape',()=>{
  assert.equal(makeDrawing('ellipse',[{x:10,y:10}]),null)
  const line=makeDrawing('line',[{x:40,y:50},{x:200,y:50}])!
  assert.deepEqual(line.points,[{x:0,y:0},{x:160,y:0}])
  assert.equal(line.height,4)
})
test('tool changes discard a pending PDU destination and inspect selection',()=>{
  useWorkspaceStore.setState({pduSource:'old',pduDestination:'old-target',inspectedDeviceId:'old'})
  useNetworkStore.getState().setConnectingSource({deviceId:'old'})
  useWorkspaceStore.getState().setTool('note')
  assert.equal(useWorkspaceStore.getState().pduDestination,null)
  assert.equal(useWorkspaceStore.getState().inspectedDeviceId,null)
  assert.equal(useNetworkStore.getState().connectingSource,null)
})
