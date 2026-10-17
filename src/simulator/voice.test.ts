import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice, createPort } from './deviceFactory'
import { getPhoneRegistrations, parseVoiceConfiguration } from './voice'
import { useVoiceStore } from '../store/voiceStore'
import { useNetworkStore } from '../store/networkStore'
import type { NetworkDevice, NetworkLink, NetworkPort } from '../types/network'

function fixture() {
  const router = createDevice('router', 300, 0, '2811')
  router.id = 'router'
  router.power = true
  router.ports = [createPort('FastEthernet0/0', 'Fa0/0', 'fastethernet', 'up')]
  Object.assign(router.ports[0], { adminStatus: 'up', vlan: 20, ipAddress: '192.168.20.1', subnetMask: '255.255.255.0' })
  router.config.telephony = {
    sourceIp: '192.168.20.1', port: 2000, maxEphones: 2, maxDn: 2,
    directoryNumbers: [{ id: 1, number: '101' }, { id: 2, number: '102' }],
    ephones: [
      { id: 1, macAddress: '0011.2233.4401', buttons: [{ line: 1, dn: 1 }] },
      { id: 2, macAddress: '0011.2233.4402', buttons: [{ line: 1, dn: 2 }] },
    ],
  }
  router.config.dhcpPools = [{ name: 'VOICE', network: '192.168.20.0', mask: '255.255.255.0', defaultRouter: '192.168.20.1', tftpServer: '192.168.20.1' }]
  router.config.excludedDhcpIps = ['192.168.20.1 192.168.20.10']
  const sw = createDevice('switch', 150, 0)
  sw.id = 'switch'
  sw.power = true
  sw.ports = [1, 2, 3].map(n => createPort(`FastEthernet0/${n}`, `Fa0/${n}`, 'fastethernet', 'up'))
  sw.ports.forEach(port => Object.assign(port, { adminStatus: 'up', vlan: 10, voiceVlan: 20, portMode: 'access' }))
  Object.assign(sw.ports[2], { portMode: 'trunk', allowedVlans: [10, 20] })
  const phones = [1, 2].map(n => {
    const phone = createDevice('phone', 0, n * 100)
    phone.id = `phone${n}`
    phone.macAddress = `00:11:22:33:44:0${n}`
    phone.power = true
    phone.ports = [createPort('Switch', 'Switch', 'fastethernet', 'up'), createPort('PC', 'PC', 'fastethernet', 'down')]
    Object.assign(phone.ports[0], { adminStatus: 'up', macAddress: `aa:bb:cc:dd:ee:0${n}` })
    return phone
  })
  const links: NetworkLink[] = []
  function connect(a: NetworkDevice, aPort: NetworkPort, b: NetworkDevice, bPort: NetworkPort) {
    const link: NetworkLink = { id: `link${links.length}`, type: 'straight', fromDeviceId: a.id, fromPortId: aPort.id, toDeviceId: b.id, toPortId: bPort.id, status: 'up' }
    Object.assign(aPort, { connectedDeviceId: b.id, connectedPortId: bPort.id, connectedLinkId: link.id, status: 'up' })
    Object.assign(bPort, { connectedDeviceId: a.id, connectedPortId: aPort.id, connectedLinkId: link.id, status: 'up' })
    links.push(link)
  }
  phones.forEach((phone, index) => connect(phone, phone.ports[0], sw, sw.ports[index]))
  connect(sw, sw.ports[2], router, router.ports[0])
  return { router, sw, phones, devices: [router, sw, ...phones], links }
}

function loadFixture() {
  const lab = fixture()
  useVoiceStore.getState().reset()
  useNetworkStore.setState({ devices: lab.devices, links: lab.links, inFlightPackets: [], pingResults: [] })
  return lab
}

