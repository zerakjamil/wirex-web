import type { NetworkDevice, NetworkLink } from '@/types/network'

/** Links that currently carry packets: both ends powered and administratively up. */
export function activeTopologyLinks(devices: NetworkDevice[], links: NetworkLink[]): NetworkLink[] {
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

/** Active-link adjacency from a seed device. */
export function reachableDeviceIds(
  seed: NetworkDevice,
  devices: NetworkDevice[],
  links: NetworkLink[]
): Set<string> {
  const reachable = new Set<string>()
  if (!seed.power) return reachable
  const adjacency = new Map<string, string[]>()
  for (const link of activeTopologyLinks(devices, links)) {
    adjacency.set(link.fromDeviceId, [...(adjacency.get(link.fromDeviceId) ?? []), link.toDeviceId])
    adjacency.set(link.toDeviceId, [...(adjacency.get(link.toDeviceId) ?? []), link.fromDeviceId])
  }
  const queue = [seed.id]
  reachable.add(seed.id)
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
