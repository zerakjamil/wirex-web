import type { InFlightPacket } from '@/types/network'

const packetIndexCache = new WeakMap<readonly InFlightPacket[], ReadonlyMap<string, readonly InFlightPacket[]>>()
const noPackets: readonly InFlightPacket[] = Object.freeze([])
const MAX_VISIBLE_PACKET_MARKERS_PER_LINK = 4

export function getPacketsByLink(packets: readonly InFlightPacket[]): ReadonlyMap<string, readonly InFlightPacket[]> {
  const cached = packetIndexCache.get(packets)
  if (cached) return cached

  const index = new Map<string, InFlightPacket[]>()
  for (const packet of packets) {
    const onLink = index.get(packet.linkId)
    if (onLink) onLink.push(packet)
    else index.set(packet.linkId, [packet])
  }

  packetIndexCache.set(packets, index)
  return index
}

export function getPacketsOnLink(packets: readonly InFlightPacket[], linkId: string): readonly InFlightPacket[] {
  return getPacketsByLink(packets).get(linkId) ?? noPackets
}

export function selectPacketMarkers(packets: readonly InFlightPacket[], denseTraffic: boolean) {
  const visibleLimit = denseTraffic ? 1 : MAX_VISIBLE_PACKET_MARKERS_PER_LINK
  const visibleCount = packets.length > visibleLimit ? Math.max(1, visibleLimit - 1) : packets.length
  const hiddenCount = Math.max(0, packets.length - visibleCount)
  return {
    visiblePackets: packets.slice(0, visibleCount),
    hiddenCount,
    firstHiddenPacket: hiddenCount > 0 ? packets[visibleCount] : undefined,
  }
}
