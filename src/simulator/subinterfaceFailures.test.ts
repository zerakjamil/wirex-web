import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice, createPort } from './deviceFactory'
import { createArpRequestPdu, createPingPackets, stepSimulationTick } from './engine'
import type { InFlightPacket, NetworkDevice, NetworkLink } from '../types/network'

function lab() {
  const router = createDevice('router', 0, 0, '2811')
  const sw = createDevice('switch', 100, 0)
  const a = createDevice('pc', 100, 100)
  const b = createDevice('pc', 200, 100)
  router.id = 'router'; sw.id = 'switch'; a.id = 'a'; b.id = 'b'
  sw.config.portfastDefault = true
  const parent = router.ports[0]
  parent.adminStatus = parent.status = 'up'
  const sub10 = createPort(`${parent.id}.10`, `${parent.shortName}.10`, parent.type, 'up')
  const sub20 = createPort(`${parent.id}.20`, `${parent.shortName}.20`, parent.type, 'up')
  for (const [port, vlan] of [[sub10, 10], [sub20, 20]] as const) {
    Object.assign(port, { parentPortId: parent.id, dot1qVlan: vlan, vlan, status: 'up', ipAddress: `10.0.${vlan}.1`, subnetMask: '255.255.255.0', macAddress: parent.macAddress })
  }
  router.ports.push(sub10, sub20)
  Object.assign(sw.ports[0], { portMode: 'trunk', allowedVlans: [10, 20], nativeVlan: 1 })
  sw.ports[1].vlan = 10; sw.ports[2].vlan = 20
  for (const [pc, vlan] of [[a, 10], [b, 20]] as const) {
    pc.ports[0].ipAddress = `10.0.${vlan}.2`
    pc.ports[0].subnetMask = '255.255.255.0'
    pc.config.defaultGateway = `10.0.${vlan}.1`
  }
  const connect = (from: NetworkDevice, index: number, to: NetworkDevice, toIndex: number): NetworkLink => {
    const fromPort = from.ports[index], toPort = to.ports[toIndex]
    const link: NetworkLink = { id: `${from.id}-${to.id}`, type: 'straight', fromDeviceId: from.id, fromPortId: fromPort.id, toDeviceId: to.id, toPortId: toPort.id, status: 'up' }
    Object.assign(fromPort, { status: 'up', connectedLinkId: link.id, connectedDeviceId: to.id, connectedPortId: toPort.id })
    Object.assign(toPort, { status: 'up', connectedLinkId: link.id, connectedDeviceId: from.id, connectedPortId: fromPort.id })
    return link
  }
  const links = [connect(router, 0, sw, 0), connect(a, 0, sw, 1), connect(b, 0, sw, 2)]
  return { router, sw, a, b, sub10, sub20, parent, devices: [router, sw, a, b], links }
}

function arpToRouter(fixture: ReturnType<typeof lab>, vlanId?: number): InFlightPacket {
  return { id: 'ingress-arp', linkId: fixture.links[0].id, fromDeviceId: fixture.sw.id, toDeviceId: fixture.router.id, direction: 'reverse', progress: 0.95, vlanId, pdu: createArpRequestPdu(fixture.a, fixture.a.ports[0].id, '10.0.10.1') }
}

function exchange(fixture: ReturnType<typeof lab>) {
  let devices = fixture.devices
  let packets = createPingPackets(fixture.a, devices, fixture.links, '10.0.20.2')
  const generated: InFlightPacket[] = []
  let replyArrived = false
  for (let tick = 0; tick < 250 && packets.length; tick++) {
    const arriving = new Map(packets.map(packet => [packet.id, packet]))
    const result = stepSimulationTick(devices, fixture.links, packets)
    for (const delivery of result.packetDeliveries) {
      const packet = arriving.get(delivery.packetId)
      if (delivery.status === 'delivered' && packet?.toDeviceId === fixture.a.id && packet.pdu.payload.icmpType === 'echo-reply') replyArrived = true
    }
    devices = result.updatedDevices
    packets = result.newInFlightPackets
    generated.push(...packets)
  }
  assert.equal(packets.length, 0, 'Invalid VLAN traffic kept circulating')
  return { devices, generated, replyArrived }
}

test('a router rejects a tagged frame with no corresponding subinterface', () => {
  const fixture = lab()
  const result = stepSimulationTick(fixture.devices, fixture.links, [arpToRouter(fixture, 30)])
  assert.equal(result.packetDeliveries[0]?.status, 'dropped')
  assert.equal(result.newInFlightPackets.length, 0)
  assert.equal(result.updatedDevices[0].arpTable.length, 0)
})

test('ARP for the VLAN 10 gateway on the VLAN 20 tag cannot learn or reply', () => {
  const fixture = lab()
  const result = stepSimulationTick(fixture.devices, fixture.links, [arpToRouter(fixture, 20)])
  assert.equal(result.newInFlightPackets.length, 0)
  assert.equal(result.updatedDevices[0].arpTable.length, 0)
})

