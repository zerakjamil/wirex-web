import test from 'node:test'
import assert from 'node:assert/strict'
import {createDevice,createPort} from './deviceFactory'
import {createPingPacket,stepSimulationTick,createArpRequestPdu,MAX_IN_FLIGHT_PACKETS,MAX_TOPOLOGY_PACKET_QUEUE,packetQueueLimitForTopology} from './engine'
import {createTrainingLab} from './trainingLabs'
import {getStpTopology} from './spanningTree'
import type {DeviceType,NetworkDevice,NetworkLink,InFlightPacket} from '@/types/network'

function node(type:DeviceType,id:string,ip?:string){
  const d=createDevice(type,0,0);d.id=id;d.name=id
  d.ports.forEach(p=>{p.status='up';p.adminStatus='up'})
  if(ip){d.ports[0].ipAddress=ip;d.ports[0].subnetMask='255.255.255.0'}
  return d
}
function cable(a:NetworkDevice,ai:number,b:NetworkDevice,bi:number,type:NetworkLink['type']='straight'):NetworkLink{
  const ap=a.ports[ai],bp=b.ports[bi],id=`${a.id}:${ai}-${b.id}:${bi}`
  Object.assign(ap,{connectedLinkId:id,connectedDeviceId:b.id,connectedPortId:bp.id})
  Object.assign(bp,{connectedLinkId:id,connectedDeviceId:a.id,connectedPortId:ap.id})
  return {id,type,status:'up',fromDeviceId:a.id,fromPortId:ap.id,toDeviceId:b.id,toPortId:bp.id}
}
function run(devices:NetworkDevice[],links:NetworkLink[],initial:InFlightPacket|InFlightPacket[],startTick=1){
  let packets=Array.isArray(initial)?initial:[initial],peak=packets.length,replied=false,tick=startTick
  const sourceId=Array.isArray(initial)?initial.find(packet=>packet.pdu.protocol!=='STP')?.fromDeviceId:initial.fromDeviceId
  const sourceIds=new Set((Array.isArray(initial)?initial:[initial]).filter(packet=>packet.pdu.protocol!=='STP').map(packet=>packet.fromDeviceId))
  const repliedSources=new Set<string>()
  const reasons:string[]=[]
  for(;tick<startTick+500&&packets.length;tick++){
    const step=stepSimulationTick(devices,links,packets,[],[],tick)
    for(const d of step.packetDeliveries){
      const packet=packets.find(p=>p.id===d.packetId)
      if(d.status==='delivered'&&packet?.pdu.payload.icmpType==='echo-reply'){
        if(d.receiverDeviceId===sourceId)replied=true
        if(sourceIds.has(d.receiverDeviceId))repliedSources.add(d.receiverDeviceId)
      }
      if(d.status==='dropped'&&d.reason)reasons.push(d.reason)
    }
    devices=step.updatedDevices;packets=step.newInFlightPackets;peak=Math.max(peak,packets.length)
  }
  return {devices,packets,peak,replied,repliedSources,reasons,tick}
}
function settleStp(devices:NetworkDevice[],links:NetworkLink[],ticks=60,startTick=1){
  let packets:InFlightPacket[]=[]
  for(let tick=startTick;tick<startTick+ticks;tick++){
    const step=stepSimulationTick(devices,links,packets,[],[],tick)
    devices=step.updatedDevices;packets=step.newInFlightPackets
  }
  return {devices,packets,tick:startTick+ticks-1}
}
function routed(){
  const a=node('pc','a','10.0.0.1'),r=node('router','r','10.0.0.254'),b=node('pc','b','10.0.1.1')
  r.ports[1].ipAddress='10.0.1.254';r.ports[1].subnetMask='255.255.255.0'
  a.config.defaultGateway='10.0.0.254'
  return {a,r,b,devices:[a,r,b],links:[cable(a,0,r,0),cable(r,1,b,0)]}
}
function campus288(){
  const core=node('switch','core')
  const access=Array.from({length:12},(_,index)=>node('switch',`access-${index+1}`))
  const endpoints=Array.from({length:288},(_,index)=>{
    const addressIndex=index+1
    const host=node('pc',`host-${addressIndex}`,`10.0.${Math.floor((addressIndex-1)/254)}.${((addressIndex-1)%254)+1}`)
    host.ports[0].subnetMask='255.255.0.0'
    return host
  })
  const links:NetworkLink[]=[]
  access.forEach((sw,switchIndex)=>{
    links.push(cable(core,switchIndex,sw,24))
    for(let hostIndex=0;hostIndex<24;hostIndex++)links.push(cable(sw,hostIndex,endpoints[switchIndex*24+hostIndex],0))
  })
  return {devices:[core,...access,...endpoints],links,endpoints}
}
test('a remote endpoint without a return gateway cannot produce a successful ping',()=>{
  const {a,devices,links}=routed()
  const result=run(devices,links,createPingPacket(a,devices,links,'10.0.1.1')!)
  assert.equal(result.replied,false)
  assert.ok(result.reasons.some(r=>r.includes('No route')))
})
test('a configured gateway completes uncached routed ARP and ICMP in both directions',()=>{
  const {a,b,devices,links}=routed();b.config.defaultGateway='10.0.1.254'
  const result=run(devices,links,createPingPacket(a,devices,links,'10.0.1.1')!)
  assert.equal(result.replied,true)
  assert.equal(result.packets.length,0)
  assert.ok(!result.devices.find(d=>d.id===b.id)!.arpTable.some(p=>p.ipAddress==='10.0.0.1'))
})
test('a PC connected through the phone PC port can ping a LAN peer',()=>{
  const a=node('pc','a','10.0.0.1'),phone=node('phone','phone'),sw=node('switch','s'),b=node('pc','b','10.0.0.2')
  const devices=[a,phone,sw,b],links=[cable(a,0,phone,1),cable(phone,0,sw,0),cable(sw,1,b,0)]
  assert.equal(run(devices,links,createPingPacket(a,devices,links,'10.0.0.2')!).replied,true)
})
test('an access point forwards between multiple clients sharing its radio',()=>{
  const a=node('tablet','a','10.0.0.1'),ap=node('wireless','ap'),b=node('tablet','b','10.0.0.2'),c=node('tablet','c','10.0.0.3')
  const radio=ap.ports.findIndex(p=>p.type==='wireless')
  const links=[cable(a,0,ap,radio,'wireless'),cable(b,0,ap,radio,'wireless'),cable(c,0,ap,radio,'wireless')],devices=[a,ap,b,c]
  const result=run(devices,links,createPingPacket(a,devices,links,'10.0.0.2')!)
  assert.equal(result.replied,true)
  assert.equal(result.packets.length,0)
  assert.ok(result.peak<=3)
})
test('ARP does not claim an address assigned to another router interface',()=>{
  const {a,r,devices,links}=routed()
  const initial=createPingPacket(a,devices,links,'10.0.0.254')!
  initial.pdu=createArpRequestPdu(a,a.ports[0].id,r.ports[1].ipAddress!)
  initial.pdu.payload.pingTargetIp=undefined
  const result=run(devices,links,initial)
  assert.equal(result.devices[0].arpTable.length,0)
})
test('a redundant network under concurrent sends drains within the packet budget',()=>{
  const a=node('pc','a','10.0.0.1'),s=node('switch','s'),t=node('switch','t'),u=node('switch','u'),b=node('pc','b','10.0.0.2')
  const initialDevices=[a,s,t,u,b]
  const links=[cable(a,0,s,0),cable(s,1,t,0),cable(t,1,u,0),cable(u,1,s,2),cable(u,2,b,0)]
  const converged=settleStp(initialDevices,links)
  let devices=converged.devices
  let packets=Array.from({length:32},()=>createPingPacket(a,devices,links,'10.0.0.2')!)
  let replies=0
  packets=[...converged.packets,...packets]
  for(let tick=converged.tick+1;tick<converged.tick+501&&packets.some(packet=>packet.pdu.protocol!=='STP');tick++){
    const step=stepSimulationTick(devices,links,packets,[],[],tick)
    replies+=step.packetDeliveries.filter(d=>d.status==='delivered'&&d.receiverDeviceId===a.id&&packets.find(p=>p.id===d.packetId)?.pdu.payload.icmpType==='echo-reply').length
    assert.equal(step.queueLimitReached,false)
    assert.ok(step.newInFlightPackets.length<=MAX_IN_FLIGHT_PACKETS)
    devices=step.updatedDevices;packets=step.newInFlightPackets
  }
  assert.equal(packets.filter(packet=>packet.pdu.protocol!=='STP').length,0)
  assert.equal(replies,32)
})
test('a first ping reaches a distant client across a 288-host campus without overflowing the queue',()=>{
  const {devices:initialDevices,links}=campus288()
  const converged=settleStp(initialDevices,links)
  const source=converged.devices.find(device=>device.id==='host-1')!
  const target=converged.devices.find(device=>device.id==='host-288')!
  const result=run(converged.devices,links,createPingPacket(source,converged.devices,links,target.ports[0].ipAddress!)!,converged.tick+1)
  assert.equal(result.replied,true,`distant host did not reply; peak=${result.peak}, queueLimit=${result.reasons.some(reason=>reason.includes('queue is full'))}, reasons=${result.reasons.slice(0,4).join(' | ')}`)
  assert.equal(result.packets.length,0)
  assert.ok(result.peak>MAX_IN_FLIGHT_PACKETS,`expected campus flood to exercise scaled headroom, peak=${result.peak}`)
  assert.ok(result.peak<=packetQueueLimitForTopology(links.length))
  assert.ok(!result.reasons.some(reason=>reason.includes('queue is full')))
})
test('eight simultaneous cold-cache pings complete without queue drops on a large campus',()=>{
  const {devices:initialDevices,links}=campus288()
  const converged=settleStp(initialDevices,links)
  const target=converged.devices.find(device=>device.id==='host-288')!
  const sources=converged.devices.filter(device=>/^host-[1-8]$/.test(device.id))
  const initial=sources.map(source=>createPingPacket(source,converged.devices,links,target.ports[0].ipAddress!)!)
  const result=run(converged.devices,links,initial,converged.tick+1)
  assert.ok(result.peak>MAX_IN_FLIGHT_PACKETS,`expected simultaneous fan-out to cross the base queue floor; peak=${result.peak}`)
  assert.ok(result.peak<=MAX_TOPOLOGY_PACKET_QUEUE,`queue exceeded its hard cap: peak=${result.peak}`)
  assert.equal(result.reasons.some(reason=>reason.includes('queue is full')),false,`queue dropped frames before the eight pings completed: ${result.reasons.filter(reason=>reason.includes('queue is full')).length} drops`)
  assert.equal(result.repliedSources.size,8,`only ${result.repliedSources.size}/8 sources received replies`)
  assert.equal(result.packets.length,0,'all traffic should drain')
})
test('packet queue headroom scales with links but remains hard-capped',()=>{
  assert.equal(packetQueueLimitForTopology(20),MAX_IN_FLIGHT_PACKETS)
  assert.equal(packetQueueLimitForTopology(300),600)
  assert.equal(packetQueueLimitForTopology(300,8),MAX_TOPOLOGY_PACKET_QUEUE)
  assert.equal(packetQueueLimitForTopology(10_000),MAX_TOPOLOGY_PACKET_QUEUE)
  assert.equal(packetQueueLimitForTopology(Number.NaN),MAX_IN_FLIGHT_PACKETS)
  assert.equal(packetQueueLimitForTopology(300,Number.NaN),600)
})
test('STP unblocks a redundant path after trunk failure without blackholing learned unicast traffic',()=>{
  const lab=createTrainingLab('stp','guided')
  const ready=settleStp(lab.devices,lab.links)
  const source=ready.devices.find(d=>d.id==='campus-pc-a')!
  const target=ready.devices.find(d=>d.id==='campus-pc-b')!
  const aToB=lab.links.find(link=>link.id==='campus-link-2')!
  const aToC=lab.links.find(link=>link.id==='campus-link-3')!

  assert.equal(getStpTopology(ready.devices,lab.links,10).forwardingLinks.has(aToB.id),false)
  const beforeFailure=run(ready.devices,lab.links,[...ready.packets,createPingPacket(source,ready.devices,lab.links,target.ports[0].ipAddress!)!],ready.tick+1)
  assert.equal(beforeFailure.replied,true)
  const learnedSource=beforeFailure.devices.find(d=>d.id===source.id)!
  const learnedTarget=beforeFailure.devices.find(d=>d.id===target.id)!
  const distributionA=beforeFailure.devices.find(d=>d.id==='campus-sw-a')!
  assert.ok(learnedSource.arpTable.some(entry=>entry.ipAddress===learnedTarget.ports[0].ipAddress))
  assert.ok(distributionA.macTable.some(entry=>entry.macAddress===learnedTarget.ports[0].macAddress&&entry.linkId===aToC.id))

  aToC.status='down'
  const recovered=settleStp(beforeFailure.devices,lab.links,60,beforeFailure.tick)
  assert.equal(getStpTopology(recovered.devices,lab.links,10).forwardingLinks.has(aToB.id),true)
  const afterFailure=run(recovered.devices,lab.links,[...recovered.packets,createPingPacket(learnedSource,recovered.devices,lab.links,learnedTarget.ports[0].ipAddress!)!],recovered.tick+1)
  assert.equal(afterFailure.replied,true)
  assert.ok(afterFailure.devices.find(d=>d.id==='campus-sw-a')!.macTable.some(entry=>entry.macAddress===learnedTarget.ports[0].macAddress&&entry.linkId===aToB.id))
})
test('STP root election flushes a learned destination when its former path becomes alternate',()=>{
  const lab=createTrainingLab('stp','guided')
  const distributionA=lab.devices.find(d=>d.id==='campus-sw-a')!
  const aToB=lab.links.find(link=>link.id==='campus-link-2')!

  distributionA.config.stpPriorities={'10':24576}
  assert.equal(getStpTopology(lab.devices,lab.links,10).roots.get(distributionA.id),distributionA.id)
  const initial=settleStp(lab.devices,lab.links)
  const source=initial.devices.find(d=>d.id==='campus-pc-a')!,target=initial.devices.find(d=>d.id==='campus-pc-b')!
  const beforeElection=run(initial.devices,lab.links,[...initial.packets,createPingPacket(source,initial.devices,lab.links,target.ports[0].ipAddress!)!],initial.tick+1)
  assert.equal(beforeElection.replied,true)
  const learnedSource=beforeElection.devices.find(d=>d.id===source.id)!
  const learnedTarget=beforeElection.devices.find(d=>d.id===target.id)!
  const learnedA=beforeElection.devices.find(d=>d.id===distributionA.id)!
  assert.ok(learnedA.macTable.some(entry=>entry.macAddress===learnedTarget.ports[0].macAddress&&entry.linkId===aToB.id))

  delete learnedA.config.stpPriorities
  const reconverged=settleStp(beforeElection.devices,lab.links,60,beforeElection.tick)
  assert.equal(getStpTopology(reconverged.devices,lab.links,10).roots.get(distributionA.id),'campus-sw-c')
  assert.equal(getStpTopology(reconverged.devices,lab.links,10).forwardingLinks.has(aToB.id),false)
  const afterElection=run(reconverged.devices,lab.links,[...reconverged.packets,createPingPacket(learnedSource,reconverged.devices,lab.links,learnedTarget.ports[0].ipAddress!)!],reconverged.tick+1)
  assert.equal(afterElection.replied,true)
  assert.ok(afterElection.devices.find(d=>d.id===distributionA.id)!.macTable.some(entry=>entry.macAddress===learnedTarget.ports[0].macAddress&&entry.linkId==='campus-link-3'))
})
test('connected switches exchange BPDUs and elect the advertised root through the packet engine',()=>{
  const lab=createTrainingLab('stp','guided')
  const devicesById=new Map(lab.devices.map(device=>[device.id,device]))
  devicesById.get('campus-sw-a')!.config.stpPriorities={'10':40960}
  devicesById.get('campus-sw-c')!.config.stpPriorities={'10':24576}
  let devices=[...devicesById.values()]
  let packets:InFlightPacket[]=[]
  let deliveredBpdus=0

  const first=stepSimulationTick(devices,lab.links,packets,[],[],1)
  assert.ok(first.newInFlightPackets.some(packet=>String(packet.pdu.protocol)==='STP'))
  assert.equal(getStpTopology(first.updatedDevices,lab.links,10).roots.get('campus-sw-a'),'campus-sw-a')
  devices=first.updatedDevices
  packets=first.newInFlightPackets

  for(let tick=2;tick<=60;tick++){
    const step=stepSimulationTick(devices,lab.links,packets,[],[],tick)
    deliveredBpdus+=step.packetDeliveries.filter(delivery=>delivery.status==='delivered'&&delivery.reason?.includes('STP BPDU')).length
    devices=step.updatedDevices
    packets=step.newInFlightPackets
  }

  assert.ok(deliveredBpdus>0)
  assert.ok(devices.find(device=>device.id==='campus-sw-a')!.stpRuntime?.vlans['10'].neighbors.some(neighbor=>neighbor.senderDeviceId==='campus-sw-c'))
  assert.equal(getStpTopology(devices,lab.links,10).roots.get('campus-sw-a'),'campus-sw-c')
  assert.equal(getStpTopology(devices,lab.links,10).roots.get('campus-sw-b'),'campus-sw-c')
})
test('multilayer switch routes between live VLAN interfaces only when IP routing is enabled',()=>{
  const a=node('pc','a','10.0.10.1'),s=node('switch','s'),b=node('pc','b','10.0.20.1')
  s.model='3560-24PS';s.config.vlans=[{id:10,name:'A'},{id:20,name:'B'}]
  s.ports[0].vlan=10;s.ports[1].vlan=20
  for(const vlan of [10,20])s.ports.push({...createPort(`Vlan${vlan}`,`Vl${vlan}`,'fastethernet','up'),status:'up',virtualVlan:vlan,ipAddress:`10.0.${vlan}.254`,subnetMask:'255.255.255.0'})
  a.config.defaultGateway='10.0.10.254';b.config.defaultGateway='10.0.20.254'
  const devices=[a,s,b],links=[cable(a,0,s,0),cable(s,1,b,0)]
  assert.equal(run(devices,links,createPingPacket(a,devices,links,'10.0.20.1')!).replied,false)
  s.config.ipRouting=true
  const routed=run(devices,links,createPingPacket(a,devices,links,'10.0.20.1')!)
  assert.equal(routed.replied,true)
  assert.ok(routed.devices.find(d=>d.id===s.id)!.macTable.some(entry=>entry.macAddress===b.ports[0].macAddress))
})
test('native VLAN traffic is untagged and a native VLAN mismatch prevents same-VLAN delivery',()=>{
  const a=node('pc','a','10.0.0.1'),s=node('switch','s'),t=node('switch','t'),b=node('pc','b','10.0.0.2')
  s.ports[0].vlan=t.ports[1].vlan=10
  for(const port of [s.ports[1],t.ports[0]]){port.portMode='trunk';port.allowedVlans=[10,20];port.nativeVlan=10}
  const devices=[a,s,t,b],links=[cable(a,0,s,0),cable(s,1,t,0),cable(t,1,b,0)]
  const packet=createPingPacket(a,devices,links,'10.0.0.2')!;packet.progress=.95
  const first=stepSimulationTick(devices,links,[packet])
  assert.equal(first.newInFlightPackets.find(packet=>packet.pdu.protocol!=='STP')?.vlanId,undefined)
  assert.equal(run(devices,links,createPingPacket(a,devices,links,'10.0.0.2')!).replied,true)
  t.ports[0].nativeVlan=20
  assert.equal(run(devices,links,createPingPacket(a,devices,links,'10.0.0.2')!).replied,false)
})
