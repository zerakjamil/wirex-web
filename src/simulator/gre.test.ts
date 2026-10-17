import assert from 'node:assert/strict'
import test from 'node:test'
import { createPingPackets, stepSimulationTick } from './engine'
import { createDevice, createPort } from './deviceFactory'
import { generatePktXml } from './pktEncoder'
import { parsePktXml } from './packetImport'
import { parseWorkspace } from './workspaceSchema'
import { getNetworkAddress } from './protocols/ip'
import { useNetworkStore } from '../store/networkStore'
import type { InFlightPacket, NetworkDevice, NetworkLink } from '../types/network'

function connect(a: NetworkDevice, aPortIndex: number, b: NetworkDevice, bPortIndex: number): NetworkLink {
  const aPort = a.ports[aPortIndex]
  const bPort = b.ports[bPortIndex]
  const link: NetworkLink = { id: `${a.id}-${aPort.id}-${b.id}-${bPort.id}`, type: 'straight', fromDeviceId: a.id, fromPortId: aPort.id, toDeviceId: b.id, toPortId: bPort.id, status: 'up' }
  Object.assign(aPort, { connectedLinkId: link.id, connectedDeviceId: b.id, connectedPortId: bPort.id })
  Object.assign(bPort, { connectedLinkId: link.id, connectedDeviceId: a.id, connectedPortId: aPort.id })
  return link
}

function port(device: NetworkDevice, index: number, ipAddress: string) {
  const item = device.ports[index]
  Object.assign(item, { ipAddress, subnetMask: '255.255.255.0', adminStatus: 'up' as const, status: 'up' as const })
  device.routingTable.push({ network: ipAddress.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: item.name, metric: 0, type: 'C' })
  return item
}

function addressPort(device: NetworkDevice, item: NetworkDevice['ports'][number], ipAddress: string, subnetMask: string) {
  Object.assign(item, { ipAddress, subnetMask, adminStatus: 'up' as const, status: 'up' as const })
  device.routingTable = device.routingTable.filter(route => !(route.type === 'C' && route.interfaceName === item.name))
  device.routingTable.push({ network: getNetworkAddress(ipAddress, subnetMask), netmask: subnetMask, nextHop: 'connected', interfaceName: item.name, metric: 0, type: 'C' })
}

function greLab() {
  const pcA = createDevice('pc', 0, 0, 'PC-PT')
  const routerA = createDevice('router', 0, 0, '2811')
  const routerB = createDevice('router', 0, 0, '2811')
  const pcB = createDevice('pc', 0, 0, 'PC-PT')
  pcA.name = 'PC-A'; routerA.name = 'Router-A'; routerB.name = 'Router-B'; pcB.name = 'PC-B'
  const pcAPort = port(pcA, 0, '10.0.1.10')
  const aWan = port(routerA, 0, '198.51.100.1')
  const aLan = port(routerA, 1, '10.0.1.1')
  const bWan = port(routerB, 0, '198.51.100.2')
  const bLan = port(routerB, 1, '10.0.2.1')
  const pcBPort = port(pcB, 0, '10.0.2.10')
  pcA.config.defaultGateway = '10.0.1.1'
  pcB.config.defaultGateway = '10.0.2.1'
  const links = [connect(pcA, 0, routerA, 1), connect(routerA, 0, routerB, 0), connect(routerB, 1, pcB, 0)]
  pcA.arpTable = [{ ipAddress: '10.0.1.1', macAddress: aLan.macAddress, interfaceName: pcAPort.name, age: 0 }]
  pcB.arpTable = [{ ipAddress: '10.0.2.1', macAddress: bLan.macAddress, interfaceName: pcBPort.name, age: 0 }]
  routerA.arpTable = [
    { ipAddress: '198.51.100.2', macAddress: bWan.macAddress, interfaceName: aWan.name, age: 0 },
    { ipAddress: '10.0.1.10', macAddress: pcAPort.macAddress, interfaceName: aLan.name, age: 0 },
  ]
  routerB.arpTable = [
    { ipAddress: '198.51.100.1', macAddress: aWan.macAddress, interfaceName: bWan.name, age: 0 },
    { ipAddress: '10.0.2.10', macAddress: pcBPort.macAddress, interfaceName: bLan.name, age: 0 },
  ]
  return { pcA, routerA, routerB, pcB, devices: [pcA, routerA, routerB, pcB], links }
}

