import test from 'node:test'
import assert from 'node:assert/strict'
import type { InFlightPacket, PacketPdu } from '@/types/network'
import {
  defaultTrafficGeneratorSettings,
  parseTrafficGeneratorInterval,
  stampTrafficGeneratorPackets,
  trafficGeneratorFrameOptions,
  trafficGeneratorPaddedData,
  trafficGeneratorIntervalTicks,
  validateTrafficGeneratorSettings,
  TRAFFIC_GENERATOR_MAX_INTERVAL_SECONDS,
  TRAFFIC_GENERATOR_MIN_INTERVAL_SECONDS,
  type TrafficGeneratorApplication,
  type TrafficGeneratorSettings,
} from '@/simulator/trafficGenerator'

function settingsFor(application: TrafficGeneratorApplication, patch: Partial<TrafficGeneratorSettings> = {}): TrafficGeneratorSettings {
  return { ...defaultTrafficGeneratorSettings(), application, target: '10.0.0.2', ...patch }
}

function packetWith(pdu: Partial<PacketPdu>): InFlightPacket {
  const base: PacketPdu = {
    id: 'pdu-1',
    protocol: 'ICMP',
    summary: 'ICMP echo request',
    sourceMac: 'aa:aa:aa:aa:aa:aa',
    destMac: 'bb:bb:bb:bb:bb:bb',
    etherType: '0x0800',
    sourceIp: '10.0.0.1',
    destIp: '10.0.0.2',
    ttl: 128,
    explanation: { layer1: 'l1', layer2: 'l2', layer3: 'l3', layer4AndAbove: 'l4', deviceDecision: 'decision' },
    payload: {},
    ...pdu,
  }
  return { id: `frame-${base.id}`, pdu: base } as unknown as InFlightPacket
}

test('interval parsing accepts only finite decimals inside the reference range', () => {
  assert.deepEqual(parseTrafficGeneratorInterval('1'), { ok: true, seconds: 1 })
  assert.deepEqual(parseTrafficGeneratorInterval('0.001'), { ok: true, seconds: 0.001 })
  assert.deepEqual(parseTrafficGeneratorInterval('1,000,000'.replace(/,/g, '')), { ok: true, seconds: TRAFFIC_GENERATOR_MAX_INTERVAL_SECONDS })
  assert.deepEqual(parseTrafficGeneratorInterval(''), { ok: false, error: 'interval-invalid' })
  assert.deepEqual(parseTrafficGeneratorInterval('abc'), { ok: false, error: 'interval-invalid' })
  assert.deepEqual(parseTrafficGeneratorInterval('-1'), { ok: false, error: 'interval-invalid' })
  assert.deepEqual(parseTrafficGeneratorInterval('1e3'), { ok: false, error: 'interval-invalid' })
  assert.deepEqual(parseTrafficGeneratorInterval('0.0009'), { ok: false, error: 'interval-range' })
  assert.deepEqual(parseTrafficGeneratorInterval(String(TRAFFIC_GENERATOR_MAX_INTERVAL_SECONDS + 1)), { ok: false, error: 'interval-range' })
  const parsedMin = parseTrafficGeneratorInterval('0.001')
  assert.ok(parsedMin.ok && parsedMin.seconds >= TRAFFIC_GENERATOR_MIN_INTERVAL_SECONDS)
})

test('interval seconds convert to whole simulation ticks of 60 ms with a floor of one', () => {
  assert.equal(trafficGeneratorIntervalTicks(1), 17)
  assert.equal(trafficGeneratorIntervalTicks(0.06), 1)
  assert.equal(trafficGeneratorIntervalTicks(0.001), 1)
  assert.equal(trafficGeneratorIntervalTicks(60), 1000)
})

test('settings validation enforces each application target shape', () => {
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { target: '10.0.0.2' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { target: '2001:db8::2' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { target: 'not an address' })), 'target-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('http', { path: '/index.html' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('http', { path: 'index.html' })), 'path-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('http', { target: '2001:db8::2' })), 'target-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('tftp', { fileName: 'wirex.txt' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('tftp', { fileName: 'bad name' })), 'file-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('tftp', { fileName: '' })), 'file-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('udp', { port: 7 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('udp', { port: 0 })), 'port-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('udp', { port: 65536 })), 'port-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('udp', { port: Number.NaN })), 'port-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('dns', { target: 'server.example.test' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('dns', { target: 'localhost' })), 'domain-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('dns', { target: '10.0.0.2' })), 'domain-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('ntp', { target: '10.0.0.2' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('ntp', { target: '2001:db8::2' })), 'target-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { dscp: 12 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { dscp: 63 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { dscp: 64 })), 'dscp-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { dscp: -1 })), 'dscp-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { dscp: 3.5 })), 'dscp-invalid')
})

