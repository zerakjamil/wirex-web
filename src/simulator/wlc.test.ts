import assert from 'node:assert/strict'
import test from 'node:test'
import { createPingPackets, stepSimulationTick } from './engine'
import { createDevice } from './deviceFactory'
import { deviceCatalog } from './deviceCatalog'
import { apAdvertisedWlans, apRuntimeOf, apWirelessSettings, isWifiRadioPort, wirelessKeyAccepted, wlcRegisteredAps, wlcWlans } from './capwap'
import { getWlcLab } from './starterLabs'
import { synchronizeLinkState } from './linkState'
import { useNetworkStore } from '../store/networkStore'
import type { InFlightPacket, NetworkDevice, NetworkLink, NetworkPort } from '../types/network'

function connect(a: NetworkDevice, aPortIndex: number, b: NetworkDevice, bPortIndex: number): NetworkLink {
  const aPort = a.ports[aPortIndex]
  const bPort = b.ports[bPortIndex]
  const link: NetworkLink = { id: `${a.id}-${aPort.id}-${b.id}-${bPort.id}`, type: 'straight', fromDeviceId: a.id, fromPortId: aPort.id, toDeviceId: b.id, toPortId: bPort.id, status: 'up' }
  Object.assign(aPort, { connectedLinkId: link.id, connectedDeviceId: b.id, connectedPortId: bPort.id })
  Object.assign(bPort, { connectedLinkId: link.id, connectedDeviceId: a.id, connectedPortId: aPort.id })
  return link
}

function wirelessLink(a: NetworkDevice, aPortIndex: number, b: NetworkDevice, bPortIndex: number): NetworkLink {
  const aPort = a.ports[aPortIndex]
  const bPort = b.ports[bPortIndex]
  const link: NetworkLink = { id: `wlink-${a.id}-${b.id}`, type: 'wireless', fromDeviceId: a.id, fromPortId: aPort.id, toDeviceId: b.id, toPortId: bPort.id, status: 'up' }
  Object.assign(aPort, { connectedLinkId: link.id, connectedDeviceId: b.id, connectedPortId: bPort.id })
  Object.assign(bPort, { connectedLinkId: link.id, connectedDeviceId: a.id, connectedPortId: aPort.id })
  return link
}

function addressPort(device: NetworkDevice, item: NetworkPort, ipAddress: string, subnetMask = '255.255.255.0') {
  Object.assign(item, { ipAddress, subnetMask, adminStatus: 'up' as const, status: 'up' as const })
  device.routingTable = device.routingTable.filter(route => !(route.type === 'C' && route.interfaceName === item.name))
  device.routingTable.push({ network: ipAddress.replace(/\.\d+$/, '.0'), netmask: subnetMask, nextHop: 'connected', interfaceName: item.name, metric: 0, type: 'C' })
  return item
}

function wlcLab() {
  const wlc = createDevice('wlc', 0, 0, 'WLC-PT')
  const sw = createDevice('switch', 0, 0, '2960-24TT')
  const lap = createDevice('wireless', 0, 0, 'LAP-PT')
  const phone = createDevice('smartphone', 0, 0, 'Smartphone-PT')
  const router = createDevice('router', 0, 0, '2811')
  const pc = createDevice('pc', 0, 0, 'PC-PT')
  wlc.name = 'WL-Controller'; sw.name = 'SW-WLC'; lap.name = 'LAP-1'
  phone.name = 'Smartphone-1'; router.name = 'Router-1'; pc.name = 'PC-1'
  sw.ports.forEach(port => { port.portfast = true })
  addressPort(wlc, wlc.ports[0], '192.168.1.254')
  wlc.config.wlans = [{ id: 1, name: 'CORP', ssid: 'CORP-NET', enabled: true, vlan: 0, security: 'wpa2-psk', passphrase: 'wireXwifi1' }]
  addressPort(router, router.ports[0], '192.168.1.1')
  addressPort(pc, pc.ports[0], '192.168.1.10')
  pc.config.defaultGateway = '192.168.1.1'
  addressPort(phone, phone.ports[0], '192.168.1.20')
  phone.config.defaultGateway = '192.168.1.1'
  const links = [
    connect(wlc, 0, sw, 0),
    connect(lap, 0, sw, 1),
    connect(router, 0, sw, 2),
    connect(pc, 0, sw, 3),
    wirelessLink(lap, 1, phone, 0),
  ]
  return { wlc, sw, lap, phone, router, pc, links, devices: [wlc, sw, lap, phone, router, pc] }
}

