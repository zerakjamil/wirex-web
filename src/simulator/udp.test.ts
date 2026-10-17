import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from './deviceFactory'
import { createNtpQueryPackets, createSnmpQueryPackets, createTftpReadPackets, createUdpEchoPackets, stepSimulationTick } from './engine'
import type { DeviceType, InFlightPacket, NetworkDevice, NetworkLink } from '../types/network'
import { useNetworkStore } from '../store/networkStore'
import { useWorkspaceStore } from '../store/workspaceStore'

function device(type: DeviceType, id: string, ip: string): NetworkDevice {
  const result = createDevice(type, 0, 0)
  result.id = id
  result.name = id
  result.ports.forEach((port, index) => {
    port.macAddress = `02:00:00:00:${id.charCodeAt(0).toString(16)}:${index.toString(16).padStart(2, '0')}`
    port.adminStatus = 'up'
    port.status = 'up'
  })
  result.ports[0].ipAddress = ip
  result.ports[0].subnetMask = '255.255.255.0'
  return result
}

function connect(a: NetworkDevice, aIndex: number, b: NetworkDevice, bIndex: number): NetworkLink {
  const aPort = a.ports[aIndex]
  const bPort = b.ports[bIndex]
  const link: NetworkLink = { id: `${a.id}-${b.id}`, type: 'straight', fromDeviceId: a.id, fromPortId: aPort.id, toDeviceId: b.id, toPortId: bPort.id, status: 'up' }
  Object.assign(aPort, { connectedDeviceId: b.id, connectedPortId: bPort.id, connectedLinkId: link.id })
  Object.assign(bPort, { connectedDeviceId: a.id, connectedPortId: aPort.id, connectedLinkId: link.id })
  return link
}

function topology() {
  const client = device('pc', 'client', '192.168.1.10')
  client.config.defaultGateway = '192.168.1.1'
  const router = device('router', 'router', '192.168.1.1')
  router.ports[1].ipAddress = '192.168.2.1'
  for (const port of router.ports.slice(0, 2)) router.routingTable.push({ network: port.ipAddress!.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: port.name, metric: 0, type: 'C' })
  const server = device('server', 'server', '192.168.2.10')
  server.config.defaultGateway = '192.168.2.1'
  server.config.udpEchoServiceEnabled = true
  server.config.udpEchoPorts = [7, 9000]
  const links = [connect(client, 0, router, 0), connect(router, 1, server, 0)]
  return { client, router, server, devices: [client, router, server], links }
}

