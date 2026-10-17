import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from './deviceFactory'
import { createHttpGetPackets, stepSimulationTick } from './engine'
import type { DeviceType, InFlightPacket, NetworkDevice, NetworkLink, TcpOutstandingSegment, TcpReassemblyBuffer } from '../types/network'
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

function topology(httpEnabled: boolean) {
  const pc = device('pc', 'pc', '192.168.1.10')
  pc.config.defaultGateway = '192.168.1.1'
  const router = device('router', 'router', '192.168.1.1')
  router.ports[1].ipAddress = '192.168.2.1'
  for (const port of router.ports.slice(0, 2)) router.routingTable.push({ network: port.ipAddress!.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: port.name, metric: 0, type: 'C' })
  const server = device('server', 'server', '192.168.2.10')
  server.config.defaultGateway = '192.168.2.1'
  server.config.httpServiceEnabled = httpEnabled
  server.config.htmlContent = '<h1>Lab page</h1>'
  const links = [connect(pc, 0, router, 0), connect(router, 1, server, 0)]
  return { pc, router, server, devices: [pc, router, server], links }
}

function execute(devices: NetworkDevice[], links: NetworkLink[], packets: InFlightPacket[], reverseInFlight = false, dropOnce?: (packet: InFlightPacket) => boolean, dropAlways = false, duplicateOnce?: (packet: InFlightPacket) => boolean) {
  const results: ReturnType<typeof stepSimulationTick>['applicationResults'] = []
  const trace: string[] = []
  const seenPdus = new Map<string, InFlightPacket['pdu']>()
  let tcpReceiveBuffers: TcpReassemblyBuffer[] = []
  let tcpOutstandingSegments: TcpOutstandingSegment[] = []
  let droppedPacket = false
  let duplicatedPacket = false
  for (let i = 0; i < 1200 && (packets.length > 0 || tcpOutstandingSegments.length > 0); i++) {
    if (reverseInFlight) packets = [...packets].reverse()
    trace.push(...packets.map(packet => packet.pdu.summary))
    for (const packet of packets) {
      seenPdus.set(packet.pdu.id, packet.pdu)
      if (packet.pdu.pendingPacket) seenPdus.set(packet.pdu.pendingPacket.id, packet.pdu.pendingPacket)
    }
    const step = stepSimulationTick(devices, links, packets, tcpReceiveBuffers, tcpOutstandingSegments)
    devices = step.updatedDevices
    packets = step.newInFlightPackets
    for (const packet of packets) seenPdus.set(packet.pdu.id, packet.pdu)
    if (dropOnce && (dropAlways || !droppedPacket)) {
      const lost = packets.find(dropOnce)
      if (lost) {
        packets = packets.filter(packet => packet.pdu.id !== lost.pdu.id)
        droppedPacket = true
      }
    }
    if (duplicateOnce && !duplicatedPacket) {
      const duplicate = packets.find(duplicateOnce)
      if (duplicate) {
        packets = [...packets, { ...duplicate, id: `${duplicate.id}-copy` }]
        duplicatedPacket = true
      }
    }
    tcpReceiveBuffers = step.tcpReceiveBuffers
    tcpOutstandingSegments = step.tcpOutstandingSegments
    results.push(...step.applicationResults)
  }
  return { devices, packets, results, trace, pdus: [...seenPdus.values()], droppedPacket, duplicatedPacket, tcpOutstandingSegments }
}

