// IPv6 addressing utilities for the packet engine. Mirrors protocols/ip.ts for
// IPv4, but 128-bit addresses are handled as BigInt so prefix math stays exact.
// No BigInt literals: tsconfig targets ES2017.

const GROUP_COUNT = 8
const GROUP_BITS = 16
const ADDRESS_BITS = GROUP_COUNT * GROUP_BITS
const MAX_VALUE = (BigInt(1) << BigInt(ADDRESS_BITS)) - BigInt(1)

// ff02:0:0:0:0:1:ff00::/104 — RFC 4291 solicited-node multicast prefix.
const SOLICITED_NODE_PREFIX = BigInt('0xff0200000000000000000001ff000000')

function parseGroup(group: string): number | null {
  if (!/^[0-9a-f]{1,4}$/.test(group)) return null
  return parseInt(group, 16)
}

export function macToBytes(mac: string): number[] | null {
  const parts = mac.trim().toLowerCase().split(':')
  if (parts.length !== 6) return null
  const bytes: number[] = []
  for (const part of parts) {
    if (!/^[0-9a-f]{2}$/.test(part)) return null
    bytes.push(parseInt(part, 16))
  }
  return bytes
}

export function parseIpv6(address: string): bigint | null {
  const trimmed = address.trim().toLowerCase()
  if (trimmed.length === 0) return null
  const compressionIndex = trimmed.indexOf('::')
  if (compressionIndex !== -1 && trimmed.indexOf('::', compressionIndex + 1) !== -1) return null
  const headPart = compressionIndex === -1 ? trimmed : trimmed.slice(0, compressionIndex)
  const tailPart = compressionIndex === -1 ? '' : trimmed.slice(compressionIndex + 2)
  const headGroups = headPart === '' ? [] : headPart.split(':')
  const tailGroups = compressionIndex === -1 || tailPart === '' ? [] : tailPart.split(':')
  if (compressionIndex === -1 && headGroups.length !== GROUP_COUNT) return null
  if (compressionIndex !== -1 && headGroups.length + tailGroups.length > GROUP_COUNT) return null
  // "::" must stand for at least one all-zero group.
  if (compressionIndex !== -1 && headGroups.length + tailGroups.length === GROUP_COUNT) return null
  const groups: number[] = []
  for (const group of headGroups) {
    const value = parseGroup(group)
    if (value === null) return null
    groups.push(value)
  }
  while (groups.length < GROUP_COUNT - tailGroups.length) groups.push(0)
  for (const group of tailGroups) {
    const value = parseGroup(group)
    if (value === null) return null
    groups.push(value)
  }
  if (groups.length !== GROUP_COUNT) return null
  let value = BigInt(0)
  for (const group of groups) value = (value << BigInt(GROUP_BITS)) | BigInt(group)
  return value
}

export function isValidIpv6(address: string): boolean {
  return parseIpv6(address) !== null
}

// RFC 5952 canonical form: lowercase, no leading zeros, "::" for the longest
// run of at least two zero groups (leftmost on ties, single zero stays "0").
export function formatIpv6(value: bigint): string {
  if (value < BigInt(0) || value > MAX_VALUE) throw new RangeError('IPv6 value out of range')
  const groups: number[] = []
  let remaining = value
  for (let index = 0; index < GROUP_COUNT; index++) {
    groups.unshift(Number(remaining & BigInt(0xffff)))
    remaining >>= BigInt(GROUP_BITS)
  }
  let bestStart = -1
  let bestLength = 0
  let runStart = -1
  for (let index = 0; index <= GROUP_COUNT; index++) {
    if (index < GROUP_COUNT && groups[index] === 0) {
      if (runStart === -1) runStart = index
      continue
    }
    if (runStart !== -1) {
      const runLength = index - runStart
      if (runLength >= 2 && runLength > bestLength) {
        bestLength = runLength
        bestStart = runStart
      }
      runStart = -1
    }
  }
  if (bestStart === -1) return groups.map((group) => group.toString(16)).join(':')
  const head = groups.slice(0, bestStart).map((group) => group.toString(16)).join(':')
  const tail = groups.slice(bestStart + bestLength).map((group) => group.toString(16)).join(':')
  return `${head}::${tail}`
}

export function isValidIpv6Prefix(prefixLength: number): boolean {
  return Number.isInteger(prefixLength) && prefixLength >= 0 && prefixLength <= ADDRESS_BITS
}

