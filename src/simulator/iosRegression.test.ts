import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from './deviceFactory'
import { createPingPacket } from './engine'
import { useNetworkStore } from '../store/networkStore'
import type { NetworkDevice, NetworkLink } from '../types/network'

function loadSwitch() {
  const device = createDevice('switch', 0, 0)
  useNetworkStore.getState().loadLab([device], [])
  command(device.id, 'enable', 'configure terminal')
  return device.id
}

function command(id: string, ...commands: string[]) {
  return commands.map(line => useNetworkStore.getState().executeIosCommand(id, line))
}

function current(id: string): NetworkDevice {
  return useNetworkStore.getState().devices.find(device => device.id === id)!
}

test('interface range shuts down exactly Fa0/1 through Fa0/4', () => {
  const id = loadSwitch()
  command(id, 'interface range fa0/1 - 4', 'shutdown')
  assert.deepEqual(current(id).ports.filter(port => port.adminStatus === 'down').map(port => port.shortName),
    ['Fa0/1', 'Fa0/2', 'Fa0/3', 'Fa0/4'])
})

test('an interface range starting after the first port selects only that range', () => {
  const id = loadSwitch()
  command(id, 'interface range fa0/7 - 9', 'switchport access vlan 20')
  assert.deepEqual(current(id).ports.filter(port => port.vlan === 20).map(port => port.shortName),
    ['Fa0/7', 'Fa0/8', 'Fa0/9'])
})

for (const range of ['fa0/4 - 1', 'fa0/1 - 99', 'fa9/1 - 4', 'fa0/1 - banana', '']) {
  test(`invalid interface range ${JSON.stringify(range)} leaves port configuration untouched`, () => {
    const id = loadSwitch()
    const before = structuredClone(current(id).ports)
    const [output] = command(id, `interface range ${range}`)
    assert.match(output, /%/)
    assert.equal(current(id).currentCliMode, 'config')
    command(id, 'shutdown')
    assert.deepEqual(current(id).ports, before)
  })
}

test('exit clears interface range context before selecting a single interface', () => {
  const id = loadSwitch()
  command(id, 'interface range fa0/1 - 4', 'exit')
  assert.equal(current(id).activeRangePorts, undefined)
  assert.equal(current(id).activeInterface, undefined)
  command(id, 'interface fa0/8', 'shutdown')
  assert.deepEqual(current(id).ports.filter(port => port.adminStatus === 'down').map(port => port.shortName), ['Fa0/8'])
})

test('single interface selection replaces any stale range selection', () => {
  const id = loadSwitch()
  const device = current(id)
  useNetworkStore.setState({ devices: [{ ...device, activeRangePorts: device.ports.slice(0, 4).map(port => port.id) }] })
  command(id, 'interface fa0/8', 'shutdown')
  assert.deepEqual(current(id).ports.filter(port => port.adminStatus === 'down').map(port => port.shortName), ['Fa0/8'])
})

test('IOS SNMP community commands configure read-only access, show it, and remove it', () => {
  const router = createDevice('router', 0, 0)
  useNetworkStore.getState().loadLab([router], [])
  const routerId = router.id
  command(routerId, 'enable', 'configure terminal')
  const [configured] = command(routerId, 'snmp-server community classroom ro')
  assert.match(configured, /SNMP community classroom configured as read-only/i)
  assert.deepEqual(current(routerId).config.snmpCommunities, ['classroom'])
  const [show] = command(routerId, 'do show snmp')
  assert.match(show, /SNMP agent enabled[\s\S]*classroom[\s\S]*read-only/i)
  const [running] = command(routerId, 'do show running-config')
  assert.match(running, /snmp-server community classroom ro/)
  const [removed] = command(routerId, 'no snmp-server community classroom')
  assert.match(removed, /removed/i)
  assert.deepEqual(current(routerId).config.snmpCommunities, [])
})

test('IOS SNMP configuration rejects write access and malformed communities', () => {
  const sw = createDevice('switch', 0, 0)
  useNetworkStore.getState().loadLab([sw], [])
  const switchId = sw.id
  command(switchId, 'enable', 'configure terminal')
  const [rw] = command(switchId, 'snmp-server community classroom rw')
  assert.match(rw, /read-only.*not support.*write|write.*not support/i)
  const [invalid] = command(switchId, 'snmp-server community bad community ro')
  assert.match(invalid, /Use snmp-server community/i)
  assert.deepEqual(current(switchId).config.snmpCommunities, undefined)
})