test('HTTP GET returns configured page only after a routed request and response traverse the topology', () => {
  const { pc, devices, links } = topology(true)
  const packets = createHttpGetPackets(pc, devices, links, 'http-1', '192.168.2.10', '/index.html')
  assert.ok(packets.length > 0)
  const initialSegment = packets[0].pdu.pendingPacket ?? packets[0].pdu
  assert.equal(initialSegment.protocol, 'TCP')
  assert.equal(initialSegment.payload.tcpFlags, 'SYN')
  assert.equal(initialSegment.payload.tcpDestinationPort, 80)
  const result = execute(devices, links, packets)
  assert.equal(result.packets.length, 0)
  assert.ok(result.results.some(item => item.requestId === 'http-1' && item.status === 'successful' && item.response === '<h1>Lab page</h1>'))
  assert.ok(result.trace.some(summary => summary.includes('TCP SYN-ACK')))
  assert.ok(result.trace.some(summary => summary.includes('TCP ACK')))
  assert.ok(result.trace.some(summary => summary.includes('HTTP GET /index.html')))
  assert.ok(result.trace.some(summary => summary.includes('HTTP 200 response')))
  assert.ok(result.trace.some(summary => summary.includes('TCP FIN-ACK')))
  assert.ok(result.trace.some(summary => summary.includes('TCP ACK: connection closed')))
  const segment = (flags: NonNullable<InFlightPacket['pdu']['payload']['tcpFlags']>, method?: string) => result.pdus.find(pdu => pdu.payload.tcpFlags === flags && pdu.payload.httpMethod === method)!
  const syn = segment('SYN')
  const synAck = segment('SYN-ACK')
  const request = segment('ACK+PSH', 'GET')
  const response = segment('ACK+PSH', 'RESPONSE')
  const clientFin = result.pdus.find(pdu => pdu.payload.tcpFlags === 'FIN-ACK' && pdu.sourceIp === '192.168.1.10')!
  const serverFin = result.pdus.find(pdu => pdu.payload.tcpFlags === 'FIN-ACK' && pdu.sourceIp === '192.168.2.10')!
  const finalAck = result.pdus.find(pdu => pdu.payload.tcpFlags === 'ACK' && pdu.summary.includes('connection closed'))!
  assert.equal(synAck.payload.tcpAcknowledgmentNumber, syn.payload.tcpSequenceNumber! + 1)
  assert.equal(request.payload.tcpSequenceNumber, synAck.payload.tcpAcknowledgmentNumber)
  assert.equal(request.payload.tcpAcknowledgmentNumber, synAck.payload.tcpSequenceNumber! + 1)
  assert.equal(response.payload.tcpAcknowledgmentNumber, request.payload.tcpSequenceNumber! + request.payload.tcpDataLength!)
  assert.equal(clientFin.payload.tcpSequenceNumber, response.payload.tcpAcknowledgmentNumber)
  assert.equal(serverFin.payload.tcpAcknowledgmentNumber, clientFin.payload.tcpSequenceNumber! + 1)
  assert.equal(finalAck.payload.tcpAcknowledgmentNumber, serverFin.payload.tcpSequenceNumber! + 1)
})

test('HTTP request to a server without its HTTP service reports a simulated connection failure', () => {
  const { pc, devices, links } = topology(false)
  const result = execute(devices, links, createHttpGetPackets(pc, devices, links, 'http-2', '192.168.2.10', '/'))
  assert.ok(result.results.some(item => item.requestId === 'http-2' && item.status === 'failed' && /HTTP service is disabled/.test(item.reason ?? '')))
  assert.ok(result.trace.some(summary => summary.includes('TCP RST-ACK')))
})

test('TCP retransmits a lost SYN-ACK and completes the HTTP request', () => {
  const { pc, devices, links } = topology(true)
  const result = execute(
    devices,
    links,
    createHttpGetPackets(pc, devices, links, 'http-lost-synack', '192.168.2.10', '/'),
    false,
    packet => packet.pdu.payload.tcpFlags === 'SYN-ACK',
  )
  assert.equal(result.droppedPacket, true, 'the first SYN-ACK should be dropped by the test network')
  assert.ok(result.trace.some(summary => summary.includes('TCP retransmission 1/3') && summary.includes('SYN-ACK')))
  assert.ok(result.results.some(item => item.requestId === 'http-lost-synack' && item.status === 'successful'))
  assert.equal(result.pdus.filter(pdu => pdu.payload.httpMethod === 'GET').length, 1, 'a repeated SYN-ACK must not start a second HTTP request')
})

test('TCP retransmits a lost SYN and begins the HTTP request once', () => {
  const { pc, devices, links } = topology(true)
  const result = execute(
    devices,
    links,
    createHttpGetPackets(pc, devices, links, 'http-lost-syn', '192.168.2.10', '/'),
    false,
    packet => packet.pdu.payload.tcpFlags === 'SYN',
  )
  assert.equal(result.droppedPacket, true)
  assert.ok(result.trace.some(summary => summary.includes('TCP retransmission 1/3: TCP SYN')))
  assert.ok(result.results.some(item => item.requestId === 'http-lost-syn' && item.status === 'successful'))
  assert.equal(result.pdus.filter(pdu => pdu.payload.httpMethod === 'GET').length, 1)
})

test('TCP retransmits a lost HTTP response segment and reassembles the page', () => {
  const { pc, devices, links } = topology(true)
  const result = execute(
    devices,
    links,
    createHttpGetPackets(pc, devices, links, 'http-lost-response', '192.168.2.10', '/'),
    false,
    packet => packet.pdu.payload.httpMethod === 'RESPONSE',
  )
  assert.equal(result.droppedPacket, true, 'the first response segment should be dropped by the test network')
  assert.ok(result.trace.some(summary => /TCP retransmission 1\/3:.*response/i.test(summary)))
  assert.ok(result.results.some(item => item.requestId === 'http-lost-response' && item.status === 'successful' && item.response === '<h1>Lab page</h1>'))
})