interface RunResult { devices: NetworkDevice[]; packets: InFlightPacket[]; trace: string[]; discarded: number }

function runTicks(ticks: number, packets: InFlightPacket[] = [], startTick = 1): RunResult {
  const store = useNetworkStore.getState()
  const sync = synchronizeLinkState(store.devices, store.links, store.simulationTick)
  let devices = sync.devices
  const links = sync.links
  useNetworkStore.setState({ devices, links })
  let current = packets
  let discarded = 0
  const trace: string[] = []
  for (let i = 0; i < ticks; i++) {
    const step = stepSimulationTick(devices, links, current, [], [], startTick + i)
    for (const delivery of step.packetDeliveries) trace.push(delivery.reason ?? delivery.status)
    devices = step.updatedDevices
    current = step.newInFlightPackets
    discarded += step.discardedPackets
  }
  useNetworkStore.setState({ devices })
  return { devices, packets: current, trace, discarded }
}

interface PingRun { replySeen: boolean; trace: string[]; remaining: number }

function runPing(sourceId: string, targetIp: string, ticks: number, startTick: number): PingRun {
  const store = useNetworkStore.getState()
  const devices = store.devices
  const links = store.links
  const source = devices.find(device => device.id === sourceId)!
  let current = createPingPackets(source, devices, links, targetIp)
  let replySeen = false
  let running = devices
  const trace: string[] = []
  for (let i = 0; i < ticks; i++) {
    const echoReplies = new Set(current.filter(packet => packet.pdu.payload.icmpType === 'echo-reply' && packet.toDeviceId === source.id).map(packet => packet.id))
    const step = stepSimulationTick(running, links, current, [], [], startTick + i)
    for (const delivery of step.packetDeliveries) trace.push(delivery.reason ?? delivery.status)
    replySeen ||= step.packetDeliveries.some(delivery => delivery.status === 'delivered' && delivery.receiverDeviceId === source.id && echoReplies.has(delivery.packetId))
    running = step.updatedDevices
    current = step.newInFlightPackets
  }
  useNetworkStore.setState({ devices: running })
  return { replySeen, trace, remaining: current.length }
}

test('WLC and lightweight AP factory defaults and catalog entries', () => {
  const wlc = createDevice('wlc', 0, 0, 'WLC-PT')
  assert.equal(wlc.type, 'wlc')
  assert.equal(wlc.model, 'WLC-PT')
  assert.equal(wlc.ports.length, 2)
  assert.ok(wlc.ports.every(port => port.type === 'gigabitethernet'))
  const lap = createDevice('wireless', 0, 0, 'LAP-PT')
  assert.equal(lap.config.apMode, 'lightweight')
  const autonomous = createDevice('wireless', 0, 0, 'AccessPoint-PT')
  assert.equal(autonomous.config.apMode, undefined)
  const wirelessModels = deviceCatalog.wireless?.flatMap(entry => entry.models) ?? []
  assert.ok(wirelessModels.includes('LAP-PT'))
  assert.ok(wirelessModels.includes('AccessPoint-PT'))
  assert.ok((deviceCatalog.wireless ?? []).some(entry => entry.type === 'wlc' && entry.models.includes('WLC-PT')))
})

test('a cell tower does not advertise a Wi-Fi network', () => {
  const tower = createDevice('wireless', 0, 0, 'Cell-Tower')
  assert.equal(tower.config.wirelessSsid, undefined)
  assert.deepEqual(apAdvertisedWlans(tower), [])
})