function configureGreLab(lab: ReturnType<typeof greLab>) {
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  const cli = (device: NetworkDevice, line: string) => useNetworkStore.getState().executeIosCommand(device.id, line)
  for (const router of [lab.routerA, lab.routerB]) {
    cli(router, 'enable')
    cli(router, 'configure terminal')
  }
  for (const [router, tunnelIp, remoteWanIp, remoteLan] of [
    [lab.routerA, '172.16.0.1', '198.51.100.2', '10.0.2.0'],
    [lab.routerB, '172.16.0.2', '198.51.100.1', '10.0.1.0'],
  ] as const) {
    assert.equal(cli(router, 'interface Tunnel0'), '')
    assert.equal(cli(router, `ip address ${tunnelIp} 255.255.255.252`), '')
    assert.equal(cli(router, 'tunnel source FastEthernet0/0'), '')
    assert.equal(cli(router, `tunnel destination ${remoteWanIp}`), '')
    assert.equal(cli(router, 'tunnel mode gre ip'), '')
    assert.equal(cli(router, 'no shutdown').includes('administratively down'), false)
    assert.equal(cli(router, 'exit'), '')
    assert.equal(cli(router, `ip route ${remoteLan} 255.255.255.0 Tunnel0`), '')
  }
  return cli
}

test('GRE tunnels carry a routed ping across the underlay and return the echo reply', () => {
  const lab = greLab()
  const cli = configureGreLab(lab)
  cli(lab.routerA, 'interface Tunnel0')
  assert.match(cli(lab.routerA, 'tunnel mode gre ipv6'), /Supported mode/)
  cli(lab.routerA, 'exit')
  assert.match(cli(lab.routerA, 'ip route 10.9.0.0 255.255.255.0 Tunnel9'), /does not exist/)
  assert.match(cli(lab.routerA, 'do show ip route'), /S\s+10\.0\.2\.0\/255\.255\.255\.0 \[1\/0\] via Tunnel0/)
  assert.match(cli(lab.routerA, 'do show ip interface brief'), /Tu0\s+172\.16\.0\.1.*up\s+up/)
  assert.equal(cli(lab.routerA, 'no ip route 10.0.2.0 255.255.255.0 Tunnel0'), '')
  assert.equal(useNetworkStore.getState().devices.find(device => device.id === lab.routerA.id)?.routingTable.some(route => route.network === '10.0.2.0' && route.interfaceName === 'Tunnel0'), false)
  assert.equal(cli(lab.routerA, 'ip route 10.0.2.0 255.255.255.0 Tunnel0'), '')

  let devices = useNetworkStore.getState().devices
  const persisted = parsePktXml(generatePktXml(devices, lab.links)).devices[1]
  assert.equal(persisted?.ports.find(port => port.name === 'Tunnel0')?.greDestinationIp, '198.51.100.2', persisted?.importedRunningConfig?.join('\n'))
  assert.equal(persisted?.ports.find(port => port.name === 'Tunnel0')?.greMode, 'gre ip')
  assert.ok(persisted?.routingTable.some(route => route.network === '10.0.2.0' && route.interfaceName === 'Tunnel0'))
  let packets = createPingPackets(devices.find(device => device.id === lab.pcA.id)!, devices, lab.links, '10.0.2.10')
  const trace: string[] = []
  let deliveredToSource = false
  let discarded = 0
  for (let tick = 0; tick < 240 && packets.length; tick++) {
    trace.push(...packets.map(packet => packet.pdu.summary))
    const step = stepSimulationTick(devices, lab.links, packets)
    trace.push(...step.packetDeliveries.filter(delivery => delivery.status === 'dropped').map(delivery => delivery.reason ?? 'Packet dropped.'))
    devices = step.updatedDevices
    packets = step.newInFlightPackets
    discarded += step.discardedPackets
    deliveredToSource ||= step.packetDeliveries.some(delivery => delivery.receiverDeviceId === lab.pcA.id && delivery.status === 'delivered')
  }

  assert.equal(discarded, 0, trace.join('\n'))
  assert.equal(packets.length, 0)
  assert.equal(deliveredToSource, true, trace.join('\n'))
  assert.ok(trace.some(summary => summary.startsWith('GRE: Encapsulate')), trace.join('\n'))
  assert.ok(trace.some(summary => summary.startsWith('GRE: Decapsulate')), trace.join('\n'))
  assert.ok(trace.some(summary => summary.includes('ICMP: Echo Reply')), trace.join('\n'))
})

