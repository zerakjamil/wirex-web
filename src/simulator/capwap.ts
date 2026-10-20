import type {
  ApRuntime,
  CapwapMessage,
  NetworkDevice,
  NetworkLink,
  NetworkPort,
  PacketPdu,
  WlanProfile,
  WlcApEntry,
  WlcRuntime,
} from '../types/network'
import { SIMULATION_TICK_MS } from './ospf'

export interface CapwapIntent { deviceId: string; portId: string; pdu: PacketPdu }

// CAPWAP is modeled as a layer-2 protocol in this simulator. Control messages and
// encapsulated client frames travel across the wired broadcast domain instead of
// IP/UDP tunnels, so lightweight access points do not need an IP address of their own.
export const CAPWAP_ETHER_TYPE = '0x88B5'
export const CAPWAP_DISCOVERY_INTERVAL_TICKS = 34
export const CAPWAP_ECHO_INTERVAL_TICKS = 84
export const CAPWAP_AP_TIMEOUT_TICKS = 252
export const CAPWAP_MAX_WLANS = 16
export const CAPWAP_WLAN_ID_MIN = 1
export const CAPWAP_DEFAULT_AP_GROUP = 'default'
export const CAPWAP_DISCOVERY_MS = CAPWAP_DISCOVERY_INTERVAL_TICKS * SIMULATION_TICK_MS
export const CAPWAP_ECHO_MS = CAPWAP_ECHO_INTERVAL_TICKS * SIMULATION_TICK_MS
export const CAPWAP_TIMEOUT_MS = CAPWAP_AP_TIMEOUT_TICKS * SIMULATION_TICK_MS

const BROADCAST = 'ff:ff:ff:ff:ff:ff'
const sameMac = (a: string | undefined, b: string | undefined) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

export const isWlcDevice = (device: NetworkDevice) => device.type === 'wlc'
export const isLightweightAp = (device: NetworkDevice) => device.type === 'wireless' && (device.config.apMode === 'lightweight' || device.apRuntime?.mode === 'lightweight')
export const isWirelessAp = (device: NetworkDevice) => device.type === 'wireless' && device.model !== 'WRT300N' && device.model !== 'Cell-Tower'
export const apWiredPort = (device: NetworkDevice) => device.ports.find(port => port.type !== 'wireless')
export const apWirelessPort = (device: NetworkDevice) => device.ports.find(port => port.type === 'wireless')
export const wlcManagementPort = (device: NetworkDevice) => device.ports.find(port => port.type === 'gigabitethernet') ?? device.ports.find(port => port.type === 'fastethernet') ?? device.ports[0]

/** True while the topology contains a controller or a lightweight AP, so the realtime loop keeps driving CAPWAP timers even with no packets in flight. */
export function hasCapwapActivity(devices: NetworkDevice[]) {
  return devices.some(device => device.type === 'wlc' || isLightweightAp(device))
}

export function wlcWlans(device: NetworkDevice): WlanProfile[] {
  return (device.config.wlans ?? [])
    .filter(wlan => Number.isInteger(wlan.id) && wlan.id >= CAPWAP_WLAN_ID_MIN && wlan.id <= CAPWAP_MAX_WLANS)
    .slice()
    .sort((a, b) => a.id - b.id)
}

export function wlanFingerprint(wlans: WlanProfile[] | undefined): string {
  return JSON.stringify((wlans ?? [])
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(wlan => [wlan.id, wlan.name, wlan.ssid, wlan.enabled, wlan.vlan, wlan.security, wlan.passphrase ?? '', wlan.wepKey ?? '']))
}

export const apRuntimeOf = (device: NetworkDevice): ApRuntime =>
  device.apRuntime ?? { mode: device.config.apMode === 'lightweight' ? 'lightweight' : 'autonomous', state: 'idle' }

export const wlcRuntimeOf = (device: NetworkDevice): WlcRuntime =>
  device.wlcRuntime ?? { aps: [], clientTunnels: [], configSeq: 0, pendingConfig: [], seq: 0 }