test('powering on a wireless client only auto-joins an open access point', () => {
  const ap = createDevice('wireless', 0, 0, 'AccessPoint-PT')
  const laptop = createDevice('laptop', 0, 0, 'Laptop-PT')
  useNetworkStore.getState().loadLab([ap, laptop], [])

  useNetworkStore.getState().toggleDevicePower(laptop.id)
  assert.equal(useNetworkStore.getState().removeDeviceModule(laptop.id, 0).success, true)
  assert.equal(useNetworkStore.getState().installDeviceModule(laptop.id, 0, 'WPC300N').success, true)
  useNetworkStore.getState().toggleDevicePower(laptop.id)

  const openLinks = useNetworkStore.getState().links.filter(link => link.type === 'wireless')
  assert.equal(openLinks.length, 1)

  useNetworkStore.getState().deleteLink(openLinks[0].id)
  useNetworkStore.getState().updateDeviceConfig(ap.id, { wirelessAuthentication: 'wpa2-psk', wirelessPassphrase: 'wireXwifi1' })
  useNetworkStore.getState().toggleDevicePower(laptop.id)
  useNetworkStore.getState().toggleDevicePower(laptop.id)

  assert.equal(useNetworkStore.getState().links.filter(link => link.type === 'wireless').length, 0)
})

test('powering on a smartphone does not auto-associate its cellular modem', () => {
  const ap = createDevice('wireless', 0, 0, 'AccessPoint-PT')
  const phone = createDevice('smartphone', 0, 0)
  const apWlan = ap.ports.find(port => port.type === 'wireless')!
  const phoneWlan = phone.ports.find(port => port.name === 'Wireless0')!
  const link: NetworkLink = {
    id: 'phone-ap', type: 'wireless', status: 'up',
    fromDeviceId: ap.id, fromPortId: apWlan.id, toDeviceId: phone.id, toPortId: phoneWlan.id,
  }
  Object.assign(apWlan, { connectedLinkId: link.id, connectedDeviceId: phone.id, connectedPortId: phoneWlan.id })
  Object.assign(phoneWlan, { connectedLinkId: link.id, connectedDeviceId: ap.id, connectedPortId: apWlan.id })
  useNetworkStore.getState().loadLab([ap, phone], [link])
  useNetworkStore.getState().toggleDevicePower(phone.id)
  useNetworkStore.getState().toggleDevicePower(phone.id)

  const phoneLinks = useNetworkStore.getState().links.filter(item =>
    item.type === 'wireless' && (item.fromDeviceId === phone.id || item.toDeviceId === phone.id))
  assert.equal(phoneLinks.length, 1)
  const cellular = useNetworkStore.getState().devices.find(device => device.id === phone.id)!
    .ports.find(port => port.name === 'Cellular0')!
  assert.equal(cellular.connectedLinkId, undefined)
})

test('autonomous access points advertise their configured SSID, channel and security', () => {
  const ap = createDevice('wireless', 0, 0, 'AccessPoint-PT')
  assert.equal(ap.config.wirelessSsid, 'Default')
  assert.equal(ap.config.wirelessChannel, 6)
  assert.equal(apAdvertisedWlans(ap)[0].security, 'none')

  ap.config.wirelessSsid = 'CORP-AP'
  ap.config.wirelessChannel = 11
  ap.config.wirelessAuthentication = 'wpa2-psk'
  ap.config.wirelessPassphrase = 'wireXwifi1'
  const advertised = apAdvertisedWlans(ap)[0]
  assert.equal(advertised.ssid, 'CORP-AP')
  assert.equal(advertised.security, 'wpa2-psk')
  assert.equal(advertised.passphrase, 'wireXwifi1')
  assert.equal(apWirelessSettings(ap).channel, 11)
  assert.equal(wirelessKeyAccepted(advertised, 'wireXwifi1'), true)
  assert.equal(wirelessKeyAccepted(advertised, 'wrongpass'), false)
  assert.equal(wirelessKeyAccepted({ ...advertised, security: 'none' }, ''), true)
})

