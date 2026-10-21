import type {
  NetworkControllerDiscovery,
  NetworkControllerDiscoveryMode,
  NetworkControllerState,
  NetworkDevice,
  NetworkLink,
  NetworkPort,
} from '@/types/network'
import { ipToNumber, isValidIpv4 } from './protocols/ip'

export const NETWORK_CONTROLLER_MODEL = 'NetworkController'
export const NETWORK_CONTROLLER_DISCOVERY_LIMIT = 20

/**
 * Served by the controller's HTTP listener. The Web Browser replaces this
 * fallback page with the interactive console when the response comes from an
 * NC, so raw HTTP clients still receive a truthful 200 response.
 */
export const NETWORK_CONTROLLER_HTTP_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Controller</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f3f6fa;color:#13212e">
<main style="max-width:560px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.12)">
<div style="display:inline-block;padding:5px 9px;border-radius:6px;background:#dff5f4;color:#0f766e;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">HTTP 200 OK</div>
<h1 style="font-size:26px;margin:18px 0 8px">Network Controller</h1>
<p style="line-height:1.6;color:#475569">The simulated controller is online. Open this address from the Web Browser on a connected PC to use the management console.</p>
</main></body></html>`

export function isNetworkController(device: Pick<NetworkDevice, 'type' | 'model'> | null | undefined): boolean {
  return device?.type === 'pc' && device.model === NETWORK_CONTROLLER_MODEL
}

export function isHttpServerDevice(device: Pick<NetworkDevice, 'type' | 'model'>): boolean {
  return device.type === 'server' || isNetworkController(device)
}

export function isHttpServiceEnabled(device: Pick<NetworkDevice, 'type' | 'model' | 'config'>): boolean {
  return isNetworkController(device) || device.config.httpServiceEnabled === true
}

export function httpResponseBody(device: NetworkDevice): string {
  if (isNetworkController(device)) return NETWORK_CONTROLLER_HTTP_PAGE
  return device.config.htmlContent || '<h1>wireX Web Server</h1><p>HTTP service operational.</p>'
}

export function networkControllerState(device: Pick<NetworkDevice, 'config'>): NetworkControllerState {
  return device.config.networkController ?? {}
}

/**
 * Classroom convenience digest. The workspace file remains readable and
 * editable by its owner; this is not a security boundary.
 */
export function hashNetworkControllerPassword(password: string): string {
  let hash = 0x811c9dc5
  for (const character of `wirex-network-controller:${password}`) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export interface NetworkControllerAddress {
  portId: string
  portName: string
  ip: string
  mask: string
  gateway?: string
}

export function networkControllerAddresses(device: NetworkDevice): NetworkControllerAddress[] {
  return device.ports
    .map((port, order) => ({ port, order }))
    .filter(({ port }) =>
      port.adminStatus === 'up' &&
      !port.parentPortId &&
      !port.name.includes('.') &&
      isValidIpv4(port.ipAddress ?? '') &&
      isValidIpv4(port.subnetMask ?? '')
    )
    // A Layer-3 switch's management address is its VLAN interface, not an
    // access port that happens to carry an address.
    .sort((a, b) => {
      const rank = (port: NetworkPort) => device.type === 'switch' && port.virtualVlan !== undefined ? 0 : 1
      return rank(a.port) - rank(b.port) || a.order - b.order
    })
    .map(({ port }) => ({
      portId: port.id,
      portName: port.name,
      ip: (port.ipAddress ?? '').trim(),
      mask: (port.subnetMask ?? '').trim(),
      gateway: device.config.defaultGateway,
    }))
}

export function primaryNetworkControllerAddress(device: NetworkDevice): NetworkControllerAddress | undefined {
  return networkControllerAddresses(device)[0]
}

export function defaultNetworkControllerRange(ip: string | undefined): { start: string; end: string } {
  if (!ip || !isValidIpv4(ip)) return { start: '192.168.1.1', end: '192.168.1.254' }
  const prefix = ip.split('.').slice(0, 3).join('.')
  return { start: `${prefix}.1`, end: `${prefix}.254` }
}

function activeLinks(devices: NetworkDevice[], links: NetworkLink[]): NetworkLink[] {
  const byId = new Map(devices.map(device => [device.id, device]))
  return links.filter(link => {
    if (link.status !== 'up') return false
    const from = byId.get(link.fromDeviceId)
    const to = byId.get(link.toDeviceId)
    if (!from?.power || !to?.power) return false
    const fromPort = from.ports.find(port => port.id === link.fromPortId)
    const toPort = to.ports.find(port => port.id === link.toPortId)
    return Boolean(
      fromPort &&
      toPort &&
      fromPort.adminStatus === 'up' &&
      toPort.adminStatus === 'up' &&
      fromPort.status !== 'down' &&
      toPort.status !== 'down'
    )
  })
}

/** Active-link adjacency from the controller, seeded at its current device position. */
export function reachableNetworkControllerDeviceIds(
  controller: NetworkDevice,
  devices: NetworkDevice[],
  links: NetworkLink[]
): Set<string> {
  const reachable = new Set<string>()
  if (!controller.power) return reachable
  const adjacency = new Map<string, string[]>()
  for (const link of activeLinks(devices, links)) {
    adjacency.set(link.fromDeviceId, [...(adjacency.get(link.fromDeviceId) ?? []), link.toDeviceId])
    adjacency.set(link.toDeviceId, [...(adjacency.get(link.toDeviceId) ?? []), link.fromDeviceId])
  }
  const queue = [controller.id]
  reachable.add(controller.id)
  while (queue.length) {
    const current = queue.shift()!
    for (const peer of adjacency.get(current) ?? []) {
      if (reachable.has(peer)) continue
      reachable.add(peer)
      queue.push(peer)
    }
  }
  return reachable
}

export interface NetworkControllerDiscoveryInput {
  id?: string
  name?: string
  mode: NetworkControllerDiscoveryMode
  rangeStart?: string
  rangeEnd?: string
  atMs?: number
}

export interface NetworkControllerDiscoveryResult {
  ok: boolean
  discovery: NetworkControllerDiscovery
  deviceIds: string[]
}

export function discoverNetworkController(
  controller: NetworkDevice,
  devices: NetworkDevice[],
  links: NetworkLink[],
  input: NetworkControllerDiscoveryInput
): NetworkControllerDiscoveryResult {
  const atMs = input.atMs ?? Date.now()
  const mode = input.mode
  const name = input.name?.trim() || (mode === 'cdp' ? 'Connected discovery' : 'IP range discovery')
  const base = {
    id: input.id ?? `nc-discovery-${atMs}-${mode}`,
    name,
    mode,
    ...(mode === 'ip-range' ? { rangeStart: input.rangeStart?.trim(), rangeEnd: input.rangeEnd?.trim() } : {}),
    createdAtMs: atMs,
  }
  const fail = (reason: NetworkControllerDiscovery['reason']): NetworkControllerDiscoveryResult => {
    const discovery: NetworkControllerDiscovery = { ...base, status: 'failed', reason, deviceIds: [] }
    return { ok: false, discovery, deviceIds: [] }
  }

  if (!controller.power) return fail('power-off')
  if (!primaryNetworkControllerAddress(controller)) return fail('no-ip')
  if (activeLinks(devices, links).every(link => link.fromDeviceId !== controller.id && link.toDeviceId !== controller.id)) {
    return fail('no-active-link')
  }

  let rangeStart = 0
  let rangeEnd = 0
  if (mode === 'ip-range') {
    if (!isValidIpv4(input.rangeStart ?? '') || !isValidIpv4(input.rangeEnd ?? '')) return fail('invalid-range')
    rangeStart = ipToNumber(input.rangeStart!.trim())
    rangeEnd = ipToNumber(input.rangeEnd!.trim())
    if (rangeStart > rangeEnd) return fail('invalid-range')
  }

  const reachable = reachableNetworkControllerDeviceIds(controller, devices, links)
  const discovered = devices.filter(device => {
    if (device.id === controller.id || !device.power || !reachable.has(device.id)) return false
    const addresses = networkControllerAddresses(device)
    if (!addresses.length) return false
    if (mode === 'cdp') return true
    return addresses.some(address => {
      const value = ipToNumber(address.ip)
      return value >= rangeStart && value <= rangeEnd
    })
  })

  discovered.sort((a, b) => {
    const aIp = networkControllerAddresses(a)[0]?.ip ?? ''
    const bIp = networkControllerAddresses(b)[0]?.ip ?? ''
    return (ipToNumber(aIp) - ipToNumber(bIp)) || a.name.localeCompare(b.name)
  })
  const deviceIds = discovered.map(device => device.id)
  const discovery: NetworkControllerDiscovery = { ...base, status: 'complete', deviceIds }
  return { ok: true, discovery, deviceIds }
}

export function currentNetworkControllerDiscovery(device: Pick<NetworkDevice, 'config'>): NetworkControllerDiscovery | undefined {
  const state = networkControllerState(device)
  const discoveries = state.discoveries ?? []
  return discoveries.find(item => item.id === state.lastDiscoveryId) ?? discoveries[0]
}

export function networkControllerInventory(
  controller: NetworkDevice,
  devices: NetworkDevice[]
): NetworkDevice[] {
  const discovery = currentNetworkControllerDiscovery(controller)
  if (!discovery) return []
  const ids = new Set(discovery.deviceIds)
  return devices.filter(device => ids.has(device.id))
}

export function networkControllerDeviceStatus(
  device: NetworkDevice
): 'active' | 'idle' | 'no-ip' | 'off' {
  if (!device.power) return 'off'
  if (!networkControllerAddresses(device).length) return 'no-ip'
  return device.ports.some(port =>
    port.adminStatus === 'up' &&
    port.status !== 'down' &&
    isValidIpv4(port.ipAddress ?? '')
  ) ? 'active' : 'idle'
}

export function isNetworkControllerHost(device: Pick<NetworkDevice, 'type'>): boolean {
  return ['pc', 'laptop', 'server', 'printer', 'phone', 'tv', 'tablet', 'smartphone', 'iot'].includes(device.type)
}
