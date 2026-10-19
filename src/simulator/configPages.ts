import type { NetworkDevice } from '@/types/network'

/**
 * Cisco Packet Tracer's Config tab model: a four-level category tree
 * (GLOBAL, ROUTING, SWITCHING, INTERFACE) whose pages edit the device and show
 * the equivalent Cisco IOS commands at the bottom.
 *
 * Everything here is a pure function over device state so the tab and its tests
 * share one source of truth for which pages exist and which commands a page
 * corresponds to.
 */

export type ConfigGroupId = 'GLOBAL' | 'ROUTING' | 'SWITCHING' | 'INTERFACE'

export interface ConfigPage {
  id: string
  name: string
  group: ConfigGroupId
}

export interface ConfigGroup {
  id: ConfigGroupId
  pages: ConfigPage[]
}

export interface AlgorithmSettings {
  halfOpenSessionMultiplier: number
  maximumConnections: number
  maximumOpenedSessions: number
  maximumRetransmissionTimeoutMs: number
}

export const ALGORITHM_DEFAULTS: AlgorithmSettings = {
  halfOpenSessionMultiplier: 1,
  maximumConnections: 100,
  maximumOpenedSessions: 1000,
  maximumRetransmissionTimeoutMs: 1000,
}

/** Models that Packet Tracer treats as routing-capable even though they switch. */
const L3_SWITCH_MODELS = ['3560', '3650']
/** Packet Tracer exposes SWITCHING / VLAN Database on these routers. */
const VLAN_DATABASE_ROUTER_MODELS = ['1841', '2811']

export function isRoutingCapable(device: NetworkDevice): boolean {
  if (device.type === 'router') return true
  if (device.type === 'switch') return L3_SWITCH_MODELS.some((model) => device.model.includes(model))
  return false
}

export function supportsVlanDatabase(device: NetworkDevice): boolean {
  if (device.type === 'switch') return true
  return device.type === 'router' && VLAN_DATABASE_ROUTER_MODELS.some((model) => device.model.includes(model))
}

export function supportsAlgorithmSettings(device: NetworkDevice): boolean {
  return device.type === 'router' || device.type === 'switch'
}

export function algorithmSettings(device: NetworkDevice): AlgorithmSettings {
  return { ...ALGORITHM_DEFAULTS, ...(device.config.algorithmSettings ?? {}) }
}

/** The Config tab's category tree for one device, in Packet Tracer order. */
export function configGroups(device: NetworkDevice): ConfigGroup[] {
  const groups: ConfigGroup[] = [
    { id: 'GLOBAL', pages: [{ id: 'settings', name: 'Settings', group: 'GLOBAL' }] },
  ]
  if (supportsAlgorithmSettings(device)) {
    groups[0].pages.push({ id: 'algorithm-settings', name: 'Algorithm Settings', group: 'GLOBAL' })
  }
  if (isRoutingCapable(device)) {
    groups.push({
      id: 'ROUTING',
      pages: [
        { id: 'static-routes', name: 'Static', group: 'ROUTING' },
        { id: 'rip', name: 'RIP', group: 'ROUTING' },
      ],
    })
  }
  if (supportsVlanDatabase(device)) {
    groups.push({ id: 'SWITCHING', pages: [{ id: 'vlan-database', name: 'VLAN Database', group: 'SWITCHING' }] })
  }
  if (device.ports.length > 0) {
    groups.push({
      id: 'INTERFACE',
      pages: device.ports.map((port) => ({ id: `interface:${port.id}`, name: port.name, group: 'INTERFACE' })),
    })
  }
  return groups
}

export function findPage(device: NetworkDevice, pageId: string): ConfigPage | undefined {
  for (const group of configGroups(device)) {
    const page = group.pages.find((candidate) => candidate.id === pageId)
    if (page) return page
  }
  return undefined
}

function prompts(device: NetworkDevice): { user: string; priv: string; config: string } {
  const host = device.config.hostname || device.name || 'Router'
  return { user: `${host}>`, priv: `${host}#`, config: `${host}(config)#` }
}

function enterConfig(device: NetworkDevice): string[] {
  const { user, priv, config } = prompts(device)
  return [`${user}enable`, `${priv}configure terminal`, `${config}`]
}

/** The commands shown in the "Equivalent IOS Commands" pane for one page. */
export function equivalentIosCommands(device: NetworkDevice, pageId: string): string {
  if (pageId === 'settings') {
    const { user, priv, config } = prompts(device)
    return [`${user}enable`, `${priv}configure terminal`, `${config}hostname ${device.config.hostname || device.name}`, `${config}exit`].join('\n')
  }

  if (pageId === 'static-routes') {
    const lines = enterConfig(device)
    const statics = device.routingTable.filter((route) => route.type === 'S')
    if (statics.length === 0) {
      lines.push(`${prompts(device).config}ip route <network> <netmask> <next-hop>`)
    } else {
      for (const route of statics) {
        lines.push(`${prompts(device).config}ip route ${route.network} ${route.netmask} ${route.nextHop}`)
      }
    }
    lines.push(`${prompts(device).config}exit`)
    return lines.join('\n')
  }

  if (pageId === 'rip') {
    const { config } = prompts(device)
    const lines = enterConfig(device)
    lines.push(`${config}router rip`)
    lines.push(`${config}version ${device.config.ripVersion ?? 2}`)
    if (!device.config.ripAutoSummary) lines.push(`${config}no auto-summary`)
    for (const network of device.config.ripNetworks ?? []) lines.push(`${config}network ${network}`)
    lines.push(`${config}exit`)
    return lines.join('\n')
  }

  if (pageId === 'vlan-database') {
    const { config } = prompts(device)
    const lines = enterConfig(device)
    const vlans = (device.config.vlans ?? []).filter((vlan) => vlan.id !== 1)
    if (vlans.length === 0) {
      lines.push(`${config}vlan <vlan-id>`, `${config}name <vlan-name>`)
    } else {
      for (const vlan of vlans) lines.push(`${config}vlan ${vlan.id}`, `${config}name ${vlan.name}`)
    }
    lines.push(`${config}exit`)
    return lines.join('\n')
  }

  if (pageId.startsWith('interface:')) {
    const portId = pageId.slice('interface:'.length)
    const port = device.ports.find((candidate) => candidate.id === portId)
    if (!port) return ''
    const { config } = prompts(device)
    const lines = enterConfig(device)
    lines.push(`${config}interface ${port.name}`)
    if (port.description) lines.push(`${config}description ${port.description}`)
    if (port.portMode === 'trunk') {
      lines.push(`${config}switchport mode trunk`)
      if (port.nativeVlan) lines.push(`${config}switchport trunk native vlan ${port.nativeVlan}`)
    } else if (device.type === 'switch' && port.vlan) {
      lines.push(`${config}switchport mode access`)
      if (port.vlan !== 1) lines.push(`${config}switchport access vlan ${port.vlan}`)
    }
    if (port.ipAddress && port.subnetMask) lines.push(`${config}ip address ${port.ipAddress} ${port.subnetMask}`)
    lines.push(`${config}${port.adminStatus === 'up' ? 'no shutdown' : 'shutdown'}`)
    lines.push(`${config}exit`)
    return lines.join('\n')
  }

  return ''
}