export const AP_CHANNELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const

/** Radio settings exposed by an autonomous access point's wireless interface. */
export function apWirelessSettings(device: NetworkDevice) {
  const rawChannel = device.config.wirelessChannel
  const channel = typeof rawChannel === 'number' && AP_CHANNELS.includes(rawChannel as (typeof AP_CHANNELS)[number])
    ? rawChannel
    : 6
  return {
    ssid: device.config.wirelessSsid?.trim() || device.name,
    channel,
    authentication: device.config.wirelessAuthentication ?? 'open',
    passphrase: device.config.wirelessPassphrase ?? '',
    wepKey: device.config.wirelessWepKey ?? '',
    encryption: device.config.wirelessEncryption ?? 'aes',
  }
}

/** True when a client's security key matches the advertised wireless LAN. */
export function wirelessKeyAccepted(profile: WlanProfile, key: string): boolean {
  const candidate = key.trim()
  if (profile.security === 'none') return true
  if (profile.security === 'wep') {
    return /^[0-9a-f]{10}$/i.test(candidate) && candidate.toLowerCase() === (profile.wepKey ?? '').toLowerCase()
  }
  return candidate.length >= 8 && candidate.length <= 63 && candidate === (profile.passphrase ?? '')
}

/** Wireless LANs a client can see through this access point. Autonomous access
 *  points advertise their configured SSID; lightweight access points advertise the
 *  wireless LANs pushed by their controller while they are in the CAPWAP Run state. */
export function apAdvertisedWlans(device: NetworkDevice): WlanProfile[] {
  if (!isLightweightAp(device)) {
    if (device.type !== 'wireless') return []
    const settings = apWirelessSettings(device)
    const security: WlanProfile['security'] = settings.authentication === 'open'
      ? 'none'
      : settings.authentication === 'wep' ? 'wep' : 'wpa2-psk'
    return [{
      id: 0,
      name: settings.ssid,
      ssid: settings.ssid,
      enabled: true,
      vlan: 0,
      security,
      ...(security === 'wep' ? { wepKey: settings.wepKey } : {}),
      ...(security === 'wpa2-psk' ? { passphrase: settings.passphrase } : {}),
    }]
  }
  const runtime = apRuntimeOf(device)
  return runtime.state === 'run' ? (runtime.wlans ?? []).filter(wlan => wlan.enabled) : []
}

export function wlcRegisteredAps(device: NetworkDevice): WlcApEntry[] {
  return wlcRuntimeOf(device).aps.slice().sort((a, b) => a.apId.localeCompare(b.apId))
}

export interface WlcClientEntry {
  macAddress: string
  deviceId: string
  name: string
  apId: string
  apName: string
  ssid: string
  state: string
}

/** Clients associated through access points that are registered to this controller. */
export function wlcClientEntries(devices: NetworkDevice[], links: NetworkLink[], wlc: NetworkDevice): WlcClientEntry[] {
  const rows: WlcClientEntry[] = []
  for (const entry of wlcRegisteredAps(wlc)) {
    const ap = devices.find(device => device.id === entry.apId)
    if (!ap) continue
    const wirelessPort = apWirelessPort(ap)
    if (!wirelessPort) continue
    const ssid = apAdvertisedWlans(ap)[0]?.ssid ?? ''
    for (const link of links) {
      const touchesPort = link.fromDeviceId === ap.id && link.fromPortId === wirelessPort.id || link.toDeviceId === ap.id && link.toPortId === wirelessPort.id
      if (!touchesPort) continue
      const peerId = link.fromDeviceId === ap.id ? link.toDeviceId : link.fromDeviceId
      const peer = devices.find(device => device.id === peerId)
      if (!peer) continue
      const peerPortId = link.fromDeviceId === ap.id ? link.toPortId : link.fromPortId
      const peerPort = peer.ports.find(port => port.id === peerPortId)
      rows.push({ macAddress: peerPort?.macAddress ?? '-', deviceId: peer.id, name: peer.name, apId: ap.id, apName: ap.name, ssid, state: 'Associated' })
    }
  }
  return rows
}

