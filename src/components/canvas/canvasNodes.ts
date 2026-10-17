import type { Node } from '@xyflow/react'
import type { NetworkAnnotation, NetworkCluster, NetworkDevice, NetworkLink } from '@/types/network'

export type NodeMeasurements = Record<string, { width: number; height: number }>

export function createCanvasDeviceSelector() {
  let previous: NetworkDevice[] = []
  let input: NetworkDevice[] | undefined
  const visible = ['id', 'name', 'model', 'type', 'x', 'y', 'ports', 'config', 'power', 'modules', 'macAddress'] as const
  return (devices: NetworkDevice[]) => {
    if (devices === input) return previous
    input = devices
    const byId = new Map(previous.map(d => [d.id, d]))
    const next = devices.map(d => {
      const old = byId.get(d.id)
      return old && visible.every(key => old[key] === d[key]) ? old : d
    })
    if (next.length === previous.length && next.every((d, i) => d === previous[i])) return previous
    previous = next
    return next
  }
}
export const selectCanvasDevices = createCanvasDeviceSelector()

export function getTopologyFitNodes(devices: NetworkDevice[], links: Pick<NetworkLink, 'fromDeviceId' | 'toDeviceId'>[]) {
  const connected = new Set(links.flatMap(link => [link.fromDeviceId, link.toDeviceId]))
  let targets = connected.size ? devices.filter(device => connected.has(device.id)) : devices
  const normal = targets.filter(d => d.x < 2500 && d.y < 2500)
  if (normal.length > 0) targets = normal
  return targets.map(device => ({ id: device.id }))
}

const nodeCache = new Map<string, Node>()
const cacheLimit = 2048
const NODE_STYLE_ANNOTATION = { pointerEvents: 'all' as const }
const NODE_STYLE_ZONE = { pointerEvents: 'none' as const }

function sameNode(previous: Node | undefined, node: Node): Node {
  if (previous
    && previous.type === node.type
    && previous.zIndex === node.zIndex
    && previous.position.x === node.position.x
    && previous.position.y === node.position.y
    && previous.measured === node.measured
    && previous.selected === node.selected
    && previous.style === node.style
    && previous.data.annotation === node.data.annotation
    && previous.data.cluster === node.data.cluster
    && previous.data.width === node.data.width
    && previous.data.height === node.data.height
    && previous.data.device === node.data.device) {
    return previous
  }
  return node
}

export function createCanvasNodes(devices: NetworkDevice[], annotations: NetworkAnnotation[], measurements: NodeMeasurements, selectedIds?: ReadonlySet<string>, clusters?: NetworkCluster[]): Node[] {
  const nodes: Node[] = [
    ...annotations.map(a => sameNode(nodeCache.get(a.id), {
      id: a.id,
      type: 'annotationNode' as const,
      position: { x: a.x, y: a.y },
      data: { annotation: a },
      zIndex: 0,
      style: a.type === 'note' ? NODE_STYLE_ANNOTATION : NODE_STYLE_ZONE,
      measured: measurements[a.id],
    })),
    ...(clusters ?? []).flatMap(cluster => {
      const members = devices.filter(device => cluster.deviceIds.includes(device.id))
      if (!members.length) return []
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const member of members) {
        const size = measurements[member.id] ?? { width: 120, height: 96 }
        minX = Math.min(minX, member.x); minY = Math.min(minY, member.y)
        maxX = Math.max(maxX, member.x + size.width); maxY = Math.max(maxY, member.y + size.height)
      }
      const width = Math.max(80, maxX - minX + 48)
      const height = Math.max(60, maxY - minY + 68)
      return [sameNode(nodeCache.get(`zone:${cluster.id}`), {
        id: `zone:${cluster.id}`,
        type: 'clusterNode' as const,
        position: { x: minX - 24, y: minY - 44 },
        data: { cluster, width, height },
        zIndex: 1,
        draggable: false,
        selectable: false,
        connectable: false,
        style: NODE_STYLE_ZONE,
        measured: measurements[`zone:${cluster.id}`],
      })]
    }),
    ...devices.map(d => sameNode(nodeCache.get(d.id), {
      id: d.id,
      type: 'deviceNode' as const,
      position: { x: d.x, y: d.y },
      data: { device: d },
      zIndex: 10,
      selected: selectedIds?.has(d.id) ?? false,
      measured: measurements[d.id],
    })),
  ]

  if (nodeCache.size > cacheLimit) {
    const keep = new Set(nodes.map(node => node.id))
    for (const id of nodeCache.keys()) if (!keep.has(id)) nodeCache.delete(id)
  }
  for (const node of nodes) nodeCache.set(node.id, node)
  return nodes
}
