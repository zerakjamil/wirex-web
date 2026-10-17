import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { createTrainingLab } from './trainingLabs'
import { getStpTopology,getOperationalChannels,prepareStpTick,receiveStpBpdu,advanceStpPortStates } from './spanningTree'
import type { NetworkLink } from '../types/network'

function twoVlanTrunk(){
 const a=createDevice('switch',0,0),b=createDevice('switch',200,0)
 a.id='trunk-a';b.id='trunk-b';a.macAddress='02:00:00:00:00:0a';b.macAddress='02:00:00:00:00:0b'
 a.config.vlans=[{id:10,name:'Users'},{id:20,name:'Voice'}];b.config.vlans=[{id:10,name:'Users'},{id:20,name:'Voice'}]
 const ap=a.ports[0],bp=b.ports[0],linkId='two-vlan-trunk'
 Object.assign(ap,{status:'up',portMode:'trunk',nativeVlan:10,allowedVlans:[10,20],connectedLinkId:linkId,connectedDeviceId:b.id,connectedPortId:bp.id})
 Object.assign(bp,{status:'up',portMode:'trunk',nativeVlan:10,allowedVlans:[10,20],connectedLinkId:linkId,connectedDeviceId:a.id,connectedPortId:ap.id})
 const link:NetworkLink={id:linkId,type:'straight',status:'up',fromDeviceId:a.id,fromPortId:ap.id,toDeviceId:b.id,toPortId:bp.id}
 return {devices:[a,b],links:[link],a,ap}
}
test('bridge priority changes the root and redundant triangle has one alternate endpoint',()=>{
 const lab=createTrainingLab('stp','guided'),a=lab.devices.find(device=>device.id==='campus-sw-a')!
 const beforeBpdus=getStpTopology(lab.devices,lab.links,10)
 assert.ok(['campus-sw-a','campus-sw-b','campus-sw-c'].every(id=>beforeBpdus.roots.get(id)===id))
 assert.equal([...beforeBpdus.ports.values()].filter(port=>port.role==='Altn').length,0)
 a.config.stpPriorities={'10':24576}
 let devices=lab.devices
 for(let tick=1;tick<=40;tick++){
  const prepared=prepareStpTick(devices,lab.links,tick)
  devices=prepared.devices
  for(const frame of prepared.outbound){
   const link=lab.links.find(candidate=>candidate.id===frame.linkId)!
   const receiverId=link.fromDeviceId===frame.deviceId?link.toDeviceId:link.fromDeviceId
   const receiverPortId=link.fromDeviceId===frame.deviceId?link.toPortId:link.fromPortId
   receiveStpBpdu(devices.find(device=>device.id===receiverId)!,receiverPortId,link.id,frame.deviceId,frame.pdu,tick)
  }
 }
 const tree=getStpTopology(devices,lab.links,10)
 assert.equal(tree.roots.get('campus-sw-b'),'campus-sw-a')
 assert.equal([...tree.ports.values()].filter(p=>p.role==='Altn').length,1)
})
test('LACP passive/passive fails but active/passive forms a two-member channel',()=>{
 const lab=createTrainingLab('channel','troubleshoot')
 assert.equal(getOperationalChannels(lab.devices,lab.links).length,0)
 for(const p of lab.devices[0].ports.filter(p=>p.channelGroup))p.channelMode='active'
 assert.equal(getOperationalChannels(lab.devices,lab.links)[0]?.links.length,2)
})

test('switches advertise per-VLAN BPDUs on each logical switch link and refresh at the hello interval',()=>{
 const lab=createTrainingLab('stp','guided'),first=prepareStpTick(lab.devices,lab.links,1)
 const vlanTen=first.outbound.filter(frame=>frame.vlan===10)
 assert.equal(vlanTen.length,6)
 assert.equal(vlanTen[0].pdu.etherType,'802.3/LLC')
 assert.deepEqual([vlanTen[0].pdu.payload.stpLlcDsap,vlanTen[0].pdu.payload.stpLlcSsap,vlanTen[0].pdu.payload.stpLlcControl],['0x42','0x42','0x03'])
 assert.ok(first.outbound.every(frame=>{
  const link=lab.links.find(candidate=>candidate.id===frame.linkId)!
  return lab.devices.find(device=>device.id===link.fromDeviceId)?.type==='switch'&&lab.devices.find(device=>device.id===link.toDeviceId)?.type==='switch'
 }))
 const beforeHello=prepareStpTick(first.devices,lab.links,34)
 assert.equal(beforeHello.outbound.length,0)
 const hello=prepareStpTick(beforeHello.devices,lab.links,35)
 assert.equal(hello.outbound.filter(frame=>frame.vlan===10).length,6)
})

