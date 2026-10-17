import type {HsrpGroupConfig,HsrpGroupRuntime,NetworkDevice,NetworkLink,NetworkPort} from '@/types/network'
import {getNetworkAddress,isValidIpv4,ipToNumber,isInSameSubnet} from './protocols/ip'

interface HsrpMember {
  device:NetworkDevice
  port:NetworkPort
  config:HsrpGroupConfig
  key:string
}

function carriesVlan(port:NetworkPort,vlan:number){
  return port.portMode==='trunk'?(!port.allowedVlans||port.allowedVlans.includes(vlan)):(port.vlan??1)===vlan
}

function activeLink(device:NetworkDevice,port:NetworkPort,devices:NetworkDevice[],links:NetworkLink[],vlan:number){
  if(device.power===false||port.adminStatus!=='up'||port.status!=='up')return false
  const physical=port.virtualVlan!==undefined
    ?device.ports.filter(candidate=>candidate.virtualVlan===undefined&&!candidate.parentPortId&&carriesVlan(candidate,vlan))
    :port.parentPortId
      ?device.ports.filter(candidate=>candidate.id===port.parentPortId)
      :[port]
  return physical.some(candidate=>candidate.adminStatus==='up'&&candidate.status==='up'&&links.some(link=>{
    if(link.status!=='up'||![link.fromDeviceId,link.toDeviceId].includes(device.id)||![link.fromPortId,link.toPortId].includes(candidate.id))return false
    const peerId=link.fromDeviceId===device.id?link.toDeviceId:link.fromDeviceId
    const peerPortId=link.fromDeviceId===device.id?link.toPortId:link.fromPortId
    const peer=devices.find(item=>item.id===peerId),peerPort=peer?.ports.find(item=>item.id===peerPortId)
    return peer?.power!==false&&peerPort?.adminStatus==='up'&&peerPort.status==='up'
  }))
}

function memberKey(port:NetworkPort,config:HsrpGroupConfig){
  if(!config.virtualIp||!port.ipAddress||!port.subnetMask||!isValidIpv4(config.virtualIp)||!isInSameSubnet(config.virtualIp,port.ipAddress,port.subnetMask))return undefined
  const vlan=port.virtualVlan??port.dot1qVlan??port.vlan??1
  return `${vlan}|${config.group}|${config.virtualIp}|${getNetworkAddress(config.virtualIp,port.subnetMask)}|${port.subnetMask}`
}

const priority=(member:HsrpMember)=>member.config.priority??100
const electionOrder=(a:HsrpMember,b:HsrpMember)=>priority(b)-priority(a)||ipToNumber(b.port.ipAddress??'0.0.0.0')-ipToNumber(a.port.ipAddress??'0.0.0.0')||a.device.id.localeCompare(b.device.id)

export function hsrpVirtualMac(group:number){
  return `00:00:0c:07:ac:${group.toString(16).padStart(2,'0')}`
}

export function hasHsrpActivity(devices:NetworkDevice[]){
  return devices.some(device=>device.ports.some(port=>port.hsrpGroups?.length))
}

export function activeHsrpGroup(device:NetworkDevice,port:NetworkPort,virtualIp?:string){
  return port.hsrpGroups?.find(group=>group.virtualIp===virtualIp&&port.hsrpRuntime?.[String(group.group)]?.state==='active')
}

export function prepareHsrpTick(devices:NetworkDevice[],links:NetworkLink[],simulationTick:number):NetworkDevice[]{
  const members:HsrpMember[]=[]
  for(const device of devices)for(const port of device.ports)for(const config of port.hsrpGroups??[]){
    const key=memberKey(port,config)
    if(key)members.push({device,port,config,key})
  }
  if(!members.length)return devices
  const groups=new Map<string,HsrpMember[]>()
  for(const member of members)groups.set(member.key,[...(groups.get(member.key)??[]),member])
  const next=new Map<string,Map<string,HsrpGroupRuntime>>()
  const virtualMacsToForget=new Set<string>()
  for(const all of groups.values()){
    const operational=all.filter(member=>activeLink(member.device,member.port,devices,links,member.port.virtualVlan??member.port.dot1qVlan??member.port.vlan??1))
    const priorActiveIds=new Set(all.flatMap(member=>{
      const runtime=member.port.hsrpRuntime?.[String(member.config.group)]
      return runtime?.state==='active'&&runtime.activeDeviceId?[runtime.activeDeviceId]:[]
    }))
    const currentActive=operational.filter(member=>priorActiveIds.has(member.device.id)).sort(electionOrder)[0]
    let winner=currentActive
    if(!winner)winner=[...operational].sort(electionOrder)[0]
    else{
      const contenders=operational.filter(member=>member.device.id!==winner!.device.id&&member.config.preempt&&priority(member)>priority(winner!))
      if(contenders.length)winner=[...contenders].sort(electionOrder)[0]
    }
    const activeDeviceId=winner?.device.id
    const previousActiveIds=new Set(all.flatMap(member=>{
      const activeId=member.port.hsrpRuntime?.[String(member.config.group)]?.activeDeviceId
      return activeId?[activeId]:[]
    }))
    if(activeDeviceId&&previousActiveIds.size&&![...previousActiveIds].includes(activeDeviceId))virtualMacsToForget.add(hsrpVirtualMac(all[0].config.group))
    for(const member of all){
      const keyForPort=`${member.device.id}|${member.port.id}`
      const runtimeMap=next.get(keyForPort)??new Map(Object.entries(member.port.hsrpRuntime??{}))
      const previous=member.port.hsrpRuntime?.[String(member.config.group)]
      const isOperational=operational.includes(member)
      const state:HsrpGroupRuntime['state']=!isOperational?'initial':member===winner?'active':'standby'
      const updated:HsrpGroupRuntime={state,activeDeviceId,activeDeviceName:winner?.device.name,activeIp:winner?.port.ipAddress,lastChangeTick:previous&&(previous.state!==state||previous.activeDeviceId!==activeDeviceId)?simulationTick:previous?.lastChangeTick??simulationTick}
      if(JSON.stringify(previous)!==JSON.stringify(updated))runtimeMap.set(String(member.config.group),updated)
      next.set(keyForPort,runtimeMap)
    }
  }
  let output=devices
  for(let i=0;i<devices.length;i++){
    const device=devices[i]
    let ports:NetworkPort[]|undefined
    for(let j=0;j<device.ports.length;j++){
      const port=device.ports[j],runtime=next.get(`${device.id}|${port.id}`)
      if(!runtime)continue
      const hsrpRuntime=Object.fromEntries(runtime)
      if(JSON.stringify(port.hsrpRuntime??{})===JSON.stringify(hsrpRuntime))continue
      if(!ports)ports=device.ports.map(item=>({...item}))
      ports[j]={...ports[j],hsrpRuntime}
    }
    const filteredMacTable=virtualMacsToForget.size?device.macTable.filter(entry=>!virtualMacsToForget.has(entry.macAddress.toLowerCase())):device.macTable
    const macTable=filteredMacTable.length===device.macTable.length?device.macTable:filteredMacTable
    if(ports||macTable!==device.macTable){if(output===devices)output=[...devices];output[i]={...device,ports:ports??device.ports,macTable}}
  }
  return output
}
