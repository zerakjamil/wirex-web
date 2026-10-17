import type { DeviceConfig, NetworkDevice, NetworkLink, WlanProfile } from '@/types/network'
import { SIMULATION_TICK_MS } from '../ospf'
import { CAPWAP_MAX_WLANS, CAPWAP_WLAN_ID_MIN, isLightweightAp, wlcClientEntries, wlcRegisteredAps, wlcWlans } from '../capwap'

export interface WlcCommandResult { output: string; config?: Partial<DeviceConfig> }

const normalize = (command: string) => command.trim().replace(/\s+/g, ' ')
const tokens = (command: string) => normalize(command).split(' ').filter(Boolean)

export const WLC_SECURITY_LABELS: Record<WlanProfile['security'], string> = {
  none: 'None',
  wep: 'WEP',
  'wpa2-psk': 'WPA2-Personal',
}

const pad = (value: string, width: number) => value.length > width ? `${value.slice(0, width - 1)}\u2026` : value.padEnd(width)

const formatUptime = (ticks: number | undefined) => {
  if (!ticks || ticks <= 0) return '-'
  const totalSeconds = Math.max(1, Math.round(ticks * (SIMULATION_TICK_MS / 1000)))
  if (totalSeconds < 60) return `${totalSeconds} seconds`
  return `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} sec`
}

export function formatWlanSummary(device: NetworkDevice): string {
  const wlans = wlcWlans(device)
  if (!wlans.length) return 'No wireless LANs are configured. Create one from the Wireless LANs tab or with "config wlan create".'
  const header = `${pad('WLAN ID', 8)} ${pad('Profile Name', 22)} ${pad('SSID', 24)} ${pad('VLAN', 6)} ${pad('Security', 15)} Admin Status`
  const rows = wlans.map(wlan => `${pad(String(wlan.id), 8)} ${pad(wlan.name, 22)} ${pad(wlan.ssid, 24)} ${pad(String(wlan.vlan), 6)} ${pad(WLC_SECURITY_LABELS[wlan.security], 15)} ${wlan.enabled ? 'Enabled' : 'Disabled'}`)
  return [header, ...rows, '', `Wireless LANs: ${wlans.length} of ${CAPWAP_MAX_WLANS} available, ${wlans.filter(wlan => wlan.enabled).length} enabled.`].join('\n')
}

export function formatApSummary(device: NetworkDevice, devices: NetworkDevice[]): string {
  const aps = wlcRegisteredAps(device)
  if (!aps.length) return 'No access points are registered to this controller.'
  const header = `${pad('AP Name', 24)} ${pad('MAC Address', 20)} ${pad('State', 10)} Uptime`
  const rows = aps.map(entry => {
    const ap = devices.find(candidate => candidate.id === entry.apId)
    const state = ap && isLightweightAp(ap) ? 'Run' : 'Faulty'
    return `${pad(ap?.name ?? entry.apId, 24)} ${pad(entry.apMac, 20)} ${pad(state, 10)} ${formatUptime(entry.joinedAtTick)}`
  })
  return [header, ...rows, '', `Access points: ${aps.length}`].join('\n')
}

export function formatClientSummary(device: NetworkDevice, devices: NetworkDevice[], links: NetworkLink[]): string {
  const rows = wlcClientEntries(devices, links, device)
  if (!rows.length) return 'No wireless clients are associated through the registered access points.'
  const header = `${pad('MAC Address', 20)} ${pad('Client', 16)} ${pad('AP Name', 22)} ${pad('SSID', 20)} Status`
  const lines = rows.map(row => `${pad(row.macAddress, 20)} ${pad(row.name, 16)} ${pad(row.apName, 22)} ${pad(row.ssid || '-', 20)} ${row.state}`)
  return [header, ...lines, '', `Clients: ${rows.length}`].join('\n')
}

