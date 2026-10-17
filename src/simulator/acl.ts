import type { AccessList, AclAction, AclRule, ExtendedAclRule, PacketProtocol, StandardAclRule } from '@/types/network'
import { ipToNumber, isValidIpv4 } from './protocols/ip'

const WELL_KNOWN_PORTS: Record<string, number> = {
  www: 80,
  http: 80,
  https: 443,
  domain: 53,
  dns: 53,
  bootps: 67,
  bootpc: 68,
  dhcp: 67,
  telnet: 23,
  ssh: 22,
  ftp: 21,
  'ftp-data': 20,
  smtp: 25,
  pop3: 110,
  snmp: 161,
}

export function resolvePort(port: string | number | undefined): number | undefined {
  if (port === undefined) return undefined
  if (typeof port === 'number') return port
  const lower = port.toLowerCase()
  if (lower in WELL_KNOWN_PORTS) return WELL_KNOWN_PORTS[lower]
  const parsed = parseInt(lower, 10)
  return isNaN(parsed) ? undefined : parsed
}

export function matchesWildcard(ip: string, targetIp: string, wildcard = '0.0.0.0'): boolean {
  if (targetIp === 'any') return true
  if (targetIp === '0.0.0.0' && wildcard === '255.255.255.255') return true
  if (!isValidIpv4(ip) || !isValidIpv4(targetIp)) return false
  const ipNum = ipToNumber(ip)
  const targetNum = ipToNumber(targetIp)
  const wildcardNum = isValidIpv4(wildcard) ? ipToNumber(wildcard) : 0
  const mask = (~wildcardNum) >>> 0
  return ((ipNum & mask) >>> 0) === ((targetNum & mask) >>> 0)
}

export function isStandardAclId(id: string): boolean {
  const num = parseInt(id, 10)
  if (!isNaN(num)) {
    return (num >= 1 && num <= 99) || (num >= 1300 && num <= 1999)
  }
  return false
}

export function isExtendedAclId(id: string): boolean {
  const num = parseInt(id, 10)
  if (!isNaN(num)) {
    return (num >= 100 && num <= 199) || (num >= 2000 && num <= 2699)
  }
  return false
}