test('GRE no shutdown reports down while its source underlay is down', () => {
  const lab = greLab()
  const cli = configureGreLab(lab)
  useNetworkStore.setState(state => ({
    devices: state.devices.map(device => device.id === lab.routerA.id
      ? { ...device, ports: device.ports.map(port => port.name === 'FastEthernet0/0' ? { ...port, adminStatus: 'down' as const, status: 'down' as const } : port) }
      : device),
  }))
  const currentRouter = useNetworkStore.getState().devices.find(device => device.id === lab.routerA.id)!
  const currentSource = currentRouter.ports.find(port => port.name === 'FastEthernet0/0')
  assert.equal(currentSource?.adminStatus, 'down')
  assert.equal(currentSource?.status, 'down')

  cli(lab.routerA, 'interface Tunnel0')
  const selectedRouter = useNetworkStore.getState().devices.find(device => device.id === lab.routerA.id)!
  const selectedTunnel = selectedRouter.ports.find(port => port.name === 'Tunnel0')
  const selectedSource = selectedRouter.ports.find(port => port.name === 'FastEthernet0/0')
  assert.equal(selectedRouter.currentCliMode, 'config-if')
  assert.equal(selectedTunnel?.isGreTunnel, true)
  assert.equal(selectedTunnel?.greSourceInterface, 'FastEthernet0/0')
  assert.equal(selectedSource?.adminStatus, 'down')
  assert.equal(selectedSource?.status, 'down')
  const transition = cli(lab.routerA, 'no shutdown')

  assert.match(transition, /Interface Tunnel0, changed state to down/)
  assert.match(transition, /Line protocol on Interface Tunnel0, changed state to down/)
  assert.doesNotMatch(transition, /changed state to up/)
  assert.match(cli(lab.routerA, 'do show ip interface brief'), /Tu0\s+172\.16\.0\.1.*down\s+down/)
})

test('GRE keepalive uses IOS defaults, validates ranges and survives workspace and PKT configuration restore', () => {
  const lab = greLab()
  const cli = configureGreLab(lab)
  cli(lab.routerA, 'interface Tunnel0')
  assert.equal(cli(lab.routerA, 'keepalive'), '')
  let configuredRouter = useNetworkStore.getState().devices.find(device => device.id === lab.routerA.id)!
  let tunnel = configuredRouter.ports.find(item => item.name === 'Tunnel0')!
  assert.equal(tunnel.greKeepalivePeriodSeconds, 10)
  assert.equal(tunnel.greKeepaliveRetries, 3)
  assert.match(cli(lab.routerA, 'do show running-config'), /keepalive 10 3/)
  assert.match(cli(lab.routerA, 'keepalive 32768'), /Keepalive period must be 0 through 32767/)
  assert.match(cli(lab.routerA, 'keepalive 5 256'), /Keepalive retries must be 1 through 255/)

  const withRuntimeState = {
    ...configuredRouter,
    ports: configuredRouter.ports.map(item => item.name === 'Tunnel0'
      ? { ...item, greKeepaliveElapsedMs: 8400, greKeepaliveMissed: 2, greKeepaliveSequence: 6, greKeepaliveOperational: false }
      : item),
  }
  const restored = parseWorkspace({ version: 1, devices: useNetworkStore.getState().devices.map(device => device.id === configuredRouter.id ? withRuntimeState : device), links: lab.links }).devices.find(device => device.id === configuredRouter.id)!.ports.find(item => item.name === 'Tunnel0')!
  assert.equal(restored.greKeepalivePeriodSeconds, 10)
  assert.equal(restored.greKeepaliveRetries, 3)
  assert.equal(restored.greKeepaliveElapsedMs, undefined)
  assert.equal(restored.greKeepaliveMissed, undefined)
  assert.equal(restored.greKeepaliveOperational, undefined)

  const imported = parsePktXml(generatePktXml(useNetworkStore.getState().devices, lab.links)).devices[1]!
  const importedTunnel = imported.ports.find(item => item.name === 'Tunnel0')!
  assert.equal(importedTunnel.greKeepalivePeriodSeconds, 10)
  assert.equal(importedTunnel.greKeepaliveRetries, 3)
  assert.match(imported.importedRunningConfig?.join('\n') ?? '', /keepalive 10 3/)

  assert.equal(cli(lab.routerA, 'no keepalive'), '')
  configuredRouter = useNetworkStore.getState().devices.find(device => device.id === lab.routerA.id)!
  tunnel = configuredRouter.ports.find(item => item.name === 'Tunnel0')!
  assert.equal(tunnel.greKeepalivePeriodSeconds, undefined)
  assert.equal(tunnel.greKeepaliveRetries, undefined)
})

