import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from './deviceFactory'
import { createArpRequestPdu, createIcmpEchoPdu, createPingPacket, stepSimulationTick, MAX_TOPOLOGY_PACKET_QUEUE } from './engine'
import type { DeviceType, InFlightPacket, NetworkDevice, NetworkLink, PacketPdu } from '../types/network'

function device(type: DeviceType, id: string, ip?: string): NetworkDevice {
  const result = createDevice(type, 0, 0)
  result.id = id
  result.name = id
  result.ports.forEach((port, index) => {
    port.macAddress = `02:00:00:00:${id.charCodeAt(0).toString(16)}:${index.toString(16).padStart(2, '0')}`
    port.adminStatus = 'up'
    port.status = 'up'
  })
  if (ip) {
    result.ports[0].ipAddress = ip
    result.ports[0].subnetMask = '255.255.255.0'
  }
  return result
}

function connect(a: NetworkDevice, aIndex: number, b: NetworkDevice, bIndex: number): NetworkLink {
  const aPort = a.ports[aIndex]
  const bPort = b.ports[bIndex]
  const link: NetworkLink = {
    id: `${a.id}-${aIndex}-${b.id}-${bIndex}`,
    type: 'straight',
    fromDeviceId: a.id,
    fromPortId: aPort.id,
    toDeviceId: b.id,
    toPortId: bPort.id,
    status: 'up',
  }
  Object.assign(aPort, { connectedDeviceId: b.id, connectedPortId: bPort.id, connectedLinkId: link.id })
  Object.assign(bPort, { connectedDeviceId: a.id, connectedPortId: aPort.id, connectedLinkId: link.id })
  return link
}

function frame(link: NetworkLink, source: NetworkDevice, pdu: PacketPdu, progress = 0.95): InFlightPacket {
  return {
    id: `frame-${pdu.id}`,
    linkId: link.id,
    fromDeviceId: source.id,
    toDeviceId: link.fromDeviceId === source.id ? link.toDeviceId : link.fromDeviceId,
    direction: link.fromDeviceId === source.id ? 'forward' : 'reverse',
    progress,
    pdu,
  }
}

function settleStp(devices:NetworkDevice[],links:NetworkLink[],ticks=60){
  let packets:InFlightPacket[]=[]
  for(let tick=1;tick<=ticks;tick++){
    const result=stepSimulationTick(devices,links,packets,[],[],tick)
    devices=result.updatedDevices;packets=result.newInFlightPackets
  }
  return {devices,packets,tick:ticks}
}

test('ARP broadcast in a redundant switch triangle terminates with bounded packets', () => {
  const pc = device('pc', 'p', '10.0.0.1')
  const a = device('switch', 'a')
  const b = device('switch', 'b')
  const c = device('switch', 'c')
  const links = [connect(pc, 0, a, 0), connect(a, 1, b, 0), connect(b, 1, c, 0), connect(c, 1, a, 2), connect(a, 3, b, 2)]
  const converged=settleStp([pc,a,b,c],links)
  let devices = converged.devices
  let packets = [...converged.packets,frame(links[0], pc, createArpRequestPdu(pc, pc.ports[0].id, '10.0.0.99'))]
  let peak = packets.length
  for (let tick = converged.tick+1; tick < converged.tick+151 && packets.some(packet=>packet.pdu.protocol!=='STP'); tick++) {
    const result = stepSimulationTick(devices, links, packets,[],[],tick)
    devices = result.updatedDevices
    packets = result.newInFlightPackets
    peak = Math.max(peak, packets.length)
    assert.ok(peak < 30, `Broadcast grew to ${peak} concurrent packets`)
  }
  assert.equal(packets.filter(packet=>packet.pdu.protocol!=='STP').length, 0, 'Broadcast keeps circulating through redundant links')
})

