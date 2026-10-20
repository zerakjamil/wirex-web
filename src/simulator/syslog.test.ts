import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from './deviceFactory'
import { createSyslogPackets, stepSimulationTick } from './engine'
import { parseIosCommand } from './ios/ciscoParser'
import type { DeviceType, InFlightPacket, NetworkDevice, NetworkLink } from '../types/network'
import { useNetworkStore } from '../store/networkStore'

function device(type: DeviceType, id: string, ip: string): NetworkDevice {
  const result = createDevice(type, 0, 0)
  result.id = id
  result.name = id
  result.ports.forEach((port, index) => {
    port.macAddress = `02:00:00:00:${id.charCodeAt(0).toString(16)}:${index.toString(16).padStart(2, '0')}`
    port.adminStatus = 'up'
    port.status = 'up'
  })
  result.ports[0].ipAddress = ip
  result.ports[0].subnetMask = '255.255.255.0'
  return result
}

function connect(a: NetworkDevice, aIndex: number, b: NetworkDevice, bIndex: number): NetworkLink {
  const aPort = a.ports[aIndex]
  const bPort = b.ports[bIndex]
  const link: NetworkLink = { id: `${a.id}-${b.id}`, type: 'straight', fromDeviceId: a.id, fromPortId: aPort.id, toDeviceId: b.id, toPortId: bPort.id, status: 'up' }
  Object.assign(aPort, { connectedDeviceId: b.id, connectedPortId: bPort.id, connectedLinkId: link.id })
  Object.assign(bPort, { connectedDeviceId: a.id, connectedPortId: aPort.id, connectedLinkId: link.id })
  return link
}

function topology() {
  const router = device('router', 'router', '192.168.2.1')
  router.config.loggingHost = '192.168.2.10'
  router.routingTable.push({ network: '192.168.2.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: router.ports[0].name, metric: 0, type: 'C' })
  const server = device('server', 'server', '192.168.2.10')
  server.config.syslogServiceEnabled = true
  const pc = device('pc', 'pc', '192.168.3.10')
  pc.config.defaultGateway = '192.168.3.1'
  router.ports[1].ipAddress = '192.168.3.1'
  router.ports[1].subnetMask = '255.255.255.0'
  router.routingTable.push({ network: '192.168.3.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: router.ports[1].name, metric: 0, type: 'C' })
  const links = [connect(router, 0, server, 0), connect(router, 1, pc, 0)]
  return { router, server, pc, devices: [router, server, pc], links }
}

function execute(devices: NetworkDevice[], links: NetworkLink[], packets: InFlightPacket[]) {
  const results: ReturnType<typeof stepSimulationTick>['syslogResults'] = []
  const trace: string[] = []
  for (let i = 0; i < 400 && packets.length; i++) {
    trace.push(...packets.map(packet => packet.pdu.summary))
    const step = stepSimulationTick(devices, links, packets)
    devices = step.updatedDevices
    packets = step.newInFlightPackets
    results.push(...step.syslogResults)
  }
  return { devices, packets, results, trace }
}

test('syslog packets carry UDP/514 payloads to an enabled server', () => {
  const { router, devices, links } = topology()
  const packets = createSyslogPackets(router, devices, links, '192.168.2.10', '%LINK-3-UPDOWN: Interface GigabitEthernet0/0, changed state to down', 3)
  assert.equal(packets.length, 1)
  const pdu = packets[0].pdu.pendingPacket ?? packets[0].pdu
  assert.equal(pdu.protocol, 'UDP')
  assert.equal(pdu.payload.udpService, 'syslog')
  assert.equal(pdu.payload.udpSourcePort, 514)
  assert.equal(pdu.payload.udpDestinationPort, 514)
  assert.equal(pdu.payload.syslogSeverity, 3)
  assert.equal(pdu.payload.syslogSourceName, router.config.hostname || router.name)

  const result = execute(devices, links, packets)
  assert.equal(result.packets.length, 0)
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].serverDeviceId, 'server')
  assert.equal(result.results[0].sourceIp, '192.168.2.1')
  assert.equal(result.results[0].sourceName, router.config.hostname || router.name)
  assert.equal(result.results[0].severity, 3)
  assert.match(result.results[0].message, /%LINK-3-UPDOWN/)
})

test('a disabled syslog service drops the message without a delivery result', () => {
  const { router, server, devices, links } = topology()
  server.config.syslogServiceEnabled = false
  const result = execute(devices, links, createSyslogPackets(router, devices, links, '192.168.2.10', 'test message', 5))
  assert.equal(result.results.length, 0)
  assert.equal(result.packets.length, 0)
})

test('an outbound UDP 514 ACL blocks the syslog packet before it is queued', () => {
  const { router, devices, links } = topology()
  router.ports[0].outboundAcl = 'deny-syslog'
  router.config.accessLists = [{ id: 'deny-syslog', type: 'extended', rules: [{ type: 'extended', action: 'deny', protocol: 'udp', sourceIp: 'any', destIp: 'any', destPort: 514 }] }]
  assert.deepEqual(createSyslogPackets(router, devices, links, '192.168.2.10', 'test message', 5), [])
})

test('IOS logging commands configure the host and severity threshold', () => {
  const { router } = topology()
  const configured = parseIosCommand({ ...router, currentCliMode: 'config' }, 'logging 192.168.2.10')
  assert.equal(configured.newDeviceConfig?.loggingHost, '192.168.2.10')
  assert.equal(parseIosCommand({ ...router, currentCliMode: 'config' }, 'logging trap 3').newDeviceConfig?.loggingTrap, 3)
  assert.equal(parseIosCommand({ ...router, currentCliMode: 'config' }, 'logging trap 9').output, '% Use logging trap <0-7>.')
  assert.equal(parseIosCommand({ ...router, currentCliMode: 'config' }, 'logging not-an-ip').output, '% Use logging <IPv4-address> or logging trap <0-7>.')
})

test('interface state changes send a syslog message through the store', () => {
  const { router, server, devices, links } = topology()
  useNetworkStore.getState().loadLab(devices, links)
  useNetworkStore.getState().updatePortConfig(router.id, router.ports[1].id, { adminStatus: 'down' })
  for (let i = 0; i < 400 && useNetworkStore.getState().inFlightPackets.length; i++) useNetworkStore.getState().tickSimulation()
  const updatedServer = useNetworkStore.getState().devices.find(device => device.id === server.id)!
  const messages = updatedServer.config.syslogMessages ?? []
  assert.equal(messages.length, 1)
  assert.match(messages[0].message, /%LINK-3-UPDOWN: Interface GigabitEthernet0\/1, changed state to down/)
  assert.equal(messages[0].sourceIp, '192.168.2.1')
  assert.equal(messages[0].severity, 3)
})

test('logging trap filters messages that are less severe than the threshold', () => {
  const { router, devices, links } = topology()
  router.config.loggingTrap = 2
  useNetworkStore.getState().loadLab(devices, links)
  assert.equal(useNetworkStore.getState().sendSyslog(router.id, '%LINK-3-UPDOWN: Interface FastEthernet1/0, changed state to down', 3), null)
  assert.equal(useNetworkStore.getState().inFlightPackets.length, 0)
})
