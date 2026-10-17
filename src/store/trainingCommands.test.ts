import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useNetworkStore as store } from './networkStore'
import { createTrainingLab } from '@/simulator/trainingLabs'
test('trunk allow-list and native VLAN commands change real port state',()=>{
 const lab=createTrainingLab('ethernet','guided');store.getState().loadLab(lab.devices,lab.links)
 for(const cmd of ['en','conf t','int gi0/1','switchport trunk allowed vlan 20','switchport trunk allowed vlan add 10','switchport trunk native vlan 20'])store.getState().executeIosCommand('campus-sw-a',cmd)
 const p=store.getState().devices[0].ports.find(p=>p.shortName==='Gi0/1')!
 assert.deepEqual(p.allowedVlans,[10,20]);assert.equal(p.nativeVlan,20)
})
test('STP root primary updates election and show output uses the real root',()=>{
 const lab=createTrainingLab('stp','guided');store.getState().loadLab(lab.devices,lab.links)
 for(const cmd of ['en','conf t','spanning-tree vlan 10 root primary','end'])store.getState().executeIosCommand('campus-sw-a',cmd)
 assert.equal(store.getState().devices[0].config.stpPriorities?.['10'],24576)
 const output=store.getState().executeIosCommand('campus-sw-a','show spanning-tree vlan 10')
 assert.match(output,/This bridge is the root/)
})
test('completed VLAN exercise really delivers an echo reply and saves completion',async()=>{
 const {useTrainingStore}=await import('./trainingStore')
 useTrainingStore.getState().start('vlans','guided')
 for(const id of ['campus-sw-a','campus-sw-b'])for(const cmd of ['en','conf t','vlan 10','name Sales','exit','int fa0/1','sw mo acc','sw acc vl 10','exit','int gi0/1','sw mo tru','end'])store.getState().executeIosCommand(id,cmd)
 useTrainingStore.getState().testTraffic()
 for(let i=0;i<200&&store.getState().inFlightPackets.length;i++)store.getState().stepSimulation()
 assert.equal(store.getState().pingResults.find(r=>r.id===useTrainingStore.getState().testId)?.status,'successful')
 useTrainingStore.getState().check();assert.equal(useTrainingStore.getState().progress.vlans?.completed,true)
 useTrainingStore.getState().exit()
})
test('an old successful ping cannot complete an exercise after its addressing changes',async()=>{
 const {useTrainingStore}=await import('./trainingStore')
 useTrainingStore.getState().start('tcpip','guided');useTrainingStore.getState().testTraffic()
 for(let i=0;i<200&&store.getState().inFlightPackets.length;i++)store.getState().stepSimulation()
 assert.equal(store.getState().pingResults.find(r=>r.id===useTrainingStore.getState().testId)?.status,'successful')
 const pc=store.getState().devices.find(d=>d.id==='campus-pc-b')!
 store.getState().updatePortConfig(pc.id,pc.ports[0].id,{ipAddress:'10.77.0.8'})
 useTrainingStore.getState().check();assert.equal(useTrainingStore.getState().progress.tcpip?.completed,false)
 useTrainingStore.getState().exit()
})
test('campus exercise assesses real department port ranges, SVIs, trunks and VLAN isolation',async()=>{
 const {useTrainingStore,evaluateLesson}=await import('./trainingStore')
 useTrainingStore.getState().start('campus','recall')
 assert.equal(store.getState().devices.length,10)
 for(const [index,id] of ['campus-sw-a','campus-sw-b'].entries()){
  const commands=['enable','configure terminal',...[[10,'Sales'],[20,'Management'],[30,'Admin']].flatMap(([vlan,name])=>[`vlan ${vlan}`,`name ${name}`,'exit']),'interface range fa0/1-2','switchport access vlan 10','exit','interface fa0/3','switchport access vlan 20','exit','interface fa0/4','switchport access vlan 30','exit','interface gi0/1','switchport mode trunk','exit','interface vlan 10',`ip address 192.168.10.${index+2} 255.255.255.0`,'no shutdown','end']
  for(const cmd of commands)store.getState().executeIosCommand(id,cmd)
 }
 assert.ok(evaluateLesson('campus',store.getState().devices,store.getState().links).filter(c=>c.id!=='traffic').every(c=>c.complete))
 useTrainingStore.getState().testTraffic();for(let i=0;i<200&&store.getState().inFlightPackets.length;i++)store.getState().stepSimulation()
 assert.equal(store.getState().pingResults.find(r=>r.id===useTrainingStore.getState().testId)?.status,'successful')
 assert.equal(store.getState().sendPing('campus-pc-a','192.168.20.11'),null)
 useTrainingStore.getState().exit()
})
