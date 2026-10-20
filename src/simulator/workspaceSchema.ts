import type { NetworkDevice, NetworkLink, NetworkAnnotation, DeviceWindow, PhysicalContainer, PhysicalContainerKind, PhysicalWorkspaceState, NetworkCluster } from '@/types/network'
import { PHYSICAL_CONTAINER_KINDS } from '@/types/network'
import { allowedChildKinds, canHoldDevices } from './physical'
import { isInSameSubnet, isValidIpv4 } from './protocols/ip'
import { isValidTftpFileName, MAX_TFTP_FILE_BYTES } from './tftp'
import { isValidSnmpCommunity } from './snmp'
import { TRAFFIC_GENERATOR_MAX_INTERVAL_SECONDS, TRAFFIC_GENERATOR_MIN_INTERVAL_SECONDS, validateTrafficGeneratorSettings, type TrafficGeneratorApplication, type TrafficGeneratorSettings } from './trafficGenerator'

type RecordValue = Record<string, unknown>
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid network object.')
  return value as RecordValue
}
function string(value: unknown) { if (typeof value !== 'string' || value.length > 65536) throw new Error('Invalid network text.') }
function array(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) throw new Error('Invalid or oversized network list.'); return value }
function finite(value: unknown) { if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e7) throw new Error('Invalid network coordinates.') }
function oneOf(value: unknown, values: string[]) { if (!values.includes(String(value))) throw new Error(`Unsupported network value: ${String(value).slice(0, 80)}`) }
function textFields(row: RecordValue, required: string[], optional: string[] = []) { required.forEach(key => string(row[key])); optional.forEach(key => { if (row[key] !== undefined) string(row[key]) }) }
function uniqueIds(rows: RecordValue[]) { const ids = rows.map(row => { string(row.id); if (!row.id) throw new Error('Missing network ID.'); return row.id }); if (new Set(ids).size !== ids.length) throw new Error('Duplicate network IDs.') }
function validMailDomain(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 253 || !value) return false
  return value.split('.').every(label => label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
}
function validateEmailMessage(value: unknown) {
  const message = object(value)
  textFields(message, ['id', 'from', 'to', 'subject', 'body'])
  if (!message.id || String(message.id).length > 128 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(message.from)) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(message.to))) throw new Error('Invalid email message address or ID.')
  if (!String(message.subject).trim() || String(message.subject).length > 255 || new TextEncoder().encode(String(message.body)).byteLength > 65_536) throw new Error('Email message exceeds its subject or body limit.')
  if (!Number.isSafeInteger(message.sentAtTick) || Number(message.sentAtTick) < 0) throw new Error('Invalid email message timestamp.')
}

export interface SerializedTrafficGeneratorRun {
  deviceId: string
  settings: TrafficGeneratorSettings
  intervalSeconds: number
  sentCount: number
}

const TRAFFIC_GENERATOR_APPLICATION_IDS: TrafficGeneratorApplication[] = ['icmp', 'http', 'tftp', 'udp', 'raw-udp', 'raw-tcp', 'dns', 'ntp']

// Restored generator runs are validated field by field; a run that no longer matches the model is
// dropped instead of failing the whole restore, so an older save never blocks a workspace load.
function validatedTrafficGeneratorSettings(value: unknown): TrafficGeneratorSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as RecordValue
  if (!TRAFFIC_GENERATOR_APPLICATION_IDS.includes(raw.application as TrafficGeneratorApplication)) return null
  for (const key of ['target', 'path', 'fileName', 'data', 'packetColor', 'outgoingPortId', 'sourceMac', 'sourceIp']) {
    if (typeof raw[key] !== 'string' || (raw[key] as string).length > 65536) return null
  }
  for (const key of ['port', 'sourcePort', 'payloadSize']) {
    if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key] as number)) return null
  }
  if (typeof raw.autoSelectPort !== 'boolean') return null
  if (raw.dscp !== null && (typeof raw.dscp !== 'number' || !Number.isFinite(raw.dscp))) return null
  const settings = raw as unknown as TrafficGeneratorSettings
  return validateTrafficGeneratorSettings(settings) === null ? settings : null
}

function validateTrafficGeneratorRuns(value: unknown, deviceMap: Map<unknown, RecordValue>): SerializedTrafficGeneratorRun[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 64) return []
  const runs: SerializedTrafficGeneratorRun[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const row = entry as RecordValue
    if (typeof row.deviceId !== 'string' || !deviceMap.has(row.deviceId)) continue
    const settings = validatedTrafficGeneratorSettings(row.settings)
    if (!settings) continue
    if (typeof row.intervalSeconds !== 'number' || !Number.isFinite(row.intervalSeconds) || row.intervalSeconds < TRAFFIC_GENERATOR_MIN_INTERVAL_SECONDS || row.intervalSeconds > TRAFFIC_GENERATOR_MAX_INTERVAL_SECONDS) continue
    const sentCount = Number.isSafeInteger(row.sentCount) && Number(row.sentCount) >= 0 ? Number(row.sentCount) : 0
    runs.push({ deviceId: row.deviceId, settings, intervalSeconds: row.intervalSeconds, sentCount })
  }
  return runs
}

