import type {
  CyberObserverDiscovery,
  CyberObserverDiscoveryMode,
  CyberObserverState,
  NetworkDevice,
  NetworkLink,
} from '@/types/network'
import { ipToNumber, isValidIpv4 } from './protocols/ip'
import {
  defaultManagementRange,
  deviceManagementAddresses,
  primaryManagementAddress,
  type ManagementAddress,
} from './managementAddresses'
import { activeTopologyLinks, reachableDeviceIds } from './topologyReachability'
import {
  isIsa3000,
  isIsaPermitAllRule,
  isaAclId,
  isaFirewallPorts,
  readIsaAcl,
} from './isa'
import {
  hashNetworkControllerPassword,
  isNetworkController,
  networkControllerState,
} from './networkController'

export const CYBER_OBSERVER_MODEL = 'CyberObserver'
export const CYBER_OBSERVER_DISCOVERY_LIMIT = 20

/**
 * Served by the appliance's HTTP listener. The Web Browser replaces this page
 * with the interactive console when the response comes from a Cyber Observer,
 * so raw HTTP clients still receive a truthful 200 response.
 */
export const CYBER_OBSERVER_HTTP_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cyber Observer</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f4f1ea;color:#1d2430">
<main style="max-width:560px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #d7d1c4;border-radius:12px;box-shadow:0 18px 50px rgba(40,32,18,.12)">
<div style="display:inline-block;padding:5px 9px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Cyber Observer</div>
<h1 style="margin:16px 0 8px;font-size:24px">Monitoring appliance</h1>
<p style="margin:0;color:#5b6472;font-size:14px;line-height:1.55">This console is available over HTTP from a PC Web Browser on the same reachable network.</p>
<p style="margin:10px 0 0;color:#7a7466;font-size:12px;line-height:1.5">The appliance reports configuration-derived findings from the live simulator. It does not model an external CVE feed or firmware matching.</p>
</main></body></html>`

export function isCyberObserver(device: Pick<NetworkDevice, 'type' | 'model'> | null | undefined): boolean {
  return device?.type === 'security' && device.model === CYBER_OBSERVER_MODEL
}

export function cyberObserverState(device: Pick<NetworkDevice, 'config'>): CyberObserverState {
  return device.config.cyberObserver ?? {}
}

/**
 * Classroom convenience digest. The workspace file remains readable and
 * editable by its owner; this is not a security boundary.
 */
export function hashCyberObserverPassword(password: string): string {
  let hash = 0x811c9dc5
  for (const character of `wirex-cyber-observer:${password}`) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export type CyberObserverAddress = ManagementAddress

export const cyberObserverAddresses = deviceManagementAddresses
export const primaryCyberObserverAddress = primaryManagementAddress
export const defaultCyberObserverRange = defaultManagementRange

export interface CyberObserverDiscoveryInput {
  id?: string
  name?: string
  mode: CyberObserverDiscoveryMode
  rangeStart?: string
  rangeEnd?: string
  atMs?: number
}

export interface CyberObserverDiscoveryResult {
  ok: boolean
  discovery: CyberObserverDiscovery
  deviceIds: string[]
}

export function discoverCyberObserver(
  controller: NetworkDevice,
  devices: NetworkDevice[],
  links: NetworkLink[],
  input: CyberObserverDiscoveryInput
): CyberObserverDiscoveryResult {
  const atMs = input.atMs ?? Date.now()
  const mode = input.mode
  const name = (input.name?.trim() || (mode === 'connected' ? 'Connected discovery' : 'IP range discovery')).slice(0, 80)
  const requestedStart = input.rangeStart?.trim().slice(0, 64)
  const requestedEnd = input.rangeEnd?.trim().slice(0, 64)
  const base = {
    id: input.id ?? `co-discovery-${atMs}-${mode}`,
    name,
    mode,
    ...(mode === 'range' ? { rangeStart: requestedStart, rangeEnd: requestedEnd } : {}),
    createdAtMs: atMs,
  }
  const fail = (reason: CyberObserverDiscovery['reason']): CyberObserverDiscoveryResult => {
    const discovery: CyberObserverDiscovery = { ...base, status: 'failed', reason, deviceIds: [] }
    return { ok: false, discovery, deviceIds: [] }
  }

  if (!controller.power) return fail('power-off')
  if (!primaryCyberObserverAddress(controller)) return fail('no-ip')
  if (activeTopologyLinks(devices, links).every(link => link.fromDeviceId !== controller.id && link.toDeviceId !== controller.id)) {
    return fail('no-active-link')
  }

  let rangeStart = 0
  let rangeEnd = 0
  if (mode === 'range') {
    if (!isValidIpv4(requestedStart ?? '') || !isValidIpv4(requestedEnd ?? '')) return fail('invalid-range')
    rangeStart = ipToNumber(requestedStart!)
    rangeEnd = ipToNumber(requestedEnd!)
    if (rangeStart > rangeEnd) return fail('invalid-range')
  }

  const reachable = reachableDeviceIds(controller, devices, links)
  const discovered = devices.filter(device => {
    if (device.id === controller.id) return true
    if (!device.power || !reachable.has(device.id)) return false
    const addresses = cyberObserverAddresses(device)
    if (!addresses.length) return false
    if (mode === 'connected') return true
    return addresses.some(address => {
      const value = ipToNumber(address.ip)
      return value >= rangeStart && value <= rangeEnd
    })
  })

  discovered.sort((a, b) => {
    const aIp = cyberObserverAddresses(a)[0]?.ip ?? ''
    const bIp = cyberObserverAddresses(b)[0]?.ip ?? ''
    return (ipToNumber(aIp) - ipToNumber(bIp)) || a.name.localeCompare(b.name)
  })
  const deviceIds = discovered.map(device => device.id)
  const discovery: CyberObserverDiscovery = { ...base, status: 'complete', deviceIds }
  return { ok: true, discovery, deviceIds }
}

export function currentCyberObserverDiscovery(device: Pick<NetworkDevice, 'config'>): CyberObserverDiscovery | undefined {
  const state = cyberObserverState(device)
  const discoveries = state.discoveries ?? []
  return discoveries.find(item => item.id === state.lastDiscoveryId) ?? discoveries[0]
}

export function cyberObserverInventory(
  controller: NetworkDevice,
  devices: NetworkDevice[]
): NetworkDevice[] {
  const discovery = currentCyberObserverDiscovery(controller)
  if (!discovery) return []
  const ids = new Set(discovery.deviceIds)
  return devices.filter(device => ids.has(device.id))
}

export type CyberObserverDeviceStatus = 'active' | 'idle' | 'no-ip' | 'off'

export function cyberObserverDeviceStatus(device: NetworkDevice): CyberObserverDeviceStatus {
  if (!device.power) return 'off'
  if (!cyberObserverAddresses(device).length) return 'no-ip'
  return device.ports.some(port =>
    port.adminStatus === 'up' &&
    port.status !== 'down' &&
    isValidIpv4(port.ipAddress ?? '')
  ) ? 'active' : 'idle'
}

export type CyberObserverFindingSeverity = 'critical' | 'high' | 'medium' | 'low'

export type CyberObserverFindingCode =
  | 'default-password'
  | 'http-management'
  | 'open-wireless'
  | 'wep-wireless'
  | 'default-snmp'
  | 'permit-any-inbound'
  | 'unreachable'
  | 'management-address-missing'

export interface CyberObserverFinding {
  id: string
  code: CyberObserverFindingCode
  severity: CyberObserverFindingSeverity
  deviceId: string
  /** Raw simulator value that justified the finding, never a fabricated CVE. */
  evidence: string
}

const WEAK_ACCOUNT_NAMES = new Set(['admin', 'administrator', 'root'])
const WEAK_PASSWORDS = ['cisco', 'admin', 'password', '1234']

function displayName(device: NetworkDevice): string {
  return device.name || device.config.hostname || device.model
}

function accountFindings(device: NetworkDevice): CyberObserverFinding[] {
  const findings: CyberObserverFinding[] = []
  const accounts = isNetworkController(device)
    ? networkControllerState(device).accounts ?? []
    : isCyberObserver(device)
      ? cyberObserverState(device).accounts ?? []
      : []
  if (!accounts.length) return findings
  const hash = isNetworkController(device) ? hashNetworkControllerPassword : hashCyberObserverPassword
  for (const account of accounts) {
    if (!WEAK_ACCOUNT_NAMES.has(account.username.trim().toLowerCase())) continue
    if (!WEAK_PASSWORDS.some(password => account.passwordHash === hash(password))) continue
    findings.push({
      id: `${device.id}:default-password:${account.username}`,
      code: 'default-password',
      severity: 'critical',
      deviceId: device.id,
      evidence: account.username,
    })
  }
  return findings
}

/**
 * Findings are configuration checks over the live discovered inventory. They
 * are deliberately not presented as CVEs: the simulator has no firmware or
 * external vulnerability feed to match against.
 */
export function cyberObserverFindings(
  controller: NetworkDevice,
  devices: NetworkDevice[]
): CyberObserverFinding[] {
  const inventory = cyberObserverInventory(controller, devices)
  if (!inventory.length) return []
  const findings: CyberObserverFinding[] = []

  for (const device of inventory) {
    if (!device.power) {
      findings.push({
        id: `${device.id}:unreachable`,
        code: 'unreachable',
        severity: 'high',
        deviceId: device.id,
        evidence: displayName(device),
      })
      continue
    }

    const addresses = cyberObserverAddresses(device)
    if (!addresses.length) {
      findings.push({
        id: `${device.id}:management-address-missing`,
        code: 'management-address-missing',
        severity: 'medium',
        deviceId: device.id,
        evidence: displayName(device),
      })
    }

    findings.push(...accountFindings(device))

    if ((isNetworkController(device) || isCyberObserver(device)) && addresses.length) {
      findings.push({
        id: `${device.id}:http-management`,
        code: 'http-management',
        severity: 'medium',
        deviceId: device.id,
        evidence: `http://${addresses[0].ip}`,
      })
    }

    for (const community of device.config.snmpCommunities ?? []) {
      const normalized = community.trim().toLowerCase()
      if (normalized !== 'public' && normalized !== 'private') continue
      findings.push({
        id: `${device.id}:default-snmp:${community}`,
        code: 'default-snmp',
        severity: 'medium',
        deviceId: device.id,
        evidence: community,
      })
    }

    if (device.type === 'wireless' && device.model !== 'Cell-Tower') {
      const ssid = device.config.wirelessSsid || displayName(device)
      if (device.config.wirelessAuthentication === 'open') {
        findings.push({
          id: `${device.id}:open-wireless`,
          code: 'open-wireless',
          severity: 'high',
          deviceId: device.id,
          evidence: ssid,
        })
      } else if (device.config.wirelessAuthentication === 'wep') {
        findings.push({
          id: `${device.id}:wep-wireless`,
          code: 'wep-wireless',
          severity: 'high',
          deviceId: device.id,
          evidence: ssid,
        })
      }
    }

    if (device.type === 'wlc') {
      for (const wlan of device.config.wlans ?? []) {
        if (!wlan.enabled) continue
        if (wlan.security === 'none') {
          findings.push({
            id: `${device.id}:open-wireless:${wlan.id}`,
            code: 'open-wireless',
            severity: 'high',
            deviceId: device.id,
            evidence: wlan.ssid,
          })
        } else if (wlan.security === 'wep') {
          findings.push({
            id: `${device.id}:wep-wireless:${wlan.id}`,
            code: 'wep-wireless',
            severity: 'high',
            deviceId: device.id,
            evidence: wlan.ssid,
          })
        }
      }
    }

    if (isIsa3000(device)) {
      for (const port of isaFirewallPorts(device)) {
        const { aclId, acl } = readIsaAcl(device, port)
        if (!acl?.rules.some(isIsaPermitAllRule)) continue
        findings.push({
          id: `${device.id}:permit-any-inbound:${isaAclId(port)}`,
          code: 'permit-any-inbound',
          severity: 'medium',
          deviceId: device.id,
          evidence: `${port.name} · ${aclId}`,
        })
      }
    }
  }

  const severityRank: Record<CyberObserverFindingSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }
  const byId = new Map(devices.map(device => [device.id, device]))
  return findings.sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    displayName(byId.get(a.deviceId) ?? controller).localeCompare(displayName(byId.get(b.deviceId) ?? controller)) ||
    a.id.localeCompare(b.id)
  )
}
