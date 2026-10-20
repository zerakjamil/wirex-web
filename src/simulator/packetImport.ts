import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { createDevice, createPort } from './deviceFactory'
import { synchronizeLinkState } from './linkState'
import { isValidIpv4, getNetworkAddress } from './protocols/ip'
import type { DeviceType, HsrpGroupConfig, NetworkDevice, NetworkLink, NetworkPort } from '@/types/network'
import { parseVoiceConfiguration, normalizePhoneMac } from './voice'
import {parseVlanList} from './ios/ciscoParser'
import { ripMajorNetwork } from './rip'

type XmlNode = Record<string, unknown>
const node = (value: unknown): XmlNode => value && typeof value === 'object' && !Array.isArray(value) ? value as XmlNode : {}
const list = (value: unknown): unknown[] => value === undefined || value === '' ? [] : Array.isArray(value) ? value : [value]
const text = (value: unknown): string => value === undefined ? '' : typeof value === 'object' ? text(node(value)['#text']) : String(value)
const boolean = (value: unknown) => !['false', '0'].includes(text(value).toLowerCase())
const types: Record<string, DeviceType> = { router:'router', switch:'switch', multilayerswitch:'switch', pc:'pc', laptop:'laptop', server:'server', ipphone:'phone', phone:'phone', printer:'printer', tablet:'tablet', smartphone:'smartphone', accesspoint:'wireless', wirelessrouter:'wireless', cloud:'cloud', hub:'hub', modem:'modem', asa:'security' }
const shortName = (name: string) => name.replace('FastEthernet','Fa').replace('GigabitEthernet','Gi').replace('Serial','Se').replace('Wireless','Wlan')

function modulePorts(value: unknown, result: XmlNode[] = []): XmlNode[] {
  for (const entry of list(value)) {
    const current = node(entry)
    for (const port of list(current.PORT)) if (typeof port === 'object') result.push(node(port))
    for (const child of list(current.SLOT)) modulePorts(node(child).MODULE, result)
  }
  return result
}

