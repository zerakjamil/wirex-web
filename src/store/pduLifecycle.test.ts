import test from 'node:test'
import assert from 'node:assert/strict'
import {createDevice} from '@/simulator/deviceFactory'
import {useNetworkStore} from './networkStore'
import {useWorkspaceStore} from './workspaceStore'
import {parseIosCommand} from '@/simulator/ios/ciscoParser'

function fixture(){
  const a=createDevice('pc',0,0),b=createDevice('pc',100,0)
  a.id='source';b.id='target'
  for(const [device,ip] of [[a,'10.0.0.1'],[b,'10.0.0.2']] as const)Object.assign(device.ports[0],{ipAddress:ip,subnetMask:'255.255.255.0',status:'up'})
  useNetworkStore.getState().loadLab([a,b],[])
  useNetworkStore.getState().connectPorts(a.id,a.ports[0].id,b.id,b.ports[0].id,'crossover')
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  useWorkspaceStore.setState({pdus:[],scenario:0,scenarios:[0]})
  return {a,b}
}
test('PDU submission, pause, automatic play and completion show the real echo reply',()=>{
  const {a,b}=fixture()
  useWorkspaceStore.getState().firePdu(a.id,b.id)
  assert.equal(useWorkspaceStore.getState().pdus[0].status,'In Progress')
  const packets=useNetworkStore.getState().inFlightPackets
  useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().inFlightPackets,packets)
  useNetworkStore.getState().setSimulationPlaying(true)
  for(let tick=0;tick<100&&useNetworkStore.getState().inFlightPackets.length;tick++)useNetworkStore.getState().tickSimulation()
  const pdu=useWorkspaceStore.getState().pdus[0]
  assert.equal(pdu.status,'Successful')
  assert.equal(pdu.pdu?.payload.icmpType,'echo-reply')
  assert.equal(pdu.pdu?.sourceIp,'10.0.0.2')
})
test('an unaddressed PDU source opens an actionable error instead of selecting it',()=>{
  const {a}=fixture()
  useNetworkStore.setState(state=>({devices:state.devices.map(d=>d.id===a.id?{...d,ports:d.ports.map(p=>({...p,ipAddress:'0.0.0.0'}))}:d)}))
  useWorkspaceStore.getState().setTool('pdu')
  useWorkspaceStore.getState().selectPduSource(a.id)
  const ws=useWorkspaceStore.getState()
  assert.equal(ws.dialog,'pdu-error')
  assert.equal(ws.pduSource,null)
  assert.equal(ws.pduError?.deviceId,a.id)
  assert.match(ws.pduError?.message??'',/IPv4 address/)
  assert.equal(useNetworkStore.getState().inFlightPackets.length,0)
})
test('an unaddressed destination opens an error without creating a fake PDU',()=>{
  const {a,b}=fixture()
  useNetworkStore.setState(state=>({devices:state.devices.map(d=>d.id===b.id?{...d,ports:d.ports.map(p=>({...p,ipAddress:undefined}))}:d)}))
  useWorkspaceStore.getState().firePdu(a.id,b.id)
  const ws=useWorkspaceStore.getState()
  assert.equal(ws.dialog,'pdu-error')
  assert.equal(ws.pduError?.deviceId,b.id)
  assert.equal(ws.pdus.length,0)
  assert.equal(useNetworkStore.getState().inFlightPackets.length,0)
})
test('removing an in-flight cable reports the real failure on its PDU row',()=>{
  const {a,b}=fixture()
  useWorkspaceStore.getState().firePdu(a.id,b.id)
  useNetworkStore.getState().deleteLink(useNetworkStore.getState().links[0].id)
  useNetworkStore.getState().stepSimulation()
  const pdu=useWorkspaceStore.getState().pdus[0]
  assert.equal(pdu.status,'Failed')
  assert.match(pdu.reason??'',/down|removed/)
})
test('replacing a topology cannot leave its old PDU rows marked In Progress',()=>{
  const {a,b}=fixture()
  useWorkspaceStore.getState().firePdu(a.id,b.id)
  useNetworkStore.getState().resetTopology()
  assert.equal(useWorkspaceStore.getState().pdus[0].status,'Failed')
  assert.match(useWorkspaceStore.getState().pdus[0].reason??'',/topology|cancel/i)
})
test('a local IP ping succeeds without inventing wire traffic, even with no cable',()=>{
  const {a}=fixture()
  useNetworkStore.getState().deleteLink(useNetworkStore.getState().links[0].id)
  const id=useNetworkStore.getState().sendPing(a.id,'10.0.0.1')
  assert.ok(id)
  assert.equal(useNetworkStore.getState().pingResults.find(p=>p.id===id)?.status,'successful')
  assert.equal(useNetworkStore.getState().inFlightPackets.length,0)
})
test('multilayer routing commands toggle live configuration and appear in running config',()=>{
  const sw=createDevice('switch',0,0,'3560-24PS');sw.currentCliMode='config'
  const enabled=parseIosCommand(sw,'ip routing')
  assert.equal(enabled.newDeviceConfig?.ipRouting,true)
  sw.config={...sw.config,...enabled.newDeviceConfig};sw.currentCliMode='priv'
  assert.match(parseIosCommand(sw,'show running-config').output,/\nip routing\n/)
  sw.currentCliMode='config'
  assert.equal(parseIosCommand(sw,'no ip routing').newDeviceConfig?.ipRouting,false)
  const l2=createDevice('switch',0,0,'2960-24TT');l2.currentCliMode='config'
  assert.match(parseIosCommand(l2,'ip routing').output,/Invalid/)
})
test('routing show commands never fabricate learned routes, neighbors or running update timers',()=>{
  const r=createDevice('router',0,0);r.currentCliMode='priv'
  r.config.ripNetworks=['10.0.0.0'];r.config.ospfNetworks=[{network:'10.0.0.0',wildcard:'0.0.0.255',area:0}]
  assert.doesNotMatch(parseIosCommand(r,'show ip route').output,/via 10\.0\.0\.2/)
  assert.doesNotMatch(parseIosCommand(r,'show ip ospf neighbor').output,/FULL\/DR/)
  assert.match(parseIosCommand(r,'show ip ospf neighbor').output,/Neighbor ID/)
  assert.doesNotMatch(parseIosCommand(r,'show ip protocols').output,/next due in 18 seconds/)
})
