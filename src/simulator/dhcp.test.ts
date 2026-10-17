import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createTrainingLab} from './trainingLabs'
import {allocateDhcpLease} from './dhcp'
import {createDevice} from './deviceFactory'
import {createDhcpDiscoverPackets,stepSimulationTick} from './engine'
import type {DeviceType,InFlightPacket,NetworkDevice,NetworkLink} from '../types/network'
import {useNetworkStore} from '../store/networkStore'

function makeDevice(type:DeviceType,id:string,ip?:string):NetworkDevice{
 const device=createDevice(type,0,0)
 device.id=id;device.name=id
 device.ports.forEach((port,index)=>{port.macAddress=`02:00:00:00:${id.charCodeAt(0).toString(16)}:${index.toString(16).padStart(2,'0')}`;port.adminStatus='up';port.status='up'})
 if(ip){device.ports[0].ipAddress=ip;device.ports[0].subnetMask='255.255.255.0'}
 return device
}

function connect(a:NetworkDevice,aIndex:number,b:NetworkDevice,bIndex:number):NetworkLink{
 const aPort=a.ports[aIndex],bPort=b.ports[bIndex]
 const link:NetworkLink={id:`${a.id}-${b.id}`,type:'straight',fromDeviceId:a.id,fromPortId:aPort.id,toDeviceId:b.id,toPortId:bPort.id,status:'up'}
 Object.assign(aPort,{connectedDeviceId:b.id,connectedPortId:bPort.id,connectedLinkId:link.id})
 Object.assign(bPort,{connectedDeviceId:a.id,connectedPortId:aPort.id,connectedLinkId:link.id})
 return link
}

function relayTopology(){
 const client=makeDevice('pc','dhcp-client')
 const router=makeDevice('router','dhcp-router','192.168.1.1')
 const server=makeDevice('server','dhcp-server','10.0.0.50')
 router.ports[1].ipAddress='10.0.0.1';router.ports[1].subnetMask='255.255.255.0'
 router.ports[0].helperAddress='10.0.0.50'
 router.routingTable.push({network:'192.168.1.0',netmask:'255.255.255.0',nextHop:'connected',interfaceName:router.ports[0].name,metric:0,type:'C'})
 router.routingTable.push({network:'10.0.0.0',netmask:'255.255.255.0',nextHop:'connected',interfaceName:router.ports[1].name,metric:0,type:'C'})
 server.config.defaultGateway='10.0.0.1'
 server.config.dhcpPools=[{name:'REMOTE-LAN',network:'192.168.1.0',mask:'255.255.255.0',defaultRouter:'192.168.1.1',dnsServer:'192.168.1.53'}]
 const links=[connect(client,0,router,0),connect(router,1,server,0)]
 return {client,router,server,devices:[client,router,server],links}
}

function localTopology(){
 const client=makeDevice('pc','local-client')
 const sw=makeDevice('switch','local-switch')
 const server=makeDevice('server','local-server','192.168.50.10')
 server.config.dhcpPools=[{name:'STUDENT-LAN',network:'192.168.50.0',mask:'255.255.255.0',defaultRouter:'192.168.50.1',dnsServer:'192.168.50.2',tftpServer:'192.168.50.3'}]
 const links=[connect(client,0,sw,0),connect(server,0,sw,1)]
 return {client,sw,server,devices:[client,sw,server],links}
}

function executeDhcp(devices:NetworkDevice[],links:NetworkLink[],packets:InFlightPacket[]){
 const results:ReturnType<typeof stepSimulationTick>['dhcpResults']=[]
 const trace:string[]=[]
 for(let tick=0;tick<500&&packets.length;tick++){
  trace.push(...packets.map(packet=>packet.pdu.summary))
  const step=stepSimulationTick(devices,links,packets)
  devices=step.updatedDevices;packets=step.newInFlightPackets;results.push(...step.dhcpResults)
 }
 return {devices,packets,results,trace}
}
test('DHCP assigns an unused local address and pool gateway, respecting excluded addresses',()=>{
 const lab=createTrainingLab('tcpip','guided'),router=lab.devices.find(d=>d.id==='campus-router')!,pc=lab.devices.find(d=>d.id==='campus-pc-a')!
 pc.ports[0].ipAddress=undefined
 router.config.dhcpPools=[{name:'SALES',network:'192.168.10.0',mask:'255.255.255.0',defaultRouter:'192.168.10.1',dnsServer:'192.168.10.53'}]
 router.config.excludedDhcpIps=['192.168.10.1 192.168.10.20']
 const result=allocateDhcpLease(lab.devices,lab.links,pc.id)
 assert.equal(result.lease?.ipAddress,'192.168.10.21');assert.equal(result.lease?.gateway,'192.168.10.1')
 assert.equal(pc.ports[0].ipAddress,undefined)
})