test('GRE peer replies to a keepalive even when it has keepalives disabled locally', () => {
  const lab = greLab()
  const cli = configureGreLab(lab)
  cli(lab.routerA, 'interface Tunnel0')
  assert.equal(cli(lab.routerA, 'keepalive 1 2'), '')
  cli(lab.routerA, 'exit')
  let packets: InFlightPacket[] = []
  const trace: string[] = []
  for (let tick = 0; tick < 45; tick++) {
    trace.push(...packets.map(packet => packet.pdu.summary))
    const step = stepSimulationTick(useNetworkStore.getState().devices, lab.links, packets)
    useNetworkStore.setState({ devices: step.updatedDevices })
    packets = step.newInFlightPackets
    trace.push(...packets.map(packet => packet.pdu.summary))
    trace.push(...step.packetDeliveries.map(delivery => delivery.reason ?? delivery.status))
  }
  assert.match(cli(lab.routerA, 'do show ip interface brief'), /Tu0\s+172\.16\.0\.1.*up\s+up/)
  assert.ok(trace.some(summary => summary.includes('GRE Keepalive: request')), trace.join('\n'))
  assert.ok(trace.some(summary => summary.includes('GRE Keepalive: reply')), trace.join('\n'))
})

test('GRE forwards bidirectionally over primary and backup OSPF underlay paths, then restores primary', () => {
  const lab = greLab()
  const backupA = createPort('FastEthernet0/2', 'Fa0/2', 'fastethernet', 'up')
  const backupB = createPort('FastEthernet0/2', 'Fa0/2', 'fastethernet', 'up')
  lab.routerA.ports.push(backupA)
  lab.routerB.ports.push(backupB)
  addressPort(lab.routerA, lab.routerA.ports[0], '198.51.100.1', '255.255.255.252')
  addressPort(lab.routerB, lab.routerB.ports[0], '198.51.100.2', '255.255.255.252')
  addressPort(lab.routerA, backupA, '203.0.113.1', '255.255.255.252')
  addressPort(lab.routerB, backupB, '203.0.113.2', '255.255.255.252')
  for (const device of [lab.pcA, lab.routerA, lab.routerB, lab.pcB]) {
    for (const port of device.ports) {
      port.connectedLinkId = undefined
      port.connectedDeviceId = undefined
      port.connectedPortId = undefined
    }
  }
  lab.routerA.arpTable = []
  lab.routerB.arpTable = []
  const backupAIndex = lab.routerA.ports.indexOf(backupA)
  const backupBIndex = lab.routerB.ports.indexOf(backupB)
  const links = [
    connect(lab.pcA, 0, lab.routerA, 1),
    connect(lab.routerA, 0, lab.routerB, 0),
    connect(lab.routerA, backupAIndex, lab.routerB, backupBIndex),
    connect(lab.routerB, 1, lab.pcB, 0),
  ]
  const devices = [lab.pcA, lab.routerA, lab.routerB, lab.pcB]
  useNetworkStore.getState().loadLab(devices, links)
  const cli = (device: NetworkDevice, line: string) => useNetworkStore.getState().executeIosCommand(device.id, line)
  for (const router of [lab.routerA, lab.routerB]) {
    cli(router, 'enable')
    cli(router, 'configure terminal')
  }
  for (const [router, tunnelIp, destination, remoteLan] of [
    [lab.routerA, '172.16.0.1', '10.0.2.1', '10.0.2.0'],
    [lab.routerB, '172.16.0.2', '10.0.1.1', '10.0.1.0'],
  ] as const) {
    assert.equal(cli(router, 'interface Tunnel0'), '')
    assert.equal(cli(router, `ip address ${tunnelIp} 255.255.255.252`), '')
    assert.equal(cli(router, 'tunnel source FastEthernet0/1'), '')
    assert.equal(cli(router, `tunnel destination ${destination}`), '')
    assert.equal(cli(router, 'tunnel mode gre ip'), '')
    assert.equal(cli(router, 'no shutdown').includes('changed state to up'), true)
    assert.equal(cli(router, 'exit'), '')
    assert.equal(cli(router, `ip route ${remoteLan} 255.255.255.0 Tunnel0`), '')
  }

  for (const [router, ownLan] of [[lab.routerA, '10.0.1.0'], [lab.routerB, '10.0.2.0']] as const) {
    assert.equal(cli(router, 'router ospf 1'), '')
    for (const command of [
      `network ${ownLan} 0.0.0.255 area 0`,
      'network 198.51.100.0 0.0.0.3 area 0',
      'network 203.0.113.0 0.0.0.3 area 0',
      'passive-interface FastEthernet0/1',
      'end',
    ]) assert.equal(cli(router, command), '')
    assert.match(cli(router, 'configure terminal'), /Enter configuration commands/)
    assert.equal(cli(router, 'interface FastEthernet0/0'), '')
    assert.equal(cli(router, 'ip ospf cost 1'), '')
    assert.equal(cli(router, 'exit'), '')
    assert.equal(cli(router, 'interface FastEthernet0/2'), '')
    assert.equal(cli(router, 'ip ospf cost 20'), '')
    assert.equal(cli(router, 'end'), '')
  }

  const advance = (count: number) => {
    let currentDevices = useNetworkStore.getState().devices
    let controlPackets: InFlightPacket[] = []
    for (let tick = 0; tick < count; tick++) {
      const step = stepSimulationTick(currentDevices, links, controlPackets)
      currentDevices = step.updatedDevices
      controlPackets = step.newInFlightPackets
    }
    useNetworkStore.setState({ devices: currentDevices })
    return currentDevices
  }
  const ospfRoute = (routerId: string, network: string) => useNetworkStore.getState().devices.find(device => device.id === routerId)?.routingTable.find(route => route.type === 'O' && route.network === network)
  advance(900)
  assert.equal(ospfRoute(lab.routerA.id, '10.0.2.0')?.interfaceName, 'FastEthernet0/0')
  assert.equal(ospfRoute(lab.routerB.id, '10.0.1.0')?.interfaceName, 'FastEthernet0/0')
  for (const [routerId, peerIp] of [[lab.routerA.id, '10.0.2.1'], [lab.routerB.id, '10.0.1.1']] as const) {
    const tunnel = useNetworkStore.getState().devices.find(device => device.id === routerId)?.ports.find(item => item.name === 'Tunnel0')
    assert.equal(tunnel?.greSourceInterface, 'FastEthernet0/1')
    assert.equal(tunnel?.greDestinationIp, peerIp)
    assert.equal(tunnel?.greMode, 'gre ip')
    assert.equal(tunnel?.adminStatus, 'up')
  }

  const sendPing = (startingDevices: NetworkDevice[]) => {
    let devices = startingDevices
    let packets = createPingPackets(devices.find(device => device.id === lab.pcA.id)!, devices, links, '10.0.2.10')
    const trace: string[] = []
    const greEgresses: { routerId: string; layer1: string }[] = []
    let returned = false
    for (let tick = 0; tick < 300 && packets.length; tick++) {
      trace.push(...packets.map(packet => packet.pdu.summary))
      const step = stepSimulationTick(devices, links, packets)
      greEgresses.push(...step.newInFlightPackets.filter(packet => packet.pdu.protocol === 'GRE').map(packet => ({ routerId: packet.fromDeviceId, layer1: packet.pdu.explanation.layer1 })))
      trace.push(...step.packetDeliveries.filter(delivery => delivery.status === 'dropped').map(delivery => delivery.reason ?? 'Packet dropped.'))
      devices = step.updatedDevices
      packets = step.newInFlightPackets
      returned ||= step.packetDeliveries.some(delivery => delivery.receiverDeviceId === lab.pcA.id && delivery.status === 'delivered')
    }
    useNetworkStore.setState({ devices })
    return { devices, packets, trace, greEgresses, returned }
  }

  const baseline = sendPing(useNetworkStore.getState().devices)
  assert.equal(baseline.packets.length, 0, baseline.trace.join('\n'))
  assert.equal(baseline.returned, true, JSON.stringify({ trace: baseline.trace, greEgresses: baseline.greEgresses }))
  assert.doesNotMatch(baseline.trace.join('\n'), /GRE: Encapsulate GRE/)
  assert.ok(baseline.greEgresses.some(egress => egress.routerId === lab.routerA.id && egress.layer1.includes('FastEthernet0/0')), JSON.stringify(baseline.greEgresses))
  assert.ok(baseline.greEgresses.some(egress => egress.routerId === lab.routerB.id && egress.layer1.includes('FastEthernet0/0')), JSON.stringify(baseline.greEgresses))

  for (const router of [lab.routerA, lab.routerB]) {
    assert.match(cli(router, 'configure terminal'), /Enter configuration commands/)
    assert.equal(cli(router, 'interface FastEthernet0/0'), '')
    assert.match(cli(router, 'shutdown'), /administratively down/)
    assert.equal(cli(router, 'end'), '')
  }
  const failedPrimary = advance(900)
  const convergenceState = [lab.routerA.id, lab.routerB.id].map(id => {
    const router = failedPrimary.find(device => device.id === id)!
    return { router: router.name, routes: router.routingTable.filter(route => route.type === 'O'), neighbors: router.ospf?.neighbors.map(neighbor => ({ port: router.ports.find(item => item.id === neighbor.portId)?.name, state: neighbor.state })), ports: router.ports.filter(item => item.name === 'FastEthernet0/0' || item.name === 'FastEthernet0/2').map(item => ({ name: item.name, status: item.status, admin: item.adminStatus })) }
  })
  assert.equal(ospfRoute(lab.routerA.id, '10.0.2.0')?.interfaceName, 'FastEthernet0/2', JSON.stringify(convergenceState))
  assert.equal(ospfRoute(lab.routerB.id, '10.0.1.0')?.interfaceName, 'FastEthernet0/2', JSON.stringify(convergenceState))
  assert.match(cli(lab.routerA, 'show ip interface brief'), /Tu0\s+172\.16\.0\.1.*up\s+up/)
  const backup = sendPing(failedPrimary)
  assert.equal(backup.packets.length, 0, backup.trace.join('\n'))
  assert.equal(backup.returned, true, backup.trace.join('\n'))
  assert.ok(backup.greEgresses.some(egress => egress.routerId === lab.routerA.id && egress.layer1.includes('FastEthernet0/2')), JSON.stringify(backup.greEgresses))
  assert.ok(backup.greEgresses.some(egress => egress.routerId === lab.routerB.id && egress.layer1.includes('FastEthernet0/2')), JSON.stringify(backup.greEgresses))

  for (const router of [lab.routerA, lab.routerB]) {
    assert.match(cli(router, 'configure terminal'), /Enter configuration commands/)
    assert.equal(cli(router, 'interface FastEthernet0/0'), '')
    assert.match(cli(router, 'no shutdown'), /changed state to (up|down)/)
    assert.equal(cli(router, 'end'), '')
  }
  const recoveredPrimary = advance(900)
  assert.equal(ospfRoute(lab.routerA.id, '10.0.2.0')?.interfaceName, 'FastEthernet0/0')
  assert.equal(ospfRoute(lab.routerB.id, '10.0.1.0')?.interfaceName, 'FastEthernet0/0')
  const recovered = sendPing(recoveredPrimary)
  assert.equal(recovered.packets.length, 0, recovered.trace.join('\n'))
  assert.equal(recovered.returned, true, recovered.trace.join('\n'))
  assert.ok(recovered.greEgresses.some(egress => egress.routerId === lab.routerA.id && egress.layer1.includes('FastEthernet0/0')), JSON.stringify(recovered.greEgresses))
  assert.ok(recovered.greEgresses.some(egress => egress.routerId === lab.routerB.id && egress.layer1.includes('FastEthernet0/0')), JSON.stringify(recovered.greEgresses))
})

