import type { DeviceConfig, NetworkDevice, NetworkLink, NetworkPort } from '@/types/network'
import { getNetworkAddress, ipToNumber, numberToIp, isInSameSubnet, isValidIpv4 } from './protocols/ip'

export const normalizePhoneMac = (mac: string) => mac.replace(/[^a-f0-9]/gi, '').toLowerCase()

export function parseVoiceConfiguration(lines: string[]): Partial<DeviceConfig> {
  const telephony: NonNullable<DeviceConfig['telephony']> = { directoryNumbers: [], ephones: [] }
  const dhcpPools: NonNullable<DeviceConfig['dhcpPools']> = []
  const excludedDhcpIps: string[] = []
  let section = ''
  let id = 0
  let pool: (typeof dhcpPools)[number] | undefined
  for (const raw of lines) {
    const line = raw.trim()
    const words = line.split(/\s+/)
    if (line === '!' || line === 'end') { section = ''; pool = undefined; continue }
    if (line === 'telephony-service') { section = 'service'; continue }
    if (/^ephone-dn \d+/.test(line)) { section = 'dn'; id = Number(words[1]); telephony.directoryNumbers.push({ id, number: '' }); continue }
    if (/^ephone \d+$/.test(line)) { section = 'phone'; id = Number(words[1]); telephony.ephones.push({ id, buttons: [] }); continue }
    if (line.startsWith('ip dhcp pool ')) { section = 'pool'; pool = { name: words[3], network: '0.0.0.0', mask: '0.0.0.0' }; dhcpPools.push(pool); continue }
    if (line.startsWith('ip dhcp excluded-address ')) { excludedDhcpIps.push(words.slice(3).join(' ')); continue }
    if (/^(interface|line|router)\s/.test(line)) { section = ''; continue }
    if (section === 'service') {
      if (words[0] === 'max-ephones') telephony.maxEphones = Number(words[1])
      if (words[0] === 'max-dn') telephony.maxDn = Number(words[1])
      if (words.slice(0,2).join(' ') === 'ip source-address') { telephony.sourceIp = words[2]; telephony.port = Number(words[4]) || 2000 }
      if (words[0] === 'auto' && words[1] === 'assign') telephony.autoAssign = { start: Number(words[2]), end: Number(words[4] || words[2]) }
    }
    if (section === 'dn' && words[0] === 'number') telephony.directoryNumbers.find(dn => dn.id === id)!.number = words[1]
    if (section === 'phone') {
      const phone = telephony.ephones.find(phone => phone.id === id)!
      if (words[0] === 'mac-address') phone.macAddress = normalizePhoneMac(words[1])
      if (words[0] === 'button') phone.buttons = words.slice(1).map(binding => binding.split(':')).filter(pair => pair.length === 2).map(([line,dn]) => ({ line: Number(line), dn: Number(dn) }))
    }
    if (section === 'pool' && pool) {
      if (words[0] === 'network') { pool.network = words[1]; pool.mask = words[2] }
      if (words[0] === 'host' && isValidIpv4(words[1]) && isValidIpv4(words[2])) { pool.hostIp = words[1]; pool.hostMask = words[2]; pool.network = getNetworkAddress(words[1], words[2]); pool.mask = words[2] }
      if (words[0] === 'hardware-address') pool.hardwareAddress = normalizePhoneMac(words[1] || '')
      if (words[0] === 'client-identifier') pool.clientIdentifier = normalizePhoneMac(words[1] || '')
      if (words[0] === 'default-router') pool.defaultRouter = words[1]
      if (words[0] === 'dns-server') pool.dnsServer = words[1]
      if (words.slice(0,3).join(' ') === 'option 150 ip') pool.tftpServer = words[3]
      if (words[0] === 'lease') {
        const values = words.slice(1).map(Number)
        if (values.length >= 1 && values.length <= 3 && words.slice(1).every(value => /^\d+$/.test(value))) {
          const [days = 0, hours = 0, minutes = 0] = values
          const seconds = days * 86400 + hours * 3600 + minutes * 60
          if (days <= 100 && hours <= 23 && minutes <= 59 && seconds >= 60) pool.leaseDurationSeconds = seconds
        }
      }
    }
  }
  return { telephony, dhcpPools, excludedDhcpIps }
}

export interface PhoneRegistration {
  deviceId: string
  macAddress: string
  extension: string
  registered: boolean
  reason: string
  ipAddress?: string
  routerId?: string
  vlan?: number
}

function carriesVoice(device: NetworkDevice, port: NetworkPort, vlan: number) {
  if (device.power === false || port.adminStatus !== 'up' || port.status !== 'up') return false
  if (device.type === 'switch') return port.portMode === 'trunk' ? port.allowedVlans === undefined || port.allowedVlans.includes(vlan) : (port.voiceVlan ?? port.vlan ?? 1) === vlan
  return true
}

function reachableRouter(phone: NetworkDevice, router: NetworkDevice, vlan: number, devices: NetworkDevice[], links: NetworkLink[]) {
  const byId = new Map(devices.map(device => [device.id, device]))
  const source = router.ports.find(port => port.ipAddress === router.config.telephony?.sourceIp && port.adminStatus === 'up' && port.status === 'up')
  if (!source || router.power === false || (source.vlan ?? 1) !== vlan) return false
  const targetPort = router.ports.find(port => port.name === source.name.split('.')[0]) || source
  const pending = [phone.id]
  const visited = new Set(pending)
  for (let index = 0; index < pending.length; index++) {
    const current = byId.get(pending[index])!
    for (const link of links) {
      if (link.status !== 'up' || ['console','usb','phone','octal','coaxial'].includes(link.type)) continue
      const forward = link.fromDeviceId === current.id
      if (!forward && link.toDeviceId !== current.id) continue
      const local = current.ports.find(port => port.id === (forward ? link.fromPortId : link.toPortId))
      const peer = byId.get(forward ? link.toDeviceId : link.fromDeviceId)
      const remote = peer?.ports.find(port => port.id === (forward ? link.toPortId : link.fromPortId))
      if (!peer || !local || !remote || !carriesVoice(current,local,vlan) || !carriesVoice(peer,remote,vlan)) continue
      if (current.type === 'phone' && local !== (current.ports.find(port => port.name === 'Switch') || current.ports[0])) continue
      if (peer.id === router.id && remote.id === targetPort.id) return true
      if (visited.has(peer.id) || !['switch','hub','wireless'].includes(peer.type)) continue
      visited.add(peer.id); pending.push(peer.id)
    }
  }
  return false
}