test('DHCP host reservations select the matching MAC address and leave other clients on the dynamic pool',()=>{
 const {client,sw,server,devices,links}=localTopology()
 const mac=client.ports[0].macAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()
 server.config.dhcpPools=[
  {name:'LAPTOP-01',network:'192.168.50.0',mask:'255.255.255.0',hostIp:'192.168.50.4',hostMask:'255.255.255.0',hardwareAddress:mac},
  {name:'LAPTOP-02',network:'192.168.50.0',mask:'255.255.255.0',hostIp:'192.168.50.41',hostMask:'255.255.255.0',clientIdentifier:'01020000006300'},
  {name:'STUDENT-LAN',network:'192.168.50.0',mask:'255.255.255.0',defaultRouter:'192.168.50.1',dnsServer:'192.168.50.2',tftpServer:'192.168.50.3'},
 ]
 const discover=createDhcpDiscoverPackets(client,devices,links,'reserved-client')
 assert.equal(discover[0].pdu.payload.dhcpClientIdentifier,`01${mac}`)
 const exchange=executeDhcp(devices,links,discover)
 assert.ok(exchange.results.some(result=>result.requestId==='reserved-client'&&result.status==='successful'&&result.assignedIp==='192.168.50.4'))
 const second=makeDevice('pc','second-client')
 second.ports[0].macAddress='02:00:00:00:63:00'
 const secondLink=connect(second,0,sw,2)
 const secondDevices=[...devices,second],secondLinks=[...links,secondLink]
 const secondDiscover=createDhcpDiscoverPackets(second,secondDevices,secondLinks,'client-id-reservation')
 assert.equal(secondDiscover[0].pdu.payload.dhcpClientIdentifier,'01020000006300')
 const secondExchange=executeDhcp(secondDevices,secondLinks,secondDiscover)
 assert.ok(secondExchange.results.some(result=>result.requestId==='client-id-reservation'&&result.status==='successful'&&result.assignedIp==='192.168.50.41'))
 const other=makeDevice('pc','unreserved-client')
 const thirdLink=connect(other,0,sw,3)
 const dynamic=allocateDhcpLease([...secondDevices,other],[...secondLinks,thirdLink],other.id)
 assert.equal(dynamic.lease?.ipAddress,'192.168.50.5')
})

test('DHCP duplicate manual host reservations fail closed for both matching clients',()=>{
 const {client,sw,server,devices,links}=localTopology()
 const second=makeDevice('pc','second-reserved-client')
 const secondLink=connect(second,0,sw,2)
 const hardwareAddress=(device:NetworkDevice)=>device.ports[0].macAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()
 server.config.dhcpPools=[
  {name:'CLIENT-ONE',network:'192.168.50.0',mask:'255.255.255.0',hostIp:'192.168.50.40',hostMask:'255.255.255.0',hardwareAddress:hardwareAddress(client)},
  {name:'CLIENT-TWO',network:'192.168.50.0',mask:'255.255.255.0',hostIp:'192.168.50.40',hostMask:'255.255.255.0',hardwareAddress:hardwareAddress(second)},
 ]
 const labDevices=[...devices,second],labLinks=[...links,secondLink]
 for(const device of [client,second]){
  const result=allocateDhcpLease(labDevices,labLinks,device.id)
  assert.equal(result.lease,undefined)
  assert.match(result.reason,/reserved host address 192\.168\.50\.40.*assigned to another reservation/)
  assert.equal(device.ports[0].ipAddress,undefined)
 }
})

test('DHCP explains when a client does not match any manual host binding',()=>{
 const {client,server,devices,links}=localTopology()
 server.config.dhcpPools=[{name:'LAPTOP-01',network:'192.168.50.0',mask:'255.255.255.0',hostIp:'192.168.50.40',hostMask:'255.255.255.0',hardwareAddress:'001122334455'}]
 const result=allocateDhcpLease(devices,links,client.id)
 assert.equal(result.lease,undefined)
 assert.match(result.reason,/no manual binding matches local-client/i)
 assert.match(result.reason,/client-identifier.*or hardware-address/i)
})