test('IOS configures an HSRP group on a routed interface and persists its interface commands',()=>{
  const router=createDevice('router',0,0,'2811')
  useNetworkStore.getState().loadLab([router],[])
  command(router.id,'enable','configure terminal','interface fastethernet0/0')
  assert.equal(command(router.id,'standby 10 ip 192.0.2.1')[0],'')
  assert.equal(command(router.id,'standby 10 priority 120')[0],'')
  assert.equal(command(router.id,'standby 10 preempt')[0],'')
  const port=current(router.id).ports.find(item=>item.shortName==='Fa0/0')!
  assert.deepEqual(port.hsrpGroups,[{group:10,virtualIp:'192.0.2.1',priority:120,preempt:true}])
  assert.match(command(router.id,'do show running-config')[0],/interface FastEthernet0\/0[\s\S]*standby 10 ip 192\.0\.2\.1[\s\S]*standby 10 priority 120[\s\S]*standby 10 preempt/)
  assert.equal(command(router.id,'no standby 10 preempt')[0],'')
  assert.equal(current(router.id).ports.find(item=>item.shortName==='Fa0/0')?.hsrpGroups?.[0].preempt,undefined)
  assert.equal(command(router.id,'no standby 10 ip')[0],'')
  assert.equal(command(router.id,'no standby 10 priority')[0],'')
  assert.equal(current(router.id).ports.find(item=>item.shortName==='Fa0/0')?.hsrpGroups?.length,0)
})

test('IOS rejects invalid HSRP group, priority, address, and unsupported delay syntax without changing state',()=>{
  const router=createDevice('router',0,0,'2811')
  useNetworkStore.getState().loadLab([router],[])
  command(router.id,'enable','configure terminal','interface fastethernet0/0')
  for(const line of ['standby 256 ip 192.0.2.1','standby 1 ip 999.0.0.1','standby 1 priority -1','standby 1 priority 256','standby 1 preempt delay minimum 30']){
    assert.match(command(router.id,line)[0],/%/)
    assert.deepEqual(current(router.id).ports.find(item=>item.shortName==='Fa0/0')?.hsrpGroups??[],[])
  }
})

test('end clears interface range context before returning to configuration mode', () => {
  const id = loadSwitch()
  command(id, 'interface range fa0/1 - 4', 'end')
  assert.equal(current(id).activeRangePorts, undefined)
  command(id, 'configure terminal', 'interface fa0/8', 'shutdown')
  assert.deepEqual(current(id).ports.filter(port => port.adminStatus === 'down').map(port => port.shortName), ['Fa0/8'])
})

test('IOS next-hop static route selects the interface reaching the next-hop subnet', () => {
  const router = createDevice('router', 0, 0)
  const peer = createDevice('router', 100, 0)
  const sourcePort = router.ports[1]
  const peerPort = peer.ports[0]
  const link: NetworkLink = {
    id: 'static-next-hop', type: 'straight', status: 'up',
    fromDeviceId: router.id, fromPortId: sourcePort.id,
    toDeviceId: peer.id, toPortId: peerPort.id,
  }
  Object.assign(sourcePort, { connectedLinkId: link.id, connectedDeviceId: peer.id, connectedPortId: peerPort.id })
  Object.assign(peerPort, {
    connectedLinkId: link.id, connectedDeviceId: router.id, connectedPortId: sourcePort.id,
    ipAddress: '10.0.1.2', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up',
  })
  useNetworkStore.getState().loadLab([router, peer], [link])
  command(router.id, 'enable', 'configure terminal', `interface ${sourcePort.shortName}`,
    'ip address 10.0.1.1 255.255.255.0', 'no shutdown', 'exit',
    'ip route 192.168.50.0 255.255.255.0 10.0.1.2')
  const state = useNetworkStore.getState()
  const packet = createPingPacket(current(router.id), state.devices, state.links, '192.168.50.10')
  assert.ok(packet, 'Static route configured with a next-hop must be usable without an explicit interface name')
  assert.equal(packet.linkId, link.id)
  assert.equal(packet.pdu.sourceIp, '10.0.1.1')
  assert.equal(packet.pdu.payload.targetIp, '10.0.1.2')
  assert.equal(packet.pdu.payload.pingTargetIp, '192.168.50.10')
})

function loadConfiguredRouterPair() {
  const router = createDevice('router', 0, 0)
  const peer = createDevice('router', 100, 0)
  const port = router.ports[0]
  const peerPort = peer.ports[0]
  const link: NetworkLink = {
    id: 'connected-ios', type: 'straight', status: 'up',
    fromDeviceId: router.id, fromPortId: port.id,
    toDeviceId: peer.id, toPortId: peerPort.id,
  }
  Object.assign(port, { connectedLinkId: link.id, connectedDeviceId: peer.id, connectedPortId: peerPort.id })
  Object.assign(peerPort, {
    connectedLinkId: link.id, connectedDeviceId: router.id, connectedPortId: port.id,
    ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', adminStatus: 'up', status: 'up',
  })
  useNetworkStore.getState().loadLab([router, peer], [link])
  command(router.id, 'enable', 'configure terminal', `interface ${port.shortName}`,
    'ip address 10.0.0.1 255.255.255.0', 'no shutdown')
  return { id: router.id, port, link }
}

