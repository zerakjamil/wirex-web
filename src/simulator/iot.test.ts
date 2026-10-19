import assert from 'node:assert/strict'
import test from 'node:test'
import { createIotControlPackets, stepSimulationTick } from './engine'
import { createDevice } from './deviceFactory'
import { deviceCatalog } from './deviceCatalog'
import { getIotLab } from './starterLabs'
import { synchronizeLinkState } from './linkState'
import {
  applyIotLocalState,
  defaultIotState,
  hasIotActivity,
  iotClientOnline,
  iotKindOf,
  iotServerClients,
  iotStateOf,
  iotStateSummary,
  iotThingSpec,
  IOT_THINGS,
  prepareIotTick,
  sanitizeIotPatch,
  IOT_CLIENT_EXPIRE_TICKS,
  IOT_CLIENT_STALE_TICKS,
  IOT_DEFAULT_PASSWORD,
  IOT_DEFAULT_USERNAME,
} from './iot'
import { useNetworkStore } from '../store/networkStore'
import type { InFlightPacket, IotThingKind, NetworkDevice, NetworkLink, NetworkPort } from '../types/network'

function connect(a: NetworkDevice, aPortIndex: number, b: NetworkDevice, bPortIndex: number): NetworkLink {
  const aPort = a.ports[aPortIndex]
  const bPort = b.ports[bPortIndex]
  const link: NetworkLink = { id: `${a.id}-${aPort.id}-${b.id}-${bPort.id}`, type: 'straight', fromDeviceId: a.id, fromPortId: aPort.id, toDeviceId: b.id, toPortId: bPort.id, status: 'up' }
  Object.assign(aPort, { connectedLinkId: link.id, connectedDeviceId: b.id, connectedPortId: bPort.id })
  Object.assign(bPort, { connectedLinkId: link.id, connectedDeviceId: a.id, connectedPortId: aPort.id })
  return link
}

function addressPort(device: NetworkDevice, item: NetworkPort, ipAddress: string, subnetMask = '255.255.255.0') {
  Object.assign(item, { ipAddress, subnetMask, adminStatus: 'up' as const, status: 'up' as const })
  device.routingTable = device.routingTable.filter(route => !(route.type === 'C' && route.interfaceName === item.name))
  device.routingTable.push({ network: ipAddress.replace(/\.\d+$/, '.0'), netmask: subnetMask, nextHop: 'connected', interfaceName: item.name, metric: 0, type: 'C' })
  return item
}

function iotLab() {
  const server = createDevice('server', 0, 0, 'Server-PT')
  const sw = createDevice('switch', 0, 0, '2960-24TT')
  const lamp = createDevice('iot', 0, 0, 'Lamp-PT')
  const door = createDevice('iot', 0, 0, 'Door-PT')
  const detector = createDevice('iot', 0, 0, 'Smoke-Detector-PT')
  server.name = 'IoTServer'; sw.name = 'SW1'
  lamp.name = 'Lamp1'; door.name = 'Door1'; detector.name = 'Detector1'
  sw.ports.forEach(port => { port.portfast = true })
  addressPort(server, server.ports[0], '192.168.10.10')
  server.config.iotServiceEnabled = true
  server.config.iotCredentials = { username: IOT_DEFAULT_USERNAME, password: IOT_DEFAULT_PASSWORD }
  addressPort(lamp, lamp.ports[0], '192.168.10.21')
  addressPort(door, door.ports[0], '192.168.10.22')
  addressPort(detector, detector.ports[0], '192.168.10.23')
  const links = [
    connect(server, 0, sw, 0),
    connect(lamp, 0, sw, 1),
    connect(door, 0, sw, 2),
    connect(detector, 0, sw, 3),
  ]
  return { server, sw, lamp, door, detector, links, devices: [server, sw, lamp, door, detector] }
}

interface RunResult { devices: NetworkDevice[]; packets: InFlightPacket[]; trace: string[]; discarded: number }