test('a learning switch ingress cannot forward a data frame', () => {
  const pc = device('pc', 'p', '10.0.0.1')
  const sw = device('switch', 's')
  const other = device('pc', 'o', '10.0.0.2')
  const links = [connect(pc, 0, sw, 0), connect(sw, 1, other, 0)]
  sw.ports[0].status = 'learning'
  const result = stepSimulationTick([pc, sw, other], links, [frame(links[0], pc, createArpRequestPdu(pc, pc.ports[0].id, '10.0.0.2'))])
  assert.equal(result.newInFlightPackets.length, 0)
  assert.equal(result.packetDeliveries[0]?.status, 'dropped')
})

test('STP listening blocks data while learning records the source without forwarding it',()=>{
  const pc=device('pc','p','10.0.0.1'),sw=device('switch','s'),other=device('pc','o','10.0.0.2')
  const links=[connect(pc,0,sw,0),connect(sw,1,other,0)]
  Object.assign(sw.ports[0],{stpState:'listening',stpSinceTick:0})
  const listening=stepSimulationTick([pc,sw,other],links,[frame(links[0],pc,createArpRequestPdu(pc,pc.ports[0].id,'10.0.0.2'))],[],[],1)
  assert.equal(listening.packetDeliveries[0]?.status,'dropped')
  assert.match(listening.packetDeliveries[0]?.reason??'',/Spanning tree/)
  assert.equal(listening.updatedDevices.find(device=>device.id===sw.id)?.macTable.length,0)

  const learningSwitch=listening.updatedDevices.find(device=>device.id===sw.id)!
  Object.assign(learningSwitch.ports[0],{stpState:'learning',stpSinceTick:0,stpVlanStates:{'1':{state:'learning',sinceTick:0}}})
  const learning=stepSimulationTick([pc,learningSwitch,other],links,[frame(links[0],pc,createArpRequestPdu(pc,pc.ports[0].id,'10.0.0.2'))],[],[],1)
  assert.equal(learning.packetDeliveries[0]?.status,'dropped')
  assert.match(learning.packetDeliveries[0]?.reason??'',/learned the source MAC.*cannot forward data/)
  assert.ok(learning.updatedDevices.find(device=>device.id===sw.id)?.macTable.some(entry=>entry.macAddress===pc.ports[0].macAddress))
  assert.equal(learning.newInFlightPackets.length,0)
})

test('VLAN 10 broadcast stays out of VLAN 20 access ports', () => {
  const pc = device('pc', 'p', '10.0.0.1')
  const sw = device('switch', 's')
  const same = device('pc', 'a', '10.0.0.2')
  const other = device('pc', 'b', '10.0.0.3')
  const links = [connect(pc, 0, sw, 0), connect(sw, 1, same, 0), connect(sw, 2, other, 0)]
  sw.ports[0].vlan = 10
  sw.ports[1].vlan = 10
  sw.ports[2].vlan = 20
  const result = stepSimulationTick([pc, sw, same, other], links, [frame(links[0], pc, createArpRequestPdu(pc, pc.ports[0].id, '10.0.0.99'))])
  assert.deepEqual(result.newInFlightPackets.map(packet => packet.toDeviceId), [same.id])
  assert.equal(result.updatedDevices.find(d => d.id === sw.id)?.macTable[0].vlan, 10)
})

test('known unicast addressed to the ingress port is filtered', () => {
  const pc = device('pc', 'p', '10.0.0.1')
  const sw = device('switch', 's')
  const link = connect(pc, 0, sw, 0)
  const destMac = '02:00:00:00:ee:01'
  sw.macTable.push({ macAddress: destMac, portId: sw.ports[0].shortName, vlan: 1, age: 0 })
  const result = stepSimulationTick([pc, sw], [link], [frame(link, pc, createIcmpEchoPdu(pc, pc.ports[0].id, destMac, '10.0.0.2'))])
  assert.equal(result.newInFlightPackets.length, 0)
})

