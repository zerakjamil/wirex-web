import type { NetworkDevice,NetworkLink,NetworkPort,PacketPdu,StpRuntime,StpVlanRuntime } from '@/types/network'

export const isBridge=(d:NetworkDevice)=>['switch','hub','phone','wireless','cloud','modem'].includes(d.type)
export const carriesVlan=(p:NetworkPort,vlan:number)=>p.portMode==='trunk'?(!p.allowedVlans||p.allowedVlans.includes(vlan)):(p.vlan??1)===vlan
function endpoints(devices:NetworkDevice[],link:NetworkLink){
 const a=devices.find(d=>d.id===link.fromDeviceId),b=devices.find(d=>d.id===link.toDeviceId)
 const ap=a?.ports.find(p=>p.id===link.fromPortId),bp=b?.ports.find(p=>p.id===link.toPortId)
 return a&&b&&ap&&bp?{a,b,ap,bp}:null
}
export function getOperationalChannels(devices:NetworkDevice[],links:NetworkLink[]){
 const groups=new Map<string,NetworkLink[]>()
 for(const link of links){
  const e=endpoints(devices,link);if(!e||link.status!=='up')continue
  const {a,b,ap,bp}=e
  if(a.power===false||b.power===false||ap.adminStatus!=='up'||bp.adminStatus!=='up')continue
  const modes=[ap.channelMode,bp.channelMode]
  const compatible=modes.every(m=>m==='on')||modes.every(m=>m==='active'||m==='passive')&&modes.includes('active')||modes.every(m=>m==='desirable'||m==='auto')&&modes.includes('desirable')
  const legacy=link.isEtherChannel&&!ap.channelGroup&&!bp.channelGroup
  if(!legacy&&(!ap.channelGroup||!bp.channelGroup||!compatible))continue
  if(ap.portMode!==bp.portMode||(ap.vlan??1)!==(bp.vlan??1)||(ap.nativeVlan??1)!==(bp.nativeVlan??1)||JSON.stringify([...(ap.allowedVlans||[])].sort((x,y)=>x-y))!==JSON.stringify([...(bp.allowedVlans||[])].sort((x,y)=>x-y)))continue
  const ends=[`${a.id}:${ap.channelGroup||link.channelLabel||'legacy'}`,`${b.id}:${bp.channelGroup||link.channelLabel||'legacy'}`].sort()
  const signature=`${ends.join('|')}|${ap.portMode}|${ap.vlan??1}|${ap.nativeVlan??1}|${(ap.allowedVlans||[]).join(',')}`
  groups.set(signature,[...(groups.get(signature)||[]),link])
 }
 return [...groups].filter(([,members])=>members.length>=2).map(([id,members])=>({id,links:members}))
}

const STP_HELLO_TICKS=34
export const STP_MAX_AGE_TICKS=Math.ceil(20_000/60)
const STP_FORWARD_DELAY_TICKS=Math.ceil(15_000/60)
const STP_HOLD_TICKS=Math.ceil(1_000/60)
/** Rapid PVST+/MSTP sync window that replaces the two 15-second 802.1D forward delays (models proposal/agreement). */
export const STP_RAPID_SYNC_TICKS=Math.ceil(1_000/60)
const STP_MULTICAST='01:80:c2:00:00:00'
const sameVlanStates=(a:NetworkPort['stpVlanStates'],b:NetworkPort['stpVlanStates'])=>{
 if(a===b)return true
 if(!a||!b)return false
 const keys=Object.keys(a)
 return keys.length===Object.keys(b).length&&keys.every(key=>a[key]?.state===b[key]?.state&&a[key]?.sinceTick===b[key]?.sinceTick)
}
const sameRootInconsistent=(a:NetworkPort['rootInconsistentVlans'],b:NetworkPort['rootInconsistentVlans'])=>{
 if(a===b)return true
 if(!a||!b)return false
 const keys=Object.keys(a)
 return keys.length===Object.keys(b).length&&keys.every(key=>a[key]===b[key])
}
const bridgeId=(device:NetworkDevice,vlan:number)=>`${String(stpPriorityForVlan(device,vlan)).padStart(5,'0')}:${(device.macAddress||device.ports[0]?.macAddress||device.id).replace(/[:.]/g,'').toLowerCase()}:${device.id}`
const portCost=(port:NetworkPort)=>port.stpCost??(port.type==='gigabitethernet'?4:19)
/** Path cost for a VLAN: MST reads the instance-specific cost first, PVST modes read the port cost. */
const vlanPortCost=(device:NetworkDevice,vlan:number,port:NetworkPort)=>{
 if(stpModeOf(device)==='mst'){
  const instance=String(mstInstanceForVlan(device,vlan))
  const cost=port.mstCost?.[instance]
  if(cost!==undefined)return cost
 }
 return portCost(port)
}

/** Whether BPDU Guard is active on a port. An explicit interface value overrides the global edge default. */
export function effectiveBpduGuard(device:NetworkDevice,port:NetworkPort):boolean{
 if(port.bpduGuard!==undefined)return port.bpduGuard
 return !!(device.config.bpduGuardDefault&&(port.portfast||device.config.portfastDefault))
}

/** Whether BPDU Filter is active on a port. An explicit interface value overrides the global edge default. */
export function effectiveBpduFilter(device:NetworkDevice,port:NetworkPort):boolean{
 if(port.bpduFilter!==undefined)return port.bpduFilter
 return !!(device.config.bpduFilterDefault&&(port.portfast||device.config.portfastDefault))
}

/**
 * Root Guard protects a port from a superior BPDU. A superior vector has a lower root bridge ID,
 * or the same root with a lower path cost through this port.
 */
