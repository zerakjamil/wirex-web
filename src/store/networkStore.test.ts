import assert from 'node:assert/strict'
import test from 'node:test'
import { useNetworkStore } from './networkStore'
import { createDevice } from '../simulator/deviceFactory'
import { MAX_IN_FLIGHT_PACKETS } from '../simulator/engine'
import { getCcnaEnterpriseLab } from '../simulator/starterLabs'
import { createTrainingLab } from '../simulator/trainingLabs'
import { getOperationalChannels, getStpTopology } from '../simulator/spanningTree'
import type { NetworkLink } from '../types/network'

function loadDirectPair() {
  const a=createDevice('pc',0,0); const b=createDevice('pc',100,0)
  a.id='source'; b.id='destination'
  const aPort=a.ports[0]; const bPort=b.ports[0]
  const link: NetworkLink={id:'lan',type:'straight',status:'up',fromDeviceId:a.id,fromPortId:aPort.id,toDeviceId:b.id,toPortId:bPort.id}
  Object.assign(aPort,{ipAddress:'10.0.0.1',subnetMask:'255.255.255.0',status:'up',connectedLinkId:link.id,connectedDeviceId:b.id,connectedPortId:bPort.id})
  Object.assign(bPort,{ipAddress:'10.0.0.2',subnetMask:'255.255.255.0',status:'up',connectedLinkId:link.id,connectedDeviceId:a.id,connectedPortId:aPort.id})
  useNetworkStore.getState().loadLab([a,b],[link])
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  return {a,b}
}

type EmailTestState = ReturnType<typeof useNetworkStore.getState> & {
  sendEmail: (sourceDeviceId: string, to: string, subject: string, body: string) => string | null
  checkEmail: (sourceDeviceId: string) => string | null
  deleteEmail: (sourceDeviceId: string, messageId: string) => string | null
  emailTransactions: Array<{ requestId: string; status: string; action: string; reason?: string }>
}
const emailState=()=>useNetworkStore.getState() as unknown as EmailTestState

function loadEmailPair(password='mail-secret'){
  const client=createDevice('pc',0,0),server=createDevice('server',100,0,'Server-PT')
  const clientPort=client.ports[0],serverPort=server.ports[0]
  const link:NetworkLink={id:'mail-lan',type:'straight',status:'up',fromDeviceId:client.id,fromPortId:clientPort.id,toDeviceId:server.id,toPortId:serverPort.id}
  Object.assign(clientPort,{ipAddress:'10.20.0.10',subnetMask:'255.255.255.0',status:'up',adminStatus:'up',connectedLinkId:link.id,connectedDeviceId:server.id,connectedPortId:serverPort.id})
  Object.assign(serverPort,{ipAddress:'10.20.0.20',subnetMask:'255.255.255.0',status:'up',adminStatus:'up',connectedLinkId:link.id,connectedDeviceId:client.id,connectedPortId:clientPort.id})
  Object.assign(server.config,{emailService:{domain:'classroom.test',smtpEnabled:true,pop3Enabled:true,users:[{username:'alice',password,mailbox:[]},{username:'bob',password,mailbox:[]}]}})
  Object.assign(client.config,{emailAccount:{displayName:'Alice Student',emailAddress:'alice@classroom.test',incomingServer:'10.20.0.20',outgoingServer:'10.20.0.20',username:'alice',password,inbox:[],sent:[]}})
  useNetworkStore.getState().loadLab([client,server],[link])
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  return {clientId:client.id,serverId:server.id}
}

function loadRoutedEmailLab(){
  const alice=createDevice('pc',0,0),bob=createDevice('pc',200,0),router=createDevice('router',100,100,'2911'),server=createDevice('server',300,100,'Server-PT')
  const routerPorts=router.ports.filter(port=>port.type==='gigabitethernet')
  const links:NetworkLink[]=[]
  const attach=(device:typeof alice,devicePort:typeof alice.ports[number],routerPort:typeof router.ports[number],deviceIp:string,routerIp:string,index:number)=>{
    const linkId=`routed-mail-${index}`
    links.push({id:linkId,type:'straight',status:'up',fromDeviceId:device.id,fromPortId:devicePort.id,toDeviceId:router.id,toPortId:routerPort.id})
    Object.assign(devicePort,{ipAddress:deviceIp,subnetMask:'255.255.255.0',status:'up',adminStatus:'up',connectedLinkId:linkId,connectedDeviceId:router.id,connectedPortId:routerPort.id})
    Object.assign(routerPort,{ipAddress:routerIp,subnetMask:'255.255.255.0',status:'up',adminStatus:'up',connectedLinkId:linkId,connectedDeviceId:device.id,connectedPortId:devicePort.id})
  }
  attach(alice,alice.ports[0],routerPorts[0],'10.10.0.10','10.10.0.1',0)
  attach(bob,bob.ports[0],routerPorts[1],'10.20.0.10','10.20.0.1',1)
  attach(server,server.ports[0],routerPorts[2],'10.30.0.20','10.30.0.1',2)
  alice.config.defaultGateway='10.10.0.1'
  bob.config.defaultGateway='10.20.0.1'
  server.config.defaultGateway='10.30.0.1'
  Object.assign(server.config,{emailService:{domain:'classroom.test',smtpEnabled:true,pop3Enabled:true,users:[{username:'alice',password:'mail-secret',mailbox:[]},{username:'bob',password:'mail-secret',mailbox:[]}]}})
  Object.assign(alice.config,{emailAccount:{displayName:'Alice',emailAddress:'alice@classroom.test',incomingServer:'10.30.0.20',outgoingServer:'10.30.0.20',username:'alice',password:'mail-secret',inbox:[],sent:[]}})
  Object.assign(bob.config,{emailAccount:{displayName:'Bob',emailAddress:'bob@classroom.test',incomingServer:'10.30.0.20',outgoingServer:'10.30.0.20',username:'bob',password:'mail-secret',inbox:[],sent:[]}})
  useNetworkStore.getState().loadLab([alice,bob,router,server],links)
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  return {aliceId:alice.id,bobId:bob.id,serverId:server.id,routerId:router.id}
}

