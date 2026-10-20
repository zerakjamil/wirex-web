import type { AccessList, AclRule, DeviceConfig, HsrpGroupConfig, Ipv6AddressConfig, NetworkAnnotation, NetworkDevice, NetworkLink, NetworkPort } from '@/types/network'
import { apWirelessSettings, isLightweightAp, isWifiAccessPoint } from './capwap'

// Reduced instructor assessment model. An activity is authored from a finished
// ("answer") network: the wizard derives assessment items from its live state, and the
// student network is produced by clearing the selected items. Grading compares the live
// state of the selected facets, never text.

export type ActivityFacetKind =
  | 'vlan'
  | 'port-l2'
  | 'port-ip'
  | 'port-admin'
  | 'route'
  | 'routing-protocol'
  | 'routing-option'
  | 'ip-routing'
  | 'ipv4-address'
  | 'default-gateway'
  | 'dns-server'
  | 'dhcp-pool'
  | 'acl'
  | 'hsrp'
  | 'ipv6-address'
  | 'wireless'

export type ActivityFacetSpec =
  | { kind: 'vlan'; vlanId: number; name: string }
  | { kind: 'port-l2'; portId: string; mode: 'access' | 'trunk'; vlan?: number; allowed?: number[] | 'all'; native?: number; voice?: number }
  | { kind: 'port-ip'; portId: string; ip: string; mask: string }
  | { kind: 'port-admin'; portId: string }
  | { kind: 'route'; network: string; netmask: string; nextHop: string }
  | { kind: 'routing-protocol'; protocol: RoutingProtocolKind; snapshot: string }
  | { kind: 'routing-option'; protocol: RoutingProtocolKind; option: 'router-id' | 'passive'; snapshot: string }
  | { kind: 'ip-routing' }
  | { kind: 'ipv4-address'; portId: string; ip: string; mask: string }
  | { kind: 'default-gateway'; gateway: string }
  | { kind: 'dns-server'; dns: string }
  | { kind: 'dhcp-pool'; name: string; snapshot: string }
  | { kind: 'acl'; id: string; snapshot: string }
  | { kind: 'hsrp'; portId: string; group: number; snapshot: string }
  | { kind: 'ipv6-address'; portId: string; snapshot: string }
  | { kind: 'wireless'; snapshot: string }

export type RoutingProtocolKind = 'rip' | 'ospf' | 'eigrp' | 'bgp'

export interface ActivityItem {
  id: string
  deviceId: string
  label: string
  expected: string
  spec: ActivityFacetSpec
}

export interface ActivityAnswer {
  devices: NetworkDevice[]
  links: NetworkLink[]
  annotations: NetworkAnnotation[]
}

export interface AssessmentActivity {
  version: 1
  name: string
  author: string
  instructions: string[]
  createdAt: string
  items: ActivityItem[]
  answer: ActivityAnswer
}

export interface ActivityCheck {
  id: string
  status: 'successful' | 'failed'
  observed: string
}

const HOST_TYPES: NetworkDevice['type'][] = ['pc', 'laptop', 'server', 'printer', 'tablet', 'smartphone', 'tv', 'phone']
const isHostDevice = (type: NetworkDevice['type']) => HOST_TYPES.includes(type)
const portLabel = (port: NetworkPort) => port.shortName || port.name

// ---------------------------------------------------------------------------
// Candidate collection (authoring)
// ---------------------------------------------------------------------------