export function parseWorkspace(input: unknown): { version: 1; devices: NetworkDevice[]; links: NetworkLink[]; annotations: NetworkAnnotation[]; deviceWindows: DeviceWindow[]; fileName: string; physical?: PhysicalWorkspaceState; trafficGenerators: SerializedTrafficGeneratorRun[] } {
  const data = object(input)
  if (data.version !== undefined && data.version !== 1 && data.version !== '1.0') throw new Error('Unsupported workspace version.')
  const devices = array(data.devices, 2000).map(object)
  uniqueIds(devices)
  for (const device of devices) {
    string(device.name); string(device.model); finite(device.x); finite(device.y)
    oneOf(device.type, ['router', 'switch', 'pc', 'laptop', 'server', 'printer', 'phone', 'tv', 'tablet', 'smartphone', 'wireless', 'wlc', 'iot', 'security', 'hub', 'cloud', 'modem'])
    const config = object(device.config); string(config.hostname)
    textFields(config, [], ['defaultGateway', 'dnsServer', 'banner', 'htmlContent', 'guiHtml', 'guiHtmlPasswordHash', 'secretPassword', 'snmpSystemContact', 'snmpSystemLocation'])
    textFields(config, [], ['ospfRouterId'])
    for (const list of ['ospfPassiveInterfaces', 'ospfActiveInterfaces', 'ripPassiveInterfaces', 'ripActiveInterfaces']) if (config[list] !== undefined) array(config[list], 512).forEach(string)
    if (config.ospfPassiveDefault !== undefined && typeof config.ospfPassiveDefault !== 'boolean') throw new Error('Invalid OSPF passive default.')
    if (config.dnsServiceEnabled !== undefined && typeof config.dnsServiceEnabled !== 'boolean') throw new Error('Invalid DNS service setting.')
    if (config.udpEchoServiceEnabled !== undefined && typeof config.udpEchoServiceEnabled !== 'boolean') throw new Error('Invalid UDP Echo service setting.')
    if (config.ntpMaster !== undefined && typeof config.ntpMaster !== 'boolean') throw new Error('Invalid NTP master setting.')
    if (config.ntpMasterStratum !== undefined && (!Number.isInteger(config.ntpMasterStratum) || Number(config.ntpMasterStratum) < 1 || Number(config.ntpMasterStratum) > 15)) throw new Error('Invalid NTP master stratum.')
    if (config.ntpServer !== undefined && (typeof config.ntpServer !== 'string' || !isValidIpv4(config.ntpServer))) throw new Error('Invalid NTP server address.')
    if (config.ntpSynchronizedAtMs !== undefined && (typeof config.ntpSynchronizedAtMs !== 'number' || !Number.isFinite(config.ntpSynchronizedAtMs) || config.ntpSynchronizedAtMs < 0)) throw new Error('Invalid NTP synchronization time.')
    if (config.ntpOffsetMs !== undefined && (typeof config.ntpOffsetMs !== 'number' || !Number.isFinite(config.ntpOffsetMs) || Math.abs(config.ntpOffsetMs) > 1e9)) throw new Error('Invalid NTP clock offset.')
    if (config.ntpSynchronizedStratum !== undefined && (!Number.isInteger(config.ntpSynchronizedStratum) || Number(config.ntpSynchronizedStratum) < 1 || Number(config.ntpSynchronizedStratum) > 15)) throw new Error('Invalid synchronized NTP stratum.')
    if (config.snmpCommunities !== undefined) {
      const communities = array(config.snmpCommunities, 32)
      if (communities.some(item => typeof item !== 'string' || !isValidSnmpCommunity(item)) || new Set(communities).size !== communities.length) throw new Error('Invalid or duplicate SNMP community.')
    }
    if (config.asaNatRules !== undefined) {
      const natRules = array(config.asaNatRules, 256).map(object)
      uniqueIds(natRules)
      for (const rule of natRules) {
        textFields(rule, ['id', 'sourceInterface', 'destInterface', 'sourceNet'])
        oneOf(rule.type, ['dynamic-pat', 'static'])
        const [network, prefixText, extra] = String(rule.sourceNet).split('/')
        const prefix = Number(prefixText)
        if (extra !== undefined || !isValidIpv4(network ?? '') || !/^\d{1,2}$/.test(prefixText ?? '') || !Number.isInteger(prefix) || prefix < 0 || prefix > 32 || !rule.sourceInterface || !rule.destInterface || rule.sourceInterface === rule.destInterface) throw new Error('Invalid ASA NAT rule.')
      }
    }
    for (const field of ['snmpSystemContact', 'snmpSystemLocation']) if (config[field] !== undefined && String(config[field]).length > 255) throw new Error(`SNMP ${field === 'snmpSystemContact' ? 'contact' : 'location'} exceeds 255 characters.`)
    if (config.tftpServiceEnabled !== undefined && typeof config.tftpServiceEnabled !== 'boolean') throw new Error('Invalid TFTP service setting.')
    if (config.loggingHost !== undefined && (typeof config.loggingHost !== 'string' || !isValidIpv4(config.loggingHost))) throw new Error('Invalid Syslog host address.')
    if (config.loggingTrap !== undefined && (!Number.isInteger(config.loggingTrap) || Number(config.loggingTrap) < 0 || Number(config.loggingTrap) > 7)) throw new Error('Invalid Syslog severity threshold.')
    if (config.syslogServiceEnabled !== undefined && typeof config.syslogServiceEnabled !== 'boolean') throw new Error('Invalid Syslog service setting.')
    if (config.syslogMessages !== undefined) {
      const messages = array(config.syslogMessages, 200).map(object)
      const messageIds = new Set<string>()
      for (const message of messages) {
        textFields(message, ['id', 'sourceIp', 'sourceName', 'message'])
        const id = String(message.id)
        if (!id || id.length > 128 || messageIds.has(id)) throw new Error('Invalid or duplicate Syslog message ID.')
        messageIds.add(id)
        if (!isValidIpv4(String(message.sourceIp))) throw new Error('Invalid Syslog source address.')
        if (!Number.isFinite(message.receivedAtMs) || Number(message.receivedAtMs) < 0) throw new Error('Invalid Syslog receive time.')
        if (!Number.isInteger(message.severity) || Number(message.severity) < 0 || Number(message.severity) > 7) throw new Error('Invalid Syslog severity.')
        if (!String(message.message).trim() || String(message.message).length > 1024) throw new Error('Invalid Syslog message text.')
        if (String(message.sourceName).length > 255) throw new Error('Invalid Syslog source name.')
      }
    }
    if (config.emailService !== undefined) {
      if (device.type !== 'server') throw new Error('Email service configuration requires a server.')
      const service = object(config.emailService)
      if (!validMailDomain(service.domain)) throw new Error('Invalid email service domain.')
      for (const key of ['smtpEnabled', 'pop3Enabled']) if (typeof service[key] !== 'boolean') throw new Error(`Invalid email ${key} service setting.`)
      const users = array(service.users, 100).map(object)
      const usernames = new Set<string>()
      for (const user of users) {
        textFields(user, ['username', 'password'])
        const username = String(user.username).toLowerCase()
        if (!/^[a-z0-9._-]{1,32}$/.test(username) || usernames.has(username) || !String(user.password) || String(user.password).length > 128 || /[\u0000-\u001f\u007f]/.test(String(user.password))) throw new Error('Invalid or duplicate email mailbox credentials.')
        usernames.add(username)
        const mailbox = array(user.mailbox, 250)
        const messageIds = new Set<string>()
        for (const message of mailbox) {
          validateEmailMessage(message)
          const id = String((message as RecordValue).id)
          if (messageIds.has(id)) throw new Error('Duplicate email message ID in mailbox.')
          messageIds.add(id)
        }
      }
    }
    if (config.emailAccount !== undefined) {
      if (!['pc', 'laptop'].includes(String(device.type))) throw new Error('Email account configuration requires a PC or laptop.')
      const account = object(config.emailAccount)
      textFields(account, ['displayName', 'emailAddress', 'incomingServer', 'outgoingServer', 'username', 'password'])
      if (!String(account.displayName).trim() || String(account.displayName).length > 80 || String(account.emailAddress).length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(account.emailAddress)) || !/^[a-z0-9._-]{1,32}$/i.test(String(account.username)) || !String(account.password) || String(account.password).length > 128 || /[\u0000-\u001f\u007f]/.test(String(account.password)) || !isValidIpv4(String(account.incomingServer)) || !isValidIpv4(String(account.outgoingServer))) throw new Error('Invalid email account settings.')
      for (const folder of ['inbox', 'sent']) {
        const messages = array(account[folder], 250)
        const messageIds = new Set<string>()
        for (const message of messages) {
          validateEmailMessage(message)
          const id = String((message as RecordValue).id)
          if (messageIds.has(id)) throw new Error(`Duplicate email message ID in ${folder}.`)
          messageIds.add(id)
        }
      }
    }
    if (config.udpEchoPorts !== undefined) {
      const ports = array(config.udpEchoPorts, 256)
      if (ports.some(port => !Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535)) throw new Error('Invalid UDP Echo port.')
    }
    for (const field of ['ripAutoSummary', 'ripPassiveDefault']) if (config[field] !== undefined && typeof config[field] !== 'boolean') throw new Error('Invalid RIP setting.')
    if (config.ripVersion !== undefined) oneOf(config.ripVersion, ['1', '2'])
    if (config.apMode !== undefined) oneOf(config.apMode, ['autonomous', 'lightweight'])
    if (config.wlans !== undefined) {
      for (const entry of array(config.wlans, 16).map(object)) {
        if (!Number.isInteger(entry.id) || Number(entry.id) < 1 || Number(entry.id) > 16) throw new Error('Invalid wireless LAN identifier.')
        string(entry.name); string(entry.ssid)
        if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') throw new Error('Invalid wireless LAN state.')
        if (entry.vlan !== undefined && (!Number.isInteger(entry.vlan) || Number(entry.vlan) < 0 || Number(entry.vlan) > 4094)) throw new Error('Invalid wireless LAN VLAN.')
        oneOf(entry.security, ['none', 'wep', 'wpa2-psk'])
        if (entry.passphrase !== undefined) string(entry.passphrase)
        if (entry.wepKey !== undefined) string(entry.wepKey)
      }
    }
    if (config.iotKind !== undefined) oneOf(config.iotKind, ['lamp', 'fan', 'door', 'window', 'blinds', 'sprinkler', 'siren', 'thermostat', 'smoke-detector', 'water-detector', 'light-sensor', 'push-button'])
    if (config.iotState !== undefined) {
      const state = object(config.iotState)
      for (const field of ['power', 'open', 'smoke']) if (state[field] !== undefined && typeof state[field] !== 'boolean') throw new Error('Invalid IoT state flag.')
      for (const field of ['level', 'temperature', 'pressedAtTick']) if (state[field] !== undefined && !Number.isFinite(Number(state[field]))) throw new Error('Invalid IoT state value.')
    }
    if (config.iotServerAddress !== undefined) string(config.iotServerAddress)
    if (config.iotServiceEnabled !== undefined && typeof config.iotServiceEnabled !== 'boolean') throw new Error('Invalid IoT service flag.')
    if (config.iotCredentials !== undefined) {
      const credentials = object(config.iotCredentials)
      string(credentials.username); string(credentials.password)
    }
    if (device.iotRuntime !== undefined) {
      const runtime = object(device.iotRuntime)
      oneOf(runtime.state, ['searching', 'registered'])
    }
    if (device.iotServerRuntime !== undefined) {
      const runtime = object(device.iotServerRuntime)
      if (runtime.clients !== undefined) array(runtime.clients, 512)
    }
    if (device.apRuntime !== undefined) {
      const runtime = object(device.apRuntime)
      oneOf(runtime.mode, ['autonomous', 'lightweight'])
      oneOf(runtime.state, ['idle', 'discovery', 'join', 'run'])
    }
    if (device.wlcRuntime !== undefined) {
      const runtime = object(device.wlcRuntime)
      if (runtime.aps !== undefined) array(runtime.aps, 256)
      if (runtime.clientTunnels !== undefined) array(runtime.clientTunnels, 4096)
      if (runtime.pendingConfig !== undefined) array(runtime.pendingConfig, 256)
      if (runtime.configSeq !== undefined && (!Number.isSafeInteger(runtime.configSeq) || Number(runtime.configSeq) < 0)) throw new Error('Invalid CAPWAP configuration sequence.')
      if (runtime.seq !== undefined && (!Number.isSafeInteger(runtime.seq) || Number(runtime.seq) < 0)) throw new Error('Invalid CAPWAP sequence.')
    }
    if (config.ospfProcessId !== undefined && (!Number.isInteger(config.ospfProcessId) || Number(config.ospfProcessId) < 1 || Number(config.ospfProcessId) > 65535)) throw new Error('Invalid OSPF process ID.')
    if (device.ospfSequence !== undefined && (!Number.isSafeInteger(device.ospfSequence) || Number(device.ospfSequence) < 0)) throw new Error('Invalid OSPF sequence.')
    const ports = array(device.ports, 512).map(object); uniqueIds(ports)
    if (config.asaNatRules !== undefined) {
      if (device.type !== 'security' && (config.asaNatRules as unknown[]).length > 0) throw new Error('ASA NAT rules require a security appliance.')
      const nameifs = new Set(ports.map(port => port.nameif).filter((nameif): nameif is string => typeof nameif === 'string' && nameif.length > 0))
      for (const rule of config.asaNatRules as RecordValue[]) if (!nameifs.has(String(rule.sourceInterface)) || !nameifs.has(String(rule.destInterface))) throw new Error('ASA NAT rule references an unknown interface nameif.')
    }
    if (device.type === 'router') for (const port of ports) {
      if (typeof port.name !== 'string' || !port.name.includes('.') || port.parentPortId !== undefined) continue
      const parent = ports.find(p => typeof p.name === 'string' && p.name.toLowerCase() === String(port.name).split('.')[0].toLowerCase())
      if (!parent) continue
      port.parentPortId = parent.id
      port.macAddress = parent.macAddress
      port.dot1qVlan ??= port.vlan
      if (port.ipAddress && parent.ipAddress === port.ipAddress && parent.subnetMask === port.subnetMask) { parent.ipAddress = undefined; parent.subnetMask = undefined }
    }
    for (const port of ports) {
      for (const key of ['name', 'shortName', 'macAddress']) string(port[key])
      oneOf(port.type, ['fastethernet', 'gigabitethernet', 'serial', 'wireless', 'coaxial', 'phone'])
      oneOf(port.status, ['up', 'down', 'learning']); oneOf(port.adminStatus, ['up', 'down'])
      textFields(port, [], ['greSourceInterface', 'greDestinationIp'])
      if (port.isGreTunnel !== undefined && typeof port.isGreTunnel !== 'boolean') throw new Error('Invalid GRE tunnel interface flag.')
      if (port.greMode !== undefined) oneOf(port.greMode, ['gre ip'])
      if (!port.isGreTunnel && (port.greMode !== undefined || port.greSourceInterface !== undefined || port.greDestinationIp !== undefined || port.greKeepalivePeriodSeconds !== undefined || port.greKeepaliveRetries !== undefined)) throw new Error('GRE settings require a GRE tunnel interface.')
      if (port.greKeepalivePeriodSeconds !== undefined && (!Number.isInteger(port.greKeepalivePeriodSeconds) || Number(port.greKeepalivePeriodSeconds) < 1 || Number(port.greKeepalivePeriodSeconds) > 32767)) throw new Error('Invalid GRE keepalive period.')
      if (port.greKeepaliveRetries !== undefined && (!Number.isInteger(port.greKeepaliveRetries) || Number(port.greKeepaliveRetries) < 1 || Number(port.greKeepaliveRetries) > 255)) throw new Error('Invalid GRE keepalive retries.')
      if ((port.greKeepalivePeriodSeconds === undefined) !== (port.greKeepaliveRetries === undefined)) throw new Error('GRE keepalive period and retry count must be configured together.')
      if (port.isGreTunnel && (device.type !== 'router' || port.connectedLinkId !== undefined || port.parentPortId !== undefined)) throw new Error('GRE tunnel interfaces must be unconnected virtual router interfaces.')
      if (port.isGreTunnel && port.greDestinationIp !== undefined && !isValidIpv4(String(port.greDestinationIp))) throw new Error('Invalid GRE tunnel destination address.')
      if (port.isGreTunnel && port.greSourceInterface !== undefined && !ports.some(source => !source.isGreTunnel && (source.name === port.greSourceInterface || source.shortName === port.greSourceInterface || source.id === port.greSourceInterface))) throw new Error('GRE tunnel references an unknown source interface.')
      delete port.greKeepaliveElapsedMs
      delete port.greKeepaliveMissed
      delete port.greKeepaliveSequence
      delete port.greKeepaliveOperational
      for (const key of ['ipAddress', 'subnetMask']) if (port[key] !== undefined) string(port[key])
      if(port.hsrpGroups!==undefined){
        const groups=array(port.hsrpGroups,256).map(object),seenGroups=new Set<number>()
        for(const group of groups){
          if(!Number.isInteger(group.group)||Number(group.group)<0||Number(group.group)>255||seenGroups.has(Number(group.group)))throw new Error('Invalid or duplicate HSRP group.')
          seenGroups.add(Number(group.group))
          if(group.virtualIp!==undefined&&(
            typeof group.virtualIp!=='string'||!isValidIpv4(group.virtualIp)||typeof port.ipAddress!=='string'||typeof port.subnetMask!=='string'||!isInSameSubnet(group.virtualIp,port.ipAddress,port.subnetMask)
          ))throw new Error('HSRP virtual IP must share the interface subnet.')
          if(group.priority!==undefined&&(!Number.isInteger(group.priority)||Number(group.priority)<0||Number(group.priority)>255))throw new Error('Invalid HSRP priority.')
          if(group.preempt!==undefined&&typeof group.preempt!=='boolean')throw new Error('Invalid HSRP preempt setting.')
        }
      }
      delete port.hsrpRuntime
      if (port.allowedVlans !== undefined) array(port.allowedVlans, 4096).forEach(finite)
      if (port.parentPortId !== undefined && !ports.some(parent => parent.id === port.parentPortId && parent.id !== port.id)) throw new Error('Subinterface has no physical parent.')
      if (port.dot1qVlan !== undefined && (!Number.isInteger(port.dot1qVlan) || Number(port.dot1qVlan) < 1 || Number(port.dot1qVlan) > 4094)) throw new Error('Invalid subinterface VLAN.')
      for (const field of ['ospfCost', 'ospfHelloInterval', 'ospfDeadInterval', 'ospfPriority']) if (port[field] !== undefined && (!Number.isInteger(port[field]) || Number(port[field]) < (field === 'ospfPriority' ? 0 : 1) || Number(port[field]) > (field === 'ospfPriority' ? 255 : 65535))) throw new Error('Invalid OSPF interface setting.')
      if (port.ospfNetworkType !== undefined) oneOf(port.ospfNetworkType, ['broadcast', 'point-to-point'])
      for (const key of ['bpduGuard', 'bpduFilter', 'rootGuard']) if (port[key] !== undefined && typeof port[key] !== 'boolean') throw new Error('Invalid spanning-tree guard interface flag.')
      if (port.errDisabled !== undefined) oneOf(port.errDisabled, ['bpduguard'])
      if (port.rootInconsistentVlans !== undefined) {
        const blocked = object(port.rootInconsistentVlans)
        for (const [vlanKey, sinceTick] of Object.entries(blocked)) {
          if (!/^[1-9]\d{0,3}$/.test(vlanKey) || Number(vlanKey) > 4094 || !Number.isFinite(sinceTick) || Number(sinceTick) < 0) throw new Error('Invalid Root Guard VLAN state.')
        }
        delete port.rootInconsistentVlans
      }
    }
    for (const route of array(device.routingTable, 10000).map(object)) { textFields(route, ['network', 'netmask', 'nextHop', 'interfaceName']); finite(route.metric); oneOf(route.type, ['C', 'S', 'O', 'R']) }
    delete device.ospf
    delete device.rip
    delete device.asaNatTranslations
    device.routingTable = (device.routingTable as RecordValue[]).filter(r => r.type !== 'O' && r.type !== 'R')
    for (const entry of array(device.arpTable, 10000).map(object)) { textFields(entry, ['ipAddress', 'macAddress', 'interfaceName']); finite(entry.age) }
    for (const entry of array(device.macTable, 10000).map(object)) { textFields(entry, ['macAddress', 'portId'], ['linkId']); finite(entry.vlan); finite(entry.age) }
    array(device.cliHistory, 10000).forEach(string)
    oneOf(device.currentCliMode, ['user', 'priv', 'config', 'config-if', 'config-subif', 'config-vlan', 'config-line', 'config-router', 'config-dhcp', 'config-telephony', 'config-ephone', 'config-ephone-dn'])
    for (const key of ['modules', 'importedRunningConfig', 'importedStartupConfig']) if (device[key] !== undefined) array(device[key], 10000).forEach(string)
    for (const key of ['bpduGuardDefault', 'bpduFilterDefault']) if (config[key] !== undefined && typeof config[key] !== 'boolean') throw new Error('Invalid spanning-tree guard default.')
    for (const key of ['vlans', 'ospfNetworks', 'dhcpPools', 'dhcpBindings', 'dnsRecords', 'tftpFiles', 'tftpClientFiles', 'asaNatRules', 'accessLists']) if (config[key] !== undefined) array(config[key], 4096).forEach(object)
    for (const vlan of (config.vlans ?? []) as RecordValue[]) { finite(vlan.id); string(vlan.name) }
    for (const pool of (config.dhcpPools ?? []) as RecordValue[]) {
      textFields(pool, ['name', 'network', 'mask'], ['defaultRouter', 'dnsServer', 'tftpServer', 'hostIp', 'hostMask', 'hardwareAddress', 'clientIdentifier'])
      if (pool.hardwareAddress !== undefined && !/^(?:[0-9a-f]{12}|[0-9a-f]{4}(?:[.][0-9a-f]{4}){2}|[0-9a-f]{2}(?::[0-9a-f]{2}){5})$/i.test(String(pool.hardwareAddress))) throw new Error('Invalid DHCP hardware reservation.')
      if (pool.clientIdentifier !== undefined && !/^(?:[0-9a-f]{2}){2,32}$/i.test(String(pool.clientIdentifier).replace(/[.:-]/g, ''))) throw new Error('Invalid DHCP client identifier.')
      if (pool.hardwareAddress !== undefined && pool.clientIdentifier !== undefined) throw new Error('A DHCP manual binding can use only one client identifier method.')
      if (pool.leaseDurationSeconds !== undefined && (!Number.isInteger(pool.leaseDurationSeconds) || Number(pool.leaseDurationSeconds) < 60 || Number(pool.leaseDurationSeconds) > 1e7)) throw new Error('Invalid DHCP lease duration.')
    }
    for (const binding of (config.dhcpBindings ?? []) as RecordValue[]) {
      textFields(binding, ['ipAddress', 'clientDeviceId', 'clientIdentifier', 'hardwareAddress', 'type'])
      if (typeof binding.acquiredAtMs !== 'number' || !Number.isFinite(binding.acquiredAtMs) || binding.acquiredAtMs < 0) throw new Error('Invalid DHCP binding time.')
      if (!Number.isInteger(binding.leaseDurationSeconds) || Number(binding.leaseDurationSeconds) < 60 || Number(binding.leaseDurationSeconds) > 1e7) throw new Error('Invalid DHCP binding lease duration.')
      oneOf(binding.type, ['automatic', 'manual'])
    }
    for (const record of (config.dnsRecords ?? []) as RecordValue[]) textFields(record, ['domain', 'ip'])
    const tftpNames = new Set<string>()
    for (const file of (config.tftpFiles ?? []) as RecordValue[]) {
      textFields(file, ['name', 'contents'])
      if (!isValidTftpFileName(String(file.name)) || tftpNames.has(String(file.name))) throw new Error('Invalid or duplicate TFTP filename.')
      if (new TextEncoder().encode(String(file.contents)).byteLength > MAX_TFTP_FILE_BYTES) throw new Error('TFTP file exceeds the transfer size limit.')
      tftpNames.add(String(file.name))
    }
    for (const file of (config.tftpClientFiles ?? []) as RecordValue[]) {
      textFields(file, ['serverIp', 'name', 'contents'])
      if (!isValidIpv4(String(file.serverIp)) || !isValidTftpFileName(String(file.name))) throw new Error('Invalid downloaded TFTP file.')
      if (new TextEncoder().encode(String(file.contents)).byteLength > MAX_TFTP_FILE_BYTES) throw new Error('Downloaded TFTP file exceeds the transfer size limit.')
      if (typeof file.receivedAtMs !== 'number' || !Number.isFinite(file.receivedAtMs) || file.receivedAtMs < 0) throw new Error('Invalid TFTP file receive time.')
    }
    for (const network of (config.ospfNetworks ?? []) as RecordValue[]) { textFields(network, ['network', 'wildcard']); finite(network.area) }
    if (config.dhcpPool !== undefined) {
      const pool=object(config.dhcpPool)
      textFields(pool, ['network', 'subnetMask', 'startIp', 'endIp', 'gateway', 'dns'])
      if (pool.leaseDurationSeconds !== undefined && (!Number.isInteger(pool.leaseDurationSeconds) || Number(pool.leaseDurationSeconds) < 60 || Number(pool.leaseDurationSeconds) > 1e7)) throw new Error('Invalid DHCP lease duration.')
    }
    if (config.dhcpLease !== undefined) {
      const lease=object(config.dhcpLease)
      textFields(lease, ['serverId', 'ipAddress'])
      if (lease.acquiredAtMs !== undefined && (typeof lease.acquiredAtMs !== 'number' || !Number.isFinite(lease.acquiredAtMs) || lease.acquiredAtMs < 0)) throw new Error('Invalid DHCP lease acquisition time.')
      if (lease.lastRequestAtMs !== undefined && (typeof lease.lastRequestAtMs !== 'number' || !Number.isFinite(lease.lastRequestAtMs) || lease.lastRequestAtMs < 0)) throw new Error('Invalid DHCP renewal time.')
      if (lease.leaseDurationSeconds !== undefined && (!Number.isInteger(lease.leaseDurationSeconds) || Number(lease.leaseDurationSeconds) < 60 || Number(lease.leaseDurationSeconds) > 1e7)) throw new Error('Invalid DHCP lease duration.')
      if (lease.state !== undefined) oneOf(lease.state, ['bound', 'renewing', 'rebinding'])
    }
    for (const key of ['ripNetworks', 'excludedDhcpIps']) if (config[key] !== undefined) array(config[key], 4096).forEach(string)
    if (config.accessLists) for (const acl of config.accessLists as RecordValue[]) array(acl.rules, 4096).forEach(object)
    if (config.telephony !== undefined) {
      const voice = object(config.telephony)
      textFields(voice, [], ['sourceIp'])
      for (const dn of array(voice.directoryNumbers, 4096).map(object)) { finite(dn.id); string(dn.number) }
      for (const phone of array(voice.ephones, 4096).map(object)) { finite(phone.id); array(phone.buttons, 256).forEach(object) }
    }
  }
  const links = array(data.links, 4000).map(object); uniqueIds(links)
  const deviceMap = new Map(devices.map(device => [device.id, device]))
  for (const link of links) {
    oneOf(link.type, ['auto', 'straight', 'crossover', 'fiber', 'serial', 'serial-dce', 'console', 'phone', 'coaxial', 'octal', 'usb', 'wireless'])
    oneOf(link.status, ['up', 'down', 'learning'])
    for (const end of ['from', 'to']) {
      const device = deviceMap.get(link[`${end}DeviceId`])
      if (!device || !(device.ports as RecordValue[]).some(port => port.id === link[`${end}PortId`])) throw new Error('Cable references a missing device or port.')
    }
  }
  const annotations = array(data.annotations ?? [], 4000).map(object); uniqueIds(annotations)
  for (const annotation of annotations) {
    oneOf(annotation.type, ['note', 'rect', 'line', 'ellipse', 'freeform']); finite(annotation.x); finite(annotation.y)
    for (const key of ['width', 'height']) if (annotation[key] !== undefined) finite(annotation[key])
    for (const key of ['title', 'text', 'color', 'borderColor']) if (annotation[key] !== undefined) string(annotation[key])
    if (annotation.points !== undefined) for (const point of array(annotation.points, 10000).map(object)) { finite(point.x); finite(point.y) }
  }
  const deviceWindows = array(data.deviceWindows ?? [], 2000).map(object).filter(frame => deviceMap.has(frame.deviceId) && ['x', 'y', 'width', 'height', 'z'].every(key => typeof frame[key] === 'number' && Number.isFinite(frame[key])) && Number(frame.width) >= 100 && Number(frame.height) >= 100)
  if (data.fileName !== undefined) string(data.fileName)
  const physical = validatePhysical(data.physical, deviceMap)
  const trafficGenerators = validateTrafficGeneratorRuns(data.trafficGenerators, deviceMap)
  return { version: 1, devices: devices as unknown as NetworkDevice[], links: links as unknown as NetworkLink[], annotations: annotations as unknown as NetworkAnnotation[], deviceWindows: deviceWindows as unknown as DeviceWindow[], fileName: (data.fileName as string) || '', physical, trafficGenerators }
}