test('untagged ingress cannot reach a non-native VLAN subinterface', () => {
  const fixture = lab()
  const result = stepSimulationTick(fixture.devices, fixture.links, [arpToRouter(fixture)])
  assert.equal(result.packetDeliveries[0]?.status, 'dropped')
  assert.equal(result.newInFlightPackets.length, 0)
})

test('a native VLAN 20 subinterface cannot answer untagged ARP for VLAN 10', () => {
  const fixture = lab()
  fixture.sub20.dot1qNative = true
  const result = stepSimulationTick(fixture.devices, fixture.links, [arpToRouter(fixture)])
  assert.equal(result.newInFlightPackets.length, 0)
  assert.equal(result.updatedDevices[0].arpTable.length, 0)
})

test('parent shutdown blocks ingress even if child status is stale up', () => {
  const fixture = lab()
  fixture.parent.adminStatus = 'down'
  const result = stepSimulationTick(fixture.devices, fixture.links, [arpToRouter(fixture, 10)])
  assert.equal(result.packetDeliveries[0]?.status, 'dropped')
  assert.equal(result.newInFlightPackets.length, 0)
  assert.deepEqual(createPingPackets(fixture.router, fixture.devices, fixture.links, '10.0.10.2'), [])
})

test('subinterface shutdown prevents local ARP response and transit routing', () => {
  const fixture = lab()
  fixture.sub10.adminStatus = 'down'
  const result = stepSimulationTick(fixture.devices, fixture.links, [arpToRouter(fixture, 10)])
  assert.equal(result.packetDeliveries[0]?.status, 'dropped')
  assert.equal(result.newInFlightPackets.length, 0)
  assert.equal(exchange(fixture).replyArrived, false)
})

test('a trunk excluding VLAN 20 prevents routed egress and an echo exchange', () => {
  const fixture = lab()
  fixture.sw.ports[0].allowedVlans = [10]
  assert.deepEqual(createPingPackets(fixture.router, fixture.devices, fixture.links, '10.0.20.2'), [])
  const result = exchange(fixture)
  assert.equal(result.replyArrived, false)
  assert.equal(result.generated.filter(packet => packet.fromDeviceId === fixture.router.id && packet.vlanId === 20).length, 0)
})

test('matching native VLANs return echo replies untagged on the physical trunk', () => {
  const fixture = lab()
  fixture.sub10.dot1qNative = true
  fixture.sw.ports[0].nativeVlan = 10
  const result = exchange(fixture)
  assert.equal(result.replyArrived, true)
  assert.ok(result.generated.some(packet => packet.fromDeviceId === fixture.router.id && packet.pdu.payload.icmpType === 'echo-reply' && packet.vlanId === undefined))
  assert.ok(result.generated.some(packet => packet.fromDeviceId === fixture.router.id && packet.pdu.payload.icmpType === 'echo-request' && packet.vlanId === 20))
})

test('native VLAN mismatch cannot complete an inter-VLAN echo exchange', () => {
  const fixture = lab()
  fixture.sub10.dot1qNative = true
  fixture.sw.ports[0].nativeVlan = 20
  assert.equal(exchange(fixture).replyArrived, false)
})

test('an echo reply cannot use a shut-down return-path subinterface', () => {
  const fixture = lab()
  let devices = fixture.devices
  let packets = createPingPackets(fixture.a, devices, fixture.links, '10.0.20.2')
  let returnPathShut = false
  let replyDelivered = false
  let replyDropped = false
  for (let tick = 0; tick < 250 && packets.length; tick++) {
    if (!returnPathShut && packets.some(packet => packet.toDeviceId === fixture.router.id && packet.pdu.payload.icmpType === 'echo-reply')) {
      devices = devices.map(device => device.id === fixture.router.id ? {
        ...device, ports: device.ports.map(port => port.id === fixture.sub10.id ? { ...port, adminStatus: 'down', status: 'down' } : port),
      } : device)
      returnPathShut = true
    }
    const arriving = new Map(packets.map(packet => [packet.id, packet]))
    const result = stepSimulationTick(devices, fixture.links, packets)
    for (const delivery of result.packetDeliveries) {
      const packet = arriving.get(delivery.packetId)
      if (packet?.pdu.payload.icmpType !== 'echo-reply') continue
      if (delivery.status === 'dropped' && packet.toDeviceId === fixture.router.id) replyDropped = true
      if (delivery.status === 'delivered' && packet.toDeviceId === fixture.a.id) replyDelivered = true
    }
    devices = result.updatedDevices
    packets = result.newInFlightPackets
  }
  assert.equal(returnPathShut, true, 'Fixture never reached the reverse path')
  assert.equal(replyDropped, true)
  assert.equal(replyDelivered, false)
  assert.equal(packets.length, 0)
})
