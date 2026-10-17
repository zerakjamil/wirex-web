import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from '../simulator/deviceFactory'
import type { NetworkDevice, NetworkLink } from '../types/network'
import { useNetworkStore } from './networkStore'
import type { PingResult } from './pingResults'

const state = useNetworkStore.getState

function connect(source: NetworkDevice, sourceIndex: number, target: NetworkDevice, targetIndex: number): NetworkLink {
  const from = source.ports[sourceIndex]
  const to = target.ports[targetIndex]
  const link: NetworkLink = { id: `${source.id}-${target.id}`, type: 'straight', fromDeviceId: source.id, fromPortId: from.id, toDeviceId: target.id, toPortId: to.id, status: 'up' }
  Object.assign(from, { adminStatus: 'up', status: 'up', connectedLinkId: link.id, connectedDeviceId: target.id, connectedPortId: to.id })
  Object.assign(to, { adminStatus: 'up', status: 'up', connectedLinkId: link.id, connectedDeviceId: source.id, connectedPortId: from.id })
  return link
}

function fixture() {
  const source = createDevice('pc', 0, 0)
  const sw = createDevice('switch', 100, 0)
  const target = createDevice('pc', 200, 0)
  source.id = 'source'
  sw.id = 'switch'
  target.id = 'target'
  source.ports[0].ipAddress = '10.0.0.1'
  target.ports[0].ipAddress = '10.0.0.2'
  source.ports[0].subnetMask = target.ports[0].subnetMask = '255.255.255.0'
  const links = [connect(source, 0, sw, 0), connect(sw, 1, target, 0)]
  useNetworkStore.setState({
    devices: [source, sw, target], links, inFlightPackets: [], simulationMode: 'simulation', simulationPlaying: false,
    simulationWarning: null, pingResults: [],
  })
  return { source, target }
}

test('accepted ping stays pending while simulation is paused', () => {
  const { source } = fixture()
  const id = state().sendPing(source.id, '10.0.0.2')
  assert.equal(typeof id, 'string')
  assert.ok(id)
  assert.deepEqual(state().pingResults.map(result => ({ id: result.id, source: result.sourceDeviceId, target: result.targetIp, status: result.status })), [
    { id, source: source.id, target: '10.0.0.2', status: 'pending' },
  ])
  state().tickSimulation()
  assert.equal(state().pingResults[0].status, 'pending')
})

test('ping succeeds only when an echo reply reaches its source', () => {
  const { source } = fixture()
  const id = state().sendPing(source.id, '10.0.0.2')
  assert.ok(id)
  let completed = false
  for (let tick = 0; tick < 150 && !completed; tick++) {
    const before = state()
    const replyArrives = before.inFlightPackets.some(packet => packet.toDeviceId === source.id && packet.pdu.payload.icmpType === 'echo-reply' && packet.progress + 0.25 >= 1)
    assert.equal(before.pingResults.find(result => result.id === id)?.status, 'pending')
    before.stepSimulation()
    const result: PingResult = state().pingResults.find(result => result.id === id)!
    if (result.status === 'successful') {
      assert.ok(replyArrives, 'Ping reported success before its reply arrived')
      assert.ok(result.ttl && result.ttl > 0)
      completed = true
    } else assert.equal(result.status, 'pending')
  }
  assert.ok(completed, 'Normal PC-switch-PC ping never reported completion')
})

test('an unresolved destination fails after its ARP packets drain', () => {
  const { source } = fixture()
  const id = state().sendPing(source.id, '10.0.0.99')
  assert.ok(id)
  for (let tick = 0; tick < 150 && state().pingResults.find(result => result.id === id)?.status === 'pending'; tick++) state().stepSimulation()
  const result = state().pingResults.find(result => result.id === id)!
  assert.equal(result.status, 'failed')
  assert.ok(result.reason)
  assert.equal(state().inFlightPackets.length, 0)
})

test('invalid ping targets return null without creating results', () => {
  const { source } = fixture()
  assert.equal(state().sendPing(source.id, '999.1.1.1'), null)
  assert.equal(state().pingResults.length, 0)
  assert.equal(state().inFlightPackets.length, 0)
})

test('resetting simulation cancels pending pings and preserves completed history', () => {
  const { source } = fixture()
  const completedId = state().sendPing(source.id, '10.0.0.2')
  assert.ok(completedId)
  for (let tick = 0; tick < 150 && state().pingResults.find(result => result.id === completedId)?.status === 'pending'; tick++) state().stepSimulation()
  assert.equal(state().pingResults.find(result => result.id === completedId)?.status, 'successful')
  const pendingId = state().sendPing(source.id, '10.0.0.99')
  assert.ok(pendingId)
  state().clearSimulation()
  assert.equal(state().inFlightPackets.length, 0)
  assert.equal(state().pingResults.find(result => result.id === completedId)?.status, 'successful')
  const cancelled = state().pingResults.find(result => result.id === pendingId)!
  assert.equal(cancelled.status, 'failed')
  assert.match(cancelled.reason || '', /cancel|reset/i)
})

test('256 active ping requests are retained and the next request is rejected with a warning', () => {
  const { source } = fixture()
  const accepted: string[] = []
  for (let index = 0; index < 256; index++) {
    const id = state().sendPing(source.id, '10.0.0.2')
    assert.ok(id)
    accepted.push(id)
  }
  assert.equal(state().sendPing(source.id, '10.0.0.2'), null)
  assert.equal(state().pingResults.length, 256)
  assert.deepEqual(new Set(state().pingResults.map(result => result.id)), new Set(accepted))
  assert.ok(state().pingResults.every(result => result.status === 'pending'))
  assert.ok(state().simulationWarning)
})

test('completed ping history retains the most recent 100 results', () => {
  const { source } = fixture()
  const completed: string[] = []
  for (let index = 0; index < 105; index++) {
    const id = state().sendPing(source.id, '10.0.0.2')
    assert.ok(id)
    for (let tick = 0; tick < 150 && state().pingResults.find(result => result.id === id)?.status === 'pending'; tick++) state().stepSimulation()
    assert.equal(state().pingResults.find(result => result.id === id)?.status, 'successful')
    completed.push(id)
  }
  assert.equal(state().pingResults.length, 100)
  assert.deepEqual(state().pingResults.map(result => result.id), completed.slice(-100))
})