test('an active server binding reserves its address after the client device is removed',()=>{
 const {client:removedClient,sw,server,devices,links}=localTopology()
 server.config.dhcpBindings=[{ipAddress:'192.168.50.4',clientDeviceId:'removed-client',clientIdentifier:'01020000007700',hardwareAddress:'02:00:00:00:77:00',acquiredAtMs:Date.now(),leaseDurationSeconds:3600,type:'automatic'}]
 const client=makeDevice('pc','replacement-client')
 const link=connect(client,0,sw,2)
 const remainingDevices=[...devices.filter(device=>device.id!==removedClient.id),client]
 const remainingLinks=[...links.filter(item=>item.fromDeviceId!==removedClient.id&&item.toDeviceId!==removedClient.id),link]
 assert.equal(allocateDhcpLease(remainingDevices,remainingLinks,client.id).lease?.ipAddress,'192.168.50.5')
})
test('DHCP cannot cross a trunk that excludes the client VLAN or an unimplemented relay',()=>{
 const lab=createTrainingLab('tcpip','guided'),router=lab.devices.find(d=>d.id==='campus-router')!,pc=lab.devices.find(d=>d.id==='campus-pc-a')!
 router.config.dhcpPools=[{name:'OTHER',network:'192.168.20.0',mask:'255.255.255.0',defaultRouter:'192.168.20.1'}]
 assert.equal(allocateDhcpLease(lab.devices,lab.links,pc.id).lease,undefined)
 lab.devices[0].ports.find(p=>p.shortName==='Gi0/1')!.adminStatus='down'
 assert.equal(allocateDhcpLease(lab.devices,lab.links,pc.id).lease,undefined)
})

test('DHCP Relay forwards requests across router interface configured with helper-address',()=>{
 const lab=createTrainingLab('tcpip','guided')
 const router=lab.devices.find(d=>d.id==='campus-router')!
 const pc=lab.devices.find(d=>d.id==='campus-pc-a')!
 pc.ports[0].ipAddress=undefined
 const server=createDevice('server',600,80,'Server-PT')
 server.id='central-dhcp-server'
 server.ports[0].ipAddress='10.0.0.50'
 server.ports[0].subnetMask='255.255.255.0'
 server.config.dhcpPools=[{name:'REMOTE-SALES',network:'192.168.10.0',mask:'255.255.255.0',defaultRouter:'192.168.10.1',dnsServer:'10.0.0.50'}]
 lab.devices.push(server)
 router.config.dhcpPools=[]
 const routerInPort=router.ports.find(p=>p.ipAddress==='192.168.10.1')!
 routerInPort.helperAddress='10.0.0.50'
 const result=allocateDhcpLease(lab.devices,lab.links,pc.id)
 assert.ok(result.lease)
 assert.equal(result.lease?.ipAddress,'192.168.10.2')
 assert.equal(result.lease?.gateway,'192.168.10.1')
 assert.equal(result.lease?.serverId,server.id)
 assert.ok(result.reason.includes('DHCP Relay'))
})

test('DHCP completes Discover, Offer, Request, and ACK through a configured relay',()=>{
 const {client,devices,links}=relayTopology()
 const packets=createDhcpDiscoverPackets(client,devices,links,'dora-relay')
 assert.equal(packets.length,1)
 assert.equal(packets[0].pdu.protocol,'DHCP')
 assert.equal(packets[0].pdu.payload.dhcpType,'discover')
 const exchange=executeDhcp(devices,links,packets)
 assert.equal(exchange.packets.length,0)
 assert.deepEqual(['discover','offer','request','ack'].every(phase=>exchange.trace.some(summary=>summary.toLowerCase().includes(phase))),true,exchange.trace.join('\n'))
 assert.ok(exchange.results.some(result=>result.requestId==='dora-relay'&&result.status==='successful'&&result.assignedIp==='192.168.1.2'),JSON.stringify(exchange.results))
 assert.equal(client.ports[0].ipAddress,undefined,'the pure packet engine reports an ACK without mutating client configuration')
})