export function collectAssessmentCandidates(devices: NetworkDevice[]): ActivityItem[] {
  const items: ActivityItem[] = []
  const push = (device: NetworkDevice, kind: ActivityFacetKind, key: string, label: string, expected: string, spec: ActivityFacetSpec) =>
    items.push({ id: [device.id, kind, key].filter(Boolean).join('|'), deviceId: device.id, label, expected, spec })

  for (const device of devices) {
    if (device.type === 'switch' && device.config.vlans?.length) {
      for (const vlan of [...device.config.vlans].sort((a, b) => a.id - b.id)) {
        if (!Number.isInteger(vlan.id) || vlan.id < 1 || vlan.id > 4094) continue
        if (vlan.id === 1 && vlan.name === 'default') continue
        push(device, 'vlan', String(vlan.id), `VLAN ${vlan.id}`, `name "${vlan.name}"`, { kind: 'vlan', vlanId: vlan.id, name: vlan.name })
      }
    }

    for (const port of device.ports) {
      if (port.isGreTunnel) continue
      if (device.type === 'switch' && port.virtualVlan === undefined) {
        const spec = l2Spec(port)
        if (spec) push(device, 'port-l2', port.id, portLabel(port), l2Expected(spec), spec)
      }
      if (device.type === 'router' || device.type === 'switch') {
        if (port.ipAddress && port.subnetMask) {
          const spec: ActivityFacetSpec = { kind: 'port-ip', portId: port.id, ip: port.ipAddress, mask: port.subnetMask }
          push(device, 'port-ip', port.id, portLabel(port), `IP ${port.ipAddress} / ${port.subnetMask}`, spec)
        }
        if (port.adminStatus === 'up' && port.ipAddress && port.dot1qVlan === undefined && (device.type === 'router' || port.virtualVlan !== undefined)) {
          push(device, 'port-admin', port.id, portLabel(port), 'port up (no shutdown)', { kind: 'port-admin', portId: port.id })
        }
        for (const group of port.hsrpGroups ?? []) {
          push(device, 'hsrp', `${port.id}:${group.group}`, `${portLabel(port)} HSRP ${group.group}`, hsrpSummary(group), { kind: 'hsrp', portId: port.id, group: group.group, snapshot: hsrpSnapshot(group) })
        }
        if (port.ipv6Addresses?.length) {
          push(device, 'ipv6-address', port.id, portLabel(port), ipv6Summary(port.ipv6Addresses), { kind: 'ipv6-address', portId: port.id, snapshot: ipv6Snapshot(port.ipv6Addresses) })
        }
      }
    }

    const seenRoutes = new Set<string>()
    for (const route of device.routingTable) {
      if (route.type !== 'S') continue
      const key = `${route.network}/${route.netmask}->${route.nextHop || route.interfaceName}`
      if (seenRoutes.has(key)) continue
      seenRoutes.add(key)
      const spec: ActivityFacetSpec = { kind: 'route', network: route.network, netmask: route.netmask, nextHop: route.nextHop }
      push(device, 'route', key, 'Static route', `S ${route.network} ${route.netmask} via ${route.nextHop || route.interfaceName}`, spec)
    }

    for (const protocol of ['rip', 'ospf', 'eigrp', 'bgp'] as RoutingProtocolKind[]) {
      const snapshot = protocolSnapshot(device.config, protocol)
      if (!snapshot) continue
      push(device, 'routing-protocol', protocol, protocol.toUpperCase(), protocolSummary(device.config, protocol), { kind: 'routing-protocol', protocol, snapshot })
      for (const option of ['router-id', 'passive'] as const) {
        const optionSnapshot = routingOptionSnapshot(device.config, protocol, option)
        if (!optionSnapshot) continue
        push(device, 'routing-option', `${protocol}:${option}`, routingOptionLabel(protocol, option), routingOptionSummary(device.config, protocol, option), { kind: 'routing-option', protocol, option, snapshot: optionSnapshot })
      }
    }

    const wireless = wirelessState(device)
    if (wireless && wirelessSnapshot(wireless) !== wirelessSnapshot(wirelessDefaultState(device))) {
      push(device, 'wireless', 'settings', 'Wireless settings', wirelessSummary(wireless), { kind: 'wireless', snapshot: wirelessSnapshot(wireless) })
    }

    if (device.type === 'switch' && device.config.ipRouting === true) {
      push(device, 'ip-routing', '', 'IP routing', 'ip routing enabled', { kind: 'ip-routing' })
    }

    for (const pool of device.config.dhcpPools ?? []) {
      push(device, 'dhcp-pool', pool.name, `DHCP pool ${pool.name}`, dhcpPoolSummary(pool), { kind: 'dhcp-pool', name: pool.name, snapshot: dhcpPoolSnapshot(pool) })
    }

    for (const list of device.config.accessLists ?? []) {
      push(device, 'acl', list.id, `ACL ${list.id}`, aclSummary(list), { kind: 'acl', id: list.id, snapshot: aclSnapshot(list) })
    }

    if (isHostDevice(device.type) && !device.config.dhcpEnabled) {
      for (const port of device.ports) {
        if (!port.ipAddress || !port.subnetMask) continue
        const spec: ActivityFacetSpec = { kind: 'ipv4-address', portId: port.id, ip: port.ipAddress, mask: port.subnetMask }
        push(device, 'ipv4-address', port.id, portLabel(port), `IP ${port.ipAddress} / ${port.subnetMask}`, spec)
      }
      if (device.config.defaultGateway) {
        push(device, 'default-gateway', '', 'Default gateway', `default gateway ${device.config.defaultGateway}`, { kind: 'default-gateway', gateway: device.config.defaultGateway })
      }
      if (device.config.dnsServer) {
        push(device, 'dns-server', '', 'DNS server', `DNS server ${device.config.dnsServer}`, { kind: 'dns-server', dns: device.config.dnsServer })
      }
    } else if (device.type === 'switch' && device.config.ipRouting !== true && device.config.defaultGateway) {
      push(device, 'default-gateway', '', 'Default gateway', `default gateway ${device.config.defaultGateway}`, { kind: 'default-gateway', gateway: device.config.defaultGateway })
    }
  }

  return items
}

type L2Spec = Extract<ActivityFacetSpec, { kind: 'port-l2' }>

function l2Spec(port: NetworkPort): L2Spec | null {
  const trunk = port.portMode === 'trunk'
  const vlan = port.vlan ?? 1
  if (trunk) {
    const allowed: number[] | 'all' = port.allowedVlans === undefined ? 'all' : [...port.allowedVlans].sort((a, b) => a - b)
    const spec: L2Spec = { kind: 'port-l2', portId: port.id, mode: 'trunk', allowed, native: port.nativeVlan ?? 1 }
    if (port.voiceVlan !== undefined) spec.voice = port.voiceVlan
    return spec
  }
  if (vlan === 1 && port.voiceVlan === undefined) return null
  const spec: L2Spec = { kind: 'port-l2', portId: port.id, mode: 'access', vlan }
  if (port.voiceVlan !== undefined) spec.voice = port.voiceVlan
  return spec
}

function l2Expected(spec: L2Spec): string {
  const voice = spec.voice !== undefined ? `, voice VLAN ${spec.voice}` : ''
  if (spec.mode === 'trunk') {
    const allowed = spec.allowed === 'all' ? 'all' : spec.allowed && spec.allowed.length ? spec.allowed.join(',') : 'none'
    return `trunk, allowed ${allowed}, native VLAN ${spec.native ?? 1}${voice}`
  }
  return `access VLAN ${spec.vlan ?? 1}${voice}`
}

type WirelessAuthentication = NonNullable<DeviceConfig['wirelessAuthentication']>
type WirelessEncryption = NonNullable<DeviceConfig['wirelessEncryption']>

interface WirelessSettingsState {
  ssid: string
  channel: number
  authentication: WirelessAuthentication
  encryption: WirelessEncryption | null
  key: string
}

const HOME_ROUTER_MODELS = new Set(['WRT300N', 'Linksys-WRT300N', 'HomeRouter-PT-AC'])

