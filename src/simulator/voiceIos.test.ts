import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from './deviceFactory'
import { getPrompt } from './ios/ciscoParser'
import { useNetworkStore } from '../store/networkStore'
import type { DeviceType } from '../types/network'

function configuredDevice(type: DeviceType = 'router') {
  const device = createDevice(type, 0, 0)
  device.config.hostname = type === 'router' ? 'VoiceRouter' : 'VoiceSwitch'
  useNetworkStore.getState().loadLab([device], [])
  commands(device.id, 'enable', 'configure terminal')
  return device.id
}

function commands(id: string, ...lines: string[]) {
  return lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
}

function device(id: string) {
  return useNetworkStore.getState().devices.find(item => item.id === id)!
}

test('IOS telephony-service commands configure the CME source, capacities and automatic assignment', () => {
  const id = configuredDevice()
  commands(id, 'telephony-service')
  assert.equal(getPrompt(device(id)), 'VoiceRouter(config-telephony)#')
  const output = commands(id, 'max-ephones 2', 'max-dn 2', 'ip source-address 192.168.20.1 port 2000', 'auto assign 1 to 2')
  assert.ok(output.every(line => !line.includes('%')))
  const service = device(id).config.telephony
  assert.equal(service?.maxEphones, 2)
  assert.equal(service?.maxDn, 2)
  assert.equal(service?.sourceIp, '192.168.20.1')
  assert.equal(service?.port, 2000)
  assert.deepEqual(service?.autoAssign, { start: 1, end: 2 })
  commands(id, 'exit')
  assert.equal(device(id).currentCliMode, 'config')
  assert.equal(getPrompt(device(id)), 'VoiceRouter(config)#')
})

test('IOS directory-number and ephone modes assign a phone MAC to its button line', () => {
  const id = configuredDevice()
  commands(id, 'ephone-dn 1')
  assert.equal(getPrompt(device(id)), 'VoiceRouter(config-ephone-dn)#')
  commands(id, 'number 101', 'exit')
  assert.equal(device(id).currentCliMode, 'config')
  commands(id, 'ephone 1')
  assert.equal(getPrompt(device(id)), 'VoiceRouter(config-ephone)#')
  const output = commands(id, 'mac-address 0011.2233.4401', 'button 1:1', 'exit')
  assert.ok(output.every(line => !line.includes('%')))
  const service = device(id).config.telephony
  assert.deepEqual(service?.directoryNumbers, [{ id: 1, number: '101' }])
  assert.equal(service?.ephones.length, 1)
  assert.equal(service?.ephones[0].id, 1)
  assert.equal(service?.ephones[0].macAddress?.replace(/[^a-f0-9]/gi, '').toLowerCase(), '001122334401')
  assert.deepEqual(service?.ephones[0].buttons, [{ line: 1, dn: 1 }])
  assert.equal(getPrompt(device(id)), 'VoiceRouter(config)#')
})

test('re-entering an ephone or directory number edits its existing entry', () => {
  const id = configuredDevice()
  commands(id, 'ephone-dn 1', 'number 101', 'exit', 'ephone-dn 1', 'number 111', 'exit',
    'ephone 1', 'mac-address 0011.2233.4401', 'button 1:1', 'exit',
    'ephone 1', 'mac-address 0011.2233.4499', 'exit')
  assert.deepEqual(device(id).config.telephony?.directoryNumbers, [{ id: 1, number: '111' }])
  assert.equal(device(id).config.telephony?.ephones.length, 1)
  assert.equal(device(id).config.telephony?.ephones[0].macAddress?.replace(/[^a-f0-9]/gi, '').toLowerCase(), '001122334499')
})

test('IOS DHCP subcommands update the same named voice pool across separate commands', () => {
  const id = configuredDevice()
  commands(id, 'ip dhcp pool VOICE')
  assert.equal(getPrompt(device(id)), 'VoiceRouter(config-dhcp)#')
  const output = commands(id, 'network 192.168.20.0 255.255.255.0', 'default-router 192.168.20.1',
    'option 150 ip 192.168.20.1', 'dns-server 192.168.20.2')
  assert.ok(output.every(line => !line.includes('%')))
  assert.deepEqual(device(id).config.dhcpPools, [{
    name: 'VOICE', network: '192.168.20.0', mask: '255.255.255.0',
    defaultRouter: '192.168.20.1', tftpServer: '192.168.20.1', dnsServer: '192.168.20.2',
  }])
  commands(id, 'exit', 'ip dhcp pool DATA', 'network 192.168.10.0 255.255.255.0', 'exit',
    'ip dhcp pool VOICE', 'default-router 192.168.20.254', 'exit')
  assert.equal(device(id).config.dhcpPools?.length, 2)
  assert.equal(device(id).config.dhcpPools?.find(pool => pool.name === 'VOICE')?.defaultRouter, '192.168.20.254')
  assert.equal(device(id).config.dhcpPools?.find(pool => pool.name === 'VOICE')?.tftpServer, '192.168.20.1')
})