function connectCampusTestPc(lab:ReturnType<typeof getCcnaEnterpriseLab>,switchName:string,id:string,vlan:number,ipAddress:string){
  const sw=lab.devices.find(device=>device.name===switchName)!
  const switchPort=sw.ports.find(port=>!port.connectedLinkId&&(port.type==='fastethernet'||port.type==='gigabitethernet'))!
  const pc=createDevice('pc',0,0)
  pc.id=id;pc.name=id
  Object.assign(pc.ports[0],{ipAddress,subnetMask:'255.255.255.0',status:'up',adminStatus:'up'})
  const link:NetworkLink={id:`test-link-${id}`,type:'straight',status:'up',fromDeviceId:sw.id,fromPortId:switchPort.id,toDeviceId:pc.id,toPortId:pc.ports[0].id}
  Object.assign(switchPort,{portMode:'access',vlan,status:'up',adminStatus:'up',connectedLinkId:link.id,connectedDeviceId:pc.id,connectedPortId:pc.ports[0].id})
  Object.assign(pc.ports[0],{connectedLinkId:link.id,connectedDeviceId:sw.id,connectedPortId:switchPort.id})
  lab.devices.push(pc);lab.links.push(link)
  return pc
}

function runEmailTransaction(requestId:string){
  for(let tick=0;tick<500&&emailState().emailTransactions.find(item=>item.requestId===requestId)?.status==='pending';tick++)emailState().stepSimulation()
  return emailState().emailTransactions.find(item=>item.requestId===requestId)
}

test('repeated send requests cannot exceed the simulation queue limit', () => {
  const {a}=loadDirectPair()
  for(let i=0;i<MAX_IN_FLIGHT_PACKETS+20;i++)useNetworkStore.getState().sendPing(a.id,'10.0.0.2')
  assert.equal(useNetworkStore.getState().inFlightPackets.length,MAX_IN_FLIGHT_PACKETS)
  assert.match(useNetworkStore.getState().simulationWarning || '',/queue is full/)
})

test('Reset Simulation clears traffic and warnings while preserving the configured network', () => {
  const {a}=loadDirectPair()
  useNetworkStore.getState().sendPing(a.id,'10.0.0.2')
  useNetworkStore.setState({simulationWarning:'Test overload'})
  const before=useNetworkStore.getState()
  useNetworkStore.getState().clearSimulation()
  const after=useNetworkStore.getState()
  assert.equal(after.inFlightPackets.length,0)
  assert.equal(after.simulationWarning,null)
  assert.equal(after.devices,before.devices)
  assert.equal(after.links,before.links)
})

test('Reset Simulation clears ephemeral ASA PAT sessions', () => {
  const asa = createDevice('security', 0, 0)
  asa.asaNatTranslations = [
    {
      id: 'xlate-reset', protocol: 'ICMP', sourceInterface: 'inside', destInterface: 'outside',
      originalSourceIp: '192.168.1.10', translatedSourceIp: '203.0.113.1', remoteDestinationIp: '203.0.113.10',
      originalIdentifier: 0, translatedIdentifier: 1, expiresAtMs: Date.now() + 10_000,
    },
    {
      id: 'xlate-reset-udp', protocol: 'UDP', sourceInterface: 'inside', destInterface: 'outside',
      originalSourceIp: '192.168.1.10', translatedSourceIp: '203.0.113.1', remoteDestinationIp: '203.0.113.10',
      originalSourcePort: 53_000, translatedSourcePort: 49_152, remoteDestinationPort: 53, expiresAtMs: Date.now() + 10_000,
    },
    {
      id: 'xlate-reset-tcp', protocol: 'TCP', sourceInterface: 'inside', destInterface: 'outside',
      originalSourceIp: '192.168.1.10', translatedSourceIp: '203.0.113.1', remoteDestinationIp: '203.0.113.10',
      originalSourcePort: 54_000, translatedSourcePort: 49_153, remoteDestinationPort: 80, expiresAtMs: Date.now() + 10_000,
    },
  ]
  useNetworkStore.getState().loadLab([asa], [])
  useNetworkStore.getState().clearSimulation()
  assert.equal(useNetworkStore.getState().devices[0].asaNatTranslations, undefined)
})

test('idle realtime simulation advances connected-switch STP control traffic',()=>{
  const lab=createTrainingLab('stp','guided')
  useNetworkStore.getState().loadLab(lab.devices,lab.links)
  useNetworkStore.setState({simulationMode:'realtime',simulationPlaying:true})
  useNetworkStore.getState().tickSimulation()
  const state=useNetworkStore.getState()
  assert.equal(state.simulationTick,1)
  assert.ok(state.inFlightPackets.some(packet=>packet.pdu.protocol==='STP'))
})

test('converged BPDU roles carry a real PC ping across the active STP tree',()=>{
  const lab=createTrainingLab('stp','guided')
  useNetworkStore.getState().loadLab(lab.devices,lab.links)
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  for(let tick=0;tick<510;tick++)useNetworkStore.getState().stepSimulation()
  const converged=useNetworkStore.getState()
  const tree=getStpTopology(converged.devices,converged.links,10)
  assert.equal([...tree.ports.values()].filter(port=>port.role==='Altn').length,1)
  const source=converged.devices.find(device=>device.id==='campus-pc-a')!
  const requestId=useNetworkStore.getState().sendPing(source.id,'192.168.10.12')
  assert.ok(requestId)
  for(let tick=0;tick<200&&useNetworkStore.getState().pingResults.find(result=>result.id===requestId)?.status==='pending';tick++)useNetworkStore.getState().stepSimulation()
  assert.equal(useNetworkStore.getState().pingResults.find(result=>result.id===requestId)?.status,'successful')
})

test('paused simulation does not advance automatically, but Capture / Forward completes a ping', () => {
  const {a,b}=loadDirectPair()
  useNetworkStore.getState().sendPing(a.id,'10.0.0.2')
  const queued=useNetworkStore.getState().inFlightPackets
  useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().inFlightPackets,queued)
  const replyIds=new Set<string>()
  for(let i=0;i<100 && useNetworkStore.getState().inFlightPackets.length;i++) {
    useNetworkStore.getState().stepSimulation()
    for(const packet of useNetworkStore.getState().inFlightPackets)if(packet.pdu.payload.icmpType==='echo-reply')replyIds.add(packet.pdu.id)
  }
  assert.equal(useNetworkStore.getState().inFlightPackets.length,0)
  assert.equal(replyIds.size,1)
  assert.equal(useNetworkStore.getState().devices.find(d=>d.id===a.id)?.arpTable[0].macAddress,b.ports[0].macAddress)
})