function superiorBpdu(device:NetworkDevice,port:NetworkPort,pdu:PacketPdu):boolean{
 if(pdu.protocol!=='STP')return false
 const {stpVlan:vlan,stpRootBridgeId:rootBridgeId,stpRootPathCost:rootPathCost}=pdu.payload
 if(!Number.isInteger(vlan)||!rootBridgeId||!Number.isInteger(rootPathCost)||rootPathCost!<0)return false
 const current=device.stpRuntime?.vlans[String(vlan)]
 const currentRoot=current?.rootBridgeId??bridgeId(device,vlan!)
 const currentCost=current?.rootPathCost??0
 const order=rootBridgeId.localeCompare(currentRoot)
 if(order!==0)return order<0
 return rootPathCost!+vlanPortCost(device,vlan!,port)<currentCost
}

export type StpIngressGuard='bpdu-guard'|'bpdu-filter'|'root-guard'

/** Classify how an ingress STP BPDU is handled before it reaches the Spanning Tree runtime. */
export function stpIngressGuard(device:NetworkDevice,port:NetworkPort,pdu:PacketPdu):StpIngressGuard|null{
 if(pdu.protocol!=='STP')return null
 if(effectiveBpduFilter(device,port))return 'bpdu-filter'
 if(effectiveBpduGuard(device,port))return 'bpdu-guard'
 if(port.rootGuard&&superiorBpdu(device,port,pdu))return 'root-guard'
 return null
}

/**
 * Apply the ingress guard state change to a device clone. The caller is responsible for dropping
 * the BPDU; this helper only updates port/STP state so it stays independently testable.
 */
export function applyStpIngressGuard(device:NetworkDevice,portId:string,pdu:PacketPdu,tick:number):StpIngressGuard|null{
 const port=device.ports.find(candidate=>candidate.id===portId)
 if(!port)return null
 const guard=stpIngressGuard(device,port,pdu)
 if(!guard)return null
 if(guard==='bpdu-guard'){
  port.adminStatus='down'
  port.status='down'
  port.errDisabled='bpduguard'
  port.stpState='blocking'
  port.stpSinceTick=tick
  port.stpVlanStates=undefined
  port.rootInconsistentVlans=undefined
  if(device.stpRuntime){
   const vlans=Object.fromEntries(Object.entries(device.stpRuntime.vlans).map(([key,runtime])=>[key,{...runtime,neighbors:runtime.neighbors.filter(neighbor=>neighbor.portId!==port.id)}]))
   device.stpRuntime={vlans}
  }
  return guard
 }
 if(guard==='root-guard'){
  const vlan=pdu.payload.stpVlan
  if(!Number.isInteger(vlan))return null
  const key=String(vlan)
  const previous=port.stpVlanStates?.[key]
  port.rootInconsistentVlans={...(port.rootInconsistentVlans??{}),[key]:tick}
  port.stpState='blocking'
  port.stpSinceTick=tick
  port.stpVlanStates={...(port.stpVlanStates??{}),[key]:{state:'blocking',sinceTick:previous?.state==='blocking'?previous.sinceTick??tick:tick}}
  return guard
 }
 return guard
}

export type StpMode='pvst'|'rapid-pvst'|'mst'
export const stpModeOf=(device:NetworkDevice):StpMode=>device.config.stpMode??'pvst'
/** MST instance that carries a VLAN: configured mapping, otherwise the CIST (instance 0). PVST modes always report instance 0. */
export function mstInstanceForVlan(device:NetworkDevice,vlan:number):number{
 if(stpModeOf(device)!=='mst')return 0
 for(const entry of device.config.mstInstances??[])if(entry.vlans.includes(vlan))return entry.instance
 return 0
}
/** Bridge priority for a VLAN: MST reads the instance priority, PVST modes read the per-VLAN priority. */
export function stpPriorityForVlan(device:NetworkDevice,vlan:number):number{
 if(stpModeOf(device)==='mst')return device.config.mstPriorities?.[String(mstInstanceForVlan(device,vlan))]??32768
 return device.config.stpPriorities?.[String(vlan)]??32768
}
/** VLANs mapped to an MST instance; instance 0 receives every VLAN without an explicit mapping. */
export function stpInstanceVlans(device:NetworkDevice,instance:number):number[]{
 const mapped=device.config.mstInstances??[]
 if(instance!==0)return [...(mapped.find(entry=>entry.instance===instance)?.vlans??[])].sort((a,b)=>a-b)
 const taken=new Set(mapped.flatMap(entry=>entry.vlans))
 const remainder:number[]=[]
 for(let vlan=1;vlan<=4094;vlan++)if(!taken.has(vlan))remainder.push(vlan)
 return remainder
}
export function compressVlanRanges(vlans:number[]):string{
 const sorted=[...new Set(vlans)].sort((a,b)=>a-b)
 const parts:string[]=[]
 for(let index=0;index<sorted.length;){
  let end=index
  while(end+1<sorted.length&&sorted[end+1]===sorted[end]+1)end++
  parts.push(end>index?`${sorted[index]}-${sorted[end]}`:`${sorted[index]}`)
  index=end+1
 }
 return parts.join(',')
}
const formatPriorityWithSysId=(priority:number,sysId:number)=>priority+sysId
const stpProtocolLabel=(device:NetworkDevice)=>{const mode=stpModeOf(device);return mode==='mst'?'mstp':mode==='rapid-pvst'?'rstp':'ieee'}