test('source MAC learning updates a moved station to its current ingress', () => {
  const pc = device('pc', 'p', '10.0.0.1')
  const sw = device('switch', 's')
  const link = connect(pc, 0, sw, 1)
  sw.macTable.push({ macAddress: pc.ports[0].macAddress, portId: sw.ports[0].shortName, vlan: 1, age: 90 })
  const result = stepSimulationTick([pc, sw], [link], [frame(link, pc, createArpRequestPdu(pc, pc.ports[0].id, '10.0.0.99'))])
  const entries = result.updatedDevices.find(d => d.id === sw.id)!.macTable.filter(entry => entry.macAddress === pc.ports[0].macAddress)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].portId, sw.ports[1].shortName)
  assert.equal(entries[0].age, 0)
})

test('switches age learned MAC entries after 300 seconds of simulated time',()=>{
 const sw=device('switch','aging-switch')
 const entry={macAddress:'02:00:00:00:aa:01',portId:sw.ports[0].shortName,vlan:1,age:0}
 Object.assign(entry,{lastSeenTick:0})
 sw.macTable=[entry]
 const beforeExpiry=stepSimulationTick([sw],[],[],[],[],4_999).updatedDevices[0]
 assert.equal(beforeExpiry.macTable.length,1)
 assert.equal(beforeExpiry.macTable[0].age,299)
 const expired=stepSimulationTick([beforeExpiry],[],[],[],[],5_000).updatedDevices[0]
 assert.equal(expired.macTable.length,0)
})

test('traffic refreshes a learned MAC age so active stations do not expire',()=>{
 const pc=device('pc','refresh-source','10.0.0.1'),sw=device('switch','refresh-switch'),link=connect(pc,0,sw,0)
 const entry={macAddress:pc.ports[0].macAddress,portId:sw.ports[0].shortName,vlan:1,age:299,linkId:link.id}
 Object.assign(entry,{lastSeenTick:0})
 sw.macTable=[entry]
 const refresh=stepSimulationTick([pc,sw],[link],[frame(link,pc,createArpRequestPdu(pc,pc.ports[0].id,'10.0.0.99'))],[],[],4_999)
 const learned=refresh.updatedDevices.find(device=>device.id===sw.id)!.macTable[0]
 assert.equal(learned.age,0)
 assert.equal((learned as typeof learned & {lastSeenTick?:number}).lastSeenTick,4_999)
 const beforeExpiry=stepSimulationTick(refresh.updatedDevices,[link],[],[],[],9_998).updatedDevices.find(device=>device.id===sw.id)!.macTable
 assert.equal(beforeExpiry.length,1)
 const expired=stepSimulationTick(refresh.updatedDevices,[link],[],[],[],9_999).updatedDevices.find(device=>device.id===sw.id)!.macTable
 assert.equal(expired.length,0)
})

test('router drops a transit IPv4 packet whose TTL expires', () => {
  const pc = device('pc', 'p', '10.0.0.1')
  const router = device('router', 'r', '10.0.0.254')
  const target = device('pc', 't', '10.0.1.2')
  router.ports[1].ipAddress = '10.0.1.254'
  const links = [connect(pc, 0, router, 0), connect(router, 1, target, 0)]
  router.routingTable.push({ network: '10.0.1.0', netmask: '255.255.255.0', nextHop: '0.0.0.0', interfaceName: router.ports[1].name, metric: 0, type: 'C' })
  const pdu = createIcmpEchoPdu(pc, pc.ports[0].id, router.ports[0].macAddress, '10.0.1.2')
  pdu.ttl = 1
  const result = stepSimulationTick([pc, router, target], links, [frame(links[0], pc, pdu)])
  assert.equal(result.newInFlightPackets.length, 0)
  assert.equal(result.packetDeliveries[0]?.status, 'dropped')
})

test('PC-switch-PC ARP resolution and echo exchange complete once', () => {
  const pc = device('pc', 'p', '10.0.0.1')
  const sw = device('switch', 's')
  const target = device('pc', 't', '10.0.0.2')
  const links = [connect(pc, 0, sw, 0), connect(sw, 1, target, 0)]
  let devices = [pc, sw, target]
  let packets = [frame(links[0], pc, createArpRequestPdu(pc, pc.ports[0].id, '10.0.0.2'))]
  const replies = new Set<string>()
  for (let tick = 0; tick < 150 && packets.length; tick++) {
    const result = stepSimulationTick(devices, links, packets)
    devices = result.updatedDevices
    packets = result.newInFlightPackets
    for (const packet of packets) if (packet.pdu.payload.icmpType === 'echo-reply') replies.add(packet.pdu.id)
  }
  assert.equal(packets.length, 0)
  assert.equal(replies.size, 1)
  assert.equal(devices.find(d => d.id === pc.id)?.arpTable.find(entry => entry.ipAddress === '10.0.0.2')?.macAddress, target.ports[0].macAddress)
})

