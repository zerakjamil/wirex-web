export function ipToNumber(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
}

export function numberToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.')
}

export function isValidIpv4(ip: string): boolean {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    const n = parseInt(part, 10)
    return !isNaN(n) && n >= 0 && n <= 255 && part === n.toString()
  })
}

export function isInSameSubnet(ip1: string, ip2: string, mask: string): boolean {
  if (!isValidIpv4(ip1) || !isValidIpv4(ip2) || !isValidIpv4(mask)) return false
  const n1 = ipToNumber(ip1)
  const n2 = ipToNumber(ip2)
  const m = ipToNumber(mask)
  return (n1 & m) === (n2 & m)
}

export function getNetworkAddress(ip: string, mask: string): string {
  const n = ipToNumber(ip)
  const m = ipToNumber(mask)
  return numberToIp(n & m)
}

export function generateMacAddress(): string {
  const hex = '0123456789abcdef'
  let mac = '00:60:'
  for (let i = 0; i < 4; i++) {
    mac += hex[Math.floor(Math.random() * 16)]
    mac += hex[Math.floor(Math.random() * 16)]
    if (i < 3) mac += ':'
  }
  return mac
}