function activeSwitchLink(devices:NetworkDevice[],link:NetworkLink){
 const e=endpoints(devices,link)
 return e&&link.status==='up'&&!['console','usb','octal'].includes(link.type)&&e.a.type==='switch'&&e.b.type==='switch'&&e.a.power!==false&&e.b.power!==false&&e.ap.status==='up'&&e.bp.status==='up'&&e.ap.adminStatus==='up'&&e.bp.adminStatus==='up'?e:null
}

function bridgeVlans(devices:NetworkDevice[]){
 const vlans=new Set<number>([1])
 for(const device of devices)if(device.type==='switch'){
  device.config.vlans?.forEach(vlan=>vlans.add(vlan.id))
  for(const port of device.ports){
   if(port.vlan)vlans.add(port.vlan)
   if(port.nativeVlan)vlans.add(port.nativeVlan)
   port.allowedVlans?.forEach(vlan=>vlans.add(vlan))
  }
 }
 return [...vlans].filter(vlan=>Number.isInteger(vlan)&&vlan>=1&&vlan<=4094).sort((a,b)=>a-b)
}

export interface StpOutbound {
 deviceId:string
 portId:string
 linkId:string
 vlan:number
 pdu:PacketPdu
}

export function hasStpActivity(devices:NetworkDevice[],links:NetworkLink[]){
 return links.some(link=>activeSwitchLink(devices,link)!==null)||devices.some(device=>device.type==='switch'&&(device.ports.some(port=>port.stpState==='listening'||port.stpState==='learning'||Object.values(port.stpVlanStates??{}).some(state=>state.state==='listening'||state.state==='learning'))||Object.values(device.stpRuntime?.vlans??{}).some(vlan=>vlan.neighbors.length>0)))
}

export function advanceStpPortStates(devices:NetworkDevice[],links:NetworkLink[],tick:number){
 const indexes=new Map(devices.map((device,index)=>[device.id,index]));let nextDevices=devices
 const roleCache=new Map<number,ReturnType<typeof getStpTopology>>()
 const knownVlans=bridgeVlans(devices)
 for(const original of devices){
  if(original.type!=='switch'||original.power===false)continue
  let nextPorts=original.ports,portsChanged=false
  for(const port of original.ports){
   const link=links.find(candidate=>candidate.id===port.connectedLinkId)
   const ends=link&&endpoints(devices,link)
   const physicalUp=!!ends&&link!.status!=='down'&&ends.a.power!==false&&ends.b.power!==false&&ends.ap.adminStatus==='up'&&ends.bp.adminStatus==='up'
   if(!physicalUp){
    if(port.rootInconsistentVlans){
     if(nextPorts===original.ports)nextPorts=original.ports.slice()
     nextPorts[nextPorts.indexOf(port)]={...port,rootInconsistentVlans:undefined};portsChanged=true
    }
    continue
   }
   const peerPort=ends!.a.id===original.id?ends!.bp:ends!.ap
   const vlans=knownVlans.filter(vlan=>carriesVlan(port,vlan)&&(!isBridge(ends!.a.id===original.id?ends!.b:ends!.a)||carriesVlan(peerPort,vlan)))
   const previousStates=port.stpVlanStates
   const activeRootInconsistent=port.rootInconsistentVlans?Object.fromEntries(Object.entries(port.rootInconsistentVlans).filter(([,sinceTick])=>tick-sinceTick<STP_MAX_AGE_TICKS)):undefined
   const rootInconsistentChanged=!sameRootInconsistent(activeRootInconsistent,port.rootInconsistentVlans)
   const nextStates:NonNullable<NetworkPort['stpVlanStates']>={}
   const fast=port.portfast||original.config.portfastDefault
   const mode=stpModeOf(original)
   const peerDevice=ends!.a.id===original.id?ends!.b:ends!.a
   const rapidLink=(mode==='rapid-pvst'||mode==='mst')&&(port.stpLinkType?port.stpLinkType==='point-to-point':peerDevice.type==='switch')
   for(const vlan of vlans){
    if(!roleCache.has(vlan))roleCache.set(vlan,getStpTopology(devices,links,vlan))
    const role=roleCache.get(vlan)!.ports.get(`${original.id}|${port.id}`)?.role
    if(activeRootInconsistent?.[String(vlan)]!==undefined){
     nextStates[String(vlan)]={state:'blocking',sinceTick:activeRootInconsistent[String(vlan)]}
     continue
    }
    const previous=previousStates?.[String(vlan)]
    let state=previous?.state??(previousStates?'listening':port.stpState)
    if(!state)continue
    let entered=previous?.sinceTick??(previousStates?tick:port.stpSinceTick)
    if(fast){if(state!=='forwarding'){state='forwarding';entered=tick}}
    else if(role==='Altn'){if(state!=='blocking'){state='blocking';entered=tick}}
    else if(rapidLink){
     if(state==='blocking'||state==='listening'){state='learning';entered=tick}
     else if(state==='learning'){
      const started=Number.isInteger(entered)?entered!:tick
      if(tick>=started&&tick-started>=STP_RAPID_SYNC_TICKS){state='forwarding';entered=started+STP_RAPID_SYNC_TICKS}
      else if(entered===undefined)entered=tick
     }
    }
    else if(state==='blocking'){state='listening';entered=tick}
    else if(state==='listening'||state==='learning'){
     const started=Number.isInteger(entered)?entered!:tick
     if(tick>=started&&tick-started>=STP_FORWARD_DELAY_TICKS){state=state==='listening'?'learning':'forwarding';entered=started+STP_FORWARD_DELAY_TICKS}
     else if(entered===undefined)entered=tick
    }
    nextStates[String(vlan)]={state,sinceTick:entered}
   }
   const states=Object.values(nextStates)
   const aggregateState=states.some(state=>state.state==='blocking')?'blocking':states.some(state=>state.state==='listening')?'listening':states.some(state=>state.state==='learning')?'learning':states.length?'forwarding':undefined
   const aggregateSince=aggregateState?Math.min(...states.filter(state=>state.state===aggregateState).map(state=>state.sinceTick??tick)):undefined
   const nextVlanStates=states.length?nextStates:undefined
   if(aggregateState===port.stpState&&aggregateSince===port.stpSinceTick&&sameVlanStates(nextVlanStates,previousStates)&&!rootInconsistentChanged)continue
   if(nextPorts===original.ports)nextPorts=original.ports.slice()
   nextPorts[nextPorts.indexOf(port)]={...port,stpState:aggregateState,stpSinceTick:aggregateSince,stpVlanStates:nextVlanStates,rootInconsistentVlans:activeRootInconsistent&&Object.keys(activeRootInconsistent).length?activeRootInconsistent:undefined};portsChanged=true
  }
  if(portsChanged){
   if(nextDevices===devices)nextDevices=devices.slice()
   nextDevices[indexes.get(original.id)!]={...original,ports:nextPorts}
  }
 }
 return nextDevices
}