test('a changed BPDU vector waits for the per-port VLAN hold timer before sending',()=>{
 const {devices,links,a}=twoVlanTrunk()
 const first=prepareStpTick(devices,links,1)
 const changedDevices=first.devices.map(device=>device.id===a.id?{...device,config:{...device.config,stpPriorities:{'10':28672}}}:device)
 const tooSoon=prepareStpTick(changedDevices,links,2)
 assert.equal(tooSoon.outbound.filter(frame=>frame.deviceId===a.id&&frame.vlan===10).length,0)
 const oneTickEarly=prepareStpTick(tooSoon.devices,links,17)
 assert.equal(oneTickEarly.outbound.filter(frame=>frame.deviceId===a.id&&frame.vlan===10).length,0)
 const released=prepareStpTick(oneTickEarly.devices,links,18)
 assert.equal(released.outbound.filter(frame=>frame.deviceId===a.id&&frame.vlan===10).length,1)
})

test('a switch discards a neighbor BPDU when its connected link fails',()=>{
 const lab=createTrainingLab('stp','guided'),first=prepareStpTick(lab.devices,lab.links,1)
 const link=lab.links.find(candidate=>candidate.id==='campus-link-3')!,advertisement=first.outbound.find(frame=>frame.deviceId==='campus-sw-c'&&frame.linkId===link.id&&frame.vlan===10)!
 const receiver=first.devices.find(device=>device.id==='campus-sw-a')!
 const receiverPortId=link.fromDeviceId===receiver.id?link.fromPortId:link.toPortId
 assert.equal(receiveStpBpdu(receiver,receiverPortId,link.id,'campus-sw-c',advertisement.pdu),true)
 const learned=prepareStpTick(first.devices,lab.links,2).devices
 assert.equal(getStpTopology(learned,lab.links,10).roots.get(receiver.id),'campus-sw-c')
 const failedLinks=lab.links.map(candidate=>candidate.id==='campus-link-2'||candidate.id==='campus-link-3'?{...candidate,status:'down' as const}:candidate)
 const recovered=prepareStpTick(learned,failedLinks,3).devices
 assert.equal(getStpTopology(recovered,failedLinks,10).roots.get(receiver.id),receiver.id)
})

test('a received BPDU refreshes neighbor lifetime until the 20-second max age expires',()=>{
 const lab=createTrainingLab('stp','guided'),first=prepareStpTick(lab.devices,lab.links,1)
 const link=lab.links.find(candidate=>candidate.id==='campus-link-3')!,advertisement=first.outbound.find(frame=>frame.deviceId==='campus-sw-c'&&frame.linkId===link.id&&frame.vlan===10)!
 const receiver=first.devices.find(device=>device.id==='campus-sw-a')!,receiverPortId=link.fromDeviceId===receiver.id?link.fromPortId:link.toPortId
 assert.equal(receiveStpBpdu(receiver,receiverPortId,link.id,'campus-sw-c',advertisement.pdu,1),true)
 const learned=prepareStpTick(first.devices,lab.links,2).devices
 const sameAdvertisement=advertisement.pdu
 const refreshedReceiver=learned.find(device=>device.id===receiver.id)!
 assert.equal(receiveStpBpdu(refreshedReceiver,receiverPortId,link.id,'campus-sw-c',sameAdvertisement,300),true)
 const beforeExpiry=prepareStpTick(learned,lab.links,633).devices
 assert.equal(getStpTopology(beforeExpiry,lab.links,10).roots.get(receiver.id),'campus-sw-c')
 const expired=prepareStpTick(beforeExpiry,lab.links,634).devices
 assert.equal(getStpTopology(expired,lab.links,10).roots.get(receiver.id),receiver.id)
 assert.equal(expired.find(device=>device.id===receiver.id)?.stpRuntime?.vlans['10'].neighbors.length,0)
})