test('WEP access points require the configured 10-digit hexadecimal key', () => {
  const ap = createDevice('wireless', 0, 0, 'AccessPoint-PT')
  ap.config.wirelessAuthentication = 'wep'
  ap.config.wirelessWepKey = '0011223344'
  const advertised = apAdvertisedWlans(ap)[0]
  assert.equal(advertised.security, 'wep')
  assert.equal(advertised.wepKey, '0011223344')
  assert.equal(wirelessKeyAccepted(advertised, '0011223344'), true)
  assert.equal(wirelessKeyAccepted(advertised, '0011'), false)
  assert.equal(wirelessKeyAccepted(advertised, '00112233445'), false)
})

test('wireless defaults follow the device family and reject out-of-range channels', () => {
  const homeRouter = createDevice('wireless', 0, 0, 'Linksys-WRT300N')
  assert.equal(homeRouter.config.wirelessSsid, 'linksys')
  homeRouter.config.wirelessChannel = 99
  assert.equal(apWirelessSettings(homeRouter).channel, 6)
})

test('lightweight AP discovers the controller, joins, and receives its WLAN configuration', async () => {
  const lab = wlcLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  const result = runTicks(60)
  const lap = result.devices.find(device => device.id === lab.lap.id)!
  const wlc = result.devices.find(device => device.id === lab.wlc.id)!
  const runtime = apRuntimeOf(lap)
  assert.equal(runtime.state, 'run', `AP runtime state: ${runtime.state}`)
  assert.equal(runtime.wlcMac, wlc.ports[0].macAddress)
  assert.equal(runtime.selectedWlcId, wlc.id)
  assert.deepEqual(apAdvertisedWlans(lap).map(wlan => wlan.ssid), ['CORP-NET'])
  const registered = wlcRegisteredAps(wlc)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].apId, lap.id)
  assert.ok(result.trace.some(line => line.toLowerCase().includes('discovery')), result.trace.join('\n'))
  assert.ok(result.trace.some(line => line.includes('Join Request')), result.trace.join('\n'))
  assert.ok(result.trace.some(line => line.includes('wireless LAN configuration')), result.trace.join('\n'))
})

test('WLAN changes reach the access point through a CAPWAP configuration update', async () => {
  const lab = wlcLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  await runTicks(60)
  const store = useNetworkStore.getState()
  const output = store.executeIosCommand(lab.wlc.id, 'config wlan create 2 GUEST GUEST-WIFI')
  assert.match(output, /Created wireless LAN 2/)
  const disable = useNetworkStore.getState().executeIosCommand(lab.wlc.id, 'config wlan disable 1')
  assert.match(disable, /now disabled/)
  const result = runTicks(40, [], 61)
  assert.ok(result.trace.some(line => line.includes('wireless LAN configuration sequence')), result.trace.join('\n'))
  const lap = result.devices.find(device => device.id === lab.lap.id)!
  assert.deepEqual(apAdvertisedWlans(lap).map(wlan => wlan.ssid), ['GUEST-WIFI'])
  const runtime = apRuntimeOf(lap)
  assert.equal(runtime.wlans?.length, 2)
})

test('wireless client traffic is centrally switched through the controller', async () => {
  const lab = wlcLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  await runTicks(60)
  const phone = useNetworkStore.getState().devices.find(device => device.id === lab.phone.id)!
  const ping = runPing(phone.id, '192.168.1.10', 90, 61)
  const wlc = useNetworkStore.getState().devices.find(device => device.id === lab.wlc.id)!
  const phonePort = phone.ports.find(port => port.type === 'wireless')!
  assert.equal(ping.remaining, 0, ping.trace.join('\n'))
  assert.ok(ping.trace.some(line => line.includes('encapsulated')), ping.trace.join('\n'))
  assert.ok(ping.trace.some(line => line.includes('CAPWAP tunnel')), ping.trace.join('\n'))
  assert.ok(ping.replySeen, ping.trace.join('\n'))
  assert.ok(!ping.trace.some(line => line.includes('CAPWAP Run state') || line.includes('no operational CAPWAP path')), ping.trace.join('\n'))
  const tunnels = wlc.wlcRuntime?.clientTunnels ?? []
  assert.ok(tunnels.some(tunnel => tunnel.macAddress.toLowerCase() === phonePort.macAddress.toLowerCase()), JSON.stringify(tunnels))
})

