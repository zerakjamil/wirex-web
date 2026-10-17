import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from './deviceFactory'
import { simulationHistoryLimitFor, useNetworkStore } from '../store/networkStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import { PACKET_PROTOCOLS } from '../types/network'
import type { NetworkDevice, NetworkLink, NetworkPort } from '../types/network'

function connect(a: NetworkDevice, aPortIndex: number, b: NetworkDevice, bPortIndex: number): NetworkLink {
  const aPort = a.ports[aPortIndex]
  const bPort = b.ports[bPortIndex]
  const link: NetworkLink = { id: `${a.id}-${aPort.id}-${b.id}-${bPort.id}`, type: 'straight', fromDeviceId: a.id, fromPortId: aPort.id, toDeviceId: b.id, toPortId: bPort.id, status: 'up' }
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

function makeLab() {
  const pc1 = createDevice('pc', 0, 0, 'PC-PT'); pc1.name = 'PC1'
  const sw = createDevice('switch', 0, 0, '2960-24TT'); sw.name = 'SW1'
  const pc2 = createDevice('pc', 0, 0, 'PC-PT'); pc2.name = 'PC2'
  sw.ports.forEach(port => { port.portfast = true; port.adminStatus = 'up'; port.status = 'up' })
  addressPort(pc1, pc1.ports[0], '192.168.0.1')
  addressPort(pc2, pc2.ports[0], '192.168.0.2')
  const links = [connect(pc1, 0, sw, 0), connect(pc2, 0, sw, 1)]
  return { pc1, sw, pc2, links, devices: [pc1, sw, pc2] }
}

function enterSimulation() {
  useNetworkStore.setState({
    simulationMode: 'simulation', simulationPlaying: false,
    simulationHistory: [], simulationEvents: [],
    inFlightPackets: [], pingResults: [], tcpReceiveBuffers: [], tcpOutstandingSegments: [],
  })
}

test('back stepping restores the tick and packet state of the previous step', () => {
  const lab = makeLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  enterSimulation()
  assert.ok(useNetworkStore.getState().sendPing(lab.pc1.id, '192.168.0.2'))
  const tick0 = useNetworkStore.getState().simulationTick
  useNetworkStore.getState().stepSimulation()
  const tick1 = useNetworkStore.getState().simulationTick
  const packetsAfterOne = useNetworkStore.getState().inFlightPackets.length
  assert.equal(tick1, tick0 + 1)
  useNetworkStore.getState().stepSimulation()
  assert.equal(useNetworkStore.getState().simulationTick, tick0 + 2)
  assert.equal(useNetworkStore.getState().simulationHistory.length, 2)
  useNetworkStore.getState().stepSimulationBack()
  const state = useNetworkStore.getState()
  assert.equal(state.simulationTick, tick1)
  assert.equal(state.simulationHistory.length, 1)
  assert.equal(state.inFlightPackets.length, packetsAfterOne)
  assert.equal(state.simulationPlaying, false)
})

test('simulation events are recorded only in Simulation mode', () => {
  const lab = makeLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  enterSimulation()
  useNetworkStore.getState().sendPing(lab.pc1.id, '192.168.0.2')
  for (let i = 0; i < 5; i++) useNetworkStore.getState().stepSimulation()
  assert.ok(useNetworkStore.getState().simulationEvents.length > 0)
  assert.ok(useNetworkStore.getState().simulationHistory.length > 0)

  useNetworkStore.getState().toggleSimulationMode()
  assert.equal(useNetworkStore.getState().simulationMode, 'realtime')
  assert.deepEqual(useNetworkStore.getState().simulationEvents, [])
  assert.deepEqual(useNetworkStore.getState().simulationHistory, [])

  useNetworkStore.getState().sendPing(lab.pc1.id, '192.168.0.2')
  for (let i = 0; i < 4; i++) useNetworkStore.getState().stepSimulation()
  assert.equal(useNetworkStore.getState().simulationEvents.length, 0)
  assert.equal(useNetworkStore.getState().simulationHistory.length, 0)
})

test('back stepping is a no-op outside Simulation mode or with an empty journal', () => {
  const lab = makeLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  useNetworkStore.setState({ simulationMode: 'realtime', simulationPlaying: true, simulationHistory: [], simulationEvents: [] })
  const before = useNetworkStore.getState().simulationTick
  useNetworkStore.getState().stepSimulationBack()
  assert.equal(useNetworkStore.getState().simulationTick, before)

  enterSimulation()
  const tick = useNetworkStore.getState().simulationTick
  useNetworkStore.getState().stepSimulationBack()
  assert.equal(useNetworkStore.getState().simulationTick, tick)
  assert.equal(useNetworkStore.getState().simulationHistory.length, 0)
})

test('firing new traffic restarts the journal', () => {
  const lab = makeLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  enterSimulation()
  useNetworkStore.getState().sendPing(lab.pc1.id, '192.168.0.2')
  for (let i = 0; i < 5; i++) useNetworkStore.getState().stepSimulation()
  assert.ok(useNetworkStore.getState().simulationHistory.length > 0)
  assert.ok(useNetworkStore.getState().simulationEvents.length > 0)
  useNetworkStore.getState().sendPing(lab.pc1.id, '192.168.0.2')
  assert.equal(useNetworkStore.getState().simulationHistory.length, 0)
  assert.equal(useNetworkStore.getState().simulationEvents.length, 0)
})

test('clearSimulation resets packets and the journal', () => {
  const lab = makeLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  enterSimulation()
  useNetworkStore.getState().sendPing(lab.pc1.id, '192.168.0.2')
  for (let i = 0; i < 2; i++) useNetworkStore.getState().stepSimulation()
  useNetworkStore.getState().clearSimulation()
  const state = useNetworkStore.getState()
  assert.deepEqual(state.simulationHistory, [])
  assert.deepEqual(state.simulationEvents, [])
  assert.equal(state.inFlightPackets.length, 0)
})

test('recorded events map deliveries to hops with unique ids', () => {
  const lab = makeLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  enterSimulation()
  useNetworkStore.getState().sendPing(lab.pc1.id, '192.168.0.2')
  for (let i = 0; i < 60 && useNetworkStore.getState().pingResults[0]?.status === 'pending'; i++) useNetworkStore.getState().stepSimulation()
  assert.equal(useNetworkStore.getState().pingResults[0]?.status, 'successful')
  const events = useNetworkStore.getState().simulationEvents
  assert.ok(events.length >= 4)
  assert.equal(new Set(events.map(event => event.id)).size, events.length)
  const labIds = new Set([lab.pc1.id, lab.sw.id, lab.pc2.id])
  assert.ok(events.every(event => labIds.has(event.sourceDeviceId) && labIds.has(event.destDeviceId)))
  assert.ok(events.every(event => PACKET_PROTOCOLS.includes(event.protocol)))
  assert.ok(events.every(event => event.status === 'received' || event.status === 'dropped'))
  assert.ok(events.some(event => event.sourceDeviceId === lab.pc1.id))
  assert.ok(events.some(event => event.protocol === 'ARP' && event.destDeviceId === lab.pc2.id))
  assert.ok(events.some(event => event.protocol === 'ICMP' && event.destDeviceId === lab.pc2.id))
  assert.ok(events.some(event => event.protocol === 'ICMP' && event.sourceDeviceId === lab.pc2.id && event.destDeviceId === lab.sw.id))
  assert.ok(events.some(event => event.protocol === 'ICMP' && event.destDeviceId === lab.pc1.id))
})

test('simulation history depth adapts to topology size', () => {
  assert.equal(simulationHistoryLimitFor(2), 50)
  assert.equal(simulationHistoryLimitFor(60), 50)
  assert.equal(simulationHistoryLimitFor(61), 20)
  assert.equal(simulationHistoryLimitFor(150), 20)
  assert.equal(simulationHistoryLimitFor(151), 8)
})

test('simulation history is capped at the depth for the topology size', () => {
  const lab = makeLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  enterSimulation()
  useNetworkStore.getState().sendPing(lab.pc1.id, '192.168.0.2')
  const tick0 = useNetworkStore.getState().simulationTick
  const limit = simulationHistoryLimitFor(lab.devices.length)
  const steps = limit + 8
  for (let i = 0; i < steps; i++) useNetworkStore.getState().stepSimulation()
  const state = useNetworkStore.getState()
  assert.equal(state.simulationTick, tick0 + steps)
  assert.equal(state.simulationHistory.length, limit)
})

test('stepping back rewinds a completed PDU row to In Progress', () => {
  const lab = makeLab()
  useNetworkStore.getState().loadLab(lab.devices, lab.links)
  enterSimulation()
  useWorkspaceStore.setState({ pdus: [], scenario: 0, scenarios: [0] })
  useWorkspaceStore.getState().firePdu(lab.pc1.id, lab.pc2.id, '192.168.0.2')
  assert.equal(useWorkspaceStore.getState().pdus.length, 1)
  assert.equal(useWorkspaceStore.getState().pdus[0].status, 'In Progress')
  let steps = 0
  while (useNetworkStore.getState().pingResults[0]?.status === 'pending' && steps < 40) {
    useNetworkStore.getState().stepSimulation()
    steps++
  }
  assert.equal(useNetworkStore.getState().pingResults[0]?.status, 'successful')
  assert.equal(useWorkspaceStore.getState().pdus[0].status, 'Successful')
  const tick = useNetworkStore.getState().simulationTick
  useNetworkStore.getState().stepSimulationBack()
  assert.equal(useNetworkStore.getState().simulationTick, tick - 1)
  assert.equal(useNetworkStore.getState().pingResults[0]?.status, 'pending')
  assert.equal(useWorkspaceStore.getState().pdus[0].status, 'In Progress')
})

test('event filter actions control the hidden protocol list', () => {
  useWorkspaceStore.getState().showAllEventFilters()
  assert.deepEqual(useWorkspaceStore.getState().hiddenEventProtocols, [])
  useWorkspaceStore.getState().setEventProtocolVisible('ICMP', false)
  assert.deepEqual(useWorkspaceStore.getState().hiddenEventProtocols, ['ICMP'])
  useWorkspaceStore.getState().setEventProtocolVisible('ICMP', true)
  assert.deepEqual(useWorkspaceStore.getState().hiddenEventProtocols, [])
  useWorkspaceStore.getState().showNoneEventFilters()
  assert.equal(useWorkspaceStore.getState().hiddenEventProtocols.length, PACKET_PROTOCOLS.length)
  useWorkspaceStore.getState().toggleEventFilters()
  assert.deepEqual(useWorkspaceStore.getState().hiddenEventProtocols, [])
  useWorkspaceStore.getState().toggleEventFilters()
  assert.equal(useWorkspaceStore.getState().hiddenEventProtocols.length, PACKET_PROTOCOLS.length)
  useWorkspaceStore.getState().setPduView('events')
  assert.equal(useWorkspaceStore.getState().pduView, 'events')
  useWorkspaceStore.getState().setPduView('pdus')
  assert.equal(useWorkspaceStore.getState().pduView, 'pdus')
  useWorkspaceStore.getState().showAllEventFilters()
})
