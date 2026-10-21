import type { NetworkDevice, NetworkPort } from '@/types/network'
import { isValidIpv4 } from './protocols/ip'

export interface ManagementAddress {
  portId: string
  portName: string
  ip: string
  mask: string
  gateway?: string
}

export function deviceManagementAddresses(device: NetworkDevice): ManagementAddress[] {
  return device.ports
    .map((port, order) => ({ port, order }))
    .filter(({ port }) =>
      port.adminStatus === 'up' &&
      !port.parentPortId &&
      !port.name.includes('.') &&
      isValidIpv4(port.ipAddress ?? '') &&
      isValidIpv4(port.subnetMask ?? '')
    )
    // Prefer an addressed interface whose link is up. A Layer-3 switch's
    // management address is its VLAN interface, not an access port that
    // happens to carry an address.
    .sort((a, b) => {
      const active = (port: NetworkPort) => port.status !== 'down' ? 0 : 1
      const vlan = (port: NetworkPort) => device.type === 'switch' && port.virtualVlan !== undefined ? 0 : 1
      return vlan(a.port) - vlan(b.port) || active(a.port) - active(b.port) || a.order - b.order
    })
    .map(({ port }) => ({
      portId: port.id,
      portName: port.name,
      ip: (port.ipAddress ?? '').trim(),
      mask: (port.subnetMask ?? '').trim(),
      gateway: device.config.defaultGateway,
    }))
}

export function primaryManagementAddress(device: NetworkDevice): ManagementAddress | undefined {
  return deviceManagementAddresses(device)[0]
}

export function defaultManagementRange(ip: string | undefined): { start: string; end: string } {
  if (!ip || !isValidIpv4(ip)) return { start: '192.168.1.1', end: '192.168.1.254' }
  const prefix = ip.split('.').slice(0, 3).join('.')
  return { start: `${prefix}.1`, end: `${prefix}.254` }
}
