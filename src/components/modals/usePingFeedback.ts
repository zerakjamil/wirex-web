'use client'
import { useEffect, useRef } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { formatPingResult } from '@/store/pingResults'

export function usePingFeedback(append: (text: string) => void) {
  const watched = useRef(new Set<string>())
  useEffect(() => useNetworkStore.subscribe(state => {
    for (const result of state.pingResults) {
      if (!watched.current.has(result.id) || result.status === 'pending') continue
      watched.current.delete(result.id)
      append(formatPingResult(result))
    }
  }), [append])

  return {
    ping: (deviceId: string, targetIp: string) => {
      const id = useNetworkStore.getState().sendPing(deviceId, targetIp)
      if (id) {
        watched.current.add(id)
        append(`Pinging ${targetIp} with one ICMP echo. Waiting for a reply; advance Simulation if paused.`)
      } else append(useNetworkStore.getState().simulationWarning || 'Could not send ping.')
    },
    ios: (deviceId: string, command: string) => {
      const previous = useNetworkStore.getState().pingResults.at(-1)?.id
      const output = useNetworkStore.getState().executeIosCommand(deviceId, command)
      const result = useNetworkStore.getState().pingResults.at(-1)
      if (result && result.id !== previous) watched.current.add(result.id)
      return output
    },
  }
}