test('a lightweight AP without an operational controller drops client traffic and recovers', async () => {
  const lab = wlcLab()
  lab.wlc.ports[0].adminStatus = 'down'
  lab.wlc.ports[0].status = 'down'
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  const syncInit = synchronizeLinkState(useNetworkStore.getState().devices, useNetworkStore.getState().links, 0)
  useNetworkStore.setState({ devices: syncInit.devices, links: syncInit.links })
  const devices = useNetworkStore.getState().devices
  const phone = devices.find(device => device.id === lab.phone.id)!
  const packets = createPingPackets(phone, devices, syncInit.links, '192.168.1.10')
  const first = runTicks(50, packets)
  const lap = first.devices.find(device => device.id === lab.lap.id)!
  assert.notEqual(apRuntimeOf(lap).state, 'run')
  assert.ok(first.trace.some(line => line.includes('CAPWAP Run state') || line.includes('no operational CAPWAP path')), first.trace.join('\n'))
  assert.ok(!first.trace.some(line => line.includes('processed ICMP')), first.trace.join('\n'))
  assert.equal(first.packets.length, 0, 'ping attempts should be resolved or dropped')
  useNetworkStore.getState().updatePortConfig(lab.wlc.id, lab.wlc.ports[0].id, { adminStatus: 'up', status: 'up' })
  const second = runTicks(60, [], 51)
  const lap2 = second.devices.find(device => device.id === lab.lap.id)!
  assert.equal(apRuntimeOf(lap2).state, 'run')
  assert.ok(second.trace.some(line => line.includes('CAPWAP')), second.trace.join('\n'))
})

test('autonomous access point still bridges wireless clients locally without a controller', () => {
  const ap = createDevice('wireless', 0, 0, 'AccessPoint-PT')
  const sw = createDevice('switch', 0, 0, '2960-24TT')
  const phone = createDevice('smartphone', 0, 0, 'Smartphone-PT')
  const pc = createDevice('pc', 0, 0, 'PC-PT')
  ap.name = 'AP-Autonomous'; sw.name = 'SW-A'; phone.name = 'Smartphone-A'; pc.name = 'PC-A'
  sw.ports.forEach(port => { port.portfast = true })
  addressPort(pc, pc.ports[0], '192.168.1.10')
  addressPort(phone, phone.ports[0], '192.168.1.20')
  const links = [connect(ap, 0, sw, 0), connect(pc, 0, sw, 1), wirelessLink(ap, 1, phone, 0)]
  useNetworkStore.getState().loadLab([ap, sw, phone, pc], links)
  const sync = synchronizeLinkState(useNetworkStore.getState().devices, links, 0)
  let devices = sync.devices
  useNetworkStore.setState({ devices, links: sync.links })
  let packets: InFlightPacket[] = []
  let delivered = false
  let discarded = 0
  const trace: string[] = []
  const source = devices.find(device => device.id === phone.id)!
  packets = createPingPackets(source, devices, sync.links, '192.168.1.10')
  for (let i = 0; i < 90; i++) {
    const step = stepSimulationTick(devices, sync.links, packets, [], [], 1 + i)
    for (const delivery of step.packetDeliveries) trace.push(delivery.reason ?? delivery.status)
    delivered ||= step.packetDeliveries.some(delivery => delivery.receiverDeviceId === phone.id && delivery.status === 'delivered')
    devices = step.updatedDevices
    packets = step.newInFlightPackets
    discarded += step.discardedPackets
  }
  useNetworkStore.setState({ devices })
  assert.equal(discarded, 0, trace.join('\n'))
  assert.ok(delivered, trace.join('\n'))
  assert.ok(!trace.some(line => line.includes('lightweight access point')), trace.join('\n'))
})

