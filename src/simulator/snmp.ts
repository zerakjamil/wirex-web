import type { NetworkDevice } from '@/types/network'

export type SnmpOperation = 'get' | 'get-next'

export const SNMP_SYSTEM_OBJECTS = [
  { oid: '1.3.6.1.2.1.1.1.0', name: 'sysDescr.0' },
  { oid: '1.3.6.1.2.1.1.4.0', name: 'sysContact.0' },
  { oid: '1.3.6.1.2.1.1.5.0', name: 'sysName.0' },
  { oid: '1.3.6.1.2.1.1.6.0', name: 'sysLocation.0' },
] as const

export function isValidSnmpOid(value: string): boolean {
  if (value.length > 128) return false
  const arcs = value.split('.')
  if (arcs.length < 2 || arcs.length > 32 || arcs.some(arc => !/^(0|[1-9]\d{0,9})$/.test(arc))) return false
  const numbers = arcs.map(Number)
  return numbers[0] <= 2 && (numbers[0] === 2 || numbers[1] <= 39)
}

export function isValidSnmpCommunity(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(value)
}

function compareOids(left: string, right: string): number {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return a.length - b.length
}

export function resolveSnmpSystemObject(device: NetworkDevice, operation: SnmpOperation, requestedOid: string): { oid: string; value: string } {
  let target = requestedOid
  if (operation === 'get-next') {
    const nextObject = SNMP_SYSTEM_OBJECTS.find(item => compareOids(item.oid, requestedOid) > 0)
    if (!nextObject) return { oid: requestedOid, value: 'endOfMibView' }
    target = nextObject.oid
  }
  const object = SNMP_SYSTEM_OBJECTS.find(item => item.oid === target)
  if (!object) return { oid: requestedOid, value: operation === 'get-next' ? 'endOfMibView' : 'noSuchObject' }
  switch (object.name) {
    case 'sysDescr.0': return { oid: object.oid, value: `${device.model} ${device.type} running wireX simulated IOS` }
    case 'sysContact.0': return { oid: object.oid, value: device.config.snmpSystemContact ?? '' }
    case 'sysName.0': return { oid: object.oid, value: device.config.hostname || device.name }
    case 'sysLocation.0': return { oid: object.oid, value: device.config.snmpSystemLocation ?? '' }
  }
}