function runTicks(ticks: number, packets?: InFlightPacket[], startTick = 1): RunResult {
  const store = useNetworkStore.getState()
  const sync = synchronizeLinkState(store.devices, store.links, store.simulationTick)
  let devices = sync.devices
  const links = sync.links
  let current = packets ?? store.inFlightPackets
  let discarded = 0
  const trace: string[] = []
  for (let i = 0; i < ticks; i++) {
    const step = stepSimulationTick(devices, links, current, [], [], startTick + i)
    for (const delivery of step.packetDeliveries) trace.push(delivery.reason ?? delivery.status)
    devices = step.updatedDevices
    current = step.newInFlightPackets
    discarded += step.discardedPackets
  }
  useNetworkStore.setState({ devices, links, simulationTick: startTick + ticks, inFlightPackets: current })
  return { devices, packets: current, trace, discarded }
}

const deviceById = (devices: NetworkDevice[], id: string) => devices.find(device => device.id === id)!

test('IoT factory defaults, catalog entries and spec lookup', () => {
  const lamp = createDevice('iot', 0, 0, 'Lamp-PT')
  assert.equal(lamp.type, 'iot')
  assert.equal(lamp.model, 'Lamp-PT')
  assert.equal(lamp.config.iotKind, 'lamp')
  assert.equal(lamp.config.iotServerAddress, 'auto')
  assert.equal(lamp.config.dhcpEnabled, true)
  assert.deepEqual(lamp.config.iotState, defaultIotState('lamp'))
  assert.deepEqual(lamp.ports.map(port => port.id), ['FastEthernet0', 'Wireless0'])
  assert.ok(lamp.ports.every(port => port.adminStatus === 'up'))
  assert.equal(iotKindOf(lamp), 'lamp')
  const unsupported = createDevice('iot', 0, 0, 'Unknown-Thing')
  assert.equal(unsupported.model, 'Lamp-PT')
  assert.equal(iotThingSpec('Fan-PT').kind, 'fan')
  assert.deepEqual(iotStateOf(unsupported), { power: false })
  const models = deviceCatalog.iot?.flatMap(entry => entry.models) ?? []
  assert.equal(models.length, IOT_THINGS.length)
  assert.equal(models.length, 48)
  assert.ok(models.includes('Smoke-Detector-PT'))
  assert.ok(models.includes('Push-Button-PT'))
  assert.ok(models.includes('Humiture Monitor'))
  assert.ok(models.includes('Webcam'))
  assert.ok(models.includes('Solar Panel'))
  assert.ok(models.includes('Fire Monitor'))
  assert.ok(models.includes('Smart LED'))
  const lab = getIotLab()
  assert.equal(lab.devices.filter(device => device.type === 'iot').length, 6)
  const server = lab.devices.find(device => device.name === 'IoTServer')
  assert.equal(server?.config.iotServiceEnabled, true)
  assert.equal(lab.devices.find(device => device.name === 'R1')?.config.dhcpPool?.startIp, '192.168.10.100')
  assert.ok(lab.links.length === 8)
})

test('PT smart-home shelf models map to real device classes and sensor state', () => {
  const expectations: Array<[string, IotThingKind]> = [
    ['AC', 'thermostat'],
    ['Appliance', 'appliance'],
    ['Bluetooth Speaker', 'speaker'],
    ['Ceiling Fan', 'fan'],
    ['Furnace', 'thermostat'],
    ['Garage Door', 'door'],
    ['Home Speaker', 'speaker'],
    ['Humidifier', 'humidifier'],
    ['Humiture Monitor', 'humiture'],
    ['Lawn Sprinkler', 'sprinkler'],
    ['Light', 'lamp'],
    ['Motion Detector', 'motion-sensor'],
    ['Portable Music Player', 'speaker'],
    ['Sound Frequency Detector', 'sound-sensor'],
    ['Water Level Monitor', 'water-detector'],
    ['Webcam', 'camera'],
  ]
  for (const [model, kind] of expectations) {
    const spec = iotThingSpec(model)
    assert.equal(spec.model, model)
    assert.equal(spec.kind, kind)
    const device = createDevice('iot', 0, 0, model)
    assert.equal(device.model, model)
    assert.equal(device.config.iotKind, kind)
    assert.deepEqual(device.config.iotState, defaultIotState(kind))
  }

  assert.deepEqual(sanitizeIotPatch('humiture', { temperature: 31.44, humidity: 55.6 }), { temperature: 31.4, humidity: 56 })
  assert.deepEqual(sanitizeIotPatch('humiture', { humidity: 120 }), { humidity: 100 })
  assert.deepEqual(sanitizeIotPatch('motion-sensor', { motion: true }), { motion: true })
  assert.deepEqual(sanitizeIotPatch('sound-sensor', { sound: 140 }), { sound: 100 })
  assert.deepEqual(sanitizeIotPatch('speaker', { power: true }), { power: true })
  assert.deepEqual(sanitizeIotPatch('camera', { power: false }), { power: false })
  assert.deepEqual(sanitizeIotPatch('humidifier', { level: 42.4 }), { level: 42 })

  assert.equal(iotStateSummary('humiture', { temperature: 22.5, humidity: 45 }), '22.5 C / 45% RH')
  assert.equal(iotStateSummary('motion-sensor', { motion: true }), 'motion detected')
  assert.equal(iotStateSummary('sound-sensor', { sound: 61 }), '61 dB')
  assert.equal(iotStateSummary('camera', { power: true }), 'on')
})

