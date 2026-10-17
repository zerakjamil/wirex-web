import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createDevice} from '@/simulator/deviceFactory'
import {getHardwareProfile,getPhysicalPorts} from '@/simulator/physicalHardware'
import {useNetworkStore} from './networkStore'
import type {DeviceType} from '@/types/network'
import {saveWorkspaceToStorage,restoreWorkspaceFromStorage} from './workspacePersistence'
import {deviceCatalog} from '@/simulator/deviceCatalog'
import {createPingPacket,stepSimulationTick} from '@/simulator/engine'

const types:DeviceType[]=['router','switch','pc','laptop','server','printer','phone','tv','tablet','smartphone','wireless','security','hub','cloud','modem']
test('every device family has a physical view with only real physical interfaces',()=>{
  for(const type of types){
    const device=createDevice(type,0,0)
    assert.ok(getHardwareProfile(device).shape)
    assert.equal(getPhysicalPorts(device).length,device.ports.filter(p=>p.virtualVlan===undefined).length)
  }
})
test('every model in the device shelf has a physical profile with accessible installed bays',()=>{
  for(const group of Object.values(deviceCatalog).flat())for(const model of group.models){
    const device=createDevice(group.type,0,0,model)
    const profile=getHardwareProfile(device)
    assert.ok(profile.shape,model)
    device.modules?.forEach((module,slot)=>{if(module)assert.ok(slot<profile.slots,`${model}: inaccessible bay ${slot}`)})
  }
})
test('powered hardware rejects changes, incompatible cards and occupied or invalid bays',()=>{
  const device=createDevice('laptop',0,0)
  useNetworkStore.setState({devices:[device],links:[]})
  assert.equal(useNetworkStore.getState().installDeviceModule(device.id,0,'WPC300N').success,false)
  useNetworkStore.getState().toggleDevicePower(device.id)
  assert.equal(useNetworkStore.getState().installDeviceModule(device.id,0,'WPC300N').success,false)
  useNetworkStore.getState().removeDeviceModule(device.id,0)
  assert.equal(useNetworkStore.getState().installDeviceModule(device.id,0,'WIC-2T').success,false)
  assert.equal(useNetworkStore.getState().installDeviceModule(device.id,-1,'WPC300N').success,false)
  assert.equal(useNetworkStore.getState().installDeviceModule(device.id,5,'WPC300N').success,false)
})
test('multiport cards create all interfaces and removing one bay preserves another bay and fixed ports',()=>{
  const device=createDevice('router',0,0,'PT-Empty')
  useNetworkStore.setState({devices:[device],links:[]})
  useNetworkStore.getState().toggleDevicePower(device.id)
  assert.equal(useNetworkStore.getState().installDeviceModule(device.id,0,'WIC-2T').success,true)
  assert.equal(useNetworkStore.getState().installDeviceModule(device.id,1,'HWIC-4ESW').success,true)
  const installed=useNetworkStore.getState().devices[0]
  assert.equal(installed.ports.filter(p=>p.moduleSlot===0).length,2)
  assert.equal(installed.ports.filter(p=>p.moduleSlot===1).length,4)
  assert.equal(new Set(installed.ports.map(p=>p.id)).size,installed.ports.length)
  useNetworkStore.getState().removeDeviceModule(device.id,0)
  const removed=useNetworkStore.getState().devices[0]
  assert.equal(removed.modules?.[1],'HWIC-4ESW')
  assert.equal(removed.ports.length,4)
})
test('ejecting a connected NIC removes its cable and clears the peer while preserving other devices',()=>{
  const a=createDevice('laptop',0,0),b=createDevice('switch',100,100)
  useNetworkStore.setState({devices:[a,b],links:[]})
  useNetworkStore.getState().connectPorts(a.id,a.ports[0].id,b.id,b.ports[0].id,'straight')
  assert.equal(useNetworkStore.getState().links.length,1)
  useNetworkStore.getState().toggleDevicePower(a.id)
  assert.equal(useNetworkStore.getState().links[0].status,'down')
  useNetworkStore.getState().removeDeviceModule(a.id,0)
  assert.equal(useNetworkStore.getState().links.length,0)
  assert.equal(useNetworkStore.getState().devices[1].ports[0].connectedLinkId,undefined)
})
test('physical power restores carrier without enabling administratively shut interfaces',()=>{
  const a=createDevice('pc',0,0),b=createDevice('switch',100,100)
  b.ports[0].portfast=true
  useNetworkStore.setState({devices:[a,b],links:[]})
  useNetworkStore.getState().connectPorts(a.id,a.ports[0].id,b.id,b.ports[0].id,'straight')
  useNetworkStore.getState().toggleDevicePower(a.id)
  assert.equal(useNetworkStore.getState().links[0].status,'down')
  useNetworkStore.getState().toggleDevicePower(a.id)
  assert.equal(useNetworkStore.getState().links[0].status,'up')
  useNetworkStore.getState().updatePortConfig(a.id,a.ports[0].id,{adminStatus:'down'})
  useNetworkStore.getState().toggleDevicePower(a.id)
  useNetworkStore.getState().toggleDevicePower(a.id)
  assert.equal(useNetworkStore.getState().links[0].status,'down')
})
test('empty chassis start empty and WAN accessories expose the right connector types',()=>{
  assert.equal(createDevice('cloud',0,0,'Cloud-Empty').ports.length,0)
  assert.equal(createDevice('switch',0,0,'PT-Empty').ports.length,0)
  assert.equal(createDevice('modem',0,0,'DSL-Modem').ports[0].type,'phone')
  assert.ok(createDevice('hub',0,0,'Coaxial Splitter').ports.every(p=>p.type==='coaxial'))
})
test('copper cables cannot connect serial or optical adapters and power-off devices have no carrier',()=>{
  const a=createDevice('router',0,0),b=createDevice('router',100,100)
  useNetworkStore.setState({devices:[a,b],links:[]})
  assert.equal(useNetworkStore.getState().connectPorts(a.id,a.ports.find(p=>p.type==='serial')!.id,b.id,b.ports[0].id,'straight'),false)
  a.ports[0].media='fiber';a.ports[0].adminStatus='up';b.ports[0].adminStatus='up'
  assert.equal(useNetworkStore.getState().connectPorts(a.id,a.ports[0].id,b.id,b.ports[0].id,'straight'),false)
  useNetworkStore.getState().toggleDevicePower(a.id)
  assert.equal(useNetworkStore.getState().connectPorts(a.id,a.ports[0].id,b.id,b.ports[0].id,'fiber'),true)
  assert.equal(useNetworkStore.getState().links[0].status,'down')
})
test('removing a server adapter preserves its fixed Ethernet interface',()=>{
  const device=createDevice('server',0,0)
  useNetworkStore.setState({devices:[device],links:[]})
  useNetworkStore.getState().toggleDevicePower(device.id)
  useNetworkStore.getState().removeDeviceModule(device.id,0)
  assert.equal(useNetworkStore.getState().devices[0].ports.length,1)
  assert.equal(useNetworkStore.getState().devices[0].ports[0].name,'FastEthernet0')
})
test('empty modular switches accept copper and fiber adapters',()=>{
  const device=createDevice('switch',0,0,'PT-Empty')
  useNetworkStore.setState({devices:[device],links:[]})
  useNetworkStore.getState().toggleDevicePower(device.id)
  assert.equal(useNetworkStore.getState().installDeviceModule(device.id,0,'PT-SWITCH-NM-1CFE').success,true)
  assert.equal(useNetworkStore.getState().installDeviceModule(device.id,1,'PT-SWITCH-NM-1FGE').success,true)
  assert.equal(useNetworkStore.getState().devices[0].ports[1].media,'fiber')
})
test('hardware bay gaps, interface ownership and powered-off state survive workspace restoration',()=>{
  const device=createDevice('router',0,0,'PT-Empty')
  useNetworkStore.setState({devices:[device],links:[],annotations:[],deviceWindows:[]})
  useNetworkStore.getState().toggleDevicePower(device.id)
  useNetworkStore.getState().installDeviceModule(device.id,2,'HWIC-4ESW')
  const expected=structuredClone(useNetworkStore.getState().devices[0])
  let saved=''
  const storage={getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value}}
  assert.equal(saveWorkspaceToStorage(storage),true)
  useNetworkStore.getState().resetTopology()
  assert.equal(restoreWorkspaceFromStorage(storage),true)
  assert.deepEqual(useNetworkStore.getState().devices[0],expected)
  assert.equal(useNetworkStore.getState().removeDeviceModule(device.id,2).success,true)
  assert.equal(useNetworkStore.getState().devices[0].ports.length,0)
})
test('a replacement NIC carries actual ARP and ping traffic after configuration and reconnection',()=>{
  const source=createDevice('pc',0,0),target=createDevice('pc',100,100)
  useNetworkStore.setState({devices:[source,target],links:[]})
  useNetworkStore.getState().toggleDevicePower(source.id)
  useNetworkStore.getState().removeDeviceModule(source.id,0)
  useNetworkStore.getState().installDeviceModule(source.id,0,'PT-HOST-NM-1CGE')
  useNetworkStore.getState().toggleDevicePower(source.id)
  const adapter=useNetworkStore.getState().devices[0].ports[0]
  useNetworkStore.getState().updatePortConfig(source.id,adapter.id,{ipAddress:'10.0.0.1',subnetMask:'255.255.255.0'})
  useNetworkStore.getState().updatePortConfig(target.id,target.ports[0].id,{ipAddress:'10.0.0.2',subnetMask:'255.255.255.0'})
  assert.equal(useNetworkStore.getState().connectPorts(source.id,adapter.id,target.id,target.ports[0].id,'crossover'),true)
  let {devices}=useNetworkStore.getState()
  const {links}=useNetworkStore.getState()
  const packet=createPingPacket(devices[0],devices,links,'10.0.0.2')
  assert.ok(packet)
  let packets=[packet],received=false
  for(let tick=0;tick<150&&packets.length;tick++){
    const result=stepSimulationTick(devices,links,packets)
    received ||= result.packetDeliveries.some(d=>d.status==='delivered'&&d.receiverDeviceId===source.id&&packets.find(p=>p.id===d.packetId)?.pdu.payload.icmpType==='echo-reply')
    devices=result.updatedDevices;packets=result.newInFlightPackets
  }
  assert.equal(received,true)
})