test('simulation learning leaves the caller device tables unchanged', () => {
  const pc = device('pc', 'p', '10.0.0.1')
  const sw = device('switch', 's')
  const link = connect(pc, 0, sw, 0)
  const devices = [pc, sw]
  const before = structuredClone(devices)
  stepSimulationTick(devices, [link], [frame(link, pc, createArpRequestPdu(pc, pc.ports[0].id, '10.0.0.99'))])
  assert.deepEqual(devices, before)
})

test('ARP learning on an end device leaves the caller ARP table unchanged', () => {
  const source = device('pc', 'p', '10.0.0.1')
  const target = device('pc', 't', '10.0.0.2')
  const link = connect(source, 0, target, 0)
  const devices = [source, target]
  const before = structuredClone(devices)
  const result = stepSimulationTick(devices, [link], [frame(link, source, createArpRequestPdu(source, source.ports[0].id, '10.0.0.2'))])
  assert.deepEqual(devices, before)
  assert.equal(result.updatedDevices.find(d => d.id === target.id)?.arpTable.length, 1)
})

test('broadcast forwarding excludes console cables', () => {
  const source = device('pc', 'p', '10.0.0.1')
  const sw = device('switch', 's')
  const consoleHost = device('pc', 'c', '10.0.0.2')
  const links = [connect(source, 0, sw, 0), connect(sw, 1, consoleHost, 0)]
  links[1].type = 'console'
  const result = stepSimulationTick([source, sw, consoleHost], links, [frame(links[0], source, createArpRequestPdu(source, source.ports[0].id, '10.0.0.99'))])
  assert.equal(result.newInFlightPackets.length, 0)
})

for (const failure of ['sender admin down', 'sender link down', 'cable down', 'sender powered off'] as const) {
  test(`an in-flight frame is dropped when ${failure}`, () => {
    const source = device('pc', 'p', '10.0.0.1')
    const target = device('pc', 't', '10.0.0.2')
    const link = connect(source, 0, target, 0)
    const packet = frame(link, source, createArpRequestPdu(source, source.ports[0].id, '10.0.0.2'))
    if (failure === 'sender admin down') source.ports[0].adminStatus = 'down'
    if (failure === 'sender link down') source.ports[0].status = 'down'
    if (failure === 'cable down') link.status = 'down'
    if (failure === 'sender powered off') source.power = false
    const result = stepSimulationTick([source, target], [link], [packet])
    assert.equal(result.newInFlightPackets.length, 0)
    assert.equal(result.packetDeliveries[0]?.status, 'dropped')
    assert.equal(result.updatedDevices.find(d => d.id === target.id)?.arpTable.length, 0)
  })
}

test('a host ignores an ARP unicast reply addressed to a different station', () => {
  const source = device('pc', 'p', '10.0.0.1')
  const target = device('pc', 't', '10.0.0.2')
  const link = connect(source, 0, target, 0)
  const pdu = createArpRequestPdu(source, source.ports[0].id, '10.0.0.3')
  pdu.destMac = '02:00:00:00:ee:01'
  pdu.payload.arpType = 'reply'
  pdu.payload.targetMac = pdu.destMac
  const result = stepSimulationTick([source, target], [link], [frame(link, source, pdu)])
  assert.equal(result.newInFlightPackets.length, 0)
  assert.equal(result.updatedDevices.find(d => d.id === target.id)?.arpTable.length, 0)
})