/** Effective autonomous AP settings. Lightweight APs are managed by a WLC. */
function wirelessState(device: NetworkDevice): WirelessSettingsState | null {
  if (!isWifiAccessPoint(device) || isLightweightAp(device)) return null
  const settings = apWirelessSettings(device)
  const secured = settings.authentication === 'wpa-psk' || settings.authentication === 'wpa2-psk'
  return {
    ssid: settings.ssid,
    channel: settings.channel,
    authentication: settings.authentication,
    encryption: secured ? settings.encryption : null,
    key: settings.authentication === 'wep' ? settings.wepKey.toLowerCase() : secured ? settings.passphrase : '',
  }
}

function wirelessDefaultState(device: NetworkDevice): WirelessSettingsState {
  return {
    ssid: HOME_ROUTER_MODELS.has(device.model) ? 'linksys' : 'Default',
    channel: 6,
    authentication: 'open',
    encryption: null,
    key: '',
  }
}

function wirelessSnapshot(state: WirelessSettingsState): string {
  return JSON.stringify(state)
}

function wirelessSecurityLabel(authentication: WirelessAuthentication) {
  if (authentication === 'wep') return 'WEP'
  if (authentication === 'wpa-psk') return 'WPA-PSK'
  if (authentication === 'wpa2-psk') return 'WPA2-PSK'
  return 'Open'
}

function wirelessSummary(state: WirelessSettingsState, keyMatches = true) {
  const encryption = state.encryption ? ` / ${state.encryption.toUpperCase()}` : ''
  const key = state.authentication === 'open' ? '' : state.key ? ', key set' : ', key missing'
  const mismatch = !keyMatches && state.authentication !== 'open' ? ' (key mismatch)' : ''
  return `${state.ssid} · channel ${state.channel} · ${wirelessSecurityLabel(state.authentication)}${encryption}${key}${mismatch}`
}

function parseWirelessSnapshot(snapshot: string): WirelessSettingsState | null {
  try {
    return parseWirelessState(JSON.parse(snapshot))
  } catch {
    return null
  }
}

function parseWirelessState(value: unknown): WirelessSettingsState | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.ssid !== 'string' || raw.ssid.length > 64) return null
  if (!Number.isInteger(raw.channel) || (raw.channel as number) < 1 || (raw.channel as number) > 11) return null
  const authentication = raw.authentication
  if (authentication !== 'open' && authentication !== 'wep' && authentication !== 'wpa-psk' && authentication !== 'wpa2-psk') return null
  const encryption = raw.encryption
  if (authentication === 'open' || authentication === 'wep') {
    if (encryption !== null) return null
  } else if (encryption !== 'aes' && encryption !== 'tkip') {
    return null
  }
  if (typeof raw.key !== 'string' || raw.key.length > 128) return null
  if (authentication === 'open' && raw.key !== '') return null
  if (authentication === 'wep' && raw.key !== '' && !/^[0-9a-f]{10}$/i.test(raw.key)) return null
  return {
    ssid: raw.ssid,
    channel: raw.channel as number,
    authentication,
    encryption: encryption as WirelessEncryption | null,
    key: authentication === 'wep' ? raw.key.toLowerCase() : raw.key,
  }
}

type DhcpPool = NonNullable<DeviceConfig['dhcpPools']>[number]

/** Stable, order-independent JSON for the pool fields an instructor can assess. */
function dhcpPoolSnapshot(pool: DhcpPool): string {
  return JSON.stringify({
    name: pool.name,
    network: pool.network,
    mask: pool.mask,
    defaultRouter: pool.defaultRouter ?? null,
    dnsServer: pool.dnsServer ?? null,
    tftpServer: pool.tftpServer ?? null,
    leaseDurationSeconds: pool.leaseDurationSeconds ?? null,
    hostIp: pool.hostIp ?? null,
    hostMask: pool.hostMask ?? null,
    hardwareAddress: pool.hardwareAddress ?? null,
    clientIdentifier: pool.clientIdentifier ?? null,
  })
}

function dhcpPoolSummary(pool: DhcpPool): string {
  const extras = [
    pool.defaultRouter ? `gateway ${pool.defaultRouter}` : '',
    pool.dnsServer ? `DNS ${pool.dnsServer}` : '',
    pool.leaseDurationSeconds ? `lease ${pool.leaseDurationSeconds}s` : '',
  ].filter(Boolean).join(', ')
  return `${pool.name}: ${pool.network} ${pool.mask}${extras ? ` (${extras})` : ''}`
}

function aclRuleSnapshot(rule: AclRule) {
  if (rule.type === 'standard') {
    return { type: 'standard', action: rule.action, sourceIp: rule.sourceIp, wildcard: rule.wildcard ?? null, remark: rule.remark ?? null }
  }
  return {
    type: 'extended', action: rule.action, protocol: rule.protocol, sourceIp: rule.sourceIp,
    sourceWildcard: rule.sourceWildcard ?? null, destIp: rule.destIp ?? null,
    destWildcard: rule.destWildcard ?? null, destPort: rule.destPort ?? null, remark: rule.remark ?? null,
  }
}

function aclSnapshot(list: AccessList): string {
  return JSON.stringify({ id: list.id, number: list.number ?? null, type: list.type, rules: list.rules.map(aclRuleSnapshot) })
}

function aclRuleText(rule: AclRule): string {
  const remark = rule.remark ? ` remark ${rule.remark}` : ''
  if (rule.type === 'standard') return `${rule.action} ${rule.sourceIp}${rule.wildcard ? ` ${rule.wildcard}` : ''}${remark}`
  const source = `${rule.sourceIp}${rule.sourceWildcard ? ` ${rule.sourceWildcard}` : ''}`
  const dest = rule.destIp ? `${rule.destIp}${rule.destWildcard ? ` ${rule.destWildcard}` : ''}${rule.destPort !== undefined ? ` eq ${rule.destPort}` : ''}` : 'any'
  return `${rule.action} ${rule.protocol} ${source} ${dest}${remark}`
}