test('DHCP DORA works directly on a shared VLAN without a router or relay',()=>{
 const {client,devices,links}=localTopology()
 const exchange=executeDhcp(devices,links,createDhcpDiscoverPackets(client,devices,links,'dora-local'))
 assert.equal(exchange.packets.length,0)
 assert.ok(exchange.results.some(result=>result.requestId==='dora-local'&&result.status==='successful'&&result.assignedIp==='192.168.50.4'),JSON.stringify(exchange.results))
 assert.ok(exchange.trace.some(summary=>summary.toLowerCase().includes('dhcp offer')))
 assert.ok(exchange.trace.some(summary=>summary.toLowerCase().includes('dhcp request')))
 assert.ok(exchange.trace.some(summary=>summary.toLowerCase().includes('dhcp ack')))
})

test('DHCP relay ACL denial identifies the blocked UDP server port',()=>{
 const {client,router,devices,links}=relayTopology()
 router.ports[0].inboundAcl='block-bootps'
 router.config.accessLists=[{id:'block-bootps',type:'extended',rules:[{type:'extended',action:'deny',protocol:'udp',sourceIp:'any',destIp:'any',destPort:67}]}]
 const exchange=executeDhcp(devices,links,createDhcpDiscoverPackets(client,devices,links,'dora-acl'))
 assert.ok(exchange.results.some(result=>result.requestId==='dora-acl'&&result.status==='failed'&&/inbound ACL block-bootps/.test(result.reason??'')),JSON.stringify(exchange.results))
})

test('DHCP Discover without a server or relay reports a clear failure',()=>{
 const client=makeDevice('pc','isolated-client')
 const router=makeDevice('router','isolated-router','192.168.8.1')
 const links=[connect(client,0,router,0)]
 const result=executeDhcp([client,router],links,createDhcpDiscoverPackets(client,[client,router],links,'dora-no-relay'))
 assert.ok(result.results.some(item=>item.requestId==='dora-no-relay'&&item.status==='failed'&&/helper-address|DHCP pool/i.test(item.reason??'')),JSON.stringify(result.results))
})

test('DHCP client on the wrong VLAN fails with a VLAN and pool diagnosis',()=>{
 const {client,sw,devices,links}=localTopology()
 sw.ports[0].vlan=10
 sw.ports[1].vlan=20
 useNetworkStore.getState().loadLab(devices,links)
 useNetworkStore.setState({simulationMode:'realtime',simulationPlaying:true})
 useNetworkStore.getState().requestDhcp(client.id)
 for(let tick=0;tick<100&&useNetworkStore.getState().inFlightPackets.length;tick++)useNetworkStore.getState().tickSimulation()
 const transaction=useNetworkStore.getState().dhcpTransactions.at(-1)
 assert.equal(transaction?.status,'failed')
 assert.match(transaction?.reason??'',/VLANs, pool network/)
 assert.equal(useNetworkStore.getState().devices.find(device=>device.id===client.id)?.ports[0].ipAddress,undefined)
})

test('DHCP store applies client settings only after ACK arrives',()=>{
 const {client,devices,links}=relayTopology()
 useNetworkStore.getState().loadLab(devices,links)
 const response=useNetworkStore.getState().requestDhcp(client.id)
 assert.match(response,/Discover sent/)
 const requestId=useNetworkStore.getState().dhcpTransactions.at(-1)!.requestId
 assert.equal(useNetworkStore.getState().devices.find(item=>item.id===client.id)?.ports[0].ipAddress,undefined)
 for(let tick=0;tick<500&&useNetworkStore.getState().dhcpTransactions.find(item=>item.requestId===requestId)?.status==='pending';tick++){
  useNetworkStore.getState().tickSimulation()
  const transaction=useNetworkStore.getState().dhcpTransactions.find(item=>item.requestId===requestId)
  const address=useNetworkStore.getState().devices.find(item=>item.id===client.id)?.ports[0].ipAddress
  if(transaction?.status==='pending')assert.equal(address,undefined,'the client must wait for a DHCP ACK before applying the offered address')
 }
 const state=useNetworkStore.getState(),leasedClient=state.devices.find(item=>item.id===client.id)!
 assert.equal(state.dhcpTransactions.find(item=>item.requestId===requestId)?.status,'successful')
 assert.equal(leasedClient.ports[0].ipAddress,'192.168.1.2')
 assert.equal(leasedClient.ports[0].subnetMask,'255.255.255.0')
 assert.equal(leasedClient.config.defaultGateway,'192.168.1.1')
 assert.equal(leasedClient.config.dnsServer,'192.168.1.53')
 assert.equal(leasedClient.config.dhcpLease?.leaseDurationSeconds,86400)
 assert.ok((leasedClient.config.dhcpLease?.acquiredAtMs??0)>0)
 const serverBinding=state.devices.find(item=>item.id==='dhcp-server')?.config.dhcpBindings?.[0]
 assert.deepEqual(serverBinding?.ipAddress,'192.168.1.2')
 assert.equal(serverBinding?.clientDeviceId,client.id)
 assert.equal(serverBinding?.hardwareAddress,client.ports[0].macAddress)
 assert.equal(serverBinding?.clientIdentifier,`01${client.ports[0].macAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()}`)
 assert.equal(serverBinding?.type,'automatic')
 const bindingOutput=useNetworkStore.getState().executeIosCommand('dhcp-server','show ip dhcp binding')
 assert.match(bindingOutput,/192\.168\.1\.2/)
 assert.match(bindingOutput,/86400s/)
 const clearOutput=useNetworkStore.getState().executeIosCommand('dhcp-server','clear ip dhcp binding 192.168.1.2')
 assert.match(clearOutput,/Cleared 1 DHCP binding/)
 assert.equal(useNetworkStore.getState().devices.find(item=>item.id==='dhcp-server')?.config.dhcpBindings?.length,0)
 assert.match(useNetworkStore.getState().executeIosCommand('dhcp-server','show ip dhcp binding'),/No active DHCP bindings/)
})