test('GRE keepalives withdraw tunnel routes after missed replies and restore them when the peer returns', () => {
  const lab = greLab()
  const cli = configureGreLab(lab)
  cli(lab.routerA, 'interface Tunnel0')
  assert.equal(cli(lab.routerA, 'keepalive 1 2'), '')
  cli(lab.routerA, 'exit')
  assert.match(cli(lab.routerA, 'do show ip interface brief'), /Fa0\/0\s+198\.51\.100\.1.*up\s+up/)
  cli(lab.routerB, 'interface Tunnel0')
  cli(lab.routerB, 'tunnel destination 198.51.100.99')
  let packets: InFlightPacket[] = []
  const trace: string[] = []
  const runTicks = (count: number) => {
    for (let tick = 0; tick < count; tick++) {
      trace.push(...packets.map(packet => packet.pdu.summary))
      const step = stepSimulationTick(useNetworkStore.getState().devices, lab.links, packets)
      trace.push(...step.packetDeliveries.map(delivery => delivery.reason ?? delivery.status))
      useNetworkStore.setState({ devices: step.updatedDevices })
      packets = step.newInFlightPackets
      trace.push(...packets.map(packet => packet.pdu.summary))
    }
  }

  runTicks(45)
  assert.match(cli(lab.routerA, 'do show ip interface brief'), /Tu0\s+172\.16\.0\.1.*down\s+down/)
  assert.doesNotMatch(cli(lab.routerA, 'do show ip route'), /S\s+10\.0\.2\.0\/255\.255\.255\.0 \[1\/0\] via Tunnel0/)

  cli(lab.routerB, 'tunnel destination 198.51.100.1')
  runTicks(25)

  assert.ok(/Tu0\s+172\.16\.0\.1.*up\s+up/.test(cli(lab.routerA, 'do show ip interface brief')), trace.join('\n'))
  assert.ok(/S\s+10\.0\.2\.0\/255\.255\.255\.0 \[1\/0\] via Tunnel0/.test(cli(lab.routerA, 'do show ip route')), trace.join('\n'))
  assert.ok(trace.some(summary => summary.includes('GRE Keepalive: request')), trace.join('\n'))
  assert.ok(trace.some(summary => summary.includes('no matching configured tunnel')), trace.join('\n'))
  assert.ok(trace.some(summary => summary.includes('replied to GRE keepalive')), trace.join('\n'))
})