test('an invalid destination is rejected without queuing traffic', () => {
  const {a}=loadDirectPair()
  useNetworkStore.getState().sendPing(a.id,'not-an-ip')
  assert.equal(useNetworkStore.getState().inFlightPackets.length,0)
  assert.match(useNetworkStore.getState().simulationWarning || '',/Could not send ping/)
})

test('the default enterprise topology drains a ping without a packet storm', () => {
  const lab = getCcnaEnterpriseLab()
  for (const device of lab.devices) {
    const linkedPorts=lab.links.flatMap(link=>link.fromDeviceId===device.id?[link.fromPortId]:link.toDeviceId===device.id?[link.toPortId]:[])
    assert.equal(new Set(linkedPorts).size,linkedPorts.length,`${device.name} has a physical port connected to multiple links`)
  }
  useNetworkStore.getState().loadLab(lab.devices, lab.links, lab.annotations)
  useNetworkStore.setState({ simulationMode: 'simulation', simulationPlaying: false })
  for(let tick=0;tick<510;tick++){
    useNetworkStore.getState().stepSimulation()
  }
  const converged=useNetworkStore.getState()
  const switches=converged.devices.filter(device=>device.type==='switch')
  const tree=getStpTopology(converged.devices,converged.links,1)
  assert.equal(getOperationalChannels(converged.devices,converged.links).length,5)
  assert.equal(new Set(switches.map(device=>tree.roots.get(device.id))).size,1,'all enterprise switches should learn one VLAN 1 root')
  assert.equal([...tree.ports.values()].filter(port=>port.role==='Altn').length,4,'both physical members of each redundant EtherChannel should block after BPDU convergence')
  const source = lab.devices.find(device => device.name === 'PC1')!
  useNetworkStore.getState().sendPing(source.id, '192.168.10.11')
  let peak = 0
  const replyIds = new Set<string>()
  for (let tick = 0; tick < 500 && useNetworkStore.getState().inFlightPackets.length; tick++) {
    const packets = useNetworkStore.getState().inFlightPackets
    peak = Math.max(peak, packets.length)
    for (const packet of packets) {
      if (packet.toDeviceId === source.id && packet.pdu.payload.icmpType === 'echo-reply') replyIds.add(packet.pdu.id)
    }
    useNetworkStore.getState().stepSimulation()
  }
  assert.equal(useNetworkStore.getState().inFlightPackets.length, 0)
  assert.equal(replyIds.size, 1)
  assert.ok(peak <= lab.links.length, `Peak queue ${peak} exceeded the topology link count`)
  assert.equal(useNetworkStore.getState().simulationWarning, null)
})

test('enterprise campus VLAN 10 and 20 trunks carry traffic and elect their annotated root switches',()=>{
  const lab=getCcnaEnterpriseLab()
  const deviceByName=(name:string)=>lab.devices.find(device=>device.name===name)!
  const portTo=(deviceName:string,peerName:string)=>{
    const device=deviceByName(deviceName),peer=deviceByName(peerName)
    const link=lab.links.find(candidate=>candidate.fromDeviceId===device.id&&candidate.toDeviceId===peer.id||candidate.toDeviceId===device.id&&candidate.fromDeviceId===peer.id)!
    return device.ports.find(port=>port.id===(link.fromDeviceId===device.id?link.fromPortId:link.toPortId))!
  }
  assert.deepEqual([portTo('Switch3','PC1').portMode,portTo('Switch3','PC1').vlan],['access',10])
  assert.deepEqual([portTo('Switch3','Work Office Server').portMode,portTo('Switch3','Work Office Server').vlan],['access',10])
  assert.deepEqual([portTo('Switch4','PC2').portMode,portTo('Switch4','PC2').vlan],['access',20])
  assert.deepEqual([portTo('Switch4','SysLog Server').portMode,portTo('Switch4','SysLog Server').vlan],['access',20])
  for(const sw of lab.devices.filter(device=>device.type==='switch'))assert.deepEqual(sw.config.vlans?.map(vlan=>vlan.id).sort((a,b)=>a-b),[1,10,20])
  assert.equal(deviceByName('Switch1').config.stpPriorities?.['10'],24576)
  assert.equal(deviceByName('Switch2').config.stpPriorities?.['20'],24576)
  const channels=getOperationalChannels(lab.devices,lab.links)
  assert.equal(channels.length,5)
  for(const channel of channels)for(const link of channel.links)for(const [deviceId,portId] of [[link.fromDeviceId,link.fromPortId],[link.toDeviceId,link.toPortId]]){
    const device=lab.devices.find(candidate=>candidate.id===deviceId)!
    if(device.type!=='switch')continue
    const port=device.ports.find(candidate=>candidate.id===portId)!
    assert.equal(port.portMode,'trunk')
    assert.deepEqual(port.allowedVlans,[1,10,20])
  }

  const remoteVlan10=connectCampusTestPc(lab,'Switch4','VLAN10-remote-test',10,'192.168.10.60')
  const remoteVlan20=connectCampusTestPc(lab,'Switch3','VLAN20-remote-test',20,'192.168.20.60')
  useNetworkStore.getState().loadLab(lab.devices,lab.links,lab.annotations)
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  for(let tick=0;tick<510;tick++)useNetworkStore.getState().stepSimulation()
  const converged=useNetworkStore.getState()
  const vlan10Tree=getStpTopology(converged.devices,converged.links,10)
  const vlan20Tree=getStpTopology(converged.devices,converged.links,20)
  assert.ok(converged.devices.filter(device=>device.type==='switch').every(device=>vlan10Tree.roots.get(device.id)===deviceByName('Switch1').id))
  assert.ok(converged.devices.filter(device=>device.type==='switch').every(device=>vlan20Tree.roots.get(device.id)===deviceByName('Switch2').id))

  for(const [sourceName,targetIp] of [['PC1','192.168.10.60'],['VLAN10-remote-test','192.168.10.50'],['PC2','192.168.20.60'],['VLAN20-remote-test','192.168.20.50']] as const){
    const source=sourceName==='VLAN10-remote-test'?remoteVlan10:sourceName==='VLAN20-remote-test'?remoteVlan20:deviceByName(sourceName)
    const requestId=useNetworkStore.getState().sendPing(source.id,targetIp)
    assert.ok(requestId,`${sourceName} should start a ping on its configured VLAN`)
    for(let tick=0;tick<500&&useNetworkStore.getState().pingResults.find(result=>result.id===requestId)?.status==='pending';tick++)useNetworkStore.getState().stepSimulation()
    assert.equal(useNetworkStore.getState().pingResults.find(result=>result.id===requestId)?.status,'successful',`${sourceName} should reach ${targetIp} across the campus trunk`)
    assert.ok(useNetworkStore.getState().inFlightPackets.length<=lab.links.length,`${sourceName} traffic should remain bounded by active links`)
  }
})

