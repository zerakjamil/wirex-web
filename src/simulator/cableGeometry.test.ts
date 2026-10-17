import assert from 'node:assert/strict'
import test from 'node:test'
import { getDeviceCableGeometry } from '../components/canvas/cableGeometry'

test('a vertical cable anchors directly at hardware centers rather than node label boundaries',()=>{
  const geometry=getDeviceCableGeometry({x:100,y:100,width:80},{x:100,y:300,width:80})
  assert.equal(geometry.sourceX,140)
  assert.equal(geometry.sourceY,136)
  assert.equal(geometry.targetX,140)
  assert.equal(geometry.targetY,336)
})
test('a horizontal cable anchors directly to the icon centers and follows device moves',()=>{
  const geometry=getDeviceCableGeometry({x:100,y:100,width:80},{x:300,y:100,width:80})
  assert.equal(geometry.sourceX,140)
  assert.equal(geometry.targetX,340)
  assert.equal(geometry.sourceY,136)
  assert.equal(geometry.targetY,136)
  const moved=getDeviceCableGeometry({x:100,y:100,width:80},{x:300,y:300,width:80})
  assert.equal(moved.sourceX,140)
  assert.equal(moved.sourceY,136)
  assert.equal(moved.targetX,340)
  assert.equal(moved.targetY,336)
})