export function getPhoneRegistrations(devices: NetworkDevice[], links: NetworkLink[]): PhoneRegistration[] {
  const phones = devices.filter(device => device.type === 'phone').sort((a,b) => a.id.localeCompare(b.id))
  const routers = devices.filter(device => device.type === 'router' && device.config.telephony?.sourceIp)
  const assigned = new Map<string, Set<number>>()
  const usedIps = new Set(devices.flatMap(device => device.ports.map(port => port.ipAddress).filter((ip): ip is string => !!ip)))
  const registrations = phones.map(phone => {
    const uplink = phone.ports.find(port => port.name === 'Switch') || phone.ports[0]
    const macAddress = normalizePhoneMac(phone.macAddress || uplink?.macAddress || '')
    const result: PhoneRegistration = { deviceId: phone.id, macAddress, extension: '', registered: false, reason: 'No reachable Call Manager Express' }
    if (phone.power === false) return { ...result, reason: 'Phone powered off' }
    if (!uplink || uplink.adminStatus !== 'up' || uplink.status !== 'up') return { ...result, reason: 'Network uplink down' }
    const uplinkCable = links.find(link => link.fromDeviceId === phone.id && link.fromPortId === uplink.id || link.toDeviceId === phone.id && link.toPortId === uplink.id)
    const peer = devices.find(device => device.id === (uplinkCable?.fromDeviceId === phone.id ? uplinkCable.toDeviceId : uplinkCable?.fromDeviceId))
    const peerPort = peer?.ports.find(port => port.id === (uplinkCable?.fromDeviceId === phone.id ? uplinkCable.toPortId : uplinkCable?.fromPortId))
    const vlan = peerPort?.voiceVlan ?? uplink.vlan ?? peerPort?.vlan ?? 1
    result.vlan = vlan
    for (const router of routers) {
      if (!reachableRouter(phone,router,vlan,devices,links)) continue
      const service = router.config.telephony!
      const source = router.ports.find(port => port.ipAddress === service.sourceIp)!
      let ipAddress = uplink.ipAddress
      if (ipAddress && (!source.subnetMask || !isInSameSubnet(ipAddress,service.sourceIp!,source.subnetMask))) { result.reason = 'Phone IP is outside the voice subnet'; continue }
      if (!ipAddress) {
        const pool = router.config.dhcpPools?.find(pool => pool.tftpServer === service.sourceIp && isInSameSubnet(pool.network,service.sourceIp!,pool.mask))
        if (!pool) { result.reason = 'No voice DHCP pool with option 150'; continue }
        const base = ipToNumber(pool.network) & ipToNumber(pool.mask)
        const broadcast = (base | ~ipToNumber(pool.mask)) >>> 0
        for (let candidate = (base >>> 0) + 1; candidate < broadcast && candidate < (base >>> 0) + 65536; candidate++) {
          const ip = numberToIp(candidate)
          const excluded = router.config.excludedDhcpIps?.some(range => { const [start,end = start] = range.split(/\s+/); return candidate >= ipToNumber(start) && candidate <= ipToNumber(end) })
          if (!excluded && !usedIps.has(ip) && ip !== service.sourceIp && ip !== pool.defaultRouter) { ipAddress = ip; break }
        }
        if (!ipAddress) { result.reason = 'Voice DHCP pool exhausted'; continue }
      }
      const registeredDns = assigned.get(router.id) || new Set<number>()
      if (registeredDns.size >= (service.maxEphones ?? 0)) { result.reason = 'CME phone capacity reached'; continue }
      const ephone = service.ephones.find(entry => entry.macAddress && normalizePhoneMac(entry.macAddress) === macAddress)
      let dnId = ephone?.buttons.find(button => button.line === 1)?.dn
      if (dnId === undefined && service.autoAssign) dnId = service.directoryNumbers.find(dn => dn.id >= service.autoAssign!.start && dn.id <= service.autoAssign!.end && !registeredDns.has(dn.id) && !service.ephones.some(entry => entry.macAddress && entry.buttons.some(button => button.dn === dn.id)))?.id
      const dn = service.directoryNumbers.find(dn => dn.id === dnId && dn.id <= (service.maxDn ?? 0))
      if (!dn?.number) { result.reason = 'No directory number assigned to this phone MAC'; continue }
      registeredDns.add(dn.id); assigned.set(router.id,registeredDns); usedIps.add(ipAddress)
      return { ...result, extension: dn.number, registered: true, reason: 'Registered', ipAddress, routerId: router.id }
    }
    return result
  })
  const counts = new Map<string, number>()
  for (const reg of registrations) if (reg.registered) { const key = `${reg.routerId}:${reg.extension}`; counts.set(key,(counts.get(key) || 0) + 1) }
  return registrations.map(reg => (counts.get(`${reg.routerId}:${reg.extension}`) || 0) > 1 ? { ...reg,registered:false,reason:'Duplicate directory number' } : reg)
}