function routedFixture() {
  const source = device('pc', 'p', '10.0.0.1')
  const router = device('router', 'r', '10.0.0.254')
  const target = device('pc', 't', '10.0.1.2')
  router.ports[1].ipAddress = '10.0.1.254'
  const links = [connect(source, 0, router, 0), connect(router, 1, target, 0)]
  router.routingTable.push(
    { network: '10.0.0.0', netmask: '255.255.255.0', nextHop: '0.0.0.0', interfaceName: router.ports[0].name, metric: 0, type: 'C' },
    { network: '10.0.1.0', netmask: '255.255.255.0', nextHop: '0.0.0.0', interfaceName: router.ports[1].name, metric: 0, type: 'C' },
  )
  router.arpTable.push(
    { ipAddress: '10.0.0.1', macAddress: source.ports[0].macAddress, interfaceName: router.ports[0].name, age: 0 },
    { ipAddress: '10.0.1.2', macAddress: target.ports[0].macAddress, interfaceName: router.ports[1].name, age: 0 },
  )
  return { source, router, target, links }
}

test('router forwards a transit packet with the cached next-hop unicast MAC', () => {
  const { source, router, target, links } = routedFixture()
  const pdu = createIcmpEchoPdu(source, source.ports[0].id, router.ports[0].macAddress, '10.0.1.2')
  const result = stepSimulationTick([source, router, target], links, [frame(links[0], source, pdu)])
  assert.equal(result.newInFlightPackets.length, 1)
  assert.equal(result.newInFlightPackets[0].toDeviceId, target.id)
  assert.equal(result.newInFlightPackets[0].pdu.destMac, target.ports[0].macAddress)
  assert.equal(result.newInFlightPackets[0].pdu.ttl, pdu.ttl - 1)
})

test('router forwards an echo reply through its return route', () => {
  const { source, router, target, links } = routedFixture()
  const pdu = createIcmpEchoPdu(target, target.ports[0].id, router.ports[1].macAddress, '10.0.0.1')
  pdu.payload.icmpType = 'echo-reply'
  const result = stepSimulationTick([source, router, target], links, [frame(links[1], target, pdu)])
  assert.equal(result.newInFlightPackets.length, 1)
  assert.equal(result.newInFlightPackets[0].toDeviceId, source.id)
  assert.equal(result.newInFlightPackets[0].pdu.destMac, source.ports[0].macAddress)
  assert.equal(result.newInFlightPackets[0].pdu.payload.icmpType, 'echo-reply')
})

test('idle and animation-only ticks retain the device array identity', () => {
  const source = device('pc', 'p', '10.0.0.1')
  const target = device('pc', 't', '10.0.0.2')
  const link = connect(source, 0, target, 0)
  const devices = [source, target]
  assert.equal(stepSimulationTick(devices, [link], []).updatedDevices, devices)
  const packet = frame(link, source, createArpRequestPdu(source, source.ports[0].id, '10.0.0.2'), 0)
  const result = stepSimulationTick(devices, [link], [packet])
  assert.equal(result.updatedDevices, devices)
  assert.equal(result.newInFlightPackets.length, 1)
  assert.equal(result.newInFlightPackets[0].progress, 0.25)
})

test('an overloaded animation queue drops excess frames at the global hard cap', () => {
  const source = device('pc', 'p', '10.0.0.1')
  const target = device('pc', 't', '10.0.0.2')
  const link = connect(source, 0, target, 0)
  const pdu = createArpRequestPdu(source, source.ports[0].id, '10.0.0.2')
  const packets = Array.from({ length: 5000 }, (_, index) => ({ ...frame(link, source, pdu, 0), id: `overload-${index}` }))
  const result = stepSimulationTick([source, target], [link], packets)
  assert.equal(result.newInFlightPackets.length, MAX_TOPOLOGY_PACKET_QUEUE)
  assert.equal(result.queueLimitReached, true)
  assert.ok(result.discardedPackets >= packets.length - MAX_TOPOLOGY_PACKET_QUEUE)
})