export function ipv6PrefixMask(prefixLength: number): bigint {
  if (!isValidIpv6Prefix(prefixLength)) throw new RangeError('IPv6 prefix length out of range')
  if (prefixLength === 0) return BigInt(0)
  return ((BigInt(1) << BigInt(prefixLength)) - BigInt(1)) << BigInt(ADDRESS_BITS - prefixLength)
}

export function ipv6NetworkAddress(address: string, prefixLength: number): string | null {
  const value = parseIpv6(address)
  if (value === null || !isValidIpv6Prefix(prefixLength)) return null
  return formatIpv6(value & ipv6PrefixMask(prefixLength))
}

export function isInSameIpv6Subnet(a: string, b: string, prefixLength: number): boolean {
  const valueA = parseIpv6(a)
  const valueB = parseIpv6(b)
  if (valueA === null || valueB === null || !isValidIpv6Prefix(prefixLength)) return false
  const mask = ipv6PrefixMask(prefixLength)
  return (valueA & mask) === (valueB & mask)
}

export function parseIpv6WithPrefix(
  input: string,
  defaultPrefix?: number,
): { address: string; prefixLength: number } | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  const slashIndex = trimmed.indexOf('/')
  const addressPart = slashIndex === -1 ? trimmed : trimmed.slice(0, slashIndex)
  const prefixPart = slashIndex === -1 ? undefined : trimmed.slice(slashIndex + 1)
  const value = parseIpv6(addressPart)
  if (value === null) return null
  let prefixLength: number
  if (prefixPart !== undefined) {
    if (!/^\d{1,3}$/.test(prefixPart)) return null
    prefixLength = parseInt(prefixPart, 10)
    if (!isValidIpv6Prefix(prefixLength)) return null
  } else if (defaultPrefix !== undefined) {
    if (!isValidIpv6Prefix(defaultPrefix)) return null
    prefixLength = defaultPrefix
  } else {
    return null
  }
  return { address: formatIpv6(value), prefixLength }
}

export function isIpv6Unspecified(address: string): boolean {
  return parseIpv6(address) === BigInt(0)
}

export function isIpv6Loopback(address: string): boolean {
  return parseIpv6(address) === BigInt(1)
}

export function isIpv6Multicast(address: string): boolean {
  const value = parseIpv6(address)
  return value !== null && value >> BigInt(ADDRESS_BITS - 8) === BigInt(0xff)
}

export function isIpv6LinkLocal(address: string): boolean {
  const value = parseIpv6(address)
  return value !== null && value >> BigInt(ADDRESS_BITS - 10) === BigInt(0x3fa)
}

// Modified EUI-64 interface identifier: flip the universal/local bit and insert
// ff:fe in the middle (RFC 4291 appendix A), formatted as four hex groups.
export function ipv6InterfaceIdFromMac(mac: string): string | null {
  const bytes = macToBytes(mac)
  if (bytes === null) return null
  const eui64 = [bytes[0] ^ 0x02, bytes[1], bytes[2], 0xff, 0xfe, bytes[3], bytes[4], bytes[5]]
  const groups = [
    (eui64[0] << 8) | eui64[1],
    (eui64[2] << 8) | eui64[3],
    (eui64[4] << 8) | eui64[5],
    (eui64[6] << 8) | eui64[7],
  ]
  return groups.map((group) => group.toString(16)).join(':')
}

export function ipv6LinkLocalFromMac(mac: string): string | null {
  const interfaceId = ipv6InterfaceIdFromMac(mac)
  if (interfaceId === null) return null
  return `fe80::${interfaceId}`
}

// Combine the top 64 bits of a prefix with an EUI-64 style interface identifier
// (four hex groups, as produced by ipv6InterfaceIdFromMac) into one address.
export function ipv6AddressFromPrefixAndInterfaceId(prefix: string, interfaceId: string): string | null {
  const prefixValue = parseIpv6(prefix)
  const interfaceValue = parseIpv6(`::${interfaceId}`)
  if (prefixValue === null || interfaceValue === null) return null
  return formatIpv6((prefixValue & ipv6PrefixMask(64)) | interfaceValue)
}

export function ipv6SolicitedNodeMulticastAddress(address: string): string | null {
  const value = parseIpv6(address)
  if (value === null) return null
  return formatIpv6(SOLICITED_NODE_PREFIX | (value & BigInt(0xffffff)))
}

export function ipv6SolicitedNodeMulticastMac(address: string): string | null {
  const value = parseIpv6(address)
  if (value === null) return null
  const low = Number(value & BigInt(0xffffff))
  const byte = (part: number) => part.toString(16).padStart(2, '0')
  return `33:33:ff:${byte((low >> 16) & 0xff)}:${byte((low >> 8) & 0xff)}:${byte(low & 0xff)}`
}
