import { NetworkDevice, RouteEntry, Ipv6RouteEntry } from '@/types/network'
import { isValidIpv4, getNetworkAddress, numberToIp, isInSameSubnet, ipToNumber } from '../protocols/ip'
import { isValidIpv6, parseIpv6, parseIpv6WithPrefix, formatIpv6, ipv6NetworkAddress, ipv6PrefixMask, ipv6InterfaceIdFromMac, ipv6LinkLocalFromMac, isIpv6Multicast, isIpv6Unspecified, isIpv6Loopback, isIpv6LinkLocal } from '../protocols/ipv6'
import { parseVoiceIos } from './voiceIos'
import { parseAclRule, formatAccessLists, formatAclRunningConfig } from '../acl'
import { ospfArea, ospfCost, ospfDead, ospfHello, ospfNetwork, ospfPassive, ospfConfigLines } from '../ospf'
import { ipv6OspfConfigLines, ipv6OspfHello, ipv6OspfDead, ipv6OspfNetwork, ipv6OspfCost } from '../ospfv3'
import { ipv6EigrpConfigLines } from '../eigrpv6'
import { ripMajorNetwork, ripConfigLines } from '../rip'
import { eigrpConfigLines, eigrpEnabled, eigrpPassive, eigrpRouterId, classfulWildcard } from '../eigrp'
import { bgpConfigLines, bgpRouterId, classfulMask } from '../bgp'
import { compressVlanRanges, formatMstConfiguration, formatStpSummary } from '../spanningTree'
import { isValidSnmpCommunity } from '../snmp'

export function parseVlanList(input:string):number[]|null {
 const result:number[]=[]
 for(const item of input.split(',')){
  if(!/^\d+(?:-\d+)?$/.test(item))return null
  const [start,end=start]=item.split('-').map(Number)
  if(start<1||end>4094||end<start)return null
  for(let vlan=start;vlan<=end;vlan++)result.push(vlan)
 }
 return [...new Set(result)]
}

function subnetMaskForPrefix(prefix: number): string {
  return numberToIp(prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0)
}

function interfaceOperational(device: NetworkDevice, port: NetworkDevice['ports'][number]): boolean {
  if (device.power === false || port.adminStatus !== 'up') return false
  if (!port.isGreTunnel) return port.status === 'up'
  const source = device.ports.find(candidate => !candidate.isGreTunnel && (candidate.name === port.greSourceInterface || candidate.shortName === port.greSourceInterface || candidate.id === port.greSourceInterface))
  return device.type === 'router' && port.greMode === 'gre ip' && port.greKeepaliveOperational !== false && isValidIpv4(port.greDestinationIp ?? '') && !!source?.ipAddress && interfaceOperational(device, source)
}

export interface IosExecutionResult {
  output: string
  newDeviceConfig?: Partial<NetworkDevice['config']>
  newPorts?: NetworkDevice['ports']
  newActiveVoiceId?: number
  newActiveDhcpPool?: string
  newActiveRoutingProtocol?: 'rip' | 'ospf' | 'eigrp' | 'bgp'
  resetOspf?: boolean
  resetOspfv3?: boolean
  resetRip?: boolean
  resetEigrp?: boolean
  resetIpv6Eigrp?: boolean
  resetBgp?: boolean
  clearBgpSessions?: boolean
  newMode?:
    | 'user'
    | 'priv'
    | 'config'
    | 'config-if'
    | 'config-subif'
    | 'config-vlan'
    | 'config-line'
    | 'config-router'
    | 'config-ipv6-router'
    | 'config-ipv6-eigrp'
    | 'config-dhcp'
    | 'config-dhcpv6'
    | 'config-telephony'
    | 'config-ephone'
    | 'config-ephone-dn'
    | 'config-mst'
  newHostname?: string
  newActiveInterface?: string
  newActiveSubInterface?: string
  newActiveRangePorts?: string[]
  newActiveVlan?: number
  newDefaultGateway?: string
  newVlans?: Array<{ id: number; name: string }>
  removedVlanId?: number
  newSecretPassword?: string
  newLinePassword?: { type: 'console' | 'vty'; pass: string }
  newDhcpPool?: { name: string; network: string; mask: string; defaultRouter?: string; dnsServer?: string }
  newExcludedDhcpIp?: string
  newRipNetwork?: string
  newEigrpNetwork?: { network: string; wildcard: string }
  newBgpNetwork?: { network: string; mask: string }
  newOspfNetwork?: { network: string; wildcard: string; area: number }
  modifiedPorts?: Array<Partial<NetworkDevice['ports'][number]> & {portId:string}>
  newRoutes?: RouteEntry[]
  removedRoutes?: RouteEntry[]
  newIpv6Routes?: Ipv6RouteEntry[]
  removedIpv6Routes?: Ipv6RouteEntry[]
  newDhcpv6Pool?: { name: string; prefix: string; prefixLength: number }
  removedDhcpv6Pool?: string
  triggerPing?: { targetIp: string }
  triggerNtp?: { targetIp: string }
}

export function normalizeInterfaceName(
  input: string,
  availablePorts: Array<{ id: string; name: string; shortName: string }>
): string | null {
  const clean = input.toLowerCase().replace(/\s+/g, '')
  for (const port of availablePorts) {
    if (
      port.id.toLowerCase() === clean ||
      port.name.toLowerCase() === clean ||
      port.shortName.toLowerCase() === clean
    ) {
      return port.id
    }
    const portShort = port.shortName.toLowerCase()
    if (
      clean === portShort ||
      clean === portShort.replace('gi', 'g') ||
      clean === portShort.replace('fa', 'f') ||
      clean === portShort.replace('se', 's')
    ) {
      return port.id
    }
  }
  return null
}

export function getPrompt(device: NetworkDevice): string {
  const host = device.config.hostname || device.name
  if (device.type === 'wlc') return `${host}>`
  switch (device.currentCliMode) {
    case 'user':
      return `${host}>`
    case 'priv':
      return `${host}#`
    case 'config':
      return `${host}(config)#`
    case 'config-if':
      return `${host}(config-if)#`
    case 'config-subif':
      return `${host}(config-subif)#`
    case 'config-vlan':
      return `${host}(config-vlan)#`
    case 'config-line':
      return `${host}(config-line)#`
    case 'config-router':
      return `${host}(config-router)#`
    case 'config-ipv6-router':
    case 'config-ipv6-eigrp':
      return `${host}(config-rtr)#`
    case 'config-dhcp':
      return `${host}(config-dhcp)#`
    case 'config-dhcpv6':
      return `${host}(config-dhcpv6)#`
    case 'config-telephony':
      return `${host}(config-telephony)#`
    case 'config-ephone':
      return `${host}(config-ephone)#`
    case 'config-ephone-dn':
      return `${host}(config-ephone-dn)#`
    case 'config-mst':
      return `${host}(config-mst)#`
    default:
      return `${host}>`
  }
}

function resolveInterfaceRange(input: string, ports: NetworkDevice['ports']): string[] | null {
  const selected = new Set<string>()
  for (const part of input.split(',')) {
    const range = part.trim().match(/^(.+?)\s*-\s*(.+)$/)
    if (!range) {
      const id = normalizeInterfaceName(part.trim(), ports)
      if (!id) return null
      selected.add(id)
      continue
    }
    const startId = normalizeInterfaceName(range[1], ports)
    const start = ports.find(port => port.id === startId)?.shortName.match(/^(.*\/)(\d+)$/)
    if (!start) return null
    const endName = /^\d+$/.test(range[2]) ? `${start[1]}${range[2]}` : range[2]
    const endId = normalizeInterfaceName(endName, ports)
    const end = ports.find(port => port.id === endId)?.shortName.match(/^(.*\/)(\d+)$/)
    if (!end || start[1].toLowerCase() !== end[1].toLowerCase() || Number(start[2]) > Number(end[2])) return null
    for (let number = Number(start[2]); number <= Number(end[2]); number++) {
      const id = normalizeInterfaceName(`${start[1]}${number}`, ports)
      if (!id) return null
      selected.add(id)
    }
  }
  return selected.size ? [...selected] : null
}

function handleInterfaceSelection(device: NetworkDevice, parts: string[]): IosExecutionResult {
  if (!parts[1]) return { output: '% Incomplete command. Specify interface name.' }

  // Range check
  if (parts[1].toLowerCase() === 'range') {
    const portIds = resolveInterfaceRange(parts.slice(2).join(' '), device.ports)
    if (!portIds) return { output: '% Invalid interface range.' }
    return {
      output: '',
      newMode: 'config-if',
      newActiveInterface: portIds[0],
      newActiveRangePorts: portIds,
    }
  }

  const targetInt = parts.slice(1).join('')
  const tunnelMatch = /^tunnel(\d+)$/i.exec(targetInt)
  if (tunnelMatch) {
    if (device.type !== 'router') return { output: '% GRE tunnel interfaces require a router.' }
    const number = Number(tunnelMatch[1])
    if (!Number.isSafeInteger(number) || number > 2147483647) return { output: '% Invalid GRE tunnel number.' }
    const name = `Tunnel${number}`
    const existing = device.ports.find(port => port.isGreTunnel && port.name.toLowerCase() === name.toLowerCase())
    const portId = existing?.id ?? `${device.id}:${name}`
    return {
      output: '', newMode: 'config-if', newActiveInterface: portId, newActiveRangePorts: undefined,
      ...(!existing ? { newPorts: [{ id: portId, name, shortName: `Tu${number}`, type: 'fastethernet' as const, macAddress: device.macAddress || device.ports[0]?.macAddress || '0000.0000.0000', adminStatus: 'down' as const, status: 'down' as const, isGreTunnel: true }] } : {}),
    }
  }
  if (/^vlan\d+$/i.test(targetInt)) {
    const vlan = Number(targetInt.replace(/^vlan/i, ''))
    if (vlan < 1 || vlan > 4094) return { output: '% Invalid VLAN number.' }
    const existing = device.ports.find((p) => p.virtualVlan === vlan || p.name.toLowerCase() === targetInt.toLowerCase())
    const portId = existing?.id || `${device.id}:Vlan${vlan}`
    return {
      output: '',
      newMode: 'config-if',
      newActiveInterface: portId,
      newActiveRangePorts: undefined,
      ...(!existing
        ? {
            newPorts: [
              {
                id: portId,
                name: `Vlan${vlan}`,
                shortName: `Vl${vlan}`,
                type: 'fastethernet' as const,
                macAddress: device.macAddress || device.ports[0]?.macAddress || '0000.0000.0000',
                adminStatus: 'down' as const,
                status: 'down' as const,
                virtualVlan: vlan,
                vlan,
              },
            ],
          }
        : {}),
    }
  }

  // Sub-interface check (e.g. fa0/0.10 or g0/0.20)
  if (targetInt.includes('.')) {
    const [parentInput, suffix] = targetInt.split('.')
    const parent = device.ports.find(port => port.id === normalizeInterfaceName(parentInput, device.ports))
    if (device.type !== 'router' || !parent || !/^\d+$/.test(suffix) || Number(suffix) < 1 || Number(suffix) > 4294967295) return { output: '% Invalid router subinterface.' }
    const name = `${parent.name}.${suffix}`
    const existing = device.ports.find(port => port.name.toLowerCase() === name.toLowerCase() || port.shortName.toLowerCase() === targetInt.toLowerCase())
    const portId = existing?.id || `${device.id}:${name}`
    return {
      output: '',
      newMode: 'config-subif',
      newActiveSubInterface: name,
      newActiveInterface: portId,
      newActiveRangePorts: undefined,
      ...(existing ? { modifiedPorts: [{ portId, parentPortId: parent.id, macAddress: parent.macAddress }] } : { newPorts: [{ id: portId, name, shortName: `${parent.shortName}.${suffix}`, type: parent.type, macAddress: parent.macAddress, parentPortId: parent.id, adminStatus: 'up', status: parent.status }] }),
    }
  }

  const portId = normalizeInterfaceName(targetInt, device.ports)
  if (!portId) {
    return { output: `% Invalid interface type or number: ${targetInt}` }
  }
  return {
    output: '',
    newMode: 'config-if',
    newActiveInterface: portId,
    newActiveRangePorts: undefined,
  }
}

