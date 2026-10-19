import type {
  IotServerClient,
  IotServerRuntime,
  IotThingKind,
  IotThingState,
  NetworkDevice,
  NetworkLink,
  PacketPdu,
} from '../types/network'
import { isValidIpv4 } from './protocols/ip'
import { SIMULATION_TICK_MS } from './ospf'

// IoT is modeled as a UDP application protocol between smart things and a
// registration server. Discovery uses the limited broadcast address on the
// local segment; registration, state reports and remote commands are unicast.
export const IOT_SERVER_PORT = 5683
export const IOT_CLIENT_PORT = 5684
export const IOT_DISCOVERY_INTERVAL_TICKS = 20
export const IOT_REPORT_INTERVAL_TICKS = 50
export const IOT_CLIENT_STALE_TICKS = 150
export const IOT_CLIENT_EXPIRE_TICKS = 600
export const IOT_DISCOVERY_MS = IOT_DISCOVERY_INTERVAL_TICKS * SIMULATION_TICK_MS
export const IOT_REPORT_MS = IOT_REPORT_INTERVAL_TICKS * SIMULATION_TICK_MS
export const IOT_CLIENT_STALE_MS = IOT_CLIENT_STALE_TICKS * SIMULATION_TICK_MS
export const IOT_BROADCAST_ADDRESS = '255.255.255.255'
export const IOT_BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff'
export const IOT_DEFAULT_USERNAME = 'admin'
export const IOT_DEFAULT_PASSWORD = 'admin'

export interface IotThingSpec {
  kind: IotThingKind
  model: string
  label: string
  control: 'toggle' | 'open-close' | 'level' | 'temperature' | 'smoke' | 'button' | 'humiture' | 'motion' | 'sound' | 'reading' | 'output' | 'fire'
  unit?: string
  min?: number
  max?: number
  initial?: IotThingState
}