test('enterprise L3 core switches route packets between VLAN 10 and VLAN 20',()=>{
  const lab=getCcnaEnterpriseLab()
  const byName=(name:string)=>lab.devices.find(device=>device.name===name)!
  const switch1=byName('Switch1'),switch2=byName('Switch2')
  assert.equal(switch1.config.ipRouting,true)
  assert.equal(switch2.config.ipRouting,true)
  assert.deepEqual(switch1.ports.filter(port=>port.virtualVlan!==undefined).map(port=>[port.virtualVlan,port.ipAddress]).sort(),[[10,'192.168.10.2'],[20,'192.168.20.3']])
  assert.deepEqual(switch2.ports.filter(port=>port.virtualVlan!==undefined).map(port=>[port.virtualVlan,port.ipAddress]).sort(),[[10,'192.168.10.3'],[20,'192.168.20.2']])
  useNetworkStore.getState().loadLab(lab.devices,lab.links,lab.annotations)
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  for(let tick=0;tick<510;tick++)useNetworkStore.getState().stepSimulation()
  for(const [sourceName,targetIp] of [['PC1','192.168.20.50'],['PC2','192.168.10.50']] as const){
    const requestId=useNetworkStore.getState().sendPing(byName(sourceName).id,targetIp)
    assert.ok(requestId,`${sourceName} should send through its active VLAN gateway`)
    for(let tick=0;tick<500&&useNetworkStore.getState().pingResults.find(result=>result.id===requestId)?.status==='pending';tick++)useNetworkStore.getState().stepSimulation()
    assert.equal(useNetworkStore.getState().pingResults.find(result=>result.id===requestId)?.status,'successful',`${sourceName} should reach ${targetIp} through inter-VLAN routing`)
  }
})

test('enterprise HSRP gateways fail over to the secondary core and preempt back after STP reconvergence',()=>{
  const lab=getCcnaEnterpriseLab(),byName=(name:string)=>lab.devices.find(device=>device.name===name)!
  const primary=byName('Switch1'),secondary=byName('Switch2')
  useNetworkStore.getState().loadLab(lab.devices,lab.links,lab.annotations)
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  const advance=(limit:number)=>{for(let tick=0;tick<limit;tick++)useNetworkStore.getState().stepSimulation()}
  const state=()=>useNetworkStore.getState()
  const group=(deviceId:string,vlan:number)=>state().devices.find(device=>device.id===deviceId)!.ports.find(port=>port.virtualVlan===vlan)!.hsrpRuntime?.[String(vlan)]
  const ping=(targetIp:string)=>{
    const requestId=state().sendPing(byName('PC1').id,targetIp)
    assert.ok(requestId,'PC1 should have a virtual HSRP gateway')
    for(let tick=0;tick<1000&&state().pingResults.find(result=>result.id===requestId)?.status==='pending';tick++)state().stepSimulation()
    return state().pingResults.find(result=>result.id===requestId)
  }
  advance(510)
  assert.equal(group(primary.id,10)?.state,'active')
  assert.equal(group(secondary.id,10)?.state,'standby')
  assert.equal(group(secondary.id,20)?.state,'active')
  assert.equal(ping('192.168.20.50')?.status,'successful')

  state().toggleDevicePower(primary.id)
  advance(520)
  assert.equal(group(secondary.id,10)?.state,'active','the powered-on backup core should take over VLAN 10')
  assert.equal(ping('192.168.20.50')?.status,'successful','the client should route through the active backup gateway after STP reconvergence')

  state().toggleDevicePower(primary.id)
  advance(520)
  assert.equal(group(primary.id,10)?.state,'active','the higher-priority primary should reclaim VLAN 10 when preempt is configured')
  assert.equal(ping('192.168.20.50')?.status,'successful','inter-VLAN traffic should return after the core and STP reconverge')
})

test('enterprise VLAN 20 client receives a real DHCP lease through the core SVI relay',()=>{
  const lab=getCcnaEnterpriseLab()
  const byName=(name:string)=>lab.devices.find(device=>device.name===name)!
  const client=byName('PC2'),core=byName('Switch2'),server=byName('Work Office Server')
  client.ports[0].ipAddress=undefined
  client.ports[0].subnetMask=undefined
  client.config.defaultGateway=undefined
  client.config.dhcpLease=undefined
  const svi20=core.ports.find(port=>port.virtualVlan===20)!
  assert.equal(svi20.helperAddress,'192.168.10.11')
  assert.deepEqual(server.config.dhcpPools?.map(pool=>pool.name),['VLAN10','VLAN20'])
  useNetworkStore.getState().loadLab(lab.devices,lab.links,lab.annotations)
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  for(let tick=0;tick<510;tick++)useNetworkStore.getState().stepSimulation()
  useNetworkStore.getState().requestDhcp(client.id)
  const requestId=useNetworkStore.getState().dhcpTransactions.at(-1)!.requestId
  const phases=new Set<string>()
  for(let tick=0;tick<1000&&useNetworkStore.getState().dhcpTransactions.find(transaction=>transaction.requestId===requestId)?.status==='pending';tick++){
    for(const packet of useNetworkStore.getState().inFlightPackets)if(packet.pdu.protocol==='DHCP')phases.add(packet.pdu.summary)
    useNetworkStore.getState().stepSimulation()
  }
  const transaction=useNetworkStore.getState().dhcpTransactions.find(item=>item.requestId===requestId)
  const leasedClient=useNetworkStore.getState().devices.find(device=>device.id===client.id)!
  assert.equal(transaction?.status,'successful',`${transaction?.reason}\n${[...phases].join('\n')}`)
  assert.equal(leasedClient.ports[0].ipAddress,'192.168.20.4')
  assert.equal(leasedClient.ports[0].subnetMask,'255.255.255.0')
  assert.equal(leasedClient.config.defaultGateway,'192.168.20.1')
  assert.equal(leasedClient.config.dnsServer,'192.168.10.11')
  assert.equal(transaction?.serverDeviceId,server.id)
})