export function prepareStpTick(devices:NetworkDevice[],links:NetworkLink[],tick:number):{devices:NetworkDevice[];outbound:StpOutbound[]}{
 const vlans=bridgeVlans(devices)
 const activeLinks=links.filter(link=>activeSwitchLink(devices,link))
 const redundantMembers=new Set(getOperationalChannels(devices,activeLinks).flatMap(channel=>channel.links.slice(1).map(link=>link.id)))
 const stpLinks=activeLinks.filter(link=>!redundantMembers.has(link.id))
 const indexes=new Map(devices.map((device,index)=>[device.id,index]));let nextDevices=devices;const outbound:StpOutbound[]=[]
 for(const original of devices){
  if(original.type!=='switch'||original.power===false)continue
  const hasCurrentPeer=stpLinks.some(link=>link.fromDeviceId===original.id||link.toDeviceId===original.id)
  const hasPreviousPeer=Object.values(original.stpRuntime?.vlans??{}).some(vlan=>vlan.neighbors.length>0)
  if(!hasCurrentPeer&&!hasPreviousPeer)continue
  const currentRuntime:StpRuntime=original.stpRuntime??{vlans:{}},nextVlans={...currentRuntime.vlans}
  let runtimeChanged=!original.stpRuntime
  for(const vlan of vlans){
   const key=String(vlan),previous=nextVlans[key],localId=bridgeId(original,vlan)
   const neighbors=(previous?.neighbors??[]).filter(neighbor=>{
    const link=links.find(candidate=>candidate.id===neighbor.linkId),ends=link&&activeSwitchLink(devices,link)
    const advertisedRoot=devices.find(device=>device.id===neighbor.rootDeviceId)
    const age=tick-neighbor.lastReceivedTick
    return age>=0&&age<STP_MAX_AGE_TICKS&&!!ends&&carriesVlan(ends.ap, vlan)&&carriesVlan(ends.bp,vlan)&&
     (ends.a.id===original.id?ends.ap.id:ends.bp.id)===neighbor.portId&&
     (ends.a.id===original.id?ends.b.id:ends.a.id)===neighbor.senderDeviceId&&
     advertisedRoot?.type==='switch'&&advertisedRoot.power!==false&&bridgeId(advertisedRoot,vlan)===neighbor.rootBridgeId
   })
   const choices=neighbors.map(neighbor=>{
    const port=original.ports.find(candidate=>candidate.id===neighbor.portId)!
    const link=links.find(candidate=>candidate.id===neighbor.linkId)
    const senderPortId=link?(link.fromDeviceId===neighbor.senderDeviceId?link.fromPortId:link.toPortId):''
    return {...neighbor,cost:neighbor.rootPathCost+vlanPortCost(original,vlan,port),senderPortId}
   }).filter(candidate=>Number.isFinite(candidate.cost))
   choices.sort((a,b)=>a.rootBridgeId.localeCompare(b.rootBridgeId)||a.cost-b.cost||a.bridgeId.localeCompare(b.bridgeId)||a.senderPortId.localeCompare(b.senderPortId,undefined,{numeric:true})||a.portId.localeCompare(b.portId,undefined,{numeric:true}))
   const best=choices[0]
   const localWins=!best||localId.localeCompare(best.rootBridgeId)<=0
   const state:StpVlanRuntime={
    rootBridgeId:localWins?localId:best!.rootBridgeId,
    rootDeviceId:localWins?original.id:best!.rootDeviceId,
    rootPathCost:localWins?0:best!.cost,
    rootPortId:localWins?undefined:best!.portId,
    neighbors,
    lastSent:{...(previous?.lastSent??{})},
   }
   if(previous&&previous.rootBridgeId===state.rootBridgeId&&previous.rootDeviceId===state.rootDeviceId&&previous.rootPathCost===state.rootPathCost&&previous.rootPortId===state.rootPortId&&previous.neighbors.length===state.neighbors.length&&previous.neighbors.every((neighbor,index)=>neighbor.linkId===state.neighbors[index]?.linkId&&neighbor.rootBridgeId===state.neighbors[index]?.rootBridgeId&&neighbor.rootPathCost===state.neighbors[index]?.rootPathCost&&neighbor.bridgeId===state.neighbors[index]?.bridgeId)){
    state.lastSent={...previous.lastSent}
   }else runtimeChanged=true
   const signature=`${state.rootBridgeId}|${state.rootPathCost}|${localId}`
   for(const link of stpLinks){
    const ends=activeSwitchLink(devices,link)!,localPort=ends.a.id===original.id?ends.ap:ends.b.id===original.id?ends.bp:null
    if(!localPort||!carriesVlan(localPort,vlan)||!carriesVlan(ends.a.id===original.id?ends.bp:ends.ap,vlan))continue
    if(effectiveBpduFilter(original,localPort))continue
    const last=state.lastSent[localPort.id],elapsed=last?tick-last.tick:Infinity
    const due=!last||elapsed>=STP_HOLD_TICKS&&(last.signature!==signature||elapsed>=STP_HELLO_TICKS)
    if(!due)continue
    const pdu:PacketPdu={
     id:`stp-${tick}-${original.id}-${localPort.id}-${vlan}`,protocol:'STP',summary:`STP BPDU VLAN ${vlan}: root ${state.rootDeviceId}`,
     sourceMac:localPort.macAddress,destMac:STP_MULTICAST,etherType:'802.3/LLC',sourceIp:'0.0.0.0',destIp:'0.0.0.0',ttl:1,
     payload:{stpVlan:vlan,stpRootBridgeId:state.rootBridgeId,stpRootDeviceId:state.rootDeviceId,stpRootPathCost:state.rootPathCost,stpBridgeId:localId,stpSenderDeviceId:original.id,stpLlcDsap:'0x42',stpLlcSsap:'0x42',stpLlcControl:'0x03'},
     explanation:{layer1:`Outbound switch port: ${localPort.name}.`,layer2:`IEEE 802.1D configuration BPDU sent in an 802.3 LLC frame to ${STP_MULTICAST}.`,layer3:`VLAN ${vlan}: root ${state.rootDeviceId}, advertised path cost ${state.rootPathCost}.`,layer4AndAbove:'N/A (Layer 2 control frame)',deviceDecision:`${original.name} advertises its current spanning-tree root and path cost.`},
    }
    outbound.push({deviceId:original.id,portId:localPort.id,linkId:link.id,vlan,pdu})
    state.lastSent[localPort.id]={signature,tick}
    runtimeChanged=true
   }
   nextVlans[key]=state
  }
  if(runtimeChanged||!original.stpRuntime){
   const index=indexes.get(original.id)!
   if(nextDevices===devices)nextDevices=devices.slice()
   nextDevices[index]={...original,stpRuntime:{vlans:nextVlans}}
  }
 }
 return {devices:nextDevices,outbound}
}