test('WLC console reports wireless LANs, access points, clients, and validates commands', async () => {
  const lab = wlcLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  await runTicks(60)
  const store = useNetworkStore.getState()
  const wlanSummary = store.executeIosCommand(lab.wlc.id, 'show wlan summary')
  assert.match(wlanSummary, /CORP/)
  assert.match(wlanSummary, /CORP-NET/)
  assert.match(wlanSummary, /WPA2-Personal/)
  assert.match(wlanSummary, /Enabled/)
  const apSummary = useNetworkStore.getState().executeIosCommand(lab.wlc.id, 'show ap summary')
  assert.match(apSummary, /LAP-1/)
  assert.match(apSummary, /Run/)
  const clientSummary = useNetworkStore.getState().executeIosCommand(lab.wlc.id, 'show client summary')
  assert.match(clientSummary, /Smartphone-1/)
  assert.match(clientSummary, /CORP-NET/)
  const ifSummary = useNetworkStore.getState().executeIosCommand(lab.wlc.id, 'show interface summary')
  assert.match(ifSummary, /192\.168\.1\.254/)
  const duplicate = useNetworkStore.getState().executeIosCommand(lab.wlc.id, 'config wlan create 1 SECOND CORP-NET')
  assert.match(duplicate, /already exists/)
  const weak = useNetworkStore.getState().executeIosCommand(lab.wlc.id, 'config wlan security wpa2 short 1')
  assert.match(weak, /between 8 and 63/)
  const created = useNetworkStore.getState().executeIosCommand(lab.wlc.id, 'config wlan create 3 IOT IOT-NET')
  assert.match(created, /Created wireless LAN 3/)
  assert.deepEqual(wlcWlans(useNetworkStore.getState().devices.find(device => device.id === lab.wlc.id)!).map(wlan => wlan.id), [1, 3])
  const badId = useNetworkStore.getState().executeIosCommand(lab.wlc.id, 'config wlan create 17 TOO-HIGH')
  assert.match(badId, /between 1 and 16/)
})

test('the starter lab brings both access points online and switches client traffic', async () => {
  const lab = getWlcLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links, lab.annotations)
  const result = runTicks(60)
  const wlc = result.devices.find(device => device.type === 'wlc')!
  const laps = result.devices.filter(device => device.model === 'LAP-PT')
  assert.equal(laps.length, 2)
  for (const ap of laps) assert.equal(apRuntimeOf(ap).state, 'run', `${ap.name}: ${apRuntimeOf(ap).state}`)
  assert.equal(wlcRegisteredAps(wlc).length, 2)
  assert.deepEqual(wlcWlans(wlc).map(wlan => wlan.ssid), ['CORP-NET', 'GUEST-WIFI'])
  const phone1 = result.devices.find(device => device.name === 'Smartphone1')!
  const toWired = runPing(phone1.id, '192.168.1.10', 90, 61)
  assert.ok(toWired.replySeen, toWired.trace.join('\n'))
  const toWireless = runPing(phone1.id, '192.168.1.102', 120, 151)
  assert.ok(toWireless.replySeen, toWireless.trace.join('\n'))
  assert.equal(toWireless.remaining, 0, toWireless.trace.join('\n'))
  assert.ok(toWireless.trace.some(line => line.includes('CAPWAP tunnel')), toWireless.trace.join('\n'))
})

test('Wi-Fi association ignores the smartphone cellular modem', () => {
  const phone = createDevice('smartphone', 10, 20)
  const wifi = phone.ports.find(port => port.name === 'Wireless0')!
  const cellular = phone.ports.find(port => port.name === 'Cellular0')!
  assert.equal(isWifiRadioPort(wifi), true)
  assert.equal(isWifiRadioPort(cellular), false)
})