function handleVlanSelection(device: NetworkDevice, parts: string[]): IosExecutionResult {
  let vlanNum = parseInt(parts[1], 10)
  let inlineName: string | undefined

  if (parts[1]?.toLowerCase() === 'name' && parts[2]) {
    inlineName = parts[2]
    vlanNum = parseInt(parts[3], 10)
  } else if (parts[2]?.toLowerCase() === 'name' && parts[3]) {
    inlineName = parts.slice(3).join(' ').replace(/^["']|["']$/g, '')
  }

  if (isNaN(vlanNum) || vlanNum < 1 || vlanNum > 4094) {
    return { output: '% Invalid VLAN number (1-4094).' }
  }

  const existing = device.config.vlans || []
  const defaultName = inlineName || `VLAN${String(vlanNum).padStart(4, '0')}`
  let updatedVlans = existing

  if (!existing.some((v) => v.id === vlanNum)) {
    updatedVlans = [...existing, { id: vlanNum, name: defaultName }]
  } else if (inlineName) {
    updatedVlans = existing.map(v => v.id === vlanNum ? { ...v, name: inlineName! } : v)
  }

  return {
    output: '',
    newMode: 'config-vlan',
    newActiveVlan: vlanNum,
    newVlans: updatedVlans,
  }
}

export function parseIosCommand(device: NetworkDevice, rawLine: string): IosExecutionResult {
  const line = rawLine.trim()
  if (!line) return { output: '' }

  const voice = parseVoiceIos(device,line)
  if (voice) return voice

  if (line === '?') {
    return handleContextualHelp(device)
  }

  const parts = line.split(/\s+/)
  const cmd = parts[0].toLowerCase()

  // Navigation commands across modes
  if (cmd === 'exit') {
    if (
      device.currentCliMode === 'config-if' ||
      device.currentCliMode === 'config-subif' ||
      device.currentCliMode === 'config-vlan' ||
      device.currentCliMode === 'config-line' ||
      device.currentCliMode === 'config-router' ||
      device.currentCliMode === 'config-ipv6-router' ||
      device.currentCliMode === 'config-ipv6-eigrp' ||
      device.currentCliMode === 'config-dhcp' ||
      device.currentCliMode === 'config-dhcpv6' ||
      device.currentCliMode === 'config-telephony' ||
      device.currentCliMode === 'config-ephone' ||
      device.currentCliMode === 'config-ephone-dn' ||
      device.currentCliMode === 'config-mst'
    ) {
      return {
        output: '',
        newMode: 'config',
        newActiveInterface: undefined,
        newActiveSubInterface: undefined,
        newActiveRangePorts: undefined,
        newActiveVlan: undefined,
      }
    }
    if (device.currentCliMode === 'config') {
      return { output: '', newMode: 'priv' }
    }
    if (device.currentCliMode === 'priv') {
      return { output: '', newMode: 'user' }
    }
    return { output: '' }
  }

  if (cmd === 'end') {
    if (device.currentCliMode !== 'user' && device.currentCliMode !== 'priv') {
      return {
        output: '',
        newMode: 'priv',
        newActiveInterface: undefined,
        newActiveSubInterface: undefined,
        newActiveRangePorts: undefined,
        newActiveVlan: undefined,
      }
    }
    return { output: '' }
  }

  // 1. User EXEC mode
  if (device.currentCliMode === 'user') {
    if (cmd === 'enable' || cmd === 'en') {
      return { output: '', newMode: 'priv' }
    }
    if (cmd === 'ping') {
      if (!parts[1] || !(isValidIpv4(parts[1]) || isValidIpv6(parts[1]))) {
        return { output: '% Incomplete or invalid IP target.' }
      }
      return {
        output: `Sending one ICMP echo to ${parts[1]}. Waiting for the simulated reply.`,
        triggerPing: { targetIp: parts[1] },
      }
    }
    if (cmd === 'traceroute' || cmd === 'trace') {
      if (!parts[1]) return { output: '% Incomplete IP target.' }
      return {
        output: '% Traceroute is not implemented in this simulator.',
      }
    }
    if (cmd === 'show' || cmd === 'sh') {
      return handleShowCommands(device, parts.slice(1))
    }
    if (cmd === 'terminal' && parts[1]?.toLowerCase() === 'length') {
      return { output: '' }
    }
    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 2. Privileged EXEC mode
  if (device.currentCliMode === 'priv') {
    if (cmd === 'disable') {
      return { output: '', newMode: 'user' }
    }
    if (cmd === 'configure' || cmd === 'conf' || cmd === 'con') {
      const p1 = parts[1]?.toLowerCase()
      if (!p1 || p1 === 'terminal' || p1 === 't') {
        return {
          output: 'Enter configuration commands, one per line. End with CNTL/Z.',
          newMode: 'config',
        }
      }
      return { output: '% Incomplete command. Try: configure terminal' }
    }
    if (cmd === 'show' || cmd === 'sh') {
      return handleShowCommands(device, parts.slice(1))
    }
    if (cmd === 'ping') {
      if (!parts[1] || !(isValidIpv4(parts[1]) || isValidIpv6(parts[1]))) {
        return { output: '% Incomplete or invalid IP target.' }
      }
      return {
        output: `Sending one ICMP echo to ${parts[1]}. Waiting for the simulated reply.`,
        triggerPing: { targetIp: parts[1] },
      }
    }
    if (cmd === 'traceroute' || cmd === 'trace') {
      if (!parts[1]) return { output: '% Incomplete IP target.' }
      return {
        output: '% Traceroute is not implemented in this simulator.',
      }
    }
    if (
      cmd === 'wr' ||
      (cmd === 'write' && (!parts[1] || parts[1].toLowerCase() === 'memory' || parts[1].toLowerCase() === 'mem')) ||
      (cmd === 'copy' && (parts[1]?.toLowerCase() === 'run' || parts[1]?.toLowerCase() === 'running-config') &&
        (parts[2]?.toLowerCase() === 'start' || parts[2]?.toLowerCase() === 'startup-config'))
    ) {
      return { output: 'Building configuration...\n[OK]' }
    }
    if (cmd === 'erase' && (parts[1]?.toLowerCase() === 'startup-config' || parts[1]?.toLowerCase() === 'start')) {
      return { output: 'Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]\n[OK]\nErase of nvram: complete' }
    }
    if (cmd === 'clear') {
      if (parts.slice(1).join(' ').toLowerCase() === 'ip ospf process') return { output: 'OSPF process restarted. Neighbor discovery will run again.', resetOspf: true }
      if (parts[1]?.toLowerCase() === 'ip' && parts[2]?.toLowerCase() === 'bgp') {
        if (parts[3] !== '*') return { output: '% Usage: clear ip bgp *. Per-neighbor session clearing is not supported in this reduced model.' }
        if (device.config.bgpAs === undefined) return { output: '% BGP is not configured on this device.' }
        if (!device.bgp?.peers.length) return { output: '% No BGP sessions to clear.' }
        return { output: 'BGP sessions cleared. Peering re-establishes on the next update cycle.', clearBgpSessions: true }
      }
      if (parts[1]?.toLowerCase()==='ip'&&parts[2]?.toLowerCase()==='dhcp'&&parts[3]?.toLowerCase()==='binding') {
        const target=parts[4]
        if(!target)return {output:'% Incomplete command. Specify an IP address or *.'}
        if(target!=='*'&&!isValidIpv4(target))return {output:'% Invalid DHCP binding address.'}
        const bindings=device.config.dhcpBindings??[]
        const remaining=target==='*'?[]:bindings.filter(binding=>binding.ipAddress!==target)
        const removed=bindings.length-remaining.length
        if(!removed)return {output:`% No DHCP binding found for ${target}.`}
        return {output:`Cleared ${removed} DHCP binding${removed===1?'':'s'}.`,newDeviceConfig:{dhcpBindings:remaining}}
      }
      return { output: '' }
    }
    if (cmd === 'reload') {
      return { output: 'Proceed with reload? [confirm]\n% System reloaded\n\nPress RETURN to get started!' }
    }
    if (cmd === 'terminal' && parts[1]?.toLowerCase() === 'length') {
      return { output: '' }
    }
    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 3. Config-VLAN Mode: Switch(config-vlan)# / Router(config-vlan)#
  if (device.currentCliMode === 'config-vlan') {
    const vlanId = device.activeVlan || 1

    // name <vlan-name> (also forgiving: name name <vlan>, name vlan <name>, vlan name <name>)
    if (cmd === 'name' || (cmd === 'vlan' && parts[1]?.toLowerCase() === 'name')) {
      const tokens = cmd === 'name'
        ? parts.slice(1).filter((t) => t.toLowerCase() !== 'name' && t.toLowerCase() !== 'vlan')
        : parts.slice(2).filter((t) => t.toLowerCase() !== 'name' && t.toLowerCase() !== 'vlan')

      if (tokens.length === 0) {
        return { output: '% Incomplete command. Syntax: name <vlan-name> (e.g. name Sales)' }
      }

      const vlanName = tokens.join(' ').replace(/^["']|["']$/g, '')
      const existing = device.config.vlans || []
      const filtered = existing.filter((v) => v.id !== vlanId)
      return {
        output: '',
        newVlans: [...filtered, { id: vlanId, name: vlanName }],
      }
    }

    if (cmd === 'no' && (parts[1]?.toLowerCase() === 'name' || (parts[1]?.toLowerCase() === 'vlan' && parts[2]?.toLowerCase() === 'name'))) {
      const existing = device.config.vlans || []
      const filtered = existing.filter((v) => v.id !== vlanId)
      return {
        output: '',
        newVlans: [...filtered, { id: vlanId, name: `VLAN${String(vlanId).padStart(4, '0')}` }],
      }
    }

    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }

    // If student types show / sh directly without do, forgive and show results
    if (cmd === 'show' || cmd === 'sh') {
      return handleShowCommands(device, parts.slice(1))
    }

    // Auxiliary VLAN submode commands: state active/suspend, shutdown/no shutdown, description
    if (
      (cmd === 'state' && (parts[1]?.toLowerCase() === 'active' || parts[1]?.toLowerCase() === 'suspend')) ||
      cmd === 'shutdown' ||
      (cmd === 'no' && parts[1]?.toLowerCase() === 'shutdown') ||
      cmd === 'description'
    ) {
      return { output: '' }
    }

    // Allow seamless switching to another VLAN or an interface directly from config-vlan
    if (cmd === 'vlan') {
      return handleVlanSelection(device, parts)
    }
    if (cmd === 'interface' || cmd === 'int') {
      return handleInterfaceSelection(device, parts)
    }

    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 4. Config-Line Mode: Router(config-line)#
  // 4b. Config-MST Mode: Switch(config-mst)#
  if (device.currentCliMode === 'config-mst') {
    const negated = cmd === 'no'
    const body = negated ? parts.slice(1) : parts
    if (body[0] === 'name') {
      if (negated) return { output: '', newDeviceConfig: { mstName: undefined } }
      const name = body.slice(1).join(' ')
      if (!name) return { output: '% Incomplete command. Specify the region name.' }
      if (name.length > 32) return { output: '% Region name must be 32 characters or fewer.' }
      return { output: '', newDeviceConfig: { mstName: name } }
    }
    if (body[0] === 'revision') {
      if (negated) return { output: '', newDeviceConfig: { mstRevision: undefined } }
      const revision = Number(body[1])
      if (!Number.isInteger(revision) || revision < 0 || revision > 65535) return { output: '% Revision must be an integer 0-65535.' }
      return { output: '', newDeviceConfig: { mstRevision: revision } }
    }
    if (body[0] === 'instance') {
      const instance = Number(body[1])
      if (!Number.isInteger(instance) || instance < 1 || instance > 4094) return { output: '% Instance must be an integer 1-4094.' }
      if (negated) return { output: '', newDeviceConfig: { mstInstances: (device.config.mstInstances ?? []).filter(entry => entry.instance !== instance) } }
      if (body[2] !== 'vlan') return { output: '% Incomplete command. Use instance <1-4094> vlan <list>.' }
      const vlans = parseVlanList(body.slice(3).join(''))
      if (!vlans || !vlans.length) return { output: '% Invalid VLAN list. Use comma-separated ids or ranges (1-4094).' }
      const moved = new Set(vlans)
      const next = (device.config.mstInstances ?? [])
        .filter(entry => entry.instance !== instance)
        .map(entry => ({ ...entry, vlans: entry.vlans.filter(vlan => !moved.has(vlan)) }))
        .filter(entry => entry.vlans.length)
      const existing = device.config.mstInstances?.find(entry => entry.instance === instance)?.vlans ?? []
      next.push({ instance, vlans: [...new Set([...existing, ...vlans])].sort((a, b) => a - b) })
      next.sort((a, b) => a.instance - b.instance)
      return { output: '', newDeviceConfig: { mstInstances: next } }
    }
    if (cmd === 'do') return handleDoCommand(device, parts.slice(1))
    if (cmd === 'show' || cmd === 'sh') return handleShowCommands(device, parts.slice(1))
    return { output: `% Invalid input detected at '^' marker.` }
  }

  if (device.currentCliMode === 'config-line') {
    if (cmd === 'password' && parts[1]) {
      return {
        output: '',
        newLinePassword: { type: 'console', pass: parts[1] },
      }
    }
    if (cmd === 'login') {
      return { output: '' }
    }
    if (cmd === 'transport' && parts[1]?.toLowerCase() === 'input') {
      return { output: '' }
    }
    if (cmd === 'exec-timeout') {
      return { output: '' }
    }
    if (cmd === 'logging' && parts[1]?.toLowerCase() === 'synchronous') {
      return { output: '' }
    }
    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }
    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 5. Config-Router Mode: Router(config-router)#
  if (device.currentCliMode === 'config-router') {
    if (device.activeRoutingProtocol === 'rip') {
      const no = cmd === 'no', action = no ? parts[1] : cmd
      if (action === 'version') {
        if (no && parts.length === 2) return { output: '', newDeviceConfig: { ripVersion: undefined }, resetRip: true }
        if (!no && parts.length === 2 && ['1', '2'].includes(parts[1])) return { output: '', newDeviceConfig: { ripVersion: Number(parts[1]) as 1 | 2 }, resetRip: true }
        return { output: '% Invalid RIP version. Use version 1 or version 2.' }
      }
      if (action === 'auto-summary') {
        if (parts.length !== (no ? 2 : 1)) return { output: '% Invalid auto-summary command.' }
        return { output: '', newDeviceConfig: { ripAutoSummary: !no }, resetRip: true }
      }
      if (action === 'passive-interface') {
        const name = parts[no ? 2 : 1]
        if (parts.length !== (no ? 3 : 2)) return { output: '% Invalid passive interface.' }
        if (name === 'default') return { output: '', newDeviceConfig: { ripPassiveDefault: !no, ripPassiveInterfaces: [], ripActiveInterfaces: [] } }
        const id = normalizeInterfaceName(name || '', device.ports), port = device.ports.find(p => p.id === id)
        if (!port) return { output: '% Invalid passive interface.' }
        const passive = (device.config.ripPassiveInterfaces ?? []).filter(n => n !== port.name), active = (device.config.ripActiveInterfaces ?? []).filter(n => n !== port.name)
        if (no) active.push(port.name); else passive.push(port.name)
        return { output: '', newDeviceConfig: { ripPassiveInterfaces: passive, ripActiveInterfaces: active } }
      }
      if (no && action === 'network') {
        if (parts.length !== 3 || !isValidIpv4(parts[2])) return { output: '% Invalid RIP network removal.' }
        return { output: '', newDeviceConfig: { ripNetworks: (device.config.ripNetworks ?? []).filter(n => ripMajorNetwork(n) !== ripMajorNetwork(parts[2])) } }
      }
    }
    if (device.activeRoutingProtocol === 'eigrp') {
      const no = cmd === 'no', action = no ? parts[1] : cmd
      if (action === 'auto-summary') {
        if (parts.length !== (no ? 2 : 1)) return { output: '% Invalid auto-summary command.' }
        return { output: '', newDeviceConfig: { eigrpAutoSummary: !no } }
      }
      if (action === 'passive-interface') {
        const name = parts[no ? 2 : 1]
        if (parts.length !== (no ? 3 : 2)) return { output: '% Invalid passive interface.' }
        if (name === 'default') return { output: '', newDeviceConfig: { eigrpPassiveDefault: !no, eigrpPassiveInterfaces: [], eigrpActiveInterfaces: [] } }
        const id = normalizeInterfaceName(name || '', device.ports), port = device.ports.find(p => p.id === id)
        if (!port) return { output: '% Invalid passive interface.' }
        const passive = (device.config.eigrpPassiveInterfaces ?? []).filter(n => n !== port.name), active = (device.config.eigrpActiveInterfaces ?? []).filter(n => n !== port.name)
        if (no) active.push(port.name); else passive.push(port.name)
        return { output: '', newDeviceConfig: { eigrpPassiveInterfaces: passive, eigrpActiveInterfaces: active } }
      }
      if (cmd === 'eigrp' && parts[1]?.toLowerCase() === 'router-id') {
        if (parts.length !== 3 || !isValidIpv4(parts[2]) || parts[2] === '0.0.0.0') return { output: '% Invalid EIGRP router ID.' }
        return { output: '', newDeviceConfig: { eigrpRouterId: parts[2] } }
      }
      if (no && action === 'eigrp' && parts[2]?.toLowerCase() === 'router-id' && parts.length === 3) {
        return { output: '', newDeviceConfig: { eigrpRouterId: undefined } }
      }
      if (no && action === 'network') {
        if ((parts.length !== 3 && parts.length !== 4) || !isValidIpv4(parts[2] || '') || (parts.length === 4 && !isValidIpv4(parts[3] || ''))) return { output: '% Invalid EIGRP network removal.' }
        const wildcard = parts[3] ?? classfulWildcard(parts[2])
        return { output: '', newDeviceConfig: { eigrpNetworks: (device.config.eigrpNetworks ?? []).filter(n => !(n.network === parts[2] && n.wildcard === wildcard)) } }
      }
    }
    if (device.activeRoutingProtocol === 'bgp') {
      const no = cmd === 'no', action = no ? parts[1] : cmd
      if (cmd === 'bgp' && parts[1]?.toLowerCase() === 'router-id') {
        if (parts.length !== 3 || !isValidIpv4(parts[2]) || parts[2] === '0.0.0.0') return { output: '% Invalid BGP router ID.' }
        return { output: '', newDeviceConfig: { bgpRouterId: parts[2] } }
      }
      if (no && action === 'bgp' && parts[2]?.toLowerCase() === 'router-id' && parts.length === 3) {
        return { output: '', newDeviceConfig: { bgpRouterId: undefined } }
      }
      if (cmd === 'neighbor' || no && parts[1] === 'neighbor') {
        const address = no ? parts[2] : parts[1]
        if (!isValidIpv4(address || '')) return { output: '% Invalid BGP neighbor address.' }
        if (no) {
          const valid = parts.length === 3 || parts.length === 5 && parts[3]?.toLowerCase() === 'remote-as' && /^\d+$/.test(parts[4] ?? '')
          if (!valid) return { output: '% Usage: no neighbor <A.B.C.D> [remote-as <1-65535>].' }
          return { output: '', newDeviceConfig: { bgpNeighbors: (device.config.bgpNeighbors ?? []).filter(n => n.ip !== address) } }
        }
        if (parts.length !== 4 || parts[2]?.toLowerCase() !== 'remote-as' || !/^\d+$/.test(parts[3] ?? '')) return { output: '% Usage: neighbor <A.B.C.D> remote-as <1-65535>.' }
        const remoteAs = Number(parts[3])
        if (remoteAs < 1 || remoteAs > 65535) return { output: '% Invalid remote AS. Use <1-65535>.' }
        if (device.config.bgpNeighbors?.some(n => n.ip === address && n.remoteAs === remoteAs)) return { output: '' }
        return { output: '', newDeviceConfig: { bgpNeighbors: [...(device.config.bgpNeighbors ?? []).filter(n => n.ip !== address), { ip: address, remoteAs }] } }
      }
      if (no && action === 'network') {
        if ((parts.length !== 3 && parts.length !== 5) || !isValidIpv4(parts[2] || '') || (parts.length === 5 && (parts[3]?.toLowerCase() !== 'mask' || !isValidIpv4(parts[4] ?? '')))) return { output: '% Usage: no network <A.B.C.D> [mask <A.B.C.D>].' }
        const mask = parts[4] ?? classfulMask(parts[2])
        return { output: '', newDeviceConfig: { bgpNetworks: (device.config.bgpNetworks ?? []).filter(n => !(n.network === parts[2] && n.mask === mask)) } }
      }
    }
    if (device.activeRoutingProtocol === 'ospf' && cmd === 'router-id') {
      if (parts.length !== 2 || !isValidIpv4(parts[1]) || parts[1] === '0.0.0.0') return { output: '% Invalid OSPF router ID.' }
      return { output: '', newDeviceConfig: { ospfRouterId: parts[1] }, resetOspf: true }
    }
    const negated = cmd === 'no'
    if (device.activeRoutingProtocol === 'ospf' && (cmd === 'passive-interface' || negated && parts[1] === 'passive-interface')) {
      const name = parts[negated ? 2 : 1]
      if (name === 'default' && parts.length === (negated ? 3 : 2)) return { output: '', newDeviceConfig: { ospfPassiveDefault: !negated, ospfPassiveInterfaces: [], ospfActiveInterfaces: [] } }
      const id = normalizeInterfaceName(name || '', device.ports), port = device.ports.find(p => p.id === id)
      if (!port || parts.length !== (negated ? 3 : 2)) return { output: '% Invalid passive interface.' }
      const passive = (device.config.ospfPassiveInterfaces ?? []).filter(n => n !== port.name)
      const active = (device.config.ospfActiveInterfaces ?? []).filter(n => n !== port.name)
      if (negated) active.push(port.name); else passive.push(port.name)
      return { output: '', newDeviceConfig: { ospfPassiveInterfaces: passive, ospfActiveInterfaces: active } }
    }
    if (device.activeRoutingProtocol === 'ospf' && negated && parts[1] === 'network') {
      const area = Number(parts[5])
      if (parts.length !== 6 || !isValidIpv4(parts[2]) || !isValidIpv4(parts[3]) || parts[4] !== 'area' || !Number.isInteger(area)) return { output: '% Invalid OSPF network removal.' }
      return { output: '', newDeviceConfig: { ospfNetworks: (device.config.ospfNetworks ?? []).filter(n => !(n.network === parts[2] && n.wildcard === parts[3] && n.area === area)) } }
    }
    if (cmd === 'version' || cmd === 'router-id' || cmd === 'passive-interface' ||
        (cmd === 'no' && parts[1]?.toLowerCase() === 'auto-summary')) {
      return { output: '% This routing control is not implemented. Dynamic routing exchanges are not simulated.' }
    }
    if (cmd === 'network' || cmd === 'net') {
      const net = parts[1]
      const wildcard = parts[2]
      if (device.activeRoutingProtocol === 'ospf') {
        const areaText = parts[4]
        const area = Number(areaText)
        if (parts.length !== 5 || !isValidIpv4(net || '') || !isValidIpv4(wildcard || '') ||
            parts[3]?.toLowerCase() !== 'area' || !/^\d+$/.test(areaText || '') || area > 4294967295) {
          return { output: '% Invalid OSPF network statement. Use network <IPv4> <wildcard> area <0-4294967295>.' }
        }
        return {
          output: '',
          newOspfNetwork: { network: net, wildcard, area },
        }
      }
      if (device.activeRoutingProtocol === 'eigrp') {
        if ((parts.length !== 2 && parts.length !== 3) || !isValidIpv4(net || '') || (parts.length === 3 && !isValidIpv4(wildcard || ''))) {
          return { output: '% Invalid EIGRP network statement. Use network <IPv4> [wildcard].' }
        }
        return { output: '', newEigrpNetwork: { network: net!, wildcard: wildcard ?? classfulWildcard(net!) } }
      }
      if (device.activeRoutingProtocol === 'bgp') {
        const mask = parts[2]?.toLowerCase() === 'mask' ? parts[3] : undefined
        const valid = mask !== undefined
          ? parts.length === 4 && isValidIpv4(mask ?? '') && /^1*0*$/.test(ipToNumber(mask).toString(2).padStart(32, '0'))
          : parts.length === 2 && isValidIpv4(net || '')
        if (!valid || !isValidIpv4(net || '')) return { output: '% Invalid BGP network statement. Use network <A.B.C.D> [mask <A.B.C.D>].' }
        const finalMask = mask ?? classfulMask(net!)
        return { output: '', newBgpNetwork: { network: getNetworkAddress(net!, finalMask), mask: finalMask } }
      }
      if (device.activeRoutingProtocol !== 'rip' || parts.length !== 2 || !isValidIpv4(net || '')) {
        return { output: '% Invalid RIP network statement. Use network <IPv4> inside router rip.' }
      }
      return {
        output: '',
        newRipNetwork: ripMajorNetwork(net),
      }
    }
    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }
    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 5b. Config-Router IPv6 Mode: Router(config-rtr)# (ipv6 router ospf <process>)
  if (device.currentCliMode === 'config-ipv6-router') {
    if (cmd === 'router-id') {
      if (parts.length !== 2 || !isValidIpv4(parts[1])) return { output: '% Use router-id <A.B.C.D>.' }
      return { output: '', newDeviceConfig: { ipv6OspfRouterId: parts[1] }, resetOspfv3: true }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'router-id' && parts.length === 2) {
      return { output: '', newDeviceConfig: { ipv6OspfRouterId: undefined }, resetOspfv3: true }
    }
    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }
    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 5c. Config-Router IPv6 EIGRP Mode: Router(config-rtr)# (ipv6 router eigrp <as>)
  if (device.currentCliMode === 'config-ipv6-eigrp') {
    if (cmd === 'eigrp' && parts[1]?.toLowerCase() === 'router-id') {
      if (parts.length !== 3 || !isValidIpv4(parts[2]) || parts[2] === '0.0.0.0') return { output: '% Use eigrp router-id <A.B.C.D>.' }
      return { output: '', newDeviceConfig: { ipv6EigrpRouterId: parts[2] }, resetIpv6Eigrp: true }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'eigrp' && parts[2]?.toLowerCase() === 'router-id' && parts.length === 3) {
      return { output: '', newDeviceConfig: { ipv6EigrpRouterId: undefined }, resetIpv6Eigrp: true }
    }
    if (cmd === 'shutdown' && parts.length === 1) return { output: '', newDeviceConfig: { ipv6EigrpShutdown: true }, resetIpv6Eigrp: true }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'shutdown' && parts.length === 2) return { output: '', newDeviceConfig: { ipv6EigrpShutdown: false } }
    if (cmd === 'passive-interface') {
      const name = parts[1]?.toLowerCase() === 'default' ? 'default' : normalizeInterfaceName(parts[1] ?? '', device.ports)
      if (parts.length !== 2 || !name) return { output: '% Use passive-interface <interface> | default.' }
      if (name === 'default') return { output: '', newDeviceConfig: { ipv6EigrpPassiveDefault: true, ipv6EigrpPassiveInterfaces: [], ipv6EigrpActiveInterfaces: [] } }
      const port = device.ports.find(candidate => candidate.id === name)!
      return { output: '', newDeviceConfig: { ipv6EigrpPassiveInterfaces: [...(device.config.ipv6EigrpPassiveInterfaces ?? []).filter(entry => entry !== port.name), port.name], ipv6EigrpActiveInterfaces: (device.config.ipv6EigrpActiveInterfaces ?? []).filter(entry => entry !== port.name) } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'passive-interface') {
      if (parts.length !== 3) return { output: '% Use no passive-interface <interface> | default.' }
      if (parts[2]?.toLowerCase() === 'default') return { output: '', newDeviceConfig: { ipv6EigrpPassiveDefault: false, ipv6EigrpPassiveInterfaces: [], ipv6EigrpActiveInterfaces: [] } }
      const id = normalizeInterfaceName(parts[2] ?? '', device.ports), port = device.ports.find(candidate => candidate.id === id)
      if (!port) return { output: '% Invalid passive interface.' }
      return { output: '', newDeviceConfig: { ipv6EigrpPassiveInterfaces: (device.config.ipv6EigrpPassiveInterfaces ?? []).filter(entry => entry !== port.name), ipv6EigrpActiveInterfaces: [...(device.config.ipv6EigrpActiveInterfaces ?? []).filter(entry => entry !== port.name), port.name] } }
    }
    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }
    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 6. Config-DHCP Mode: Router(config-dhcp)#
  if (device.currentCliMode === 'config-dhcp') {
    if (cmd === 'network' || cmd === 'net') {
      const net = parts[1]
      const mask = parts[2]
      if (net && mask) {
        return {
          output: '',
          newDhcpPool: { name: 'POOL', network: net, mask },
        }
      }
      return { output: '% Incomplete command: network <network-number> [mask | /prefix]' }
    }
    if (cmd === 'default-router' || cmd === 'def') {
      const gw = parts[1]
      return {
        output: '',
        newDhcpPool: { name: 'POOL', network: '0.0.0.0', mask: '0.0.0.0', defaultRouter: gw },
      }
    }
    if (cmd === 'dns-server' || cmd === 'dns') {
      const dns = parts[1]
      return {
        output: '',
        newDhcpPool: { name: 'POOL', network: '0.0.0.0', mask: '0.0.0.0', dnsServer: dns },
      }
    }
    if (cmd === 'domain-name') {
      return { output: '' }
    }
    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }
    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 6b. Config-DHCPv6 Pool Mode: Router(config-dhcpv6)#
  if (device.currentCliMode === 'config-dhcpv6') {
    if (cmd === 'address' || cmd === 'addr') {
      if (parts[1]?.toLowerCase() !== 'prefix') return { output: '% Use address prefix <prefix>/<prefix-length>.' }
      const parsed = parts[2] ? parseIpv6WithPrefix(parts[2]) : null
      if (!parsed) return { output: '% Use address prefix <prefix>/<prefix-length>.' }
      return { output: '', newDhcpv6Pool: { name: device.activeDhcpPool ?? 'POOL1', prefix: ipv6NetworkAddress(parsed.address, parsed.prefixLength) ?? parsed.address, prefixLength: parsed.prefixLength } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'address' && parts[2]?.toLowerCase() === 'prefix') {
      return { output: '', removedDhcpv6Pool: device.activeDhcpPool }
    }
    if (cmd === 'dns-server' || cmd === 'domain-name') {
      return { output: '' }
    }
    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }
    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 7. Config-SubIF Mode: Router(config-subif)#
  if (device.currentCliMode === 'config-subif') {
    if (cmd === 'interface' || cmd === 'int') return handleInterfaceSelection(device, parts)
    if (cmd === 'description' || /^ip (?:access-group|helper-address)\b/.test(line) || /^no ip (?:access-group|helper-address)\b/.test(line)) return parseIosCommand({ ...device, currentCliMode: 'config-if' }, rawLine)
    const port = device.ports.find(p => p.id === device.activeInterface)
    if (!port) return { output: '% Select a router subinterface first.' }
    if (cmd === 'encapsulation' || cmd === 'encap') {
      const vlan = Number(parts[2])
      if (parts[1]?.toLowerCase() !== 'dot1q' || !Number.isInteger(vlan) || vlan < 1 || vlan > 4094 || (parts[3] && parts[3].toLowerCase() !== 'native') || parts.length > 4) return { output: '% Use encapsulation dot1Q <1-4094> [native].' }
      if (device.ports.some(p => p.id !== port.id && p.parentPortId === port.parentPortId && (p.dot1qVlan === vlan || parts[3] && p.dot1qNative))) return { output: '% This VLAN or native VLAN is already assigned on the parent interface.' }
      return { output: '', modifiedPorts: [{ portId: port.id, dot1qVlan: vlan, vlan, dot1qNative: !!parts[3] }] }
    }
    if (cmd === 'shutdown' || cmd === 'shut' || cmd === 'no' && ['shutdown','shut'].includes(parts[1])) return { output: '', modifiedPorts: [{ portId: port.id, adminStatus: cmd === 'no' ? 'up' : 'down' }] }
    if (cmd === 'no' && parts[1] === 'ip' && parts[2] === 'address') return { output: '', modifiedPorts: [{ portId: port.id, ipAddress: undefined, subnetMask: undefined }] }
    if (cmd === 'ip' && (parts[1]?.toLowerCase() === 'address' || parts[1]?.toLowerCase() === 'add')) {
      const ip = parts[2]
      const mask = parts[3]
      if (!ip || !mask || !isValidIpv4(ip) || !isValidIpv4(mask)) {
        return { output: '% Incomplete or invalid IP address format: ip address <ip> <netmask>' }
      }
      const newRoute: RouteEntry = {
        network: getNetworkAddress(ip, mask),
        netmask: mask,
        nextHop: 'connected',
        interfaceName: device.activeSubInterface || 'Sub-interface',
        metric: 0,
        type: 'C',
      }
      return {
        output: '',
        newRoutes: [newRoute],
        modifiedPorts: [{ portId: port.id, ipAddress: ip, subnetMask: mask }],
      }
    }
    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }
    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 8. Global Configuration Mode: Router(config)# / Switch(config)#
  if (device.currentCliMode === 'config') {
    if(cmd==='ip'&&parts[1]?.toLowerCase()==='routing'||cmd==='no'&&parts[1]?.toLowerCase()==='ip'&&parts[2]?.toLowerCase()==='routing'){
      if(device.type!=='router'&&!(device.type==='switch'&&['3560-24PS','3650-24PS'].includes(device.model)))return {output:"% Invalid input detected at '^' marker."}
      return {output:'',newDeviceConfig:{ipRouting:cmd!=='no'}}
    }
    if(cmd==='ipv6'&&parts[1]?.toLowerCase()==='unicast-routing'||cmd==='no'&&parts[1]?.toLowerCase()==='ipv6'&&parts[2]?.toLowerCase()==='unicast-routing'){
      if(device.type!=='router'&&!(device.type==='switch'&&['3560-24PS','3650-24PS'].includes(device.model)))return {output:"% Invalid input detected at '^' marker."}
      return {output:'',newDeviceConfig:{ipv6Routing:cmd!=='no'}}
    }
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'router' && parts[2]?.toLowerCase() === 'ospf') {
      const processId = Number(parts[3])
      if (parts.length !== 4 || !/^\d+$/.test(parts[3]) || processId < 1 || processId > 65535) {
        return { output: '% Use ipv6 router ospf <1-65535>.' }
      }
      if (device.config.ipv6OspfProcessId !== undefined && device.config.ipv6OspfProcessId !== processId) {
        return { output: '% Multiple OSPFv3 processes are not implemented. Existing configuration was left unchanged.' }
      }
      return { output: '', newMode: 'config-ipv6-router', newDeviceConfig: { ipv6OspfProcessId: processId } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'router' && parts[3]?.toLowerCase() === 'ospf') {
      if (parts.length !== 5 || Number(parts[4]) !== (device.config.ipv6OspfProcessId ?? 1)) return { output: '% OSPFv3 process not found.' }
      return { output: '', newDeviceConfig: { ipv6OspfProcessId: undefined, ipv6OspfRouterId: undefined }, resetOspfv3: true }
    }
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'router' && parts[2]?.toLowerCase() === 'eigrp') {
      const asNumber = Number(parts[3])
      if (parts.length !== 4 || !/^\d+$/.test(parts[3]) || asNumber < 1 || asNumber > 65535) return { output: '% Use ipv6 router eigrp <1-65535>.' }
      if (device.config.ipv6EigrpAs !== undefined && device.config.ipv6EigrpAs !== asNumber) {
        return { output: '% Multiple EIGRPv6 processes are not implemented. Existing configuration was left unchanged.' }
      }
      return { output: '', newMode: 'config-ipv6-eigrp', newDeviceConfig: { ipv6EigrpAs: asNumber, ...(device.config.ipv6EigrpAs === undefined ? { ipv6EigrpShutdown: true } : {}) } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'router' && parts[3]?.toLowerCase() === 'eigrp') {
      if (parts.length !== 5 || Number(parts[4]) !== (device.config.ipv6EigrpAs ?? 1)) return { output: '% EIGRPv6 process not found.' }
      return { output: '', newDeviceConfig: { ipv6EigrpAs: undefined, ipv6EigrpRouterId: undefined, ipv6EigrpShutdown: undefined, ipv6EigrpPassiveDefault: undefined, ipv6EigrpPassiveInterfaces: [], ipv6EigrpActiveInterfaces: [] }, resetIpv6Eigrp: true }
    }
    if(cmd==='ipv6'&&parts[1]?.toLowerCase()==='route'&&parts.length===4){
      const parsed=parseIpv6WithPrefix(parts[2]??'')
      const nextHop=parts[3]?parseIpv6(parts[3]):null
      if(!parsed||nextHop===null)return {output:'% Use ipv6 route <prefix>/<prefix-length> <next-hop>.'}
      return {output:'',newIpv6Routes:[{network:ipv6NetworkAddress(parsed.address,parsed.prefixLength)??parsed.address,prefixLength:parsed.prefixLength,nextHop:formatIpv6(nextHop),interfaceName:'',metric:0,type:'S'}]}
    }
    if(cmd==='no'&&parts[1]?.toLowerCase()==='ipv6'&&parts[2]?.toLowerCase()==='route'&&parts.length===5){
      const parsed=parseIpv6WithPrefix(parts[3]??'')
      const nextHop=parts[4]?parseIpv6(parts[4]):null
      if(!parsed||nextHop===null)return {output:'% Use no ipv6 route <prefix>/<prefix-length> <next-hop>.'}
      return {output:'',removedIpv6Routes:[{network:ipv6NetworkAddress(parsed.address,parsed.prefixLength)??parsed.address,prefixLength:parsed.prefixLength,nextHop:formatIpv6(nextHop),interfaceName:'',metric:0,type:'S'}]}
    }
    if(cmd==='ipv6'&&parts[1]?.toLowerCase()==='dhcp'&&parts[2]?.toLowerCase()==='pool'&&parts.length===4){
      return {output:'',newMode:'config-dhcpv6',newActiveDhcpPool:parts[3]}
    }
    if(cmd==='no'&&parts[1]?.toLowerCase()==='ipv6'&&parts[2]?.toLowerCase()==='dhcp'&&parts[3]?.toLowerCase()==='pool'&&parts.length===5){
      return {output:'',removedDhcpv6Pool:parts[4]}
    }
    if (cmd === 'hostname' || cmd === 'host') {
      if (!parts[1]) return { output: '% Incomplete command. Provide hostname.' }
      return { output: '', newHostname: parts[1] }
    }

    if (cmd === 'snmp-server' && parts[1]?.toLowerCase() === 'community') {
      const community = parts[2] ?? ''
      const access = parts[3]?.toLowerCase()
      if (!isValidSnmpCommunity(community) || parts.length > 4 || access && access !== 'ro' && access !== 'rw') return { output: '% Use snmp-server community <community> [ro].' }
      if (access === 'rw') return { output: '% This simulator supports read-only SNMP communities; write access is not supported.' }
      const communities = device.config.snmpCommunities ?? []
      return { output: communities.includes(community) ? `% SNMP community ${community} is already configured.` : `SNMP community ${community} configured as read-only.`, newDeviceConfig: { snmpCommunities: communities.includes(community) ? communities : [...communities, community] } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'snmp-server' && parts[2]?.toLowerCase() === 'community') {
      if (parts.length > 4 || parts.length === 4 && !isValidSnmpCommunity(parts[3])) return { output: '% Use no snmp-server community [community].' }
      const communities = device.config.snmpCommunities ?? []
      const remaining = parts[3] ? communities.filter(value => value !== parts[3]) : []
      if (parts[3] && remaining.length === communities.length) return { output: `% SNMP community ${parts[3]} is not configured.` }
      return { output: `SNMP community${parts[3] ? ` ${parts[3]}` : ' list'} removed.`, newDeviceConfig: { snmpCommunities: remaining } }
    }
    if (cmd === 'snmp-server' && ['contact', 'location'].includes(parts[1]?.toLowerCase() ?? '')) {
      const field = parts[1].toLowerCase() === 'contact' ? 'snmpSystemContact' : 'snmpSystemLocation'
      const value = parts.slice(2).join(' ').trim()
      if (!value || value.length > 255) return { output: `% Use snmp-server ${parts[1].toLowerCase()} <text up to 255 characters>.` }
      return { output: '', newDeviceConfig: { [field]: value } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'snmp-server' && ['contact', 'location'].includes(parts[2]?.toLowerCase() ?? '') && parts.length === 3) {
      return { output: '', newDeviceConfig: { [parts[2].toLowerCase() === 'contact' ? 'snmpSystemContact' : 'snmpSystemLocation']: undefined } }
    }

    if (cmd === 'ntp' && parts[1]?.toLowerCase() === 'master') {
      const stratum = parts[2] === undefined ? 8 : Number(parts[2])
      if (parts.length > 3 || !Number.isInteger(stratum) || stratum < 1 || stratum > 15) return { output: '% Use ntp master [<1-15>].' }
      return { output: '', newDeviceConfig: { ntpMaster: true, ntpMasterStratum: stratum } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ntp' && (parts.length === 2 || parts[2]?.toLowerCase() === 'master' && parts.length === 3)) {
      return { output: '', newDeviceConfig: { ntpMaster: false, ntpMasterStratum: undefined } }
    }
    if (cmd === 'ntp' && parts[1]?.toLowerCase() === 'server') {
      const targetIp = parts[2]
      if (parts.length !== 3 || !targetIp || !isValidIpv4(targetIp)) return { output: '% Use ntp server <IPv4-address>.' }
      return { output: `NTP server ${targetIp} configured. Sending a synchronization request.`, newDeviceConfig: { ntpServer: targetIp, ntpSynchronizedAtMs: undefined, ntpOffsetMs: undefined, ntpSynchronizedStratum: undefined }, triggerNtp: { targetIp } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ntp' && parts[2]?.toLowerCase() === 'server') {
      if (parts.length > 4 || parts.length === 4 && !isValidIpv4(parts[3])) return { output: '% Use no ntp server [<IPv4-address>].' }
      if (parts[3] && parts[3] !== device.config.ntpServer) return { output: `% NTP server ${parts[3]} is not configured.` }
      return { output: '', newDeviceConfig: { ntpServer: undefined, ntpSynchronizedAtMs: undefined, ntpOffsetMs: undefined, ntpSynchronizedStratum: undefined } }
    }

    if (cmd === 'enable' && (parts[1]?.toLowerCase() === 'secret' || parts[1]?.toLowerCase() === 'password')) {
      if (!parts[2]) return { output: '% Incomplete command.' }
      return { output: '', newSecretPassword: parts[2] }
    }

    if (cmd === 'service' && parts[1]?.toLowerCase() === 'password-encryption') {
      return { output: '' }
    }

    if (cmd === 'banner' && parts[1]?.toLowerCase() === 'motd') {
      return { output: '' }
    }

    // VLAN configuration: vlan 10 or vlan 10 name zerak or vlan name zerak 10
    if (cmd === 'vlan') {
      return handleVlanSelection(device, parts)
    }

    if (cmd === 'no' && parts[1]?.toLowerCase() === 'vlan') {
      const vlanNum = parseInt(parts[2], 10)
      if (isNaN(vlanNum)) return { output: '% Incomplete command.' }
      return {
        output: '',
        removedVlanId: vlanNum,
      }
    }

    // Interface selection: int fa0/1 or int fa0/0.10 or int range fa0/1 - 4
    if (cmd === 'interface' || cmd === 'int') {
      return handleInterfaceSelection(device, parts)
    }

    // Line console / vty
    if (cmd === 'line') {
      return {
        output: '',
        newMode: 'config-line',
      }
    }

    // Router routing protocol (router rip / router ospf <id>)
    if (cmd === 'router') {
      const protocol = parts[1]?.toLowerCase()
      if (device.type !== 'router' && !(device.type === 'switch' && device.config.ipRouting)) return { output: '% Routing protocols require an IP-routing device.' }
      const processId = Number(parts[2])
      if (protocol === 'rip' && parts.length === 2) {
        return { output: '', newMode: 'config-router', newActiveRoutingProtocol: 'rip' }
      }
      if (protocol === 'eigrp') {
        if (parts.length !== 3 || !/^\d+$/.test(parts[2]) || processId < 1 || processId > 65535) return { output: '% Invalid EIGRP autonomous system. Use router eigrp <1-65535>.' }
        if (device.config.eigrpAs !== undefined && device.config.eigrpAs !== processId) return { output: '% Multiple EIGRP autonomous systems are not implemented. Existing configuration was left unchanged.' }
        return { output: '', newMode: 'config-router', newActiveRoutingProtocol: 'eigrp', newDeviceConfig: { eigrpAs: processId } }
      }
      if (protocol === 'bgp') {
        if (parts.length !== 3 || !/^\d+$/.test(parts[2]) || processId < 1 || processId > 65535) return { output: '% Invalid BGP autonomous system. Use router bgp <1-65535>.' }
        if (device.config.bgpAs !== undefined && device.config.bgpAs !== processId) return { output: `% A different BGP autonomous system (${device.config.bgpAs}) is already configured. Remove it first or re-enter AS ${device.config.bgpAs}.` }
        return { output: '', newMode: 'config-router', newActiveRoutingProtocol: 'bgp', newDeviceConfig: { bgpAs: processId } }
      }
      if (protocol !== 'ospf' || parts.length !== 3 || !/^\d+$/.test(parts[2]) || processId < 1 || processId > 65535) {
        return { output: '% Supported configuration: router rip, router ospf <1-65535>, router eigrp <1-65535>, or router bgp <1-65535>.' }
      }
      if (device.config.ospfProcessId && device.config.ospfProcessId !== processId) {
        return { output: '% Multiple OSPF processes are not implemented. Existing configuration was left unchanged.' }
      }
      return {
        output: '',
        newMode: 'config-router',
        newActiveRoutingProtocol: 'ospf',
        newDeviceConfig: { ospfProcessId: processId },
      }
    }
    if (cmd === 'no' && parts[1] === 'router' && parts[2] === 'rip' && parts.length === 3) {
      return { output: '', newDeviceConfig: { ripNetworks: [], ripVersion: undefined, ripAutoSummary: undefined, ripPassiveDefault: undefined, ripPassiveInterfaces: [], ripActiveInterfaces: [] }, resetRip: true }
    }
    if (cmd === 'no' && parts[1] === 'router' && parts[2] === 'eigrp') {
      if (parts.length !== 4 || Number(parts[3]) !== (device.config.eigrpAs ?? 1)) return { output: '% EIGRP process not found.' }
      return { output: '', newDeviceConfig: { eigrpAs: undefined, eigrpNetworks: [], eigrpRouterId: undefined, eigrpAutoSummary: undefined, eigrpPassiveDefault: undefined, eigrpPassiveInterfaces: [], eigrpActiveInterfaces: [] }, resetEigrp: true }
    }
    if (cmd === 'no' && parts[1] === 'router' && parts[2] === 'bgp') {
      if (parts.length !== 4 || Number(parts[3]) !== (device.config.bgpAs ?? 1)) return { output: '% BGP process not found.' }
      return { output: '', newDeviceConfig: { bgpAs: undefined, bgpRouterId: undefined, bgpNeighbors: [], bgpNetworks: [] }, resetBgp: true }
    }
    if (cmd === 'no' && parts[1] === 'router' && parts[2] === 'ospf') {
      if (parts.length !== 4 || Number(parts[3]) !== (device.config.ospfProcessId ?? 1)) return { output: '% OSPF process not found.' }
      return { output: '', newDeviceConfig: { ospfProcessId: undefined, ospfNetworks: [], ospfRouterId: undefined, ospfPassiveDefault: undefined, ospfPassiveInterfaces: [], ospfActiveInterfaces: [] }, resetOspf: true }
    }

    // DHCP pool: ip dhcp pool POOL1
    if (cmd === 'ip' && parts[1]?.toLowerCase() === 'dhcp') {
      if (parts[2]?.toLowerCase() === 'pool') {
        return {
          output: '',
          newMode: 'config-dhcp',
        }
      }
      if (parts[2]?.toLowerCase() === 'excluded-address') {
        return {
          output: '',
          newExcludedDhcpIp: parts[3],
        }
      }
    }

    // IP Default-Gateway
    if (cmd === 'ip' && (parts[1]?.toLowerCase() === 'default-gateway' || parts[1]?.toLowerCase() === 'def')) {
      const gw = parts[2]
      if (!gw || !isValidIpv4(gw)) {
        return { output: '% Incomplete or invalid default-gateway IP.' }
      }
      return { output: '', newDefaultGateway: gw }
    }

    // IP Route
    if (cmd === 'ip' && (parts[1]?.toLowerCase() === 'route' || parts[1]?.toLowerCase() === 'ro')) {
      const net = parts[2]
      const mask = parts[3]
      const nextHop = parts[4]
      if (!net || !mask || !nextHop || !isValidIpv4(net) || !isValidIpv4(mask)) {
        return { output: '% Incomplete or invalid route: ip route <network> <netmask> <next-hop|Tunnel interface>' }
      }
      const tunnel = device.ports.find(port => port.isGreTunnel && (port.name.toLowerCase() === nextHop.toLowerCase() || port.shortName.toLowerCase() === nextHop.toLowerCase()))
      if (/^tunnel\d+$/i.test(nextHop) && !tunnel) return { output: `% GRE tunnel ${nextHop} does not exist.` }
      if (tunnel && device.type !== 'router') return { output: '% GRE tunnel routes require a router.' }
      const newRoute: RouteEntry = {
        network: getNetworkAddress(net, mask),
        netmask: mask,
        nextHop: tunnel ? 'connected' : nextHop,
        interfaceName: tunnel?.name ?? '',
        metric: 1,
        type: 'S',
      }
      return { output: '', newRoutes: [newRoute] }
    }

    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ip' && parts[2]?.toLowerCase() === 'route') {
      const net = parts[3]
      const mask = parts[4]
      const nextHop = parts[5]
      if (!net || !mask || !nextHop) {
        return { output: '% Incomplete command.' }
      }
      const tunnel = device.ports.find(port => port.isGreTunnel && (port.name.toLowerCase() === nextHop.toLowerCase() || port.shortName.toLowerCase() === nextHop.toLowerCase()))
      if (nextHop && /^tunnel\d+$/i.test(nextHop) && !tunnel) return { output: `% GRE tunnel ${nextHop} does not exist.` }
      const toRemove: RouteEntry = {
        network: getNetworkAddress(net, mask),
        netmask: mask,
        nextHop: tunnel ? 'connected' : nextHop,
        interfaceName: tunnel?.name ?? '',
        metric: 1,
        type: 'S',
      }
      return { output: '', removedRoutes: [toRemove] }
    }

    // Spanning-Tree commands
    if (cmd === 'spanning-tree' || cmd === 'span' || (cmd === 'no' && (parts[1] === 'spanning-tree' || parts[1] === 'span'))) {
      const negated = cmd === 'no'
      const body = (negated ? parts.slice(2) : parts.slice(1)).map(token => token.toLowerCase())
      if (body[0] === 'mode') {
        if (negated && !body[1]) return { output: '', newDeviceConfig: { stpMode: undefined } }
        if (!['pvst', 'rapid-pvst', 'mst'].includes(body[1] ?? '')) return { output: '% Specify spanning-tree mode pvst|rapid-pvst|mst.' }
        return { output: '', newDeviceConfig: { stpMode: body[1] as 'pvst' | 'rapid-pvst' | 'mst' } }
      }
      if (body[0] === 'portfast' && body[1] === 'default') return { output: '', newDeviceConfig: { portfastDefault: !negated } }
      if (body[0] === 'mst' && body[1] === 'configuration') {
        if (negated) return { output: '', newDeviceConfig: { mstName: undefined, mstRevision: undefined, mstInstances: [] } }
        return { output: '', newMode: 'config-mst' }
      }
      if (body[0] === 'mst') {
        const instance = Number(body[1])
        const priority = body[2] === 'root' ? (body[3] === 'primary' ? 24576 : body[3] === 'secondary' ? 28672 : NaN) : body[2] === 'priority' ? Number(body[3]) : NaN
        if (negated && body[2] === 'priority' && Number.isInteger(instance) && instance >= 1 && instance <= 4094) {
          const next = { ...device.config.mstPriorities }
          delete next[String(instance)]
          return { output: '', newDeviceConfig: { mstPriorities: next } }
        }
        if (!Number.isInteger(instance) || instance < 1 || instance > 4094 || !Number.isInteger(priority) || priority < 0 || priority > 61440 || priority % 4096) return { output: '% Specify spanning-tree mst <1-4094> priority <multiple of 4096> or root primary|secondary.' }
        return { output: '', newDeviceConfig: { mstPriorities: { ...device.config.mstPriorities, [String(instance)]: priority } } }
      }
      const vlan = Number(body[1])
      const priority = body[2] === 'root' ? (body[3] === 'primary' ? 24576 : body[3] === 'secondary' ? 28672 : NaN) : body[2] === 'priority' ? Number(body[3]) : NaN
      if (negated && body[2] === 'priority' && Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094) {
        const next = { ...device.config.stpPriorities }
        delete next[String(vlan)]
        return { output: '', newDeviceConfig: { stpPriorities: next } }
      }
      if (body[0] !== 'vlan' || !Number.isInteger(vlan) || vlan < 1 || vlan > 4094 || !Number.isInteger(priority) || priority < 0 || priority > 61440 || priority % 4096) return { output: '% Specify spanning-tree vlan <1-4094> root primary|secondary or priority <multiple of 4096>.' }
      return { output: '', newDeviceConfig: { stpPriorities: { ...device.config.stpPriorities, [vlan]: priority } } }
    }

    // Access-list configuration: access-list <1-199> permit|deny ...
    if (cmd === 'access-list' || cmd === 'acl') {
      const parsed = parseAclRule(parts.slice(1))
      if ('error' in parsed) {
        return { output: parsed.error }
      }
      const existingLists = device.config.accessLists ? [...device.config.accessLists] : []
      const existingIndex = existingLists.findIndex((a) => a.id === parsed.aclId)
      if (existingIndex >= 0) {
        existingLists[existingIndex] = {
          ...existingLists[existingIndex],
          rules: [...existingLists[existingIndex].rules, parsed.rule],
        }
      } else {
        existingLists.push({
          id: parsed.aclId,
          number: parseInt(parsed.aclId, 10) || undefined,
          type: parsed.type,
          rules: [parsed.rule],
        })
      }
      return { output: '', newDeviceConfig: { accessLists: existingLists } }
    }

    if (cmd === 'no' && (parts[1]?.toLowerCase() === 'access-list' || parts[1]?.toLowerCase() === 'acl')) {
      const targetId = parts[2]
      if (!targetId) return { output: '% Incomplete command: specify access-list number.' }
      const existingLists = (device.config.accessLists || []).filter((a) => a.id !== targetId)
      return { output: '', newDeviceConfig: { accessLists: existingLists } }
    }

    if (cmd === 'ip' && parts[1]?.toLowerCase() === 'access-list') {
      const aclType = parts[2]?.toLowerCase()
      const aclName = parts[3]
      if (!aclName) return { output: '% Incomplete command: specify access-list name or number.' }
      const existingLists = device.config.accessLists ? [...device.config.accessLists] : []
      if (!existingLists.some((a) => a.id === aclName)) {
        existingLists.push({
          id: aclName,
          number: parseInt(aclName, 10) || undefined,
          type: aclType === 'extended' ? 'extended' : 'standard',
          rules: [],
        })
      }
      return { output: '', newDeviceConfig: { accessLists: existingLists } }
    }

    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }

    return { output: `% Invalid input detected at '^' marker.` }
  }

  // 9. Interface Configuration Mode: Router(config-if)# / Switch(config-if)#
  if (device.currentCliMode === 'config-if') {
    // Allow seamless switching to another interface or VLAN directly from config-if
    if (cmd === 'interface' || cmd === 'int') {
      return handleInterfaceSelection(device, parts)
    }
    if (cmd === 'vlan') {
      return handleVlanSelection(device, parts)
    }

    const activePortId = device.activeInterface
    const activePort = device.ports.find((p) => p.id === activePortId)

    if (!activePort) {
      return { output: '% No active interface selected.', newMode: 'config' }
    }

    const targetPortIds = device.activeRangePorts || [activePort.id]

    if(cmd==='standby'||cmd==='no'&&parts[1]?.toLowerCase()==='standby'){
      const negated=cmd==='no'
      const offset=negated?2:1
      const groupText=parts[offset]
      if(!/^(?:0|[1-9]\d{0,2})$/.test(groupText??''))return {output:'% Use standby <group 0-255> ip <virtual-ip>, priority <0-255>, or preempt.'}
      const group=Number(groupText)
      if(group>255)return {output:'% HSRP group must be between 0 and 255.'}
      const supportsHsrp=device.type==='router'||device.type==='switch'&&device.config.ipRouting===true&&activePort.virtualVlan!==undefined
      if(!supportsHsrp)return {output:'% HSRP requires a routed router interface or an L3-switch VLAN interface with ip routing enabled.'}
      const operation=parts[offset+1]?.toLowerCase()
      const value=parts[offset+2]
      if(negated&&parts.length===3){
        const modifiedPorts=targetPortIds.map(portId=>({portId,hsrpGroups:device.ports.find(port=>port.id===portId)?.hsrpGroups?.filter(item=>item.group!==group)}))
        return {output:'',modifiedPorts}
      }
      if(!negated&&operation==='ip'&&parts.length===offset+3){
        if(!isValidIpv4(value??'')||value==='0.0.0.0'||value==='255.255.255.255')return {output:'% HSRP virtual IP must be a valid unicast IPv4 address.'}
        if(activePort.ipAddress&&activePort.subnetMask&&!isInSameSubnet(value!,activePort.ipAddress,activePort.subnetMask))return {output:'% HSRP virtual IP must be in the interface subnet.'}
        if(activePort.ipAddress===value)return {output:'% HSRP virtual IP cannot match the interface address.'}
      }else if(!negated&&operation==='priority'&&parts.length===offset+3){
        if(!/^\d+$/.test(value??'')||Number(value)<0||Number(value)>255)return {output:'% HSRP priority must be between 0 and 255.'}
      }else if(!negated&&operation==='preempt'&&parts.length===offset+2){
        // HSRP preempt delay controls are validated separately when timed role changes are implemented.
      }else if(negated&&['ip','priority','preempt'].includes(operation??'')&&parts.length===offset+2){
        // The corresponding setting is removed below.
      }else return {output:`% ${negated?'Use no standby <group> [ip|priority|preempt].':'Use standby <group> ip <virtual-ip>, priority <0-255>, or preempt.'}`}
      const modifiedPorts=targetPortIds.map(portId=>{
        const target=device.ports.find(port=>port.id===portId)!
        const groups=[...(target.hsrpGroups??[])]
        const index=groups.findIndex(item=>item.group===group)
        if(negated&&index<0)return {portId,hsrpGroups:groups}
        const current=index>=0?groups[index]:{group}
        const updated=negated
          ?operation==='ip'?{...current,virtualIp:undefined}:operation==='priority'?{...current,priority:undefined}:{...current,preempt:undefined}
          :operation==='ip'?{...current,virtualIp:value}:operation==='priority'?{...current,priority:Number(value)}:{...current,preempt:true}
        if(index>=0)groups[index]=updated
        else groups.push(updated)
        const retained=groups.filter(item=>item.virtualIp!==undefined||item.priority!==undefined||item.preempt!==undefined)
        return {portId,hsrpGroups:retained}
      })
      return {output:'',modifiedPorts}
    }

    if (activePort.isGreTunnel && cmd === 'no' && parts[1]?.toLowerCase() === 'keepalive' && parts.length === 2) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, greKeepalivePeriodSeconds: undefined, greKeepaliveRetries: undefined, greKeepaliveElapsedMs: undefined, greKeepaliveMissed: undefined, greKeepaliveSequence: undefined, greKeepaliveOperational: undefined }] }
    }
    if (activePort.isGreTunnel && cmd === 'keepalive') {
      if (parts.length > 3) return { output: '% Use keepalive [<0-32767> [<1-255>]].' }
      const period = parts[1] === undefined ? 10 : Number(parts[1])
      const retries = parts[2] === undefined ? 3 : Number(parts[2])
      if (!Number.isInteger(period) || period < 0 || period > 32767) return { output: '% Keepalive period must be 0 through 32767 seconds.' }
      if (period === 0) {
        if (parts.length > 2) return { output: '% Keepalive period 0 disables keepalives and cannot include a retry count.' }
        return { output: '', modifiedPorts: [{ portId: activePort.id, greKeepalivePeriodSeconds: undefined, greKeepaliveRetries: undefined, greKeepaliveElapsedMs: undefined, greKeepaliveMissed: undefined, greKeepaliveSequence: undefined, greKeepaliveOperational: undefined }] }
      }
      if (!Number.isInteger(retries) || retries < 1 || retries > 255) return { output: '% Keepalive retries must be 1 through 255.' }
      return { output: '', modifiedPorts: [{ portId: activePort.id, greKeepalivePeriodSeconds: period, greKeepaliveRetries: retries, greKeepaliveElapsedMs: 0, greKeepaliveMissed: 0, greKeepaliveOperational: true }] }
    }

    if (activePort.isGreTunnel && (cmd === 'tunnel' || cmd === 'no' && parts[1]?.toLowerCase() === 'tunnel')) {
      const no = cmd === 'no'
      const tunnelCommand = no ? parts[2]?.toLowerCase() : parts[1]?.toLowerCase()
      const value = no ? parts[3] : parts[2]
      if (tunnelCommand === 'source') {
        if (no && parts.length === 3) return { output: '', modifiedPorts: [{ portId: activePort.id, greSourceInterface: undefined }] }
        const sourceId = value ? normalizeInterfaceName(value, device.ports.filter(port => !port.isGreTunnel)) : null
        const sourcePort = sourceId ? device.ports.find(port => port.id === sourceId) : undefined
        if (!sourcePort || parts.length !== (no ? 4 : 3)) return { output: '% Use tunnel source <existing physical interface>.' }
        return { output: '', modifiedPorts: [{ portId: activePort.id, greSourceInterface: no ? undefined : sourcePort.name }] }
      }
      if (tunnelCommand === 'destination') {
        if (no && parts.length === 3) return { output: '', modifiedPorts: [{ portId: activePort.id, greDestinationIp: undefined }] }
        if (parts.length !== (no ? 4 : 3) || !value || !isValidIpv4(value)) return { output: '% Use tunnel destination <IPv4 address>.' }
        return { output: '', modifiedPorts: [{ portId: activePort.id, greDestinationIp: no ? undefined : value }] }
      }
      if (tunnelCommand === 'mode') {
        if (no && parts.length === 5 && parts[3]?.toLowerCase() === 'gre' && parts[4]?.toLowerCase() === 'ip') return { output: '', modifiedPorts: [{ portId: activePort.id, greMode: undefined }] }
        if (no || parts.length !== 4 || parts[2]?.toLowerCase() !== 'gre' || parts[3]?.toLowerCase() !== 'ip') return { output: '% Supported mode: tunnel mode gre ip.' }
        return { output: '', modifiedPorts: [{ portId: activePort.id, greMode: 'gre ip' }] }
      }
      return { output: '% Supported tunnel commands: source, destination, mode gre ip, keepalive.' }
    }

    // Shutdown / No Shutdown
    if (cmd === 'no' && (parts[1]?.toLowerCase() === 'shutdown' || parts[1]?.toLowerCase() === 'shut' || parts[1]?.toLowerCase() === 'sh')) {
      const mods = targetPortIds.map((pid) => ({ portId: pid, adminStatus: 'up' as const }))
      const operational = interfaceOperational(device, { ...activePort, adminStatus: 'up' })
      const state = operational ? 'up' : 'down'
      return {
        output: `%LINK-5-CHANGED: Interface ${activePort.name}, changed state to ${state}\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${activePort.name}, changed state to ${state}`,
        modifiedPorts: mods,
      }
    }

    if (cmd === 'shutdown' || cmd === 'shut') {
      const mods = targetPortIds.map((pid) => ({ portId: pid, adminStatus: 'down' as const }))
      return {
        output: `%LINK-5-CHANGED: Interface ${activePort.name}, changed state to administratively down\n%LINEPROTO-5-UPDOWN: Line protocol on Interface ${activePort.name}, changed state to down`,
        modifiedPorts: mods,
      }
    }

    // Switchport commands: switchport mode access / trunk, switchport access vlan <id>
    if (cmd === 'switchport' || cmd === 'sw') {
      const p1 = parts[1]?.toLowerCase()
      const p2 = parts[2]?.toLowerCase()
      const p3 = parts[3]?.toLowerCase()

      // Mode: switchport mode access / trunk
      if (p1 === 'mode' || p1 === 'mo') {
        if (p2 === 'access' || p2 === 'acc') {
          const mods = targetPortIds.map((pid) => ({ portId: pid, portMode: 'access' as const }))
          return { output: '', modifiedPorts: mods }
        }
        if (p2 === 'trunk' || p2 === 'tru') {
          const mods = targetPortIds.map((pid) => ({ portId: pid, portMode: 'trunk' as const }))
          return { output: '', modifiedPorts: mods }
        }
      }

      // Access: switchport access vlan 10
      if ((p1 === 'access' || p1 === 'acc') && (p2 === 'vlan' || p2 === 'vl')) {
        const vId = parseInt(p3, 10)
        if (isNaN(vId) || vId < 1 || vId > 4094) {
          return { output: '% Invalid VLAN number (1-4094).' }
        }
        const mods = targetPortIds.map((pid) => ({ portId: pid, vlan: vId, portMode: 'access' as const }))
        return { output: '', modifiedPorts: mods }
      }

      // Trunk encapsulation / native vlan / allowed vlan
      if (p1 === 'trunk' || p1 === 'tru') {
        if(p2==='native'&&p3==='vlan'){
          const vlan=Number(parts[4]);if(!Number.isInteger(vlan)||vlan<1||vlan>4094)return {output:'% Invalid VLAN number (1-4094).'}
          return {output:'',modifiedPorts:targetPortIds.map(portId=>({portId,nativeVlan:vlan}))}
        }
        if(p2==='allowed'&&p3==='vlan'){
          const operation=parts[4],spec=['add','remove'].includes(operation)?parts[5]:operation
          const all=Array.from({length:4094},(_,i)=>i+1),parsed=spec==='all'?all:spec==='none'?[]:parseVlanList(spec||'')
          if(!parsed)return {output:'% Invalid VLAN list.'}
          return {output:'',modifiedPorts:targetPortIds.map(portId=>{const current=device.ports.find(p=>p.id===portId)?.allowedVlans??all;const allowedVlans=operation==='add'?[...new Set([...current,...parsed])]:operation==='remove'?current.filter(v=>!parsed.includes(v)):parsed;return {portId,allowedVlans:allowedVlans.sort((a,b)=>a-b)}})}
        }
        if(p2==='encapsulation'&&p3==='dot1q')return {output:''}
        return {output:'% Trunk command is incomplete or unsupported.'}
      }

      if (p1 === 'nonegotiate') {
        return { output: '' }
      }

      return { output: '% Switchport command is incomplete or unsupported.' }
    }

    if ((cmd === 'ip' && parts[1] === 'ospf') || (cmd === 'no' && parts[1] === 'ip' && parts[2] === 'ospf')) {
      const no = cmd === 'no', option = parts[no ? 3 : 2], value = parts[no ? 4 : 3]
      if (parts.length !== 4) return { output: '% Invalid OSPF interface command.' }
      if (option === 'network') {
        if (!no && value !== 'point-to-point' && value !== 'broadcast') return { output: '% Supported OSPF network types: broadcast or point-to-point.' }
        return { output: '', modifiedPorts: targetPortIds.map(portId => ({ portId, ospfNetworkType: no ? undefined : value as 'broadcast' | 'point-to-point' })) }
      }
      const fields = { cost: 'ospfCost', 'hello-interval': 'ospfHelloInterval', 'dead-interval': 'ospfDeadInterval', priority: 'ospfPriority' } as const
      const field = fields[option as keyof typeof fields], n = Number(value)
      if (!field || !no && (!/^\d+$/.test(value ?? '') || n < (option === 'priority' ? 0 : 1) || n > (option === 'priority' ? 255 : 65535))) return { output: '% Invalid OSPF interface value.' }
      return { output: '', modifiedPorts: targetPortIds.map(portId => ({ portId, [field]: no ? undefined : n })) }
    }

    // IP Address
    if (cmd === 'ip' && (parts[1]?.toLowerCase() === 'address' || parts[1]?.toLowerCase() === 'add')) {
      const ip = parts[2]
      const mask = parts[3]
      if (!ip || !mask || !isValidIpv4(ip) || !isValidIpv4(mask)) {
        return { output: '% Incomplete or invalid IP address format: ip address <ip> <netmask>' }
      }
      return {
        output: '',
        modifiedPorts: [{ portId: activePort.id, ipAddress: ip, subnetMask: mask }],
        newRoutes: [
          {
            network: getNetworkAddress(ip, mask),
            netmask: mask,
            nextHop: 'connected',
            interfaceName: activePort.name,
            metric: 0,
            type: 'C',
          },
        ],
      }
    }

    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ip' && (parts[2]?.toLowerCase() === 'address' || parts[2]?.toLowerCase() === 'add')) {
      return {
        output: '',
        modifiedPorts: [{ portId: activePort.id, ipAddress: undefined, subnetMask: undefined }],
      }
    }

    // ipv6 address autoconfig | ipv6 address dhcp (SLAAC / DHCPv6 client modes)
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'address' && parts[2]?.toLowerCase() === 'autoconfig' && parts.length === 3) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6Autoconfig: true, ipv6Dhcp: false }] }
    }
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'address' && parts[2]?.toLowerCase() === 'dhcp' && parts.length === 3) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6Dhcp: true, ipv6Autoconfig: false }] }
    }

    // IPv6 Address (ipv6 address <address>/<prefix-length> [eui-64], no ipv6 address [<address>])
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'address') {
      const existing = activePort.ipv6Addresses ?? []
      const spec = parts[2]
      if (!spec) return { output: '% Use ipv6 address <address>/<prefix-length> [eui-64].' }
      if (parts[3]?.toLowerCase() === 'link-local' && parts.length === 4) return { output: `% ${activePort.name} derives its link-local address from the MAC address; static link-local addresses are not supported.` }
      if (parts.length !== 3 && parts.length !== 4) return { output: '% Use ipv6 address <address>/<prefix-length> [eui-64].' }
      const parsed = parseIpv6WithPrefix(spec)
      if (!parsed) return { output: '% Invalid IPv6 address. Use ipv6 address <address>/<prefix-length>.' }
      const value = parseIpv6(parsed.address)
      if (value === null) return { output: '% Invalid IPv6 address. Use ipv6 address <address>/<prefix-length>.' }
      if (isIpv6Multicast(parsed.address)) return { output: '% Multicast addresses cannot be assigned to an interface.' }
      if (isIpv6Unspecified(parsed.address) || isIpv6Loopback(parsed.address)) return { output: '% The unspecified and loopback addresses cannot be assigned to an interface.' }
      if (isIpv6LinkLocal(parsed.address)) {
        if (parts[3]?.toLowerCase() !== 'link-local' || parts.length !== 4) return { output: '% Link-local addresses require the link-local keyword and are derived from the MAC address.' }
        return { output: `% ${activePort.name} derives its link-local address from the MAC address; static link-local addresses are not supported.` }
      }
      let address = parsed.address
      if (parts.length === 4) {
        if (parts[3]?.toLowerCase() !== 'eui-64') return { output: '% Use ipv6 address <address>/<prefix-length> eui-64.' }
        if (parsed.prefixLength !== 64) return { output: '% EUI-64 interface IDs require a /64 prefix.' }
        const interfaceId = ipv6InterfaceIdFromMac(activePort.macAddress)
        const eui = interfaceId ? parseIpv6(`::${interfaceId}`) : null
        if (eui === null) return { output: '% The interface MAC address cannot generate an EUI-64 interface ID.' }
        address = formatIpv6((value & ipv6PrefixMask(64)) | eui)
      }
      const finalValue = parseIpv6(address)
      const ipv6Addresses = [
        ...existing.filter((candidate) => parseIpv6(candidate.address) !== finalValue),
        { address, prefixLength: parsed.prefixLength },
      ]
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6Addresses }] }
    }

    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'address' && parts[3]?.toLowerCase() === 'autoconfig' && parts.length === 4) {
      const remaining = (activePort.ipv6Addresses ?? []).filter((candidate) => candidate.source !== 'slaac')
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6Autoconfig: false, ipv6Addresses: remaining.length ? remaining : undefined }] }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'address' && parts[3]?.toLowerCase() === 'dhcp' && parts.length === 4) {
      const remaining = (activePort.ipv6Addresses ?? []).filter((candidate) => candidate.source !== 'dhcpv6')
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6Dhcp: false, ipv6Addresses: remaining.length ? remaining : undefined }] }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'address') {
      const existing = activePort.ipv6Addresses ?? []
      if (parts.length === 3) return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6Addresses: undefined }] }
      const parsed = parts[3] ? parseIpv6WithPrefix(parts[3]) : null
      if (parts.length !== 4 || !parsed) return { output: '% Use no ipv6 address [<address>/<prefix-length>].' }
      const value = parseIpv6(parsed.address)
      const remaining = existing.filter((candidate) => parseIpv6(candidate.address) !== value)
      if (remaining.length === existing.length) return { output: `% IPv6 address ${parsed.address} is not configured on ${activePort.name}.` }
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6Addresses: remaining.length ? remaining : undefined }] }
    }

    // ipv6 enable: link-local addressing is always available in this simulator.
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'enable' && parts.length === 2) return { output: '' }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'enable' && parts.length === 3) return { output: '' }

    // ipv6 dhcp server <pool>: answer DHCPv6 on this interface from a configured pool.
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'dhcp' && parts[2]?.toLowerCase() === 'server' && parts.length === 4) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6DhcpServerPool: parts[3] }] }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'dhcp' && parts[3]?.toLowerCase() === 'server' && parts.length === 4) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6DhcpServerPool: undefined }] }
    }
    // ipv6 nd managed-config-flag / other-config-flag: flags carried in router advertisements.
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'nd' && parts[2]?.toLowerCase() === 'managed-config-flag' && parts.length === 3) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6NdManagedConfig: true }] }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'nd' && parts[3]?.toLowerCase() === 'managed-config-flag' && parts.length === 4) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6NdManagedConfig: false }] }
    }
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'nd' && parts[2]?.toLowerCase() === 'other-config-flag' && parts.length === 3) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6NdOtherConfig: true }] }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'nd' && parts[3]?.toLowerCase() === 'other-config-flag' && parts.length === 4) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6NdOtherConfig: false }] }
    }
    // ipv6 ospf <1-65535> area <0-4294967295> plus cost/priority: OSPFv3 interface settings.
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'ospf' && parts[2]?.toLowerCase() === 'cost') {
      if (device.type !== 'router' && !(device.type === 'switch' && device.config.ipRouting === true)) return { output: '% OSPFv3 requires a router or Layer 3 switch.' }
      const cost = Number(parts[3])
      if (parts.length !== 4 || !/^\d+$/.test(parts[3]) || cost < 1 || cost > 65535) return { output: '% Use ipv6 ospf cost <1-65535>.' }
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6OspfCost: cost }] }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'ospf' && parts[3]?.toLowerCase() === 'cost' && parts.length === 4) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6OspfCost: undefined }] }
    }
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'ospf' && parts[2]?.toLowerCase() === 'priority') {
      if (device.type !== 'router' && !(device.type === 'switch' && device.config.ipRouting === true)) return { output: '% OSPFv3 requires a router or Layer 3 switch.' }
      const priority = Number(parts[3])
      if (parts.length !== 4 || !/^\d+$/.test(parts[3]) || priority < 0 || priority > 255) return { output: '% Use ipv6 ospf priority <0-255>.' }
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6OspfPriority: priority }] }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'ospf' && parts[3]?.toLowerCase() === 'priority' && parts.length === 4) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6OspfPriority: undefined }] }
    }
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'ospf' && parts[3]?.toLowerCase() === 'area') {
      if (device.type !== 'router' && !(device.type === 'switch' && device.config.ipRouting === true)) return { output: '% OSPFv3 requires a router or Layer 3 switch.' }
      const processId = Number(parts[2]), area = Number(parts[4])
      if (parts.length !== 5 || !/^\d+$/.test(parts[2]) || processId < 1 || processId > 65535) return { output: '% Use ipv6 ospf <1-65535> area <0-4294967295>.' }
      if (!/^\d+$/.test(parts[4]) || area < 0 || area > 4294967295) return { output: '% Use ipv6 ospf <1-65535> area <0-4294967295>.' }
      if (device.config.ipv6OspfProcessId !== undefined && device.config.ipv6OspfProcessId !== processId) {
        return { output: `% OSPFv3 process ${device.config.ipv6OspfProcessId} is already configured; multiple OSPFv3 processes are not implemented.` }
      }
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6OspfProcess: processId, ipv6OspfArea: area }], newDeviceConfig: { ipv6OspfProcessId: processId } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'ospf' && (parts.length === 3 || (parts.length === 6 && parts[4]?.toLowerCase() === 'area'))) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6OspfProcess: undefined, ipv6OspfArea: undefined }] }
    }
    if (cmd === 'ipv6' && parts[1]?.toLowerCase() === 'eigrp') {
      if (device.type !== 'router' && !(device.type === 'switch' && device.config.ipRouting === true)) return { output: '% EIGRPv6 requires a router or Layer 3 switch.' }
      const asNumber = Number(parts[2])
      if (parts.length !== 3 || !/^\d+$/.test(parts[2]) || asNumber < 1 || asNumber > 65535) return { output: '% Use ipv6 eigrp <1-65535>.' }
      if (device.config.ipv6EigrpAs !== undefined && device.config.ipv6EigrpAs !== asNumber) {
        return { output: `% EIGRPv6 AS ${device.config.ipv6EigrpAs} is already configured; multiple EIGRPv6 processes are not implemented.` }
      }
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6EigrpAs: asNumber }], newDeviceConfig: { ipv6EigrpAs: asNumber, ...(device.config.ipv6EigrpAs === undefined ? { ipv6EigrpShutdown: true } : {}) } }
    }
    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ipv6' && parts[2]?.toLowerCase() === 'eigrp' && parts.length === 3) {
      return { output: '', modifiedPorts: [{ portId: activePort.id, ipv6EigrpAs: undefined }] }
    }

    // Description
    if (cmd === 'description' || cmd === 'desc') {
      return {
        output: '',
        modifiedPorts: [{ portId: activePort.id, description: parts.slice(1).join(' ') }],
      }
    }

    // Spanning-Tree on interface (portfast, link-type, bpduguard)
    if (cmd === 'spanning-tree' || cmd === 'span' || (cmd === 'no' && (parts[1] === 'spanning-tree' || parts[1] === 'span'))) {
      const negated=cmd==='no',body=negated?parts.slice(2):parts.slice(1)
      const sub=body[0]?.toLowerCase()
      if(sub==='portfast')return {output:'',modifiedPorts:targetPortIds.map(portId=>({portId,portfast:negated?undefined:true}))}
      if(sub==='cost'&&(negated||Number(body[1])>0))return {output:'',modifiedPorts:targetPortIds.map(portId=>({portId,stpCost:negated?undefined:Number(body[1])}))}
      if(sub==='link-type'&&(negated||body[1]==='point-to-point'||body[1]==='shared'))return {output:'',modifiedPorts:targetPortIds.map(portId=>({portId,stpLinkType:negated?undefined:body[1] as 'point-to-point'|'shared'}))}
      return {output:'% This spanning-tree interface command is not implemented.'}
    }

    if(cmd==='channel-group'){
      const group=Number(parts[1]),mode=parts[3] as NonNullable<NetworkDevice['ports'][number]['channelMode']>
      if(!Number.isInteger(group)||group<1||group>64||parts[2]!=='mode'||!['active','passive','desirable','auto','on'].includes(mode))return {output:'% Specify channel-group <1-64> mode active|passive|desirable|auto|on.'}
      return {output:'',modifiedPorts:targetPortIds.map(portId=>({portId,channelGroup:group,channelMode:mode}))}
    }
    if(cmd==='no'&&parts[1]==='channel-group')return {output:'',modifiedPorts:targetPortIds.map(portId=>({portId,channelGroup:undefined,channelMode:undefined}))}

    // Speed / Duplex
    if (cmd === 'speed' || cmd === 'duplex') {
      return { output: '% Speed and duplex configuration are not simulated.' }
    }

    // IP Access-Group: ip access-group <id> in|out
    if (cmd === 'ip' && (parts[1]?.toLowerCase() === 'access-group' || parts[1]?.toLowerCase() === 'acc')) {
      const aclId = parts[2]
      const dir = parts[3]?.toLowerCase()
      if (!aclId || (dir !== 'in' && dir !== 'out')) {
        return { output: '% Incomplete or invalid command: ip access-group <id> in|out' }
      }
      const mods = targetPortIds.map((portId) => ({
        portId,
        ...(dir === 'in' ? { inboundAcl: aclId } : { outboundAcl: aclId }),
      }))
      return { output: '', modifiedPorts: mods }
    }

    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ip' && (parts[2]?.toLowerCase() === 'access-group' || parts[2]?.toLowerCase() === 'acc')) {
      const arg3 = parts[3]?.toLowerCase()
      const arg4 = parts[4]?.toLowerCase()
      const dir = arg3 === 'in' || arg3 === 'out' ? arg3 : arg4 === 'in' || arg4 === 'out' ? arg4 : undefined
      const mods = targetPortIds.map((portId) => ({
        portId,
        ...(dir === 'in' ? { inboundAcl: undefined } : dir === 'out' ? { outboundAcl: undefined } : { inboundAcl: undefined, outboundAcl: undefined }),
      }))
      return { output: '', modifiedPorts: mods }
    }

    // IP Helper-Address: ip helper-address <ip>
    if (cmd === 'ip' && (parts[1]?.toLowerCase() === 'helper-address' || parts[1]?.toLowerCase() === 'helper')) {
      const helper = parts[2]
      if (!helper || !isValidIpv4(helper)) {
        return { output: '% Incomplete or invalid IP helper-address format: ip helper-address <ip>' }
      }
      const mods = targetPortIds.map((portId) => ({ portId, helperAddress: helper }))
      return { output: '', modifiedPorts: mods }
    }

    if (cmd === 'no' && parts[1]?.toLowerCase() === 'ip' && (parts[2]?.toLowerCase() === 'helper-address' || parts[2]?.toLowerCase() === 'helper')) {
      const mods = targetPortIds.map((portId) => ({ portId, helperAddress: undefined }))
      return { output: '', modifiedPorts: mods }
    }

    // Cisco ASA nameif: nameif <name>
    if (cmd === 'nameif') {
      const zoneName = parts[1]
      if (!zoneName) {
        return { output: '% Incomplete command: nameif <name>' }
      }
      const isInside = zoneName.toLowerCase() === 'inside'
      const defaultSec = isInside ? 100 : 0
      const assignedSec = activePort.securityLevel !== undefined ? activePort.securityLevel : defaultSec
      const mods = [{ portId: activePort.id, nameif: zoneName, securityLevel: assignedSec }]
      return {
        output: `INFO: Security level for "${zoneName}" set to ${assignedSec} by default.`,
        modifiedPorts: mods,
      }
    }

    if (cmd === 'no' && parts[1]?.toLowerCase() === 'nameif') {
      return {
        output: '',
        modifiedPorts: [{ portId: activePort.id, nameif: undefined, securityLevel: undefined }],
      }
    }

    // Cisco ASA security-level: security-level <0-100>
    if (cmd === 'security-level' || cmd === 'sec') {
      const lvl = parseInt(parts[1], 10)
      if (isNaN(lvl) || lvl < 0 || lvl > 100) {
        return { output: '% Invalid security level (0-100).' }
      }
      return {
        output: '',
        modifiedPorts: [{ portId: activePort.id, securityLevel: lvl }],
      }
    }

    if (cmd === 'do') {
      return handleDoCommand(device, parts.slice(1))
    }

    return { output: `% Invalid input detected at '^' marker.` }
  }

  return { output: `% Ambiguous command: "${rawLine}"` }
}

