import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from '@/simulator/deviceFactory'
import { useNetworkStore } from './networkStore'
import { defaultTrafficGeneratorSettings, type TrafficGeneratorSettings } from '@/simulator/trafficGenerator'

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
