import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { parseWorkspace } from './workspaceSchema'
import { defaultPhysicalContainers } from './physical'
import { getVlanSwitchLab, getCcnaEnterpriseLab, getWirelessLab, getPtAnywhereLab } from './starterLabs'
import { createTrainingLab, lessonIds } from './trainingLabs'

test('workspace validation accepts real devices and an intentionally empty lab', () => {
  assert.equal(parseWorkspace({ devices: [createDevice('phone', 10, 20)], links: [] }).devices.length, 1)
  assert.equal(parseWorkspace({ version: 1, devices: [], links: [] }).devices.length, 0)
})
test('generic end device GUI HTML and lock survive workspace validation', () => {
  const device = createDevice('pc', 10, 20, 'WiredEndDevice-PT')
  device.config.guiHtml = '<!doctype html><html><body><h1>Lab</h1></body></html>'
  device.config.guiHtmlPasswordHash = '1a2b3c4d'
  const restored = parseWorkspace({ version: 1, devices: [device], links: [] }).devices[0]
  assert.equal(restored.config.guiHtml, device.config.guiHtml)
  assert.equal(restored.config.guiHtmlPasswordHash, device.config.guiHtmlPasswordHash)
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...device, config: { ...device.config, guiHtml: 42 } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...device, config: { ...device.config, guiHtmlPasswordHash: {} } }], links: [] }))
})
test('workspace validation rejects broken device types, coordinates, ports and nested config', () => {
  const device = createDevice('router', 10, 20)
  for (const change of [ { type: 'unknown' }, { x: Infinity }, { ports: [null] }, { config: { hostname: 'R1', dhcpPools: {} } }, { routingTable: [{network:42}] }, { config: {hostname:'R1',dhcpPools:[{network:42,mask:null}]} }, { config: {hostname:'R1',defaultGateway:42} } ]) {
    assert.throws(() => parseWorkspace({ devices: [{ ...device, ...change }], links: [] }))
  }
})
test('workspace validation rejects duplicate devices and cables to missing ports', () => {
  const device = createDevice('pc', 10, 20)
  assert.throws(() => parseWorkspace({ devices: [device, device], links: [] }))
  assert.throws(() => parseWorkspace({ devices: [device], links: [{ id: 'cable', type: 'straight', status: 'up', fromDeviceId: device.id, toDeviceId: device.id, fromPortId: 'missing', toPortId: device.ports[0].id }] }))
})
test('legacy cached subinterfaces migrate without retaining an invented physical-interface IP', () => {
  const router = createDevice('router', 10, 20)
  const parent = router.ports[0]
  Object.assign(parent, { ipAddress: '10.0.10.1', subnetMask: '255.255.255.0' })
  router.ports.push({ ...parent, id: `${parent.id}.10`, name: `${parent.name}.10`, shortName: `${parent.shortName}.10`, vlan: 10, connectedLinkId: undefined })
  const restored = parseWorkspace({ version: '1.0', devices: [router], links: [] }).devices[0]
  assert.equal(restored.ports.at(-1)?.parentPortId, parent.id)
  assert.equal(restored.ports.at(-1)?.dot1qVlan, 10)
  assert.equal(restored.ports[0].ipAddress, undefined)
})
test('GRE tunnel interface configuration and tunnel routes survive workspace restore with strict endpoint validation', () => {
  const router = createDevice('router', 10, 20)
  const tunnel = {
    ...router.ports[0], id: `${router.id}:Tunnel0`, name: 'Tunnel0', shortName: 'Tu0',
    isGreTunnel: true, status: 'down' as const, adminStatus: 'up' as const,
    ipAddress: '172.16.0.1', subnetMask: '255.255.255.252',
    greSourceInterface: router.ports[0].name, greDestinationIp: '198.51.100.2', greMode: 'gre ip' as const,
  }
  router.ports.push(tunnel)
  router.routingTable.push({ network: '10.0.2.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'Tunnel0', metric: 1, type: 'S' })
  const restored = parseWorkspace({ version: 1, devices: [router], links: [] }).devices[0]
  assert.deepEqual(restored.ports.at(-1), tunnel)
  assert.ok(restored.routingTable.some(route => route.interfaceName === 'Tunnel0' && route.network === '10.0.2.0'))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...router, ports: [...router.ports.slice(0, -1), { ...tunnel, greDestinationIp: 'invalid' }] }], links: [] }), /GRE tunnel destination/)
})
test('HSRP interface configuration survives workspace restore while operational election state is recomputed',()=>{
  const router=createDevice('router',10,20),port=router.ports[0]
  Object.assign(port,{ipAddress:'192.0.2.2',subnetMask:'255.255.255.0',hsrpGroups:[{group:10,virtualIp:'192.0.2.1',priority:120,preempt:true}],hsrpRuntime:{'10':{state:'active',activeDeviceId:router.id,lastChangeTick:42}}})
  const restored=parseWorkspace({version:1,devices:[router],links:[]}).devices[0].ports[0]
  assert.deepEqual(restored.hsrpGroups,[{group:10,virtualIp:'192.0.2.1',priority:120,preempt:true}])
  assert.equal(restored.hsrpRuntime,undefined)
  for(const hsrpGroups of [
    [{group:256,virtualIp:'192.0.2.1'}],
    [{group:10,virtualIp:'192.0.3.1'}],
    [{group:10,virtualIp:'invalid'}],
    [{group:10,virtualIp:'192.0.2.1',priority:256}],
    [{group:10,virtualIp:'192.0.2.1',preempt:'yes'}],
    [{group:10,virtualIp:'192.0.2.1'},{group:10,virtualIp:'192.0.2.3'}],
  ])assert.throws(()=>parseWorkspace({version:1,devices:[{...router,ports:[{...port,hsrpGroups}]}],links:[]}))
})
test('DNS service settings and records survive workspace restore and reject malformed service flags', () => {
  const server = createDevice('server', 10, 20)
  server.config.dnsServiceEnabled = true
  server.config.dnsRecords = [{ domain: 'wirex.test', ip: '192.168.1.100' }]
  const restored = parseWorkspace({ version: 1, devices: [server], links: [] }).devices[0]
  assert.equal(restored.config.dnsServiceEnabled, true)
  assert.deepEqual(restored.config.dnsRecords, [{ domain: 'wirex.test', ip: '192.168.1.100' }])
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, dnsServiceEnabled: 'yes' } }], links: [] }))
})
test('UDP Echo service settings and listening ports survive workspace restore and reject invalid ports', () => {
  const server = createDevice('server', 10, 20)
  server.config.udpEchoServiceEnabled = true
  server.config.udpEchoPorts = [7, 9000]
  const restored = parseWorkspace({ version: 1, devices: [server], links: [] }).devices[0]
  assert.equal(restored.config.udpEchoServiceEnabled, true)
  assert.deepEqual(restored.config.udpEchoPorts, [7, 9000])
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, udpEchoPorts: [0] } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, udpEchoServiceEnabled: 'yes' } }], links: [] }))
})
test('NTP master and client synchronization state survive workspace restore and reject invalid values', () => {
  const router = createDevice('router', 10, 20)
  router.config.ntpMaster = true
  router.config.ntpMasterStratum = 4
  router.config.ntpServer = '192.0.2.1'
  router.config.ntpSynchronizedAtMs = 1_800_000_000_000
  router.config.ntpOffsetMs = -12.5
  router.config.ntpSynchronizedStratum = 5
  const restored = parseWorkspace({ version: 1, devices: [router], links: [] }).devices[0]
  assert.equal(restored.config.ntpMaster, true)
  assert.equal(restored.config.ntpMasterStratum, 4)
  assert.equal(restored.config.ntpServer, '192.0.2.1')
  assert.equal(restored.config.ntpSynchronizedAtMs, 1_800_000_000_000)
  assert.equal(restored.config.ntpOffsetMs, -12.5)
  assert.equal(restored.config.ntpSynchronizedStratum, 5)
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...router, config: { ...router.config, ntpMasterStratum: 16 } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...router, config: { ...router.config, ntpServer: 'not-an-ip' } }], links: [] }))
})
test('Syslog host, threshold and received messages survive workspace restore and reject invalid values', () => {
  const server = createDevice('server', 10, 20)
  server.config.syslogServiceEnabled = true
  server.config.syslogMessages = [{ id: 'm1', receivedAtMs: 1_800_000_000_000, sourceIp: '192.0.2.1', sourceName: 'R1', severity: 3, message: '%LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to down' }]
  const router = createDevice('router', 30, 20)
  router.config.loggingHost = '192.0.2.20'
  router.config.loggingTrap = 4
  const restored = parseWorkspace({ version: 1, devices: [server, router], links: [] }).devices
  assert.equal(restored[0].config.syslogServiceEnabled, true)
  assert.deepEqual(restored[0].config.syslogMessages, server.config.syslogMessages)
  assert.equal(restored[1].config.loggingHost, '192.0.2.20')
  assert.equal(restored[1].config.loggingTrap, 4)
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...router, config: { ...router.config, loggingHost: 'not-an-ip' } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...router, config: { ...router.config, loggingTrap: 8 } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, syslogServiceEnabled: 'yes' } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, syslogMessages: [{ ...server.config.syslogMessages![0], severity: 8 }] } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, syslogMessages: [{ ...server.config.syslogMessages![0], message: '' }] } }], links: [] }))
})
test('SNMP read-only communities and system identity survive workspace restore and reject unsafe configuration', () => {
  const router = createDevice('router', 10, 20)
  router.config.snmpCommunities = ['classroom', 'campus-net']
  router.config.snmpSystemContact = 'netlab@example.edu'
  router.config.snmpSystemLocation = 'Building A'
  const restored = parseWorkspace({ version: 1, devices: [router], links: [] }).devices[0]
  assert.deepEqual(restored.config.snmpCommunities, ['classroom', 'campus-net'])
  assert.equal(restored.config.snmpSystemContact, 'netlab@example.edu')
  assert.equal(restored.config.snmpSystemLocation, 'Building A')
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...router, config: { ...router.config, snmpCommunities: [''] } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...router, config: { ...router.config, snmpCommunities: ['classroom', 'classroom'] } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...router, config: { ...router.config, snmpSystemContact: 'x'.repeat(256) } }], links: [] }))
})
test('ASA NAT configuration survives restore while runtime translations are cleared and invalid rules are rejected', () => {
  const asa = createDevice('security', 10, 20)
  asa.asaNatTranslations = [{
    id: 'xlate-runtime', protocol: 'ICMP', sourceInterface: 'inside', destInterface: 'outside',
    originalSourceIp: '192.168.1.10', translatedSourceIp: '203.0.113.1', remoteDestinationIp: '203.0.113.10',
    originalIdentifier: 0, translatedIdentifier: 1, expiresAtMs: Date.now() + 10_000,
  }]
  const restored = parseWorkspace({ version: 1, devices: [asa], links: [] }).devices[0]
  assert.deepEqual(restored.config.asaNatRules, asa.config.asaNatRules)
  assert.equal(restored.asaNatTranslations, undefined)
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...asa, config: { ...asa.config, asaNatRules: [{ id: 'bad', sourceInterface: 'inside', destInterface: 'outside', type: 'dynamic-pat', sourceNet: 'private' }] } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...asa, config: { ...asa.config, asaNatRules: [{ id: 'bad', sourceInterface: 'LAN', destInterface: 'outside', type: 'dynamic-pat', sourceNet: '192.168.1.0/24' }] } }], links: [] }))
})
test('TFTP files and downloaded client files survive workspace restore and reject invalid names, flags, and oversized content', () => {
  const server = createDevice('server', 10, 20)
  server.config.tftpServiceEnabled = true
  server.config.tftpFiles = [{ name: 'startup.cfg', contents: 'hostname Switch1\n' }]
  const client = createDevice('pc', 30, 40)
  client.config.tftpClientFiles = [{ serverIp: '192.0.2.20', name: 'startup.cfg', contents: 'hostname Switch1\n', receivedAtMs: 1_800_000_000_000 }]
  const restored = parseWorkspace({ version: 1, devices: [server, client], links: [] }).devices
  assert.deepEqual(restored[0].config.tftpFiles, server.config.tftpFiles)
  assert.deepEqual(restored[1].config.tftpClientFiles, client.config.tftpClientFiles)
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, tftpFiles: [{ name: '../secret', contents: 'x' }] } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, tftpServiceEnabled: 'yes' } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, tftpFiles: [{ name: 'oversized.cfg', contents: 'x'.repeat(65_537) }] } }], links: [] }))
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...client, config: { ...client.config, tftpClientFiles: [{ serverIp: '192.0.2.20', name: 'startup.cfg', contents: 'x'.repeat(65_537), receivedAtMs: 1_800_000_000_000 }] } }], links: [] }))
})
test('SMTP and POP3 service credentials, mailboxes, and client folders survive workspace restore with bounds', () => {
  const server = createDevice('server', 10, 20)
  const message = { id: 'mail-1', from: 'alice@classroom.test', to: 'bob@classroom.test', subject: 'Lab', body: 'VLANs work.', sentAtTick: 12 }
  server.config.emailService = { domain: 'classroom.test', smtpEnabled: true, pop3Enabled: true, users: [
    { username: 'alice', password: 'secret', mailbox: [] },
    { username: 'bob', password: 'secret', mailbox: [message] },
  ] }
  const client = createDevice('pc', 30, 40)
  client.config.emailAccount = { displayName: 'Alice Student', emailAddress: 'alice@classroom.test', incomingServer: '192.0.2.10', outgoingServer: '192.0.2.10', username: 'alice', password: 'secret', inbox: [], sent: [message] }
  const restored = parseWorkspace({ version: 1, devices: [server, client], links: [] }).devices
  assert.deepEqual(restored[0].config.emailService, server.config.emailService)
  assert.deepEqual(restored[1].config.emailAccount, client.config.emailAccount)
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, emailService: { ...server.config.emailService, smtpEnabled: 'yes' } } }], links: [] }), /email smtpEnabled/)
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, emailService: { ...server.config.emailService, users: [{ username: 'bad/name', password: 'secret', mailbox: [] }] } } }], links: [] }), /mailbox credentials/)
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...client, config: { ...client.config, emailAccount: { ...client.config.emailAccount, incomingServer: 'mail.classroom.test' } } }], links: [] }), /email account settings/)
  assert.throws(() => parseWorkspace({ version: 1, devices: [{ ...server, config: { ...server.config, emailService: { ...server.config.emailService, domain: 'bad domain' } } }], links: [] }), /email service domain/)
})
test('DHCP pool durations and client lease timers survive workspace restore and reject invalid lease data', () => {
  const client=createDevice('pc',10,20)
  client.config.dhcpEnabled=true
  client.config.dhcpLease={serverId:'router-1',ipAddress:'10.0.0.20',acquiredAtMs:1_800_000_000_000,leaseDurationSeconds:3600,state:'renewing',lastRequestAtMs:1_800_000_001_000}
  client.config.dhcpPools=[
    {name:'STUDENTS',network:'10.0.0.0',mask:'255.255.255.0',leaseDurationSeconds:3600,hostIp:'10.0.0.20',hostMask:'255.255.255.0',hardwareAddress:'001122334455'},
    {name:'STUDENT-ID',network:'10.0.0.0',mask:'255.255.255.0',hostIp:'10.0.0.21',hostMask:'255.255.255.0',clientIdentifier:'01001122334455'},
  ]
  client.config.dhcpBindings=[{ipAddress:'10.0.0.30',clientDeviceId:'client-1',clientIdentifier:'01001122334455',hardwareAddress:'001122334455',acquiredAtMs:1_800_000_000_000,leaseDurationSeconds:3600,type:'manual'}]
  const binding=client.config.dhcpBindings![0]
  const restored=parseWorkspace({version:1,devices:[client],links:[]}).devices[0]
  assert.deepEqual(restored.config.dhcpLease,client.config.dhcpLease)
  assert.deepEqual(restored.config.dhcpPools,client.config.dhcpPools)
  assert.deepEqual(restored.config.dhcpBindings,client.config.dhcpBindings)
  assert.throws(()=>parseWorkspace({version:1,devices:[{...client,config:{...client.config,dhcpPools:[{name:'STUDENTS',network:'10.0.0.0',mask:'255.255.255.0',leaseDurationSeconds:59}]}}],links:[]}))
  assert.throws(()=>parseWorkspace({version:1,devices:[{...client,config:{...client.config,dhcpPools:[{name:'STUDENTS',network:'10.0.0.0',mask:'255.255.255.0',hardwareAddress:'not-a-mac'}]}}],links:[]}))
  assert.throws(()=>parseWorkspace({version:1,devices:[{...client,config:{...client.config,dhcpLease:{...client.config.dhcpLease,acquiredAtMs:Infinity}}}],links:[]}))
  assert.throws(()=>parseWorkspace({version:1,devices:[{...client,config:{...client.config,dhcpBindings:[{...binding,leaseDurationSeconds:0}]}}],links:[]}))
})
test('every starter and training topology remains loadable through file and cache validation', () => {
  for (const build of [getVlanSwitchLab, getCcnaEnterpriseLab, getWirelessLab, getPtAnywhereLab]) assert.doesNotThrow(() => parseWorkspace(build()))
  for (const lesson of lessonIds) assert.doesNotThrow(() => parseWorkspace(createTrainingLab(lesson, 'guided')))
})
test('devices created in the same millisecond cannot collide when Math.random repeats', context => {
  context.mock.method(Date, 'now', () => 123456)
  context.mock.method(Math, 'random', () => 0.5)
  const ids = Array.from({length: 30}, () => createDevice('pc', 0, 0).id)
  assert.equal(new Set(ids).size, ids.length)
})
test('physical containers, assignments and clusters round-trip through save and restore', () => {
  const pc = createDevice('pc', 10, 20)
  const physical = {
    containers: [...defaultPhysicalContainers(), { id: 'phys-table-1', kind: 'table', name: 'Bench', parentId: 'phys-closet-main' }],
    assignment: { [pc.id]: 'phys-table-1' },
    clusters: [{ id: 'cluster-1', name: 'Cluster 1', deviceIds: [pc.id] }],
  }
  const saved = JSON.parse(JSON.stringify({ version: 1, devices: [pc], links: [], physical })) as Record<string, unknown>
  const restored = parseWorkspace(saved)
  assert.deepEqual(restored.physical?.assignment, physical.assignment)
  assert.deepEqual(restored.physical?.clusters, physical.clusters)
  assert.equal(restored.physical?.containers.length, 5)
  assert.equal(restored.physical?.containers[4].name, 'Bench')
  assert.equal(restored.physical?.containers[4].kind, 'table')
  assert.equal(parseWorkspace({ version: 1, devices: [pc], links: [] }).physical, undefined, 'workspaces without physical state stay loadable')
})
test('cluster associations survive parsing and stale or malformed targets are dropped', () => {
  const pc = createDevice('pc', 10, 20)
  const containers = defaultPhysicalContainers()
  const base = { version: 1, devices: [pc], links: [] }
  const withAssociation = (physicalContainerId: unknown) => parseWorkspace({ ...base, physical: { containers, assignment: {}, clusters: [{ id: 'c1', name: 'C', deviceIds: [pc.id], physicalContainerId }] } })
  assert.equal(withAssociation('phys-closet-main').physical?.clusters[0]?.physicalContainerId, 'phys-closet-main')
  assert.equal(withAssociation('ghost').physical?.clusters[0]?.physicalContainerId, undefined, 'unknown containers drop the association')
  assert.equal(withAssociation(7).physical?.clusters[0]?.physicalContainerId, undefined, 'malformed targets drop the association')
})
test('workspace validation rejects malformed physical containers, assignments and clusters', () => {
  const pc = createDevice('pc', 10, 20)
  const containers = defaultPhysicalContainers()
  const base = { version: 1, devices: [pc], links: [] }
  assert.throws(() => parseWorkspace({ ...base, physical: { containers: [{ id: 'r1', kind: 'rack', name: 'R9', parentId: null }], assignment: {}, clusters: [] } }), /nesting/)
  assert.throws(() => parseWorkspace({ ...base, physical: { containers: [{ id: 'x1', kind: 'palace', name: 'P', parentId: null }], assignment: {}, clusters: [] } }), /Unsupported network value/)
  assert.throws(() => parseWorkspace({ ...base, physical: { containers: [{ id: 'b1', kind: 'building', name: 'B', parentId: 'ghost' }], assignment: {}, clusters: [] } }), /parent is missing/)
  assert.throws(() => parseWorkspace({ ...base, physical: { containers: [containers[0], containers[0]], assignment: {}, clusters: [] } }), /Duplicate/)
  assert.throws(() => parseWorkspace({ ...base, physical: { containers, assignment: { [pc.id]: 'phys-building-main' }, clusters: [] } }), /invalid container/)
  assert.throws(() => parseWorkspace({ ...base, physical: { containers, assignment: { ghost: 'phys-rack-1' }, clusters: [] } }), /assignment/)
  assert.throws(() => parseWorkspace({ ...base, physical: { containers, assignment: {}, clusters: [{ id: 'c1', name: 'C', deviceIds: ['ghost'] }] } }), /unknown device/)
  assert.throws(() => parseWorkspace({ ...base, physical: { containers, assignment: {}, clusters: [{ id: 'c1', name: 'C', deviceIds: [] }] } }), /no devices/)
  assert.throws(() => parseWorkspace({ ...base, physical: { containers, assignment: {}, clusters: [{ id: 'c1', name: 'C', deviceIds: [pc.id, pc.id] }] } }), /twice/)
  assert.throws(() => parseWorkspace({ ...base, physical: { containers, assignment: {}, clusters: [{ id: 'c1', name: 'x'.repeat(65), deviceIds: [pc.id] }] } }), /too long/)
})