function handleDoCommand(device: NetworkDevice, parts: string[]): IosExecutionResult {
  const sub0 = parts[0]?.toLowerCase()
  if (sub0 === 'show' || sub0 === 'sh') {
    return handleShowCommands(device, parts.slice(1))
  }
  if (
    sub0 === 'wr' ||
    (sub0 === 'write' && (!parts[1] || parts[1].toLowerCase() === 'memory' || parts[1].toLowerCase() === 'mem')) ||
    (sub0 === 'copy' && (parts[1]?.toLowerCase() === 'run' || parts[1]?.toLowerCase() === 'running-config'))
  ) {
    return { output: 'Building configuration...\n[OK]' }
  }
  if (sub0 === 'ping') {
    if (!parts[1] || !(isValidIpv4(parts[1]) || isValidIpv6(parts[1]))) {
      return { output: '% Incomplete or invalid IP target.' }
    }
    return {
      output: `Sending one ICMP echo to ${parts[1]}. Waiting for the simulated reply.`,
      triggerPing: { targetIp: parts[1] },
    }
  }
  return { output: '' }
}

function handleShowCommands(device: NetworkDevice, parts: string[]): IosExecutionResult {
  const sub1 = parts[0]?.toLowerCase()
  const sub2 = parts[1]?.toLowerCase()
  const sub3 = parts[2]?.toLowerCase()

  if (sub1 === 'snmp') {
    const communities = device.config.snmpCommunities ?? []
    return { output: communities.length ? `SNMP agent enabled.\nCommunities:\n${communities.map(value => `  ${value}  read-only`).join('\n')}\nSupported operations: SNMPv2c GET, GETNEXT\nSystem objects: sysDescr.0, sysContact.0, sysName.0, sysLocation.0` : 'SNMP agent is not configured. Use snmp-server community <community> ro.' }
  }

  if (sub1 === 'clock') {
    const adjustedTime = Date.now() + (device.config.ntpOffsetMs ?? 0)
    return { output: `*${new Date(adjustedTime).toUTCString()}` }
  }
  if(sub1==='standby'||sub1==='hsrp'){
    const requestedGroup=/^\d+$/.test(sub2??'')?Number(sub2):undefined
    const entries=device.ports.flatMap(port=>(port.hsrpGroups??[]).filter(group=>requestedGroup===undefined||group.group===requestedGroup).map(group=>({port,group,runtime:port.hsrpRuntime?.[String(group.group)]})))
    if(!entries.length)return {output:'No HSRP groups configured.'}
    return {output:entries.map(({port,group,runtime})=>`${port.name} - Group ${group.group}\n  State is ${runtime?.state??'Initial'}\n  Virtual IP address is ${group.virtualIp??'not configured'}\n  Priority ${group.priority??100}\n  Preemption ${group.preempt?'enabled':'disabled'}\n  Active router is ${runtime?.activeDeviceName?`${runtime.activeDeviceName} (${runtime.activeIp??'interface address unavailable'})`:'not elected'}`).join('\n\n')}
  }
  if (sub1 === 'ntp' && sub2 === 'status') {
    if (device.config.ntpMaster) return { output: `Clock is synchronized, stratum ${device.config.ntpMasterStratum ?? 8}, reference is 127.127.7.1 (local clock).` }
    if (device.config.ntpSynchronizedAtMs !== undefined && device.config.ntpSynchronizedStratum !== undefined) {
      return { output: `Clock is synchronized, stratum ${device.config.ntpSynchronizedStratum}, reference is ${device.config.ntpServer ?? 'unknown'}; offset is ${(device.config.ntpOffsetMs ?? 0).toFixed(3)} ms.` }
    }
    return { output: 'Clock is unsynchronized, stratum 16, no reference clock.' }
  }
  if (sub1 === 'ntp' && sub2 === 'associations') {
    if (!device.config.ntpServer) return { output: 'No NTP associations configured.' }
    const synchronized = device.config.ntpSynchronizedStratum !== undefined
    const stratum = device.config.ntpSynchronizedStratum ?? 16
    const marker = synchronized ? '*~' : '~'
    const peer = `${marker}${device.config.ntpServer}`.padEnd(21)
    const reference = '127.127.7.1'.padEnd(16)
    const peerStratum = String(stratum).padStart(2).padEnd(6)
    const when = '0'.padEnd(8)
    const poll = '64'.padEnd(7)
    const reach = (synchronized ? '377' : '0').padEnd(7)
    const delay = (synchronized ? '1.000' : '0.000').padEnd(9)
    return { output: `      address             ref clock       st    when    poll   reach   delay    offset   disp\n${peer}${reference}${peerStratum}${when}${poll}${reach}${delay}${(device.config.ntpOffsetMs ?? 0).toFixed(3).padEnd(9)}0.000` }
  }

  // show vlan / show vlan brief (sh vl / sh vl br / show vlans / show vlan-switch / show vlan id <id> / show vlan name <name>)
  if (
    sub1 === 'vlan' ||
    sub1 === 'vl' ||
    sub1 === 'vlans' ||
    sub1 === 'vlan-switch'
  ) {
    const userVlans = device.config.vlans || []

    // 1. Filter by ID: show vlan id 10
    if (sub2 === 'id' && parts[2]) {
      const targetId = parseInt(parts[2], 10)
      if (isNaN(targetId)) return { output: '% Invalid VLAN id.' }
      const found = targetId === 1
        ? { id: 1, name: 'default' }
        : userVlans.find((v) => v.id === targetId)
      if (!found) {
        return { output: `% VLAN id ${targetId} not found in current database` }
      }
      const assigned = device.ports
        .filter((p) => (targetId === 1 ? (!p.vlan || p.vlan === 1) : p.vlan === targetId) && p.portMode !== 'trunk')
        .map((p) => p.shortName)
        .join(', ')
      let out = 'VLAN Name                             Status    Ports\n'
      out += '---- -------------------------------- --------- -------------------------------\n'
      out += `${String(found.id).padEnd(4)} ${(found.name || `VLAN${String(found.id).padStart(4, '0')}`).padEnd(32)} active    ${assigned}`
      return { output: out }
    }

    // 2. Filter by Name: show vlan name zerak
    if (sub2 === 'name' && parts[2]) {
      const targetName = parts.slice(2).join(' ').toLowerCase()
      const found = targetName === 'default'
        ? { id: 1, name: 'default' }
        : userVlans.find((v) => (v.name || '').toLowerCase() === targetName)
      if (!found) {
        return { output: `% VLAN name "${parts.slice(2).join(' ')}" not found in current database` }
      }
      const assigned = device.ports
        .filter((p) => (found.id === 1 ? (!p.vlan || p.vlan === 1) : p.vlan === found.id) && p.portMode !== 'trunk')
        .map((p) => p.shortName)
        .join(', ')
      let out = 'VLAN Name                             Status    Ports\n'
      out += '---- -------------------------------- --------- -------------------------------\n'
      out += `${String(found.id).padEnd(4)} ${(found.name || `VLAN${String(found.id).padStart(4, '0')}`).padEnd(32)} active    ${assigned}`
      return { output: out }
    }

    // 3. Summary: show vlan summary
    if (sub2 === 'summary') {
      const totalVlans = 1 + userVlans.filter((v) => v.id !== 1).length + 4
      return {
        output: `Number of existing VLANs: ${totalVlans}\nNumber of existing VTP VLANs: ${totalVlans}\nNumber of existing extended VLANs: ${userVlans.filter((v) => v.id > 1005).length}`
      }
    }

    // 4. Full Table: show vlan / show vlan brief
    let out = 'VLAN Name                             Status    Ports\n'
    out += '---- -------------------------------- --------- -------------------------------\n'

    // VLAN 1 (default)
    const vlan1Ports = device.ports
      .filter((p) => (!p.vlan || p.vlan === 1) && p.portMode !== 'trunk')
      .map((p) => p.shortName)
      .join(', ')
    out += `1    default                          active    ${vlan1Ports}\n`

    // Custom VLANs
    for (const v of userVlans) {
      if (v.id === 1) continue
      const assigned = device.ports
        .filter((p) => p.vlan === v.id && p.portMode !== 'trunk')
        .map((p) => p.shortName)
        .join(', ')
      const idCol = String(v.id).padEnd(4)
      const nameCol = (v.name || `VLAN${String(v.id).padStart(4, '0')}`).padEnd(32)
      out += `${idCol} ${nameCol} active    ${assigned}\n`
    }

    out += '1002 fddi-default                     act/unsup \n'
    out += '1003 token-ring-default               act/unsup \n'
    out += '1004 fddinet-default                  act/unsup \n'
    out += '1005 trnet-default                    act/unsup \n'
    return { output: out.trimEnd() }
  }

  // show nameif (Cisco ASA)
  if (sub1 === 'nameif') {
    let out = 'Interface                  Name                     Security\n'
    for (const p of device.ports) {
      if (p.nameif) {
        const intCol = p.name.padEnd(27)
        const nameCol = p.nameif.padEnd(25)
        const secCol = String(p.securityLevel ?? 0)
        out += `${intCol}${nameCol}${secCol}\n`
      }
    }
    return { output: out.trimEnd() }
  }

  if (sub1 === 'xlate') {
    const now = Date.now()
    const translations = (device.asaNatTranslations ?? []).filter(translation => translation.expiresAtMs > now)
    const rows = translations.map(translation => {
      const timeoutSeconds = Math.max(0, Math.ceil((translation.expiresAtMs - now) / 1000))
      const local = translation.protocol === 'ICMP' ? `${translation.originalSourceIp}:${translation.originalIdentifier}` : `${translation.originalSourceIp}:${translation.originalSourcePort}`
      const global = translation.protocol === 'ICMP' ? `${translation.translatedSourceIp}:${translation.translatedIdentifier}` : `${translation.translatedSourceIp}:${translation.translatedSourcePort}`
      const remote = translation.protocol === 'ICMP' ? translation.remoteDestinationIp : `${translation.remoteDestinationIp}:${translation.remoteDestinationPort}`
      return `${translation.protocol.toLowerCase()} ${local} ${global} ${remote} ${translation.sourceInterface}->${translation.destInterface} timeout ${timeoutSeconds}s`
    })
    return { output: `TCP/UDP/ICMP NAT translations\n${rows.join('\n') || 'No active translations.'}` }
  }

  // show interface ip brief (Cisco ASA format)
  if ((sub1 === 'interface' || sub1 === 'int') && (sub2 === 'ip' || sub2 === 'brief' || sub2 === 'br')) {
    return handleShowCommands(device, ['ip', 'interface', 'brief'])
  }

  // show access-lists (sh access-lists / show ip access-list)
  if (
    sub1 === 'access-lists' || sub1 === 'access-list' || sub1 === 'acl' ||
    (sub1 === 'ip' && (sub2 === 'access-lists' || sub2 === 'access-list' || sub2 === 'acl'))
  ) {
    const filterId = sub1 === 'ip' ? parts[2] : parts[1]
    return { output: formatAccessLists(device.config.accessLists, filterId) }
  }

  // show ip ospf neighbor (sh ip ospf neighbor)
  if (sub1 === 'ip' && sub2 === 'ospf') {
    if (sub3 === 'neighbor' || sub3 === 'nei') {
      const ospfNets = device.config.ospfNetworks || []
      if (ospfNets.length === 0) {
        return { output: '% OSPF is not configured on this device.' }
      }
      let out = 'Neighbor ID     Pri   State           Dead Time   Address         Interface\n'
      for (const n of device.ospf?.neighbors ?? []) {
        const p = device.ports.find(p => p.id === n.portId)!
        const iface = device.ospf!.interfaces.find(i => i.portId === p.id)!
        const role = ospfNetwork(p) === 'point-to-point' ? '-' : n.address === iface.designatedRouter ? 'DR' : n.address === iface.backupRouter ? 'BDR' : 'DROTHER'
        out += `${n.routerId.padEnd(16)}${String(n.priority).padEnd(6)}${`${n.state.toUpperCase()}/${role}`.padEnd(16)}${String(Math.max(0, Math.ceil((ospfDead(p) * 1000 - (device.ospf!.clock - n.lastHello)) / 1000))).padEnd(12)}${n.address.padEnd(16)}${p.name}\n`
      }
      for (const i of device.ospf?.interfaces ?? []) if (i.lastError) out += `\n% ${i.lastError}`
      if (device.ospf?.lastError) out += `\n% Last rejected packet: ${device.ospf.lastError}`
      return { output: out.trimEnd() }
    }
    if (sub3 === 'database') return { output: `OSPF Router with ID (${device.ospf?.routerId ?? device.config.ospfRouterId ?? 'not started'})\nRouter Link States\n${(device.ospf?.database ?? []).map(e => `${e.lsa.routerId.padEnd(16)} Area ${e.lsa.area} Sequence ${e.lsa.sequence} Age ${Math.floor((device.ospf!.clock - e.receivedAt) / 1000)}`).join('\n')}` }
    if (sub3 === 'interface' || sub3 === 'int') return { output: device.ports.filter(p => ospfArea(device, p) !== undefined).map(p => `${p.name} is ${p.status}, area ${ospfArea(device, p)}\n  Network Type ${ospfNetwork(p)}, Cost: ${ospfCost(p)}\n  Hello ${ospfHello(p)}, Dead ${ospfDead(p)}${ospfPassive(device, p) ? '\n  No Hellos (Passive interface)' : ''}`).join('\n\n') || 'No OSPF interfaces configured.' }
  }

  // show ip bgp [summary | neighbors | table]
  if (sub1 === 'ip' && sub2 === 'bgp') {
    if (device.config.bgpAs === undefined) return { output: '% BGP is not configured on this device.' }
    const as = device.config.bgpAs
    const routerId = device.bgp?.routerId ?? bgpRouterId(device) ?? 'unset'
    const prefixLength = (mask: string) => (ipToNumber(mask).toString(2).match(/1/g) ?? []).length
    const stamp = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(v => String(v).padStart(2, '0')).join(':')
    if (sub3 === 'summary' || sub3 === 'sum' || sub3 === 'neighbors' || sub3 === 'nei') {
      let out = `BGP router identifier ${routerId}, local AS number ${as}\nBGP table version is 1, main routing table version 1\n\nNeighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd\n`
      const peers = [...(device.bgp?.peers ?? [])].sort((a, b) => ipToNumber(a.address) - ipToNumber(b.address))
      for (const peer of peers) {
        const state = peer.state === 'established' ? String(peer.learned.length) : peer.state === 'opensent' ? 'OpenSent' : peer.state === 'openconfirm' ? 'OpenConfirm' : peer.state === 'connecting' ? 'Connect' : 'Idle'
        out += `${peer.address.padEnd(16)}${'4'.padEnd(5)}${String(peer.remoteAs).padEnd(6)}${String(peer.messagesReceived).padEnd(8)}${String(peer.messagesSent).padEnd(9)}${'1'.padEnd(9)}${'0'.padEnd(5)}${'0'.padEnd(5)}${stamp(Math.max(0, Math.floor(((device.bgp?.clock ?? 0) - peer.since) / 1000))).padEnd(9)}${state}\n`
      }
      if (device.bgp?.lastError) out += `\n% Last rejected message: ${device.bgp.lastError}`
      return { output: out.trimEnd() }
    }
    let out = `BGP table version is 1, local router ID is ${routerId}\nStatus codes: s suppressed, d damped, h history, * valid, > best\nOrigin codes: i - IGP, e - EGP, ? - incomplete\n\n   Network          Next Hop            Metric LocPrf Weight Path\n`
    for (const local of device.config.bgpNetworks ?? []) {
      const advertised = device.ports.some(p => p.ipAddress && p.subnetMask && getNetworkAddress(p.ipAddress, p.subnetMask) === local.network && p.subnetMask === local.mask)
      out += `*> ${`${local.network}/${prefixLength(local.mask)}`.padEnd(17)}0.0.0.0              ${'0'.padEnd(7)}${' '.padEnd(7)}32768 i${advertised ? '' : '  (not in routing table)'}\n`
    }
    for (const path of [...(device.bgp?.peers ?? []).flatMap(peer => peer.learned.map(learned => ({ path: learned, peer })))].sort((a, b) => ipToNumber(a.path.network) - ipToNumber(b.path.network))) {
      out += `*> ${`${path.path.network}/${prefixLength(path.path.netmask)}`.padEnd(17)}${path.path.nextHop.padEnd(20)}${'0'.padEnd(7)}${' '.padEnd(7)}${'0'.padEnd(6)}${path.path.asPath.join(' ')} i\n`
    }
    if (device.bgp?.lastError) out += `\n% Last rejected message: ${device.bgp.lastError}`
    return { output: out.trimEnd() }
  }

  // show ip eigrp neighbors | topology | interfaces
  if (sub1 === 'ip' && sub2 === 'eigrp') {
    if (device.config.eigrpAs === undefined) return { output: '% EIGRP is not configured on this device.' }
    const as = device.config.eigrpAs
    const maskLength = (mask: string) => (ipToNumber(mask).toString(2).match(/1/g) ?? []).length
    if (sub3 === 'neighbors' || sub3 === 'nei') {
      let out = `EIGRP-IPv4 Neighbors for AS(${as})\nH   Address                 Interface              Hold Uptime   SRTT   RTO  Q  Seq\n                                   (sec)         (ms)       Cnt Num\n`
      const neighbors = [...(device.eigrp?.neighbors ?? [])].sort((a, b) => ipToNumber(a.address) - ipToNumber(b.address))
      neighbors.forEach((n, index) => {
        const port = device.ports.find(candidate => candidate.id === n.portId)
        const hold = Math.max(0, Math.ceil((n.holdTimeMs - (device.eigrp!.clock - n.lastHello)) / 1000))
        const uptime = Math.floor((device.eigrp!.clock - n.since) / 1000)
        const stamp = [Math.floor(uptime / 3600), Math.floor(uptime % 3600 / 60), uptime % 60].map(v => String(v).padStart(2, '0')).join(':')
        out += `${String(index).padEnd(4)}${n.address.padEnd(24)}${(port?.shortName ?? n.portId).padEnd(23)}${String(hold).padEnd(5)}${stamp.padEnd(9)}${'1'.padEnd(7)}${'100'.padEnd(5)}${'0'.padEnd(3)}${index + 1}\n`
      })
      if (device.eigrp?.lastError) out += `\n% Last rejected packet: ${device.eigrp.lastError}`
      return { output: out.trimEnd() }
    }
    if (sub3 === 'topology' || sub3 === 'top' || sub3 === undefined) {
      const onlyActive = parts[3]?.toLowerCase() === 'active'
      let out = `EIGRP-IPv4 Topology Table for AS(${as})/ID(${eigrpRouterId(device) ?? 'unset'})\n\nCodes: P - Passive, A - Active, U - Update, Q - Query, R - Reply,\n       r - reply Status, s - sia Status\n`
      if (!onlyActive) for (const route of device.routingTable.filter(r => r.type === 'D')) {
        const candidates = (device.eigrp?.candidates ?? []).filter(c => c.network === route.network && c.netmask === route.netmask).sort((a, b) => a.metric - b.metric)
        out += `\nP ${route.network}/${maskLength(route.netmask)}, ${candidates.length || 1} successors, FD is ${route.metric}\n`
        for (const c of candidates) out += `        via ${c.nextHop} (${c.metric}/${c.reportedMetric}), ${device.ports.find(p => p.id === c.portId)?.name ?? c.portId}\n`
      }
      for (const entry of device.eigrp?.topology ?? []) {
        const candidates = (device.eigrp?.candidates ?? []).filter(c => c.network === entry.network && c.netmask === entry.netmask).sort((a, b) => a.metric - b.metric)
        out += `\nA ${entry.network}/${maskLength(entry.netmask)}, ${candidates.length} successors, FD is Inaccessible\n`
        for (const c of candidates) out += `        via ${c.nextHop} (${c.metric}/${c.reportedMetric}), ${device.ports.find(p => p.id === c.portId)?.name ?? c.portId}\n`
        if (entry.pending.length) out += `        Pending replies: ${entry.pending.join(', ')}\n`
        if (entry.origins.length) out += `        Queried by: ${entry.origins.map(origin => origin.address).join(', ')}\n`
      }
      if (device.eigrp?.siaNotice) out += `\n% SIA: ${device.eigrp.siaNotice}`
      return { output: out.trimEnd() }
    }
    if (sub3 === 'interfaces' || sub3 === 'int') {
      let out = `EIGRP-IPv4 Interfaces for AS(${as})\n                              Xmit Queue   PeerQ        Mean   Pacing Time   Multicast    Pending\nInterface              Peers  Un/Reliable  Un/Reliable  SRTT   Un/Reliable   Flow Timer   Routes\n`
      for (const p of device.ports.filter(candidate => eigrpEnabled(device, candidate))) {
        const peers = (device.eigrp?.neighbors ?? []).filter(n => n.portId === p.id).length
        out += `${p.shortName.padEnd(23)}${String(peers).padEnd(7)}0/0          0/0          0      0/1           50           0\n`
      }
      return { output: out.trimEnd() }
    }
  }

  // show ipv6 eigrp neighbors | topology | interfaces
  if (sub1 === 'ipv6' && sub2 === 'eigrp') {
    const as = device.config.ipv6EigrpAs
    if (as === undefined) return { output: '% EIGRPv6 is not configured on this device.' }
    const runtime = device.ipv6Eigrp
    if (sub3 === 'neighbors' || sub3 === 'nei') {
      let out = `EIGRP-IPv6 Neighbors for AS(${as})\nH   Address                                   Interface              Hold Uptime   SRTT   RTO  Q  Seq\n                                                                         (sec)         (ms)       Cnt Num\n`
      ;[...(runtime?.neighbors ?? [])].sort((a, b) => a.address.localeCompare(b.address)).forEach((neighbor, index) => {
        const port = device.ports.find(candidate => candidate.id === neighbor.portId)
        const hold = Math.max(0, Math.ceil((neighbor.holdTimeMs - ((runtime?.clock ?? 0) - neighbor.lastHello)) / 1000))
        const uptime = Math.floor(((runtime?.clock ?? 0) - neighbor.since) / 1000)
        const stamp = [Math.floor(uptime / 3600), Math.floor(uptime % 3600 / 60), uptime % 60].map(value => String(value).padStart(2, '0')).join(':')
        out += `${index}   ${neighbor.address.padEnd(41)}${(port?.name ?? neighbor.portId).padEnd(23)}${String(hold).padEnd(5)}${stamp.padEnd(9)}1      100      0  0\n`
      })
      return { output: out.trimEnd() }
    }
    if (sub3 === 'topology' || sub3 === 'top' || sub3 === undefined) {
      let out = `EIGRP-IPv6 Topology Table for AS(${as})/ID(${device.config.ipv6EigrpRouterId ?? runtime?.routerId ?? 'unset'})\n\nCodes: P - Passive, A - Active, U - Update, Q - Query, R - Reply\n`
      for (const route of (device.ipv6RoutingTable ?? []).filter(entry => entry.type === 'D')) {
        const candidates = (runtime?.candidates ?? []).filter(candidate => candidate.prefix === route.network && candidate.prefixLength === route.prefixLength).sort((a, b) => a.metric - b.metric)
        out += `\nP ${route.network.toUpperCase()}/${route.prefixLength}, ${candidates.length || 1} successors, FD is ${route.metric}\n`
        for (const candidate of candidates) out += `        via ${candidate.nextHop.toUpperCase()} (${candidate.metric}/${candidate.reportedMetric}), ${device.ports.find(port => port.id === candidate.portId)?.name ?? candidate.portId}\n`
      }
      return { output: out.trimEnd() }
    }
    if (sub3 === 'interfaces' || sub3 === 'int') {
      let out = `EIGRP-IPv6 Interfaces for AS(${as})\n\nInterface        Peers  Xmit Queue   Mean   Pacing Time   Multicast    Pending\n                       Un/Reliable  SRTT   Un/Reliable   Flow Timer   Routes\n`
      for (const port of device.ports.filter(candidate => candidate.ipv6EigrpAs === as)) {
        const peers = (runtime?.neighbors ?? []).filter(neighbor => neighbor.portId === port.id).length
        out += `${port.name.padEnd(20)}${String(peers).padEnd(7)}0/0          0      0/1           0            0\n`
      }
      return { output: out.trimEnd() }
    }
    return { output: '% Unsupported command. Try show ipv6 eigrp neighbors, topology, or interfaces.' }
  }

  // show ip interface brief (sh ip int br) vs show ip interface [name]
  if (sub1 === 'ip' && (sub2 === 'int' || sub2 === 'interface')) {
    if (!sub3 || sub3 === 'brief' || sub3 === 'br') {
      let out = 'Interface              IP-Address      OK? Method Status                Protocol\n'
      for (const p of device.ports) {
        const nameCol = p.shortName.padEnd(23)
        const ipCol = (p.ipAddress || 'unassigned').padEnd(16)
        const okCol = 'YES '
        const methodCol = 'manual '
        const operational = interfaceOperational(device, p)
        const statusStr = p.adminStatus === 'down' ? 'administratively down' : operational ? 'up' : 'down'
        const statusCol = statusStr.padEnd(22)
        const protoCol = operational ? 'up' : 'down'
        out += `${nameCol}${ipCol}${okCol}${methodCol}${statusCol}${protoCol}\n`
      }
      return { output: out.trimEnd() }
    } else {
      const targetPorts = device.ports.filter(
        (p) => p.shortName.toLowerCase() === sub3.toLowerCase() || p.name.toLowerCase() === sub3.toLowerCase()
      )
      const portsToShow = targetPorts.length > 0 ? targetPorts : device.ports
      let out = ''
      for (const p of portsToShow) {
        const operational = interfaceOperational(device, p)
        out += `${p.name} is ${operational ? 'up' : 'down'}, line protocol is ${operational ? 'up' : 'down'}\n`
        out += `  Internet address is ${p.ipAddress ? `${p.ipAddress}/${p.subnetMask || '24'}` : 'not set'}\n`
        out += `  Broadcast address is 255.255.255.255\n`
        out += `  Address determined by setup command\n`
        out += `  MTU is 1500 bytes\n`
        out += `  Helper address is ${p.helperAddress || 'not set'}\n`
        out += `  Directed broadcast forwarding is disabled\n`
        out += `  Outgoing access list is ${p.outboundAcl || 'not set'}\n`
        out += `  Inbound  access list is ${p.inboundAcl || 'not set'}\n`
      }
      return { output: out.trimEnd() }
    }
  }

  // show ip route (sh ip ro / show ip route)
  if (sub1 === 'ip' && (sub2 === 'route' || sub2 === 'ro')) {
    let out = `Codes: C - connected, S - static, R - RIP, O - OSPF, D - EIGRP, B - BGP\nGateway of last resort is not set\n\n`
    for (const r of device.routingTable) {
      if (r.type === 'C') {
        const port = device.ports.find(p => p.name === r.interfaceName)
        if (!port || !interfaceOperational(device, port)) continue
        out += `C    ${r.network}/${r.netmask} is directly connected, ${r.interfaceName}\n`
      } else if (r.type === 'S') {
        const tunnel = device.ports.find(port => port.isGreTunnel && port.name === r.interfaceName)
        if (tunnel && !interfaceOperational(device, tunnel)) continue
        out += `S    ${r.network}/${r.netmask} [1/0] ${tunnel ? `via ${tunnel.name}` : `via ${r.nextHop}`}${tunnel ? '' : r.interfaceName ? `, ${r.interfaceName}` : ''}\n`
      } else if (r.type === 'O') {
        out += `O    ${r.network}/${r.netmask} [110/${r.metric}] via ${r.nextHop}, ${r.interfaceName}\n`
      } else if (r.type === 'R') {
        out += `R    ${r.network}/${r.netmask} [120/${r.metric}] via ${r.nextHop}, ${r.interfaceName}\n`
      } else if (r.type === 'D') {
        out += `D    ${r.network}/${r.netmask} [90/${r.metric}] via ${r.nextHop}, ${r.interfaceName}\n`
      } else if (r.type === 'B') {
        out += `B    ${r.network}/${r.netmask} [${r.distance ?? 20}/${r.metric}] via ${r.nextHop}, ${r.interfaceName}\n`
      }
    }
    return { output: out.trimEnd() }
  }

  // show ipv6 interface brief | show ipv6 interface <name> | show ipv6 route | show ipv6 neighbors
  if (sub1 === 'ipv6') {
    if (sub2 === 'interface' || sub2 === 'int') {
      const target = parts[2]
      if (target && target !== 'brief' && target !== 'br') {
        const targets = device.ports.filter((p) => p.shortName.toLowerCase() === target.toLowerCase() || p.name.toLowerCase() === target.toLowerCase())
        if (!targets.length) return { output: `% ${target} is not a valid interface.` }
        let out = ''
        for (const p of targets) {
          const operational = interfaceOperational(device, p)
          const linkLocal = p.macAddress ? ipv6LinkLocalFromMac(p.macAddress) : null
          out += `${p.name} is ${operational ? 'up' : 'down'}, line protocol is ${operational ? 'up' : 'down'}\n`
          out += `  IPv6 is enabled, link-local address is ${linkLocal ? linkLocal.toUpperCase() : 'unassigned'}\n`
          const globals = p.ipv6Addresses ?? []
          out += globals.length
            ? `  Global unicast address(es):\n${globals.map((a) => `    ${a.address.toUpperCase()}, subnet is ${(ipv6NetworkAddress(a.address, a.prefixLength) ?? a.address).toUpperCase()}/${a.prefixLength}`).join('\n')}\n`
            : '  Global unicast address(es): none\n'
          out += `  MTU is 1500 bytes\n`
        }
        return { output: out.trimEnd() }
      }
      let out = ''
      for (const p of device.ports) {
        const operational = interfaceOperational(device, p)
        const state = p.adminStatus === 'down' ? 'administratively down/down' : operational ? 'up/up' : 'down/down'
        out += `${p.shortName.padEnd(27)}[${state}]\n`
        const linkLocal = p.macAddress ? ipv6LinkLocalFromMac(p.macAddress) : null
        if (linkLocal) out += `    ${linkLocal.toUpperCase()}\n`
        for (const a of p.ipv6Addresses ?? []) out += `    ${a.address.toUpperCase()}\n`
      }
      return { output: out.trimEnd() }
    }
    if (sub2 === 'route' || sub2 === 'ro') {
      const entries: Array<{ code: string; network: string; prefixLength: number; distance: number; metric: number; detail: string }> = []
      const seen = new Set<string>()
      for (const p of device.ports) {
        if (!interfaceOperational(device, p)) continue
        for (const a of p.ipv6Addresses ?? []) {
          if (isIpv6LinkLocal(a.address)) continue
          const network = ipv6NetworkAddress(a.address, a.prefixLength)
          if (!network) continue
          const key = `C|${network}/${a.prefixLength}`
          if (seen.has(key)) continue
          seen.add(key)
          entries.push({ code: 'C', network, prefixLength: a.prefixLength, distance: 0, metric: 0, detail: `via ${p.name}, directly connected` })
        }
      }
      for (const route of device.ipv6RoutingTable ?? []) {
        const network = ipv6NetworkAddress(route.network, route.prefixLength) ?? route.network
        const key = `R|${route.type}|${network}/${route.prefixLength}|${route.nextHop}`
        if (seen.has(key)) continue
        seen.add(key)
        entries.push({
          code: route.type === 'O' ? 'O' : route.type === 'D' ? 'D' : 'S',
          network,
          prefixLength: route.prefixLength,
          distance: route.type === 'O' ? 110 : route.type === 'D' ? 90 : 1,
          metric: route.metric,
          detail: `via ${route.nextHop.toUpperCase()}${route.interfaceName ? `, ${route.interfaceName}` : ''}`,
        })
      }
      const header = `IPv6 Routing Table - default - ${entries.length} entries\nCodes: C - Connected, S - Static, O - OSPF, D - EIGRP`
      return { output: entries.length ? `${header}\n${entries.map((e) => `${e.code}   ${e.network.toUpperCase()}/${e.prefixLength} [${e.distance}/${e.metric}]\n     ${e.detail}`).join('\n')}` : `${header}\nNo IPv6 routes.` }
    }
    if (sub2 === 'neighbors' || sub2 === 'nei') {
      const entries = device.ipv6NeighborTable ?? []
      const header = 'IPv6 Address                             Age   Link-layer Address   Interface  State'
      return { output: entries.length ? `${header}\n${entries.map((e) => `${e.address.toUpperCase().padEnd(41)}${String(e.age).padEnd(6)}${e.macAddress.toUpperCase().padEnd(21)}${e.interfaceName.padEnd(11)}REACH`).join('\n')}` : `${header}\n(no entries)` }
    }
    if (sub2 === 'dhcp') {
      if (sub3 === 'pool' || sub3 === 'po') {
        const pools = device.config.dhcpv6Pools ?? []
        if (!pools.length) return { output: 'No DHCPv6 pools configured.' }
        const bindings = device.config.dhcpv6Bindings ?? []
        return {
          output: pools.map((pool) => {
            const active = bindings.filter((binding) => {
              const network = ipv6NetworkAddress(binding.address, pool.prefixLength)
              return network !== null && parseIpv6(network) === parseIpv6(pool.prefix)
            }).length
            return `DHCPv6 pool: ${pool.name}\n  Address allocation prefix: ${pool.prefix.toUpperCase()}/${pool.prefixLength}${pool.startAddress ? `\n  Start address: ${pool.startAddress.toUpperCase()}` : ''}\n  Active clients: ${active}`
          }).join('\n\n'),
        }
      }
      if (sub3 === 'binding' || sub3 === 'bind') {
        const bindings = device.config.dhcpv6Bindings ?? []
        return {
          output: bindings.length
            ? bindings.map((binding) => `Client: ${binding.clientMac.toUpperCase()}\n  Address: ${binding.address.toUpperCase()}`).join('\n')
            : 'No active DHCPv6 bindings.',
        }
      }
    }
    if (sub2 === 'ospf' || sub2 === 'ospfv3') {
      const process = device.config.ipv6OspfProcessId
      const faces = device.ports.filter((p) => p.ipv6OspfArea !== undefined)
      if (process === undefined && !faces.length) return { output: '% OSPFv3 is not configured on this device.' }
      const runtime = device.ospfv3
      if (sub3 === 'neighbor' || sub3 === 'nei') {
        let out = ''
        for (const n of runtime?.neighbors ?? []) {
          const p = device.ports.find((port) => port.id === n.portId)
          const role = !p || ipv6OspfNetwork(p) === 'point-to-point' ? '-' : n.designatedRouter === n.routerId ? 'DR' : n.backupRouter === n.routerId ? 'BDR' : 'DROTHER'
          const dead = Math.max(0, Math.ceil((ipv6OspfDead() * 1000 - ((runtime?.clock ?? 0) - n.lastHello)) / 1000))
          out += `${n.routerId.padEnd(16)}${String(n.priority).padEnd(6)}${`${n.state.toUpperCase()}/${role}`.padEnd(16)}${String(dead).padEnd(12)}${(p?.name ?? n.portId).padEnd(16)}${n.address.toUpperCase()}\n`
        }
        for (const i of device.ospfv3?.interfaces ?? []) if (i.lastError) out += `\n% ${i.lastError}`
        if (device.ospfv3?.lastError) out += `\n% Last rejected packet: ${device.ospfv3.lastError}`
        return { output: out.trimEnd() || 'No OSPFv3 neighbors.' }
      }
      if (sub3 === 'database' || sub3 === 'db') {
        return { output: `OSPFv3 Router with ID (${runtime?.routerId ?? device.config.ipv6OspfRouterId ?? 'not started'})\nRouter Link States\n${(runtime?.database ?? []).map((e) => `${e.lsa.routerId.padEnd(16)} Area ${e.lsa.area} Sequence ${e.lsa.sequence} Age ${Math.floor(((runtime?.clock ?? 0) - e.receivedAt) / 1000)}`).join('\n') || '(empty)'}` }
      }
      if (sub3 === 'interface' || sub3 === 'int') {
        return { output: faces.map((p) => `${p.name} is ${interfaceOperational(device, p) ? 'up' : 'down'}, area ${p.ipv6OspfArea}\n  Network Type ${ipv6OspfNetwork(p)}, Cost: ${ipv6OspfCost(p)}\n  Hello ${ipv6OspfHello()}, Dead ${ipv6OspfDead()}`).join('\n\n') || 'No OSPFv3 interfaces configured.' }
      }
      return { output: `Routing Process "ospfv3 ${process ?? 1}" with ID ${runtime?.routerId ?? device.config.ipv6OspfRouterId ?? 'not started'}\n  Intra-area OSPFv3, administrative distance 110\n  Interfaces:\n${faces.map((p) => `    ${p.name} area ${p.ipv6OspfArea}`).join('\n') || '    none'}\n  Neighbors: ${runtime?.neighbors.filter((n) => n.state === 'Full').length ?? 0} full` }
    }
    return { output: '% Unsupported command. Try show ipv6 interface brief, show ipv6 route, or show ipv6 neighbors.' }
  }

  // show mac address-table (sh mac add / show mac-address-table)
  if (
    (sub1 === 'mac' && (sub2 === 'address-table' || sub2 === 'address' || sub2 === 'add')) ||
    sub1 === 'mac-address-table'
  ) {
    let out = '          Mac Address Table\n-------------------------------------------\nVlan    Mac Address       Type        Ports\n----    -----------       --------    -----\n'
    for (const m of device.macTable) {
      out += `${m.vlan.toString().padEnd(8)}${m.macAddress.padEnd(18)}DYNAMIC     ${m.portId}\n`
    }
    if (device.macTable.length === 0) {
      out += 'Total Mac Addresses for this criterion: 0\n'
    }
    return { output: out.trimEnd() }
  }

  // show interfaces switchport / trunk
  if (sub1 === 'int' || sub1 === 'interfaces') {
    if (sub2 === 'switchport' || sub3 === 'switchport' || sub2 === 'sw') {
      let out = ''
      for (const p of device.ports) {
        const mode = p.portMode || 'access'
        const accessVlan = p.vlan || 1
        out += `Name: ${p.shortName}\n`
        out += `Switchport: Enabled\n`
        out += `Administrative Mode: static ${mode}\n`
        out += `Operational Mode: ${mode}\n`
        out += `Administrative Trunking Encapsulation: dot1q\n`
        out += `Operational Trunking Encapsulation: dot1q\n`
        out += `Negotiation of Trunking: Off\n`
        out += `Access Mode VLAN: ${accessVlan} (default)\n`
        out += `Trunking Native Mode VLAN: ${p.nativeVlan??1}\n`
        out += `Administrative Native VLAN tagging: disabled\n!\n`
      }
      return { output: out.trimEnd() }
    }
    if (sub2 === 'trunk' || sub3 === 'trunk' || sub2 === 'tru') {
      let out = 'Port        Mode         Encapsulation  Status        Native vlan\n'
      for (const p of device.ports) {
        if (p.portMode === 'trunk') {
          out += `${p.shortName.padEnd(12)}on           802.1q         ${p.status==='up'?'trunking':'not-trunking'}      ${p.nativeVlan??1}\n`
        }
      }
      out += '\nPort        Vlans allowed on trunk\n'
      for(const p of device.ports.filter(p=>p.portMode==='trunk'))out += `${p.shortName.padEnd(12)}${p.allowedVlans?.join(',')??'1-4094'}\n`
      return { output: out.trimEnd() }
    }
  }

  // show spanning-tree (sh span): device-local views; the workspace CLI adds live topology (roles, root cost)
  if (sub1 === 'spanning-tree' || sub1 === 'span') {
    if (sub2 === 'mst' && sub3 === 'configuration') return { output: formatMstConfiguration(device) }
    return { output: formatStpSummary(device) }
  }

  // show version (sh ver)
  if (sub1 === 'version' || sub1 === 'ver') {
    let out = `Cisco IOS Software, ${device.model} Software (${device.model}-LANBASEK9-M), Version 15.1(4)M4, RELEASE SOFTWARE (fc1)\n`
    out += 'wireX simulator: open Help for supported features.\n'
    out += `ROM: Bootstrap program is ${device.model} boot loader\n`
    out += `${device.name} uptime is 1 hour, 15 minutes\n`
    out += `System returned to ROM by power-on\n`
    out += `Cisco WS-${device.model} processor with 65536K bytes of memory.\n`
    out += `${device.ports.length} Ethernet interfaces\n`
    out += `Configuration register is 0x2102\n`
    return { output: out.trimEnd() }
  }

  // show cdp neighbors (sh cdp nei)
  if (sub1 === 'cdp' && (sub2 === 'neighbors' || sub2 === 'nei')) {
    let out = 'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge\n'
    out += '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone\n\n'
    out += 'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID\n'
    for (const p of device.ports) {
      if (p.connectedDeviceId) {
        out += `${p.connectedDeviceId.substring(0, 16).padEnd(17)}${p.shortName.padEnd(18)}148          S I         2960      ${p.connectedPortId || 'Fa0/1'}\n`
      }
    }
    return { output: out.trimEnd() }
  }

  // show arp (sh arp)
  if (sub1 === 'arp') {
    let out = 'Protocol  Address          Age (min)  Hardware Addr   Type   Interface\n'
    for (const a of device.arpTable) {
      out += `Internet  ${a.ipAddress.padEnd(17)}-          ${a.macAddress.padEnd(16)}ARPA   ${a.interfaceName}\n`
    }
    if (device.arpTable.length === 0) {
      out += 'No ARP entries found.\n'
    }
    return { output: out.trimEnd() }
  }

  // show ip protocols
  if (sub1 === 'ip' && (sub2 === 'protocols' || sub2 === 'proto')) {
    const lines = []
    if (device.config.ospfNetworks?.length) lines.push(`Routing Protocol is "ospf ${device.config.ospfProcessId ?? 1}"\n  Router ID ${device.ospf?.routerId ?? device.config.ospfRouterId ?? 'pending startup'}\n  Intra-area OSPFv2, administrative distance 110\n  Routing for Networks:\n${device.config.ospfNetworks.map(n => `    ${n.network} ${n.wildcard} area ${n.area}`).join('\n')}`)
    if (device.config.ipv6OspfProcessId !== undefined) lines.push(`Routing Protocol is "ospfv3 ${device.config.ipv6OspfProcessId}"\n  Router ID ${device.ospfv3?.routerId ?? device.config.ipv6OspfRouterId ?? 'pending startup'}\n  Intra-area OSPFv3, administrative distance 110\n  Interfaces:\n${device.ports.filter((p) => p.ipv6OspfArea !== undefined).map((p) => `    ${p.name} area ${p.ipv6OspfArea}`).join('\n')}`)
    if (device.config.ripNetworks?.length) lines.push(`Routing Protocol is "rip"\n  Sending updates every 30 seconds, invalid after 180, flushed 60 seconds after invalidation\n  Default version control: send version ${device.config.ripVersion ?? 1}, receive ${device.config.ripVersion ?? 'any version'}\n  Automatic network summarization is ${device.config.ripAutoSummary === false ? 'not in effect' : 'in effect'}\n  Administrative distance: 120\n  Routing for Networks:\n${device.config.ripNetworks.map(n => `    ${n}`).join('\n')}\n  Passive Interfaces:\n${device.ports.filter(p => device.config.ripPassiveInterfaces?.includes(p.name) || device.config.ripPassiveDefault && !device.config.ripActiveInterfaces?.includes(p.name)).map(p => `    ${p.name}`).join('\n')}\n  Routing Information Sources:\n${device.rip?.neighbors.map(n => `    ${n.address} on ${device.ports.find(p => p.id === n.portId)?.name}, last update ${Math.floor((device.rip!.clock - n.lastUpdate) / 1000)} seconds ago`).join('\n') || '    none'}${device.rip?.lastError ? `\n  Last rejected update: ${device.rip.lastError}` : ''}`)
    if (device.config.eigrpAs !== undefined) lines.push(`Routing Protocol is "eigrp ${device.config.eigrpAs}"\n  EIGRP router ID: ${eigrpRouterId(device) ?? 'not selected'}\n  Administrative distance: internal 90\n  Automatic network summarization is ${device.config.eigrpAutoSummary ? 'in effect' : 'not in effect'}\n  Routing for Networks:\n${(device.config.eigrpNetworks ?? []).map(n => `    ${n.network} ${n.wildcard}`).join('\n')}\n  Passive Interfaces:\n${device.ports.filter(p => eigrpPassive(device, p)).map(p => `    ${p.name}`).join('\n')}\n  EIGRP Neighbors:\n${device.eigrp?.neighbors.map(n => `    ${n.address} on ${device.ports.find(p => p.id === n.portId)?.name ?? n.portId}, hold ${Math.max(0, Math.ceil((n.holdTimeMs - (device.eigrp!.clock - n.lastHello)) / 1000))} seconds`).join('\n') || '    none'}${device.eigrp?.lastError ? `\n  Last rejected packet: ${device.eigrp.lastError}` : ''}`)
    if (device.config.bgpAs !== undefined) lines.push(`Routing Protocol is "bgp ${device.config.bgpAs}"\n  BGP router ID: ${device.bgp?.routerId ?? bgpRouterId(device) ?? 'not selected'}\n  External administrative distance: 20; internal: 200\n  eBGP path-vector peering, keepalive ${Math.floor(60000 / 1000)} seconds, hold time ${Math.floor(180000 / 1000)} seconds\n  Routing for Networks:\n${(device.config.bgpNetworks ?? []).map(n => `    ${n.network} mask ${n.mask}`).join('\n') || '    none'}\n  BGP Neighbors:\n${device.bgp?.peers.map(peer => `    ${peer.address}, remote AS ${peer.remoteAs}, ${peer.state === 'established' ? `up ${Math.max(0, Math.floor((device.bgp!.clock - peer.since) / 1000))} seconds, ${peer.learned.length} prefixes` : `state ${peer.state}`}`).join('\n') || '    none'}${device.bgp?.lastError ? `\n  Last rejected message: ${device.bgp.lastError}` : ''}`)
    return { output: lines.join('\n\n') || 'No dynamic routing protocols configured.' }
  }

  // show ip dhcp binding
  if (sub1 === 'ip' && sub2 === 'dhcp' && sub3 === 'binding') {
    const now=Date.now()
    const rows=(device.config.dhcpBindings??[]).filter(binding=>binding.acquiredAtMs+binding.leaseDurationSeconds*1000>now).map(binding=>{
      const remaining=Math.max(0,Math.ceil((binding.acquiredAtMs+binding.leaseDurationSeconds*1000-now)/1000))
      return `${binding.ipAddress.padEnd(18)}${binding.clientIdentifier.padEnd(24)}${`${remaining}s`.padEnd(12)}${binding.type==='manual'?'Manual':'Automatic'} ${binding.hardwareAddress}`
    })
    return {output:`IP address        Client-ID                Lease remaining Type\n${rows.join('\n')||'No active DHCP bindings.'}`}
  }
  if(sub1==='ip'&&sub2==='dhcp'&&sub3==='pool')return {output:(device.config.dhcpPools||[]).map(pool=>`Pool ${pool.name}:\n ${pool.hostIp?`Host ${pool.hostIp} ${pool.hostMask??pool.mask}`:`Network ${pool.network} ${pool.mask}`}\n${pool.hardwareAddress?` Hardware address ${pool.hardwareAddress}\n`:''}${pool.clientIdentifier?` Client identifier ${pool.clientIdentifier}\n`:''} Default router ${pool.defaultRouter||'not configured'}\n DNS server ${pool.dnsServer||'not configured'}\n Lease ${pool.leaseDurationSeconds ?? 86400} seconds`).join('\n\n')||'No DHCP pools configured.'}

  // show history (sh hist)
  if (sub1 === 'history' || sub1 === 'hist') {
    return { output: device.cliHistory.slice(-20).join('\n') }
  }

  // show running-config (sh run / show run)
  if (sub1 === 'run' || sub1 === 'running-config' || sub1 === 'running') {
    let out = `Building configuration...\n\nCurrent configuration : 1580 bytes\n!\nversion 15.1\n`
    out += `hostname ${device.config.hostname || device.name}\n!\n`
    if(device.config.ipRouting!==undefined)out+=`${device.config.ipRouting?'ip routing':'no ip routing'}\n!\n`
    if(device.config.ipv6Routing)out+='ipv6 unicast-routing\n'
    if(device.config.ntpMaster)out+=`ntp master${(device.config.ntpMasterStratum ?? 8) === 8 ? '' : ` ${device.config.ntpMasterStratum}`}\n`
    if(device.config.ntpServer)out+=`ntp server ${device.config.ntpServer}\n`
    for (const community of device.config.snmpCommunities ?? []) out += `snmp-server community ${community} ro\n`
    if (device.config.snmpSystemContact) out += `snmp-server contact ${device.config.snmpSystemContact}\n`
    if (device.config.snmpSystemLocation) out += `snmp-server location ${device.config.snmpSystemLocation}\n`
    for(const [vlan,priority] of Object.entries(device.config.stpPriorities||{}))out+=`spanning-tree vlan ${vlan} priority ${priority}\n`
    if(device.config.portfastDefault)out+='spanning-tree portfast default\n'
    if(device.config.stpMode)out+=`spanning-tree mode ${device.config.stpMode}\n`
    for(const [instance,priority] of Object.entries(device.config.mstPriorities||{}))out+=`spanning-tree mst ${instance} priority ${priority}\n`
    if(device.config.mstName!==undefined||device.config.mstRevision!==undefined||(device.config.mstInstances?.length??0)>0){
      out+='spanning-tree mst configuration\n'
      if(device.config.mstName!==undefined)out+=` name ${device.config.mstName}\n`
      if(device.config.mstRevision!==undefined)out+=` revision ${device.config.mstRevision}\n`
      for(const entry of device.config.mstInstances??[])out+=` instance ${entry.instance} vlan ${compressVlanRanges(entry.vlans)}\n`
    }

    if (device.config.secretPassword) {
      out += `enable secret ${device.config.secretPassword}\n!\n`
    }

    if (device.config.vlans && device.config.vlans.length > 0) {
      for (const v of device.config.vlans) {
        if (v.id !== 1) {
          out += `vlan ${v.id}\n name ${v.name}\n!\n`
        }
      }
    }

    if (device.config.defaultGateway) {
      out += `ip default-gateway ${device.config.defaultGateway}\n!\n`
    }

    for (const p of device.ports) {
      out += `interface ${p.name}\n`
      if (p.description) {
        out += ` description ${p.description}\n`
      }
      if (p.nameif) {
        out += ` nameif ${p.nameif}\n`
      }
      if (p.securityLevel !== undefined) {
        out += ` security-level ${p.securityLevel}\n`
      }
      if (p.portMode === 'trunk') {
        out += ` switchport mode trunk\n`
        if(p.allowedVlans)out+=` switchport trunk allowed vlan ${p.allowedVlans.length?p.allowedVlans.join(','):'none'}\n`
        if(p.nativeVlan)out+=` switchport trunk native vlan ${p.nativeVlan}\n`
      } else if (device.type === 'switch' && (p.portMode === 'access' || p.vlan)) {
        out += ` switchport mode access\n`
        if (p.vlan && p.vlan !== 1) {
          out += ` switchport access vlan ${p.vlan}\n`
        }
      }
      if (p.voiceVlan) out += ` switchport voice vlan ${p.voiceVlan}\n`
      if(p.channelGroup)out+=` channel-group ${p.channelGroup} mode ${p.channelMode}\n`
      if(p.portfast)out+=' spanning-tree portfast\n'
      if(p.stpCost)out+=` spanning-tree cost ${p.stpCost}\n`
      if(p.stpLinkType)out+=` spanning-tree link-type ${p.stpLinkType}\n`
      if (p.dot1qVlan !== undefined) out += ` encapsulation dot1Q ${p.dot1qVlan}${p.dot1qNative ? ' native' : ''}\n`
      for (const [option, value] of [['network', p.ospfNetworkType], ['cost', p.ospfCost], ['priority', p.ospfPriority], ['hello-interval', p.ospfHelloInterval], ['dead-interval', p.ospfDeadInterval]]) if (value !== undefined) out += ` ip ospf ${option} ${value}\n`
      if (p.ipAddress && p.subnetMask) {
        out += ` ip address ${p.ipAddress} ${p.subnetMask}\n`
      } else {
        out += ` no ip address\n`
      }
      for (const address of p.ipv6Addresses ?? []) if (address.source !== 'slaac' && address.source !== 'dhcpv6') out += ` ipv6 address ${address.address}/${address.prefixLength}\n`
      if (p.ipv6Autoconfig) out += ' ipv6 address autoconfig\n'
      if (p.ipv6Dhcp) out += ' ipv6 address dhcp\n'
      if (p.ipv6DhcpServerPool) out += ` ipv6 dhcp server ${p.ipv6DhcpServerPool}\n`
      if (p.ipv6NdManagedConfig) out += ' ipv6 nd managed-config-flag\n'
      if (p.ipv6NdOtherConfig) out += ' ipv6 nd other-config-flag\n'
      if (p.ipv6OspfArea !== undefined) out += ` ipv6 ospf ${p.ipv6OspfProcess ?? device.config.ipv6OspfProcessId ?? 1} area ${p.ipv6OspfArea}\n`
      if (p.ipv6OspfCost !== undefined) out += ` ipv6 ospf cost ${p.ipv6OspfCost}\n`
      if (p.ipv6OspfPriority !== undefined) out += ` ipv6 ospf priority ${p.ipv6OspfPriority}\n`
      if (p.ipv6EigrpAs !== undefined) out += ` ipv6 eigrp ${p.ipv6EigrpAs}\n`
      if (p.inboundAcl) out += ` ip access-group ${p.inboundAcl} in\n`
      if (p.outboundAcl) out += ` ip access-group ${p.outboundAcl} out\n`
      if (p.helperAddress) out += ` ip helper-address ${p.helperAddress}\n`
      for(const group of [...(p.hsrpGroups??[])].sort((a,b)=>a.group-b.group)){
        if(group.virtualIp)out+=` standby ${group.group} ip ${group.virtualIp}\n`
        if(group.priority!==undefined)out+=` standby ${group.group} priority ${group.priority}\n`
        if(group.preempt)out+=` standby ${group.group} preempt\n`
      }
      if (p.isGreTunnel) {
        if (p.greSourceInterface) out += ` tunnel source ${p.greSourceInterface}\n`
        if (p.greDestinationIp) out += ` tunnel destination ${p.greDestinationIp}\n`
        if (p.greMode) out += ` tunnel mode ${p.greMode}\n`
        if (p.greKeepalivePeriodSeconds) out += ` keepalive ${p.greKeepalivePeriodSeconds} ${p.greKeepaliveRetries ?? 3}\n`
      }
      if (p.adminStatus === 'down') {
        out += ` shutdown\n`
      } else {
        out += ` no shutdown\n`
      }
      out += `!\n`
    }

    if (device.type === 'security') {
      let objectIndex = 0
      for (const rule of device.config.asaNatRules ?? []) {
        if (rule.type !== 'dynamic-pat') continue
        const [network, prefixText] = rule.sourceNet.split('/')
        const prefix = Number(prefixText)
        if (!isValidIpv4(network) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) continue
        const mask = subnetMaskForPrefix(prefix)
        objectIndex++
        out += `object network WIREX_PAT_${objectIndex}\n subnet ${getNetworkAddress(network, mask)} ${mask}\n nat (${rule.sourceInterface},${rule.destInterface}) dynamic interface\n!\n`
      }
    }

    if (device.config.ripNetworks?.length) out += `${ripConfigLines(device).join('\n')}\n`

    if (device.config.eigrpAs !== undefined) out += `${eigrpConfigLines(device).join('\n')}\n`
    if (device.config.bgpAs !== undefined) out += `${bgpConfigLines(device).join('\n')}\n`

    const ospfLines = ospfConfigLines(device)
    const processStart = ospfLines.findIndex(line => line.startsWith('router ospf '))
    if (processStart >= 0) out += `${ospfLines.slice(processStart).join('\n')}\n`

    const ospfv3Lines = ipv6OspfConfigLines(device)
    const ospfv3Start = ospfv3Lines.findIndex(line => line.startsWith('ipv6 router ospf '))
    if (ospfv3Start >= 0) out += `${ospfv3Lines.slice(ospfv3Start).join('\n')}\n`

    const eigrpV6Lines = ipv6EigrpConfigLines(device)
    const eigrpV6Start = eigrpV6Lines.findIndex(line => line.startsWith('ipv6 router eigrp '))
    if (eigrpV6Start >= 0) out += `${eigrpV6Lines.slice(eigrpV6Start).join('\n')}\n`

    for (const r of device.routingTable) {
      if (r.type === 'S') {
        out += `ip route ${r.network} ${r.netmask} ${r.interfaceName && device.ports.some(port => port.isGreTunnel && port.name === r.interfaceName) ? r.interfaceName : r.nextHop}\n`
      }
    }

    for (const r of device.ipv6RoutingTable ?? []) {
      if (r.type === 'S') {
        out += `ipv6 route ${r.network}/${r.prefixLength} ${r.nextHop}\n`
      }
    }

    for (const pool of device.config.dhcpv6Pools ?? []) {
      out += `ipv6 dhcp pool ${pool.name}\n address prefix ${pool.prefix}/${pool.prefixLength}\n`
    }

    for (const excluded of device.config.excludedDhcpIps || []) out += `ip dhcp excluded-address ${excluded}\n`
    for (const pool of device.config.dhcpPools || []) {
      out += `ip dhcp pool ${pool.name}\n ${pool.hostIp?`host ${pool.hostIp} ${pool.hostMask??pool.mask}`:`network ${pool.network} ${pool.mask}`}\n`
      if(pool.hardwareAddress)out += ` hardware-address ${pool.hardwareAddress} ethernet\n`
      if(pool.clientIdentifier)out += ` client-identifier ${pool.clientIdentifier}\n`
      if(pool.defaultRouter)out += ` default-router ${pool.defaultRouter}\n`
      if(pool.dnsServer)out += ` dns-server ${pool.dnsServer}\n`
      if(pool.tftpServer)out += ` option 150 ip ${pool.tftpServer}\n`
      if(pool.leaseDurationSeconds) {
        const days=Math.floor(pool.leaseDurationSeconds/86400),hours=Math.floor(pool.leaseDurationSeconds%86400/3600),minutes=Math.floor(pool.leaseDurationSeconds%3600/60)
        out += ` lease ${days} ${hours} ${minutes}\n`
      }
      out += '!\n'
    }
    const telephony=device.config.telephony
    if(telephony?.sourceIp) {
      out += `telephony-service\n max-ephones ${telephony.maxEphones || 0}\n max-dn ${telephony.maxDn || 0}\n ip source-address ${telephony.sourceIp} port ${telephony.port || 2000}\n`
      if(telephony.autoAssign)out += ` auto assign ${telephony.autoAssign.start} to ${telephony.autoAssign.end}\n`
      out += '!\n'
      for(const dn of telephony.directoryNumbers)out += `ephone-dn ${dn.id}\n number ${dn.number}\n!\n`
      for(const phone of telephony.ephones) {
        out += `ephone ${phone.id}\n`
        if(phone.macAddress)out += ` mac-address ${phone.macAddress.match(/.{4}/g)?.join('.') || phone.macAddress}\n`
        if(phone.buttons.length)out += ` button ${phone.buttons.map(button=>`${button.line}:${button.dn}`).join(' ')}\n`
        out += '!\n'
      }
    }
    const aclLines = formatAclRunningConfig(device.config.accessLists)
    for (const aclLine of aclLines) {
      out += `${aclLine}\n`
    }
    out += `line con 0\n password cisco\n login\nline vty 0 4\n password cisco\n login\n!\n`
    out += `end`
    return { output: out }
  }

  // show startup-config (sh start)
  if (sub1 === 'start' || sub1 === 'startup-config') {
    return handleShowCommands(device, ['running-config'])
  }

  return { output: `% Unrecognized command: "show ${parts.join(' ')}"` }
}

