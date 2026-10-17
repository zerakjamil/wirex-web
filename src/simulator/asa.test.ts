import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { parseIosCommand, getPrompt } from './ios/ciscoParser'
import { createHttpGetPackets, createIcmpEchoPdu, createUdpEchoPackets, stepSimulationTick } from './engine'
import type { InFlightPacket, NetworkLink, PacketPdu } from '@/types/network'

test('Cisco ASA 5505 initializes with authentic inside/outside zones and security levels', () => {
  const asa = createDevice('security', 100, 100, 'ASA 5505')
  assert.equal(asa.type, 'security')
  assert.equal(asa.model, 'ASA 5505')
  assert.equal(asa.config.hostname, 'ciscoasa')

  const eth0 = asa.ports.find((p) => p.name === 'Ethernet0/0')
  const eth1 = asa.ports.find((p) => p.name === 'Ethernet0/1')

  assert.ok(eth0)
  assert.equal(eth0.nameif, 'outside')
  assert.equal(eth0.securityLevel, 0)
  assert.equal(eth0.vlan, 2)

  assert.ok(eth1)
  assert.equal(eth1.nameif, 'inside')
  assert.equal(eth1.securityLevel, 100)
  assert.equal(eth1.vlan, 1)
  assert.equal(eth1.ipAddress, '192.168.1.1')
  assert.equal(eth1.subnetMask, '255.255.255.0')

  assert.equal(asa.config.asaInspection?.icmp, true)
  assert.equal(asa.config.asaInspection?.http, true)

  const connRoute = asa.routingTable.find((r) => r.network === '192.168.1.0')
  assert.ok(connRoute)
  assert.equal(connRoute.interfaceName, 'Ethernet0/1')
})

test('Cisco ASA CLI formats authentic prompts and supports nameif and security-level', () => {
  const asa = createDevice('security', 100, 100, 'ASA 5505')
  assert.equal(getPrompt(asa), 'ciscoasa#')

  asa.currentCliMode = 'user'
  assert.equal(getPrompt(asa), 'ciscoasa>')

  asa.currentCliMode = 'config'
  assert.equal(getPrompt(asa), 'ciscoasa(config)#')

  asa.currentCliMode = 'config-if'
  asa.activeInterface = asa.ports[0].id
  assert.equal(getPrompt(asa), 'ciscoasa(config-if)#')

  // nameif command
  const resNameif = parseIosCommand(asa, 'nameif dmz')
  assert.ok(resNameif.output.includes('Security level for "dmz" set to 0 by default'))
  assert.equal(resNameif.modifiedPorts?.[0].nameif, 'dmz')
  assert.equal(resNameif.modifiedPorts?.[0].securityLevel, 0)

  // security-level command
  const resSec = parseIosCommand(asa, 'security-level 50')
  assert.equal(resSec.modifiedPorts?.[0].securityLevel, 50)

  // Invalid security-level
  const resSecBad = parseIosCommand(asa, 'security-level 150')
  assert.ok(resSecBad.output.includes('Invalid security level'))

  // show nameif command
  asa.currentCliMode = 'priv'
  const resShowNameif = parseIosCommand(asa, 'show nameif')
  assert.ok(resShowNameif.output.includes('outside'))
  assert.ok(resShowNameif.output.includes('inside'))

  // show interface ip brief command
  const resShowInt = parseIosCommand(asa, 'show interface ip brief')
  assert.ok(resShowInt.output.includes('Eth0/1'))
  assert.ok(resShowInt.output.includes('192.168.1.1'))

  asa.asaNatTranslations = [{
    id: 'xlate-test', protocol: 'ICMP', sourceInterface: 'inside', destInterface: 'outside',
    originalSourceIp: '192.168.1.10', translatedSourceIp: '203.0.113.1', remoteDestinationIp: '203.0.113.10',
    originalIdentifier: 0, translatedIdentifier: 1, expiresAtMs: Date.now() + 30_000,
  }]
  const resXlate = parseIosCommand(asa, 'show xlate')
  assert.ok(resXlate.output.includes('192.168.1.10:0 203.0.113.1:1 203.0.113.10'))

  // show running-config command
  const resRun = parseIosCommand(asa, 'show running-config')
  assert.ok(resRun.output.includes('nameif inside'))
  assert.ok(resRun.output.includes('security-level 100'))
  assert.ok(resRun.output.includes('nameif outside'))
  assert.ok(resRun.output.includes('security-level 0'))
  assert.ok(resRun.output.includes('subnet 192.168.1.0 255.255.255.0'))
  assert.ok(resRun.output.includes('nat (inside,outside) dynamic interface'))
})