test('source overrides and the raw injector settings validate before dispatch', () => {
  assert.equal(validateTrafficGeneratorSettings(settingsFor('raw-udp', { port: 5001 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('raw-tcp', { port: 80 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('raw-udp', { target: 'not an address' })), 'target-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('raw-tcp', { port: 0 })), 'port-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('raw-tcp', { port: 70000 })), 'port-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourcePort: 0 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourcePort: 4000 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourcePort: 65535 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourcePort: 70000 })), 'source-port-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourcePort: 2.5 })), 'source-port-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { payloadSize: 0 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { payloadSize: 1472 })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { payloadSize: 1473 })), 'payload-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { payloadSize: -1 })), 'payload-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { payloadSize: 1.5 })), 'payload-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourceMac: '' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourceMac: '02:00:00:00:ab:cd' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourceMac: '02:00:00:00:ab' })), 'source-mac-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourceMac: '020000aabbcc' })), 'source-mac-invalid')

  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourceIp: '' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourceIp: '10.9.9.9' })), null)
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourceIp: '10.9.9' })), 'source-ip-invalid')
  assert.equal(validateTrafficGeneratorSettings(settingsFor('icmp', { sourceIp: '2001:db8::2' })), 'source-ip-invalid')
})

test('payload padding grows to the requested byte size only', () => {
  assert.equal(trafficGeneratorPaddedData('abc', 0), 'abc')
  assert.equal(trafficGeneratorPaddedData('abc', 3), 'abc')
  assert.equal(trafficGeneratorPaddedData('abc', 2), 'abc')
  assert.equal(trafficGeneratorPaddedData('abc', 32), `abc${'.'.repeat(29)}`)
  assert.equal(trafficGeneratorPaddedData('', 4), '....')
})

test('frame options lift the manual port and source overrides only when enabled', () => {
  const automatic = trafficGeneratorFrameOptions(defaultTrafficGeneratorSettings())
  assert.equal(automatic.portId, undefined)
  assert.equal(automatic.sourceIp, undefined)
  assert.equal(automatic.sourceMac, undefined)
  assert.equal(automatic.packetColor, undefined)

  const manual = trafficGeneratorFrameOptions({
    ...defaultTrafficGeneratorSettings(),
    autoSelectPort: false,
    outgoingPortId: ' port-1 ',
    sourceIp: ' 10.9.9.9 ',
    sourceMac: ' 02:00:00:00:ab:cd ',
    sourcePort: 4000,
    payloadSize: 64,
    packetColor: '#dc2626',
    dscp: 46,
  })
  assert.equal(manual.portId, 'port-1')
  assert.equal(manual.sourceIp, '10.9.9.9')
  assert.equal(manual.sourceMac, '02:00:00:00:ab:cd')
  assert.equal(manual.sourcePort, 4000)
  assert.equal(manual.payloadSize, 64)
  assert.equal(manual.packetColor, '#dc2626')
  assert.equal(manual.dscp, 46)
})

test('stamping marks only the frames correlated to the dispatch request id', () => {
  const packets = [packetWith({ id: 'pdu-1', pingId: 'req-1' }), packetWith({ id: 'pdu-2', pingId: 'req-2' })]
  const stamped = stampTrafficGeneratorPackets(packets, 'icmp', 'req-1', '#dc2626', 10)
  assert.notEqual(stamped, packets)
  assert.equal(stamped[0].pdu.generatorColor, '#dc2626')
  assert.equal(stamped[0].pdu.payload.dscp, 10)
  assert.equal(stamped[1], packets[1])
  assert.equal(stamped[1].pdu.generatorColor, undefined)
})

test('an ARP frame keeps the generator color and leaves DSCP to the pending IP packet', () => {
  const pending = packetWith({ id: 'pdu-inner', pingId: 'req-9', protocol: 'ICMP', payload: {} }).pdu
  const arp = packetWith({ id: 'pdu-arp', protocol: 'ARP', pendingPacket: pending })
  const stamped = stampTrafficGeneratorPackets([arp], 'icmp', 'req-9', '#2563eb', 46)[0]
  assert.equal(stamped.pdu.generatorColor, '#2563eb')
  assert.equal(stamped.pdu.payload.dscp, undefined)
  assert.equal(stamped.pdu.pendingPacket?.generatorColor, '#2563eb')
  assert.equal(stamped.pdu.pendingPacket?.payload.dscp, 46)
})

test('a run with neither color nor DSCP leaves the packet batch untouched', () => {
  const packets = [packetWith({ id: 'pdu-1', pingId: 'req-1' })]
  assert.equal(stampTrafficGeneratorPackets(packets, 'icmp', 'req-1', '', null), packets)
})

test('http frames match through either the TCP or HTTP correlation id', () => {
  const tcpOnly = packetWith({ id: 'pdu-1', protocol: 'TCP', payload: { tcpRequestId: 'req-5' } })
  const httpOnly = packetWith({ id: 'pdu-2', protocol: 'HTTP', payload: { httpRequestId: 'req-5' } })
  const stamped = stampTrafficGeneratorPackets([tcpOnly, httpOnly], 'http', 'req-5', '#16a34a', null)
  assert.equal(stamped[0].pdu.generatorColor, '#16a34a')
  assert.equal(stamped[1].pdu.generatorColor, '#16a34a')
})

test('a UDP correlation id does not leak into other applications', () => {
  const packets = [packetWith({ id: 'pdu-1', protocol: 'UDP', payload: { udpRequestId: 'req-7' } })]
  assert.equal(stampTrafficGeneratorPackets(packets, 'http', 'req-7', '#dc2626', null), packets)
  assert.equal(stampTrafficGeneratorPackets(packets, 'udp', 'req-7', '#dc2626', null)[0].pdu.generatorColor, '#dc2626')
})
