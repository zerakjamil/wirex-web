import type { NetworkCluster, PhysicalContainer, PhysicalContainerKind } from '@/types/network'

// Physical workspace model: the Intercity root (labeled in the path strip)
// → city → building → wiring closet → racks, tables, inventory shelves and
// cable pegboards, plus generic containers anywhere below the building level.
// Racks, tables, shelves and generic containers hold devices; buildings,
// cities and closets are organizational; pegboards hold only cabling.
// Logical clusters are flat named device groups that can be mapped to a
// physical container through the Cluster Associations dialog.

export const DEFAULT_PHYSICAL_RACK_ID = 'phys-rack-1'
export const PHYSICAL_KIND_LABELS: Record<PhysicalContainerKind, string> = {
  city: 'City',
  building: 'Building',
  closet: 'Wiring Closet',
  rack: 'Rack',
  table: 'Table',
  shelf: 'Inventory Shelf',
  pegboard: 'Cable Pegboard',
  generic: 'Generic Container',
}

export function defaultPhysicalContainers(): PhysicalContainer[] {
  return [
    { id: 'phys-city-main', kind: 'city', name: 'Home City', parentId: null },
    { id: 'phys-building-main', kind: 'building', name: 'Corporate Office', parentId: 'phys-city-main' },
    { id: 'phys-closet-main', kind: 'closet', name: 'Main Wiring Closet', parentId: 'phys-building-main' },
    { id: DEFAULT_PHYSICAL_RACK_ID, kind: 'rack', name: 'Rack 1', parentId: 'phys-closet-main' },
  ]
}

export function allowedChildKinds(parent: PhysicalContainerKind | null): PhysicalContainerKind[] {
  if (parent === null) return ['city', 'building', 'generic']
  if (parent === 'city') return ['building', 'generic']
  if (parent === 'building') return ['closet', 'generic']
  if (parent === 'closet') return ['rack', 'table', 'shelf', 'pegboard']
  return []
}

export function canHoldDevices(kind: PhysicalContainerKind) {
  return kind === 'rack' || kind === 'table' || kind === 'shelf' || kind === 'generic'
}

/** True when the device's current placement is an inventory shelf (stored, not operable). */
export function isStoredOnShelf(containers: PhysicalContainer[], assignment: Record<string, string>, deviceId: string) {
  return deviceContainer(containers, assignment, deviceId)?.kind === 'shelf'
}

export function containerById(containers: PhysicalContainer[], id: string | null | undefined) {
  return id ? containers.find(container => container.id === id) : undefined
}

export function containersByParent(containers: PhysicalContainer[], parentId: string | null) {
  return containers.filter(container => container.parentId === parentId)
}

/** Chain from the top-most ancestor down to the container, or [] when unknown. */
export function ancestorPath(containers: PhysicalContainer[], id: string): PhysicalContainer[] {
  const chain: PhysicalContainer[] = []
  let current = containerById(containers, id)
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = containerById(containers, current.parentId)
  }
  return chain
}

export function containerLabelPath(containers: PhysicalContainer[], id: string) {
  return ancestorPath(containers, id).map(container => container.name).join(' > ')
}

export function nextContainerName(containers: PhysicalContainer[], kind: PhysicalContainerKind) {
  const count = containers.filter(container => container.kind === kind).length
  return `${PHYSICAL_KIND_LABELS[kind]} ${count + 1}`
}

export function addContainer(containers: PhysicalContainer[], container: PhysicalContainer): PhysicalContainer[] {
  return [...containers, container]
}

export function renameContainer(containers: PhysicalContainer[], id: string, name: string): PhysicalContainer[] {
  const trimmed = name.trim().slice(0, 64)
  if (!trimmed) return containers
  return containers.map(container => (container.id === id ? { ...container, name: trimmed } : container))
}

/** Removes the container and its whole subtree. Devices in removed containers fall back to the default rack. */
export function deleteContainerTree(containers: PhysicalContainer[], id: string): PhysicalContainer[] {
  const removed = containerSubtreeIds(containers, id)
  return containers.filter(container => !removed.has(container.id))
}

