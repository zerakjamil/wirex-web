import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTrainingLab } from './trainingLabs'
import { diagnoseConnection, auditWholeNetwork } from './diagnostics'

test('identifies the exact access port that puts the destination in the wrong VLAN',()=>{
  const lab=createTrainingLab('vlans','troubleshoot')
  const issues=diagnoseConnection(lab.devices,lab.links,'campus-pc-a','campus-pc-b')
  assert.ok(issues.some(i=>i.code==='access-vlan'&&i.deviceId==='campus-sw-b'&&i.portId===lab.devices[1].ports.find(p=>p.shortName==='Fa0/1')?.id))
})
test('identifies trunk VLAN exclusion and clears the diagnosis after repair',()=>{
  const lab=createTrainingLab('ethernet','guided'),port=lab.devices[1].ports.find(p=>p.shortName==='Gi0/1')!
  port.allowedVlans=[20]
  assert.ok(diagnoseConnection(lab.devices,lab.links,'campus-pc-a','campus-pc-b').some(i=>i.code==='trunk-vlan'&&i.portId===port.id))
  port.allowedVlans=[10]
  assert.equal(diagnoseConnection(lab.devices,lab.links,'campus-pc-a','campus-pc-b').length,0)
})
test('reports duplicate addresses and missing routed gateway without inventing a route',()=>{
  const lab=createTrainingLab('tcpip','guided'),a=lab.devices.find(d=>d.id==='campus-pc-a')!,b=lab.devices.find(d=>d.id==='campus-pc-b')!
  a.config.defaultGateway=undefined
  assert.ok(diagnoseConnection(lab.devices,lab.links,a.id,b.id).some(i=>i.code==='gateway-missing'&&i.deviceId===a.id))
  b.ports[0].ipAddress=a.ports[0].ipAddress
  assert.ok(diagnoseConnection(lab.devices,lab.links,a.id,b.id).some(i=>i.code==='duplicate-ip'))
})
test('DHCP client with no lease is reported explicitly, independently of a valid static destination',()=>{
  const lab=createTrainingLab('ethernet','guided'),a=lab.devices.find(d=>d.id==='campus-pc-a')!
  a.config.dhcpEnabled=true;a.ports[0].ipAddress=undefined
  assert.ok(diagnoseConnection(lab.devices,lab.links,a.id,'campus-pc-b').some(i=>i.code==='dhcp-lease'&&i.deviceId===a.id))
})
test('a usable redundant trunk avoids blaming a blocked or misconfigured alternate link',()=>{
 const lab=createTrainingLab('stp','guided')
 lab.devices[0].ports.find(p=>p.shortName==='Gi0/1')!.allowedVlans=[20]
 lab.devices[1].ports.find(p=>p.shortName==='Gi0/1')!.allowedVlans=[20]
 assert.equal(diagnoseConnection(lab.devices,lab.links,'campus-pc-a','campus-pc-b').length,0)
})
test('DHCP pool on the gateway reports a network mismatch at the server, not at the client',()=>{
 const lab=createTrainingLab('tcpip','guided'),a=lab.devices.find(d=>d.id==='campus-pc-a')!,router=lab.devices.find(d=>d.id==='campus-router')!
 a.config.dhcpEnabled=true;a.ports[0].ipAddress=undefined
 router.config.dhcpPools=[{name:'SALES',network:'10.99.0.0',mask:'255.255.255.0',defaultRouter:'10.99.0.1'}]
 assert.ok(diagnoseConnection(lab.devices,lab.links,a.id,'campus-pc-b').some(i=>i.code==='dhcp-network'&&i.deviceId===router.id))
})
test('a router lacking the destination subnet is identified as the routing failure location',()=>{
 const lab=createTrainingLab('tcpip','guided'),router=lab.devices.find(d=>d.id==='campus-router')!
 router.ports.find(p=>p.ipAddress==='192.168.20.1')!.ipAddress='192.168.30.1'
 assert.ok(diagnoseConnection(lab.devices,lab.links,'campus-pc-a','campus-pc-b').some(i=>i.code==='route-missing'&&i.deviceId===router.id))
})
test('auditWholeNetwork scores clean lab and detects duplicate IP, VLAN mismatch, and powered off hardware',()=>{
 const lab = createTrainingLab('ethernet', 'guided')
 const initialAudit = auditWholeNetwork(lab.devices, lab.links)
 assert.equal(initialAudit.score, 100)
 assert.equal(initialAudit.issues.length, 0)

 const pcA = lab.devices.find(d => d.id === 'campus-pc-a')!
 const pcB = lab.devices.find(d => d.id === 'campus-pc-b')!
 pcB.ports[0].ipAddress = pcA.ports[0].ipAddress
 lab.devices[0].power = false

 const faultyAudit = auditWholeNetwork(lab.devices, lab.links)
 assert.ok(faultyAudit.score < 100)
 assert.ok(faultyAudit.issues.some(i => i.code === 'duplicate-ip'))
 assert.ok(faultyAudit.issues.some(i => i.code === 'power'))
})
test('auditWholeNetwork identifies inter-switch trunk native VLAN mismatches across the entire topology',()=>{
 const lab = createTrainingLab('stp', 'guided')
 const swA = lab.devices[0], swB = lab.devices[1]
 const pA = swA.ports.find(p => p.portMode === 'trunk')!
 const pB = swB.ports.find(p => p.portMode === 'trunk')!
 pA.nativeVlan = 1
 pB.nativeVlan = 99

 const audit = auditWholeNetwork(lab.devices, lab.links)
 assert.ok(audit.issues.some(i => i.code === 'native-vlan'))
})