export function parseAclRule(args: string[]): { aclId: string; rule: AclRule; type: 'standard' | 'extended' } | { error: string } {
  if (args.length < 2) {
    return { error: '% Incomplete access-list command.' }
  }
  const aclId = args[0]
  const actionWord = args[1]?.toLowerCase()

  if (actionWord === 'remark') {
    const remark = args.slice(2).join(' ')
    const extended = isExtendedAclId(aclId)
    if (extended) {
      return {
        aclId,
        type: 'extended',
        rule: { type: 'extended', action: 'permit', protocol: 'ip', sourceIp: 'remark', remark },
      }
    }
    return {
      aclId,
      type: 'standard',
      rule: { type: 'standard', action: 'permit', sourceIp: 'remark', remark },
    }
  }

  if (actionWord !== 'permit' && actionWord !== 'deny') {
    return { error: '% Invalid action: specify permit, deny, or remark.' }
  }
  const action: AclAction = actionWord

  // Check if extended by number or protocol argument
  const extended = isExtendedAclId(aclId) || ['ip', 'tcp', 'udp', 'icmp'].includes(args[2]?.toLowerCase())

  if (!extended) {
    // Standard ACL: access-list <1-99> permit|deny { any | host <ip> | <ip> [wildcard] }
    const srcArg = args[2]?.toLowerCase()
    if (!srcArg) return { error: '% Incomplete command: missing source address.' }
    let sourceIp = ''
    let wildcard = '0.0.0.0'
    if (srcArg === 'any') {
      sourceIp = 'any'
      wildcard = '255.255.255.255'
    } else if (srcArg === 'host') {
      const ip = args[3]
      if (!ip || !isValidIpv4(ip)) return { error: '% Invalid host IP address.' }
      sourceIp = ip
      wildcard = '0.0.0.0'
    } else {
      if (!isValidIpv4(srcArg)) return { error: '% Invalid source IP address or command syntax.' }
      sourceIp = srcArg
      const wArg = args[3]
      if (wArg && isValidIpv4(wArg)) {
        wildcard = wArg
      } else {
        wildcard = '0.0.0.0'
      }
    }
    const rule: StandardAclRule = { type: 'standard', action, sourceIp, wildcard }
    return { aclId, type: 'standard', rule }
  } else {
    // Extended ACL: access-list <100-199> permit|deny <protocol> <src> [src-wildcard] <dst> [dst-wildcard] [eq <port>]
    const protoArg = args[2]?.toLowerCase()
    if (!protoArg || !['ip', 'tcp', 'udp', 'icmp', 'gre'].includes(protoArg)) {
      return { error: '% Invalid protocol: specify ip, tcp, udp, icmp, or gre.' }
    }
    const protocol = protoArg as 'ip' | 'tcp' | 'udp' | 'icmp' | 'gre'
    let idx = 3

    // Source
    const sArg = args[idx]?.toLowerCase()
    if (!sArg) return { error: '% Incomplete command: missing source specification.' }
    let sourceIp = ''
    let sourceWildcard = '0.0.0.0'
    if (sArg === 'any') {
      sourceIp = 'any'
      sourceWildcard = '255.255.255.255'
      idx++
    } else if (sArg === 'host') {
      idx++
      const ip = args[idx++]
      if (!ip || !isValidIpv4(ip)) return { error: '% Invalid source host IP.' }
      sourceIp = ip
      sourceWildcard = '0.0.0.0'
    } else {
      if (!isValidIpv4(sArg)) return { error: '% Invalid source IP.' }
      sourceIp = sArg
      idx++
      if (args[idx] && isValidIpv4(args[idx])) {
        sourceWildcard = args[idx++]
      } else {
        sourceWildcard = '0.0.0.0'
      }
    }

    // Destination
    const dArg = args[idx]?.toLowerCase()
    if (!dArg) return { error: '% Incomplete command: missing destination specification.' }
    let destIp = ''
    let destWildcard = '0.0.0.0'
    if (dArg === 'any') {
      destIp = 'any'
      destWildcard = '255.255.255.255'
      idx++
    } else if (dArg === 'host') {
      idx++
      const ip = args[idx++]
      if (!ip || !isValidIpv4(ip)) return { error: '% Invalid destination host IP.' }
      destIp = ip
      destWildcard = '0.0.0.0'
    } else {
      if (!isValidIpv4(dArg)) return { error: '% Invalid destination IP.' }
      destIp = dArg
      idx++
      if (args[idx] && isValidIpv4(args[idx])) {
        destWildcard = args[idx++]
      } else {
        destWildcard = '0.0.0.0'
      }
    }

    // Optional Port: eq <port>
    let destPort: number | string | undefined = undefined
    if (args[idx]?.toLowerCase() === 'eq') {
      if (protocol === 'gre') return { error: '% GRE has no transport ports; omit the eq clause.' }
      idx++
      const portToken = args[idx++]
      if (!portToken) return { error: '% Incomplete command: missing port after eq.' }
      destPort = resolvePort(portToken) ?? portToken
    }

    const rule: ExtendedAclRule = {
      type: 'extended',
      action,
      protocol,
      sourceIp,
      sourceWildcard,
      destIp,
      destWildcard,
      destPort,
    }
    return { aclId, type: 'extended', rule }
  }
}