function applyConfig(device: NetworkDevice, lines: string[]) {
  let port: NetworkPort | undefined
  let vlanId:number|undefined
  let ospfProcess = false
  let ripProcess = false
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '!' || line === 'end') { port = undefined;vlanId=undefined; ospfProcess = false; ripProcess = false; continue }
    const parts = line.split(/\s+/)
    if (parts[0] === 'router') {
      port = undefined; ospfProcess = parts[1] === 'ospf'
      ripProcess = parts[1] === 'rip'
      if (ospfProcess) device.config.ospfProcessId = Number(parts[2])
      continue
    }
    if (ripProcess) {
      if (parts[0] === 'network' && isValidIpv4(parts[1])) device.config.ripNetworks = [...new Set([...(device.config.ripNetworks ?? []), ripMajorNetwork(parts[1])])]
      else if (parts[0] === 'version' && ['1', '2'].includes(parts[1])) device.config.ripVersion = Number(parts[1]) as 1 | 2
      else if (line === 'no auto-summary') device.config.ripAutoSummary = false
      else if (line === 'auto-summary') device.config.ripAutoSummary = true
      else if (line === 'passive-interface default') device.config.ripPassiveDefault = true
      else if (parts[0] === 'passive-interface') device.config.ripPassiveInterfaces = [...(device.config.ripPassiveInterfaces ?? []), parts[1]]
      else if (parts[0] === 'no' && parts[1] === 'passive-interface') device.config.ripActiveInterfaces = [...(device.config.ripActiveInterfaces ?? []), parts[2]]
      if (parts[0] !== 'interface') continue
      ripProcess = false
    }
    if (ospfProcess) {
      if (parts[0] === 'network' && parts[3] === 'area' && isValidIpv4(parts[1]) && isValidIpv4(parts[2])) device.config.ospfNetworks = [...(device.config.ospfNetworks ?? []), { network: parts[1], wildcard: parts[2], area: Number(parts[4]) }]
      else if (parts[0] === 'router-id' && isValidIpv4(parts[1])) device.config.ospfRouterId = parts[1]
      else if (parts[0] === 'passive-interface' && parts[1] === 'default') device.config.ospfPassiveDefault = true
      else if (parts[0] === 'passive-interface') device.config.ospfPassiveInterfaces = [...(device.config.ospfPassiveInterfaces ?? []), parts[1]]
      else if (parts[0] === 'no' && parts[1] === 'passive-interface') device.config.ospfActiveInterfaces = [...(device.config.ospfActiveInterfaces ?? []), parts[2]]
      if (parts[0] !== 'interface') continue
      ospfProcess = false
    }
    if(port&&(parts[0]?.toLowerCase()==='standby'||parts[0]?.toLowerCase()==='no'&&parts[1]?.toLowerCase()==='standby')){
      const negated=parts[0]?.toLowerCase()==='no',offset=negated?2:1,groupText=parts[offset]
      if(/^(?:0|[1-9]\d{0,2})$/.test(groupText??'')){
        const group=Number(groupText),subcommand=parts[offset+1]?.toLowerCase(),argument=parts[offset+2]
        if(group>=0&&group<=255){
          const groups=port.hsrpGroups??[],existing=groups.find(item=>item.group===group)
          let updated:HsrpGroupConfig|undefined=existing?{...existing}:{group}
          if(negated&&parts.length===offset+1)updated=undefined
          else if(subcommand==='ip'&&(negated?parts.length===offset+2:parts.length===offset+3)){
            if(negated&&updated){delete updated.virtualIp}
            else if(!negated&&isValidIpv4(argument??''))updated={...updated,virtualIp:argument}
          }else if(subcommand==='priority'&&(negated?parts.length===offset+2:parts.length===offset+3)&&(negated||/^(?:0|[1-9]\d{0,2})$/.test(argument??''))){
            if(negated&&updated)delete updated.priority
            else if(updated){const value=Number(argument);if(value<=255)updated.priority=value}
          }else if(subcommand==='preempt'&&parts.length===offset+2){
            if(negated&&updated)delete updated.preempt
            else if(!negated&&updated)updated.preempt=true
          }
          if(updated&&Object.keys(updated).length===1)updated=undefined
          port.hsrpGroups=[...groups.filter(item=>item.group!==group),...(updated?[updated]:[])].sort((a,b)=>a.group-b.group)
        }
      }
      continue
    }
    if (parts[0] === 'interface') {
      vlanId=undefined
      port = device.ports.find(item => item.name === parts[1])
      if (!port) {
        port = createPort(parts[1], shortName(parts[1]), 'fastethernet', /^Tunnel\d+$/i.test(parts[1]) ? 'down' : 'up')
        if (/^Tunnel\d+$/i.test(parts[1]) && device.type === 'router') port.isGreTunnel = true
        device.ports.push(port)
      }
      if(/^Vlan\d+$/i.test(port.name)){port.virtualVlan=Number(port.name.slice(4));port.shortName=`Vl${port.virtualVlan}`}
    } else if(line==='ip routing'||line==='no ip routing')device.config.ipRouting=line==='ip routing'
    else if(line==='spanning-tree portfast bpduguard default')device.config.bpduGuardDefault=true
    else if(line==='no spanning-tree portfast bpduguard default')device.config.bpduGuardDefault=false
    else if(line==='spanning-tree portfast bpdufilter default')device.config.bpduFilterDefault=true
    else if(line==='no spanning-tree portfast bpdufilter default')device.config.bpduFilterDefault=false
    else if(parts[0]==='vlan'&&/^\d+$/.test(parts[1])){
      port=undefined;vlanId=Number(parts[1])
      device.config.vlans=[...(device.config.vlans??[]).filter(v=>v.id!==vlanId),{id:vlanId,name:`VLAN${String(vlanId).padStart(4,'0')}`}]
    } else if(vlanId!==undefined&&parts[0]==='name'){
      device.config.vlans=device.config.vlans?.map(v=>v.id===vlanId?{...v,name:parts.slice(1).join(' ')}:v)
    } else if (parts[0] === 'hostname' && parts[1]) device.config.hostname = parts[1]
    else if (parts[0] === 'ntp' && parts[1] === 'master') {
      const stratum = parts[2] === undefined ? 8 : Number(parts[2])
      if (parts.length <= 3 && Number.isInteger(stratum) && stratum >= 1 && stratum <= 15) {
        device.config.ntpMaster = true
        device.config.ntpMasterStratum = stratum
      }
    } else if (line === 'no ntp master' || line === 'no ntp') {
      device.config.ntpMaster = false
      device.config.ntpMasterStratum = undefined
    } else if (parts[0] === 'ntp' && parts[1] === 'server' && isValidIpv4(parts[2])) device.config.ntpServer = parts[2]
    else if (parts[0] === 'no' && parts[1] === 'ntp' && parts[2] === 'server' && (!parts[3] || parts[3] === device.config.ntpServer)) {
      device.config.ntpServer = undefined
      device.config.ntpSynchronizedAtMs = undefined
      device.config.ntpOffsetMs = undefined
      device.config.ntpSynchronizedStratum = undefined
    }
    else if (parts[0] === 'logging' && parts[1] === 'trap' && parts.length === 3) {
      const trap = Number(parts[2])
      if (Number.isInteger(trap) && trap >= 0 && trap <= 7) device.config.loggingTrap = trap
    }
    else if (parts[0] === 'logging' && parts.length === 2 && isValidIpv4(parts[1])) device.config.loggingHost = parts[1]
    else if (parts[0] === 'no' && parts[1] === 'logging' && parts[2] === 'trap' && parts.length === 3) device.config.loggingTrap = undefined
    else if (parts[0] === 'no' && parts[1] === 'logging' && (!parts[2] || parts[2] === device.config.loggingHost)) device.config.loggingHost = undefined
    else if (port && parts[0] === 'ip' && parts[1] === 'address' && isValidIpv4(parts[2]) && isValidIpv4(parts[3])) {
      port.ipAddress = parts[2]; port.subnetMask = parts[3]
    } else if (port && line === 'no ip address') { port.ipAddress = undefined; port.subnetMask = undefined }
    else if (port?.isGreTunnel && parts[0] === 'tunnel' && parts[1] === 'source' && parts.length === 3) port.greSourceInterface = device.ports.find(candidate => candidate.name === parts[2] || candidate.shortName === parts[2])?.name ?? parts[2]
    else if (port?.isGreTunnel && parts[0] === 'tunnel' && parts[1] === 'destination' && isValidIpv4(parts[2])) port.greDestinationIp = parts[2]
    else if (port?.isGreTunnel && line === 'tunnel mode gre ip') port.greMode = 'gre ip'
    else if (port?.isGreTunnel && parts[0] === 'keepalive' && parts.length <= 3) {
      const period = parts[1] === undefined ? 10 : Number(parts[1])
      const retries = parts[2] === undefined ? 3 : Number(parts[2])
      if (Number.isInteger(period) && period > 0 && period <= 32767 && Number.isInteger(retries) && retries >= 1 && retries <= 255) {
        port.greKeepalivePeriodSeconds = period
        port.greKeepaliveRetries = retries
      } else if (period === 0 && parts.length === 2) {
        port.greKeepalivePeriodSeconds = undefined
        port.greKeepaliveRetries = undefined
      }
    }
    else if (port?.isGreTunnel && line === 'no keepalive') {
      port.greKeepalivePeriodSeconds = undefined
      port.greKeepaliveRetries = undefined
    }
    else if (port && line === 'shutdown') port.adminStatus = 'down'
    else if (port && line === 'no shutdown') port.adminStatus = 'up'
    else if (port && parts[0] === 'description') port.description = parts.slice(1).join(' ')
    else if (port && parts[0] === 'ip' && parts[1] === 'ospf') {
      const fields = { cost: 'ospfCost', 'hello-interval': 'ospfHelloInterval', 'dead-interval': 'ospfDeadInterval', priority: 'ospfPriority' } as const
      if (parts[2] === 'network' && ['point-to-point', 'broadcast'].includes(parts[3])) port.ospfNetworkType = parts[3] as 'point-to-point' | 'broadcast'
      else if (parts[2] in fields) port[fields[parts[2] as keyof typeof fields]] = Number(parts[3])
    }
    else if (port && line === 'spanning-tree portfast') port.portfast = true
    else if (port && line === 'no spanning-tree portfast') port.portfast = undefined
    else if (port && parts[0] === 'spanning-tree' && parts[1] === 'bpduguard' && (parts[2] === 'enable' || parts[2] === 'disable')) port.bpduGuard = parts[2] === 'enable'
    else if (port && line === 'no spanning-tree bpduguard') port.bpduGuard = undefined
    else if (port && parts[0] === 'spanning-tree' && parts[1] === 'bpdufilter' && (parts[2] === 'enable' || parts[2] === 'disable')) port.bpduFilter = parts[2] === 'enable'
    else if (port && line === 'no spanning-tree bpdufilter') port.bpduFilter = undefined
    else if (port && line === 'spanning-tree guard root') port.rootGuard = true
    else if (port && (line === 'no spanning-tree guard root' || line === 'spanning-tree guard none')) port.rootGuard = undefined
    else if (port && line === 'switchport mode trunk') port.portMode = 'trunk'
    else if (port && line === 'switchport mode access') port.portMode = 'access'
    else if(port&&parts.slice(0,4).join(' ')==='switchport trunk native vlan')port.nativeVlan=Number(parts[4])
    else if(port&&parts.slice(0,4).join(' ')==='switchport trunk allowed vlan'){
      const allowed=parseVlanList(parts[4]);if(allowed)port.allowedVlans=allowed
    }
    else if (port && parts.slice(0,3).join(' ') === 'switchport access vlan') port.vlan = Number(parts[3])
    else if (port && parts.slice(0,3).join(' ') === 'switchport voice vlan') port.voiceVlan = Number(parts[3])
    else if (port && parts[0]?.toLowerCase() === 'encapsulation' && parts[1]?.toLowerCase() === 'dot1q') { port.vlan = Number(parts[2]); port.dot1qVlan = Number(parts[2]); port.dot1qNative = parts[3]?.toLowerCase() === 'native' }
    else if (parts[0] === 'ip' && parts[1] === 'default-gateway') device.config.defaultGateway = parts[2]
    else if (parts[0] === 'ip' && parts[1] === 'route' && isValidIpv4(parts[2]) && isValidIpv4(parts[3]) && (isValidIpv4(parts[4]) || device.ports.some(candidate => candidate.isGreTunnel && candidate.name.toLowerCase() === parts[4]?.toLowerCase()))) {
      const tunnel = device.ports.find(candidate => candidate.isGreTunnel && candidate.name.toLowerCase() === parts[4]?.toLowerCase())
      device.routingTable.push({ network:getNetworkAddress(parts[2],parts[3]),netmask:parts[3],nextHop:tunnel?'connected':parts[4],interfaceName:tunnel?.name??'',metric:1,type:'S' })
    }
  }
}

