import assert from 'node:assert/strict'
import test from 'node:test'
import type { InFlightPacket } from '@/types/network'
import { getPacketsByLink, getPacketsOnLink, selectPacketMarkers } from './packetIndex'

const frame = (id: string, linkId: string) => ({ id, linkId } as InFlightPacket)

test('packet index groups each frame by cable and reuses immutable snapshots', () => {
  const packets = [frame('a', 'link-1'), frame('b', 'link-2'), frame('c', 'link-1')]
  const index = getPacketsByLink(packets)

  assert.deepEqual(index.get('link-1')?.map(packet => packet.id), ['a', 'c'])
  assert.deepEqual(index.get('link-2')?.map(packet => packet.id), ['b'])
  assert.deepEqual(getPacketsOnLink(packets, 'missing'), [])
  assert.equal(getPacketsByLink(packets), index)
  assert.equal(getPacketsOnLink(packets, 'link-1'), index.get('link-1'))

  const nextSnapshot = getPacketsByLink([...packets])
  assert.notEqual(nextSnapshot, index)
})

test('packet markers summarize dense cables while keeping a sample PDU inspectable', () => {
  const packets = Array.from({ length: 8 }, (_, index) => frame(String(index), 'link-1'))
  const regular = selectPacketMarkers(packets, false)
  const dense = selectPacketMarkers(packets, true)
  const sparse = selectPacketMarkers(packets.slice(0, 1), false)

  assert.equal(regular.visiblePackets.length, 3)
  assert.equal(regular.hiddenCount, 5)
  assert.equal(regular.firstHiddenPacket?.id, '3')
  assert.equal(dense.visiblePackets.length, 1)
  assert.equal(dense.hiddenCount, 7)
  assert.equal(dense.firstHiddenPacket?.id, '1')
  assert.equal(sparse.hiddenCount, 0)
  assert.equal(sparse.firstHiddenPacket, undefined)
})

test('the 4,096-frame overlay groups every packet and bounds dense markers by cable count', () => {
  const packetCount = 4096
  const cableCount = 300
  const packets = Array.from({ length: packetCount }, (_, index) => frame(`packet-${index}`, `link-${index % cableCount}`))
  const index = getPacketsByLink(packets)
  let retainedCount = 0
  let visibleCount = 0

  assert.equal(index.size, cableCount)
  for (const cablePackets of index.values()) {
    const markers = selectPacketMarkers(cablePackets, true)
    visibleCount += markers.visiblePackets.length
    retainedCount += markers.visiblePackets.length + markers.hiddenCount
    if (markers.hiddenCount > 0) assert.ok(markers.firstHiddenPacket)
  }

  assert.equal(retainedCount, packetCount)
  assert.ok(visibleCount <= cableCount)
  assert.ok(visibleCount < packetCount)
  assert.equal(getPacketsByLink(packets), index)
})