export function evaluateAcl(
  acl: AccessList,
  packet: { sourceIp: string; destIp: string; protocol: PacketProtocol; port?: number }
): { action: AclAction; matchedRuleIndex?: number; reason: string } {
  for (let i = 0; i < acl.rules.length; i++) {
    const rule = acl.rules[i]
    if (rule.remark) continue

    if (rule.type === 'standard') {
      if (matchesWildcard(packet.sourceIp, rule.sourceIp, rule.wildcard)) {
        return {
          action: rule.action,
          matchedRuleIndex: i,
          reason: `${rule.action.toUpperCase()} rule #${(i + 1) * 10} in ACL ${acl.id} (source ${rule.sourceIp})`,
        }
      }
    } else if (rule.type === 'extended') {
      // Protocol check
      if (rule.protocol === 'icmp' && packet.protocol !== 'ICMP') continue
      if (rule.protocol === 'gre' && packet.protocol !== 'GRE') continue
      if (rule.protocol === 'tcp' && packet.protocol !== 'TCP' && packet.protocol !== 'HTTP') continue
      if (rule.protocol === 'udp' && packet.protocol !== 'DHCP' && packet.protocol !== 'DNS' && packet.protocol !== 'UDP' && packet.protocol !== 'RIP') continue

      // Source IP check
      if (!matchesWildcard(packet.sourceIp, rule.sourceIp, rule.sourceWildcard)) continue

      // Destination IP check
      if (rule.destIp && !matchesWildcard(packet.destIp, rule.destIp, rule.destWildcard)) continue

      // Port check
      if (rule.destPort !== undefined) {
        const expectedPort = resolvePort(rule.destPort)
        const actualPort = packet.port ?? (packet.protocol === 'HTTP' ? 80 : packet.protocol === 'DNS' ? 53 : packet.protocol === 'DHCP' ? 67 : packet.protocol === 'RIP' ? 520 : undefined)
        if (expectedPort !== undefined && actualPort !== undefined && expectedPort !== actualPort) {
          continue
        }
      }

      return {
        action: rule.action,
        matchedRuleIndex: i,
        reason: `${rule.action.toUpperCase()} rule #${(i + 1) * 10} in ACL ${acl.id} (${rule.protocol} ${rule.sourceIp} -> ${rule.destIp})`,
      }
    }
  }

  // Implicit Deny
  return {
    action: 'deny',
    reason: `Implicit deny at end of ACL ${acl.id}`,
  }
}

export function formatAccessLists(accessLists: AccessList[] = [], filterId?: string): string {
  const targetAcls = filterId ? accessLists.filter((a) => a.id === filterId) : accessLists
  if (!targetAcls || targetAcls.length === 0) {
    return 'No access lists configured.'
  }

  const lines: string[] = []
  for (const acl of targetAcls) {
    const titleType = acl.type === 'extended' ? 'Extended' : 'Standard'
    lines.push(`${titleType} IP access list ${acl.id}`)
    let seq = 10
    for (const rule of acl.rules) {
      if (rule.remark) {
        lines.push(`    ${seq} remark ${rule.remark}`)
      } else if (rule.type === 'standard') {
        const src = rule.sourceIp === 'any' ? 'any' : rule.wildcard === '0.0.0.0' ? `host ${rule.sourceIp}` : `${rule.sourceIp}, wildcard bits ${rule.wildcard}`
        lines.push(`    ${seq} ${rule.action} ${src}`)
      } else {
        const src = rule.sourceIp === 'any' ? 'any' : rule.sourceWildcard === '0.0.0.0' ? `host ${rule.sourceIp}` : `${rule.sourceIp} ${rule.sourceWildcard}`
        const dst = rule.destIp === 'any' ? 'any' : rule.destWildcard === '0.0.0.0' ? `host ${rule.destIp}` : `${rule.destIp} ${rule.destWildcard}`
        const portStr = rule.destPort !== undefined ? ` eq ${rule.destPort}` : ''
        lines.push(`    ${seq} ${rule.action} ${rule.protocol} ${src} ${dst}${portStr}`)
      }
      seq += 10
    }
  }
  return lines.join('\n')
}

export function formatAclRunningConfig(accessLists: AccessList[] = []): string[] {
  const lines: string[] = []
  for (const acl of accessLists) {
    for (const rule of acl.rules) {
      if (rule.remark) {
        lines.push(`access-list ${acl.id} remark ${rule.remark}`)
      } else if (rule.type === 'standard') {
        const src = rule.sourceIp === 'any' ? 'any' : rule.wildcard === '0.0.0.0' ? `host ${rule.sourceIp}` : `${rule.sourceIp} ${rule.wildcard}`
        lines.push(`access-list ${acl.id} ${rule.action} ${src}`)
      } else {
        const src = rule.sourceIp === 'any' ? 'any' : rule.sourceWildcard === '0.0.0.0' ? `host ${rule.sourceIp}` : `${rule.sourceIp} ${rule.sourceWildcard}`
        const dst = rule.destIp === 'any' ? 'any' : rule.destWildcard === '0.0.0.0' ? `host ${rule.destIp}` : `${rule.destIp} ${rule.destWildcard}`
        const portStr = rule.destPort !== undefined ? ` eq ${rule.destPort}` : ''
        lines.push(`access-list ${acl.id} ${rule.action} ${rule.protocol} ${src} ${dst}${portStr}`)
      }
    }
  }
  return lines
}