test('voice config parser retains DHCP option 150, excluded ranges, source address and explicit line assignments', () => {
  const config = parseVoiceConfiguration([
    'ip dhcp excluded-address 192.168.20.1 192.168.20.10',
    'ip dhcp pool VOICE', ' network 192.168.20.0 255.255.255.0',
    ' default-router 192.168.20.1', ' option 150 ip 192.168.20.1', ' lease 0 1 0', '!',
    'ip dhcp pool RESERVED-PHONE', ' host 192.168.20.40 255.255.255.0', ' client-identifier 0100.1122.3344.01', '!',
    'telephony-service', ' max-ephones 2', ' max-dn 2', ' ip source-address 192.168.20.1 port 2000', '!',
    'ephone-dn 1', ' number 101', '!', 'ephone-dn 2', ' number 102', '!',
    'ephone 1', ' mac-address 0011.2233.4401', ' button 1:1', '!',
    'ephone 2', ' mac-address 0011.2233.4402', ' button 1:2',
  ])
  assert.equal(config.telephony?.sourceIp, '192.168.20.1')
  assert.equal(config.telephony?.port, 2000)
  assert.deepEqual(config.telephony?.directoryNumbers, [{ id: 1, number: '101' }, { id: 2, number: '102' }])
  assert.deepEqual(config.telephony?.ephones[1].buttons, [{ line: 1, dn: 2 }])
  assert.equal(config.dhcpPools?.[0].tftpServer, '192.168.20.1')
  assert.equal(config.dhcpPools?.[0].leaseDurationSeconds, 3600)
  assert.deepEqual(config.dhcpPools?.[1], {
    name: 'RESERVED-PHONE', network: '192.168.20.0', mask: '255.255.255.0',
    hostIp: '192.168.20.40', hostMask: '255.255.255.0', clientIdentifier: '01001122334401',
  })
  assert.ok(config.excludedDhcpIps?.length)
})

test('phones register using their device MAC, voice VLAN and distinct DHCP leases outside excluded addresses', () => {
  const lab = fixture()
  const registered = getPhoneRegistrations(lab.devices, lab.links)
  assert.equal(registered.length, 2)
  assert.deepEqual(registered.map(phone => phone.extension).sort(), ['101', '102'])
  assert.ok(registered.every(phone => phone.registered && phone.routerId === lab.router.id && phone.vlan === 20))
  const addresses = registered.map(phone => phone.ipAddress)
  assert.equal(new Set(addresses).size, 2)
  for (const address of addresses) {
    assert.match(address ?? '', /^192\.168\.20\./)
    assert.ok(Number(address!.split('.')[3]) > 10)
  }
})

const failures: Array<[string, (lab: ReturnType<typeof fixture>) => void]> = [
  ['phone power is off', lab => { lab.phones[0].power = false }],
  ['router power is off', lab => { lab.router.power = false }],
  ['phone cable is removed', lab => { lab.links.shift() }],
  ['switch access port is shut down', lab => { lab.sw.ports[0].adminStatus = 'down' }],
  ['voice VLAN is excluded on the uplink trunk', lab => { lab.sw.ports[2].allowedVlans = [10] }],
  ['uplink trunk allows no VLANs', lab => { lab.sw.ports[2].allowedVlans = [] }],
  ['CME source address is not owned by the router', lab => { lab.router.config.telephony!.sourceIp = '192.168.99.1' }],
  ['DHCP option 150 points at another server', lab => { lab.router.config.dhcpPools![0].tftpServer = '192.168.20.250' }],
]

for (const [name, mutate] of failures) {
  test(`registration fails when ${name}`, () => {
    const lab = fixture()
    mutate(lab)
    const phone = getPhoneRegistrations(lab.devices, lab.links).find(item => item.deviceId === lab.phones[0].id)
    assert.ok(phone)
    assert.equal(phone.registered, false)
    assert.ok(phone.reason)
  })
}

test('duplicate directory numbers do not create two registered phones with the same extension', () => {
  const lab = fixture()
  lab.router.config.telephony!.directoryNumbers[1].number = '101'
  const registrations = getPhoneRegistrations(lab.devices, lab.links)
  assert.ok(registrations.some(phone => !phone.registered))
  const assigned = registrations.filter(phone => phone.registered).map(phone => phone.extension)
  assert.equal(new Set(assigned).size, assigned.length)
})