test('smart-city, industrial and power-grid models carry their own measurement units', () => {
  const sensors: Array<[string, string, number]> = [
    ['Atm Pressure Monitor', 'hPa', 1013],
    ['Carbon Dioxide Detector', 'ppm', 420],
    ['Carbon Monoxide Detector', 'ppm', 0],
    ['Humidity Monitor', '%', 45],
    ['Temperature Monitor', '°C', 22],
    ['Wind Detector', 'm/s', 3],
    ['Power Meter', 'W', 0],
  ]
  for (const [model, unit, reading] of sensors) {
    const device = createDevice('iot', 0, 0, model)
    assert.equal(device.config.iotKind, 'sensor')
    assert.equal(device.config.iotState?.unit, unit)
    assert.equal(device.config.iotState?.reading, reading)
    assert.ok(iotStateSummary('sensor', device.config.iotState!).includes(unit))
  }

  const solar = createDevice('iot', 0, 0, 'Solar Panel')
  assert.equal(solar.config.iotKind, 'generator')
  assert.deepEqual(solar.config.iotState, { output: 0 })
  assert.equal(iotStateSummary('generator', { output: 40 }), '40% output')

  const battery = createDevice('iot', 0, 0, 'Battery')
  assert.equal(battery.config.iotKind, 'battery')
  assert.deepEqual(battery.config.iotState, { level: 100 })
  assert.equal(iotStateSummary('battery', { level: 75 }), '75% charge')

  const drain = createDevice('iot', 0, 0, 'Water Drain')
  assert.equal(drain.config.iotKind, 'valve')
  assert.deepEqual(sanitizeIotPatch('valve', { open: true }), { open: true })
  assert.equal(iotStateSummary('valve', { open: true }), 'open')

  const fire = createDevice('iot', 0, 0, 'Fire Monitor')
  assert.equal(fire.config.iotKind, 'fire-detector')
  assert.deepEqual(sanitizeIotPatch('fire-detector', { fire: true }), { fire: true })
  assert.equal(iotStateSummary('fire-detector', { fire: true }), 'fire detected')

  assert.deepEqual(sanitizeIotPatch('sensor', { reading: 1013.44, unit: 'hPa' }), { reading: 1013.4, unit: 'hPa' })
  assert.deepEqual(sanitizeIotPatch('generator', { output: 140 }), { output: 100 })
})

