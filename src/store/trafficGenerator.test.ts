import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from '@/simulator/deviceFactory'
import { useNetworkStore } from './networkStore'
import { restoreWorkspaceFromStorage, saveWorkspaceToStorage, STORAGE_KEY } from './workspacePersistence'
import { defaultTrafficGeneratorSettings, type TrafficGeneratorSettings } from '@/simulator/trafficGenerator'

class MapStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function fixture() {
  const a = createDevice('pc', 0, 0), b = createDevice('pc', 100, 0)
  a.id = 'source'; b.id = 'target'
  for (const [device, ip] of [[a, '10.0.0.1'], [b, '10.0.0.2']] as const) Object.assign(device.ports[0], { ipAddress: ip, subnetMask: '255.255.255.0', status: 'up' })
  useNetworkStore.getState().loadLab([a, b], [])
  useNetworkStore.getState().connectPorts(a.id, a.ports[0].id, b.id, b.ports[0].id, 'crossover')
  useNetworkStore.setState({ simulationMode: 'realtime', simulationPlaying: true, trafficGenerators: [] })
  return { a, b }
}

function pingSettings(patch: Partial<TrafficGeneratorSettings> = {}): TrafficGeneratorSettings {
  return { ...defaultTrafficGeneratorSettings(), application: 'icmp', target: '10.0.0.2', ...patch }
}

test('starting a run dispatches the first PDU immediately and replaces a previous run for the device', () => {
  const { a } = fixture()
  const first = useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 1)
  assert.equal(first.ok, true)
  let runs = useNetworkStore.getState().trafficGenerators
  assert.equal(runs.length, 1)
  assert.equal(runs[0].sentCount, 1)
  assert.ok(runs[0].lastRequestId)
  assert.ok(useNetworkStore.getState().inFlightPackets.length > 0)

  const second = useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 1)
  assert.equal(second.ok, true)
  runs = useNetworkStore.getState().trafficGenerators
  assert.equal(runs.length, 1)
  if (first.ok && second.ok) assert.notEqual(first.runId, second.runId)
})

test('a one-second run sends once per seventeen ticks without a burst catch-up', () => {
  const { a } = fixture()
  const started = useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 1)
  assert.equal(started.ok, true)
  const runId = started.ok ? started.runId : ''
  const sent = () => useNetworkStore.getState().trafficGenerators.find(run => run.id === runId)?.sentCount ?? -1
  assert.equal(sent(), 1)

  const startTick = useNetworkStore.getState().simulationTick
  while (useNetworkStore.getState().simulationTick < startTick + 16) useNetworkStore.getState().tickSimulation()
  assert.equal(sent(), 1)
  useNetworkStore.getState().tickSimulation()
  assert.equal(sent(), 2)

  while (useNetworkStore.getState().simulationTick < startTick + 33) useNetworkStore.getState().tickSimulation()
  assert.equal(sent(), 2)
  useNetworkStore.getState().tickSimulation()
  assert.equal(sent(), 3)
})

test('stopping a run halts dispatch and the network drains afterwards', () => {
  const { a } = fixture()
  const started = useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 0.06)
  assert.equal(started.ok, true)
  for (let index = 0; index < 3; index++) useNetworkStore.getState().tickSimulation()
  const run = useNetworkStore.getState().trafficGenerators.find(candidate => candidate.deviceId === a.id)
  assert.ok(run)
  assert.ok((run?.sentCount ?? 0) >= 3)

  if (run) useNetworkStore.getState().stopTrafficGenerator(run.id)
  assert.equal(useNetworkStore.getState().trafficGenerators.length, 0)
  for (let index = 0; index < 40 && useNetworkStore.getState().inFlightPackets.length; index++) useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().inFlightPackets.length, 0)
})