test('Reset Simulation clears GRE keepalive failure state and starts a fresh timer', () => {
  const lab = greLab()
  const cli = configureGreLab(lab)
  cli(lab.routerA, 'interface Tunnel0')
  assert.equal(cli(lab.routerA, 'keepalive 1 2'), '')
  useNetworkStore.setState(state => ({
    devices: state.devices.map(device => device.id === lab.routerA.id ? {
      ...device,
      ports: device.ports.map(port => port.name === 'Tunnel0' ? {
        ...port, greKeepaliveElapsedMs: 900, greKeepaliveMissed: 2, greKeepaliveSequence: 7, greKeepaliveOperational: false,
      } : port),
    } : device),
  }))

  useNetworkStore.getState().clearSimulation()
  const tunnel = useNetworkStore.getState().devices.find(device => device.id === lab.routerA.id)!.ports.find(port => port.name === 'Tunnel0')!
  assert.equal(tunnel.greKeepaliveElapsedMs, 0)
  assert.equal(tunnel.greKeepaliveMissed, 0)
  assert.equal(tunnel.greKeepaliveSequence, 0)
  assert.equal(tunnel.greKeepaliveOperational, true)
  assert.match(cli(lab.routerA, 'do show ip interface brief'), /Tu0\s+172\.16\.0\.1.*up\s+up/)
})

test('GRE rejects an outer endpoint that does not match a configured tunnel', () => {
  const lab = greLab()
  const cli = configureGreLab(lab)
  cli(lab.routerB, 'interface Tunnel0')
  cli(lab.routerB, 'tunnel destination 198.51.100.99')

  let devices = useNetworkStore.getState().devices
  let packets = createPingPackets(devices.find(device => device.id === lab.pcA.id)!, devices, lab.links, '10.0.2.10')
  const failures: string[] = []
  let deliveredToSource = false
  for (let tick = 0; tick < 240 && packets.length; tick++) {
    const step = stepSimulationTick(devices, lab.links, packets)
    devices = step.updatedDevices
    packets = step.newInFlightPackets
    failures.push(...step.packetDeliveries.filter(delivery => delivery.status === 'dropped').map(delivery => delivery.reason ?? 'Packet dropped.'))
    deliveredToSource ||= step.packetDeliveries.some(delivery => delivery.receiverDeviceId === lab.pcA.id && delivery.status === 'delivered')
  }
  assert.equal(deliveredToSource, false)
  assert.ok(failures.some(reason => reason.includes('no matching operational tunnel')), failures.join('\n'))
})