test('spanning-tree guard settings survive restore while transient Root Guard state is cleared', () => {
  const sw = createDevice('switch', 10, 20)
  const port = sw.ports[0]
  Object.assign(port, { portfast: true, bpduGuard: true, bpduFilter: false, rootGuard: true, rootInconsistentVlans: { '10': 5 }, errDisabled: 'bpduguard' })
  sw.config.bpduGuardDefault = true
  sw.config.bpduFilterDefault = true
  const restored = parseWorkspace(JSON.parse(JSON.stringify({ version: 1, devices: [sw], links: [] })))
  const restoredPort = restored.devices[0].ports[0]
  assert.equal(restoredPort.portfast, true)
  assert.equal(restoredPort.bpduGuard, true)
  assert.equal(restoredPort.bpduFilter, false)
  assert.equal(restoredPort.rootGuard, true)
  assert.equal(restoredPort.errDisabled, 'bpduguard')
  assert.equal(restoredPort.rootInconsistentVlans, undefined)
  assert.equal(restored.devices[0].config.bpduGuardDefault, true)
  assert.equal(restored.devices[0].config.bpduFilterDefault, true)
  const bad = JSON.parse(JSON.stringify({ version: 1, devices: [sw], links: [] }))
  bad.devices[0].ports[0].bpduGuard = 'yes'
  assert.throws(() => parseWorkspace(bad), /guard/i)
})