test('smart things discover the IoT server, register, and report state periodically', () => {
  const lab = iotLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  const result = runTicks(70)
  const server = deviceById(result.devices, lab.server.id)
  const lamp = deviceById(result.devices, lab.lamp.id)
  assert.equal(lamp.iotRuntime?.state, 'registered', `lamp runtime: ${JSON.stringify(lamp.iotRuntime)}`)
  assert.equal(lamp.iotRuntime?.serverId, server.id)
  assert.equal(lamp.iotRuntime?.serverAddress, '192.168.10.10')
  const clients = iotServerClients(server)
  assert.deepEqual(clients.map(client => client.deviceId).sort(), [lab.detector.id, lab.door.id, lab.lamp.id].sort())
  assert.ok(clients.every(client => client.address.startsWith('192.168.10.2')))
  assert.ok(result.trace.some(line => line.includes('discovery')), result.trace.join('\n'))
  assert.ok(result.trace.some(line => line.toLowerCase().includes('registered')), result.trace.join('\n'))

  const before = iotServerClients(server).find(client => client.deviceId === lab.lamp.id)!.lastSeenTick
  const later = runTicks(100, result.packets, 71)
  const serverLater = deviceById(later.devices, lab.server.id)
  const lampLater = deviceById(later.devices, lab.lamp.id)
  assert.ok((lampLater.iotRuntime?.reportsSent ?? 0) >= 1, `reportsSent=${lampLater.iotRuntime?.reportsSent}`)
  const after = iotServerClients(serverLater).find(client => client.deviceId === lab.lamp.id)!
  assert.ok(after.lastSeenTick > before, `lastSeenTick ${after.lastSeenTick} should advance past ${before}`)
  assert.ok(iotClientOnline(after, 171))
  assert.ok(later.trace.some(line => line.includes('state report')), later.trace.join('\n'))
})

test('remote IoT commands reach registered things and are acknowledged', () => {
  const lab = iotLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  runTicks(70)
  const store = useNetworkStore.getState()
  const server = store.devices.find(device => device.id === lab.server.id)!
  const packets = [
    ...createIotControlPackets(server, store.devices, store.links, 'cmd-lamp-on', lab.lamp.id, { power: true }),
    ...createIotControlPackets(server, store.devices, store.links, 'cmd-door-open', lab.door.id, { open: true }),
  ]
  assert.equal(packets.length, 2, 'one unicast command per thing')
  const result = runTicks(30, packets, 71)
  const lamp = deviceById(result.devices, lab.lamp.id)
  const door = deviceById(result.devices, lab.door.id)
  assert.equal(lamp.config.iotState?.power, true)
  assert.equal(door.config.iotState?.open, true)
  assert.equal(lamp.iotRuntime?.controlsApplied, 1)
  assert.equal(lamp.iotRuntime?.state, 'registered')
  assert.ok(result.trace.some(line => line.includes('command')), result.trace.join('\n'))
  assert.ok(result.trace.some(line => line.includes('acknowledgement')), result.trace.join('\n'))
})

test('store sendIotControl requires registration and setIotState edits local state', () => {
  const lab = iotLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  const rejected = useNetworkStore.getState().sendIotControl(lab.server.id, lab.lamp.id, { power: true })
  assert.equal(typeof rejected, 'string')
  assert.ok(rejected && rejected.includes('not registered'), String(rejected))
  runTicks(70)
  assert.equal(useNetworkStore.getState().sendIotControl(lab.server.id, lab.lamp.id, { power: true, level: 80 }), null)
  runTicks(30, undefined, 71)
  const after = useNetworkStore.getState().devices.find(device => device.id === lab.lamp.id)!
  assert.equal(after.config.iotState?.power, true)
  assert.equal(after.config.iotState?.level, undefined, 'unsupported patch fields are dropped for the lamp kind')
  useNetworkStore.getState().setIotState(lab.lamp.id, { power: false })
  assert.equal(useNetworkStore.getState().devices.find(device => device.id === lab.lamp.id)!.config.iotState?.power, false)
})