export function receiveStpBpdu(device:NetworkDevice,portId:string,linkId:string,senderDeviceId:string,pdu:PacketPdu,tick=0){
 const {stpVlan:vlan,stpRootBridgeId:rootBridgeId,stpRootDeviceId:rootDeviceId,stpRootPathCost:rootPathCost,stpBridgeId:bridgeId}=pdu.payload
 if(device.type!=='switch'||pdu.protocol!=='STP'||!Number.isInteger(vlan)||vlan!<1||vlan!>4094||!rootBridgeId||!rootDeviceId||!bridgeId||!Number.isInteger(rootPathCost)||rootPathCost!<0)return false
 const port=device.ports.find(candidate=>candidate.id===portId)
 if(!port)return false
 const current=device.stpRuntime??{vlans:{}},key=String(vlan),previous=current.vlans[key]??{rootBridgeId:bridgeId,rootDeviceId:senderDeviceId,rootPathCost:0,neighbors:[],lastSent:{}}
 const neighbor={portId,linkId,senderDeviceId,rootBridgeId,rootDeviceId,rootPathCost:rootPathCost!,bridgeId,lastReceivedTick:tick}
 const neighbors=[...previous.neighbors.filter(candidate=>candidate.portId!==portId),neighbor]
 const existing=previous.neighbors.find(candidate=>candidate.portId===portId)
 if(existing&&existing.linkId===linkId&&existing.senderDeviceId===senderDeviceId&&existing.rootBridgeId===rootBridgeId&&existing.rootDeviceId===rootDeviceId&&existing.rootPathCost===rootPathCost&&existing.bridgeId===bridgeId&&existing.lastReceivedTick===tick)return true
 device.stpRuntime={vlans:{...current.vlans,[key]:{...previous,neighbors}}}
 return true
}
export function getStpTopology(devices:NetworkDevice[],links:NetworkLink[],vlan:number){
 const roots=new Map<string,string>(),ports=new Map<string,{role:'Root'|'Desg'|'Altn';state:'FWD'|'BLK'|'LIS'|'LRN';cost:number}>(),forwardingLinks=new Set<string>()
 const bridges=devices.filter(isBridge),byId=new Map(devices.map(d=>[d.id,d])),linksById=new Map(links.map(link=>[link.id,link]))
 const bid=(d:NetworkDevice)=>`${String(stpPriorityForVlan(d,vlan)).padStart(5,'0')}:${(d.macAddress||d.ports[0]?.macAddress||d.id).replace(/[:.]/g,'').toLowerCase()}:${d.id}`
 const cost=(device:NetworkDevice,p:NetworkPort)=>vlanPortCost(device,vlan,p)
 const compareVector=(a:{root:string;cost:number;bridge:string;port:string},b:{root:string;cost:number;bridge:string;port:string})=>a.root.localeCompare(b.root)||a.cost-b.cost||a.bridge.localeCompare(b.bridge)||a.port.localeCompare(b.port,undefined,{numeric:true})
 const portLabel=(device:NetworkDevice,portId:string)=>device.ports.find(port=>port.id===portId)?.name??portId
 const live=links.filter(l=>{
  const e=endpoints(devices,l);return e&&l.status==='up'&&!['console','usb','octal'].includes(l.type)&&e.a.power!==false&&e.b.power!==false&&e.ap.status==='up'&&e.bp.status==='up'&&e.ap.adminStatus==='up'&&e.bp.adminStatus==='up'&&(!isBridge(e.a)||carriesVlan(e.ap,vlan))&&(!isBridge(e.b)||carriesVlan(e.bp,vlan))
 })
 const bundleByLink=new Map(getOperationalChannels(devices,live).flatMap(c=>c.links.map(l=>[l.id,c.id] as const)))
 const edges=new Map<string,NetworkLink[]>()
 for(const link of live){const id=bundleByLink.get(link.id)||link.id;edges.set(id,[...(edges.get(id)||[]),link])}
 const bridgeEdges=[...edges].filter(([,ls])=>isBridge(byId.get(ls[0].fromDeviceId)!)&&isBridge(byId.get(ls[0].toDeviceId)!))
 const remaining=new Set(bridges.map(d=>d.id))
 const costs=new Map<string,number>(),rootEdges=new Map<string,string>()
 while(remaining.size){
  const seed=remaining.values().next().value!,component=new Set([seed]),queue=[seed]
  for(let i=0;i<queue.length;i++)for(const [,ls] of bridgeEdges){const l=ls[0];const peer=l.fromDeviceId===queue[i]?l.toDeviceId:l.toDeviceId===queue[i]?l.fromDeviceId:null;if(peer&&!component.has(peer)){component.add(peer);queue.push(peer)}}
  const root=[...component].sort((a,b)=>bid(byId.get(a)!).localeCompare(bid(byId.get(b)!)))[0]
  for(const id of component){remaining.delete(id);roots.set(id,root);costs.set(id,id===root?0:Infinity)}
  const unsettled=new Set(component)
  while(unsettled.size){
   const current=[...unsettled].sort((a,b)=>costs.get(a)!-costs.get(b)!||bid(byId.get(a)!).localeCompare(bid(byId.get(b)!)))[0];unsettled.delete(current)
   for(const [edge,ls] of bridgeEdges){const l=ls[0],peer=l.fromDeviceId===current?l.toDeviceId:l.toDeviceId===current?l.fromDeviceId:null;if(!peer||!unsettled.has(peer))continue
    const local=byId.get(peer)!.ports.find(p=>p.id===(l.fromDeviceId===peer?l.fromPortId:l.toPortId))!,candidate=costs.get(current)!+cost(byId.get(peer)!,local)
    const old=rootEdges.get(peer),oldLink=old?edges.get(old)![0]:null,oldSender=oldLink?(oldLink.fromDeviceId===peer?oldLink.toDeviceId:oldLink.fromDeviceId):null
    if(candidate<costs.get(peer)!||candidate===costs.get(peer)!&&(!oldSender||bid(byId.get(current)!)<bid(byId.get(oldSender)!)||bid(byId.get(current)!)===bid(byId.get(oldSender)!)&&edge<old!)){costs.set(peer,candidate);rootEdges.set(peer,edge)}
   }
  }
 }
 const effectiveVectors=new Map<string,{rootBridgeId:string;rootDeviceId:string;rootPathCost:number;rootPortId?:string}>(),liveLinkIds=new Set(live.map(link=>link.id))
 for(const device of devices){
  if(device.type!=='switch')continue
  const runtime=device.stpRuntime?.vlans[String(vlan)]
  if(!runtime){
   const ownBridgeId=bid(device),local={rootBridgeId:ownBridgeId,rootDeviceId:device.id,rootPathCost:0}
   effectiveVectors.set(device.id,local);roots.set(device.id,device.id);costs.set(device.id,0)
   continue
  }
  const candidates=runtime.neighbors.flatMap(neighbor=>{
   const link=linksById.get(neighbor.linkId)
   const localPort=device.ports.find(port=>port.id===neighbor.portId)
   const peer=byId.get(neighbor.senderDeviceId)
   const root=byId.get(neighbor.rootDeviceId)
   if(!link||!liveLinkIds.has(link.id)||!localPort||!peer||peer.type!=='switch'||!root||root.type!=='switch'||root.power===false||bid(root)!==neighbor.rootBridgeId)return []
   const localPortId=link.fromDeviceId===device.id?link.fromPortId:link.toDeviceId===device.id?link.toPortId:undefined
   const peerId=link.fromDeviceId===device.id?link.toDeviceId:link.toDeviceId===device.id?link.fromDeviceId:undefined
   if(localPortId!==neighbor.portId||peerId!==peer.id||!Number.isFinite(neighbor.rootPathCost)||neighbor.rootPathCost<0)return []
   return [{
    rootBridgeId:neighbor.rootBridgeId,rootDeviceId:neighbor.rootDeviceId,
    rootPathCost:neighbor.rootPathCost+cost(device,localPort),rootPortId:neighbor.portId,
    bridgeId:neighbor.bridgeId,senderPortId:link.fromDeviceId===peer.id?link.fromPortId:link.toPortId,
    senderPortLabel:portLabel(peer,link.fromDeviceId===peer.id?link.fromPortId:link.toPortId),localPortLabel:portLabel(device,neighbor.portId),
   }]
  }).filter(candidate=>Number.isFinite(candidate.rootPathCost)).sort((a,b)=>a.rootBridgeId.localeCompare(b.rootBridgeId)||a.rootPathCost-b.rootPathCost||a.bridgeId.localeCompare(b.bridgeId)||a.senderPortLabel.localeCompare(b.senderPortLabel,undefined,{numeric:true})||a.localPortLabel.localeCompare(b.localPortLabel,undefined,{numeric:true}))
  const best=candidates[0],ownBridgeId=bid(device),localWins=!best||ownBridgeId.localeCompare(best.rootBridgeId)<=0
  const effective=localWins?{rootBridgeId:ownBridgeId,rootDeviceId:device.id,rootPathCost:0}:best!
  effectiveVectors.set(device.id,effective);roots.set(device.id,effective.rootDeviceId);costs.set(device.id,effective.rootPathCost)
 }
 for(const [edge,ls] of edges){
  const l=ls[0],a=byId.get(l.fromDeviceId)!,b=byId.get(l.toDeviceId)!,both=isBridge(a)&&isBridge(b)
  const designated=!both?a.id:(costs.get(a.id)!<costs.get(b.id)!?a.id:costs.get(a.id)!>costs.get(b.id)!?b.id:bid(a)<bid(b)?a.id:b.id)
  let blocked=false
  for(const member of ls)for(const [id,portId] of [[member.fromDeviceId,member.fromPortId],[member.toDeviceId,member.toPortId]]){
   if(!isBridge(byId.get(id)!))continue
   const device=byId.get(id)!,peer=byId.get(id===member.fromDeviceId?member.toDeviceId:member.fromDeviceId)!,port=device.ports.find(candidate=>candidate.id===portId)!
   const fallbackRole: 'Root' | 'Desg' | 'Altn'=!both||id===designated?'Desg':rootEdges.get(id)===edge?'Root':'Altn'
   const runtime=device.type==='switch'?device.stpRuntime?.vlans[String(vlan)]:undefined
   const effective=effectiveVectors.get(device.id)
   let role=fallbackRole
   if(device.type==='switch'){
    if(peer.type!=='switch')role='Desg'
    else if(!runtime)role='Desg'
    else{
     const groupPortIds=ls.map(link=>link.fromDeviceId===device.id?link.fromPortId:link.toPortId)
     const neighbors=runtime.neighbors.filter(neighbor=>neighbor.senderDeviceId===peer.id&&groupPortIds.includes(neighbor.portId)&&ls.some(link=>link.id===neighbor.linkId)).map(neighbor=>{
      const neighborLink=linksById.get(neighbor.linkId)!
      const senderPortId=neighborLink.fromDeviceId===peer.id?neighborLink.fromPortId:neighborLink.toPortId
      return {neighbor,senderPortId}
     }).sort((left,right)=>compareVector(
      {root:left.neighbor.rootBridgeId,cost:left.neighbor.rootPathCost,bridge:left.neighbor.bridgeId,port:left.senderPortId},
      {root:right.neighbor.rootBridgeId,cost:right.neighbor.rootPathCost,bridge:right.neighbor.bridgeId,port:right.senderPortId},
     ))
     if(effective?.rootPortId&&groupPortIds.includes(effective.rootPortId)&&neighbors.some(entry=>entry.neighbor.portId===effective.rootPortId))role='Root'
     else{
      const learned=neighbors[0]
      if(!learned)role='Desg'
      else{
       const remotePort=portLabel(peer,learned.senderPortId)
       const localVector={root:effective?.rootBridgeId??runtime.rootBridgeId,cost:effective?.rootPathCost??runtime.rootPathCost,bridge:bid(device),port:portLabel(device,portId)}
       const receivedVector={root:learned.neighbor.rootBridgeId,cost:learned.neighbor.rootPathCost,bridge:learned.neighbor.bridgeId,port:remotePort}
       role=compareVector(localVector,receivedVector)<=0?'Desg':'Altn'
      }
     }
    }
   }
   if(port.rootInconsistentVlans?.[String(vlan)]!==undefined)role='Altn'
   const portState=port.stpVlanStates?port.stpVlanStates[String(vlan)]?.state??'listening':port.stpState
   const state=role==='Altn'||portState==='blocking'?'BLK':portState==='listening'?'LIS':portState==='learning'?'LRN':'FWD'
   ports.set(`${id}|${portId}`,{role,state,cost:effective?.rootPathCost??runtime?.rootPathCost??costs.get(id)??0});if(state!=='FWD')blocked=true
  }
  if(!blocked)for(const member of ls)forwardingLinks.add(member.id)
 }
 return {roots,ports,forwardingLinks,costs}
}