test('invalid settings, bad intervals and unknown devices are rejected before any dispatch', () => {
  const { a } = fixture()
  const bad = pingSettings({ target: 'not-an-address' })
  assert.deepEqual(useNetworkStore.getState().startTrafficGenerator(a.id, bad, 1), { ok: false, error: 'target-invalid' })
  assert.deepEqual(useNetworkStore.getState().sendTrafficGeneratorOnce(a.id, bad), { ok: false, error: 'target-invalid' })
  assert.deepEqual(useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), Number.NaN), { ok: false, error: 'interval-range' })
  assert.deepEqual(useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 0), { ok: false, error: 'interval-range' })
  assert.deepEqual(useNetworkStore.getState().startTrafficGenerator('missing', pingSettings(), 1), { ok: false, error: 'device-missing' })
  assert.deepEqual(useNetworkStore.getState().sendTrafficGeneratorOnce('missing', pingSettings()), { ok: false, error: 'device-missing' })
  assert.equal(useNetworkStore.getState().trafficGenerators.length, 0)
  assert.equal(useNetworkStore.getState().inFlightPackets.length, 0)
})

test('deleting the source device and rebuilding the topology stop its run', () => {
  const { a, b } = fixture()
  useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 1)
  useNetworkStore.getState().deleteDevice(a.id)
  assert.equal(useNetworkStore.getState().trafficGenerators.length, 0)

  useNetworkStore.getState().loadLab([a, b], [])
  useNetworkStore.setState({ simulationMode: 'realtime', simulationPlaying: true })
  useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 1)
  assert.equal(useNetworkStore.getState().trafficGenerators.length, 1)
  useNetworkStore.getState().clearSimulation()
  assert.equal(useNetworkStore.getState().trafficGenerators.length, 0)

  useNetworkStore.getState().loadLab([a, b], [])
  useNetworkStore.setState({ simulationMode: 'realtime', simulationPlaying: true })
  useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 1)
  useNetworkStore.getState().loadLab([a, b], [])
  assert.equal(useNetworkStore.getState().trafficGenerators.length, 0)

  useNetworkStore.setState({ simulationMode: 'realtime', simulationPlaying: true })
  useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 1)
  useNetworkStore.getState().resetTopology()
  assert.equal(useNetworkStore.getState().trafficGenerators.length, 0)
})

test('generated frames carry the configured color and DSCP while ARP frames keep only the color', () => {
  const { a } = fixture()
  const result = useNetworkStore.getState().sendTrafficGeneratorOnce(a.id, pingSettings({ packetColor: '#dc2626', dscp: 46 }))
  assert.equal(result.ok, true)
  const packets = useNetworkStore.getState().inFlightPackets
  const arp = packets.find(packet => packet.pdu.protocol === 'ARP')
  assert.ok(arp, 'expected an ARP broadcast while the next-hop MAC is unresolved')
  assert.equal(arp?.pdu.generatorColor, '#dc2626')
  assert.equal(arp?.pdu.payload.dscp, undefined)
  assert.equal(arp?.pdu.pendingPacket?.generatorColor, '#dc2626')
  assert.equal(arp?.pdu.pendingPacket?.payload.dscp, 46)

  let echoRequest: (typeof packets)[number] | undefined
  for (let index = 0; index < 20 && !echoRequest; index++) {
    useNetworkStore.getState().tickSimulation()
    echoRequest = useNetworkStore.getState().inFlightPackets.find(packet => packet.pdu.protocol === 'ICMP' && packet.pdu.payload.icmpType === 'echo-request')
  }
  assert.ok(echoRequest, 'expected the resolved echo request to reach the wire')
  assert.equal(echoRequest?.pdu.generatorColor, '#dc2626')
  assert.equal(echoRequest?.pdu.payload.dscp, 46)
})

test('an idle network still advances the clock while a run is active', () => {
  const { a } = fixture()
  const started = useNetworkStore.getState().startTrafficGenerator(a.id, pingSettings(), 1)
  assert.equal(started.ok, true)
  for (let index = 0; index < 40 && useNetworkStore.getState().inFlightPackets.length; index++) useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().inFlightPackets.length, 0)
  const idleTick = useNetworkStore.getState().simulationTick
  useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().simulationTick, idleTick + 1)
})

function rawSettings(patch: Partial<TrafficGeneratorSettings> = {}): TrafficGeneratorSettings {
  return { ...defaultTrafficGeneratorSettings(), application: 'raw-udp', target: '10.0.0.2', port: 5001, ...patch }
}