export function containerSubtreeIds(containers: PhysicalContainer[], id: string): Set<string> {
  const removed = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const container of containers) {
      if (container.parentId && removed.has(container.parentId) && !removed.has(container.id)) {
        removed.add(container.id)
        grew = true
      }
    }
  }
  return removed
}

/** First rack or table in tree order — the fallback placement when an assignment is missing or stale. */
export function firstDeviceContainer(containers: PhysicalContainer[]) {
  return containers.find(container => canHoldDevices(container.kind))
}

/**
 * The container a device is displayed in: its assignment when it still points at an existing
 * rack or table, the default rack when present, otherwise the first rack or table, otherwise null.
 */
export function deviceContainer(containers: PhysicalContainer[], assignment: Record<string, string>, deviceId: string): PhysicalContainer | null {
  const assigned = containerById(containers, assignment[deviceId])
  if (assigned && canHoldDevices(assigned.kind)) return assigned
  const fallback = containerById(containers, DEFAULT_PHYSICAL_RACK_ID)
  if (fallback && canHoldDevices(fallback.kind)) return fallback
  return firstDeviceContainer(containers) ?? null
}

export function moveDeviceAssignment(assignment: Record<string, string>, deviceId: string, containerId: string): Record<string, string> {
  return { ...assignment, [deviceId]: containerId }
}

/** Drops assignments and cluster memberships that point at devices or containers that no longer exist. */
export function sanitizePhysical(
  containers: PhysicalContainer[],
  assignment: Record<string, string>,
  clusters: NetworkCluster[],
  deviceIds: Iterable<string>,
): { containers: PhysicalContainer[]; assignment: Record<string, string>; clusters: NetworkCluster[] } {
  const devices = new Set(deviceIds)
  const containerIds = new Set(containers.filter(container => canHoldDevices(container.kind)).map(container => container.id))
  const allContainerIds = new Set(containers.map(container => container.id))
  const nextAssignment: Record<string, string> = {}
  for (const [deviceId, containerId] of Object.entries(assignment)) {
    if (devices.has(deviceId) && containerIds.has(containerId)) nextAssignment[deviceId] = containerId
  }
  const clusterIds = new Set<string>()
  const nextClusters: NetworkCluster[] = []
  for (const cluster of clusters) {
    const members = cluster.deviceIds.filter(deviceId => devices.has(deviceId))
    const id = clusterIds.has(cluster.id) ? `${cluster.id}-${clusterIds.size}` : cluster.id
    clusterIds.add(id)
    if (members.length) {
      const next: NetworkCluster = { ...cluster, id, deviceIds: members }
      if (next.physicalContainerId && !allContainerIds.has(next.physicalContainerId)) delete next.physicalContainerId
      nextClusters.push(next)
    }
  }
  return { containers, assignment: nextAssignment, clusters: nextClusters }
}

export function addCluster(clusters: NetworkCluster[], cluster: NetworkCluster): NetworkCluster[] {
  return [...clusters, cluster]
}

export function renameCluster(clusters: NetworkCluster[], id: string, name: string): NetworkCluster[] {
  const trimmed = name.trim().slice(0, 64)
  if (!trimmed) return clusters
  return clusters.map(cluster => (cluster.id === id ? { ...cluster, name: trimmed } : cluster))
}

export function removeCluster(clusters: NetworkCluster[], id: string): NetworkCluster[] {
  return clusters.filter(cluster => cluster.id !== id)
}

/** Removes a deleted device from every cluster; clusters left empty disband. */
export function purgeDeviceFromClusters(clusters: NetworkCluster[], deviceId: string): NetworkCluster[] {
  const next = clusters
    .map(cluster => (cluster.deviceIds.includes(deviceId) ? { ...cluster, deviceIds: cluster.deviceIds.filter(id => id !== deviceId) } : cluster))
    .filter(cluster => cluster.deviceIds.length > 0)
  return next.length === clusters.length && next.every((cluster, index) => cluster === clusters[index]) ? clusters : next
}