test('Cisco ASA applies dynamic PAT to inside ICMP and translates only its tracked reply', () => {
  const asa = createDevice('security', 100, 100, 'ASA 5505')
  const insideHost = createDevice('pc', 0, 100, 'PC-PT')
  const outsideHost = createDevice('server', 200, 100, 'Server-PT')

  insideHost.ports[0].ipAddress = '192.168.1.10'
  insideHost.ports[0].subnetMask = '255.255.255.0'
  insideHost.config.defaultGateway = '192.168.1.1'
  insideHost.ports[0].adminStatus = 'up'
  insideHost.ports[0].status = 'up'

  outsideHost.ports[0].ipAddress = '203.0.113.10'
  outsideHost.ports[0].subnetMask = '255.255.255.0'
  outsideHost.config.defaultGateway = '203.0.113.1'
  outsideHost.ports[0].adminStatus = 'up'
  outsideHost.ports[0].status = 'up'
  outsideHost.arpTable = [
    { ipAddress: '203.0.113.1', macAddress: asa.ports[0].macAddress, interfaceName: outsideHost.ports[0].name, age: 0 },
  ]

  asa.ports[0].ipAddress = '203.0.113.1'
  asa.ports[0].subnetMask = '255.255.255.0'
  asa.ports[0].nameif = 'outside'
  asa.ports[0].securityLevel = 0
  asa.ports[0].adminStatus = 'up'
  asa.ports[0].status = 'up'

  asa.ports[1].ipAddress = '192.168.1.1'
  asa.ports[1].subnetMask = '255.255.255.0'
  asa.ports[1].nameif = 'inside'
  asa.ports[1].securityLevel = 100
  asa.ports[1].adminStatus = 'up'
  asa.ports[1].status = 'up'

  asa.routingTable = [
    { network: '192.168.1.0', netmask: '255.255.255.0', nextHop: '192.168.1.1', interfaceName: 'Ethernet0/1', metric: 0, type: 'C' },
    { network: '203.0.113.0', netmask: '255.255.255.0', nextHop: '203.0.113.1', interfaceName: 'Ethernet0/0', metric: 0, type: 'C' },
  ]

  const linkInside: NetworkLink = {
    id: 'link-in',
    fromDeviceId: insideHost.id,
    fromPortId: insideHost.ports[0].id,
    toDeviceId: asa.id,
    toPortId: asa.ports[1].id,
    type: 'straight',
    status: 'up',
  }
  insideHost.ports[0].connectedLinkId = linkInside.id
  asa.ports[1].connectedLinkId = linkInside.id

  const linkOutside: NetworkLink = {
    id: 'link-out',
    fromDeviceId: outsideHost.id,
    fromPortId: outsideHost.ports[0].id,
    toDeviceId: asa.id,
    toPortId: asa.ports[0].id,
    type: 'straight',
    status: 'up',
  }
  asa.ports[0].connectedLinkId = linkOutside.id
  outsideHost.ports[0].connectedLinkId = linkOutside.id

  // Unsolicited ping from outside host to inside host arriving at ASA outside port
  const unsolicitedPdu = createIcmpEchoPdu(
    outsideHost,
    outsideHost.ports[0].id,
    asa.ports[0].macAddress,
    '192.168.1.10'
  )

  const incomingPacket: InFlightPacket = {
    id: 'pkt-outside-in',
    linkId: linkOutside.id,
    fromDeviceId: outsideHost.id,
    toDeviceId: asa.id,
    progress: 0.9,
    direction: 'forward',
    pdu: unsolicitedPdu,
  }

  const result1 = stepSimulationTick([asa, insideHost, outsideHost], [linkInside, linkOutside], [incomingPacket])
  assert.equal(result1.discardedPackets, 1)
  const dropLog = result1.packetDeliveries.find((d) => d.status === 'dropped')
  assert.ok(dropLog?.reason?.includes('ASA firewall dropped unsolicited packet from lower security zone'))

  asa.arpTable = [
    { ipAddress: '192.168.1.10', macAddress: insideHost.ports[0].macAddress, interfaceName: 'Ethernet0/1', age: 0 },
    { ipAddress: '203.0.113.10', macAddress: outsideHost.ports[0].macAddress, interfaceName: 'Ethernet0/0', age: 0 },
  ]

  const outboundPdu = createIcmpEchoPdu(insideHost, insideHost.ports[0].id, asa.ports[1].macAddress, '203.0.113.10')
  const outboundPacket: InFlightPacket = {
    id: 'pkt-inside-out', linkId: linkInside.id, fromDeviceId: insideHost.id, toDeviceId: asa.id,
    progress: 0.9, direction: 'forward', pdu: outboundPdu,
  }
  const outboundResult = stepSimulationTick([asa, insideHost, outsideHost], [linkInside, linkOutside], [outboundPacket])
  const translatedPacket = outboundResult.newInFlightPackets.find((candidate) => candidate.toDeviceId === outsideHost.id && candidate.pdu.protocol === 'ICMP')
  assert.ok(translatedPacket, 'ASA should forward the echo request toward the outside host')
  assert.equal(translatedPacket.pdu.sourceIp, '203.0.113.1')
  assert.notEqual(translatedPacket.pdu.payload.icmpIdentifier, outboundPdu.payload.icmpIdentifier)
  const translatedAsa = outboundResult.updatedDevices.find((device) => device.id === asa.id)
  assert.equal(translatedAsa?.asaNatTranslations?.length, 1)
  assert.equal(translatedAsa?.asaNatTranslations?.[0].originalSourceIp, '192.168.1.10')

  const invalidIdentifier = { ...outboundPdu, id: 'pdu-invalid-id', payload: { ...outboundPdu.payload, icmpIdentifier: 65_536 } }
  const invalidIdentifierResult = stepSimulationTick([asa, insideHost, outsideHost], [linkInside, linkOutside], [{ ...outboundPacket, id: 'pkt-invalid-id', pdu: invalidIdentifier }])
  assert.ok(invalidIdentifierResult.packetDeliveries.some((delivery) => delivery.reason?.includes('invalid ICMP identifier')))

  // The actual outside server returns the reply, which the ASA reverse-translates.
  const replyPdu: PacketPdu = {
    ...translatedPacket.pdu,
    id: 'pdu-reply',
    sourceMac: outsideHost.ports[0].macAddress,
    destMac: asa.ports[0].macAddress,
    sourceIp: '203.0.113.10',
    destIp: '203.0.113.1',
    payload: { icmpType: 'echo-reply', icmpSeq: translatedPacket.pdu.payload.icmpSeq, icmpIdentifier: translatedPacket.pdu.payload.icmpIdentifier },
  }
  const replyPacket: InFlightPacket = {
    id: 'pkt-outside-reply', linkId: linkOutside.id, fromDeviceId: outsideHost.id, toDeviceId: asa.id,
    progress: 0.9, direction: 'forward',
    pdu: replyPdu,
  }

  let simulationDevices = translatedAsa ? [translatedAsa, insideHost, outsideHost] : [asa, insideHost, outsideHost]
  let pendingPackets = outboundResult.newInFlightPackets
  let replyReachedInside = false
  for (let tick = 0; tick < 40 && !replyReachedInside; tick++) {
    const tickResult = stepSimulationTick(simulationDevices, [linkInside, linkOutside], pendingPackets)
    replyReachedInside = tickResult.packetDeliveries.some((delivery) => delivery.receiverDeviceId === insideHost.id && delivery.status === 'delivered')
    simulationDevices = tickResult.updatedDevices
    pendingPackets = tickResult.newInFlightPackets
  }
  assert.ok(replyReachedInside, 'outside host reply should cross ASA and reach the inside host')

  const inspectionDisabledAsa = simulationDevices.find((device) => device.id === asa.id)
  assert.ok(inspectionDisabledAsa)
  const noInspectionDevices = simulationDevices.map((device) => device.id === asa.id
    ? { ...device, config: { ...device.config, asaInspection: { icmp: false, http: true, tcp: true, dns: true } } }
    : device)
  const disabledInspectionResult = stepSimulationTick(noInspectionDevices, [linkInside, linkOutside], [replyPacket])
  assert.equal(disabledInspectionResult.discardedPackets, 1)
  assert.ok(disabledInspectionResult.packetDeliveries.some((delivery) => delivery.reason?.includes('unsolicited packet from lower security zone')))

  const unmatchedReply: PacketPdu = {
    ...replyPdu,
    id: 'pdu-unmatched-reply',
    payload: { ...replyPdu.payload, icmpIdentifier: (replyPdu.payload.icmpIdentifier ?? 0) + 1 },
  }
  const unmatchedResult = stepSimulationTick(simulationDevices, [linkInside, linkOutside], [{ ...replyPacket, id: 'pkt-unmatched-reply', pdu: unmatchedReply }])
  assert.equal(unmatchedResult.discardedPackets, 1)
  assert.ok(unmatchedResult.packetDeliveries.some((delivery) => delivery.reason?.includes('without a matching ASA translation')))

  const staticAsa = simulationDevices.find((device) => device.id === asa.id)!
  const staticDevices = simulationDevices.map((device) => device.id === asa.id
    ? { ...device, config: { ...device.config, asaNatRules: (device.config.asaNatRules ?? []).map((rule) => ({ ...rule, type: 'static' as const })) } }
    : device)
  const staticNatResult = stepSimulationTick(staticDevices, [linkInside, linkOutside], [outboundPacket])
  assert.equal(staticNatResult.discardedPackets, 1)
  assert.ok(staticNatResult.packetDeliveries.some((delivery) => delivery.reason?.includes('static NAT rule') && delivery.reason.includes('not implemented')))
  assert.ok(staticAsa.asaNatTranslations?.length)
})