test('enterprise DHCP relay reports an incorrect helper address and identifies the VLAN SVI',()=>{
  const lab=getCcnaEnterpriseLab()
  const byName=(name:string)=>lab.devices.find(device=>device.name===name)!
  const client=byName('PC2'),core=byName('Switch2')
  client.ports[0].ipAddress=undefined
  client.ports[0].subnetMask=undefined
  client.config.defaultGateway=undefined
  client.config.dhcpLease=undefined
  core.ports.find(port=>port.virtualVlan===20)!.helperAddress='192.168.10.99'
  useNetworkStore.getState().loadLab(lab.devices,lab.links,lab.annotations)
  useNetworkStore.setState({simulationMode:'simulation',simulationPlaying:false})
  for(let tick=0;tick<510;tick++)useNetworkStore.getState().stepSimulation()
  useNetworkStore.getState().requestDhcp(client.id)
  const requestId=useNetworkStore.getState().dhcpTransactions.at(-1)!.requestId
  for(let tick=0;tick<1000&&useNetworkStore.getState().dhcpTransactions.find(transaction=>transaction.requestId===requestId)?.status==='pending';tick++)useNetworkStore.getState().stepSimulation()
  const transaction=useNetworkStore.getState().dhcpTransactions.find(item=>item.requestId===requestId)
  assert.equal(transaction?.status,'failed')
  assert.match(transaction?.reason??'',/ip helper-address 192\.168\.10\.99.*active server interface/i)
  assert.equal(useNetworkStore.getState().devices.find(device=>device.id===client.id)?.ports[0].ipAddress,undefined)
})