export const IOT_THINGS: IotThingSpec[] = [
  { kind: 'lamp', model: 'Lamp-PT', label: 'Lamp', control: 'toggle' },
  { kind: 'fan', model: 'Fan-PT', label: 'Fan', control: 'toggle' },
  { kind: 'siren', model: 'Siren-PT', label: 'Siren', control: 'toggle' },
  { kind: 'sprinkler', model: 'Sprinkler-PT', label: 'Lawn Sprinkler', control: 'toggle' },
  { kind: 'door', model: 'Door-PT', label: 'Door', control: 'open-close' },
  { kind: 'window', model: 'Window-PT', label: 'Window', control: 'open-close' },
  { kind: 'blinds', model: 'Blinds-PT', label: 'Blinds', control: 'level', unit: '%', min: 0, max: 100 },
  { kind: 'thermostat', model: 'Thermostat-PT', label: 'Thermostat', control: 'temperature', unit: '°C', min: 10, max: 40 },
  { kind: 'smoke-detector', model: 'Smoke-Detector-PT', label: 'Smoke Detector', control: 'smoke' },
  { kind: 'water-detector', model: 'Water-Detector-PT', label: 'Water Detector', control: 'level', unit: '%', min: 0, max: 100 },
  { kind: 'light-sensor', model: 'Light-Sensor-PT', label: 'Light Sensor', control: 'level', unit: '%', min: 0, max: 100 },
  { kind: 'push-button', model: 'Push-Button-PT', label: 'Push Button', control: 'button' },
  // Packet Tracer's Smart Home shelf. Each model reuses a simulated device
  // class, so registration, reporting and remote control behave identically.
  { kind: 'thermostat', model: 'AC', label: 'AC', control: 'temperature', unit: '°C', min: 16, max: 30 },
  { kind: 'appliance', model: 'Appliance', label: 'Appliance', control: 'toggle' },
  { kind: 'speaker', model: 'Bluetooth Speaker', label: 'Bluetooth Speaker', control: 'toggle' },
  { kind: 'fan', model: 'Ceiling Fan', label: 'Ceiling Fan', control: 'toggle' },
  { kind: 'thermostat', model: 'Furnace', label: 'Furnace', control: 'temperature', unit: '°C', min: 10, max: 30 },
  { kind: 'door', model: 'Garage Door', label: 'Garage Door', control: 'open-close' },
  { kind: 'speaker', model: 'Home Speaker', label: 'Home Speaker', control: 'toggle' },
  { kind: 'humidifier', model: 'Humidifier', label: 'Humidifier', control: 'level', unit: '%', min: 0, max: 100 },
  { kind: 'humiture', model: 'Humiture Monitor', label: 'Humiture Monitor', control: 'humiture' },
  { kind: 'sprinkler', model: 'Lawn Sprinkler', label: 'Lawn Sprinkler', control: 'toggle' },
  { kind: 'lamp', model: 'Light', label: 'Light', control: 'toggle' },
  { kind: 'motion-sensor', model: 'Motion Detector', label: 'Motion Detector', control: 'motion' },
  { kind: 'speaker', model: 'Portable Music Player', label: 'Portable Music Player', control: 'toggle' },
  { kind: 'sound-sensor', model: 'Sound Frequency Detector', label: 'Sound Frequency Detector', control: 'sound', unit: 'dB', min: 0, max: 100 },
  { kind: 'water-detector', model: 'Water Level Monitor', label: 'Water Level Monitor', control: 'level', unit: '%', min: 0, max: 100 },
  { kind: 'camera', model: 'Webcam', label: 'Webcam', control: 'toggle' },
  // Smart City. Sensors expose one measured quantity with its own unit and
  // range; binary detectors report an alarm; the rest are actuators.
  { kind: 'sensor', model: 'Atm Pressure Monitor', label: 'Atm Pressure Monitor', control: 'reading', unit: 'hPa', min: 950, max: 1050, initial: { reading: 1013, unit: 'hPa' } },
  { kind: 'siren', model: 'Beacon', label: 'Beacon', control: 'toggle' },
  { kind: 'sensor', model: 'Carbon Dioxide Detector', label: 'Carbon Dioxide Detector', control: 'reading', unit: 'ppm', min: 400, max: 2000, initial: { reading: 420, unit: 'ppm' } },
  { kind: 'sensor', model: 'Carbon Monoxide Detector', label: 'Carbon Monoxide Detector', control: 'reading', unit: 'ppm', min: 0, max: 100, initial: { reading: 0, unit: 'ppm' } },
  { kind: 'fire-detector', model: 'Fire Monitor', label: 'Fire Monitor', control: 'fire' },
  { kind: 'sprinkler', model: 'Fire Sprinkler', label: 'Fire Sprinkler', control: 'toggle' },
  { kind: 'sensor', model: 'Humidity Monitor', label: 'Humidity Monitor', control: 'reading', unit: '%', min: 0, max: 100, initial: { reading: 45, unit: '%' } },
  { kind: 'appliance', model: 'Old Car', label: 'Old Car', control: 'toggle' },
  { kind: 'lamp', model: 'Smart LED', label: 'Smart LED', control: 'toggle' },
  { kind: 'lamp', model: 'Street Lamp', label: 'Street Lamp', control: 'toggle' },
  { kind: 'sensor', model: 'Temperature Monitor', label: 'Temperature Monitor', control: 'reading', unit: '°C', min: -10, max: 50, initial: { reading: 22, unit: '°C' } },
  { kind: 'motion-sensor', model: 'Trip Sensor', label: 'Trip Sensor', control: 'motion' },
  { kind: 'valve', model: 'Water Drain', label: 'Water Drain', control: 'open-close' },
  { kind: 'sensor', model: 'Wind Detector', label: 'Wind Detector', control: 'reading', unit: 'm/s', min: 0, max: 40, initial: { reading: 3, unit: 'm/s' } },
  // Industrial OT and Power Grid.
  { kind: 'fan', model: 'Blower', label: 'Blower', control: 'toggle' },
  { kind: 'generator', model: 'Signal Generator', label: 'Signal Generator', control: 'output' },
  { kind: 'battery', model: 'Battery', label: 'Battery', control: 'level', unit: '%', min: 0, max: 100, initial: { level: 100 } },
  { kind: 'sensor', model: 'Power Meter', label: 'Power Meter', control: 'reading', unit: 'W', min: 0, max: 5000, initial: { reading: 0, unit: 'W' } },
  { kind: 'generator', model: 'Solar Panel', label: 'Solar Panel', control: 'output' },
  { kind: 'generator', model: 'Wind Turbine', label: 'Wind Turbine', control: 'output' },
]

