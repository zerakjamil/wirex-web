import type { NetworkDevice } from '@/types/network'

export function normalizeDnsName(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

export function isValidDnsName(value: string): boolean {
  const normalized = normalizeDnsName(value)
  if (!normalized || normalized.length > 253) return false
  return normalized.split('.').every(label => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
}

export function resolveDnsMxRecords(domain: string, device: NetworkDevice): Array<{ exchange: string; preference: number }> {
  const normalizedDomain = normalizeDnsName(domain)
  if (!isValidDnsName(normalizedDomain)) return []
  return (device.config.dnsMxRecords ?? [])
    .filter(record => isValidDnsName(record.domain) && normalizeDnsName(record.domain) === normalizedDomain
      && isValidDnsName(record.exchange) && Number.isInteger(record.preference) && record.preference >= 0 && record.preference <= 65_535)
    .map(record => ({ exchange: normalizeDnsName(record.exchange), preference: record.preference }))
    .sort((left, right) => left.preference - right.preference || left.exchange.localeCompare(right.exchange))
}
