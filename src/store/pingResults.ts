import type { InFlightPacket,PacketPdu } from '@/types/network'
import type { SimulationStepResult } from '@/simulator/engine'

export interface PingResult {
  id: string
  sourceDeviceId: string
  targetIp: string
  status: 'pending' | 'successful' | 'failed'
  reason?: string
  ttl?: number
  pdu?: PacketPdu
}

export function formatPingResult(result: PingResult): string {
  if (result.status === 'successful') return `Reply from ${result.targetIp}: TTL=${result.ttl}\nPackets: Sent = 1, Received = 1, Lost = 0 (0% loss)`
  if (result.status === 'failed') return `Ping to ${result.targetIp} failed: ${result.reason}\nPackets: Sent = 1, Received = 0, Lost = 1 (100% loss)`
  return `Waiting for an echo reply from ${result.targetIp}.`
}

export function retainResults(results: PingResult[]) {
  const finalized = results.filter(result => result.status !== 'pending').slice(-100)
  const retained = new Set(finalized.map(result => result.id))
  return results.filter(result => result.status === 'pending' || retained.has(result.id))
}

export function completePingResults(results: PingResult[], packets: InFlightPacket[], step: SimulationStepResult): PingResult[] {
  const byId = new Map(packets.map(packet => [packet.id, packet]))
  const active = new Set(step.newInFlightPackets.map(packet => packet.pdu.pingId))
  const replies = new Map<string, InFlightPacket>()
  const failures = new Map<string, {reason:string;pdu:PacketPdu}>()
  for (const delivery of step.packetDeliveries) {
    const packet = byId.get(delivery.packetId)
    const id = packet?.pdu.pingId
    if (!id || !packet) continue
    if (delivery.status === 'delivered' && (packet.pdu.payload.icmpType === 'echo-reply' || packet.pdu.payload.icmpv6Type === 'echo-reply')) replies.set(`${id}|${delivery.receiverDeviceId}`, packet)
    if (delivery.status === 'dropped' && delivery.reason) failures.set(id, {reason:delivery.reason,pdu:packet.pdu})
  }
  let changed = false
  const updated = results.map(result => {
    if (result.status !== 'pending') return result
    const reply = replies.get(`${result.id}|${result.sourceDeviceId}`)
    if (reply && reply.pdu.sourceIp === result.targetIp) {
      changed = true
      return { ...result, status: 'successful' as const, ttl: reply.pdu.ttl,pdu:reply.pdu }
    }
    if (!active.has(result.id)) {
      changed = true
      return { ...result, status: 'failed' as const,pdu:failures.get(result.id)?.pdu, reason: failures.get(result.id)?.reason || 'No echo reply received. Check ARP/NDP resolution, addressing, VLANs, and return routing.' }
    }
    return result
  })
  return changed ? retainResults(updated) : results
}

export function cancelPendingPings(results: PingResult[]) {
  return retainResults(results.map(result => result.status === 'pending'
    ? { ...result, status: 'failed' as const, reason: 'Cancelled by Reset Simulation.' } : result))
}
