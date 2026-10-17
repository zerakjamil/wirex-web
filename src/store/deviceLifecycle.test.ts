import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice, createPort } from '../simulator/deviceFactory'
import type { NetworkDevice, NetworkLink } from '../types/network'
import { useNetworkStore } from './networkStore'

function connectedPair(learning = false) {
  const source = createDevice('switch', 0, 0)
  const peer = createDevice('switch', 100, 0)
  source.id = 'source'
  peer.id = 'peer'
  const status = learning ? 'learning' : 'up'
  const link: NetworkLink = {
    id: 'cable', type: 'straight', fromDeviceId: source.id, fromPortId: source.ports[0].id,
    toDeviceId: peer.id, toPortId: peer.ports[0].id, status,
  }
  Object.assign(source.ports[0], { status, connectedDeviceId: peer.id, connectedPortId: peer.ports[0].id, connectedLinkId: link.id })
  Object.assign(peer.ports[0], { status, connectedDeviceId: source.id, connectedPortId: source.ports[0].id, connectedLinkId: link.id })
  return { source, peer, link }
}

function load(devices: NetworkDevice[], links: NetworkLink[]) {
  useNetworkStore.setState({ devices, links, inFlightPackets: [], selectedDeviceId: null, selectedLinkId: null, connectingSource: null, simulationTick:0, simulationMode:'realtime', simulationPlaying:false })
}

function wirelessModuleFixture(customId: boolean) {
  const laptop = createDevice('laptop', 0, 0)
  laptop.id = 'laptop'
  laptop.power = false
  laptop.modules = ['WPC300N']
  const wlan = createPort('Wireless0', 'Wlan0', 'wireless', 'up')
  if (customId) wlan.id = 'laptop-wireless-port'
  laptop.ports = [wlan]
  const ap = createDevice('wireless', 100, 0, 'AccessPoint-PT')
  ap.id = 'ap'
  const apPort = ap.ports.find(port => port.type === 'wireless')!
  const link: NetworkLink = {
    id: 'wireless-cable', type: 'wireless', fromDeviceId: ap.id, fromPortId: apPort.id,
    toDeviceId: laptop.id, toPortId: wlan.id, status: 'down',
  }
  Object.assign(wlan, { connectedLinkId: link.id, connectedDeviceId: ap.id, connectedPortId: apPort.id, status: 'down' })
  Object.assign(apPort, { connectedLinkId: link.id, connectedDeviceId: laptop.id, connectedPortId: wlan.id, status: 'down' })
  return { laptop, ap, apPort, link }
}

test('removing a wireless module clears connection references on the AP peer', () => {
  const { laptop, ap, apPort, link } = wirelessModuleFixture(false)
  load([laptop, ap], [link])
  assert.equal(useNetworkStore.getState().removeDeviceModule(laptop.id, 0).success, true)
  const state = useNetworkStore.getState()
  assert.equal(state.links.length, 0)
  const peerPort = state.devices.find(device => device.id === ap.id)!.ports.find(port => port.id === apPort.id)!
  assert.equal(peerPort.connectedLinkId, undefined)
  assert.equal(peerPort.connectedDeviceId, undefined)
  assert.equal(peerPort.connectedPortId, undefined)
})

test('removing a module deletes its cable when port ID differs from the display name', () => {
  const { laptop, ap, link } = wirelessModuleFixture(true)
  load([laptop, ap], [link])
  assert.equal(useNetworkStore.getState().removeDeviceModule(laptop.id, 0).success, true)
  const state = useNetworkStore.getState()
  assert.equal(state.devices.find(device => device.id === laptop.id)!.ports.length, 0)
  assert.equal(state.links.length, 0, 'Module removal left an orphan cable to a deleted port')
})

test('powering off a device brings its connected peer port down', () => {
  const { source, peer, link } = connectedPair()
  load([source, peer], [link])
  useNetworkStore.getState().toggleDevicePower(source.id)
  const state = useNetworkStore.getState()
  assert.equal(state.links[0].status, 'down')
  assert.equal(state.devices.find(device => device.id === peer.id)!.ports[0].status, 'down')
})

test('a power cycle cannot bring a cable up against an administratively disabled peer', () => {
  const { source, peer, link } = connectedPair()
  peer.ports[0].adminStatus = 'down'
  peer.ports[0].status = 'down'
  link.status = 'down'
  load([source, peer], [link])
  useNetworkStore.getState().toggleDevicePower(source.id)
  useNetworkStore.getState().toggleDevicePower(source.id)
  const state = useNetworkStore.getState()
  assert.equal(state.links[0].status, 'down')
  assert.equal(state.devices.find(device => device.id === peer.id)!.ports[0].adminStatus, 'down')
})