export function iotThingSpec(model: string): IotThingSpec {
  return IOT_THINGS.find(spec => spec.model === model) ?? IOT_THINGS[0]
}

export function iotThingSpecByKind(kind: IotThingKind): IotThingSpec {
  return IOT_THINGS.find(spec => spec.kind === kind) ?? IOT_THINGS[0]
}

export function defaultIotState(kind: IotThingKind): IotThingState {
  switch (kind) {
    case 'lamp':
    case 'fan':
    case 'siren':
    case 'sprinkler':
    case 'appliance':
    case 'speaker':
    case 'camera':
      return { power: false }
    case 'door':
    case 'window':
      return { open: false }
    case 'blinds':
      return { level: 0 }
    case 'thermostat':
      return { temperature: 22 }
    case 'smoke-detector':
      return { smoke: false }
    case 'water-detector':
      return { level: 0 }
    case 'light-sensor':
      return { level: 60 }
    case 'push-button':
      return {}
    case 'humidifier':
      return { level: 0 }
    case 'humiture':
      return { temperature: 22, humidity: 45 }
    case 'motion-sensor':
      return { motion: false }
    case 'sound-sensor':
      return { sound: 0 }
    case 'sensor':
      return { reading: 0, unit: '' }
    case 'generator':
      return { output: 0 }
    case 'battery':
      return { level: 100 }
    case 'valve':
      return { open: false }
    case 'fire-detector':
      return { fire: false }
  }
}

export const isIotThing = (device: NetworkDevice) => device.type === 'iot'
export const isIotServer = (device: NetworkDevice) => device.type === 'server' && device.config.iotServiceEnabled === true

export function hasIotActivity(devices: NetworkDevice[]) {
  return devices.some(device => isIotThing(device) || isIotServer(device))
}

export const iotRuntimeOf = (device: NetworkDevice) => device.iotRuntime ?? { state: 'searching' as const }
export const iotServerRuntimeOf = (device: NetworkDevice): IotServerRuntime => device.iotServerRuntime ?? { clients: [] }

export function iotServerClients(server: NetworkDevice): IotServerClient[] {
  return [...iotServerRuntimeOf(server).clients].sort((a, b) => a.registeredAtTick - b.registeredAtTick || a.deviceId.localeCompare(b.deviceId))
}

export const iotClientOnline = (client: IotServerClient, simulationTick: number) => simulationTick - client.lastSeenTick <= IOT_CLIENT_STALE_TICKS

export function iotKindOf(device: NetworkDevice): IotThingKind {
  return device.config.iotKind ?? iotThingSpec(device.model).kind
}

export function iotStateOf(device: NetworkDevice): IotThingState {
  const kind = iotKindOf(device)
  const state = device.config.iotState ?? {}
  const defaults = defaultIotState(kind)
  return { ...defaults, ...state }
}

export function iotStateSummary(kind: IotThingKind, state: IotThingState): string {
  switch (kind) {
    case 'lamp':
    case 'fan':
    case 'siren':
    case 'sprinkler':
    case 'appliance':
    case 'speaker':
    case 'camera':
      return state.power ? 'on' : 'off'
    case 'door':
    case 'window':
      return state.open ? 'open' : 'closed'
    case 'blinds':
      return `${Math.round(state.level ?? 0)}% open`
    case 'thermostat':
      return `${(state.temperature ?? 0).toFixed(1)} C`
    case 'smoke-detector':
      return state.smoke ? 'smoke detected' : 'clear'
    case 'water-detector':
      return `${Math.round(state.level ?? 0)}% water level`
    case 'light-sensor':
      return `${Math.round(state.level ?? 0)}% light`
    case 'push-button':
      return state.pressedAtTick !== undefined ? `last pressed at tick ${state.pressedAtTick}` : 'idle'
    case 'humidifier':
      return `${Math.round(state.level ?? 0)}% humidity`
    case 'humiture':
      return `${(state.temperature ?? 0).toFixed(1)} C / ${Math.round(state.humidity ?? 0)}% RH`
    case 'motion-sensor':
      return state.motion ? 'motion detected' : 'no motion'
    case 'sound-sensor':
      return `${Math.round(state.sound ?? 0)} dB`
    case 'sensor':
      return `${state.reading ?? 0} ${state.unit ?? ''}`.trim()
    case 'generator':
      return `${Math.round(state.output ?? 0)}% output`
    case 'battery':
      return `${Math.round(state.level ?? 0)}% charge`
    case 'valve':
      return state.open ? 'open' : 'closed'
    case 'fire-detector':
      return state.fire ? 'fire detected' : 'clear'
  }
}