function aclSummary(list: AccessList): string {
  const body = list.rules.length ? list.rules.map(aclRuleText).join('; ') : 'no rules'
  return `${list.id} ${list.type}: ${body}`
}

function hsrpSnapshot(group: HsrpGroupConfig): string {
  return JSON.stringify({ group: group.group, virtualIp: group.virtualIp ?? null, priority: group.priority ?? null, preempt: group.preempt === true })
}

function hsrpSummary(group: HsrpGroupConfig): string {
  return `group ${group.group} virtual ${group.virtualIp ?? 'unset'}, priority ${group.priority ?? 100}, ${group.preempt ? 'preempt' : 'no preempt'}`
}

function ipv6Snapshot(addresses: Ipv6AddressConfig[]): string {
  return JSON.stringify([...addresses]
    .map(entry => ({ address: entry.address, prefixLength: entry.prefixLength, source: entry.source ?? 'static' }))
    .sort((left, right) => `${left.address}/${left.prefixLength}`.localeCompare(`${right.address}/${right.prefixLength}`)))
}

function ipv6Summary(addresses: Ipv6AddressConfig[]): string {
  return `IPv6 ${addresses.map(entry => `${entry.address}/${entry.prefixLength}`).join(', ')}`
}

// ---------------------------------------------------------------------------
// Routing protocol snapshots (machine comparison + human summary)
// ---------------------------------------------------------------------------

export function protocolSnapshot(config: DeviceConfig, protocol: RoutingProtocolKind): string | null {
  if (protocol === 'rip') {
    const networks = [...(config.ripNetworks ?? [])].sort()
    if (!networks.length) return null
    return JSON.stringify({ protocol, version: config.ripVersion ?? 1, networks })
  }
  if (protocol === 'ospf') {
    const networks = (config.ospfNetworks ?? []).map(n => ({ network: n.network, wildcard: n.wildcard, area: n.area })).sort(compareRouterEntries)
    if (!config.ospfProcessId || !networks.length) return null
    return JSON.stringify({ protocol, processId: config.ospfProcessId, networks })
  }
  if (protocol === 'eigrp') {
    const networks = (config.eigrpNetworks ?? []).map(n => ({ network: n.network, wildcard: n.wildcard })).sort(compareRouterEntries)
    if (!config.eigrpAs || !networks.length) return null
    return JSON.stringify({ protocol, as: config.eigrpAs, networks })
  }
  const neighbors = (config.bgpNeighbors ?? []).map(n => ({ ip: n.ip, remoteAs: n.remoteAs })).sort((a, b) => (a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : a.remoteAs - b.remoteAs))
  const networks = (config.bgpNetworks ?? []).map(n => ({ network: n.network, mask: n.mask })).sort(compareRouterEntries)
  if (!config.bgpAs || (!neighbors.length && !networks.length)) return null
  return JSON.stringify({ protocol, as: config.bgpAs, neighbors, networks })
}

function compareRouterEntries(a: { network: string; wildcard?: string; area?: number }, b: { network: string; wildcard?: string; area?: number }) {
  const keyA = `${a.network}/${a.wildcard ?? ''}/${a.area ?? ''}`
  const keyB = `${b.network}/${b.wildcard ?? ''}/${b.area ?? ''}`
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0
}

export function protocolSummary(config: DeviceConfig, protocol: RoutingProtocolKind): string {
  if (protocol === 'rip') {
    const networks = [...(config.ripNetworks ?? [])].sort()
    if (!networks.length) return 'RIP not configured'
    return `RIP v${config.ripVersion ?? 1}: network ${networks.join(', network ')}`
  }
  if (protocol === 'ospf') {
    const networks = (config.ospfNetworks ?? []).map(n => `${n.network} ${n.wildcard} area ${n.area}`)
    if (!config.ospfProcessId || !networks.length) return 'OSPF not configured'
    return `OSPF ${config.ospfProcessId}: ${networks.join(', ')}`
  }
  if (protocol === 'eigrp') {
    const networks = (config.eigrpNetworks ?? []).map(n => `${n.network} ${n.wildcard}`)
    if (!config.eigrpAs || !networks.length) return 'EIGRP not configured'
    return `EIGRP ${config.eigrpAs}: ${networks.join(', ')}`
  }
  const neighbors = (config.bgpNeighbors ?? []).map(n => `${n.ip} remote-as ${n.remoteAs}`)
  const networks = (config.bgpNetworks ?? []).map(n => `${n.network}/${n.mask}`)
  if (!config.bgpAs || (!neighbors.length && !networks.length)) return 'BGP not configured'
  return `BGP ${config.bgpAs}: neighbors ${neighbors.length ? neighbors.join(', ') : 'none'}, networks ${networks.length ? networks.join(', ') : 'none'}`
}

type RoutingOption = 'router-id' | 'passive'

function protocolLabel(protocol: RoutingProtocolKind) {
  return protocol.toUpperCase()
}

function routingOptionLabel(protocol: RoutingProtocolKind, option: RoutingOption) {
  return `${protocolLabel(protocol)} ${option === 'router-id' ? 'router-id' : 'passive interfaces'}`
}

function routingOptionSnapshot(config: DeviceConfig, protocol: RoutingProtocolKind, option: RoutingOption): string | null {
  if (option === 'router-id') {
    if (protocol === 'rip') return null
    const value = protocol === 'ospf' ? config.ospfRouterId : protocol === 'eigrp' ? config.eigrpRouterId : config.bgpRouterId
    return value ? JSON.stringify({ protocol, option, value }) : null
  }
  if (protocol === 'bgp') return null
  const passiveDefault = protocol === 'ospf' ? config.ospfPassiveDefault : protocol === 'eigrp' ? config.eigrpPassiveDefault : config.ripPassiveDefault
  const passive = protocol === 'ospf' ? config.ospfPassiveInterfaces : protocol === 'eigrp' ? config.eigrpPassiveInterfaces : config.ripPassiveInterfaces
  const active = protocol === 'ospf' ? config.ospfActiveInterfaces : protocol === 'eigrp' ? config.eigrpActiveInterfaces : config.ripActiveInterfaces
  if (!passiveDefault && !(passive?.length)) return null
  return JSON.stringify({
    protocol,
    option,
    default: !!passiveDefault,
    passive: [...(passive ?? [])].sort(),
    // An active exception only matters under `passive-interface default`.
    active: passiveDefault ? [...(active ?? [])].sort() : [],
  })
}