test('a newly received superior BPDU immediately selects its ingress as the root port',()=>{
 const lab=createTrainingLab('stp','guided'),first=prepareStpTick(lab.devices,lab.links,1)
 const root=first.devices.find(device=>device.id==='campus-sw-c')!,receiver=first.devices.find(device=>device.id==='campus-sw-a')!
 const link=lab.links.find(candidate=>candidate.id==='campus-link-3')!,advertisement=first.outbound.find(frame=>frame.deviceId===root.id&&frame.linkId===link.id&&frame.vlan===10)!
 const localPortId=link.fromDeviceId===receiver.id?link.fromPortId:link.toPortId
 assert.equal(receiveStpBpdu(receiver,localPortId,link.id,root.id,advertisement.pdu,1),true)
 const topology=getStpTopology(first.devices,lab.links,10)
 assert.equal(topology.roots.get(receiver.id),root.id)
 assert.equal(topology.ports.get(`${receiver.id}|${localPortId}`)?.role,'Root')
})

test('switches do not elect an alternate link from the physical graph before exchanging BPDUs',()=>{
 const lab=createTrainingLab('stp','guided')
 const prepared=prepareStpTick(lab.devices,lab.links,1)
 const tree=getStpTopology(prepared.devices,lab.links,10)
 const byId=new Map(lab.devices.map(device=>[device.id,device]))
 const switchLinks=lab.links.filter(link=>byId.get(link.fromDeviceId)?.type==='switch'&&byId.get(link.toDeviceId)?.type==='switch')
 assert.equal([...tree.ports.values()].filter(port=>port.role==='Altn').length,0)
 assert.ok(switchLinks.every(link=>tree.forwardingLinks.has(link.id)))
})

test('switch port roles start from local information then converge from exchanged BPDUs',()=>{
 const lab=createTrainingLab('stp','guided'),switchA=lab.devices.find(device=>device.id==='campus-sw-a')!,switchB=lab.devices.find(device=>device.id==='campus-sw-b')!,switchC=lab.devices.find(device=>device.id==='campus-sw-c')!
 let devices=lab.devices
 for(let tick=1;tick<=40;tick++){
  const prepared=prepareStpTick(devices,lab.links,tick)
  devices=prepared.devices
  if(tick===1){
   const startup=getStpTopology(devices,lab.links,10)
   assert.ok([switchA,switchB,switchC].every(device=>startup.roots.get(device.id)===device.id))
   const switchLinks=lab.links.filter(link=>[switchA.id,switchB.id,switchC.id].includes(link.fromDeviceId)&&[switchA.id,switchB.id,switchC.id].includes(link.toDeviceId))
   assert.ok(switchLinks.every(link=>startup.forwardingLinks.has(link.id)))
   assert.equal([...startup.ports.values()].filter(port=>port.role==='Altn').length,0)
  }
  for(const frame of prepared.outbound){
   const link=lab.links.find(candidate=>candidate.id===frame.linkId)!
   const sender=devices.find(device=>device.id===frame.deviceId)!
   const receiverId=link.fromDeviceId===sender.id?link.toDeviceId:link.fromDeviceId
   const receiverPortId=link.fromDeviceId===sender.id?link.toPortId:link.fromPortId
   receiveStpBpdu(devices.find(device=>device.id===receiverId)!,receiverPortId,link.id,sender.id,frame.pdu,tick)
  }
 }
 const tree=getStpTopology(devices,lab.links,10)
 assert.ok([switchA,switchB,switchC].every(device=>tree.roots.get(device.id)===switchC.id))
 const rootLinks=lab.links.filter(link=>link.fromDeviceId===switchC.id||link.toDeviceId===switchC.id)
 for(const link of rootLinks){
  const otherId=link.fromDeviceId===switchC.id?link.toDeviceId:link.fromDeviceId
  const rootPortId=link.fromDeviceId===switchC.id?link.toPortId:link.fromPortId
  const designatedPortId=link.fromDeviceId===switchC.id?link.fromPortId:link.toPortId
  assert.equal(tree.ports.get(`${otherId}|${rootPortId}`)?.role,'Root')
  assert.equal(tree.ports.get(`${switchC.id}|${designatedPortId}`)?.role,'Desg')
  assert.equal(tree.forwardingLinks.has(link.id),true)
 }
 assert.equal([...tree.ports.values()].filter(port=>port.role==='Altn').length,1)
 const alternate=[...tree.ports].find(([,port])=>port.role==='Altn')![0]
 const [alternateDeviceId,alternatePortId]=alternate.split('|')
 const alternateLink=lab.links.find(link=>link.fromDeviceId===alternateDeviceId&&link.fromPortId===alternatePortId||link.toDeviceId===alternateDeviceId&&link.toPortId===alternatePortId)!
 assert.equal(tree.forwardingLinks.has(alternateLink.id),false)
})

