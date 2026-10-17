import type { MacTableEntry, NetworkDevice } from '@/types/network'

export const MAC_TABLE_AGE_TICKS = Math.ceil(300_000 / 60)

export function hasMacAgingActivity(devices: NetworkDevice[]) {
  return devices.some(device => device.macTable.length > 0)
}

export function ageLearnedMacTables(devices: NetworkDevice[], tick: number) {
  let nextDevices = devices
  for (const [index, device] of devices.entries()) {
    if (device.macTable.length === 0) continue
    let changed = false
    const macTable = device.macTable.flatMap(entry => {
      const lastSeenTick = Number.isInteger(entry.lastSeenTick) && entry.lastSeenTick! <= tick
        ? entry.lastSeenTick!
        : tick - Math.ceil(Math.max(0, entry.age) * 1_000 / 60)
      const elapsedTicks = Math.max(0, tick - lastSeenTick)
      if (elapsedTicks >= MAC_TABLE_AGE_TICKS) {
        changed = true
        return []
      }
      const age = Math.floor(elapsedTicks * 60 / 1_000)
      if (entry.lastSeenTick !== lastSeenTick || entry.age !== age) {
        changed = true
        return [{ ...entry, age, lastSeenTick }]
      }
      return [entry]
    })
    if (changed) {
      if (nextDevices === devices) nextDevices = devices.slice()
      nextDevices[index] = { ...device, macTable }
    }
  }
  return nextDevices
}

export function stripMacAgingRuntime(macTable: MacTableEntry[]) {
  let cleaned: MacTableEntry[] | undefined
  for (const [index, entry] of macTable.entries()) {
    if (entry.lastSeenTick === undefined) continue
    const persistentEntry = { ...entry }
    delete persistentEntry.lastSeenTick
    if (!cleaned) cleaned = macTable.slice()
    cleaned[index] = persistentEntry
  }
  return cleaned ?? macTable
}