export function formatInterfaceSummary(device: NetworkDevice): string {
  const port = device.ports.find(candidate => candidate.type === 'gigabitethernet') ?? device.ports[0]
  if (!port) return 'No physical interfaces are installed.'
  const header = `${pad('Interface', 22)} ${pad('IP Address', 16)} ${pad('Mask', 16)} Status`
  const row = `${pad(port.name, 22)} ${pad(port.ipAddress ?? 'Not configured', 16)} ${pad(port.subnetMask ?? '-', 16)} ${port.adminStatus === 'up' ? 'Up' : 'Down'}`
  return [
    header,
    row,
    '',
    'The management address is configured from the Management page of the web admin or with the "config interface address" command.',
  ].join('\n')
}

export const WLC_HELP_TEXT = [
  'Supported commands:',
  '  show wlan summary            Display the configured wireless LANs.',
  '  show ap summary              Display the access points registered to this controller.',
  '  show client summary          Display wireless clients behind the registered access points.',
  '  show interface summary       Display the management interface address.',
  '  config wlan create <id> <name> [ssid]   Create a wireless LAN (id 1-16).',
  '  config wlan delete <id>                 Remove a wireless LAN.',
  '  config wlan enable <id>                 Enable a wireless LAN.',
  '  config wlan disable <id>                Disable a wireless LAN.',
  '  config wlan security none <id>          Open authentication.',
  '  config wlan security wep <key> <id>     WEP with a 10 or 26 character hex key.',
  '  config wlan security wpa2 <key> <id>    WPA2-Personal with an 8-63 character passphrase.',
].join('\n')

function parseWlanId(token: string | undefined): { id: number } | { error: string } {
  const id = Number(token)
  if (!token || !Number.isInteger(id) || id < CAPWAP_WLAN_ID_MIN || id > CAPWAP_MAX_WLANS) {
    return { error: `Invalid wireless LAN identifier. Use a number between ${CAPWAP_WLAN_ID_MIN} and ${CAPWAP_MAX_WLANS}.` }
  }
  return { id }
}