test('Cisco ASA dynamic PAT translates routed UDP echo and returns the response to the original client port', () => {
  const asa = createDevice('security', 100, 100, 'ASA 5505')
  const client = createDevice('pc', 0, 100, 'PC-PT')
  const server = createDevice('server', 200, 100, 'Server-PT')
  const inside = asa.ports.find(port => port.nameif === 'inside')!
  const outside = asa.ports.find(port => port.nameif === 'outside')!
  const clientPort = client.ports[0]
  const serverPort = server.ports[0]

  Object.assign(clientPort, { ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up' })
  client.config.defaultGateway = '192.168.1.1'
  Object.assign(serverPort, { ipAddress: '203.0.113.10', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up' })
  server.config.defaultGateway = '203.0.113.1'
  server.config.udpEchoServiceEnabled = true
  server.config.udpEchoPorts = [9000]
  Object.assign(inside, { ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up', nameif: 'inside', securityLevel: 100 })
  Object.assign(outside, { ipAddress: '203.0.113.1', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up', nameif: 'outside', securityLevel: 0 })
  for (const port of [clientPort, serverPort, inside, outside]) Object.assign(port, { adminStatus: 'up', status: 'up' })

  const linkInside: NetworkLink = { id: 'asa-udp-inside', type: 'straight', fromDeviceId: client.id, fromPortId: clientPort.id, toDeviceId: asa.id, toPortId: inside.id, status: 'up' }
  const linkOutside: NetworkLink = { id: 'asa-udp-outside', type: 'straight', fromDeviceId: asa.id, fromPortId: outside.id, toDeviceId: server.id, toPortId: serverPort.id, status: 'up' }
  Object.assign(clientPort, { connectedLinkId: linkInside.id, connectedDeviceId: asa.id, connectedPortId: inside.id })
  Object.assign(inside, { connectedLinkId: linkInside.id, connectedDeviceId: client.id, connectedPortId: clientPort.id })
  Object.assign(outside, { connectedLinkId: linkOutside.id, connectedDeviceId: server.id, connectedPortId: serverPort.id })
  Object.assign(serverPort, { connectedLinkId: linkOutside.id, connectedDeviceId: asa.id, connectedPortId: outside.id })
  asa.routingTable = [
    { network: '192.168.1.0', netmask: '255.255.255.0', nextHop: '192.168.1.1', interfaceName: inside.name, metric: 0, type: 'C' },
    { network: '203.0.113.0', netmask: '255.255.255.0', nextHop: '203.0.113.1', interfaceName: outside.name, metric: 0, type: 'C' },
  ]
  asa.arpTable = [
    { ipAddress: '203.0.113.10', macAddress: serverPort.macAddress, interfaceName: outside.name, age: 0 },
  ]
  client.arpTable = [{ ipAddress: '192.168.1.1', macAddress: inside.macAddress, interfaceName: clientPort.name, age: 0 }]
  server.arpTable = [{ ipAddress: '203.0.113.1', macAddress: outside.macAddress, interfaceName: serverPort.name, age: 0 }]

  const devices = [asa, client, server]
  const links = [linkInside, linkOutside]
  const request = createUdpEchoPackets(client, devices, links, 'asa-udp-pat', '203.0.113.10', 9000, 'PAT reply')
  assert.ok(request.length)
  const originalRequest = request[0].pdu.pendingPacket ?? request[0].pdu
  const invalidPortRequest: InFlightPacket = {
    ...request[0],
    id: 'asa-udp-invalid-source-port',
    progress: 0.9,
    pdu: { ...originalRequest, sourceMac: clientPort.macAddress, destMac: inside.macAddress, payload: { ...originalRequest.payload, udpSourcePort: 0 } },
  }
  const invalidPortResult = stepSimulationTick(devices, links, [invalidPortRequest])
  assert.ok(invalidPortResult.packetDeliveries.some(delivery => delivery.reason?.includes('invalid UDP ports')))

  let packets = request
  let currentDevices = devices
  const results: ReturnType<typeof stepSimulationTick>['udpResults'] = []
  let translatedRequest: PacketPdu | undefined

  for (let tick = 0; tick < 500 && packets.length; tick++) {
    const step = stepSimulationTick(currentDevices, links, packets)
    currentDevices = step.updatedDevices
    packets = step.newInFlightPackets
    results.push(...step.udpResults)
    translatedRequest ??= packets.find(packet => packet.toDeviceId === server.id && packet.pdu.protocol === 'UDP')?.pdu
  }

  assert.ok(translatedRequest, 'ASA should forward a translated request to the outside server')
  assert.equal(translatedRequest.sourceIp, '203.0.113.1')
  assert.notEqual(translatedRequest.payload.udpSourcePort, originalRequest.payload.udpSourcePort)
  assert.equal(translatedRequest.payload.udpDestinationPort, 9000)
  assert.ok(results.some(result => result.requestId === 'asa-udp-pat' && result.status === 'successful' && result.response === 'PAT reply'))

  const statefulAsa = currentDevices.find(device => device.id === asa.id)!
  const translation = statefulAsa.asaNatTranslations?.find(entry => entry.protocol === 'UDP')
  assert.ok(translation)
  assert.equal(translation.originalSourcePort, originalRequest.payload.udpSourcePort)
  assert.equal(translation.translatedSourcePort, translatedRequest.payload.udpSourcePort)
  const xlateOutput = parseIosCommand({ ...statefulAsa, currentCliMode: 'priv' }, 'show xlate').output
  assert.ok(xlateOutput.includes(`udp 192.168.1.10:${originalRequest.payload.udpSourcePort} 203.0.113.1:${translatedRequest.payload.udpSourcePort} 203.0.113.10:9000`))

  const replyPdu: PacketPdu = {
    ...translatedRequest,
    id: 'asa-udp-pat-reply',
    sourceMac: serverPort.macAddress,
    destMac: outside.macAddress,
    sourceIp: '203.0.113.10',
    destIp: '203.0.113.1',
    payload: { ...translatedRequest.payload, udpMessageType: 'response', udpSourcePort: 9000, udpDestinationPort: translation.translatedSourcePort },
  }
  const replyPacket: InFlightPacket = { id: 'asa-udp-reply-packet', linkId: linkOutside.id, fromDeviceId: server.id, toDeviceId: asa.id, progress: 0.9, direction: 'forward', pdu: replyPdu }
  const unmatchedResult = stepSimulationTick(currentDevices, links, [{
    ...replyPacket,
    id: 'asa-udp-unmatched-packet',
    pdu: { ...replyPdu, payload: { ...replyPdu.payload, udpDestinationPort: translation.translatedSourcePort + 1 } },
  }])
  assert.equal(unmatchedResult.discardedPackets, 1)
  assert.ok(unmatchedResult.packetDeliveries.some(delivery => delivery.reason?.includes('UDP response without a matching ASA translation')))

  const noUdpInspection = currentDevices.map(device => device.id === asa.id
    ? { ...device, config: { ...device.config, asaInspection: { ...device.config.asaInspection!, udp: false } } }
    : device)
  const inspectionDisabledResult = stepSimulationTick(noUdpInspection, links, [replyPacket])
  assert.equal(inspectionDisabledResult.discardedPackets, 1)
  assert.ok(inspectionDisabledResult.packetDeliveries.some(delivery => delivery.reason?.includes('unsolicited packet from lower security zone')))
})

test('Cisco ASA TCP PAT carries a complete HTTP exchange and only admits matching return segments', () => {
  const asa = createDevice('security', 100, 100, 'ASA 5505')
  const client = createDevice('pc', 0, 100, 'PC-PT')
  const server = createDevice('server', 200, 100, 'Server-PT')
  const inside = asa.ports.find(port => port.nameif === 'inside')!
  const outside = asa.ports.find(port => port.nameif === 'outside')!
  const clientPort = client.ports[0]
  const serverPort = server.ports[0]

  Object.assign(clientPort, { ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up' })
  client.config.defaultGateway = '192.168.1.1'
  Object.assign(serverPort, { ipAddress: '203.0.113.10', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up' })
  server.config.defaultGateway = '203.0.113.1'
  server.config.httpServiceEnabled = true
  server.config.htmlContent = '<h1>ASA TCP PAT page</h1>'
  Object.assign(inside, { ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up', nameif: 'inside', securityLevel: 100 })
  Object.assign(outside, { ipAddress: '203.0.113.1', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up', nameif: 'outside', securityLevel: 0 })
  for (const port of [clientPort, serverPort, inside, outside]) Object.assign(port, { adminStatus: 'up', status: 'up' })

  const linkInside: NetworkLink = { id: 'asa-tcp-inside', type: 'straight', fromDeviceId: client.id, fromPortId: clientPort.id, toDeviceId: asa.id, toPortId: inside.id, status: 'up' }
  const linkOutside: NetworkLink = { id: 'asa-tcp-outside', type: 'straight', fromDeviceId: asa.id, fromPortId: outside.id, toDeviceId: server.id, toPortId: serverPort.id, status: 'up' }
  Object.assign(clientPort, { connectedLinkId: linkInside.id, connectedDeviceId: asa.id, connectedPortId: inside.id })
  Object.assign(inside, { connectedLinkId: linkInside.id, connectedDeviceId: client.id, connectedPortId: clientPort.id })
  Object.assign(outside, { connectedLinkId: linkOutside.id, connectedDeviceId: server.id, connectedPortId: serverPort.id })
  Object.assign(serverPort, { connectedLinkId: linkOutside.id, connectedDeviceId: asa.id, connectedPortId: outside.id })
  asa.routingTable = [
    { network: '192.168.1.0', netmask: '255.255.255.0', nextHop: '192.168.1.1', interfaceName: inside.name, metric: 0, type: 'C' },
    { network: '203.0.113.0', netmask: '255.255.255.0', nextHop: '203.0.113.1', interfaceName: outside.name, metric: 0, type: 'C' },
  ]
  asa.arpTable = [{ ipAddress: '203.0.113.10', macAddress: serverPort.macAddress, interfaceName: outside.name, age: 0 }]
  client.arpTable = [{ ipAddress: '192.168.1.1', macAddress: inside.macAddress, interfaceName: clientPort.name, age: 0 }]
  server.arpTable = [{ ipAddress: '203.0.113.1', macAddress: outside.macAddress, interfaceName: serverPort.name, age: 0 }]

  const devices = [asa, client, server]
  const links = [linkInside, linkOutside]
  const request = createHttpGetPackets(client, devices, links, 'asa-tcp-pat', '203.0.113.10', '/index.html')
  assert.ok(request.length)
  const originalSyn = request[0].pdu.pendingPacket ?? request[0].pdu
  assert.equal(originalSyn.protocol, 'TCP')
  let packets = request
  let currentDevices = devices
  let tcpReceiveBuffers: ReturnType<typeof stepSimulationTick>['tcpReceiveBuffers'] = []
  let tcpOutstandingSegments: ReturnType<typeof stepSimulationTick>['tcpOutstandingSegments'] = []
  const results: ReturnType<typeof stepSimulationTick>['applicationResults'] = []
  const trace: string[] = []
  let translatedSyn: PacketPdu | undefined

  for (let tick = 0; tick < 1200 && (packets.length > 0 || tcpOutstandingSegments.length > 0); tick++) {
    trace.push(...packets.map(packet => packet.pdu.summary))
    const step = stepSimulationTick(currentDevices, links, packets, tcpReceiveBuffers, tcpOutstandingSegments)
    currentDevices = step.updatedDevices
    packets = step.newInFlightPackets
    tcpReceiveBuffers = step.tcpReceiveBuffers
    tcpOutstandingSegments = step.tcpOutstandingSegments
    results.push(...step.applicationResults)
    translatedSyn ??= packets.find(packet => packet.toDeviceId === server.id && packet.pdu.protocol === 'TCP' && packet.pdu.payload.tcpFlags === 'SYN')?.pdu
  }

  assert.ok(translatedSyn, `ASA should forward the TCP SYN to the outside server. Trace: ${trace.join(' | ')}`)
  assert.equal(translatedSyn.sourceIp, '203.0.113.1')
  assert.equal(translatedSyn.payload.tcpDestinationPort, 80)
  assert.notEqual(translatedSyn.payload.tcpSourcePort, originalSyn.payload.tcpSourcePort)
  assert.ok(trace.some(summary => summary.includes('TCP ACK+PSH: HTTP GET')))
  assert.ok(trace.some(summary => summary.includes('TCP ACK+PSH: HTTP 200 response')))
  assert.ok(trace.some(summary => summary.includes('TCP FIN-ACK')))
  assert.ok(results.some(result => result.requestId === 'asa-tcp-pat' && result.status === 'successful' && result.response === '<h1>ASA TCP PAT page</h1>'), JSON.stringify({ trace, results, inFlight: packets.map(packet => packet.pdu.summary), tcpOutstandingSegments }))

  const statefulAsa = currentDevices.find(device => device.id === asa.id)!
  const translation = statefulAsa.asaNatTranslations?.find(entry => entry.protocol === 'TCP')
  assert.ok(translation)
  assert.equal(statefulAsa.asaNatTranslations?.filter(entry => entry.protocol === 'TCP').length, 1)
  assert.equal(translation.originalSourcePort, originalSyn.payload.tcpSourcePort)
  assert.equal(translation.translatedSourcePort, translatedSyn.payload.tcpSourcePort)
  const xlateOutput = parseIosCommand({ ...statefulAsa, currentCliMode: 'priv' }, 'show xlate').output
  assert.ok(xlateOutput.includes(`tcp 192.168.1.10:${originalSyn.payload.tcpSourcePort} 203.0.113.1:${translatedSyn.payload.tcpSourcePort} 203.0.113.10:80`))

  const response: PacketPdu = {
    ...translatedSyn,
    id: 'asa-tcp-pat-unmatched-reply',
    sourceMac: serverPort.macAddress,
    destMac: outside.macAddress,
    sourceIp: '203.0.113.10',
    destIp: '203.0.113.1',
    payload: { ...translatedSyn.payload, tcpFlags: 'SYN-ACK', tcpSourcePort: 80, tcpDestinationPort: translation.translatedSourcePort + 1 },
  }
  const badTuples = [
    response,
    { ...response, id: 'asa-tcp-pat-wrong-remote-port', payload: { ...response.payload, tcpSourcePort: 81, tcpDestinationPort: translation.translatedSourcePort } },
    { ...response, id: 'asa-tcp-pat-wrong-remote-ip', sourceIp: '203.0.113.11', payload: { ...response.payload, tcpDestinationPort: translation.translatedSourcePort } },
  ]
  for (const [index, badTuple] of badTuples.entries()) {
    const unmatched = stepSimulationTick(currentDevices, links, [{ id: `asa-tcp-unmatched-${index}`, linkId: linkOutside.id, fromDeviceId: server.id, toDeviceId: asa.id, progress: 0.9, direction: 'forward', pdu: badTuple }])
    assert.equal(unmatched.discardedPackets, 1)
    assert.ok(unmatched.packetDeliveries.some(delivery => delivery.reason?.includes('TCP segment without a matching ASA translation')))
  }

  const noTcpInspection = currentDevices.map(device => device.id === asa.id
    ? { ...device, config: { ...device.config, asaInspection: { ...device.config.asaInspection!, tcp: false } } }
    : device)
  const inspectionDisabled = stepSimulationTick(noTcpInspection, links, [{ id: 'asa-tcp-inspection-off', linkId: linkOutside.id, fromDeviceId: server.id, toDeviceId: asa.id, progress: 0.9, direction: 'forward', pdu: { ...response, payload: { ...response.payload, tcpDestinationPort: translation.translatedSourcePort } } }])
  assert.equal(inspectionDisabled.discardedPackets, 1)
  assert.ok(inspectionDisabled.packetDeliveries.some(delivery => delivery.reason?.includes('unsolicited packet from lower security zone')))
})