function routingOptionSummary(config: DeviceConfig, protocol: RoutingProtocolKind, option: RoutingOption): string {
  if (option === 'router-id') {
    if (protocol === 'rip') return 'RIP has no router-id'
    const value = protocol === 'ospf' ? config.ospfRouterId : protocol === 'eigrp' ? config.eigrpRouterId : config.bgpRouterId
    return `${protocolLabel(protocol)} router-id ${value || 'not set'}`
  }
  if (protocol === 'bgp') return 'BGP has no passive interfaces'
  const passiveDefault = protocol === 'ospf' ? config.ospfPassiveDefault : protocol === 'eigrp' ? config.eigrpPassiveDefault : config.ripPassiveDefault
  const passive = protocol === 'ospf' ? config.ospfPassiveInterfaces : protocol === 'eigrp' ? config.eigrpPassiveInterfaces : config.ripPassiveInterfaces
  const active = protocol === 'ospf' ? config.ospfActiveInterfaces : protocol === 'eigrp' ? config.eigrpActiveInterfaces : config.ripActiveInterfaces
  const prefix = protocolLabel(protocol)
  if (passiveDefault) {
    const exceptions = [...(active ?? [])].sort()
    return `${prefix} passive default${exceptions.length ? `, except ${exceptions.join(', ')}` : ''}`
  }
  const names = [...(passive ?? [])].sort()
  if (names.length) return `${prefix} passive ${names.join(', ')}`
  return `${prefix} passive interfaces not set`
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export function evaluateActivityItems(devices: NetworkDevice[], items: ActivityItem[]): ActivityCheck[] {
  return items.map(item => {
    const device = devices.find(d => d.id === item.deviceId)
    if (!device) return { id: item.id, status: 'failed' as const, observed: 'device missing' }
    const { ok, observed } = readObserved(device, item.spec)
    return { id: item.id, status: ok ? 'successful' as const : 'failed' as const, observed }
  })
}

function readObserved(device: NetworkDevice, spec: ActivityFacetSpec): { ok: boolean; observed: string } {
  if (spec.kind === 'vlan') {
    const entry = device.config.vlans?.find(v => v.id === spec.vlanId)
    if (!entry) return { ok: false, observed: `no VLAN ${spec.vlanId}` }
    return { ok: entry.name === spec.name, observed: `name "${entry.name}"` }
  }
  if (spec.kind === 'ip-routing') {
    const enabled = device.config.ipRouting === true
    return { ok: enabled, observed: enabled ? 'enabled' : 'disabled' }
  }
  if (spec.kind === 'default-gateway') {
    const value = device.config.defaultGateway
    return { ok: value === spec.gateway, observed: value ? value : 'not set' }
  }
  if (spec.kind === 'dns-server') {
    const value = device.config.dnsServer
    return { ok: value === spec.dns, observed: value ? value : 'not set' }
  }
  if (spec.kind === 'route') {
    const match = device.routingTable.some(r => r.type === 'S' && r.network === spec.network && r.netmask === spec.netmask && r.nextHop === spec.nextHop)
    const statics = device.routingTable.filter(r => r.type === 'S').map(r => `${r.network} ${r.netmask} via ${r.nextHop || r.interfaceName}`)
    return { ok: match, observed: statics.length ? statics.join(', ') : 'no static routes' }
  }
  if (spec.kind === 'routing-protocol') {
    const snapshot = protocolSnapshot(device.config, spec.protocol)
    return { ok: snapshot === spec.snapshot, observed: protocolSummary(device.config, spec.protocol) }
  }
  if (spec.kind === 'routing-option') {
    const snapshot = routingOptionSnapshot(device.config, spec.protocol, spec.option)
    return { ok: snapshot === spec.snapshot, observed: routingOptionSummary(device.config, spec.protocol, spec.option) }
  }
  if (spec.kind === 'dhcp-pool') {
    const pool = device.config.dhcpPools?.find(candidate => candidate.name === spec.name)
    if (!pool) return { ok: false, observed: `no pool ${spec.name}` }
    return { ok: dhcpPoolSnapshot(pool) === spec.snapshot, observed: dhcpPoolSummary(pool) }
  }
  if (spec.kind === 'acl') {
    const list = device.config.accessLists?.find(candidate => candidate.id === spec.id)
    if (!list) return { ok: false, observed: `no ACL ${spec.id}` }
    return { ok: aclSnapshot(list) === spec.snapshot, observed: aclSummary(list) }
  }
  if (spec.kind === 'wireless') {
    const state = wirelessState(device)
    if (!state) return { ok: false, observed: 'no autonomous wireless settings' }
    const expected = parseWirelessSnapshot(spec.snapshot)
    const ok = !!expected && wirelessSnapshot(state) === wirelessSnapshot(expected)
    return { ok, observed: wirelessSummary(state, !expected || expected.key === state.key) }
  }
  const port = device.ports.find(p => p.id === spec.portId)
  if (!port) return { ok: false, observed: 'interface missing' }
  if (spec.kind === 'hsrp') {
    const group = port.hsrpGroups?.find(candidate => candidate.group === spec.group)
    if (!group) return { ok: false, observed: `no HSRP group ${spec.group}` }
    return { ok: hsrpSnapshot(group) === spec.snapshot, observed: hsrpSummary(group) }
  }
  if (spec.kind === 'ipv6-address') {
    const addresses = port.ipv6Addresses ?? []
    return { ok: ipv6Snapshot(addresses) === spec.snapshot, observed: addresses.length ? ipv6Summary(addresses) : 'no IPv6 addresses' }
  }
  if (spec.kind === 'port-ip' || spec.kind === 'ipv4-address') {
    const ok = port.ipAddress === spec.ip && port.subnetMask === spec.mask
    return { ok, observed: port.ipAddress ? `IP ${port.ipAddress} / ${port.subnetMask ?? 'no mask'}` : 'no address' }
  }
  if (spec.kind === 'port-admin') {
    if (port.adminStatus !== 'up') return { ok: false, observed: 'administratively down' }
    return { ok: true, observed: 'up' }
  }
  // port-l2
  if (spec.mode === 'access') {
    const mode = port.portMode ?? 'access'
    if (mode !== 'access') return { ok: false, observed: `mode ${mode}` }
    const vlan = port.vlan ?? 1
    const voiceOk = port.voiceVlan === spec.voice
    const ok = vlan === (spec.vlan ?? 1) && voiceOk
    return { ok, observed: l2Expected({ kind: 'port-l2', portId: spec.portId, mode: 'access', vlan, voice: port.voiceVlan }) }
  }
  if ((port.portMode ?? 'access') !== 'trunk') return { ok: false, observed: `mode ${port.portMode ?? 'access'}` }
  const allowedNow: number[] | 'all' = port.allowedVlans === undefined ? 'all' : [...port.allowedVlans].sort((a, b) => a - b)
  const current: L2Spec = { kind: 'port-l2', portId: spec.portId, mode: 'trunk', allowed: allowedNow, native: port.nativeVlan ?? 1, voice: port.voiceVlan }
  const allowedOk = spec.allowed === 'all' ? allowedNow === 'all' : allowedNow !== 'all' && spec.allowed !== undefined && arraysEqual(allowedNow, spec.allowed)
  const ok = allowedOk && (current.native ?? 1) === (spec.native ?? 1) && current.voice === spec.voice
  return { ok, observed: l2Expected(current) }
}

function arraysEqual(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function scoreActivity(checks: ActivityCheck[]): { passed: number; total: number; percent: number } {
  const passed = checks.filter(c => c.status === 'successful').length
  const total = checks.length
  return { passed, total, percent: total ? Math.round((passed / total) * 100) : 0 }
}

// ---------------------------------------------------------------------------
// Student network derivation (clearing)
// ---------------------------------------------------------------------------

export function deriveInitialNetwork(activity: AssessmentActivity): ActivityAnswer {
  return {
    devices: clearAssessedConfig(activity.answer.devices, activity.items),
    links: structuredClone(activity.answer.links),
    annotations: structuredClone(activity.answer.annotations),
  }
}

export function clearAssessedConfig(devices: NetworkDevice[], items: ActivityItem[]): NetworkDevice[] {
  const clone = structuredClone(devices)
  for (const item of items) {
    const device = clone.find(d => d.id === item.deviceId)
    if (device) clearItem(device, item.spec)
  }
  return clone
}

function clearItem(device: NetworkDevice, spec: ActivityFacetSpec) {
  if (spec.kind === 'vlan') {
    if (device.config.vlans) device.config.vlans = device.config.vlans.filter(v => v.id !== spec.vlanId)
    return
  }
  if (spec.kind === 'ip-routing') {
    device.config.ipRouting = false
    return
  }
  if (spec.kind === 'default-gateway') {
    delete device.config.defaultGateway
    return
  }
  if (spec.kind === 'dns-server') {
    delete device.config.dnsServer
    return
  }
  if (spec.kind === 'route') {
    device.routingTable = device.routingTable.filter(r => !(r.type === 'S' && r.network === spec.network && r.netmask === spec.netmask && r.nextHop === spec.nextHop))
    return
  }
  if (spec.kind === 'routing-protocol') {
    if (spec.protocol === 'rip') {
      device.config.ripNetworks = []
      delete device.config.ripVersion
      delete device.config.ripAutoSummary
    } else if (spec.protocol === 'ospf') {
      delete device.config.ospfProcessId
      device.config.ospfNetworks = []
    } else if (spec.protocol === 'eigrp') {
      delete device.config.eigrpAs
      device.config.eigrpNetworks = []
    } else {
      delete device.config.bgpAs
      delete device.config.bgpRouterId
      device.config.bgpNeighbors = []
      device.config.bgpNetworks = []
    }
    if (device.activeRoutingProtocol === spec.protocol) delete device.activeRoutingProtocol
    return
  }
  if (spec.kind === 'routing-option') {
    if (spec.option === 'router-id') {
      if (spec.protocol === 'ospf') delete device.config.ospfRouterId
      else if (spec.protocol === 'eigrp') delete device.config.eigrpRouterId
      else if (spec.protocol === 'bgp') delete device.config.bgpRouterId
    } else if (spec.protocol === 'rip') {
      device.config.ripPassiveDefault = false
      device.config.ripPassiveInterfaces = []
      device.config.ripActiveInterfaces = []
    } else if (spec.protocol === 'ospf') {
      device.config.ospfPassiveDefault = false
      device.config.ospfPassiveInterfaces = []
      device.config.ospfActiveInterfaces = []
    } else if (spec.protocol === 'eigrp') {
      device.config.eigrpPassiveDefault = false
      device.config.eigrpPassiveInterfaces = []
      device.config.eigrpActiveInterfaces = []
    }
    return
  }
  if (spec.kind === 'dhcp-pool') {
    device.config.dhcpPools = (device.config.dhcpPools ?? []).filter(pool => pool.name !== spec.name)
    return
  }
  if (spec.kind === 'acl') {
    device.config.accessLists = (device.config.accessLists ?? []).filter(list => list.id !== spec.id)
    return
  }
  if (spec.kind === 'wireless') {
    const defaults = wirelessDefaultState(device)
    device.config.wirelessSsid = defaults.ssid
    device.config.wirelessChannel = defaults.channel
    device.config.wirelessAuthentication = defaults.authentication
    device.config.wirelessPassphrase = ''
    device.config.wirelessWepKey = ''
    device.config.wirelessEncryption = 'aes'
    return
  }
  const port = device.ports.find(p => p.id === spec.portId)
  if (!port) return
  if (spec.kind === 'hsrp') {
    port.hsrpGroups = (port.hsrpGroups ?? []).filter(group => group.group !== spec.group)
    if (!port.hsrpGroups.length) delete port.hsrpGroups
    return
  }
  if (spec.kind === 'ipv6-address') {
    delete port.ipv6Addresses
    return
  }
  if (spec.kind === 'port-ip' || spec.kind === 'ipv4-address') {
    delete port.ipAddress
    delete port.subnetMask
    return
  }
  if (spec.kind === 'port-admin') {
    port.adminStatus = 'down'
    return
  }
  // port-l2
  port.portMode = 'access'
  port.vlan = 1
  delete port.allowedVlans
  delete port.nativeVlan
  delete port.voiceVlan
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export const ACTIVITY_FORMAT = 'wirex-activity'

export function serializeActivity(activity: AssessmentActivity): string {
  return JSON.stringify(activity, null, 2)
}

export function activityFileSlug(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return slug || 'activity'
}

export function activityFileName(name: string): string {
  return `${activityFileSlug(name)}.wxact.json`
}

const MAX_DEVICES = 2000
const MAX_ITEMS = 4096
const MAX_INSTRUCTIONS = 64
const MAX_TEXT = 500

export function parseActivity(input: unknown): AssessmentActivity {
  if (!input || typeof input !== 'object') throw new Error('This file is not a valid wireX activity file.')
  const raw = input as Record<string, unknown>
  if (raw.version !== 1) throw new Error('This activity file version is not supported.')
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name || name.length > 120) throw new Error('This activity file has no valid activity name.')
  const author = typeof raw.author === 'string' ? raw.author.slice(0, 120) : ''
  if (!Array.isArray(raw.instructions) || raw.instructions.length > MAX_INSTRUCTIONS || raw.instructions.some(line => typeof line !== 'string' || line.length > MAX_TEXT)) throw new Error('This activity file has invalid instructions.')
  const instructions = (raw.instructions as string[]).map(line => line.trim()).filter(Boolean)
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt.slice(0, 64) : ''
  const answer = parseAnswer(raw.answer)
  if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > MAX_ITEMS) throw new Error('This activity file has no assessment items.')
  const deviceIds = new Set(answer.devices.map(d => d.id))
  const items: ActivityItem[] = []
  const seen = new Set<string>()
  for (const entry of raw.items) {
    const item = parseItem(entry, deviceIds)
    if (seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }
  if (!items.length) throw new Error('This activity file has no assessment items.')
  return { version: 1, name, author, instructions, createdAt, items, answer }
}

function parseAnswer(input: unknown): ActivityAnswer {
  if (!input || typeof input !== 'object') throw new Error('This activity file has no answer network.')
  const raw = input as Record<string, unknown>
  if (!Array.isArray(raw.devices) || !raw.devices.length || raw.devices.length > MAX_DEVICES) throw new Error('This activity file has an invalid answer network.')
  const devices = raw.devices as NetworkDevice[]
  const valid = devices.every(d => d && typeof d.id === 'string' && typeof d.config === 'object' && d.config !== null && Array.isArray(d.ports) && Array.isArray(d.routingTable) && Array.isArray(d.arpTable) && Array.isArray(d.macTable) && Number.isFinite(d.x) && Number.isFinite(d.y))
  if (!valid) throw new Error('This activity file has an invalid answer network.')
  const ids = new Set(devices.map(d => d.id))
  if (ids.size !== devices.length) throw new Error('This activity file has an invalid answer network.')
  const links = Array.isArray(raw.links) ? raw.links as NetworkLink[] : []
  if (!links.every(l => l && typeof l.id === 'string' && ids.has(l.fromDeviceId) && ids.has(l.toDeviceId))) throw new Error('This activity file has an invalid answer network.')
  const annotations = Array.isArray(raw.annotations) ? raw.annotations as NetworkAnnotation[] : []
  return { devices, links, annotations }
}

function parseItem(input: unknown, deviceIds: Set<string>): ActivityItem {
  if (!input || typeof input !== 'object') throw new Error('This activity file has an invalid assessment item.')
  const raw = input as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id : ''
  const deviceId = typeof raw.deviceId === 'string' ? raw.deviceId : ''
  const label = typeof raw.label === 'string' ? raw.label : ''
  const expected = typeof raw.expected === 'string' ? raw.expected : ''
  if (!id || id.length > 300 || !deviceIds.has(deviceId) || !label || label.length > 200 || expected.length > 400) throw new Error('This activity file has an invalid assessment item.')
  return { id, deviceId, label, expected, spec: parseSpec(raw.spec) }
}

function isText(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function isNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function parseSpec(input: unknown): ActivityFacetSpec {
  if (!input || typeof input !== 'object') throw new Error('This activity file has an invalid assessment item.')
  const raw = input as Record<string, unknown>
  const portId = () => {
    if (!isText(raw.portId, 200)) throw new Error('This activity file has an invalid assessment item.')
    return raw.portId
  }
  switch (raw.kind) {
    case 'vlan': {
      if (!isNumber(raw.vlanId, 1, 4094) || !isText(raw.name, 200)) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'vlan', vlanId: raw.vlanId, name: raw.name }
    }
    case 'port-l2': {
      if (raw.mode !== 'access' && raw.mode !== 'trunk') throw new Error('This activity file has an invalid assessment item.')
      const spec: ActivityFacetSpec = { kind: 'port-l2', portId: portId(), mode: raw.mode }
      if (raw.vlan !== undefined) {
        if (!isNumber(raw.vlan, 1, 4094)) throw new Error('This activity file has an invalid assessment item.')
        spec.vlan = raw.vlan
      }
      if (raw.allowed !== undefined) {
        if (raw.allowed === 'all') spec.allowed = 'all'
        else if (Array.isArray(raw.allowed) && raw.allowed.length <= 4094 && raw.allowed.every(v => isNumber(v, 1, 4094))) spec.allowed = [...raw.allowed] as number[]
        else throw new Error('This activity file has an invalid assessment item.')
      }
      if (raw.native !== undefined) {
        if (!isNumber(raw.native, 1, 4094)) throw new Error('This activity file has an invalid assessment item.')
        spec.native = raw.native
      }
      if (raw.voice !== undefined) {
        if (!isNumber(raw.voice, 1, 4094)) throw new Error('This activity file has an invalid assessment item.')
        spec.voice = raw.voice
      }
      return spec
    }
    case 'port-ip':
    case 'ipv4-address': {
      if (!isText(raw.ip, 64) || !isText(raw.mask, 64)) throw new Error('This activity file has an invalid assessment item.')
      return { kind: raw.kind, portId: portId(), ip: raw.ip, mask: raw.mask }
    }
    case 'port-admin':
      return { kind: 'port-admin', portId: portId() }
    case 'route': {
      if (!isText(raw.network, 64) || !isText(raw.netmask, 64)) throw new Error('This activity file has an invalid assessment item.')
      if (typeof raw.nextHop !== 'string' || raw.nextHop.length > 64) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'route', network: raw.network, netmask: raw.netmask, nextHop: raw.nextHop }
    }
    case 'routing-protocol': {
      if (raw.protocol !== 'rip' && raw.protocol !== 'ospf' && raw.protocol !== 'eigrp' && raw.protocol !== 'bgp') throw new Error('This activity file has an invalid assessment item.')
      if (typeof raw.snapshot !== 'string' || raw.snapshot.length > 4096) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'routing-protocol', protocol: raw.protocol, snapshot: raw.snapshot }
    }
    case 'routing-option': {
      const protocol = raw.protocol
      if (protocol !== 'rip' && protocol !== 'ospf' && protocol !== 'eigrp' && protocol !== 'bgp') throw new Error('This activity file has an invalid assessment item.')
      const option = raw.option
      if (option !== 'router-id' && option !== 'passive') throw new Error('This activity file has an invalid assessment item.')
      if (option === 'router-id' && protocol === 'rip') throw new Error('This activity file has an invalid assessment item.')
      if (option === 'passive' && protocol === 'bgp') throw new Error('This activity file has an invalid assessment item.')
      if (typeof raw.snapshot !== 'string' || raw.snapshot.length > 4096) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'routing-option', protocol, option, snapshot: raw.snapshot }
    }
    case 'ip-routing':
      return { kind: 'ip-routing' }
    case 'default-gateway': {
      if (!isText(raw.gateway, 64)) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'default-gateway', gateway: raw.gateway }
    }
    case 'dns-server': {
      if (!isText(raw.dns, 64)) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'dns-server', dns: raw.dns }
    }
    case 'dhcp-pool': {
      if (!isText(raw.name, 80) || typeof raw.snapshot !== 'string' || raw.snapshot.length > 8192) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'dhcp-pool', name: raw.name, snapshot: raw.snapshot }
    }
    case 'acl': {
      if (!isText(raw.id, 200) || typeof raw.snapshot !== 'string' || raw.snapshot.length > 8192) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'acl', id: raw.id, snapshot: raw.snapshot }
    }
    case 'hsrp': {
      if (!isNumber(raw.group, 0, 255) || typeof raw.snapshot !== 'string' || raw.snapshot.length > 8192) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'hsrp', portId: portId(), group: raw.group, snapshot: raw.snapshot }
    }
    case 'ipv6-address': {
      if (typeof raw.snapshot !== 'string' || raw.snapshot.length > 8192) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'ipv6-address', portId: portId(), snapshot: raw.snapshot }
    }
    case 'wireless': {
      if (typeof raw.snapshot !== 'string' || raw.snapshot.length > 4096) throw new Error('This activity file has an invalid assessment item.')
      let parsed: unknown
      try {
        parsed = JSON.parse(raw.snapshot)
      } catch {
        throw new Error('This activity file has an invalid assessment item.')
      }
      const state = parseWirelessState(parsed)
      if (!state) throw new Error('This activity file has an invalid assessment item.')
      return { kind: 'wireless', snapshot: wirelessSnapshot(state) }
    }
    default:
      throw new Error('This activity file has an invalid assessment item.')
  }
}

// ---------------------------------------------------------------------------
// Results export
// ---------------------------------------------------------------------------

export function buildResultsDocument(activity: AssessmentActivity, checks: ActivityCheck[], checkedAt: string): string {
  const byId = new Map(activity.items.map(item => [item.id, item]))
  const devices = new Map(activity.answer.devices.map(device => [device.id, device.name]))
  return JSON.stringify({
    format: ACTIVITY_FORMAT,
    version: 1,
    activity: { name: activity.name, author: activity.author },
    checkedAt,
    score: scoreActivity(checks),
    items: checks.flatMap(check => {
      const item = byId.get(check.id)
      if (!item) return []
      return [{ device: devices.get(item.deviceId) ?? item.deviceId, label: item.label, expected: item.expected, status: check.status, observed: check.observed }]
    }),
  }, null, 2)
}