export function sanitizeIotPatch(kind: IotThingKind, patch: IotThingState): IotThingState {
  const next: IotThingState = {}
  if ('power' in patch && patch.power !== undefined && ['lamp', 'fan', 'siren', 'sprinkler', 'appliance', 'speaker', 'camera'].includes(kind)) next.power = patch.power === true
  if ('open' in patch && patch.open !== undefined && ['door', 'window', 'valve'].includes(kind)) next.open = patch.open === true
  if (patch.level !== undefined && ['blinds', 'water-detector', 'light-sensor', 'humidifier', 'battery'].includes(kind) && Number.isFinite(patch.level)) next.level = Math.max(0, Math.min(100, Math.round(patch.level)))
  if (patch.reading !== undefined && kind === 'sensor' && Number.isFinite(patch.reading)) next.reading = Math.max(0, Math.min(2000, Math.round(patch.reading * 10) / 10))
  if (patch.unit !== undefined && kind === 'sensor' && typeof patch.unit === 'string') next.unit = patch.unit.slice(0, 8)
  if (patch.output !== undefined && kind === 'generator' && Number.isFinite(patch.output)) next.output = Math.max(0, Math.min(100, Math.round(patch.output)))
  if ('fire' in patch && patch.fire !== undefined && kind === 'fire-detector') next.fire = patch.fire === true
  if (patch.temperature !== undefined && (kind === 'thermostat' || kind === 'humiture') && Number.isFinite(patch.temperature)) next.temperature = Math.max(kind === 'humiture' ? 0 : 10, Math.min(40, Math.round(patch.temperature * 10) / 10))
  if (patch.humidity !== undefined && kind === 'humiture' && Number.isFinite(patch.humidity)) next.humidity = Math.max(0, Math.min(100, Math.round(patch.humidity)))
  if ('smoke' in patch && patch.smoke !== undefined && kind === 'smoke-detector') next.smoke = patch.smoke === true
  if ('motion' in patch && patch.motion !== undefined && kind === 'motion-sensor') next.motion = patch.motion === true
  if (patch.sound !== undefined && kind === 'sound-sensor' && Number.isFinite(patch.sound)) next.sound = Math.max(0, Math.min(100, Math.round(patch.sound)))
  if (patch.pressedAtTick !== undefined && kind === 'push-button' && Number.isFinite(patch.pressedAtTick)) next.pressedAtTick = Math.round(patch.pressedAtTick)
  return next
}

export function applyIotLocalState(thing: NetworkDevice, patch: IotThingState): NetworkDevice {
  const kind = iotKindOf(thing)
  const current = iotStateOf(thing)
  const next = { ...current, ...sanitizeIotPatch(kind, patch) }
  return { ...thing, config: { ...thing.config, iotState: next } }
}

export function applyIotControl(thing: NetworkDevice, patch: IotThingState, simulationTick: number): NetworkDevice {
  const kind = iotKindOf(thing)
  const current = iotStateOf(thing)
  const next = { ...current, ...sanitizeIotPatch(kind, patch) }
  const runtime = iotRuntimeOf(thing)
  return {
    ...thing,
    config: { ...thing.config, iotState: next },
    iotRuntime: {
      ...runtime,
      state: 'registered',
      lastControlTick: simulationTick,
      controlsApplied: (runtime.controlsApplied ?? 0) + 1,
      stateVersion: (runtime.stateVersion ?? 0) + 1,
    },
  }
}