test('IOS configured connected route ARPs for the destination IP, not the literal connected', () => {
  const { id, link } = loadConfiguredRouterPair()
  const state = useNetworkStore.getState()
  const packet = createPingPacket(current(id), state.devices, state.links, '10.0.0.2')
  assert.ok(packet)
  assert.equal(packet.linkId, link.id)
  assert.equal(packet.pdu.payload.targetIp, '10.0.0.2')
})

test('reassigning an interface IP replaces its previous connected route', () => {
  const { id, port } = loadConfiguredRouterPair()
  command(id, 'ip address 10.0.5.1 255.255.255.0')
  const routes = current(id).routingTable.filter(route => route.type === 'C' && route.interfaceName === port.name)
  assert.equal(routes.length, 1)
  assert.equal(routes[0].network, '10.0.5.0')
  assert.equal(current(id).ports.find(p => p.id === port.id)?.ipAddress, '10.0.5.1')
})

test('no ip address removes its interface connected route and IP configuration', () => {
  const { id, port } = loadConfiguredRouterPair()
  command(id, 'no ip address')
  assert.equal(current(id).routingTable.some(route => route.type === 'C' && route.interfaceName === port.name), false)
  assert.ok(!current(id).ports.find(p => p.id === port.id)?.ipAddress)
  assert.ok(!current(id).ports.find(p => p.id === port.id)?.subnetMask)
})

test('do ping announces the one echo actually queued by the simulator', () => {
  const { id } = loadConfiguredRouterPair()
  const [output] = command(id, 'do ping 10.0.0.2')
  assert.match(output, /Sending (?:one|1).*ICMP Echo/i)
  assert.equal(useNetworkStore.getState().inFlightPackets.length, 1)
})

for (const mode of ['user', 'priv'] as const) {
  test(`${mode} traceroute reports its unimplemented state without fabricating successful hops`, () => {
    const router = createDevice('router', 0, 0)
    useNetworkStore.getState().loadLab([router], [])
    if (mode === 'priv') command(router.id, 'enable')
    const [output] = command(router.id, 'traceroute 192.0.2.42')
    assert.doesNotMatch(output, /Trace complete|<1 ms/)
    assert.match(output, /not implemented|not supported|unavailable/i)
    assert.equal(useNetworkStore.getState().inFlightPackets.length, 0)
  })
}

test('router supports vlan creation, forgiving naming, and do show vlan variants', () => {
  const router = createDevice('router', 0, 0)
  useNetworkStore.getState().loadLab([router], [])
  command(router.id, 'enable', 'configure terminal', 'vlan 10')
  assert.equal(current(router.id).currentCliMode, 'config-vlan')

  // Set name to zerak
  command(router.id, 'name zerak')
  const vlan10 = current(router.id).config.vlans?.find(v => v.id === 10)
  assert.ok(vlan10, 'VLAN 10 should be created on router')
  assert.equal(vlan10.name, 'zerak')

  // Test do show vlan
  const [doShowVlan] = command(router.id, 'do show vlan')
  assert.match(doShowVlan, /10\s+zerak\s+active/)

  // Test forgiving multi-token name: name name engineering
  command(router.id, 'name name engineering')
  const vlan10Updated = current(router.id).config.vlans?.find(v => v.id === 10)
  assert.equal(vlan10Updated?.name, 'engineering')

  // Test do show vlan brief
  const [doShowVlanBrief] = command(router.id, 'do show vlan brief')
  assert.match(doShowVlanBrief, /10\s+engineering\s+active/)

  // Test do show vlan id 10
  const [doShowVlanId] = command(router.id, 'do show vlan id 10')
  assert.match(doShowVlanId, /10\s+engineering\s+active/)

  // Test do show vlan name engineering
  const [doShowVlanName] = command(router.id, 'do show vlan name engineering')
  assert.match(doShowVlanName, /10\s+engineering\s+active/)

  // Test inline vlan naming in config mode
  command(router.id, 'exit', 'vlan 20 name sales')
  const vlan20 = current(router.id).config.vlans?.find(v => v.id === 20)
  assert.ok(vlan20, 'VLAN 20 should be created via inline command')
  assert.equal(vlan20.name, 'sales')

  // Test do show vlan summary
  const [summaryOut] = command(router.id, 'do show vlan summary')
  assert.match(summaryOut, /Existing VLANs/i)

  // Test router Layer 3 SVI: interface vlan 10
  command(router.id, 'interface vlan 10', 'ip address 192.168.10.1 255.255.255.0', 'no shutdown')
  const sviPort = current(router.id).ports.find(p => p.name.toLowerCase() === 'vlan10' || p.shortName.toLowerCase() === 'vl10')
  assert.ok(sviPort, 'Router should create SVI interface Vlan10')
  assert.equal(sviPort.ipAddress, '192.168.10.1')
  assert.equal(sviPort.adminStatus, 'up')
})