export function formatStpVlanView(devices:NetworkDevice[],links:NetworkLink[],deviceId:string,vlan:number){
 const device=devices.find(candidate=>candidate.id===deviceId)
 const tree=getStpTopology(devices,links,vlan),root=devices.find(d=>d.id===tree.roots.get(deviceId))
 if(!device||!root)return '% Spanning tree is available on bridge devices only.'
 const rows=device.ports.flatMap(p=>{const s=tree.ports.get(`${device.id}|${p.id}`);return s?[`${p.shortName.padEnd(17)}${s.role.padEnd(5)}${s.state}  ${vlanPortCost(device,vlan,p)}`]:[]})
 return `VLAN${String(vlan).padStart(4,'0')}\n  Spanning tree enabled protocol ${stpProtocolLabel(device)}\n  Root ID Priority ${formatPriorityWithSysId(stpPriorityForVlan(root,vlan),vlan)}\n          Address ${root.macAddress||root.ports[0]?.macAddress}\n  ${root.id===deviceId?'This bridge is the root':`Root path cost ${tree.costs.get(deviceId)}`}\n  Bridge ID Priority ${formatPriorityWithSysId(stpPriorityForVlan(device,vlan),vlan)}\n\nInterface        Role Sts Cost\n${rows.join('\n')}`
}