test('TCP retransmits a lost HTTP request segment and still delivers the page', () => {
  const { pc, devices, links } = topology(true)
  const result = execute(
    devices,
    links,
    createHttpGetPackets(pc, devices, links, 'http-lost-request', '192.168.2.10', '/'),
    false,
    packet => packet.pdu.payload.httpMethod === 'GET',
  )
  assert.equal(result.droppedPacket, true)
  assert.ok(result.trace.some(summary => /TCP retransmission 1\/3:.*HTTP GET/i.test(summary)))
  assert.ok(result.results.some(item => item.requestId === 'http-lost-request' && item.status === 'successful'))
})

test('a duplicate completed HTTP request is acknowledged without starting another response', () => {
  const { pc, devices, links } = topology(true)
  const result = execute(
    devices,
    links,
    createHttpGetPackets(pc, devices, links, 'http-duplicate-request', '192.168.2.10', '/'),
    false,
    undefined,
    false,
    packet => packet.pdu.payload.httpMethod === 'GET',
  )
  assert.equal(result.duplicatedPacket, true)
  assert.ok(result.results.some(item => item.requestId === 'http-duplicate-request' && item.status === 'successful'))
  assert.equal(result.pdus.filter(pdu => pdu.payload.httpMethod === 'RESPONSE').length, 1)
})

test('TCP reports a bounded timeout after the response is lost on every retry', () => {
  const { pc, devices, links } = topology(true)
  const result = execute(
    devices,
    links,
    createHttpGetPackets(pc, devices, links, 'http-timeout', '192.168.2.10', '/'),
    false,
    packet => packet.pdu.payload.httpMethod === 'RESPONSE',
    true,
  )
  const outcome = result.results.find(item => item.requestId === 'http-timeout')
  const retries = result.pdus.filter(pdu => pdu.summary.startsWith('TCP retransmission ') && pdu.payload.httpMethod === 'RESPONSE')
  assert.equal(result.droppedPacket, true)
  assert.equal(retries.length, 3, 'each response segment should have exactly three retries')
  assert.equal(outcome?.status, 'failed')
  assert.match(outcome?.reason ?? '', /timed out after 3 retransmissions/)
  assert.equal(result.packets.length, 0)
  assert.equal(result.tcpOutstandingSegments.length, 0)
})

test('HTTP request creation rejects invalid addresses and paths', () => {
  const { pc, devices, links } = topology(true)
  assert.deepEqual(createHttpGetPackets(pc, devices, links, 'http-3', 'not-an-ip', '/'), [])
  assert.deepEqual(createHttpGetPackets(pc, devices, links, 'http-4', '192.168.2.10', 'not-a-path'), [])
  assert.deepEqual(createHttpGetPackets(pc, devices, links, 'http-5', '192.168.2.10', `/${'x'.repeat(2049)}`), [])
})

test('student browser transaction completes in the shared simulation store', () => {
  const { pc, devices, links } = topology(true)
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestHttp(pc.id, '192.168.2.10', '/index.html')
  assert.ok(requestId)
  for (let i = 0; i < 300 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().httpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.response, '<h1>Lab page</h1>')
  assert.equal(useNetworkStore.getState().inFlightPackets.length, 0)
})

test('oversized configured web pages return a bounded HTTP 413 response', () => {
  const { pc, server, devices, links } = topology(true)
  server.config.htmlContent = `<p>${'x'.repeat(65537)}</p>`
  const result = execute(devices, links, createHttpGetPackets(pc, devices, links, 'http-large', '192.168.2.10', '/'))
  assert.ok(result.results.some(item => item.requestId === 'http-large' && item.status === 'failed' && item.httpStatus === 413 && item.response === '<h1>413 Content Too Large</h1>'))
})

