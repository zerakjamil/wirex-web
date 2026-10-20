import type { AccessList, AclRule, ExtendedAclRule, NetworkDevice, NetworkPort } from '@/types/network'
import { isValidIpv4 } from './protocols/ip'

export const ISA_MODEL = 'ISA-3000'
export const ISA_RULE_LIMIT = 64

export type IsaTrafficType = {
  id: string
  label: string
  protocol: 'tcp' | 'udp' | 'icmp'
  destPort?: number
}

export const ISA_TRAFFIC_TYPES: IsaTrafficType[] = [
  { id: 'http', label: 'HTTP', protocol: 'tcp', destPort: 80 },
  { id: 'dns', label: 'DNS', protocol: 'udp', destPort: 53 },
  { id: 'smtp', label: 'SMTP', protocol: 'tcp', destPort: 25 },
  { id: 'pop3', label: 'POP3', protocol: 'tcp', destPort: 110 },
  { id: 'tftp', label: 'TFTP', protocol: 'udp', destPort: 69 },
  { id: 'snmp', label: 'SNMP', protocol: 'udp', destPort: 161 },
  { id: 'ntp', label: 'NTP', protocol: 'udp', destPort: 123 },
  { id: 'icmp', label: 'ICMP echo', protocol: 'icmp' },
]

export type IsaBlockKind = 'source' | 'destination' | 'traffic' | 'traffic-source'

export function isIsa3000(device: Pick<NetworkDevice, 'type' | 'model'>): boolean {
  return device.type === 'security' && device.model === ISA_MODEL
}

/** The four routed data interfaces exposed by the ISA firewall page. Management is separate. */
export function isaFirewallPorts(device: NetworkDevice): NetworkPort[] {
  return device.ports.filter(port =>
    port.type === 'gigabitethernet' &&
    port.nameif !== undefined &&
    port.nameif !== 'management'
  )
}

export function isaAclId(port: NetworkPort): string {
  return port.inboundAcl || `${port.nameif || port.shortName}_access_in`
}

export function isaDefaultAclRules(): AclRule[] {
  return [{ type: 'extended', action: 'permit', protocol: 'ip', sourceIp: 'any', destIp: 'any' }]
}

export function isIsaPermitAllRule(rule: AclRule): boolean {
  return rule.type === 'extended' &&
    rule.action === 'permit' &&
    rule.protocol === 'ip' &&
    rule.sourceIp === 'any' &&
    (rule.destIp === undefined || rule.destIp === 'any') &&
    rule.destPort === undefined
}

export function isaTrafficType(id: string): IsaTrafficType | undefined {
  return ISA_TRAFFIC_TYPES.find(type => type.id === id)
}

export function buildIsaDenyRule(kind: IsaBlockKind, host: string, trafficTypeId: string): ExtendedAclRule | null {
  const traffic = isaTrafficType(trafficTypeId)
  if (!traffic) return null
  const needsHost = kind !== 'traffic'
  if (needsHost && !isValidIpv4(host)) return null

  const sourceIp = kind === 'source' || kind === 'traffic-source' ? host.trim() : 'any'
  const destIp = kind === 'destination' ? host.trim() : 'any'
  const useTraffic = kind === 'traffic' || kind === 'traffic-source'
  return {
    type: 'extended',
    action: 'deny',
    protocol: useTraffic ? traffic.protocol : 'ip',
    sourceIp,
    ...(sourceIp === 'any' ? {} : { sourceWildcard: '0.0.0.0' }),
    destIp,
    ...(destIp === 'any' ? {} : { destWildcard: '0.0.0.0' }),
    ...(useTraffic && traffic.destPort !== undefined ? { destPort: traffic.destPort } : {}),
  }
}

/** Insert a new deny above the baseline permit so the block takes effect before the permit match. */
export function insertIsaRule(rules: AclRule[], rule: AclRule): AclRule[] {
  const next = [...rules]
  const permitIndex = next.map(isIsaPermitAllRule).lastIndexOf(true)
  if (permitIndex >= 0) next.splice(permitIndex, 0, rule)
  else next.push(rule)
  return next
}

export function readIsaAcl(device: NetworkDevice, port: NetworkPort): { aclId: string; acl?: AccessList } {
  const aclId = isaAclId(port)
  return { aclId, acl: device.config.accessLists?.find(acl => acl.id === aclId) }
}