function validatePhysical(value: unknown, deviceMap: Map<unknown, RecordValue>): PhysicalWorkspaceState | undefined {
  if (value === undefined) return undefined
  const raw = object(value)
  const containers = array(raw.containers, 512).map(object)
  uniqueIds(containers)
  for (const container of containers) {
    textFields(container, ['id', 'name', 'kind'])
    if (!container.name) throw new Error('Physical container name is missing.')
    if (String(container.name).length > 64) throw new Error('Physical container name is too long.')
    oneOf(container.kind, [...PHYSICAL_CONTAINER_KINDS])
    if (container.parentId !== null && container.parentId !== undefined) string(container.parentId)
  }
  const containerMap = new Map(containers.map(container => [String(container.id), container]))
  for (const container of containers) {
    const parentId = container.parentId === null || container.parentId === undefined ? null : String(container.parentId)
    const parent = parentId === null ? undefined : containerMap.get(parentId)
    if (parentId !== null && !parent) throw new Error('Physical container parent is missing.')
    if (!allowedChildKinds((parent?.kind as PhysicalContainerKind | undefined) ?? null).includes(container.kind as PhysicalContainerKind)) throw new Error('Invalid physical container nesting.')
    const seen = new Set<string>([String(container.id)])
    let current = parent
    while (current) {
      if (seen.has(String(current.id))) throw new Error('Physical container cycle detected.')
      seen.add(String(current.id))
      current = current.parentId === null || current.parentId === undefined ? undefined : containerMap.get(String(current.parentId))
    }
  }
  const assignmentInput = object(raw.assignment ?? {})
  const assignment: Record<string, string> = {}
  for (const [deviceId, containerId] of Object.entries(assignmentInput)) {
    if (!deviceMap.has(deviceId) || typeof containerId !== 'string') throw new Error('Invalid physical device assignment.')
    const container = containerMap.get(containerId)
    if (!container || !canHoldDevices(container.kind as PhysicalContainerKind)) throw new Error('Physical device assignment targets an invalid container.')
    assignment[deviceId] = containerId
  }
  const clusters = array(raw.clusters ?? [], 512).map(object)
  uniqueIds(clusters)
  for (const cluster of clusters) {
    textFields(cluster, ['id', 'name'])
    if (!cluster.name) throw new Error('Cluster name is missing.')
    if (String(cluster.name).length > 64) throw new Error('Cluster name is too long.')
    const members = array(cluster.deviceIds ?? [], 2000)
    if (!members.length) throw new Error('Cluster has no devices.')
    const seen = new Set<string>()
    for (const member of members) {
      string(member)
      if (!deviceMap.has(String(member))) throw new Error('Cluster references an unknown device.')
      if (seen.has(String(member))) throw new Error('Cluster member listed twice.')
      seen.add(String(member))
    }
    // Cluster Associations mapping is optional; unknown or malformed targets are dropped quietly.
    if (cluster.physicalContainerId !== undefined && (typeof cluster.physicalContainerId !== 'string' || !containerMap.has(cluster.physicalContainerId))) delete cluster.physicalContainerId
  }
  return { containers: containers as unknown as PhysicalContainer[], assignment, clusters: clusters as unknown as NetworkCluster[] }
}