test('power cycling a switch link leaves it physical up and restarts STP listening', () => {
  const { source, peer, link } = connectedPair(true)
  load([source, peer], [link])
  useNetworkStore.getState().toggleDevicePower(source.id)
  useNetworkStore.getState().toggleDevicePower(source.id)
  const state = useNetworkStore.getState()
  assert.equal(state.links[0].status, 'up')
  assert.equal(state.devices.find(device => device.id === source.id)!.ports[0].stpState,'listening')
  assert.equal(state.devices.find(device => device.id === peer.id)!.ports[0].stpState,'listening')
})

test('new switch cables stay physically up while STP advances on simulation ticks',()=>{
  const source=createDevice('switch',0,0),peer=createDevice('switch',100,0)
  source.id='new-switch-a';peer.id='new-switch-b'
  load([source,peer],[])
  assert.equal(useNetworkStore.getState().connectPorts(source.id,source.ports[0].id,peer.id,peer.ports[0].id,'crossover'),true)
  let state=useNetworkStore.getState()
  assert.equal(state.links[0].status,'up')
  assert.equal(state.devices.find(device=>device.id===source.id)!.ports[0].stpState,'listening')
  for(let tick=0;tick<250;tick++)useNetworkStore.getState().tickSimulation()
  assert.equal(useNetworkStore.getState().devices.find(device=>device.id===source.id)!.ports[0].stpState,'learning')
  for(let tick=0;tick<250;tick++)useNetworkStore.getState().tickSimulation()
  state=useNetworkStore.getState()
  assert.equal(state.links[0].status,'up')
  assert.equal(state.devices.find(device=>device.id===source.id)!.ports[0].stpState,'forwarding')
})

test('loading a saved topology clears per-VLAN STP timers so ports start from a clean state',()=>{
 const sw=createDevice('switch',0,0)
 sw.id='restored-switch'
 Object.assign(sw.ports[0],{stpState:'learning',stpSinceTick:300,stpVlanStates:{'10':{state:'learning',sinceTick:300},'20':{state:'forwarding',sinceTick:80}}})
 useNetworkStore.getState().loadLab([sw],[])
 const restored=useNetworkStore.getState().devices[0].ports[0]
 assert.equal(restored.stpState,undefined)
 assert.equal(restored.stpSinceTick,undefined)
 assert.equal(restored.stpVlanStates,undefined)
})

test('idle realtime simulation advances until learned MAC entries expire',()=>{
 const sw=createDevice('switch',0,0)
 sw.id='aging-switch'
 sw.macTable=[{macAddress:'02:00:00:00:aa:01',portId:sw.ports[0].shortName,vlan:1,age:0,lastSeenTick:0}]
 load([sw],[])
 useNetworkStore.getState().tickSimulation()
 assert.equal(useNetworkStore.getState().simulationTick,1)
 assert.equal(useNetworkStore.getState().devices[0].macTable.length,1)
})

test('loading a workspace preserves MAC age but clears its transient aging tick',()=>{
 const sw=createDevice('switch',0,0)
 sw.macTable=[{macAddress:'02:00:00:00:aa:02',portId:sw.ports[0].shortName,vlan:1,age:42,lastSeenTick:900}]
 useNetworkStore.getState().loadLab([sw],[])
 assert.deepEqual(useNetworkStore.getState().devices[0].macTable,[{macAddress:'02:00:00:00:aa:02',portId:sw.ports[0].shortName,vlan:1,age:42}])
})

test('enabling one endpoint does not bring a cable up when the peer is administratively down', () => {
  const { source, peer, link } = connectedPair()
  source.ports[0].adminStatus = peer.ports[0].adminStatus = 'down'
  source.ports[0].status = peer.ports[0].status = 'down'
  link.status = 'down'
  load([source, peer], [link])
  useNetworkStore.getState().updatePortConfig(source.id, source.ports[0].id, { adminStatus: 'up' })
  assert.equal(useNetworkStore.getState().links[0].status, 'down')
})

test('editing an enabled port cannot bring a cable up to a powered-off peer', () => {
  const { source, peer, link } = connectedPair()
  peer.power = false
  source.ports[0].status = peer.ports[0].status = 'down'
  link.status = 'down'
  load([source, peer], [link])
  useNetworkStore.getState().updatePortConfig(source.id, source.ports[0].id, { description: 'Student uplink' })
  assert.equal(useNetworkStore.getState().links[0].status, 'down')
})
