import {test} from 'node:test'
import assert from 'node:assert/strict'
import {useNetworkStore as store} from './networkStore'
import {createTrainingLab} from '@/simulator/trainingLabs'
test('SVI is up only when its VLAN exists and an eligible physical member is up',()=>{
 const lab=createTrainingLab('vlans','guided');store.getState().loadLab(lab.devices,lab.links)
 for(const cmd of ['en','conf t','interface vlan 10','ip address 192.168.10.2 255.255.255.0','no shutdown'])store.getState().executeIosCommand('campus-sw-a',cmd)
 const svi=()=>store.getState().devices[0].ports.find(p=>p.name==='Vlan10')!
 assert.ok(svi());assert.equal(svi().status,'down')
 for(const cmd of ['exit','vlan 10','exit','int fa0/1','sw acc vl 10'])store.getState().executeIosCommand('campus-sw-a',cmd)
 assert.equal(svi().status,'up')
 store.getState().executeIosCommand('campus-sw-a','shutdown');assert.equal(svi().status,'down')
 store.getState().addDevice('pc',900,900)
 const pc=store.getState().devices.at(-1)!
 assert.equal(store.getState().connectPorts('campus-sw-a',svi().id,pc.id,pc.ports[0].id,'straight'),false)
})