function handleContextualHelp(device: NetworkDevice): IosExecutionResult {
  switch (device.currentCliMode) {
    case 'user':
      return {
        output: `Exec commands:\n  enable      Turn on privileged commands\n  exit        Exit from the EXEC\n  ping        Send echo messages\n  show        Show running system information\n  traceroute  Trace route to destination`,
      }
    case 'priv':
      return {
        output: `Exec commands:\n  configure   Enter configuration mode\n  copy        Copy configuration\n  disable     Turn off privileged commands\n  erase       Erase non-volatile storage\n  exit        Exit from the EXEC\n  ping        Send echo messages\n  reload      Halt and perform a cold restart\n  show        Show running system information\n  traceroute  Trace route to destination\n  write       Write running configuration to memory`,
      }
    case 'config':
      return {
        output: `Configure commands:\n  banner      Define a login banner\n  do          To run exec commands in config mode\n  enable      Modify enable password parameters\n  end         Exit to privileged EXEC mode\n  exit        Exit from configure mode\n  hostname    Set system's network name\n  interface   Select an interface to configure\n  ip          Global IP configuration subcommands\n  line        Configure a terminal line\n  no          Negate a command or set its defaults\n  router      Enable a routing process\n  spanning-tree Spanning Tree Subsystem\n  vlan        VLAN configuration commands`,
      }
    case 'config-vlan':
      return {
        output: `VLAN configuration commands:\n  exit        Apply changes and bump to higher configuration level\n  name        Ascii name of the VLAN\n  no          Negate a command or set its defaults`,
      }
    case 'config-if':
      return {
        output: `Interface configuration commands:\n  description Interface specific description\n  do          To run exec commands in config mode\n  duplex      Configure duplex operation\n  exit        Exit from interface configuration mode\n  ip          Interface Internet Protocol config subcommands\n  no          Negate a command or set its defaults\n  shutdown    Shutdown the selected interface\n  speed       Configure speed operation\n  switchport  Set switching characteristics of the interface`,
      }
    case 'config-subif':
      return {
        output: `Sub-interface configuration commands:\n  encapsulation Set encapsulation type (e.g. dot1Q)\n  ip            Interface Internet Protocol config subcommands\n  exit          Exit from sub-interface configuration mode`,
      }
    case 'config-line':
      return {
        output: `Line configuration commands:\n  exit        Exit from line configuration mode\n  login       Enable password checking\n  password    Set a password\n  transport   Define transport protocols`,
      }
    case 'config-router':
      return {
        output: `Router configuration commands:\n  exit        Exit from routing protocol configuration mode\n  network     Enable routing on an IP network\n  no          Negate a command or set its defaults\n  version     Set routing protocol version`,
      }
    case 'config-dhcp':
      return {
        output: `DHCP pool configuration commands:\n  default-router Default routers\n  dns-server     Domain Name System servers\n  exit           Exit from DHCP configuration mode\n  network        Network number and mask`,
      }
    default:
      return { output: '' }
  }
}