function settle(devices: NetworkDevice[], links: NetworkLink[], initial: InFlightPacket) {
  let packets = [initial]
  const generated = new Map<string, InFlightPacket>()
  const deliveries: Array<{ packet: InFlightPacket; status: string }> = []
  for (let tick = 0; tick < 150 && packets.length; tick++) {
    const arriving = new Map(packets.map(packet => [packet.id, packet]))
    const result = stepSimulationTick(devices, links, packets)
    for (const delivery of result.packetDeliveries) {
      const packet = arriving.get(delivery.packetId)
      if (packet) deliveries.push({ packet, status: delivery.status })
    }
    devices = result.updatedDevices
    packets = result.newInFlightPackets
    for (const packet of packets) generated.set(packet.id, packet)
  }
  assert.equal(packets.length, 0, 'Exchange did not finish in 150 ticks')
  return { devices, generated: [...generated.values()], deliveries }
}

test('a remote-subnet ping resolves its gateway and completes through a router', () => {
  const { source, router, target, links } = routedFixture()
  router.arpTable = []
  router.ports[1].subnetMask = '255.255.255.0'
  source.config.defaultGateway = '10.0.0.254'
  target.config.defaultGateway = '10.0.1.254'
  const devices = [source, router, target]
  const initial = createPingPacket(source, devices, links, '10.0.1.2')!
  assert.ok(initial)
  assert.equal(initial.pdu.protocol, 'ARP')
  assert.equal(initial.pdu.payload.targetIp, '10.0.0.254')
  const result = settle(devices, links, initial)
  const echoReplies = result.deliveries.filter(({ packet, status }) => status === 'delivered' && packet.toDeviceId === source.id && packet.pdu.payload.icmpType === 'echo-reply')
  assert.equal(echoReplies.length, 1)
  assert.equal(echoReplies[0].packet.pdu.sourceIp, '10.0.1.2')
  assert.equal(result.devices.find(d => d.id === router.id)?.arpTable.find(entry => entry.ipAddress === '10.0.1.2')?.macAddress, target.ports[0].macAddress)
})

test('parallel EtherChannel members send one broadcast frame to their peer', () => {
  const source = device('pc', 'p', '10.0.0.1')
  const a = device('switch', 'a')
  const b = device('switch', 'b')
  const target = device('pc', 't', '10.0.0.2')
  const links = [connect(source, 0, a, 0), connect(a, 1, b, 0), connect(a, 2, b, 1), connect(b, 2, target, 0)]
  links[1].isEtherChannel = true
  links[2].isEtherChannel = true
  links[1].channelLabel = links[2].channelLabel = 'Po1'
  const initial = frame(links[0], source, createArpRequestPdu(source, source.ports[0].id, '10.0.0.99'))
  const first = stepSimulationTick([source, a, b, target], links, [initial])
  assert.equal(first.newInFlightPackets.filter(packet => packet.toDeviceId === b.id && packet.pdu.protocol !== 'STP').length, 1)
  const result = settle([source, a, b, target], links, initial)
  assert.equal(result.deliveries.filter(({ packet }) => packet.toDeviceId === target.id).length, 1)
})

test('a VLAN 10 trunk preserves its tag across switches and excludes VLAN 20', () => {
  const source = device('pc', 'p', '10.0.0.1')
  const a = device('switch', 'a')
  const b = device('switch', 'b')
  const target = device('pc', 't', '10.0.0.2')
  const excluded = device('pc', 'e', '10.0.0.3')
  const links = [connect(source, 0, a, 0), connect(a, 1, b, 0), connect(b, 1, target, 0), connect(b, 2, excluded, 0)]
  a.ports[0].vlan = b.ports[1].vlan = 10
  b.ports[2].vlan = 20
  a.ports[1].portMode = b.ports[0].portMode = 'trunk'
  a.ports[1].allowedVlans = b.ports[0].allowedVlans = [10]
  const initial = frame(links[0], source, createArpRequestPdu(source, source.ports[0].id, '10.0.0.99'))
  const result = settle([source, a, b, target, excluded], links, initial)
  assert.ok(result.generated.some(packet => packet.linkId === links[1].id && packet.vlanId === 10))
  assert.equal(result.deliveries.filter(({ packet }) => packet.toDeviceId === excluded.id).length, 0)
  assert.equal(result.deliveries.filter(({ packet }) => packet.toDeviceId === target.id).length, 1)
  const denied = frame(links[1], a, initial.pdu)
  denied.vlanId = 20
  const blocked = stepSimulationTick(result.devices, links, [denied])
  assert.equal(blocked.newInFlightPackets.length, 0)
  assert.equal(blocked.packetDeliveries[0]?.status, 'dropped')
})