function findRawPdu(protocol: 'UDP' | 'TCP') {
  for (const packet of useNetworkStore.getState().inFlightPackets) {
    const candidates = [packet.pdu, packet.pdu.pendingPacket].filter((pdu): pdu is NonNullable<typeof pdu> => Boolean(pdu))
    const found = candidates.find(pdu => pdu.protocol === protocol && (pdu.payload.udpService === 'raw' || pdu.payload.tcpApplication === 'RAW'))
    if (found) return found
  }
  return undefined
}

function recordRawTcpFlags(maxTicks: number): string[] {
  const seen: string[] = []
  const ids = new Set<string>()
  const collect = () => {
    for (const packet of useNetworkStore.getState().inFlightPackets) {
      const candidates = [packet.pdu, packet.pdu.pendingPacket].filter((pdu): pdu is NonNullable<typeof pdu> => Boolean(pdu))
      for (const pdu of candidates) {
        if (pdu.protocol === 'TCP' && pdu.payload.tcpApplication === 'RAW' && pdu.payload.tcpFlags && !ids.has(pdu.id)) {
          ids.add(pdu.id)
          seen.push(pdu.payload.tcpFlags)
        }
      }
    }
  }
  collect()
  for (let index = 0; index < maxTicks && seen.length < 3; index++) {
    useNetworkStore.getState().tickSimulation()
    collect()
  }
  return seen
}

test('a raw UDP datagram is injected with the configured ports and padded payload', () => {
  const { a } = fixture()
  const result = useNetworkStore.getState().sendTrafficGeneratorOnce(a.id, rawSettings({ sourcePort: 4000, payloadSize: 24, data: 'hello' }))
  assert.equal(result.ok, true)
  const pdu = findRawPdu('UDP')
  assert.ok(pdu, 'expected a raw UDP datagram on the wire')
  assert.equal(pdu?.payload.udpMessageType, 'request')
  assert.equal(pdu?.payload.udpService, 'raw')
  assert.equal(pdu?.payload.udpSourcePort, 4000)
  assert.equal(pdu?.payload.udpDestinationPort, 5001)
  assert.equal(pdu?.payload.udpData, `hello${'.'.repeat(19)}`)
  assert.equal(pdu?.payload.udpRequestId, undefined)
  assert.match(pdu?.summary ?? '', /Raw UDP datagram to 10\.0\.0\.2:5001/)

  const deliveries = useNetworkStore.getState()
  assert.equal(deliveries.udpTransactions.length, 0)
})