test('long HTTP requests and responses use MSS-sized TCP segments and reassemble before completion', () => {
  const { pc, server, devices, links } = topology(true)
  const page = `<main>${'شبكة wireX 🌐 '.repeat(300)}</main>`
  server.config.htmlContent = page
  const path = `/${'lesson-'.repeat(260)}`
  const result = execute(devices, links, createHttpGetPackets(pc, devices, links, 'http-segmented', '192.168.2.10', path), true)
  const requestSegments = result.pdus.filter(pdu => pdu.payload.httpMethod === 'GET')
  const responseSegments = result.pdus.filter(pdu => pdu.payload.httpMethod === 'RESPONSE')
  assert.ok(requestSegments.length > 1, 'the HTTP request should be divided into TCP segments')
  assert.ok(requestSegments.every(pdu => pdu.payload.tcpDataLength! <= 1460), 'each request segment should fit a 1460-byte MSS')
  const orderedRequest = requestSegments.sort((a, b) => a.payload.tcpSegmentIndex! - b.payload.tcpSegmentIndex!).map(pdu => pdu.payload.httpRequestChunk).join('')
  assert.equal(orderedRequest, `GET ${path} HTTP/1.1\r\nHost: 192.168.2.10\r\nConnection: close\r\n\r\n`)
  assert.ok(responseSegments.length > 1, 'the response should be divided into TCP segments')
  assert.ok(responseSegments.every(pdu => pdu.payload.tcpDataLength! <= 1460), 'each response segment should fit a 1460-byte MSS')
  assert.equal(new Set(responseSegments.map(pdu => (pdu.payload as Record<string, unknown>).tcpSegmentCount)).size, 1)
  assert.equal(responseSegments.sort((a, b) => a.payload.tcpSegmentIndex! - b.payload.tcpSegmentIndex!).map(pdu => pdu.payload.httpResponse).join(''), page)
  assert.ok(result.results.some(item => item.requestId === 'http-segmented' && item.status === 'successful' && item.response === page), 'the browser result should contain the reassembled response')
})

test('a response exactly at the 64 KiB limit is fully segmented and delivered', () => {
  const { pc, server, devices, links } = topology(true)
  const page = 'x'.repeat(65536)
  server.config.htmlContent = page
  const result = execute(devices, links, createHttpGetPackets(pc, devices, links, 'http-max-page', '192.168.2.10', '/max'))
  const responseSegments = result.pdus.filter(pdu => pdu.payload.httpMethod === 'RESPONSE')
  assert.ok(responseSegments.length > 40)
  assert.ok(responseSegments.every(pdu => pdu.payload.tcpDataLength! <= 1460))
  assert.ok(result.results.some(item => item.requestId === 'http-max-page' && item.status === 'successful' && item.response === page))
})

test('the shared browser store retains and clears TCP reassembly state for a large page', () => {
  const { pc, server, devices, links } = topology(true)
  const page = `<article>${'packet trace '.repeat(500)}</article>`
  server.config.htmlContent = page
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestHttp(pc.id, '192.168.2.10', '/large')
  for (let i = 0; i < 1200 && (useNetworkStore.getState().inFlightPackets.length || useNetworkStore.getState().tcpOutstandingSegments.length); i++) useNetworkStore.getState().tickSimulation()
  const transaction = useNetworkStore.getState().httpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'successful')
  assert.equal(transaction?.response, page)
  assert.equal(useNetworkStore.getState().tcpReceiveBuffers.length, 0)
  assert.equal(useNetworkStore.getState().tcpOutstandingSegments.length, 0)
})

test('shared HTTP transaction stays pending while TCP retries a drained packet and fails with the timeout reason', () => {
  const { pc, devices, links } = topology(true)
  useNetworkStore.getState().loadLab(devices, links)
  const requestId = useNetworkStore.getState().requestHttp(pc.id, '192.168.2.10', '/')
  assert.ok(requestId)
  useNetworkStore.setState(state => ({ links: state.links.map(link => ({ ...link, status: 'down' as const })) }))

  useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().httpTransactions.find(item => item.requestId === requestId)?.status, 'pending')
  assert.ok(useNetworkStore.getState().tcpOutstandingSegments.length > 0)

  for (let i = 0; i < 500 && useNetworkStore.getState().httpTransactions.find(item => item.requestId === requestId)?.status === 'pending'; i++) {
    useNetworkStore.getState().tickSimulation()
  }
  const transaction = useNetworkStore.getState().httpTransactions.find(item => item.requestId === requestId)
  assert.equal(transaction?.status, 'failed')
  assert.match(transaction?.reason ?? '', /timed out after 3 retransmissions/)
  assert.equal(useNetworkStore.getState().tcpOutstandingSegments.length, 0)
})

test('HTTP request denied by a router ACL fails instead of loading the page', () => {
  const { pc, router, devices, links } = topology(true)
  router.ports[0].inboundAcl = 'web-filter'
  router.config.accessLists = [{ id: 'web-filter', type: 'extended', rules: [{ type: 'extended', action: 'deny', protocol: 'tcp', sourceIp: 'any', destIp: 'any', destPort: 80 }] }]
  const result = execute(devices, links, createHttpGetPackets(pc, devices, links, 'http-acl', '192.168.2.10', '/'))
  assert.ok(result.results.some(item => item.requestId === 'http-acl' && item.status === 'failed' && /inbound ACL web-filter/.test(item.reason ?? '')))
  assert.equal(result.results.some(item => item.requestId === 'http-acl' && item.status === 'successful'), false)
})
