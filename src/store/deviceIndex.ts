import type { NetworkDevice } from '@/types/network'

const deviceIndexCache = new WeakMap<readonly NetworkDevice[], Map<string, NetworkDevice>>()

export function getDeviceFromList(devices: readonly NetworkDevice[], deviceId: string): NetworkDevice | undefined {
  if (!deviceId) return undefined
  let index = deviceIndexCache.get(devices)
  if (!index) {
    index = new Map<string, NetworkDevice>()
    for (const device of devices) index.set(device.id, device)
    deviceIndexCache.set(devices, index)
  }
  return index.get(deviceId)
}