export function executeWlcCommand(device: NetworkDevice, raw: string, devices: NetworkDevice[], links: NetworkLink[]): WlcCommandResult {
  const normalized = normalize(raw)
  if (!normalized) return { output: '' }
  const lower = normalized.toLowerCase()
  const parts = tokens(normalized)
  const head = parts[0].toLowerCase()

  if (lower === 'help' || lower === '?') return { output: WLC_HELP_TEXT }
  if (lower === 'save config') return { output: 'All configuration changes are stored automatically in this simulator.' }

  if (head === 'show' || head === 'sh') {
    const subject = parts.slice(1).map(part => part.toLowerCase()).join(' ')
    if (subject === 'wlan summary') return { output: formatWlanSummary(device) }
    if (subject === 'ap summary') return { output: formatApSummary(device, devices) }
    if (subject === 'client summary') return { output: formatClientSummary(device, devices, links) }
    if (subject === 'interface summary') return { output: formatInterfaceSummary(device) }
    return { output: 'Invalid show command. Supported: show wlan summary, show ap summary, show client summary, show interface summary.' }
  }

  if (head !== 'config') return { output: `Invalid command "${normalized}". Type help for the available commands.` }
  const section = parts[1]?.toLowerCase()
  const wlans = wlcWlans(device)

  if (section !== 'wlan') return { output: 'Invalid config command. Type help for the available commands.' }
  const action = parts[2]?.toLowerCase()

  if (action === 'create') {
    const idToken = parts[3]
    const name = parts[4]
    const ssid = parts.slice(5).join(' ') || name
    const parsed = parseWlanId(idToken)
    if ('error' in parsed) return { output: parsed.error }
    if (!name) return { output: 'Incorrect usage: config wlan create <id> <profile name> [ssid].' }
    if (wlans.some(wlan => wlan.id === parsed.id)) return { output: `Wireless LAN ${parsed.id} already exists as "${wlans.find(wlan => wlan.id === parsed.id)!.name}".` }
    if (wlans.some(wlan => wlan.ssid.toLowerCase() === ssid.toLowerCase())) return { output: `A wireless LAN with the SSID "${ssid}" already exists.` }
    if (wlans.some(wlan => wlan.name.toLowerCase() === name.toLowerCase())) return { output: `A wireless LAN named "${name}" already exists.` }
    const created: WlanProfile = { id: parsed.id, name, ssid, enabled: true, vlan: 0, security: 'none' }
    return { output: `Created wireless LAN ${created.id} "${created.name}" with SSID "${created.ssid}" (VLAN 0, open authentication).`, config: { wlans: [...wlans, created] } }
  }

  if (action === 'delete' || action === 'enable' || action === 'disable') {
    const parsed = parseWlanId(parts[3])
    if ('error' in parsed) return { output: parsed.error }
    const target = wlans.find(wlan => wlan.id === parsed.id)
    if (!target) return { output: `No wireless LAN uses identifier ${parsed.id}.` }
    if (action === 'delete') return { output: `Removed wireless LAN ${target.id} "${target.name}".`, config: { wlans: wlans.filter(wlan => wlan.id !== parsed.id) } }
    const enabled = action === 'enable'
    if (target.enabled === enabled) return { output: `Wireless LAN ${target.id} "${target.name}" is already ${enabled ? 'enabled' : 'disabled'}.` }
    return { output: `Wireless LAN ${target.id} "${target.name}" is now ${enabled ? 'enabled' : 'disabled'}. Access points receive the change through a CAPWAP configuration update.`, config: { wlans: wlans.map(wlan => wlan.id === parsed.id ? { ...wlan, enabled } : wlan) } }
  }

  if (action === 'security') {
    const mode = parts[3]?.toLowerCase()
    if (mode === 'none') {
      const parsed = parseWlanId(parts[4])
      if ('error' in parsed) return { output: parsed.error }
      const target = wlans.find(wlan => wlan.id === parsed.id)
      if (!target) return { output: `No wireless LAN uses identifier ${parsed.id}.` }
      return { output: `Wireless LAN ${target.id} "${target.name}" now uses open authentication.`, config: { wlans: wlans.map(wlan => wlan.id === parsed.id ? { ...wlan, security: 'none' as const, passphrase: undefined, wepKey: undefined } : wlan) } }
    }
    if (mode === 'wep' || mode === 'wpa2') {
      const key = parts[4]
      const parsed = parseWlanId(parts[5])
      if ('error' in parsed) return { output: parsed.error }
      const target = wlans.find(wlan => wlan.id === parsed.id)
      if (!target) return { output: `No wireless LAN uses identifier ${parsed.id}.` }
      if (!key) return { output: `Incorrect usage: config wlan security ${mode} <key> <id>.` }
      if (mode === 'wep') {
        if (!/^(?:[0-9a-fA-F]{10}|[0-9a-fA-F]{26})$/.test(key)) return { output: 'A WEP key must contain 10 or 26 hexadecimal characters.' }
        return { output: `Wireless LAN ${target.id} "${target.name}" now uses WEP with the configured key.`, config: { wlans: wlans.map(wlan => wlan.id === parsed.id ? { ...wlan, security: 'wep' as const, wepKey: key, passphrase: undefined } : wlan) } }
      }
      if (key.length < 8 || key.length > 63) return { output: 'A WPA2-Personal passphrase must contain between 8 and 63 characters.' }
      return { output: `Wireless LAN ${target.id} "${target.name}" now uses WPA2-Personal.`, config: { wlans: wlans.map(wlan => wlan.id === parsed.id ? { ...wlan, security: 'wpa2-psk' as const, passphrase: key, wepKey: undefined } : wlan) } }
    }
    return { output: 'Incorrect usage: config wlan security <none|wep|wpa2> <key> <id>.' }
  }

  return { output: 'Invalid config wlan command. Type help for the available commands.' }
}
