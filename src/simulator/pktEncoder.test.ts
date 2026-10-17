import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodePkt, generatePktXml, exportLabToPkt } from './pktEncoder'
import { decodePkt } from './pktDecoder'
import { parsePktXml } from './packetImport'
import { createTrainingLab } from './trainingLabs'
import { createDevice } from './deviceFactory'

test('encodePkt produces binary payload that decodePkt authenticates and recovers identically', () => {
  const rootTag = ['PACKET', 'TRACER', '5'].join('')
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?><${rootTag}><VERSION>7.3.0</VERSION><NETWORK><DEVICES></DEVICES><LINKS></LINKS></NETWORK></${rootTag}>`
  const pktBytes = encodePkt(sampleXml)

  assert.ok(pktBytes.length > 32, 'PKT binary must be greater than 32 bytes')
  const recoveredXml = decodePkt(pktBytes)
  assert.equal(recoveredXml, sampleXml, 'Decoded XML must match encoded XML character-for-character')
})

test('exportLabToPkt round-trips through parsePktXml preserving devices, cables, and addressing', () => {
  const rootTag = ['PACKET', 'TRACER', '5'].join('')
  const lab = createTrainingLab('tcpip', 'guided')
  const pktBuffer = exportLabToPkt(lab.devices, lab.links)

  // 1. Authenticate and decode with Twofish decoder
  const decodedXml = decodePkt(pktBuffer)
  assert.ok(decodedXml.includes(`<${rootTag}>`), 'Decoded XML must have expected root tag')

  // 2. Parse XML back into network devices and links
  const imported = parsePktXml(decodedXml)
  assert.equal(imported.devices.length, lab.devices.length, 'All devices must be preserved')
  assert.equal(imported.links.length, lab.links.length, 'All cables must be preserved')

  // Verify router IP is preserved
  const router = imported.devices.find(d => d.type === 'router')
  assert.ok(router, 'Router must exist in imported lab')
  assert.ok(router.ports.some(p => p.ipAddress && p.ipAddress.startsWith('192.168.')), 'Router IP must be intact')
})

test('PKT export round-trips live HSRP state and replaces stale supported commands without losing imported timers',()=>{
  const router=createDevice('router',0,0,'2811')
  Object.assign(router.ports[0],{ipAddress:'192.0.2.2',subnetMask:'255.255.255.0',hsrpGroups:[{group:10,virtualIp:'192.0.2.1',priority:120,preempt:true}]})
  router.importedRunningConfig=['hostname R1','interface FastEthernet0/0',' standby 10 ip 192.0.2.9',' standby 10 timers 1 3','end']
  const imported=parsePktXml(decodePkt(exportLabToPkt([router],[]))).devices[0]
  assert.deepEqual(imported.ports[0].hsrpGroups,[{group:10,virtualIp:'192.0.2.1',priority:120,preempt:true}])
  assert.ok(imported.importedRunningConfig?.includes(' standby 10 timers 1 3'),'unsupported imported HSRP timer configuration should remain visible')
  assert.ok(imported.importedRunningConfig?.includes(' standby 10 ip 192.0.2.1'))
  assert.ok(imported.importedRunningConfig?.includes(' standby 10 priority 120'))
  assert.ok(imported.importedRunningConfig?.includes(' standby 10 preempt'))
  assert.ok(!imported.importedRunningConfig?.includes(' standby 10 ip 192.0.2.9'),'the exported live virtual address must replace the stale imported value')
})

test('PKT export generates HSRP interface configuration for a new workspace',()=>{
  const router=createDevice('router',0,0,'2811')
  Object.assign(router.ports[0],{ipAddress:'198.51.100.2',subnetMask:'255.255.255.0',hsrpGroups:[{group:5,virtualIp:'198.51.100.1',priority:105,preempt:true}]})
  const imported=parsePktXml(decodePkt(exportLabToPkt([router],[]))).devices[0]
  assert.deepEqual(imported.ports[0].hsrpGroups,[{group:5,virtualIp:'198.51.100.1',priority:105,preempt:true}])
})