test('IoT state helpers sanitize patches and summarize state per kind', () => {
  assert.deepEqual(sanitizeIotPatch('lamp', { power: true }), { power: true })
  assert.deepEqual(sanitizeIotPatch('lamp', { level: 50, power: false }), { power: false })
  assert.deepEqual(sanitizeIotPatch('blinds', { level: 250 }), { level: 100 })
  assert.deepEqual(sanitizeIotPatch('blinds', { level: -20 }), { level: 0 })
  assert.deepEqual(sanitizeIotPatch('thermostat', { temperature: 100 }), { temperature: 40 })
  assert.deepEqual(sanitizeIotPatch('thermostat', { temperature: 21.26 }), { temperature: 21.3 })
  assert.deepEqual(sanitizeIotPatch('door', { open: true }), { open: true })
  assert.deepEqual(sanitizeIotPatch('door', { power: true }), {})
  assert.deepEqual(sanitizeIotPatch('smoke-detector', { smoke: true }), { smoke: true })
  const lamp = createDevice('iot', 0, 0, 'Lamp-PT')
  const edited = applyIotLocalState(lamp, { power: true })
  assert.equal(edited.config.iotState?.power, true)
  assert.equal(iotStateSummary('lamp', iotStateOf(edited)), 'on')
  assert.equal(iotStateSummary('door', { open: false }), 'closed')
  assert.equal(iotStateSummary('blinds', { level: 40 }), '40% open')
  assert.equal(iotStateSummary('smoke-detector', { smoke: true }), 'smoke detected')
  assert.equal(iotStateSummary('thermostat', { temperature: 22 }), '22.0 C')
  assert.deepEqual(defaultIotState('push-button'), {})
})

test('IoT activity gate and client freshness track simulation state', () => {
  const pc = createDevice('pc', 0, 0, 'PC-PT')
  const plainServer = createDevice('server', 0, 0, 'Server-PT')
  const iotServer = createDevice('server', 0, 0, 'Server-PT')
  iotServer.config.iotServiceEnabled = true
  const thing = createDevice('iot', 0, 0, 'Fan-PT')
  assert.equal(hasIotActivity([pc, plainServer]), false)
  assert.equal(hasIotActivity([pc, thing]), true)
  assert.equal(hasIotActivity([plainServer, iotServer]), true)
  const client = { deviceId: 'x', address: '192.168.10.21', kind: 'lamp' as const, registeredAtTick: 0, lastSeenTick: 60 }
  assert.equal(iotClientOnline(client, 60 + 150), true)
  assert.equal(iotClientOnline(client, 61 + 150), false)
})

test('a thing without an address stays silent and an unserved thing keeps searching', () => {
  const bare = createDevice('iot', 0, 0, 'Lamp-PT')
  bare.name = 'LampBare'
  const sw = createDevice('switch', 0, 0, '2960-24TT')
  sw.ports.forEach(port => { port.portfast = true })
  const lonely = createDevice('iot', 0, 0, 'Fan-PT')
  lonely.name = 'FanLonely'
  addressPort(lonely, lonely.ports[0], '192.168.10.50')
  useNetworkStore.getState().loadLab([bare, sw, lonely], [connect(bare, 0, sw, 0), connect(lonely, 0, sw, 1)])
  const result = runTicks(30)
  const bareAfter = deviceById(result.devices, bare.id)
  const lonelyAfter = deviceById(result.devices, lonely.id)
  assert.equal(bareAfter.iotRuntime?.lastDiscoveryTick, undefined, 'no address, no discovery')
  assert.notEqual(lonelyAfter.iotRuntime?.state, 'registered')
  assert.ok((lonelyAfter.iotRuntime?.lastDiscoveryTick ?? 0) > 0, 'discovery repeats while searching')
  assert.equal(result.discarded, 0)
})

test('server prunes clients that stop reporting for a long time', () => {
  const lab = iotLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  const result = runTicks(70)
  const server = deviceById(result.devices, lab.server.id)
  const clients = iotServerClients(server)
  assert.equal(clients.length, 3)
  const silentServer: NetworkDevice = {
    ...server,
    iotServerRuntime: { clients: clients.map(client => ({ ...client, lastSeenTick: 100 })) },
  }
  const kept = prepareIotTick([silentServer], [], 100 + IOT_CLIENT_STALE_TICKS)
  assert.equal(iotServerClients(kept.devices[0]).length, 3, 'clients inside the freshness window are kept')
  const pruned = prepareIotTick([silentServer], [], 100 + IOT_CLIENT_EXPIRE_TICKS + 1)
  assert.equal(iotServerClients(pruned.devices[0]).length, 0, 'stale clients are pruned after the expire window')
})
