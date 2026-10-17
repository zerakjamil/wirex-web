import assert from 'node:assert/strict'
import test from 'node:test'
import {createDevice} from './deviceFactory'
import {useNetworkStore} from '../store/networkStore'
import {prepareHsrpTick} from './hsrp'
import {getForwardingLinks} from './engine'
import type {DeviceType,NetworkDevice,NetworkLink,NetworkPort} from '../types/network'

function makeDevice(type:DeviceType,id:string,model?:string):NetworkDevice{
  const device=createDevice(type,0,0,model)
  device.id=id;device.name=id;device.power=true
  device.ports.forEach(port=>{port.adminStatus='up';port.status='up'})
  return device
}

function connect(a:NetworkDevice,aPort:NetworkPort,b:NetworkDevice,bPort:NetworkPort):NetworkLink{
  const link:NetworkLink={id:`${a.id}-${aPort.id}-${b.id}-${bPort.id}`,type:'straight',status:'up',fromDeviceId:a.id,fromPortId:aPort.id,toDeviceId:b.id,toPortId:bPort.id}
  Object.assign(aPort,{connectedLinkId:link.id,connectedDeviceId:b.id,connectedPortId:bPort.id})
  Object.assign(bPort,{connectedLinkId:link.id,connectedDeviceId:a.id,connectedPortId:aPort.id})
  return link
}

function ping(sourceId:string,targetIp:string){
  const store=useNetworkStore.getState(),requestId=store.sendPing(sourceId,targetIp)
  assert.ok(requestId,'the client should send an echo through its virtual default gateway')
  for(let tick=0;tick<500&&useNetworkStore.getState().pingResults.find(result=>result.id===requestId)?.status==='pending';tick++)useNetworkStore.getState().stepSimulation()
  return useNetworkStore.getState().pingResults.find(result=>result.id===requestId)
}

test('HSRP virtual gateway answers ARP, forwards packets, fails over, and preempts after recovery',()=>{
  const client=makeDevice('pc','hsrp-client'),server=makeDevice('server','hsrp-server')
  const accessA=makeDevice('switch','hsrp-access-a','2960-24TT'),accessB=makeDevice('switch','hsrp-access-b','2960-24TT')
  const primary=makeDevice('router','hsrp-primary','2811'),standby=makeDevice('router','hsrp-standby','2811')
  Object.assign(client.ports[0],{ipAddress:'10.10.1.10',subnetMask:'255.255.255.0'})
  client.config.defaultGateway='10.10.1.1'
  Object.assign(server.ports[0],{ipAddress:'10.10.2.10',subnetMask:'255.255.255.0'})
  server.config.defaultGateway='10.10.2.1'
  for(const [device,portIndex,ip,group] of [
    [primary,0,'10.10.1.2',{group:1,virtualIp:'10.10.1.1',priority:110,preempt:true}],
    [standby,0,'10.10.1.3',{group:1,virtualIp:'10.10.1.1',priority:100}],
    [primary,1,'10.10.2.2',{group:2,virtualIp:'10.10.2.1',priority:110,preempt:true}],
    [standby,1,'10.10.2.3',{group:2,virtualIp:'10.10.2.1',priority:100}],
  ] as const){
    Object.assign(device.ports[portIndex],{ipAddress:ip,subnetMask:'255.255.255.0',hsrpGroups:[group]})
  }
  const links=[
    connect(client,client.ports[0],accessA,accessA.ports[0]),
    connect(primary,primary.ports[0],accessA,accessA.ports[1]),
    connect(standby,standby.ports[0],accessA,accessA.ports[2]),
    connect(server,server.ports[0],accessB,accessB.ports[0]),
    connect(primary,primary.ports[1],accessB,accessB.ports[1]),
    connect(standby,standby.ports[1],accessB,accessB.ports[2]),
  ]
  useNetworkStore.getState().loadLab([client,server,accessA,accessB,primary,standby],links)
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  const prepared=prepareHsrpTick(useNetworkStore.getState().devices,useNetworkStore.getState().links,1)
  assert.equal(prepared.find(device=>device.id===primary.id)?.ports[0].hsrpRuntime?.['1']?.state,'active',JSON.stringify(useNetworkStore.getState().links))
  for(let tick=0;tick<510;tick++)useNetworkStore.getState().stepSimulation()
  const state=()=>useNetworkStore.getState().devices.find(device=>device.id===primary.id)!.ports[0].hsrpRuntime?.['1']?.state
  assert.equal(state(),'active',JSON.stringify(useNetworkStore.getState().devices.find(device=>device.id===primary.id)?.ports.slice(0,2)))
  assert.equal(useNetworkStore.getState().devices.find(device=>device.id===standby.id)!.ports[0].hsrpRuntime?.['1']?.state,'standby')
  const firstPing=ping(client.id,'10.10.2.10')
  assert.equal(firstPing?.status,'successful',JSON.stringify({firstPing,warning:useNetworkStore.getState().simulationWarning,packets:useNetworkStore.getState().inFlightPackets.map(packet=>packet.pdu.summary)}))
  useNetworkStore.getState().toggleDevicePower(primary.id)
  for(let tick=0;tick<20;tick++)useNetworkStore.getState().stepSimulation()
  assert.equal(useNetworkStore.getState().devices.find(device=>device.id===standby.id)!.ports[0].hsrpRuntime?.['1']?.state,'active')
  const recoveryPing=ping(client.id,'10.10.2.10')
  assert.equal(recoveryPing?.status,'successful',JSON.stringify({recoveryPing,warning:useNetworkStore.getState().simulationWarning,primary:useNetworkStore.getState().devices.find(device=>device.id===primary.id)?.ports.slice(0,2).map(port=>port.hsrpRuntime),standby:useNetworkStore.getState().devices.find(device=>device.id===standby.id)?.ports.slice(0,2).map(port=>port.hsrpRuntime),switchMacs:useNetworkStore.getState().devices.filter(device=>device.type==='switch').map(device=>device.macTable.filter(entry=>entry.macAddress.includes('ac:01')||entry.macAddress.includes('ac:02')))}))
  useNetworkStore.getState().toggleDevicePower(primary.id)
  for(let tick=0;tick<20;tick++)useNetworkStore.getState().stepSimulation()
  assert.equal(state(),'active','the higher-priority router with preempt should reclaim its group after recovery')
  const transitionPing=ping(client.id,'10.10.2.10')
  assert.equal(transitionPing?.status,'failed','traffic should report the temporary STP block while the recovered router-facing links reconverge')
  const primaryLinks=links.filter(link=>link.fromDeviceId===primary.id||link.toDeviceId===primary.id).map(link=>link.id)
  for(let tick=0;tick<520&&!primaryLinks.every(linkId=>getForwardingLinks(useNetworkStore.getState().devices,useNetworkStore.getState().links,1).has(linkId));tick++)useNetworkStore.getState().stepSimulation()
  assert.ok(primaryLinks.every(linkId=>getForwardingLinks(useNetworkStore.getState().devices,useNetworkStore.getState().links,1).has(linkId)),'STP should return recovered router-facing links to forwarding')
  const failbackPing=ping(client.id,'10.10.2.10')
  assert.equal(failbackPing?.status,'successful',JSON.stringify({failbackPing,warning:useNetworkStore.getState().simulationWarning}))
})