test('router-on-a-stick voice subinterface registers phones over its physical uplink', () => {
  const lab = fixture()
  const physical = lab.router.ports[0]
  delete physical.ipAddress
  delete physical.subnetMask
  delete physical.vlan
  const voice = createPort('FastEthernet0/0.20', 'Fa0/0.20', 'fastethernet', 'up')
  Object.assign(voice, { adminStatus: 'up', status: 'up', parentPortId: physical.id, dot1qVlan: 20, vlan: 20, ipAddress: '192.168.20.1', subnetMask: '255.255.255.0' })
  lab.router.ports.push(voice)
  assert.ok(getPhoneRegistrations(lab.devices, lab.links).every(phone => phone.registered))
})

test('auto assignment allocates different available directory numbers in its configured range', () => {
  const lab = fixture()
  lab.router.config.telephony!.ephones = []
  lab.router.config.telephony!.autoAssign = { start: 1, end: 2 }
  const registrations = getPhoneRegistrations(lab.devices, lab.links)
  assert.ok(registrations.every(phone => phone.registered))
  assert.deepEqual(registrations.map(phone => phone.extension).sort(), ['101', '102'])
})

test('a phone without an ephone MAC binding cannot borrow another phone line', () => {
  const lab = fixture()
  lab.phones[0].macAddress = '00:11:22:33:44:ff'
  assert.equal(getPhoneRegistrations(lab.devices, lab.links).find(phone => phone.deviceId === lab.phones[0].id)?.registered, false)
})

test('dialling a registered extension rings the destination and answer connects both ends', () => {
  const { phones } = loadFixture()
  const callId = useVoiceStore.getState().dial(phones[0].id, '102')
  assert.ok(callId)
  const ringing = useVoiceStore.getState().calls.find(call => call.id === callId)
  assert.equal(ringing?.fromDeviceId, phones[0].id)
  assert.equal(ringing?.toDeviceId, phones[1].id)
  assert.equal(ringing?.status, 'ringing')
  useVoiceStore.getState().answer(phones[1].id)
  assert.equal(useVoiceStore.getState().calls.find(call => call.id === callId)?.status, 'connected')
  useVoiceStore.getState().hangUp(phones[1].id)
  assert.equal(useVoiceStore.getState().calls.find(call => call.id === callId)?.status, 'ended')
})

test('a connected call can be held and resumed without creating another call', () => {
  const { phones } = loadFixture()
  const callId = useVoiceStore.getState().dial(phones[0].id, '102')
  useVoiceStore.getState().answer(phones[1].id)
  useVoiceStore.getState().hold(phones[0].id)
  assert.equal(useVoiceStore.getState().calls.find(call => call.id === callId)?.status, 'held')
  useVoiceStore.getState().resume(phones[0].id)
  assert.equal(useVoiceStore.getState().calls.find(call => call.id === callId)?.status, 'connected')
  assert.equal(useVoiceStore.getState().calls.length, 1)
})

test('unknown extension, self calling and a busy phone are rejected', () => {
  const { phones } = loadFixture()
  assert.equal(useVoiceStore.getState().dial(phones[0].id, '999'), null)
  assert.equal(useVoiceStore.getState().dial(phones[0].id, '101'), null)
  assert.ok(useVoiceStore.getState().dial(phones[0].id, '102'))
  assert.equal(useVoiceStore.getState().dial(phones[0].id, '102'), null)
  assert.equal(useVoiceStore.getState().dial(phones[1].id, '101'), null)
  assert.equal(useVoiceStore.getState().calls.filter(call => call.status !== 'ended').length, 1)
})

test('disconnecting a registered phone ends its active call', () => {
  const { phones } = loadFixture()
  const callId = useVoiceStore.getState().dial(phones[0].id, '102')
  useVoiceStore.getState().answer(phones[1].id)
  useNetworkStore.getState().toggleDevicePower(phones[1].id)
  useVoiceStore.getState().reconcile()
  assert.equal(useVoiceStore.getState().calls.find(call => call.id === callId)?.status, 'ended')
})