export function markIotRegistered(
  thing: NetworkDevice,
  server: { serverId?: string; serverName?: string; serverAddress: string },
  simulationTick: number,
): NetworkDevice {
  const runtime = iotRuntimeOf(thing)
  return {
    ...thing,
    iotRuntime: {
      ...runtime,
      state: 'registered',
      serverId: server.serverId,
      serverName: server.serverName,
      serverAddress: server.serverAddress,
      lastReportTick: runtime.lastReportTick ?? simulationTick,
    },
  }
}

export function recordIotClient(
  server: NetworkDevice,
  update: { deviceId: string; address: string; kind: IotThingKind; model?: string },
  simulationTick: number,
): NetworkDevice {
  const runtime = iotServerRuntimeOf(server)
  const existing = runtime.clients.find(client => client.deviceId === update.deviceId)
  const clients = existing
    ? runtime.clients.map(client => client.deviceId === update.deviceId
      ? { ...client, address: update.address, kind: update.kind, model: update.model ?? client.model, lastSeenTick: simulationTick }
      : client)
    : [...runtime.clients, {
      deviceId: update.deviceId, address: update.address, kind: update.kind, model: update.model,
      registeredAtTick: simulationTick, lastSeenTick: simulationTick,
    }]
  return { ...server, iotServerRuntime: { ...runtime, clients } }
}

export function touchIotClient(server: NetworkDevice, deviceId: string, simulationTick: number): NetworkDevice {
  const runtime = iotServerRuntimeOf(server)
  if (!runtime.clients.some(client => client.deviceId === deviceId)) return server
  return {
    ...server,
    iotServerRuntime: {
      ...runtime,
      lastControlTick: simulationTick,
      clients: runtime.clients.map(client => client.deviceId === deviceId ? { ...client, lastSeenTick: simulationTick } : client),
    },
  }
}

export interface IotIntent {
  deviceId: string
  portId: string
  targetIp: string
  broadcast: boolean
  pdu: PacketPdu
}

function discoveryPdu(device: NetworkDevice, port: { name: string; macAddress: string; ipAddress?: string }, targetIp: string): PacketPdu {
  const kind = iotKindOf(device)
  return {
    id: `iot-discovery-${crypto.randomUUID()}`,
    protocol: 'UDP',
    summary: `IoT discovery broadcast from ${device.name}`,
    sourceMac: port.macAddress,
    destMac: IOT_BROADCAST_MAC,
    etherType: '0x0800',
    sourceIp: port.ipAddress ?? '0.0.0.0',
    destIp: targetIp,
    ttl: 64,
    payload: {
      udpMessageType: 'request',
      udpService: 'iot',
      udpSourcePort: IOT_CLIENT_PORT,
      udpDestinationPort: IOT_SERVER_PORT,
      iotMessageType: 'discovery',
      iotClientDeviceId: device.id,
      iotStateSummary: iotStateSummary(kind, iotStateOf(device)),
    },
    explanation: {
      layer1: `Outbound interface: ${port.name}.`,
      layer2: `Ethernet II: ${port.macAddress} to ${IOT_BROADCAST_MAC} (broadcast).`,
      layer3: `IPv4: ${port.ipAddress} to ${targetIp}, TTL 64.`,
      layer4AndAbove: `UDP: client port ${IOT_CLIENT_PORT} to server registration port ${IOT_SERVER_PORT}. IoT discovery message.`,
      deviceDecision: `${device.name} searches for an IoT registration server and announces ${iotStateSummary(kind, iotStateOf(device))}.`,
    },
  }
}

