import test from 'node:test'
import assert from 'node:assert/strict'
import { useNetworkStore } from './networkStore'
import { useTrainingStore, evaluateLesson,saveTrainingToStorage,restoreTrainingFromStorage } from './trainingStore'
import {saveWorkspaceToStorage,STORAGE_KEY} from './workspacePersistence'
import { useWorkspaceStore } from './workspaceStore'

test('training preserves the imported workspace and restores it on exit',()=>{
  useNetworkStore.getState().resetTopology()
  useNetworkStore.getState().addDevice('router',123,456,'2811')
  useWorkspaceStore.setState({fileName:'college.pkt'})
  const before=structuredClone(useNetworkStore.getState().devices)
  useTrainingStore.getState().start('vlans','guided')
  assert.ok(useNetworkStore.getState().devices.some(d=>d.id==='campus-sw-a'))
  useTrainingStore.getState().exit()
  assert.deepEqual(useNetworkStore.getState().devices,before)
  assert.equal(useWorkspaceStore.getState().fileName,'college.pkt')
})
test('VLAN assessment checks actual configuration and accepts CLI abbreviations',()=>{
  useTrainingStore.getState().start('vlans','guided')
  const net=useNetworkStore.getState()
  for(const id of ['campus-sw-a','campus-sw-b'])for(const command of ['en','conf t','vlan 10','name Sales','exit','int fa0/1','sw mo acc','sw acc vl 10','exit','int gi0/1','sw mo tru','end'])net.executeIosCommand(id,command)
  const checks=evaluateLesson('vlans',useNetworkStore.getState().devices,useNetworkStore.getState().links)
  assert.ok(checks.filter(c=>['vlans','names','access','trunks'].includes(c.id)).every(c=>c.complete))
  assert.ok(!checks.find(c=>c.id==='traffic')?.complete)
  useTrainingStore.getState().exit()
})
test('recall starts without revealing commands and hints are recorded',()=>{
  useTrainingStore.getState().start('vlans','recall')
  assert.equal(useTrainingStore.getState().hintLevel,0)
  useTrainingStore.getState().revealHint()
  assert.equal(useTrainingStore.getState().hintLevel,1)
  assert.equal(useTrainingStore.getState().progress.vlans?.hintsUsed,1)
  useTrainingStore.getState().exit()
})
test('reload restores the in-progress lesson while ordinary cache retains the imported network',()=>{
 useNetworkStore.getState().resetTopology();useNetworkStore.getState().addDevice('router',81,92,'2811');useWorkspaceStore.setState({fileName:'original.pkt'})
 const original=structuredClone(useNetworkStore.getState().devices),map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)||null,setItem:(key:string,value:string)=>{map.set(key,value)}}
 useTrainingStore.getState().start('vlans','recall');useNetworkStore.getState().executeIosCommand('campus-sw-a','enable');useTrainingStore.getState().revealHint()
 assert.ok(saveWorkspaceToStorage(storage));assert.ok(saveTrainingToStorage(storage))
 assert.equal(JSON.parse(map.get(STORAGE_KEY)!).fileName,'original.pkt')
 useTrainingStore.getState().exit()
 assert.ok(restoreTrainingFromStorage(storage));assert.equal(useTrainingStore.getState().active,true);assert.equal(useTrainingStore.getState().hintLevel,1);assert.equal(useNetworkStore.getState().devices[0].currentCliMode,'priv')
 useTrainingStore.getState().exit();assert.deepEqual(useNetworkStore.getState().devices,original)
})
test('STP runtime is excluded from persisted training checkpoints',()=>{
 useTrainingStore.getState().start('stp','guided')
 useNetworkStore.getState().stepSimulation()
 assert.ok(useNetworkStore.getState().devices.some(device=>device.stpRuntime))
 const state=useNetworkStore.getState(),switchDevice=state.devices.find(device=>device.type==='switch')!
 switchDevice.ports[0].stpState='listening';switchDevice.ports[0].stpSinceTick=11;switchDevice.ports[0].stpVlanStates={'10':{state:'listening',sinceTick:11}}
 useNetworkStore.setState({devices:[...state.devices]})
 const map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)||null,setItem:(key:string,value:string)=>{map.set(key,value)}}
 assert.ok(saveTrainingToStorage(storage))
 assert.doesNotMatch(map.get('wireforge-training-v1')??'',/stpRuntime|stpSinceTick|stpVlanStates|"stpState":"listening"/)
 useTrainingStore.getState().exit()
})