test('a raw TCP SYN completes the modeled handshake and a closed port answers with a reset', () => {
  const a = createDevice('pc', 0, 0)
  const server = createDevice('server', 100, 0)
  a.id = 'raw-source'
  server.id = 'raw-server'
  Object.assign(a.ports[0], { ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', status: 'up' })
  Object.assign(server.ports[0], { ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', status: 'up' })
  server.config.httpServiceEnabled = true
  useNetworkStore.getState().loadLab([a, server], [])
  useNetworkStore.getState().connectPorts(a.id, a.ports[0].id, server.id, server.ports[0].id, 'straight')
  useNetworkStore.setState({ simulationMode: 'realtime', simulationPlaying: true, trafficGenerators: [] })

  assert.equal(useNetworkStore.getState().sendTrafficGeneratorOnce(a.id, rawSettings({ application: 'raw-tcp', port: 80 })).ok, true)
  assert.deepEqual(recordRawTcpFlags(30), ['SYN', 'SYN-ACK', 'ACK'])

  for (let index = 0; index < 60 && useNetworkStore.getState().inFlightPackets.length; index++) useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().sendTrafficGeneratorOnce(a.id, rawSettings({ application: 'raw-tcp', port: 9999 })).ok, true)
  assert.deepEqual(recordRawTcpFlags(30), ['SYN', 'RST-ACK'])
})

test('raw injectors honor a pinned outgoing port and L2/L3 source overrides', () => {
  const { a } = fixture()
  const pinned = rawSettings({
    autoSelectPort: false,
    outgoingPortId: a.ports[0].id,
    sourceMac: '02:00:00:00:ab:cd',
    sourceIp: '10.9.9.9',
    packetColor: '#dc2626',
    dscp: 46,
  })
  const result = useNetworkStore.getState().sendTrafficGeneratorOnce(a.id, pinned)
  assert.equal(result.ok, true)
  const pdu = findRawPdu('UDP')
  assert.equal(pdu?.sourceMac, '02:00:00:00:ab:cd')
  assert.equal(pdu?.sourceIp, '10.9.9.9')
  assert.equal(pdu?.generatorColor, '#dc2626')
  assert.equal(pdu?.payload.dscp, 46)

  assert.deepEqual(
    useNetworkStore.getState().sendTrafficGeneratorOnce(a.id, { ...pinned, outgoingPortId: 'missing-port' }),
    { ok: false, error: 'port-unknown' },
  )
  assert.deepEqual(
    useNetworkStore.getState().startTrafficGenerator(a.id, { ...pinned, outgoingPortId: 'missing-port' }, 1),
    { ok: false, error: 'port-unknown' },
  )
})

test('periodic runs survive a workspace save and restore', () => {
  const { a } = fixture()
  const started = useNetworkStore.getState().startTrafficGenerator(a.id, rawSettings({ sourcePort: 4000, payloadSize: 16 }), 2)
  assert.equal(started.ok, true)
  for (let index = 0; index < 3; index++) useNetworkStore.getState().tickSimulation()
  const savedCount = useNetworkStore.getState().trafficGenerators[0]?.sentCount ?? 0
  assert.ok(savedCount >= 1)

  const storage = new MapStorage()
  assert.equal(saveWorkspaceToStorage(storage), true)
  useNetworkStore.getState().resetTopology()
  assert.equal(useNetworkStore.getState().trafficGenerators.length, 0)

  assert.equal(restoreWorkspaceFromStorage(storage), true)
  const runs = useNetworkStore.getState().trafficGenerators
  assert.equal(runs.length, 1)
  assert.equal(runs[0].deviceId, a.id)
  assert.equal(runs[0].settings.application, 'raw-udp')
  assert.equal(runs[0].settings.sourcePort, 4000)
  assert.equal(runs[0].settings.payloadSize, 16)
  assert.equal(runs[0].sentCount, savedCount)
  assert.ok(runs[0].nextDueTick > useNetworkStore.getState().simulationTick)
})

test('restored runs drop entries whose source device no longer exists', () => {
  const { a } = fixture()
  assert.equal(useNetworkStore.getState().startTrafficGenerator(a.id, rawSettings(), 1).ok, true)
  const storage = new MapStorage()
  assert.equal(saveWorkspaceToStorage(storage), true)
  const snapshot = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')
  assert.equal(snapshot.trafficGenerators.length, 1)
  snapshot.devices = snapshot.devices.filter((device: { id: string }) => device.id !== a.id)
  snapshot.links = snapshot.links.filter((link: { fromDeviceId: string; toDeviceId: string }) => link.fromDeviceId !== a.id && link.toDeviceId !== a.id)
  storage.setItem(STORAGE_KEY, JSON.stringify(snapshot))

  assert.equal(restoreWorkspaceFromStorage(storage), true)
  assert.equal(useNetworkStore.getState().trafficGenerators.length, 0)
})

test('the payload-size editor pads the UDP Echo request as well', () => {
  const { a } = fixture()
  const result = useNetworkStore.getState().sendTrafficGeneratorOnce(a.id, {
    ...defaultTrafficGeneratorSettings(), application: 'udp', target: '10.0.0.2', port: 7, payloadSize: 32, data: 'abc',
  })
  assert.equal(result.ok, true)
  let data: string | undefined
  for (const packet of useNetworkStore.getState().inFlightPackets) {
    const candidates = [packet.pdu, packet.pdu.pendingPacket].filter((pdu): pdu is NonNullable<typeof pdu> => Boolean(pdu))
    const found = candidates.find(pdu => pdu.protocol === 'UDP' && pdu.payload.udpDestinationPort === 7)
    if (found) {
      data = found.payload.udpData
      break
    }
  }
  assert.equal(data, `abc${'.'.repeat(29)}`)
})