test('SMTP sends through the packet engine and POP3 retrieves the delivered mailbox',()=>{
  const {clientId,serverId}=loadEmailPair()
  const messageBody=`VLAN 20 is reachable. ${'Verify the trunk allowed list and gateway route. '.repeat(60)}`
  const sendId=emailState().sendEmail(clientId,'bob@classroom.test','Lab results',messageBody)
  assert.ok(sendId)
  const smtpSyn=useNetworkStore.getState().inFlightPackets.flatMap(packet=>[packet.pdu,packet.pdu.pendingPacket]).find(pdu=>pdu?.payload.tcpApplication==='SMTP')
  assert.equal(smtpSyn?.payload.tcpDestinationPort,25)
  const requestChunks = new Map<number, string>()
  for (let tick = 0; tick < 200 && emailState().emailTransactions.find(item => item.requestId === sendId)?.status === 'pending'; tick++) {
    emailState().stepSimulation()
    for (const packet of useNetworkStore.getState().inFlightPackets) {
      for (const pdu of [packet.pdu, packet.pdu.pendingPacket]) {
        if (pdu?.payload.tcpRequestId === sendId && pdu.payload.tcpDataKind === 'request' && pdu.payload.tcpSegmentIndex !== undefined && pdu.payload.tcpDataChunk) {
          requestChunks.set(pdu.payload.tcpSegmentIndex, pdu.payload.tcpDataChunk)
        }
      }
    }
  }
  const sentTransaction = emailState().emailTransactions.find(item => item.requestId === sendId)
  assert.equal(sentTransaction?.status,'successful',sentTransaction?.reason)
  const smtpTranscript = [...requestChunks.entries()].sort(([left], [right]) => left - right).map(([, chunk]) => chunk).join('')
  assert.match(smtpTranscript,/^EHLO wirex\.student\r\nAUTH PLAIN /)
  assert.match(smtpTranscript,/MAIL FROM:<alice@classroom\.test>\r\nRCPT TO:<bob@classroom\.test>\r\nDATA\r\n/)
  assert.match(smtpTranscript,/Subject: Lab results\r\nMessage-ID: <mail-[^@]+@wirex\.local>/)
  assert.match(smtpTranscript,/\r\n\.\r\nQUIT\r\n$/)
  const server=useNetworkStore.getState().devices.find(device=>device.id===serverId)!
  const mailbox=(server.config as typeof server.config & {emailService:{users:Array<{username:string;mailbox:Array<{id:string;from:string;to:string;subject:string;body:string}>}>}}).emailService.users.find(user=>user.username==='bob')!.mailbox
  assert.equal(mailbox.length,1)
  assert.deepEqual([mailbox[0].from,mailbox[0].to,mailbox[0].subject,mailbox[0].body],['alice@classroom.test','bob@classroom.test','Lab results',messageBody])
  let client=useNetworkStore.getState().devices.find(device=>device.id===clientId)!
  let account=(client.config as typeof client.config & {emailAccount:{inbox:Array<{id:string;subject:string;body:string}>;sent:Array<{id:string}>}}).emailAccount
  assert.equal(account.sent.length,1)
  assert.equal(account.sent[0].id,mailbox[0].id)
  Object.assign(client.config,{emailAccount:{displayName:'Bob Student',emailAddress:'bob@classroom.test',incomingServer:'10.20.0.20',outgoingServer:'10.20.0.20',username:'bob',password:'mail-secret',inbox:[],sent:[]}})
  useNetworkStore.setState({devices:useNetworkStore.getState().devices.map(device=>device.id===clientId?client:device)})
  const receiveId=emailState().checkEmail(clientId)
  assert.ok(receiveId)
  const popSyn=useNetworkStore.getState().inFlightPackets.flatMap(packet=>[packet.pdu,packet.pdu.pendingPacket]).find(pdu=>pdu?.payload.tcpApplication==='POP3')
  assert.equal(popSyn?.payload.tcpDestinationPort,110)
  const pop3Requests = new Map<number, { chunk: string; sourcePort?: number; destinationPort?: number; turn?: number }>()
  const pop3Responses = new Map<number, { chunk: string; sourcePort?: number; destinationPort?: number; turn?: number }>()
  const pop3SynSequences = new Set<number>()
  const pop3TurnTicks = new Map<number, { request?: number; response?: number }>()
  const pop3RetransmissionPackets = new Set<string>()
  let pop3Ticks = 0
  for (; pop3Ticks < 200 && emailState().emailTransactions.find(item => item.requestId === receiveId)?.status === 'pending'; pop3Ticks++) {
    emailState().stepSimulation()
    for (const packet of useNetworkStore.getState().inFlightPackets) {
      for (const pdu of [packet.pdu, packet.pdu.pendingPacket]) {
        if (pdu?.payload.tcpRequestId === receiveId && pdu.payload.tcpFlags === 'SYN') pop3SynSequences.add(pdu.payload.tcpSequenceNumber ?? 0)
        if (pdu?.payload.tcpRequestId === receiveId && pdu.payload.emailPop3Phase === 'session' && pdu.payload.tcpDataKind === 'request' && pdu.payload.tcpDataChunk) {
          pop3Requests.set(pdu.payload.tcpSequenceNumber ?? 0, { chunk: pdu.payload.tcpDataChunk, sourcePort: pdu.payload.tcpSourcePort, destinationPort: pdu.payload.tcpDestinationPort, turn: pdu.payload.emailPop3TurnIndex })
          const turn = pdu.payload.emailPop3TurnIndex ?? 0
          pop3TurnTicks.set(turn, { ...pop3TurnTicks.get(turn), request: pop3TurnTicks.get(turn)?.request ?? pop3Ticks })
        }
        if (pdu?.payload.tcpRequestId === receiveId && pdu.payload.emailPop3Phase === 'session' && pdu.payload.tcpDataKind === 'response' && pdu.payload.tcpDataChunk) {
          pop3Responses.set(pdu.payload.tcpSequenceNumber ?? 0, { chunk: pdu.payload.tcpDataChunk, sourcePort: pdu.payload.tcpSourcePort, destinationPort: pdu.payload.tcpDestinationPort, turn: pdu.payload.emailPop3TurnIndex })
          const turn = pdu.payload.emailPop3TurnIndex ?? 0
          pop3TurnTicks.set(turn, { ...pop3TurnTicks.get(turn), response: pop3TurnTicks.get(turn)?.response ?? pop3Ticks })
        }
        if (pdu?.payload.tcpRequestId === receiveId && /TCP retransmission/.test(pdu.summary)) pop3RetransmissionPackets.add(pdu.id)
      }
    }
  }
  const retrievedTransaction = emailState().emailTransactions.find(item => item.requestId === receiveId)
  assert.equal(retrievedTransaction?.status,'successful',retrievedTransaction?.reason)
  assert.ok(pop3Ticks < 80, `POP3 one-message retrieval used ${pop3Ticks} simulation ticks; turns: ${JSON.stringify([...pop3TurnTicks])}; retransmission packets observed: ${pop3RetransmissionPackets.size}`)
  const pop3Transcript = [...pop3Requests.entries()].sort(([left], [right]) => left - right).map(([, packet]) => packet.chunk).join('')
  const pop3ResponseTranscript = [...pop3Responses.entries()].sort(([left], [right]) => left - right).map(([, packet]) => packet.chunk).join('')
  assert.match(pop3Transcript,/^USER bob\r\nPASS mail-secret\r\nSTAT\r\nLIST\r\nUIDL\r\nRETR 1\r\nQUIT\r\n$/)
  assert.match(pop3ResponseTranscript,/^\+OK user accepted\r\n\+OK mailbox locked and ready\r\n\+OK 1 \d+ messages\r\n\+OK scan listing follows\r\n\d+ \d+\r\n\.\r\n\+OK unique-id listing follows\r\n1 [\w-]+\r\n\.\r\n\+OK \d+ octets\r\nFrom:/)
  assert.equal(new Set([...pop3Requests.values()].map(packet => packet.sourcePort)).size,1)
  assert.ok([...pop3Requests.values()].every(packet => packet.destinationPort === 110))
  assert.ok([...pop3Responses.values()].every(packet => packet.sourcePort === 110))
  const orderedRequests=[...pop3Requests.values()].sort((left, right) => (left.turn ?? 0) - (right.turn ?? 0))
  assert.deepEqual(orderedRequests.map(packet => packet.chunk.trim()), ['USER bob','PASS mail-secret','STAT','LIST','UIDL','RETR 1','QUIT'])
  for(let index=1;index<orderedRequests.length;index++)assert.equal(orderedRequests[index]?.turn,(orderedRequests[index-1]?.turn??0)+1)
  assert.equal(pop3SynSequences.size,1)
  assert.equal(new Set([...pop3Responses.values()].map(packet => packet.turn)).size,7)
  const responseSegments=[...pop3Responses.entries()].sort(([left],[right])=>left-right)
  for(let index=1;index<responseSegments.length;index++)assert.equal(responseSegments[index]?.[0],((responseSegments[index-1]?.[0]??0)+new TextEncoder().encode(responseSegments[index-1]?.[1].chunk??'').byteLength)>>>0)
  assert.match(pop3ResponseTranscript,/\+OK goodbye\r\n$/)
  client=useNetworkStore.getState().devices.find(device=>device.id===clientId)!
  account=(client.config as typeof client.config & {emailAccount:{inbox:Array<{id:string;subject:string;body:string}>;sent:Array<{id:string}>}}).emailAccount
  assert.equal(account.inbox.length,1)
  assert.deepEqual([account.inbox[0].subject,account.inbox[0].body],['Lab results',messageBody])
  assert.equal(account.inbox[0].id,mailbox[0].id)
})