test('a new non-portfast switch port listens, learns, then forwards after two 15-second delays',()=>{
 const lab=createTrainingLab('stp','guided'),root=lab.devices.find(device=>device.id==='campus-sw-c')!
 const link=lab.links.find(candidate=>candidate.id==='campus-link-3')!
 const portId=link.fromDeviceId===root.id?link.fromPortId:link.toPortId
 const rootPort=root.ports.find(candidate=>candidate.id===portId)!
 Object.assign(rootPort,{stpState:'listening',stpSinceTick:0})
 const beforeFirstDelay=advanceStpPortStates(lab.devices,lab.links,249)
 assert.equal(beforeFirstDelay.find(device=>device.id===root.id)!.ports.find(candidate=>candidate.id===portId)!.stpState,'listening')
 const learning=advanceStpPortStates(beforeFirstDelay,lab.links,250)
 assert.equal(learning.find(device=>device.id===root.id)!.ports.find(candidate=>candidate.id===portId)!.stpState,'learning')
 const beforeSecondDelay=advanceStpPortStates(learning,lab.links,499)
 assert.equal(beforeSecondDelay.find(device=>device.id===root.id)!.ports.find(candidate=>candidate.id===portId)!.stpState,'learning')
 const forwarding=advanceStpPortStates(beforeSecondDelay,lab.links,500)
 assert.equal(forwarding.find(device=>device.id===root.id)!.ports.find(candidate=>candidate.id===portId)!.stpState,'forwarding')
})

test('portfast switch ports skip the listening and learning delays',()=>{
 const lab=createTrainingLab('stp','guided'),root=lab.devices.find(device=>device.id==='campus-sw-c')!
 const link=lab.links.find(candidate=>candidate.id==='campus-link-3')!
 const portId=link.fromDeviceId===root.id?link.fromPortId:link.toPortId
 Object.assign(root.ports.find(candidate=>candidate.id===portId)!,{stpState:'listening',stpSinceTick:0})
 root.config.portfastDefault=true
 const advanced=advanceStpPortStates(lab.devices,lab.links,1)
 assert.equal(advanced.find(device=>device.id===root.id)!.ports.find(candidate=>candidate.id===portId)!.stpState,'forwarding')
})

test('a trunk applies its own STP state to each carried VLAN',()=>{
 const {devices,links,a,ap}=twoVlanTrunk()
 ap.stpVlanStates={
  '10':{state:'listening',sinceTick:0},
  '20':{state:'forwarding',sinceTick:0},
 }
 const users=getStpTopology(devices,links,10),voice=getStpTopology(devices,links,20)
 assert.equal(users.ports.get(`${a.id}|${ap.id}`)?.state,'LIS')
 assert.equal(users.forwardingLinks.has(links[0].id),false)
 assert.equal(voice.ports.get(`${a.id}|${ap.id}`)?.state,'FWD')
 assert.equal(voice.forwardingLinks.has(links[0].id),true)
})

test('a trunk advances each VLAN on its own STP forward-delay clock',()=>{
 const {devices,links,a,ap}=twoVlanTrunk()
 ap.stpVlanStates={
  '10':{state:'listening',sinceTick:0},
  '20':{state:'learning',sinceTick:100},
 }
 const advanced=advanceStpPortStates(devices,links,350)
 const states=advanced.find(device=>device.id===a.id)!.ports.find(port=>port.id===ap.id)!.stpVlanStates!
 assert.equal(states['10'].state,'learning')
 assert.equal(states['20'].state,'forwarding')
})

test('a newly carried VLAN starts in listening when the trunk already has runtime state',()=>{
 const {devices,links,a,ap}=twoVlanTrunk()
 ap.stpVlanStates={'10':{state:'forwarding',sinceTick:0}}
 assert.equal(getStpTopology(devices,links,20).ports.get(`${a.id}|${ap.id}`)?.state,'LIS')
 const advanced=advanceStpPortStates(devices,links,260)
 const states=advanced.find(device=>device.id===a.id)!.ports.find(port=>port.id===ap.id)!.stpVlanStates!
 assert.deepEqual(states['20'],{state:'listening',sinceTick:260})
})
