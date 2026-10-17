import type { NetworkDevice } from '@/types/network'
import type { IosExecutionResult } from './ciscoParser'
import { normalizePhoneMac } from '../voice'
import { getNetworkAddress, isValidIpv4 } from '../protocols/ip'

export function parseVoiceIos(device: NetworkDevice, line: string): IosExecutionResult | null {
  const parts = line.split(/\s+/)
  const cmd = parts[0].toLowerCase()
  const mode = device.currentCliMode
  const invalid = { output: "% Invalid input detected at '^' marker." }
  if (mode === 'config' && device.type === 'router') {
    if (line === 'telephony-service') return { output:'',newMode:'config-telephony',newDeviceConfig:{telephony:device.config.telephony || {directoryNumbers:[],ephones:[]}} }
    if (/^ephone(?:-dn)? \d+(?: dual-line)?$/.test(line)) {
      const id = Number(parts[1]); if(id<1 || id>2000) return invalid
      const telephony = structuredClone(device.config.telephony || {directoryNumbers:[],ephones:[]})
      if(cmd==='ephone-dn' && !telephony.directoryNumbers.some(dn=>dn.id===id))telephony.directoryNumbers.push({id,number:''})
      if(cmd==='ephone' && !telephony.ephones.some(phone=>phone.id===id))telephony.ephones.push({id,buttons:[]})
      return { output:'',newMode:cmd==='ephone'?'config-ephone':'config-ephone-dn',newActiveVoiceId:id,newDeviceConfig:{telephony} }
    }
    if (line.startsWith('ip dhcp pool ') && parts[3]) {
      const dhcpPools = [...(device.config.dhcpPools || [])]
      if(!dhcpPools.some(pool=>pool.name===parts[3]))dhcpPools.push({name:parts[3],network:'0.0.0.0',mask:'0.0.0.0'})
      return { output:'',newMode:'config-dhcp',newActiveDhcpPool:parts[3],newDeviceConfig:{dhcpPools} }
    }
    if (line.startsWith('ip dhcp excluded-address ')) {
      if(!isValidIpv4(parts[3]) || parts[4] && !isValidIpv4(parts[4]))return invalid
      return {output:'',newDeviceConfig:{excludedDhcpIps:[...(device.config.excludedDhcpIps || []),parts.slice(3).join(' ')]}}
    }
  }
  if (['config-telephony','config-ephone','config-ephone-dn'].includes(mode)) {
    if (cmd==='exit' || cmd==='end' || cmd==='do' || line==='?')return null
    const telephony = structuredClone(device.config.telephony || {directoryNumbers:[],ephones:[]})
    if(mode==='config-telephony') {
      if(['max-ephones','max-dn'].includes(cmd) && /^\d+$/.test(parts[1]) && Number(parts[1])>=1 && Number(parts[1])<=2000)telephony[cmd==='max-dn'?'maxDn':'maxEphones']=Number(parts[1])
      else if(line.startsWith('ip source-address ') && isValidIpv4(parts[2]) && (!parts[4] || Number(parts[4])>=1 && Number(parts[4])<=65535)){telephony.sourceIp=parts[2];telephony.port=Number(parts[4])||2000}
      else if(/^auto assign \d+ to \d+$/.test(line) && Number(parts[2])<=Number(parts[4]))telephony.autoAssign={start:Number(parts[2]),end:Number(parts[4])}
      else if(line==='no auto assign')telephony.autoAssign=undefined
      else return invalid
    }
    if(mode==='config-ephone-dn') {
      const dn = telephony.directoryNumbers.find(dn=>dn.id===device.activeVoiceId)
      if(!dn || cmd!=='number' || !/^[0-9*#]{1,24}$/.test(parts[1]))return invalid
      dn.number=parts[1]
    }
    if(mode==='config-ephone') {
      const phone = telephony.ephones.find(phone=>phone.id===device.activeVoiceId)
      if(!phone)return invalid
      if(cmd==='mac-address' && normalizePhoneMac(parts[1]||'').length===12)phone.macAddress=normalizePhoneMac(parts[1])
      else if(cmd==='button' && parts.length>1 && parts.slice(1).every(binding=>/^\d+:\d+$/.test(binding)))phone.buttons=parts.slice(1).map(binding=>{const [line,dn]=binding.split(':').map(Number);return{line,dn}})
      else if(cmd==='type' && parts[1]==='7960' || line==='device-security-mode none')return {output:''}
      else return invalid
    }
    return {output:'',newDeviceConfig:{telephony}}
  }
  if(mode==='config-dhcp' && device.activeDhcpPool) {
    const dhcpPools = structuredClone(device.config.dhcpPools || [])
    const pool = dhcpPools.find(pool=>pool.name===device.activeDhcpPool)
    if(!pool)return invalid
    if(cmd==='network'){
      if(pool.hostIp||!isValidIpv4(parts[1])||!isValidIpv4(parts[2]))return invalid
      pool.network=parts[1];pool.mask=parts[2]
    }
    else if(cmd==='host'){
      if(pool.network!=='0.0.0.0'&&!pool.hostIp||!isValidIpv4(parts[1])||!isValidIpv4(parts[2]))return invalid
      pool.hostIp=parts[1];pool.hostMask=parts[2];pool.network=getNetworkAddress(parts[1],parts[2]);pool.mask=parts[2]
    }
    else if(cmd==='hardware-address'&&parts[1]&&(!parts[2]||['ethernet','ieee802'].includes(parts[2].toLowerCase()))){
      if(pool.clientIdentifier)return invalid
      if(!/^(?:[0-9a-f]{12}|[0-9a-f]{4}(?:\.[0-9a-f]{4}){2}|[0-9a-f]{2}(?::[0-9a-f]{2}){5})$/i.test(parts[1]))return invalid
      const mac=parts[1].replace(/[^0-9a-f]/gi,'').toLowerCase()
      if(mac.length!==12)return invalid
      pool.hardwareAddress=mac
    }
    else if(cmd==='client-identifier'&&parts[1]){
      if(pool.hardwareAddress)return invalid
      if(!/^(?:[0-9a-f]+|[0-9a-f]{2}(?::[0-9a-f]{2})+|[0-9a-f]{2,4}(?:\.[0-9a-f]{2,4})+)$/i.test(parts[1]))return invalid
      const identifier=parts[1].replace(/[.:-]/g,'').toLowerCase()
      if(!/^(?:[0-9a-f]{2}){2,32}$/.test(identifier))return invalid
      pool.clientIdentifier=identifier
    }
    else if(cmd==='no'&&parts[1]==='hardware-address')pool.hardwareAddress=undefined
    else if(cmd==='no'&&parts[1]==='client-identifier')pool.clientIdentifier=undefined
    else if(cmd==='no'&&parts[1]==='host'){pool.hostIp=undefined;pool.hostMask=undefined}
    else if(['default-router','dns-server'].includes(cmd) && isValidIpv4(parts[1]))pool[cmd==='default-router'?'defaultRouter':'dnsServer']=parts[1]
    else if(line.startsWith('option 150 ip ') && isValidIpv4(parts[3]))pool.tftpServer=parts[3]
    else if(cmd==='lease') {
      const values=parts.slice(1).map(Number)
      if(values.length<1||values.length>3||parts.slice(1).some(value=>!/^\d+$/.test(value)))return invalid
      const [days=0,hours=0,minutes=0]=values
      if(days>100||hours>23||minutes>59)return invalid
      const seconds=days*86400+hours*3600+minutes*60
      if(seconds<60)return invalid
      pool.leaseDurationSeconds=seconds
    }
    else return null
    return {output:'',newDeviceConfig:{dhcpPools}}
  }
  if(mode==='config-if' && line.startsWith('switchport voice vlan ')) {
    const vlan=Number(parts[3]);if(!Number.isInteger(vlan)||vlan<1||vlan>4094)return invalid
    const ids=device.activeRangePorts?.length?device.activeRangePorts:[device.activeInterface]
    return {output:'',modifiedPorts:device.ports.filter(port=>ids.includes(port.id)).map(port=>({portId:port.id,voiceVlan:vlan}))}
  }
  return null
}