test('POP3 deletion removes only the authenticated server copy and preserves the client inbox copy',()=>{
  const {clientId,serverId}=loadEmailPair()
  const sendId=emailState().sendEmail(clientId,'bob@classroom.test','Keep a copy','Local inbox remains after server deletion.')
  assert.ok(sendId)
  const sent=runEmailTransaction(sendId!)
  assert.equal(sent?.status,'successful')
  const messageId=sent?.message?.id
  assert.ok(messageId)
  const bobClient=useNetworkStore.getState().devices.find(device=>device.id===clientId)!
  Object.assign(bobClient.config,{emailAccount:{...(bobClient.config.emailAccount!),displayName:'Bob Student',emailAddress:'bob@classroom.test',username:'bob'}})
  useNetworkStore.setState({devices:useNetworkStore.getState().devices.map(device=>device.id===clientId?bobClient:device)})
  const retrieveId=emailState().checkEmail(clientId)
  assert.ok(retrieveId)
  assert.equal(runEmailTransaction(retrieveId!)?.status,'successful')

  const deleteId=emailState().deleteEmail(clientId,messageId!)
  assert.ok(deleteId)
  const initialPacket=useNetworkStore.getState().inFlightPackets.flatMap(packet=>[packet.pdu,packet.pdu.pendingPacket]).find(pdu=>pdu?.payload.tcpRequestId===deleteId)
  assert.equal(initialPacket?.payload.tcpDestinationPort,110)
  assert.equal(initialPacket?.payload.emailAction,'delete')
  const deleteRequests = new Map<number, { chunk: string; sourcePort?: number; destinationPort?: number; turn?: number }>()
  const deleteSynSequences = new Set<number>()
  for (let tick = 0; tick < 200 && emailState().emailTransactions.find(item => item.requestId === deleteId)?.status === 'pending'; tick++) {
    emailState().stepSimulation()
    for (const packet of useNetworkStore.getState().inFlightPackets) {
      for (const pdu of [packet.pdu, packet.pdu.pendingPacket]) {
        if (pdu?.payload.tcpRequestId === deleteId && pdu.payload.tcpFlags === 'SYN') deleteSynSequences.add(pdu.payload.tcpSequenceNumber ?? 0)
        if (pdu?.payload.tcpRequestId === deleteId && pdu.payload.emailPop3Phase === 'session' && pdu.payload.tcpDataKind === 'request' && pdu.payload.tcpDataChunk) {
          deleteRequests.set(pdu.payload.tcpSequenceNumber ?? 0, { chunk: pdu.payload.tcpDataChunk, sourcePort: pdu.payload.tcpSourcePort, destinationPort: pdu.payload.tcpDestinationPort, turn: pdu.payload.emailPop3TurnIndex })
        }
      }
    }
  }
  const deletionTransaction = emailState().emailTransactions.find(item => item.requestId === deleteId)
  assert.equal(deletionTransaction?.status,'successful',deletionTransaction?.reason)
  const deleteTranscript = [...deleteRequests.entries()].sort(([left], [right]) => left - right).map(([, packet]) => packet.chunk).join('')
  assert.match(deleteTranscript,/^USER bob\r\nPASS mail-secret\r\nSTAT\r\nLIST\r\nUIDL\r\nDELE 1\r\nQUIT\r\n$/)
  assert.equal(new Set([...deleteRequests.values()].map(packet => packet.sourcePort)).size,1)
  assert.ok([...deleteRequests.values()].every(packet => packet.destinationPort === 110))
  const orderedDeleteRequests=[...deleteRequests.values()].sort((left,right)=>(left.turn??0)-(right.turn??0))
  assert.deepEqual(orderedDeleteRequests.map(packet=>packet.chunk.trim()),['USER bob','PASS mail-secret','STAT','LIST','UIDL','DELE 1','QUIT'])
  assert.equal(deleteSynSequences.size,1)

  const server=useNetworkStore.getState().devices.find(device=>device.id===serverId)!
  assert.deepEqual(server.config.emailService?.users.find(user=>user.username==='bob')?.mailbox,[])
  const client=useNetworkStore.getState().devices.find(device=>device.id===clientId)!
  assert.deepEqual(client.config.emailAccount?.inbox.map(message=>message.id),[messageId])
})

test('POP3 deletion rejects an unknown message without changing the server mailbox',()=>{
  const {clientId,serverId}=loadEmailPair()
  const sendId=emailState().sendEmail(clientId,'bob@classroom.test','Keep me','This server copy must survive.')
  assert.ok(sendId)
  assert.equal(runEmailTransaction(sendId!)?.status,'successful')
  const deleteId=emailState().deleteEmail(clientId,'missing-message')
  assert.ok(deleteId)
  assert.equal(runEmailTransaction(deleteId!)?.status,'failed')
  assert.match(runEmailTransaction(deleteId!)?.reason??'',/message.*not found/i)
  const server=useNetworkStore.getState().devices.find(device=>device.id===serverId)!
  assert.equal(server.config.emailService?.users.find(user=>user.username==='bob')?.mailbox.length,1)
})

test('POP3 deletion requires the mailbox password and leaves its server message intact on failure',()=>{
  const {clientId,serverId}=loadEmailPair()
  const sendId=emailState().sendEmail(clientId,'bob@classroom.test','Protected copy','Authentication protects this mailbox.')
  assert.ok(sendId)
  const sent=runEmailTransaction(sendId!)
  assert.equal(sent?.status,'successful')
  const messageId=sent?.message?.id
  assert.ok(messageId)
  const client=useNetworkStore.getState().devices.find(device=>device.id===clientId)!
  Object.assign(client.config,{emailAccount:{...client.config.emailAccount!,username:'bob',emailAddress:'bob@classroom.test',password:'incorrect'}})
  useNetworkStore.setState({devices:useNetworkStore.getState().devices.map(device=>device.id===clientId?client:device)})
  const deleteId=emailState().deleteEmail(clientId,messageId!)
  assert.ok(deleteId)
  const result=runEmailTransaction(deleteId!)
  assert.equal(result?.status,'failed')
  assert.match(result?.reason??'',/authentication/i)
  const server=useNetworkStore.getState().devices.find(device=>device.id===serverId)!
  assert.equal(server.config.emailService?.users.find(user=>user.username==='bob')?.mailbox[0]?.id,messageId)
})