function reportPdu(device: NetworkDevice, port: { name: string; macAddress: string; ipAddress?: string }, serverAddress: string, serverId?: string): PacketPdu {
  const kind = iotKindOf(device)
  return {
    id: `iot-report-${crypto.randomUUID()}`,
    protocol: 'UDP',
    summary: `IoT state report from ${device.name}`,
    sourceMac: port.macAddress,
    destMac: '00:00:00:00:00:00',
    etherType: '0x0800',
    sourceIp: port.ipAddress ?? '0.0.0.0',
    destIp: serverAddress,
    ttl: 64,
    payload: {
      udpMessageType: 'request',
      udpService: 'iot',
      udpSourcePort: IOT_CLIENT_PORT,
      udpDestinationPort: IOT_SERVER_PORT,
      iotMessageType: 'report',
      iotClientDeviceId: device.id,
      iotServerDeviceId: serverId,
      iotStateSummary: iotStateSummary(kind, iotStateOf(device)),
    },
    explanation: {
      layer1: 'Outbound interface: IoT interface.',
      layer2: `Ethernet II: ${port.macAddress} to the next hop.`,
      layer3: `IPv4: ${port.ipAddress} to ${serverAddress}, TTL 64.`,
      layer4AndAbove: `UDP: client port ${IOT_CLIENT_PORT} to server registration port ${IOT_SERVER_PORT}. IoT state report.`,
      deviceDecision: `${device.name} reports its state (${iotStateSummary(kind, iotStateOf(device))}) to its IoT registration server.`,
    },
  }
}

export function prepareIotTick(devices: NetworkDevice[], _links: NetworkLink[], simulationTick: number): { devices: NetworkDevice[]; outbound: IotIntent[] } {
  const outbound: IotIntent[] = []
  let updated = devices
  const edit = (deviceId: string, editor: (device: NetworkDevice) => NetworkDevice) => {
    if (updated === devices) updated = [...devices]
    const index = updated.findIndex(device => device.id === deviceId)
    if (index >= 0) updated[index] = editor(updated[index])
  }
  const due = (last: number | undefined, interval: number) => last === undefined || simulationTick - last >= interval
  for (const device of devices) {
    if (isIotThing(device)) {
      if (device.power === false) continue
      const runtime = iotRuntimeOf(device)
      const port = device.ports.find(candidate => candidate.ipAddress && candidate.connectedLinkId && candidate.adminStatus === 'up' && candidate.status === 'up' && !candidate.isGreTunnel)
      if (!port?.ipAddress) continue
      if (due(runtime.lastDiscoveryTick, IOT_DISCOVERY_INTERVAL_TICKS)) {
        const configured = device.config.iotServerAddress
        const unicastTarget = configured && configured !== 'auto' && isValidIpv4(configured) ? configured : undefined
        const targetIp = unicastTarget ?? IOT_BROADCAST_ADDRESS
        outbound.push({ deviceId: device.id, portId: port.id, targetIp, broadcast: unicastTarget === undefined, pdu: discoveryPdu(device, port, targetIp) })
        edit(device.id, current => ({ ...current, iotRuntime: { ...iotRuntimeOf(current), lastDiscoveryTick: simulationTick } }))
      }
      if (runtime.state === 'registered' && runtime.serverAddress && due(runtime.lastReportTick, IOT_REPORT_INTERVAL_TICKS)) {
        outbound.push({ deviceId: device.id, portId: port.id, targetIp: runtime.serverAddress, broadcast: false, pdu: reportPdu(device, port, runtime.serverAddress, runtime.serverId) })
        edit(device.id, current => {
          const live = iotRuntimeOf(current)
          return { ...current, iotRuntime: { ...live, lastReportTick: simulationTick, reportsSent: (live.reportsSent ?? 0) + 1 } }
        })
      }
      continue
    }
    if (isIotServer(device) && device.power !== false) {
      const runtime = iotServerRuntimeOf(device)
      const clients = runtime.clients.filter(client => simulationTick - client.lastSeenTick <= IOT_CLIENT_EXPIRE_TICKS)
      if (clients.length !== runtime.clients.length) {
        edit(device.id, current => ({ ...current, iotServerRuntime: { ...iotServerRuntimeOf(current), clients: iotServerRuntimeOf(current).clients.filter(client => simulationTick - client.lastSeenTick <= IOT_CLIENT_EXPIRE_TICKS) } }))
      }
    }
  }
  return { devices: updated, outbound }
}