function portUp(device: NetworkDevice, port?: NetworkPort): port is NetworkPort {
  return !!port && device.power !== false && port.adminStatus === 'up' && port.status === 'up'
}

function linkLive(devices: Map<string, NetworkDevice>, link: NetworkLink): boolean {
  if (link.status !== 'up') return false
  const a = devices.get(link.fromDeviceId), b = devices.get(link.toDeviceId)
  if (!a || !b) return false
  return portUp(a, a.ports.find(port => port.id === link.fromPortId)) && portUp(b, b.ports.find(port => port.id === link.toPortId))
}

function controlPdu(device: NetworkDevice, port: NetworkPort, destMac: string, message: CapwapMessage, summary: string, decision: string): PacketPdu {
  return {
    id: `capwap-${crypto.randomUUID()}`,
    protocol: 'CAPWAP',
    sourceMac: port.macAddress,
    destMac,
    etherType: CAPWAP_ETHER_TYPE,
    sourceIp: '0.0.0.0',
    destIp: '0.0.0.0',
    ttl: 1,
    summary,
    payload: { capwap: message },
    explanation: {
      layer1: `Outbound interface: ${port.name}.`,
      layer2: `CAPWAP control frame ${message.kind} (sequence ${message.seq}) from ${port.macAddress} to ${destMac}.`,
      layer3: 'N/A (control frame carried on the wired broadcast domain in this simulator).',
      layer4AndAbove: `CAPWAP ${message.kind}: discovery, join, echo and configuration state for the lightweight access point ${message.apName ?? 'access point'}.`,
      deviceDecision: decision,
    },
  }
}

export function discoveryRequestPdu(ap: NetworkDevice, tick: number): PacketPdu {
  const port = apWiredPort(ap)!
  return controlPdu(ap, port, BROADCAST, { kind: 'discovery-request', seq: tick, apDeviceId: ap.id, apName: ap.name },
    `CAPWAP: ${ap.name} discovery request`,
    `${ap.name} broadcasts a CAPWAP Discovery Request to locate a wireless LAN controller.`)
}

export function joinRequestPdu(ap: NetworkDevice, tick: number, wlcMac: string): PacketPdu {
  const port = apWiredPort(ap)!
  const runtime = apRuntimeOf(ap)
  return controlPdu(ap, port, wlcMac, { kind: 'join-request', seq: tick, apDeviceId: ap.id, apName: ap.name, controllerDeviceId: runtime.selectedWlcId },
    `CAPWAP: ${ap.name} join request`,
    `${ap.name} sends a CAPWAP Join Request to its selected controller.`)
}

export function echoRequestPdu(ap: NetworkDevice, tick: number, wlcMac: string): PacketPdu {
  const port = apWiredPort(ap)!
  return controlPdu(ap, port, wlcMac, { kind: 'echo-request', seq: tick, apDeviceId: ap.id, apName: ap.name },
    `CAPWAP: ${ap.name} echo request`,
    `${ap.name} keeps its CAPWAP session alive with an Echo Request.`)
}

export function discoveryResponsePdu(wlc: NetworkDevice, port: NetworkPort, apMac: string, apName: string, tick: number): PacketPdu {
  return controlPdu(wlc, port, apMac, { kind: 'discovery-response', seq: tick, controllerDeviceId: wlc.id, controllerName: wlc.name },
    `CAPWAP: ${wlc.name} discovery response`,
    `${wlc.name} answers the discovery broadcast and offers itself as the controller for ${apName}.`)
}