test('DHCP renews an active lease with a Request packet at T1 and resets its lease clock on ACK',()=>{
 const {client,server,devices,links}=relayTopology()
 server.config.dhcpPools![0].leaseDurationSeconds=60
 useNetworkStore.getState().loadLab(devices,links)
 useNetworkStore.getState().requestDhcp(client.id)
 for(let tick=0;tick<100&&useNetworkStore.getState().dhcpTransactions.at(-1)?.status==='pending';tick++)useNetworkStore.getState().tickSimulation()
 const leased=useNetworkStore.getState().devices.find(device=>device.id===client.id)!
 assert.equal(leased.config.dhcpLease?.leaseDurationSeconds,60)
 const acquiredAtMs=Date.now()-31_000
 useNetworkStore.setState(state=>({devices:state.devices.map(device=>device.id===client.id?{...device,config:{...device.config,dhcpLease:{...device.config.dhcpLease!,acquiredAtMs,state:'bound'}}}:device)}))
 useNetworkStore.getState().tickSimulation()
 const renewal=useNetworkStore.getState().dhcpTransactions.at(-1)!
 assert.equal(renewal.renewalPhase,'renew')
 assert.ok(useNetworkStore.getState().inFlightPackets.some(packet=>packet.pdu.protocol==='DHCP'&&packet.pdu.payload.dhcpRenewalPhase==='renew'))
 for(let tick=0;tick<100&&useNetworkStore.getState().dhcpTransactions.find(transaction=>transaction.requestId===renewal.requestId)?.status==='pending';tick++)useNetworkStore.getState().tickSimulation()
 const renewed=useNetworkStore.getState().devices.find(device=>device.id===client.id)!
 assert.equal(useNetworkStore.getState().dhcpTransactions.find(transaction=>transaction.requestId===renewal.requestId)?.status,'successful')
 assert.equal(renewed.config.dhcpLease?.state,'bound')
 assert.ok((renewed.config.dhcpLease?.acquiredAtMs??0)>acquiredAtMs)
 assert.equal(renewed.config.dhcpLease?.leaseDurationSeconds,60)
})