test('SMTP rejects invalid credentials and unknown local recipients without delivering mail',()=>{
  const {clientId,serverId}=loadEmailPair('server-secret')
  const current=useNetworkStore.getState().devices.find(device=>device.id===clientId)!
  Object.assign(current.config,{emailAccount:{...(current.config as typeof current.config & {emailAccount:Record<string,unknown>}).emailAccount,password:'wrong-secret'}})
  useNetworkStore.setState({devices:useNetworkStore.getState().devices.map(device=>device.id===clientId?current:device)})
  const badAuthId=emailState().sendEmail(clientId,'bob@classroom.test','Should fail','No delivery.')
  assert.ok(badAuthId)
  assert.equal(runEmailTransaction(badAuthId!)?.status,'failed')
  assert.match(runEmailTransaction(badAuthId!)?.reason??'',/authentication/i)
  const fixed=useNetworkStore.getState().devices.find(device=>device.id===clientId)!
  Object.assign(fixed.config,{emailAccount:{...(fixed.config as typeof fixed.config & {emailAccount:Record<string,unknown>}).emailAccount,password:'server-secret'}})
  useNetworkStore.setState({devices:useNetworkStore.getState().devices.map(device=>device.id===clientId?fixed:device)})
  const noUserId=emailState().sendEmail(clientId,'missing@classroom.test','Should fail','Unknown recipient.')
  assert.ok(noUserId)
  assert.equal(runEmailTransaction(noUserId!)?.status,'failed')
  assert.match(runEmailTransaction(noUserId!)?.reason??'',/recipient/i)
  const server=useNetworkStore.getState().devices.find(device=>device.id===serverId)!
  const users=(server.config as typeof server.config & {emailService:{users:Array<{mailbox:unknown[]}>}}).emailService.users
  assert.ok(users.every(user=>user.mailbox.length===0))
})

test('POP3 reports a clear service error when the server is disabled',()=>{
  const {clientId,serverId}=loadEmailPair()
  const server=useNetworkStore.getState().devices.find(device=>device.id===serverId)!
  server.config.emailService!.pop3Enabled=false
  useNetworkStore.setState({devices:useNetworkStore.getState().devices.map(device=>device.id===serverId?server:device)})
  const requestId=emailState().checkEmail(clientId)
  assert.ok(requestId)
  const result=runEmailTransaction(requestId!)
  assert.equal(result?.status,'failed')
  assert.match(result?.reason??'',/POP3 service is disabled/i)
})

test('SMTP and POP3 mail transactions cross routed IP subnets',()=>{
  const {aliceId,bobId,serverId}=loadRoutedEmailLab()
  const sendId=emailState().sendEmail(aliceId,'bob@classroom.test','Routed mail','Crossing three routed interfaces works.')
  assert.ok(sendId)
  assert.equal(runEmailTransaction(sendId!)?.status,'successful')
  const server=useNetworkStore.getState().devices.find(device=>device.id===serverId)!
  assert.equal(server.config.emailService?.users.find(user=>user.username==='bob')?.mailbox.length,1)
  const receiveId=emailState().checkEmail(bobId)
  assert.ok(receiveId)
  const receivedMail = runEmailTransaction(receiveId!)
  assert.equal(receivedMail?.status,'successful',receivedMail?.reason)
  const bob=useNetworkStore.getState().devices.find(device=>device.id===bobId)!
  assert.deepEqual(bob.config.emailAccount?.inbox.map(message=>message.subject),['Routed mail'])
  assert.equal(useNetworkStore.getState().simulationWarning,null)
})

test('a routed SMTP ACL denial reaches the mail client as the actual packet failure',()=>{
  const {aliceId,routerId}=loadRoutedEmailLab()
  const router=useNetworkStore.getState().devices.find(device=>device.id===routerId)!
  const outgoing=router.ports.find(port=>port.ipAddress==='10.30.0.1')!
  outgoing.outboundAcl='DENY-SMTP'
  router.config.accessLists=[{id:'DENY-SMTP',type:'extended',rules:[{type:'extended',action:'deny',protocol:'tcp',sourceIp:'0.0.0.0',sourceWildcard:'255.255.255.255',destIp:'0.0.0.0',destWildcard:'255.255.255.255',destPort:25}]}]
  useNetworkStore.setState({devices:useNetworkStore.getState().devices.map(device=>device.id===routerId?router:device)})
  const requestId=emailState().sendEmail(aliceId,'bob@classroom.test','Should be blocked','This should not be delivered.')
  assert.ok(requestId)
  const result=runEmailTransaction(requestId!)
  assert.equal(result?.status,'failed')
  assert.match(result?.reason??'',/ACL DENY-SMTP on GigabitEthernet0\/2/i)
  assert.match(result?.reason??'',/TCP 10\.10\.0\.10 -> 10\.30\.0\.20/i)
})

test('Sniffer store actions persist service and port state and trim captures to the buffer',()=>{
  const sniffer=createDevice('hub',0,0,'Sniffer')
  sniffer.id='sniffer-store'
  sniffer.snifferCaptures=[1,2,3,4,5].map(index=>({id:`capture-${index}`,tick:index,portId:'port-1',portName:'FastEthernet1/0',pdu:{protocol:'ICMP'}})) as never
  useNetworkStore.getState().loadLab([sniffer],[])
  useNetworkStore.getState().setSnifferService('sniffer-store',false)
  useNetworkStore.getState().setSnifferPortEnabled('sniffer-store','port-1',false)
  useNetworkStore.getState().setSnifferBufferSize('sniffer-store',2)
  let stored=useNetworkStore.getState().devices.find(device=>device.id==='sniffer-store')!
  assert.equal(stored.config.snifferServiceEnabled,false)
  assert.deepEqual(stored.config.snifferPorts,{'port-1':false})
  assert.equal(stored.config.snifferBufferSize,2)
  assert.deepEqual(stored.snifferCaptures?.map(capture=>capture.id),['capture-4','capture-5'])
  useNetworkStore.getState().clearSnifferCaptures('sniffer-store')
  stored=useNetworkStore.getState().devices.find(device=>device.id==='sniffer-store')!
  assert.deepEqual(stored.snifferCaptures,[])
})
