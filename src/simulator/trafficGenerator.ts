import type { InFlightPacket, PacketPdu } from '@/types/network'
import { isValidIpv4 } from '@/simulator/protocols/ip'
import { isValidIpv6 } from '@/simulator/protocols/ipv6'
import { isValidTftpFileName } from '@/simulator/tftp'
import { SIMULATION_TICK_MS } from './ospf'

export type TrafficGeneratorApplication = 'icmp' | 'http' | 'tftp' | 'udp' | 'dns' | 'ntp'

export interface TrafficGeneratorSettings {
  application: TrafficGeneratorApplication
  target: string
  path: string
  fileName: string
  port: number
  data: string
  packetColor: string
  dscp: number | null
}

export interface TrafficGeneratorRun {
  id: string
  deviceId: string
  settings: TrafficGeneratorSettings
  intervalSeconds: number
  sentCount: number
  startedTick: number
  nextDueTick: number
  lastRequestId: string | null
}

export type TrafficGeneratorError =
  | 'device-missing'
  | 'interval-invalid'
  | 'interval-range'
  | 'target-invalid'
  | 'domain-invalid'
  | 'path-invalid'
  | 'file-invalid'
  | 'port-invalid'
  | 'dscp-invalid'

// The accepted interval window matches the reference tool: 0.001 s to 1,000,000 s.
export const TRAFFIC_GENERATOR_MIN_INTERVAL_SECONDS = 0.001
export const TRAFFIC_GENERATOR_MAX_INTERVAL_SECONDS = 1000000
export const TRAFFIC_GENERATOR_STEP_SECONDS = SIMULATION_TICK_MS / 1000
export const TRAFFIC_GENERATOR_DEFAULT_DATA = 'wirex traffic'

export const TRAFFIC_GENERATOR_APPLICATIONS: ReadonlyArray<{ id: TrafficGeneratorApplication; label: string }> = [
  { id: 'icmp', label: 'ICMP Echo' },
  { id: 'http', label: 'HTTP GET' },
  { id: 'tftp', label: 'TFTP Read' },
  { id: 'udp', label: 'UDP Echo' },
  { id: 'dns', label: 'DNS Query' },
  { id: 'ntp', label: 'NTP Query' },
]

export const TRAFFIC_GENERATOR_PACKET_COLORS = ['#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed'] as const

export function defaultTrafficGeneratorSettings(): TrafficGeneratorSettings {
  return {
    application: 'icmp',
    target: '',
    path: '/',
    fileName: 'wirex.txt',
    port: 7,
    data: TRAFFIC_GENERATOR_DEFAULT_DATA,
    packetColor: '',
    dscp: null,
  }
}

export function parseTrafficGeneratorInterval(input: string): { ok: true; seconds: number } | { ok: false; error: 'interval-invalid' | 'interval-range' } {
  const trimmed = input.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, error: 'interval-invalid' }
  const seconds = Number(trimmed)
  if (!Number.isFinite(seconds) || seconds < TRAFFIC_GENERATOR_MIN_INTERVAL_SECONDS || seconds > TRAFFIC_GENERATOR_MAX_INTERVAL_SECONDS) {
    return { ok: false, error: 'interval-range' }
  }
  return { ok: true, seconds }
}

export function trafficGeneratorIntervalTicks(seconds: number) {
  return Math.max(1, Math.round(seconds / TRAFFIC_GENERATOR_STEP_SECONDS))
}

export function validateTrafficGeneratorSettings(settings: TrafficGeneratorSettings): TrafficGeneratorError | null {
  if (settings.dscp !== null && (!Number.isInteger(settings.dscp) || settings.dscp < 0 || settings.dscp > 63)) return 'dscp-invalid'
  const target = settings.target.trim()
  switch (settings.application) {
    case 'icmp':
      return isValidIpv4(target) || isValidIpv6(target) ? null : 'target-invalid'
    case 'http':
      if (!isValidIpv4(target)) return 'target-invalid'
      return settings.path.trim().startsWith('/') ? null : 'path-invalid'
    case 'tftp':
      if (!isValidIpv4(target)) return 'target-invalid'
      return isValidTftpFileName(settings.fileName) ? null : 'file-invalid'
    case 'udp':
      if (!isValidIpv4(target)) return 'target-invalid'
      return Number.isInteger(settings.port) && settings.port >= 1 && settings.port <= 65535 ? null : 'port-invalid'
    case 'dns':
      if (isValidIpv4(target)) return 'domain-invalid'
      return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(target) ? null : 'domain-invalid'
    case 'ntp':
      return isValidIpv4(target) ? null : 'target-invalid'
  }
}

// Generated frames are correlated to their dispatch by the same request id the send actions stamp
// on their PDUs, so unit-level frames (and the ARP frame that carries a pending request) can be
// found again to carry the configured packet color and DSCP value.
export function trafficGeneratorPduMatches(pdu: PacketPdu, application: TrafficGeneratorApplication, requestId: string): boolean {
  const payload = pdu.payload
  const matches = application === 'icmp'
    ? pdu.pingId === requestId
    : application === 'http'
      ? payload.tcpRequestId === requestId || payload.httpRequestId === requestId
      : application === 'dns'
        ? payload.dnsRequestId === requestId
        : payload.udpRequestId === requestId
  if (matches) return true
  return pdu.pendingPacket ? trafficGeneratorPduMatches(pdu.pendingPacket, application, requestId) : false
}

function stampTrafficGeneratorPdu(pdu: PacketPdu, application: TrafficGeneratorApplication, requestId: string, color: string | undefined, dscp: number | undefined): PacketPdu {
  if (!trafficGeneratorPduMatches(pdu, application, requestId)) return pdu
  const pending = pdu.pendingPacket ? stampTrafficGeneratorPdu(pdu.pendingPacket, application, requestId, color, dscp) : undefined
  return {
    ...pdu,
    ...(color ? { generatorColor: color } : {}),
    ...(pending && pending !== pdu.pendingPacket ? { pendingPacket: pending } : {}),
    payload: dscp !== undefined && pdu.protocol !== 'ARP' ? { ...pdu.payload, dscp } : pdu.payload,
  }
}

export function stampTrafficGeneratorPackets(packets: InFlightPacket[], application: TrafficGeneratorApplication, requestId: string, packetColor: string, dscp: number | null): InFlightPacket[] {
  const color = packetColor || undefined
  const dscpValue = dscp ?? undefined
  if (!color && dscpValue === undefined) return packets
  let changed = false
  const stamped = packets.map(packet => {
    const pdu = stampTrafficGeneratorPdu(packet.pdu, application, requestId, color, dscpValue)
    if (pdu === packet.pdu) return packet
    changed = true
    return { ...packet, pdu }
  })
  return changed ? stamped : packets
}