test('IOS DHCP pool lease accepts Cisco day hour minute syntax and rejects invalid durations', () => {
  const id = configuredDevice()
  commands(id, 'ip dhcp pool STUDENTS', 'network 10.20.0.0 255.255.255.0')
  const [leaseOutput] = commands(id, 'lease 0 0 2')
  assert.doesNotMatch(leaseOutput, /%/)
  assert.equal(device(id).config.dhcpPools?.[0].leaseDurationSeconds, 120)
  const [invalidOutput] = commands(id, 'lease 0 -1 2')
  assert.match(invalidOutput, /Invalid input/)
  assert.equal(device(id).config.dhcpPools?.[0].leaseDurationSeconds, 120)
  commands(id, 'end')
  const [poolOutput, runningConfig] = commands(id, 'show ip dhcp pool', 'show running-config')
  assert.match(poolOutput, /Lease 120 seconds/)
  assert.match(runningConfig, /lease 0 0 2/)
})

test('IOS NTP master and server commands validate, configure, and appear in running config', () => {
  const id = configuredDevice()
  const masterOutput = commands(id, 'ntp master 4')[0]
  assert.doesNotMatch(masterOutput, /%/)
  assert.equal(device(id).config.ntpMaster, true)
  assert.equal(device(id).config.ntpMasterStratum, 4)
  const serverOutput = commands(id, 'ntp server 192.0.2.20')[0]
  assert.match(serverOutput, /NTP|synchron/i)
  assert.equal(device(id).config.ntpServer, '192.0.2.20')
  const invalid = commands(id, 'ntp master 16')[0]
  assert.match(invalid, /1-15/)
  assert.equal(device(id).config.ntpMasterStratum, 4)
  commands(id, 'end')
  const [status, associations, runningConfig] = commands(id, 'show ntp status', 'show ntp associations', 'show running-config')
  assert.match(status, /synchronized, stratum 4/i)
  assert.match(associations, /~192\.0\.2\.20/)
  assert.match(runningConfig, /ntp master 4/)
  assert.match(runningConfig, /ntp server 192\.0\.2\.20/)
  commands(id, 'configure terminal', 'no ntp server 192.0.2.20', 'no ntp')
  assert.equal(device(id).config.ntpMaster, false)
  assert.equal(device(id).config.ntpServer, undefined)
})

test('IOS DHCP host pools configure hardware and client-identifier reservations and preserve them in running config', () => {
  const id = configuredDevice()
  commands(id, 'ip dhcp pool LAPTOP-01')
  const hardwareOutput = commands(id, 'host 192.168.20.40 255.255.255.0', 'hardware-address 0011.2233.4401 ethernet')
  assert.ok(hardwareOutput.every(line => !line.includes('%')))
  commands(id, 'exit', 'ip dhcp pool LAPTOP-02')
  const identifierOutput = commands(id, 'host 192.168.20.41 255.255.255.0', 'client-identifier 01aa.bbcc.ddee.ff')
  assert.ok(identifierOutput.every(line => !line.includes('%')))
  const pools = device(id).config.dhcpPools
  assert.deepEqual(pools?.[0], {
    name: 'LAPTOP-01', network: '192.168.20.0', mask: '255.255.255.0',
    hostIp: '192.168.20.40', hostMask: '255.255.255.0', hardwareAddress: '001122334401',
  })
  assert.deepEqual(pools?.[1], {
    name: 'LAPTOP-02', network: '192.168.20.0', mask: '255.255.255.0',
    hostIp: '192.168.20.41', hostMask: '255.255.255.0', clientIdentifier: '01aabbccddeeff',
  })
  const invalidNetwork = commands(id, 'network 192.168.20.0 255.255.255.0')[0]
  assert.match(invalidNetwork, /Invalid input/)
  commands(id, 'end')
  const [poolOutput, runningConfig] = commands(id, 'show ip dhcp pool', 'show running-config')
  assert.match(poolOutput, /Host 192\.168\.20\.40 255\.255\.255\.0/)
  assert.match(poolOutput, /Hardware address 001122334401/)
  assert.match(poolOutput, /Client identifier 01aabbccddeeff/)
  assert.match(runningConfig, /host 192\.168\.20\.40 255\.255\.255\.0/)
  assert.match(runningConfig, /hardware-address 001122334401 ethernet/)
  assert.match(runningConfig, /client-identifier 01aabbccddeeff/)
  const invalid = commands(id, 'configure terminal', 'ip dhcp pool LAPTOP-02', 'hardware-address 0011.2233.4401 ethernet')[2]
  assert.match(invalid, /Invalid input/)
  assert.equal(device(id).config.dhcpPools?.[1].clientIdentifier, '01aabbccddeeff')
})

test('IOS voice VLAN assignment preserves the interface data VLAN', () => {
  const id = configuredDevice('switch')
  commands(id, 'interface fa0/1', 'switchport access vlan 10')
  const [output] = commands(id, 'switchport voice vlan 20')
  assert.doesNotMatch(output, /%/)
  const port = device(id).ports.find(port => port.shortName === 'Fa0/1')!
  assert.equal(port.vlan, 10)
  assert.equal(port.voiceVlan, 20)
  assert.equal(getPrompt(device(id)), 'VoiceSwitch(config-if)#')
})

test('end exits a voice configuration mode to privileged EXEC', () => {
  const id = configuredDevice()
  commands(id, 'ephone-dn 1', 'number 101', 'end')
  assert.equal(getPrompt(device(id)), 'VoiceRouter#')
  commands(id, 'configure terminal', 'ephone-dn 2', 'number 102', 'exit')
  assert.deepEqual(device(id).config.telephony?.directoryNumbers, [{ id: 1, number: '101' }, { id: 2, number: '102' }])
})