export function parsePktXml(xml: string) {
  if (xml.length > 32 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid PKT XML topology.')
  const parsed = node(new XMLParser({ ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,trimValues:false,processEntities:true }).parse(xml))
  const pktTag = 'PACKET' + 'TRACER5'
  const actTag = 'PACKET' + 'TRACER5_ACTIVITY'
  const document = node(parsed[pktTag] || node(parsed[actTag])[pktTag])
  if (!document.NETWORK) throw new Error('PKT file contains no network.')
  const network = node(document.NETWORK)
  const entries = list(node(network.DEVICES).DEVICE)
  const cableEntries = list(node(network.LINKS).LINK)
  if (entries.length > 2000 || cableEntries.length > 4000) throw new Error('Network is too large to import.')
  const warnings: string[] = []
  const references = new Map<string, NetworkDevice>()
  const devices = entries.map((entry, index) => {
    const current = node(entry); const engine = node(current.ENGINE)
    const originalType = text(engine.TYPE).trim()
    const type = types[originalType.toLowerCase().replace(/\s+/g,'')] || 'hub'
    const name = text(engine.NAME).trim() || `Device${index}`
    if (!types[originalType.toLowerCase().replace(/\s+/g,'')]) warnings.push(`${name}: ${originalType} is displayed as a placeholder; its behavior is not simulated.`)
    const position = node(node(current.WORKSPACE).LOGICAL)
    const device = createDevice(type, Number(text(position.X)) || 0, Number(text(position.Y)) || 0, text(node(engine.TYPE)['@_model']) || originalType)
    const reference = text(engine.SAVE_REF_ID).trim() || `device-${index}`
    if (references.has(reference)) throw new Error('PKT file contains duplicate device references.')
    device.id = `import-${reference}`; device.name = name; device.config.hostname = name
    device.power = boolean(engine.POWER); device.originalDeviceType = originalType
    device.macAddress = normalizePhoneMac(text(engine.BUILD_IN_ADDR)) || undefined
    device.importedRunningConfig = list(node(engine.RUNNINGCONFIG).LINE).map(text)
    device.importedStartupConfig = list(node(engine.STARTUPCONFIG).LINE).map(text)
    const physical = modulePorts(engine.MODULE)
    if (physical.length) device.ports = physical.map((item, portIndex) => {
      const role = type === 'phone' ? ['Switch','PC'][portIndex] : undefined
      const name = text(item.NAME).trim() || role || device.ports[portIndex]?.name || `Port${portIndex}`
      const media = text(item.TYPE).toLowerCase()
      const portType = media.includes('serial') ? 'serial' : media.includes('gigabit') ? 'gigabitethernet' : media.includes('wireless') ? 'wireless' : 'fastethernet'
      const port = createPort(name, shortName(name), portType, boolean(item.POWER) ? 'up' : 'down')
      const mac = text(item.MACADDRESS).replace(/[^0-9a-f]/gi,'')
      if (mac.length === 12) port.macAddress = mac.match(/.{2}/g)!.join(':').toLowerCase()
      const ip = text(item.IP).trim(); const mask = text(item.SUBNET).trim()
      if (isValidIpv4(ip) && ip !== '0.0.0.0') port.ipAddress = ip
      if (isValidIpv4(mask) && mask !== '0.0.0.0') port.subnetMask = mask
      return port
    })
    device.config.defaultGateway = text(engine.GATEWAY).trim() || undefined
    applyConfig(device, device.importedRunningConfig)
    if (type === 'router') {
      for (const sub of device.ports) {
        if (sub.name.includes('.')) {
          const parentName = sub.name.split('.')[0]
          const parent = device.ports.find(p => p.name.toLowerCase() === parentName.toLowerCase())
          if (parent) { sub.parentPortId = parent.id; sub.macAddress = parent.macAddress }
        }
      }
      Object.assign(device.config,parseVoiceConfiguration(device.importedRunningConfig))
    }
    for (const port of device.ports) if (port.ipAddress && port.subnetMask) device.routingTable.push({ network:getNetworkAddress(port.ipAddress,port.subnetMask),netmask:port.subnetMask,nextHop:'0.0.0.0',interfaceName:port.name,metric:0,type:'C' })
    references.set(reference, device)
    return device
  })

  // Normalize extreme off-canvas coordinates (such as PT rack accessories at 3899, 3900)
  // so imported topologies fit prominently and comfortably on the logical canvas.
  const normalDevices = devices.filter(d => d.x < 2500 && d.y < 2500)
  if (normalDevices.length > 0 && normalDevices.length < devices.length) {
    const minX = Math.min(...normalDevices.map(d => d.x))
    const maxY = Math.max(...normalDevices.map(d => d.y))
    let offsetIdx = 0
    for (const d of devices) {
      if (d.x >= 2500 || d.y >= 2500) {
        d.x = minX + (offsetIdx * 120)
        d.y = maxY + 120
        offsetIdx++
      }
    }
  }

  // Shift distant or negative topologies toward standard logical canvas origin
  if (normalDevices.length > 0) {
    const minX = Math.min(...normalDevices.map(d => d.x))
    const minY = Math.min(...normalDevices.map(d => d.y))
    if (minX > 300 || minY > 250 || minX < 0 || minY < 0) {
      const shiftX = minX - 100
      const shiftY = minY - 100
      for (const d of devices) {
        d.x -= shiftX
        d.y -= shiftY
      }
    }
  }

  const links: NetworkLink[] = []
  for (const [index, entry] of cableEntries.entries()) {
    const cable = node(node(entry).CABLE)
    const source = references.get(text(cable.FROM).trim()); const target = references.get(text(cable.TO).trim())
    const portNames = list(cable.PORT).map(value => text(value).trim())
    if (!source || !target || portNames.length !== 2) throw new Error('A cable refers to an invalid device or port.')
    const ensurePort = (device: NetworkDevice, name: string) => {
      let port = device.ports.find(port => port.name.toLowerCase() === name.toLowerCase())
      if (!port) { port = createPort(name,shortName(name),'fastethernet','up');device.ports.push(port);warnings.push(`${device.name}: interface ${name} was restored from its cable reference.`) }
      if (port.connectedLinkId) throw new Error(`Multiple cables use ${device.name} ${name}.`)
      return port
    }
    const a = ensurePort(source,portNames[0]); const b = ensurePort(target,portNames[1])
    const media = text(cable.TYPE).toLowerCase()
    const type = media.includes('cross') ? 'crossover' : media.includes('console') ? 'console' : media.includes('serial') ? 'serial' : media.includes('fiber') ? 'fiber' : 'straight'
    const link: NetworkLink = { id:`import-link-${index}`,type,fromDeviceId:source.id,fromPortId:a.id,toDeviceId:target.id,toPortId:b.id,status:boolean(cable.FUNCTIONAL)?'up':'down' }
    Object.assign(a,{connectedLinkId:link.id,connectedDeviceId:target.id,connectedPortId:b.id})
    Object.assign(b,{connectedLinkId:link.id,connectedDeviceId:source.id,connectedPortId:a.id})
    links.push(link)
  }
  const synchronized = synchronizeLinkState(devices,links)
  return { ...synchronized,annotations:[],warnings,version:text(document.VERSION).trim() }
}