export function joinResponsePdu(wlc: NetworkDevice, port: NetworkPort, apMac: string, apId: string, apName: string, tick: number): PacketPdu {
  return controlPdu(wlc, port, apMac, { kind: 'join-response', seq: tick, apDeviceId: apId, apName, controllerDeviceId: wlc.id, controllerName: wlc.name },
    `CAPWAP: ${wlc.name} join response`,
    `${wlc.name} accepts the join from ${apName} and moves it to the CAPWAP Run state.`)
}

export function configUpdateRequestPdu(wlc: NetworkDevice, port: NetworkPort, entry: WlcApEntry, wlans: WlanProfile[], seq: number, tick: number): PacketPdu {
  return controlPdu(wlc, port, entry.apMac, { kind: 'config-update-request', seq: tick, apDeviceId: entry.apId, controllerDeviceId: wlc.id, controllerName: wlc.name, wlans, configSeq: seq },
    `CAPWAP: ${wlc.name} configuration update`,
    `${wlc.name} pushes its wireless LAN configuration to ${entry.apId} with sequence ${seq}.`)
}

export function configUpdateResponsePdu(ap: NetworkDevice, tick: number, wlcMac: string, ackSeq: number, configSeq: number): PacketPdu {
  const port = apWiredPort(ap)!
  return controlPdu(ap, port, wlcMac, { kind: 'config-update-response', seq: tick, apDeviceId: ap.id, apName: ap.name, ackSeq, configSeq },
    `CAPWAP: ${ap.name} configuration acknowledgement`,
    `${ap.name} applied configuration sequence ${configSeq} and acknowledges message ${ackSeq}.`)
}

export function echoResponsePdu(wlc: NetworkDevice, port: NetworkPort, entry: WlcApEntry, tick: number): PacketPdu {
  return controlPdu(wlc, port, entry.apMac, { kind: 'echo-response', seq: tick, apDeviceId: entry.apId, controllerDeviceId: wlc.id, controllerName: wlc.name },
    `CAPWAP: ${wlc.name} echo response`,
    `${wlc.name} confirms the CAPWAP session with ${entry.apId}.`)
}

/** Encapsulate a client frame for transport between an access point and its controller. */
export function capwapDataPdu(source: NetworkDevice, sourcePort: NetworkPort, destMac: string, inner: PacketPdu, peerLabel: string, apId: string, apName: string, controllerDeviceId?: string): PacketPdu {
  return {
    id: `capwap-${crypto.randomUUID()}`,
    protocol: 'CAPWAP',
    sourceMac: sourcePort.macAddress,
    destMac,
    etherType: CAPWAP_ETHER_TYPE,
    sourceIp: '0.0.0.0',
    destIp: '0.0.0.0',
    ttl: inner.ttl,
    summary: `CAPWAP: encapsulate ${inner.protocol} for ${peerLabel}`,
    payload: { capwap: { kind: 'data', seq: 0, apDeviceId: apId, apName, controllerDeviceId }, capwapInnerPacket: inner },
    explanation: {
      layer1: `Outbound interface: ${sourcePort.name}.`,
      layer2: `CAPWAP data frame from ${sourcePort.macAddress} to ${destMac}, carrying an encapsulated ${inner.protocol} frame (${inner.summary}).`,
      layer3: 'N/A (data frame carried on the wired broadcast domain in this simulator).',
      layer4AndAbove: `The client frame is switched centrally by the controller instead of being bridged locally by the access point.`,
      deviceDecision: `${source.name} encapsulates the ${inner.protocol} frame for ${peerLabel}.`,
    },
  }
}

export interface CapwapTickResult { devices: NetworkDevice[]; outbound: CapwapIntent[] }

/** Runs once per simulation tick: discovery retries, echo keepalives, session
 *  timeout on both sides and controller-to-access-point configuration pushes. */