export function formatStpInstanceView(devices:NetworkDevice[],links:NetworkLink[],deviceId:string,instance:number){
 const device=devices.find(candidate=>candidate.id===deviceId)
 if(!device)return '% Spanning tree is available on bridge devices only.'
 const instanceVlans=stpInstanceVlans(device,instance)
 const carried=bridgeVlans(devices)
 const vlan=carried.find(candidate=>instanceVlans.includes(candidate))??instanceVlans[0]??1
 const tree=getStpTopology(devices,links,vlan),root=devices.find(d=>d.id===tree.roots.get(deviceId))
 if(!root)return '% Spanning tree is available on bridge devices only.'
 const rows=device.ports.flatMap(p=>{const s=tree.ports.get(`${device.id}|${p.id}`);return s?[`${p.shortName.padEnd(17)}${s.role.padEnd(5)}${s.state}  ${vlanPortCost(device,vlan,p)}`]:[]})
 const rootEntry=device.ports.map(p=>({port:p,state:tree.ports.get(`${device.id}|${p.id}`)})).find(entry=>entry.state?.role==='Root')
 const rootCost=rootEntry?.state?.cost??0
 return `###### MST${instance}        vlans mapped:   ${compressVlanRanges(stpInstanceVlans(device,instance))}\nBridge        address ${root.macAddress||root.ports[0]?.macAddress||'-'}  priority ${formatPriorityWithSysId(stpPriorityForVlan(root,vlan),instance)}\nRoot          address ${device.macAddress||device.ports[0]?.macAddress||'-'}  priority ${formatPriorityWithSysId(stpPriorityForVlan(device,vlan),instance)}\n              cost ${rootCost}\n\nInterface        Role Sts Cost\n${rows.join('\n')}`
}

