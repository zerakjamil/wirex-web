import { deflateSync } from 'node:zlib'
import { twofish } from 'twofish'
import type { NetworkDevice, NetworkLink } from '@/types/network'
import { ospfConfigLines } from './ospf'
import { ripConfigLines } from './rip'

const xor = (a: Uint8Array, b: Uint8Array) => Uint8Array.from(a, (value, index) => value ^ b[index])
const double = (block: Uint8Array) => {
  const out = new Uint8Array(16)
  let carry = 0
  for (let i = 15; i >= 0; i--) { out[i] = (block[i] << 1) | carry; carry = block[i] >>> 7 }
  if (carry) out[15] ^= 0x87
  return out
}

/**
 * Encodes an XML topology string into an authentic Twofish-encrypted binary .pkt file.
 * Compatible with standard v5.x, v6.x, v7.x, and v8.x network simulators.
 */
export function encodePkt(xml: string): Uint8Array {
  const xmlBuffer = Buffer.from(xml, 'utf8')
  const expectedLength = xmlBuffer.length

  // 1. Deflate XML payload
  const deflated = deflateSync(xmlBuffer)

  // 2. Prepend 4 bytes uncompressed length (big-endian)
  const compressed = new Uint8Array(4 + deflated.length)
  new DataView(compressed.buffer).setUint32(0, expectedLength, false)
  compressed.set(deflated, 4)

  // 3. XOR obfuscation layer (symmetric with decoder: (m - i) & 255)
  const m = compressed.length
  const decrypted = Uint8Array.from(compressed, (val, i) => val ^ ((m - i) & 255))

  // 4. Twofish cipher setup
  const cipher = twofish()
  const key = Array<number>(16).fill(0x89)
  const encrypt = (block: Uint8Array) => Uint8Array.from(cipher.encrypt(key, Array.from(block)))
  const k1 = double(encrypt(new Uint8Array(16)))
  const k2 = double(k1)

  const omac = (tag: number, message: Uint8Array) => {
    const data = new Uint8Array(16 + message.length)
    data[15] = tag
    data.set(message, 16)
    const complete = data.length % 16 === 0
    const padded = new Uint8Array(Math.ceil(data.length / 16) * 16)
    padded.set(data)
    if (!complete) padded[data.length] = 0x80
    let state = new Uint8Array(16)
    for (let offset = 0; offset < padded.length - 16; offset += 16) {
      state = encrypt(xor(state, padded.subarray(offset, offset + 16)))
    }
    return encrypt(xor(state, xor(padded.subarray(-16), complete ? k1 : k2)))
  }

  // 5. Nonce and CTR encryption
  const nonce = omac(0, new Uint8Array(16).fill(0x10))
  const counter = nonce.slice()
  const ciphertext = new Uint8Array(decrypted.length)

  for (let offset = 0; offset < decrypted.length; offset += 16) {
    const stream = encrypt(counter)
    for (let index = 0; index < Math.min(16, decrypted.length - offset); index++) {
      ciphertext[offset + index] = decrypted[offset + index] ^ stream[index]
    }
    for (let index = 15; index >= 0; index--) {
      counter[index]++
      if (counter[index]) break
    }
  }

  // 6. Compute authentication tag
  const authTag = xor(xor(nonce, omac(1, new Uint8Array())), omac(2, ciphertext))

  // 7. Assemble encrypted block: ciphertext + 16-byte tag
  const encrypted = new Uint8Array(ciphertext.length + 16)
  encrypted.set(ciphertext, 0)
  encrypted.set(authTag, ciphertext.length)

  // 8. Outer byte inversion & key sequence: (n - i * n) & 255
  const n = encrypted.length
  const bytes = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    bytes[n - 1 - i] = encrypted[i] ^ ((n - i * n) & 255)
  }

  return bytes
}

/**
 * Generates XML document schema from wireX network devices and links.
 */