function asaTftpTopology() {
  const client = device('pc', 'asa-tftp-client', '192.168.1.10')
  const asa = createDevice('security', 0, 0, 'ASA 5505')
  asa.id = 'asa-tftp'
  asa.name = 'ASA TFTP'
  const server = device('server', 'asa-tftp-server', '203.0.113.10')
  client.config.defaultGateway = '192.168.1.1'
  server.config.defaultGateway = '203.0.113.1'
  server.config.tftpServiceEnabled = true
  server.config.tftpFiles = [{ name: 'campus.cfg', contents: 'x'.repeat(700) }]

  Object.assign(asa.ports[0], { ipAddress: '203.0.113.1', subnetMask: '255.255.255.0', nameif: 'outside', securityLevel: 0, adminStatus: 'up', status: 'up' })
  Object.assign(asa.ports[1], { ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', nameif: 'inside', securityLevel: 100, adminStatus: 'up', status: 'up' })
  asa.routingTable = asa.ports.slice(0, 2).map((port) => ({
    network: port.ipAddress!.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: port.name, metric: 0, type: 'C' as const,
  }))
  asa.arpTable = []
  asa.config.asaNatRules = [{ id: 'inside-pat', sourceInterface: 'inside', destInterface: 'outside', type: 'dynamic-pat', sourceNet: '192.168.1.0/24' }]
  client.arpTable = [{ ipAddress: '192.168.1.1', macAddress: asa.ports[1].macAddress, interfaceName: client.ports[0].name, age: 0 }]
  server.arpTable = [{ ipAddress: '203.0.113.1', macAddress: asa.ports[0].macAddress, interfaceName: server.ports[0].name, age: 0 }]
  const links = [connect(client, 0, asa, 1), connect(asa, 0, server, 0)]
  return { client, asa, server, devices: [client, asa, server], links }
}

function execute(devices: NetworkDevice[], links: NetworkLink[], packets: InFlightPacket[]) {
  const results: ReturnType<typeof stepSimulationTick>['udpResults'] = []
  const trace: string[] = []
  for (let i = 0; i < 400 && packets.length; i++) {
    trace.push(...packets.map(packet => packet.pdu.summary))
    const step = stepSimulationTick(devices, links, packets)
    devices = step.updatedDevices
    packets = step.newInFlightPackets
    results.push(...step.udpResults)
  }
  return { devices, packets, results, trace }
}

test('UDP Echo request and response cross a routed topology and return the payload', () => {
  const { client, devices, links } = topology()
  const packets = createUdpEchoPackets(client, devices, links, 'udp-1', '192.168.2.10', 9000, 'hello from client')
  assert.ok(packets.length > 0)
  const request = packets[0].pdu.pendingPacket ?? packets[0].pdu
  assert.equal(request.protocol, 'UDP')
  assert.equal(request.payload.udpDestinationPort, 9000)
  assert.equal(request.payload.udpData, 'hello from client')
  const result = execute(devices, links, packets)
  assert.equal(result.packets.length, 0)
  assert.ok(result.results.some(item => item.requestId === 'udp-1' && item.status === 'successful' && item.response === 'hello from client'))
  assert.ok(result.trace.some(summary => summary.includes('UDP Echo response')))
})

test('UDP Echo to a closed port fails with the listening port in the reason', () => {
  const { client, devices, links } = topology()
  const result = execute(devices, links, createUdpEchoPackets(client, devices, links, 'udp-closed', '192.168.2.10', 9999, 'test'))
  assert.ok(result.results.some(item => item.requestId === 'udp-closed' && item.status === 'failed' && /not listening on UDP port 9999/.test(item.reason ?? '')))
})

test('UDP Echo without an enabled server service fails explicitly', () => {
  const { client, server, devices, links } = topology()
  server.config.udpEchoServiceEnabled = false
  const result = execute(devices, links, createUdpEchoPackets(client, devices, links, 'udp-disabled', '192.168.2.10', 9000, 'test'))
  assert.ok(result.results.some(item => item.requestId === 'udp-disabled' && item.status === 'failed' && /UDP Echo service is disabled on server/.test(item.reason ?? '')))
})

test('UDP Echo request denied by an inbound ACL returns the matching interface reason', () => {
  const { client, router, devices, links } = topology()
  router.ports[0].inboundAcl = 'udp-filter'
  router.config.accessLists = [{ id: 'udp-filter', type: 'extended', rules: [{ type: 'extended', action: 'deny', protocol: 'udp', sourceIp: 'any', destIp: 'any', destPort: 9000 }] }]
  const result = execute(devices, links, createUdpEchoPackets(client, devices, links, 'udp-acl', '192.168.2.10', 9000, 'test'))
  assert.ok(result.results.some(item => item.requestId === 'udp-acl' && item.status === 'failed' && /inbound ACL udp-filter/.test(item.reason ?? '')))
})

test('outbound UDP ACL denial is reported without opening an unrelated IP settings dialog', () => {
  const { client, devices, links } = topology()
  client.ports[0].outboundAcl = 'udp-egress'
  client.config.accessLists = [{ id: 'udp-egress', type: 'extended', rules: [{ type: 'extended', action: 'deny', protocol: 'udp', sourceIp: 'any', destIp: 'any', destPort: 9000 }] }]
  useNetworkStore.getState().loadLab(devices, links)
  useWorkspaceStore.setState({ dialog: null, pduError: null, pdus: [] })
  useWorkspaceStore.getState().firePdu(client.id, 'server', '192.168.2.10', { protocol: 'UDP', port: 9000, data: 'blocked' })
  const entry = useWorkspaceStore.getState().pdus.at(-1)
  assert.equal(entry?.status, 'Failed to send')
  assert.match(entry?.reason ?? '', /outbound ACL/)
  assert.equal(useWorkspaceStore.getState().dialog, null)
})

test('UDP Echo validates the target, port, and bounded UTF-8 payload', () => {
  const { client, devices, links } = topology()
  assert.deepEqual(createUdpEchoPackets(client, devices, links, 'udp-bad-ip', 'not-an-ip', 7, 'test'), [])
  assert.deepEqual(createUdpEchoPackets(client, devices, links, 'udp-bad-port', '192.168.2.10', 0, 'test'), [])
  assert.deepEqual(createUdpEchoPackets(client, devices, links, 'udp-big', '192.168.2.10', 7, 'x'.repeat(65508)), [])
})

test('NTP request and response cross a routed topology and report synchronized stratum', () => {
  const { client, router, devices, links } = topology()
  router.config.ntpMaster = true
  router.config.ntpMasterStratum = 4
  const packets = createNtpQueryPackets(client, devices, links, 'ntp-1', '192.168.1.1')
  assert.ok(packets.length > 0)
  const request = packets[0].pdu.pendingPacket ?? packets[0].pdu
  assert.equal(request.protocol, 'UDP')
  assert.equal(request.payload.udpService, 'ntp')
  assert.equal(request.payload.udpDestinationPort, 123)
  assert.equal(request.payload.ntpMessageType, 'request')
  assert.ok(Number.isFinite(request.payload.ntpClientTransmitTimeMs))
  const result = execute(devices, links, packets)
  assert.equal(result.packets.length, 0)
  const transaction = result.results.find(item => item.requestId === 'ntp-1')
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.service, 'ntp')
  assert.equal(transaction?.stratum, 5)
  assert.ok(Number.isFinite(transaction?.offsetMs))
  assert.ok(result.trace.some(summary => summary.includes('NTP response')))
})

test('NTP request to a router without ntp master fails with a service-specific reason', () => {
  const { client, devices, links } = topology()
  const result = execute(devices, links, createNtpQueryPackets(client, devices, links, 'ntp-disabled', '192.168.1.1'))
  assert.ok(result.results.some(item => item.requestId === 'ntp-disabled' && item.status === 'failed' && /NTP service is not configured on router/.test(item.reason ?? '')))
})

test('NTP synchronization persists on the client device through the network store', () => {
  const { client, router, devices, links } = topology()
  router.config.ntpMaster = true
  router.config.ntpMasterStratum = 3
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestNtp(client.id, '192.168.1.1')
  assert.ok(requestId)
  for (let i = 0; i < 400 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().udpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.service, 'ntp')
  assert.equal(transaction?.stratum, 4)
  const synchronizedClient = useNetworkStore.getState().devices.find(item => item.id === client.id)!
  assert.ok(Number.isFinite(synchronizedClient.config.ntpSynchronizedAtMs))
  assert.ok(Number.isFinite(synchronizedClient.config.ntpOffsetMs))
  assert.equal(synchronizedClient.config.ntpSynchronizedStratum, 4)
})

test('IOS ntp server command sends a routed NTP query and synchronizes the configured router', () => {
  const client = device('router', 'ntp-client', '10.0.0.1')
  const server = device('router', 'ntp-server', '10.0.0.2')
  server.config.ntpMaster = true
  server.config.ntpMasterStratum = 2
  const links = [connect(client, 0, server, 0)]
  useNetworkStore.getState().loadLab([client, server], links)
  useNetworkStore.getState().executeIosCommand(client.id, 'enable')
  useNetworkStore.getState().executeIosCommand(client.id, 'configure terminal')
  const output = useNetworkStore.getState().executeIosCommand(client.id, 'ntp server 10.0.0.2')
  assert.match(output, /NTP server 10\.0\.0\.2 configured/i)
  for (let i = 0; i < 400 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const synchronizedClient = useNetworkStore.getState().devices.find(item => item.id === client.id)!
  assert.equal(synchronizedClient.config.ntpServer, '10.0.0.2')
  assert.equal(synchronizedClient.config.ntpSynchronizedStratum, 3)
  assert.ok(Number.isFinite(synchronizedClient.config.ntpOffsetMs))
  assert.ok(useNetworkStore.getState().udpTransactions.some(item => item.service === 'ntp' && item.status === 'successful'))
})

test('NTP client rejects a stratum-15 master as unsynchronized', () => {
  const { client, router, devices, links } = topology()
  router.config.ntpMaster = true
  router.config.ntpMasterStratum = 15
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestNtp(client.id, '192.168.1.1')
  assert.ok(requestId)
  for (let i = 0; i < 400 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().udpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'failed')
  assert.match(transaction?.reason ?? '', /stratum 15 cannot synchronize/i)
  const unsynchronizedClient = useNetworkStore.getState().devices.find(item => item.id === client.id)!
  assert.equal(unsynchronizedClient.config.ntpSynchronizedStratum, undefined)
})

test('TFTP reads a file over routed UDP with DATA and ACK blocks and returns its bytes', () => {
  const { client, server, devices, links } = topology()
  const contents = `${'a'.repeat(512)}β`
  server.config.tftpServiceEnabled = true
  server.config.tftpFiles = [{ name: 'startup.txt', contents }]
  const result = execute(devices, links, createTftpReadPackets(client, devices, links, 'tftp-blocks', '192.168.2.10', 'startup.txt'))
  assert.equal(result.packets.length, 0)
  const transaction = result.results.find(item => item.requestId === 'tftp-blocks')
  assert.ok(transaction, JSON.stringify({ trace: result.trace, results: result.results }))
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.service, 'tftp')
  assert.equal(transaction?.fileName, 'startup.txt')
  assert.equal(transaction?.response, contents)
  assert.ok(result.trace.some(summary => /TFTP DATA block 1\//.test(summary)))
  assert.ok(result.trace.some(summary => /TFTP DATA block 2\//.test(summary)))
  assert.ok(result.trace.some(summary => /TFTP ACK block 2/.test(summary)))
})

test('TFTP sends a zero-byte final DATA block when file length is an exact 512-byte multiple', () => {
  const { client, server, devices, links } = topology()
  const contents = 'x'.repeat(512)
  server.config.tftpServiceEnabled = true
  server.config.tftpFiles = [{ name: 'exact-block.cfg', contents }]
  const result = execute(devices, links, createTftpReadPackets(client, devices, links, 'tftp-exact-block', '192.168.2.10', 'exact-block.cfg'))
  const transaction = result.results.find(item => item.requestId === 'tftp-exact-block')
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.response, contents)
  assert.ok(result.trace.some(summary => /TFTP DATA block 2\/2 .*\(0 bytes\)/.test(summary)))
  assert.ok(result.trace.some(summary => /TFTP ACK block 2/.test(summary)))
})

test('TFTP rejects an invalid requested filename before sending packets', () => {
  const { client, devices, links } = topology()
  assert.deepEqual(createTftpReadPackets(client, devices, links, 'tftp-invalid-name', '192.168.2.10', '../startup.cfg'), [])
})

test('TFTP disabled service and missing filename return specific transfer failures', () => {
  const { client, server, devices, links } = topology()
  server.config.tftpFiles = [{ name: 'startup.txt', contents: 'hostname Edge' }]
  const disabled = execute(devices, links, createTftpReadPackets(client, devices, links, 'tftp-disabled', '192.168.2.10', 'startup.txt'))
  assert.ok(disabled.results.some(item => item.requestId === 'tftp-disabled' && item.status === 'failed' && /TFTP service is disabled/.test(item.reason ?? '')))
  server.config.tftpServiceEnabled = true
  const missing = execute(devices, links, createTftpReadPackets(client, devices, links, 'tftp-missing', '192.168.2.10', 'missing.cfg'))
  assert.ok(missing.results.some(item => item.requestId === 'tftp-missing' && item.status === 'failed' && /TFTP file missing\.cfg was not found/.test(item.reason ?? '')))
})

test('TFTP client stores a completed download on the workstation after the final ACK', () => {
  const { client, server, devices, links } = topology()
  const contents = 'hostname ClassroomSwitch\ninterface vlan 10\n ip address 192.168.10.2 255.255.255.0\n'
  server.config.tftpServiceEnabled = true
  server.config.tftpFiles = [{ name: 'switch.cfg', contents }]
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestTftpRead(client.id, '192.168.2.10', 'switch.cfg')
  assert.ok(requestId)
  for (let i = 0; i < 1000 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().udpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.service, 'tftp')
  assert.equal(transaction?.response, contents)
  const downloaded = useNetworkStore.getState().devices.find(item => item.id === client.id)?.config.tftpClientFiles
  assert.deepEqual(downloaded?.map(file => ({ name: file.name, serverIp: file.serverIp, contents: file.contents })), [{ name: 'switch.cfg', serverIp: '192.168.2.10', contents }])
})

test('ASA TFTP inspection learns the server transfer port and carries a multi-block download through PAT', () => {
  const { client, asa, devices, links } = asaTftpTopology()
  const result = execute(devices, links, createTftpReadPackets(client, devices, links, 'asa-tftp-read', '203.0.113.10', 'campus.cfg'))
  const transaction = result.results.find(item => item.requestId === 'asa-tftp-read')

  assert.equal(result.packets.length, 0)
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.response, 'x'.repeat(700))
  assert.ok(result.trace.some(summary => summary.includes('ASA reverse PAT')))
  assert.ok(result.trace.some(summary => summary.includes('TFTP DATA block 2/2')))
  const translation = result.devices.find(item => item.id === asa.id)?.asaNatTranslations?.find(item => item.protocol === 'UDP')
  assert.ok(translation)
  assert.notEqual(translation.remoteDestinationPort, 69)

  const noTftpInspection = asaTftpTopology()
  noTftpInspection.asa.config.asaInspection = { ...noTftpInspection.asa.config.asaInspection!, tftp: false }
  const blocked = execute(noTftpInspection.devices, noTftpInspection.links, createTftpReadPackets(noTftpInspection.client, noTftpInspection.devices, noTftpInspection.links, 'asa-tftp-inspection-off', '203.0.113.10', 'campus.cfg'))
  assert.ok(blocked.results.some(item => item.requestId === 'asa-tftp-inspection-off' && item.status === 'failed' && /ASA firewall dropped UDP response without a matching ASA translation/.test(item.reason ?? '')), JSON.stringify({ results: blocked.results, trace: blocked.trace, asa: blocked.devices.find(item => item.id === noTftpInspection.asa.id)?.asaNatTranslations }))
})

test('SNMPv2c GET and GETNEXT return configured system scalar values over routed UDP', () => {
  const { client, server, devices, links } = topology()
  server.config.snmpCommunities = ['classroom']
  server.config.hostname = 'server'
  server.config.snmpSystemContact = 'netlab@example.edu'
  server.config.snmpSystemLocation = 'Building A'
  const getPackets = createSnmpQueryPackets(client, devices, links, 'snmp-get', '192.168.2.10', 'get', '1.3.6.1.2.1.1.5.0', 'classroom')
  assert.ok(getPackets.length > 0)
  const getRequest = getPackets[0].pdu.pendingPacket ?? getPackets[0].pdu
  assert.equal(getRequest.payload.udpService, 'snmp')
  assert.equal(getRequest.payload.udpDestinationPort, 161)
  assert.equal(getRequest.payload.snmpVersion, '2c')
  const getResult = execute(devices, links, getPackets)
  const getTransaction = getResult.results.find(item => item.requestId === 'snmp-get')
  assert.equal(getTransaction?.status, 'successful')
  assert.equal(getTransaction?.service, 'snmp')
  assert.equal(getTransaction?.oid, '1.3.6.1.2.1.1.5.0')
  assert.equal(getTransaction?.value, 'server')
  assert.ok(getResult.trace.some(summary => /SNMPv2c GET response/.test(summary)))

  const nextResult = execute(devices, links, createSnmpQueryPackets(client, devices, links, 'snmp-next', '192.168.2.10', 'get-next', '1.3.6.1.2.1.1.1.0', 'classroom'))
  const nextTransaction = nextResult.results.find(item => item.requestId === 'snmp-next')
  assert.equal(nextTransaction?.status, 'successful')
  assert.equal(nextTransaction?.oid, '1.3.6.1.2.1.1.4.0')
  assert.equal(nextTransaction?.value, 'netlab@example.edu')
  const endOfMib = execute(devices, links, createSnmpQueryPackets(client, devices, links, 'snmp-end', '192.168.2.10', 'get-next', '1.3.6.1.2.1.1.6.0', 'classroom'))
  assert.ok(endOfMib.results.some(item => item.requestId === 'snmp-end' && item.status === 'successful' && item.value === 'endOfMibView'))
})

test('SNMP requires an enabled agent and matching community and reports unsupported OIDs clearly', () => {
  const { client, server, devices, links } = topology()
  const disabled = execute(devices, links, createSnmpQueryPackets(client, devices, links, 'snmp-disabled', '192.168.2.10', 'get', '1.3.6.1.2.1.1.5.0', 'classroom'))
  assert.ok(disabled.results.some(item => item.requestId === 'snmp-disabled' && item.status === 'failed' && /SNMP agent is not configured/.test(item.reason ?? '')))
  server.config.snmpCommunities = ['classroom']
  const unauthorized = execute(devices, links, createSnmpQueryPackets(client, devices, links, 'snmp-community', '192.168.2.10', 'get', '1.3.6.1.2.1.1.5.0', 'wrong'))
  assert.ok(unauthorized.results.some(item => item.requestId === 'snmp-community' && item.status === 'failed' && /community is invalid/.test(item.reason ?? '')))
  const unsupported = execute(devices, links, createSnmpQueryPackets(client, devices, links, 'snmp-oid', '192.168.2.10', 'get', '1.3.6.1.2.1.99.1.0', 'classroom'))
  assert.ok(unsupported.results.some(item => item.requestId === 'snmp-oid' && item.status === 'successful' && /noSuchObject/.test(item.response ?? '')))
})

test('SNMP manager stores GET results and rejects malformed OIDs before sending', () => {
  const { client, server, devices, links } = topology()
  server.config.snmpCommunities = ['classroom']
  server.config.hostname = 'server'
  assert.deepEqual(createSnmpQueryPackets(client, devices, links, 'snmp-invalid', '192.168.2.10', 'get', '1.3.not-an-oid', 'classroom'), [])
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestSnmpQuery(client.id, '192.168.2.10', 'get', '1.3.6.1.2.1.1.5.0', 'classroom')
  assert.ok(requestId)
  for (let i = 0; i < 400 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().udpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.oid, '1.3.6.1.2.1.1.5.0')
  assert.equal(transaction?.value, 'server')
})

test('UDP Echo transaction completes through the shared network store', () => {
  const { client, devices, links } = topology()
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestUdpEcho(client.id, '192.168.2.10', 9000, 'store round trip')
  assert.ok(requestId)
  for (let i = 0; i < 400 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().udpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.response, 'store round trip')
})

test('Complex PDU UDP Echo selection stores the request and updates its result row', () => {
  const { client, devices, links } = topology()
  useNetworkStore.getState().loadLab(devices, links)
  useWorkspaceStore.getState().firePdu(client.id, 'server', '192.168.2.10', { protocol: 'UDP', port: 9000, data: 'PDU round trip' })
  const entry = useWorkspaceStore.getState().pdus.at(-1)
  assert.equal(entry?.protocol, 'UDP')
  assert.equal(entry?.udpPort, 9000)
  assert.equal(entry?.status, 'In Progress')
  for (let i = 0; i < 400 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const completed = useWorkspaceStore.getState().pdus.find(item => item.id === entry?.id)
  assert.equal(completed?.status, 'Successful')
})

test('UDP Echo to an unreachable host fails after ARP resolution expires', () => {
  const { client, devices, links } = topology()
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestUdpEcho(client.id, '192.168.1.99', 7, 'hello')
  assert.ok(requestId)
  for (let i = 0; i < 400 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().udpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'failed')
  assert.match(transaction?.reason ?? '', /No UDP Echo response arrived/)
})