export function formatMstConfiguration(device:NetworkDevice){
 const instances=new Map<number,number[]>()
 for(const entry of device.config.mstInstances??[])instances.set(entry.instance,[...entry.vlans].sort((a,b)=>a-b))
 instances.set(0,stpInstanceVlans(device,0))
 const keys=[...instances.keys()].sort((a,b)=>a-b)
 const name=device.config.mstName?`[${device.config.mstName}]`:'[]'
 const revision=device.config.mstRevision??0
 const table=keys.map(instance=>`${String(instance).padEnd(10)}${compressVlanRanges(instances.get(instance)!)}`).join('\n')
 return `Name      ${name}\nRevision  ${revision}     Instances configured ${keys.length}\n\nInstance  Vlans mapped\n--------  ---------------------------------------------------------------------\n${table}`
}

export function formatStpSummary(device:NetworkDevice){
 const mode=stpModeOf(device)
 const roots=new Set<string>()
 for(const [key,vlan] of Object.entries(device.stpRuntime?.vlans??{}))if(vlan.rootDeviceId===device.id){
  roots.add(mode==='mst'?`MST${mstInstanceForVlan(device,Number(key))}`:`VLAN${String(key).padStart(4,'0')}`)
 }
 const stateOf=(p:NetworkPort,key:string)=>p.stpVlanStates?.[key]?.state
 const instanceOfVlan=(vlan:number)=>mstInstanceForVlan(device,vlan)
 const units:string[]=[]
 if(mode==='mst'){
  const configured=(device.config.mstInstances??[]).map(entry=>entry.instance)
  const seen=new Set<number>([0,...configured])
  for(const instance of [...seen].sort((a,b)=>a-b))units.push(`MST${instance}`)
 }else{
  const vlans=[...new Set(device.ports.flatMap(p=>Object.keys(p.stpVlanStates??{})).map(Number))].sort((a,b)=>a-b)
  if(!vlans.length&&device.ports.some(p=>p.stpState))vlans.push(1)
  for(const vlan of vlans)units.push(`VLAN${String(vlan).padStart(4,'0')}`)
 }
 const rows=units.map(unit=>{
  const counts={blocking:0,listening:0,learning:0,forwarding:0}
  if(mode==='mst'){
   const instance=Number(unit.slice(3))
   const vlans=[...new Set(device.ports.flatMap(p=>Object.keys(p.stpVlanStates??{})).map(Number))].filter(vlan=>instanceOfVlan(vlan)===instance)
   const vlan=vlans[0]??stpInstanceVlans(device,instance)[0]??1
   for(const p of device.ports){const state=stateOf(p,String(vlan))??(p.stpState&&!p.stpVlanStates?p.stpState:undefined);if(state&&state in counts)counts[state as keyof typeof counts]++}
  }else{
   const vlan=Number(unit.slice(4))
   for(const p of device.ports){const state=stateOf(p,String(vlan))??(!p.stpVlanStates?p.stpState:undefined);if(state&&state in counts)counts[state as keyof typeof counts]++}
  }
  const active=counts.blocking+counts.listening+counts.learning+counts.forwarding
  return `${unit.padEnd(22)}${String(counts.blocking).padStart(8)}${String(counts.listening).padStart(10)}${String(counts.learning).padStart(9)}${String(counts.forwarding).padStart(11)}${String(active).padStart(11)}`
 })
 const blocked=device.ports.flatMap(port=>Object.keys(port.rootInconsistentVlans??{}).map(vlan=>`${port.name} VLAN${vlan}`))
 return `Switch is in ${mode} mode\nRoot bridge for: ${[...roots].sort().join(', ')||'none'}\nPortfast Default             ${device.config.portfastDefault?'is enabled':'is disabled'}\nBPDU Guard Default           ${device.config.bpduGuardDefault?'is enabled':'is disabled'}\nBPDU Filter Default          ${device.config.bpduFilterDefault?'is enabled':'is disabled'}\n${blocked.length?`Root Guard Blocking          ${blocked.join(', ')}\n`:''}\nName                   Blocking Listening Learning Forwarding STP Active\n---------------------- -------- --------- -------- ---------- ----------\n${rows.join('\n')}`
}