export function prepareCapwapTick(devices: NetworkDevice[], links: NetworkLink[], tick: number): CapwapTickResult {
  const byId = new Map(devices.map(device => [device.id, device]))
  if (!devices.some(device => isLightweightAp(device) || device.wlcRuntime || device.apRuntime)) return { devices, outbound: [] }
  const outbound: CapwapIntent[] = []
  let nextDevices = devices.slice()
  const replace = (index: number, device: NetworkDevice) => {
    if (nextDevices === devices) nextDevices = devices.slice()
    nextDevices[index] = device
  }

  devices.forEach((device, index) => {
    if (isLightweightAp(device)) {
      const runtime = apRuntimeOf(device)
      const wired = apWiredPort(device)
      const liveLinks = links.filter(link => link.fromDeviceId === device.id && link.fromPortId === wired?.id || link.toDeviceId === device.id && link.toPortId === wired?.id).filter(link => linkLive(byId, link))
      const next: ApRuntime = { ...runtime }
      if (!liveLinks.length || !portUp(device, wired)) {
        if (next.state !== 'idle') { next.state = 'idle'; next.wlcMac = undefined; next.wlcPortId = undefined; next.wlans = undefined; next.lastDiscoveryTick = tick - CAPWAP_DISCOVERY_INTERVAL_TICKS }
        replace(index, { ...device, apRuntime: next })
        return
      }
      if (next.state === 'run') {
        if (next.lastEchoResponseTick !== undefined && tick - next.lastEchoResponseTick > CAPWAP_AP_TIMEOUT_TICKS) {
          // The controller stopped answering: the session times out and the access point restarts discovery.
          next.state = 'idle'
          next.wlcMac = undefined
          next.wlcPortId = undefined
          next.wlans = undefined
          next.lastDiscoveryTick = tick - CAPWAP_DISCOVERY_INTERVAL_TICKS
          replace(index, { ...device, apRuntime: next })
          return
        }
        if (next.wlcMac && tick - (next.lastEchoTick ?? next.lastEchoResponseTick ?? tick) >= CAPWAP_ECHO_INTERVAL_TICKS) {
          next.lastEchoTick = tick
          outbound.push({ deviceId: device.id, portId: wired!.id, pdu: echoRequestPdu(device, tick, next.wlcMac) })
        }
        replace(index, { ...device, apRuntime: next })
        return
      }
      if (next.state === 'join' && next.wlcMac && tick - (next.lastJoinTick ?? tick) >= CAPWAP_DISCOVERY_INTERVAL_TICKS) {
        next.lastJoinTick = tick
        outbound.push({ deviceId: device.id, portId: wired!.id, pdu: joinRequestPdu(device, tick, next.wlcMac) })
        replace(index, { ...device, apRuntime: next })
        return
      }
      if (next.state === 'join') {
        replace(index, { ...device, apRuntime: next })
        return
      }
      if (tick - (next.lastDiscoveryTick ?? -CAPWAP_DISCOVERY_INTERVAL_TICKS) >= CAPWAP_DISCOVERY_INTERVAL_TICKS) {
        next.state = 'discovery'
        next.lastDiscoveryTick = tick
        outbound.push({ deviceId: device.id, portId: wired!.id, pdu: discoveryRequestPdu(device, tick) })
      }
      replace(index, { ...device, apRuntime: next })
      return
    }
    if (isWlcDevice(device)) {
      const runtime = wlcRuntimeOf(device)
      const next: WlcRuntime = { ...runtime, aps: runtime.aps.slice(), clientTunnels: runtime.clientTunnels.slice(), pendingConfig: runtime.pendingConfig.map(pending => ({ ...pending })) }
      let changed = runtime !== device.wlcRuntime
      const stale = next.aps.filter(entry => tick - entry.lastSeenTick > CAPWAP_AP_TIMEOUT_TICKS)
      if (stale.length) {
        const gone = new Set(stale.map(entry => entry.apId))
        next.aps = next.aps.filter(entry => !gone.has(entry.apId))
        next.clientTunnels = next.clientTunnels.filter(tunnel => !gone.has(tunnel.apId))
        next.pendingConfig = next.pendingConfig.filter(pending => !gone.has(pending.apId))
        changed = true
      }
      const fingerprint = wlanFingerprint(wlcWlans(device))
      if (fingerprint !== next.lastConfigFingerprint) {
        next.lastConfigFingerprint = fingerprint
        next.configSeq += 1
        for (const entry of next.aps) next.pendingConfig = [...next.pendingConfig.filter(pending => pending.apId !== entry.apId), { apId: entry.apId, seq: next.configSeq, sentAtTick: -1 }]
        changed = true
      }
      for (const pending of next.pendingConfig) {
        if (pending.sentAtTick >= 0 && tick - pending.sentAtTick < CAPWAP_DISCOVERY_INTERVAL_TICKS) continue
        const entry = next.aps.find(candidate => candidate.apId === pending.apId)
        const port = entry && device.ports.find(candidate => candidate.id === entry.portId)
        if (!entry || !portUp(device, port)) continue
        next.seq += 1
        pending.sentAtTick = tick
        outbound.push({ deviceId: device.id, portId: port.id, pdu: configUpdateRequestPdu(device, port, entry, wlcWlans(device), pending.seq, tick) })
        changed = true
      }
      if (changed) replace(index, { ...device, wlcRuntime: next })
      return
    }
    if (device.apRuntime && device.config.apMode !== 'lightweight') replace(index, { ...device, apRuntime: undefined })
  })

  return { devices: nextDevices, outbound }
}