test('a trunk forwards only VLANs whose per-VLAN STP state is forwarding',()=>{
 const send=(vlan:number)=>{
  const source=device('pc',`source-${vlan}`,'10.0.0.1'),first=device('switch',`first-${vlan}`),second=device('switch',`second-${vlan}`)
  const firstAccess=first.ports[0],firstTrunk=first.ports[1],secondTrunk=second.ports[0]
  Object.assign(firstAccess,{portMode:'access',vlan})
  Object.assign(firstTrunk,{portMode:'trunk',nativeVlan:10,allowedVlans:[10,20],stpVlanStates:{'10':{state:'listening',sinceTick:0},'20':{state:'forwarding',sinceTick:0}}})
  Object.assign(secondTrunk,{portMode:'trunk',nativeVlan:10,allowedVlans:[10,20]})
  const sourceLink=connect(source,0,first,0),trunkLink=connect(first,1,second,0)
  const request=createArpRequestPdu(source,source.ports[0].id,'10.0.0.99')
  const result=stepSimulationTick([source,first,second],[sourceLink,trunkLink],[frame(sourceLink,source,request)],[],[],1)
  return {result,secondId:second.id}
 }
 const vlanTen=send(10),vlanTwenty=send(20)
 assert.equal(vlanTen.result.newInFlightPackets.some(packet=>packet.toDeviceId===vlanTen.secondId&&packet.pdu.protocol==='ARP'),false)
 assert.equal(vlanTwenty.result.newInFlightPackets.filter(packet=>packet.toDeviceId===vlanTwenty.secondId&&packet.pdu.protocol==='ARP').length,1)
})

test('a second ping uses learned unicast forwarding without packet duplication', () => {
  const source = device('pc', 'p', '10.0.0.1')
  const sw = device('switch', 's')
  const target = device('pc', 't', '10.0.0.2')
  const unrelated = device('pc', 'u', '10.0.0.3')
  const links = [connect(source, 0, sw, 0), connect(sw, 1, target, 0), connect(sw, 2, unrelated, 0)]
  const devices = [source, sw, target, unrelated]
  const first = settle(devices, links, createPingPacket(source, devices, links, '10.0.0.2')!)
  const learnedSource = first.devices.find(d => d.id === source.id)!
  const secondPacket = createPingPacket(learnedSource, first.devices, links, '10.0.0.2')!
  assert.equal(secondPacket.pdu.protocol, 'ICMP')
  const second = settle(first.devices, links, secondPacket)
  assert.equal(second.deliveries.length, 4)
  assert.equal(second.deliveries.filter(({ packet }) => packet.toDeviceId === unrelated.id).length, 0)
  assert.equal(second.deliveries.filter(({ packet }) => packet.toDeviceId === source.id && packet.pdu.payload.icmpType === 'echo-reply').length, 1)
})

test('ping selects the interface in the destination subnet instead of the first configured port', () => {
  const source = device('server', 's', '10.0.0.1')
  const firstPeer = device('pc', 'f', '10.0.0.2')
  const target = device('pc', 't', '10.0.1.2')
  source.ports[1].ipAddress = '10.0.1.1'
  source.ports[1].subnetMask = '255.255.255.0'
  const links = [connect(source, 0, firstPeer, 0), connect(source, 1, target, 0)]
  const packet = createPingPacket(source, [source, firstPeer, target], links, '10.0.1.2')!
  assert.equal(packet.linkId, links[1].id)
  assert.equal(packet.pdu.sourceIp, '10.0.1.1')
  assert.equal(packet.pdu.payload.targetIp, '10.0.1.2')
})