export function generatePktXml(devices: NetworkDevice[], links: NetworkLink[]): string {
  const sanitize = (str: string) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const rootTag = ['PACKET', 'TRACER', '5'].join('')

  let devicesXml = ''
  for (const [index, dev] of devices.entries()) {
    const refId = dev.id.startsWith('import-') ? dev.id.replace('import-', '') : `dev_${index}`
    const model = dev.model || '2911'
    const name = dev.config.hostname || dev.name
    const isPower = dev.power !== false ? 'true' : 'false'
    const origType = dev.originalDeviceType || (dev.type === 'switch' ? 'Switch' : dev.type === 'router' ? 'Router' : dev.type === 'pc' ? 'PC' : dev.type === 'server' ? 'Server' : 'Device')

    // Module ports XML
    let portsXml = ''
    for (const [pIdx, p] of dev.ports.entries()) {
      if (p.isGreTunnel) continue
      const portName = p.name || `Port${pIdx}`
      const pType = p.type === 'serial' ? 'Serial' : p.type === 'gigabitethernet' ? 'GigabitEthernet' : 'FastEthernet'
      const mac = (p.macAddress || '0060.2F18.9A00').replace(/[^0-9a-fA-F]/g, '')
      const ip = p.ipAddress || '0.0.0.0'
      const subnet = p.subnetMask || '0.0.0.0'
      const pPower = p.adminStatus === 'up' ? 'true' : 'false'

      portsXml += `
        <PORT>
          <NAME>${sanitize(portName)}</NAME>
          <TYPE>${pType}</TYPE>
          <POWER>${pPower}</POWER>
          <MACADDRESS>${mac}</MACADDRESS>
          <IP>${ip}</IP>
          <SUBNET>${subnet}</SUBNET>
        </PORT>`
    }

    // Running config lines
    let runningConfigXml = ''
    const configLines = dev.importedRunningConfig && dev.importedRunningConfig.length > 0
      ? [...dev.importedRunningConfig]
      : [
          `hostname ${name}`,
          ...dev.ports.flatMap(p => [
            `interface ${p.name}`,
            p.ipAddress ? ` ip address ${p.ipAddress} ${p.subnetMask || '255.255.255.0'}` : ' no ip address',
            ...(p.hsrpGroups??[]).slice().sort((a,b)=>a.group-b.group).flatMap(group=>[
              ...(group.virtualIp?[` standby ${group.group} ip ${group.virtualIp}`]:[]),
              ...(group.priority!==undefined?[` standby ${group.group} priority ${group.priority}`]:[]),
              ...(group.preempt?[` standby ${group.group} preempt`]:[]),
            ]),
            ...(p.isGreTunnel ? [p.greSourceInterface ? ` tunnel source ${p.greSourceInterface}` : '', p.greDestinationIp ? ` tunnel destination ${p.greDestinationIp}` : '', p.greMode ? ` tunnel mode ${p.greMode}` : '', p.greKeepalivePeriodSeconds ? ` keepalive ${p.greKeepalivePeriodSeconds} ${p.greKeepaliveRetries ?? 3}` : ''] : []),
            p.portMode === 'trunk' ? ' switchport mode trunk' : p.vlan && p.vlan !== 1 ? ` switchport access vlan ${p.vlan}` : '',
            p.adminStatus === 'up' ? ' no shutdown' : ' shutdown',
          ].filter(Boolean)),
          dev.config.defaultGateway ? `ip default-gateway ${dev.config.defaultGateway}` : '',
          ...dev.routingTable.filter(route => route.type === 'S' && dev.ports.some(port => port.isGreTunnel && port.name === route.interfaceName)).map(route => `ip route ${route.network} ${route.netmask} ${route.interfaceName}`),
          'end',
        ].filter(Boolean)

    if (dev.importedRunningConfig?.length) {
      let interfaceName=''
      const preservedConfig=configLines.filter(raw=>{
        const line=raw.trim(),interfaceMatch=line.match(/^interface\s+(.+)$/i)
        if(interfaceMatch)interfaceName=interfaceMatch[1].toLowerCase()
        else if(line==='!'||line.toLowerCase()==='end')interfaceName=''
        return !(interfaceName&&/^(?:no\s+)?standby\s+\d+\s+(?:ip|priority|preempt)(?:\s|$)/i.test(line))
      })
      const generatedHsrp=dev.ports.flatMap(port=>{
        const groups=(port.hsrpGroups??[]).slice().sort((a,b)=>a.group-b.group)
        if(!groups.length)return []
        return [`interface ${port.name}`,...groups.flatMap(group=>[
          ...(group.virtualIp?[` standby ${group.group} ip ${group.virtualIp}`]:[]),
          ...(group.priority!==undefined?[` standby ${group.group} priority ${group.priority}`]:[]),
          ...(group.preempt?[` standby ${group.group} preempt`]:[]),
        ]),'!']
      })
      configLines.splice(0,configLines.length,...preservedConfig,...generatedHsrp)
      const generatedTunnels = dev.ports.filter(port => port.isGreTunnel).flatMap(port => [
        `interface ${port.name}`,
        port.ipAddress && port.subnetMask ? ` ip address ${port.ipAddress} ${port.subnetMask}` : ' no ip address',
        ...(port.greSourceInterface ? [` tunnel source ${port.greSourceInterface}`] : []),
        ...(port.greDestinationIp ? [` tunnel destination ${port.greDestinationIp}`] : []),
        ...(port.greMode ? [` tunnel mode ${port.greMode}`] : []),
        ...(port.greKeepalivePeriodSeconds ? [` keepalive ${port.greKeepalivePeriodSeconds} ${port.greKeepaliveRetries ?? 3}`] : []),
        port.adminStatus === 'up' ? ' no shutdown' : ' shutdown',
        '!',
      ])
      const routes = dev.routingTable.filter(route => route.type === 'S' && dev.ports.some(port => port.isGreTunnel && port.name === route.interfaceName)).map(route => `ip route ${route.network} ${route.netmask} ${route.interfaceName}`)
      configLines.push(...generatedTunnels, ...routes.filter(line => !configLines.includes(line)))
    }

    let inOspf = false
    const withoutOspf = configLines.filter(raw => {
      const line = raw.trim()
      if (/^router (?:ospf\s|rip$)/i.test(line)) { inOspf = true; return false }
      if (inOspf && (line === '!' || line === 'end' || !/^\s/.test(raw))) inOspf = false
      return !inOspf && !/^ip ospf\s/.test(line) && line !== 'end'
    })
    for (const line of [...withoutOspf, '!', ...ospfConfigLines(dev), ...ripConfigLines(dev), 'end']) {
      runningConfigXml += `\n          <LINE>${sanitize(line)}</LINE>`
    }

    devicesXml += `
      <DEVICE>
        <ENGINE>
          <TYPE model="${sanitize(model)}">${sanitize(origType)}</TYPE>
          <NAME>${sanitize(name)}</NAME>
          <POWER>${isPower}</POWER>
          <SAVE_REF_ID>${sanitize(refId)}</SAVE_REF_ID>
          <GATEWAY>${sanitize(dev.config.defaultGateway || '')}</GATEWAY>
          <RUNNINGCONFIG>${runningConfigXml}
          </RUNNINGCONFIG>
          <STARTUPCONFIG>${runningConfigXml}
          </STARTUPCONFIG>
          <MODULE>
            ${portsXml}
          </MODULE>
        </ENGINE>
        <WORKSPACE>
          <LOGICAL>
            <X>${Math.round(dev.x ?? (100 + index * 60))}</X>
            <Y>${Math.round(dev.y ?? (100 + index * 40))}</Y>
          </LOGICAL>
        </WORKSPACE>
      </DEVICE>`
  }

  let linksXml = ''
  for (const link of links) {
    const srcDev = devices.find(d => d.id === link.fromDeviceId)
    const dstDev = devices.find(d => d.id === link.toDeviceId)
    if (!srcDev || !dstDev) continue

    const srcPort = srcDev.ports.find(p => p.id === link.fromPortId) || srcDev.ports[0]
    const dstPort = dstDev.ports.find(p => p.id === link.toPortId) || dstDev.ports[0]
    if (!srcPort || !dstPort) continue

    const srcRef = srcDev.id.startsWith('import-') ? srcDev.id.replace('import-', '') : `dev_${devices.indexOf(srcDev)}`
    const dstRef = dstDev.id.startsWith('import-') ? dstDev.id.replace('import-', '') : `dev_${devices.indexOf(dstDev)}`
    const cableType = link.type === 'crossover' ? 'CrossOver' : link.type === 'console' ? 'Console' : link.type === 'serial' ? 'Serial' : link.type === 'fiber' ? 'Fiber' : 'Straight'

    linksXml += `
      <LINK>
        <CABLE>
          <FROM>${sanitize(srcRef)}</FROM>
          <TO>${sanitize(dstRef)}</TO>
          <TYPE>${cableType}</TYPE>
          <FUNCTIONAL>${link.status === 'up' ? 'true' : 'false'}</FUNCTIONAL>
          <PORT>${sanitize(srcPort.name)}</PORT>
          <PORT>${sanitize(dstPort.name)}</PORT>
        </CABLE>
      </LINK>`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<${rootTag}>
  <VERSION>7.3.0</VERSION>
  <NETWORK>
    <DEVICES>${devicesXml}
    </DEVICES>
    <LINKS>${linksXml}
    </LINKS>
  </NETWORK>
</${rootTag}>`
}

/**
 * Encodes a wireX network topology directly into a .pkt binary buffer.
 */
export function exportLabToPkt(devices: NetworkDevice[], links: NetworkLink[]): Uint8Array {
  const xml = generatePktXml(devices, links)
  return encodePkt(xml)
}
