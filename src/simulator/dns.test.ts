import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from './deviceFactory'
import { createDnsQueryPackets, stepSimulationTick } from './engine'
import type { DeviceType, InFlightPacket, NetworkDevice, NetworkLink } from '../types/network'
import { useNetworkStore } from '../store/networkStore'

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
  const pc = device('pc', 'pc', '192.168.1.10')
  pc.config.defaultGateway = '192.168.1.1'
  pc.config.dnsServer = '192.168.2.10'
  const router = device('router', 'router', '192.168.1.1')
  router.ports[1].ipAddress = '192.168.2.1'
  for (const port of router.ports.slice(0, 2)) router.routingTable.push({ network: port.ipAddress!.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: port.name, metric: 0, type: 'C' })
  const server = device('server', 'dns', '192.168.2.10')
  server.config.defaultGateway = '192.168.2.1'
  server.config.dnsServiceEnabled = true
  server.config.dnsRecords = [{ domain: 'wirex.test', ip: '192.168.2.20' }]
  const links = [connect(pc, 0, router, 0), connect(router, 1, server, 0)]
  return { pc, router, server, devices: [pc, router, server], links }
}

function execute(devices: NetworkDevice[], links: NetworkLink[], packets: InFlightPacket[]) {
  const results: ReturnType<typeof stepSimulationTick>['applicationResults'] = []
  const dnsResults: ReturnType<typeof stepSimulationTick>['dnsResults'] = []
  const deliveries: ReturnType<typeof stepSimulationTick>['packetDeliveries'] = []
  for (let i = 0; i < 300 && packets.length; i++) {
    const step = stepSimulationTick(devices, links, packets)
    devices = step.updatedDevices
    packets = step.newInFlightPackets
    results.push(...step.applicationResults)
    dnsResults.push(...step.dnsResults)
    deliveries.push(...step.packetDeliveries)
  }
  return { packets, results: [...results, ...dnsResults], deliveries }
}

test('DNS query crosses routed topology over UDP and returns the configured A record', () => {
  const { pc, devices, links } = topology()
  const packets = createDnsQueryPackets(pc, devices, links, 'dns-1', 'WireX.Test')
  assert.ok(packets.length > 0)
  const requestPdu = packets[0].pdu.pendingPacket ?? packets[0].pdu
  assert.equal(requestPdu.protocol, 'DNS')
  assert.equal(requestPdu.payload.udpDestinationPort, 53)
  const result = execute(devices, links, packets)
  assert.equal(result.packets.length, 0)
  assert.ok(result.results.some(item => item.requestId === 'dns-1' && item.status === 'successful' && 'resolvedIp' in item && item.resolvedIp === '192.168.2.20'), JSON.stringify({ results: result.results, deliveries: result.deliveries }))
})

test('unknown DNS names return an explicit not-found result through the network', () => {
  const { pc, devices, links } = topology()
  const result = execute(devices, links, createDnsQueryPackets(pc, devices, links, 'dns-2', 'missing.wirex.test'))
  assert.ok(result.results.some(item => item.requestId === 'dns-2' && item.status === 'failed' && 'reason' in item && /does not exist/i.test(item.reason ?? '')), JSON.stringify({ results: result.results, deliveries: result.deliveries }))
})

test('DNS request denied by UDP port 53 ACL fails with the matching interface reason', () => {
  const { pc, router, devices, links } = topology()
  router.ports[0].inboundAcl = 'dns-filter'
  router.config.accessLists = [{ id: 'dns-filter', type: 'extended', rules: [{ type: 'extended', action: 'deny', protocol: 'udp', sourceIp: 'any', destIp: 'any', destPort: 53 }] }]
  const result = execute(devices, links, createDnsQueryPackets(pc, devices, links, 'dns-3', 'wirex.test'))
  assert.ok(result.results.some(item => item.requestId === 'dns-3' && item.status === 'failed' && 'reason' in item && /inbound ACL dns-filter/.test(item.reason ?? '')), JSON.stringify({ results: result.results, deliveries: result.deliveries }))
})

test('DNS query reports an unreachable resolver instead of staying pending after ARP expires', () => {
  const { pc, devices, links } = topology()
  pc.config.dnsServer = '192.168.2.99'
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestDns(pc.id, 'wirex.test')
  assert.ok(requestId)
  for (let i = 0; i < 300 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().dnsTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'failed')
  assert.match(transaction?.reason ?? '', /No DNS response arrived/)
})

test('HTTP request reports an unreachable host after bounded TCP retries', () => {
  const { pc, devices, links } = topology()
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestHttp(pc.id, '192.168.1.99', '/')
  assert.ok(requestId)
  for (let i = 0; i < 300 && (useNetworkStore.getState().inFlightPackets.length || useNetworkStore.getState().tcpOutstandingSegments.length); i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().httpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'failed')
  assert.match(transaction?.reason ?? '', /TCP SYN timed out after 3 retransmissions/)
})

test('DNS query creation requires a configured reachable IPv4 resolver and valid hostname', () => {
  const { pc, devices, links } = topology()
  assert.deepEqual(createDnsQueryPackets({ ...pc, config: { ...pc.config, dnsServer: undefined } }, devices, links, 'dns-4', 'wirex.test'), [])
  assert.deepEqual(createDnsQueryPackets(pc, devices, links, 'dns-5', 'not a host'), [])
  assert.deepEqual(createDnsQueryPackets(pc, devices, links, 'dns-6', 'wirex..test'), [])
})

test('DNS result is available through the shared simulation store', () => {
  const { pc, devices, links } = topology()
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestDns(pc.id, 'wirex.test')
  assert.ok(requestId)
  for (let i = 0; i < 300 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().dnsTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.resolvedIp, '192.168.2.20')
})

test('DNS resolution can continue into a routed HTTP request using the same browser transaction', () => {
  const { pc, server, devices, links } = topology()
  server.config.dnsRecords = [{ domain: 'wirex.test', ip: '192.168.2.10' }]
  server.config.httpServiceEnabled = true
  server.config.htmlContent = '<h1>Resolved through DNS</h1>'
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestDns(pc.id, 'wirex.test')
  assert.ok(requestId)
  for (let i = 0; i < 300 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const dns = useNetworkStore.getState().dnsTransactions.find(item => item.requestId === requestId)
  assert.equal(dns?.status, 'successful')
  const httpRequestId = useNetworkStore.getState().requestHttp(pc.id, dns?.resolvedIp ?? '', '/index.html', requestId)
  assert.equal(httpRequestId, requestId)
  for (let i = 0; i < 300 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const http = useNetworkStore.getState().httpTransactions.find(item => item.requestId === requestId)
  assert.equal(http?.status, 'successful')
  assert.equal(http?.response, '<h1>Resolved through DNS</h1>')
})