export interface CapwapDelivery {
  device: NetworkDevice
  outbound: CapwapIntent[]
  reason?: string
  note?: string
  inner?: PacketPdu
  innerApId?: string
}

/** Handles one CAPWAP control or data frame at a lightweight access point or controller. */
export function receiveCapwapPacket(receiver: NetworkDevice, port: NetworkPort, linkId: string, pdu: PacketPdu, tick: number): CapwapDelivery {
  const message = pdu.payload.capwap
  if (!message) return { device: receiver, outbound: [], reason: `${receiver.name} received a CAPWAP frame without a control message.` }

  if (isLightweightAp(receiver)) {
    const runtime = apRuntimeOf(receiver)
    const next: ApRuntime = { ...runtime }
    switch (message.kind) {
      case 'discovery-response': {
        if (next.state === 'run') return { device: receiver, outbound: [], reason: `${receiver.name} already has a CAPWAP Run state and drops the Discovery Response.` }
        if (next.state === 'join' && next.selectedWlcId && next.selectedWlcId !== message.controllerDeviceId) {
          return { device: receiver, outbound: [], reason: `${receiver.name} drops the CAPWAP control message because it is not from the selected controller.` }
        }
        if (!portUp(receiver, apWiredPort(receiver)) || !linkId) return { device: receiver, outbound: [], reason: `${receiver.name} has no operational wired link for the CAPWAP session.` }
        next.state = 'join'
        next.selectedWlcId = message.controllerDeviceId ?? next.selectedWlcId
        next.wlcMac = pdu.sourceMac
        next.wlcPortId = port.id
        next.lastJoinTick = tick
        const ap = { ...receiver, apRuntime: next }
        return {
          device: ap,
          outbound: [{ deviceId: receiver.id, portId: apWiredPort(receiver)!.id, pdu: joinRequestPdu(ap, tick, pdu.sourceMac) }],
          note: `${receiver.name} accepted the Discovery Response from ${message.controllerName ?? 'the controller'} and started the CAPWAP Join state.`,
        }
      }
      case 'join-response': {
        if (next.state !== 'join') return { device: receiver, outbound: [], reason: `${receiver.name} drops the Join Response because the CAPWAP process is not in the Join state.` }
        if (next.selectedWlcId && next.selectedWlcId !== message.controllerDeviceId) {
          return { device: receiver, outbound: [], reason: `${receiver.name} drops the CAPWAP control message because it is not from the selected controller.` }
        }
        next.state = 'run'
        next.joinedAtTick = tick
        next.lastEchoTick = tick
        next.lastEchoResponseTick = tick
        return { device: { ...receiver, apRuntime: next }, outbound: [], note: `${receiver.name} moved to the CAPWAP Run state under ${message.controllerName ?? 'the controller'}.` }
      }
      case 'config-update-request': {
        if (next.state !== 'run') return { device: receiver, outbound: [], reason: `${receiver.name} drops the Configuration Update Request because the CAPWAP process is not in the Run state.` }
        next.wlans = (message.wlans ?? []).map(wlan => ({ ...wlan }))
        next.appliedConfigSeq = message.configSeq
        const ap = { ...receiver, apRuntime: next }
        return {
          device: ap,
          outbound: [{ deviceId: receiver.id, portId: apWiredPort(receiver)!.id, pdu: configUpdateResponsePdu(ap, tick, pdu.sourceMac, message.seq, message.configSeq ?? 0) }],
          note: `${receiver.name} applied wireless LAN configuration sequence ${message.configSeq} (${next.wlans.length} WLAN(s)) and acknowledged it.`,
        }
      }
      case 'echo-response': {
        if (next.state !== 'run') return { device: receiver, outbound: [], reason: `${receiver.name} drops the Echo Response because the CAPWAP process is not in the Run state.` }
        next.lastEchoResponseTick = tick
        return { device: { ...receiver, apRuntime: next }, outbound: [], note: `${receiver.name} received a CAPWAP Echo Response from its controller.` }
      }
      case 'data': {
        if (next.state !== 'run') return { device: receiver, outbound: [], reason: `${receiver.name} has no CAPWAP Run state and drops the encapsulated frame.` }
        const inner = pdu.payload.capwapInnerPacket
        if (!inner) return { device: receiver, outbound: [], reason: `${receiver.name} received a CAPWAP data frame without an encapsulated payload.` }
        return { device: receiver, outbound: [], inner, innerApId: receiver.id, note: `${receiver.name} decapsulated ${inner.protocol} traffic for its wireless clients.` }
      }
      default:
        return { device: receiver, outbound: [], reason: `${receiver.name} is not expecting this CAPWAP control message and drops it.` }
    }
  }

  if (isWlcDevice(receiver)) {
    const runtime = wlcRuntimeOf(receiver)
    const next: WlcRuntime = { ...runtime, aps: runtime.aps.slice(), clientTunnels: runtime.clientTunnels.slice(), pendingConfig: runtime.pendingConfig.map(pending => ({ ...pending })) }
    switch (message.kind) {
      case 'discovery-request': {
        const apMac = pdu.sourceMac
        const apName = message.apName ?? 'access point'
        return { device: receiver, outbound: [{ deviceId: receiver.id, portId: port.id, pdu: discoveryResponsePdu(receiver, port, apMac, apName, tick) }], note: `${receiver.name} answered the CAPWAP discovery broadcast from ${apName}.` }
      }
      case 'join-request': {
        const apId = message.apDeviceId
        if (!apId) return { device: receiver, outbound: [], reason: `${receiver.name} received a Join Request without an access point identity.` }
        const apName = message.apName ?? apId
        const existing = next.aps.find(entry => entry.apId === apId)
        const entry: WlcApEntry = { apId, apMac: pdu.sourceMac, portId: port.id, linkId, state: 'run', joinedAtTick: existing?.joinedAtTick ?? tick, lastSeenTick: tick }
        next.aps = [...next.aps.filter(candidate => candidate.apId !== apId), entry]
        next.seq += 1
        const configSeq = next.configSeq + 1
        next.configSeq = configSeq
        next.lastConfigFingerprint = wlanFingerprint(wlcWlans(receiver))
        next.pendingConfig = [...next.pendingConfig.filter(pending => pending.apId !== apId), { apId, seq: configSeq, sentAtTick: tick }]
        return {
          device: { ...receiver, wlcRuntime: next },
          outbound: [
            { deviceId: receiver.id, portId: port.id, pdu: joinResponsePdu(receiver, port, pdu.sourceMac, apId, apName, tick) },
            { deviceId: receiver.id, portId: port.id, pdu: configUpdateRequestPdu(receiver, port, entry, wlcWlans(receiver), configSeq, tick) },
          ],
          note: `${receiver.name} accepted the Join Request from ${apName} and pushed its wireless LAN configuration.`,
        }
      }
      case 'config-update-response': {
        const pending = next.pendingConfig.find(candidate => candidate.apId === message.apDeviceId)
        if (!pending) return { device: receiver, outbound: [], reason: `${receiver.name} received a Configuration Update Response for an access point with no outstanding configuration.` }
        if (pending.seq !== message.configSeq || message.ackSeq === undefined) {
          return { device: receiver, outbound: [], reason: `${receiver.name} drops the Configuration Update Response because the sequence number does not match.` }
        }
        next.pendingConfig = next.pendingConfig.filter(candidate => candidate.apId !== message.apDeviceId)
        const entry = next.aps.find(candidate => candidate.apId === message.apDeviceId)
        if (entry) entry.lastSeenTick = tick
        return { device: { ...receiver, wlcRuntime: next }, outbound: [], note: `${receiver.name} confirmed wireless LAN configuration sequence ${message.configSeq} on ${message.apName ?? message.apDeviceId}.` }
      }
      case 'echo-request': {
        const entry = next.aps.find(candidate => candidate.apId === message.apDeviceId)
        if (!entry) return { device: receiver, outbound: [], reason: `${receiver.name} received an Echo Request from an access point that is not joined.` }
        entry.lastSeenTick = tick
        return { device: { ...receiver, wlcRuntime: next }, outbound: [{ deviceId: receiver.id, portId: port.id, pdu: echoResponsePdu(receiver, port, entry, tick) }], note: `${receiver.name} refreshed the CAPWAP session with ${message.apName ?? entry.apId}.` }
      }
      case 'data': {
        const entry = next.aps.find(candidate => candidate.apId === message.apDeviceId)
        if (!entry) return { device: receiver, outbound: [], reason: `${receiver.name} drops the CAPWAP data frame because the access point is not registered.` }
        entry.lastSeenTick = tick
        const inner = pdu.payload.capwapInnerPacket
        if (!inner) return { device: receiver, outbound: [], reason: `${receiver.name} received a CAPWAP data frame without an encapsulated payload.` }
        return { device: { ...receiver, wlcRuntime: next }, outbound: [], inner, innerApId: entry.apId, note: `${receiver.name} decapsulated ${inner.protocol} traffic from ${message.apName ?? entry.apId}.` }
      }
      default:
        return { device: receiver, outbound: [], reason: `${receiver.name} drops the CAPWAP control message ${message.kind} because it is not addressed to the controller side of the session.` }
    }
  }

  return { device: receiver, outbound: [], reason: `${receiver.name} is not part of a CAPWAP session and drops the frame.` }
}

/** Tracks which wireless link reaches a client MAC through this access point. */
export function clientLinkFor(devices: NetworkDevice[], links: NetworkLink[], ap: NetworkDevice, macAddress: string): NetworkLink | undefined {
  const wirelessPort = apWirelessPort(ap)
  if (!wirelessPort) return undefined
  for (const link of links) {
    const touchesPort = link.fromDeviceId === ap.id && link.fromPortId === wirelessPort.id || link.toDeviceId === ap.id && link.toPortId === wirelessPort.id
    if (!touchesPort) continue
    const peerId = link.fromDeviceId === ap.id ? link.toDeviceId : link.fromDeviceId
    const peer = devices.find(device => device.id === peerId)
    if (peer?.ports.some(candidate => sameMac(candidate.macAddress, macAddress))) return link
  }
  return undefined
}