test('DHCP enters rebinding after T2 and expires the old address before a fresh Discover',()=>{
 const {client,router,server,devices,links}=relayTopology()
 const now=Date.now()
 server.config.dhcpBindings=[{ipAddress:'192.168.1.2',clientDeviceId:client.id,clientIdentifier:`01${client.ports[0].macAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()}`,hardwareAddress:client.ports[0].macAddress,acquiredAtMs:now-53_000,leaseDurationSeconds:60,type:'automatic'}]
 const leasedClient={...client,config:{...client.config,dhcpEnabled:true,dhcpLease:{serverId:'dhcp-server',ipAddress:'192.168.1.2',acquiredAtMs:now-53_000,leaseDurationSeconds:60,state:'renewing' as const,lastRequestAtMs:now-3_000},defaultGateway:'192.168.1.1'},ports:client.ports.map((port,index)=>index===0?{...port,ipAddress:'192.168.1.2',subnetMask:'255.255.255.0'}:port)}
 useNetworkStore.getState().loadLab([leasedClient,...devices.filter(device=>device.id!==client.id),...[]],links)
 useNetworkStore.setState(state=>({devices:state.devices.map(device=>device.id===router.id?{...device,ports:device.ports.map(port=>port.id===router.ports[1].id?{...port,adminStatus:'down' as const}:port)}:device)}))
 useNetworkStore.getState().tickSimulation()
 const rebind=useNetworkStore.getState().dhcpTransactions.at(-1)!
 assert.equal(rebind.renewalPhase,'rebind')
 assert.equal(rebind.status,'pending')
 assert.ok(useNetworkStore.getState().inFlightPackets.some(packet=>packet.pdu.protocol==='DHCP'&&packet.pdu.payload.dhcpRenewalPhase==='rebind'))
 useNetworkStore.setState(state=>({devices:state.devices.map(device=>device.id===client.id?{...device,config:{...device.config,dhcpLease:{...device.config.dhcpLease!,acquiredAtMs:Date.now()-61_000}}}:device.id===server.id?{...device,config:{...device.config,dhcpBindings:device.config.dhcpBindings?.map(binding=>({...binding,acquiredAtMs:Date.now()-61_000}))}}:device)}))
 useNetworkStore.getState().tickSimulation()
 const expired=useNetworkStore.getState().devices.find(device=>device.id===client.id)!
 assert.equal(expired.config.dhcpLease,undefined)
 assert.equal(expired.ports[0].ipAddress,undefined)
 assert.equal(useNetworkStore.getState().devices.find(device=>device.id===server.id)?.config.dhcpBindings?.length,0)
 assert.ok(useNetworkStore.getState().inFlightPackets.some(packet=>packet.pdu.protocol==='DHCP'&&packet.pdu.payload.dhcpType==='discover'))
})

test('DHCP probes an ACK address and rejects it when another host claims the address before use',()=>{
 const {client,sw,devices,links}=localTopology()
 useNetworkStore.getState().loadLab(devices,links)
 useNetworkStore.getState().requestDhcp(client.id)
 let requestId=''
 for(let tick=0;tick<250;tick++){
  useNetworkStore.getState().tickSimulation()
  const transaction=useNetworkStore.getState().dhcpTransactions.at(-1)
  requestId=transaction?.requestId??''
  if(transaction?.phase==='probe')break
 }
 const probeTransaction=useNetworkStore.getState().dhcpTransactions.find(transaction=>transaction.requestId===requestId)
 assert.equal(probeTransaction?.phase,'probe','the client must probe the acknowledged address before configuring it')
 const rogue=makeDevice('pc','rogue-host','192.168.50.4')
 const freeSwitchPort=sw.ports.findIndex(port=>!port.connectedLinkId)
 assert.ok(freeSwitchPort>1)
 const rogueLink=connect(sw,freeSwitchPort,rogue,0)
 useNetworkStore.setState(state=>({devices:[...state.devices,rogue],links:[...state.links,rogueLink]}))
 for(let tick=0;tick<100&&useNetworkStore.getState().dhcpTransactions.find(transaction=>transaction.requestId===requestId)?.status==='pending';tick++)useNetworkStore.getState().tickSimulation()
 const state=useNetworkStore.getState(),clientAfterProbe=state.devices.find(device=>device.id===client.id)!
 const failed=state.dhcpTransactions.find(transaction=>transaction.requestId===requestId)
 assert.equal(failed?.status,'failed')
 assert.match(failed?.reason??'',/DHCP address conflict.*192\.168\.50\.4.*rogue-host/i)
 assert.equal(clientAfterProbe.ports[0].ipAddress,undefined)
 assert.equal(clientAfterProbe.config.dhcpLease,undefined)
 for(let tick=0;tick<300;tick++){
  const retry=useNetworkStore.getState().dhcpTransactions.find(transaction=>transaction.autoRetryOf===requestId)
  if(retry?.status==='successful')break
  useNetworkStore.getState().tickSimulation()
 }
 const recovered=useNetworkStore.getState()
 const retry=recovered.dhcpTransactions.find(transaction=>transaction.autoRetryOf===requestId)
 assert.equal(retry?.status,'successful','the client should automatically request another address after rejecting a conflict')
 assert.equal(recovered.devices.find(device=>device.id===client.id)?.ports[0].ipAddress,'192.168.50.5')
})
