import type { DeviceConfig, InFlightPacket, NetworkDevice, NetworkPort, PacketPdu, SnifferCapture } from '@/types/network'

export const SNIFFER_MODEL = 'Sniffer'
export const SNIFFER_DEFAULT_BUFFER_SIZE = 100
export const SNIFFER_MAX_BUFFER_SIZE = 500

export function isSniffer(device: Pick<NetworkDevice, 'type' | 'model'>): boolean {
  return device.type === 'hub' && device.model === SNIFFER_MODEL
}

export function snifferBufferLimit(config: DeviceConfig): number {
  const value = config.snifferBufferSize
  if (typeof value !== 'number' || !Number.isFinite(value)) return SNIFFER_DEFAULT_BUFFER_SIZE
  return Math.max(1, Math.min(SNIFFER_MAX_BUFFER_SIZE, Math.floor(value)))
}

export function snifferServiceEnabled(config: DeviceConfig): boolean {
  return config.snifferServiceEnabled !== false
}

export function snifferPortEnabled(config: DeviceConfig, portId: string): boolean {
  return config.snifferPorts?.[portId] !== false
}

function snapshotPdu(pdu: PacketPdu): PacketPdu {
  return structuredClone(pdu)
}

/**
 * Record one frame that arrived on a Sniffer repeater port. The service and
 * port must be enabled; the buffer keeps only the newest configured entries.
 * Returns null when the frame is not captured so the engine can skip cloning
 * the device for ordinary hub traffic.
 */
export function captureSnifferPacket(
  device: NetworkDevice,
  packet: Pick<InFlightPacket, 'id' | 'pdu'>,
  port: Pick<NetworkPort, 'id' | 'name'>,
  tick: number,
): NetworkDevice | null {
  if (!isSniffer(device) || device.power === false) return null
  if (!snifferServiceEnabled(device.config) || !snifferPortEnabled(device.config, port.id)) return null
  const capture: SnifferCapture = {
    id: `sniffer-${packet.id}-${port.id}-${tick}`,
    tick,
    portId: port.id,
    portName: port.name,
    pdu: snapshotPdu(packet.pdu),
  }
  const limit = snifferBufferLimit(device.config)
  return { ...device, snifferCaptures: [...(device.snifferCaptures ?? []), capture].slice(-limit) }
}

export function snifferModulePorts(device: NetworkDevice): NetworkPort[] {
  return device.ports.filter(port => port.moduleSlot !== undefined)
}
