import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { createIcmpEchoPdu, stepSimulationTick } from './engine'
import {
  SNIFFER_DEFAULT_BUFFER_SIZE,
  SNIFFER_MAX_BUFFER_SIZE,
  captureSnifferPacket,
  isSniffer,
  snifferBufferLimit,
  snifferModulePorts,
  snifferPortEnabled,
  snifferServiceEnabled,
} from './sniffer'
import type { InFlightPacket, NetworkDevice, NetworkLink, NetworkPort } from '@/types/network'

function testSniffer() {
  const sniffer = createDevice('hub', 200, 100, 'Sniffer')
  sniffer.ports = [
    { ...createPort('FastEthernet1/0', 'Fa1/0', 'fastethernet', 'up'), moduleSlot: 0 },
    { ...createPort('FastEthernet2/0', 'Fa2/0', 'fastethernet', 'up'), moduleSlot: 1 },
  ]
  sniffer.modules = ['PT-REPEATER-NM-1CFE', 'PT-REPEATER-NM-1CFE']
  return sniffer
}

let testPortSequence = 0
function createPort(name: string, shortName: string, type: NetworkPort['type'], status: NetworkPort['status']): NetworkPort {
  const pc = createDevice('pc', 0, 0, 'PC-PT')
  return { ...pc.ports[0], id: `${name}-${++testPortSequence}`, name, shortName, type, status }
}

function testPacket(source: NetworkDevice, portId: string, destMac: string, targetIp: string, id = 'packet-1', seq = 1) {
  return { id, pdu: createIcmpEchoPdu(source, portId, destMac, targetIp, seq) }
}

test('Sniffer model is gated from an ordinary hub and starts with two empty repeater slots', () => {
  const sniffer = createDevice('hub', 0, 0, 'Sniffer')
  const hub = createDevice('hub', 0, 0, 'Hub-PT')
  assert.equal(isSniffer(sniffer), true)
  assert.equal(isSniffer(hub), false)
  assert.equal(sniffer.ports.length, 0)
  assert.deepEqual(sniffer.modules, [])
  assert.equal(sniffer.config.snifferServiceEnabled, true)
  assert.equal(sniffer.config.snifferBufferSize, 100)
  assert.equal(sniffer.name, 'Sniffer0')
})

test('Sniffer buffer and service defaults are bounded', () => {
  assert.equal(snifferBufferLimit({} as never), SNIFFER_DEFAULT_BUFFER_SIZE)
  assert.equal(snifferBufferLimit({ snifferBufferSize: 0 } as never), 1)
  assert.equal(snifferBufferLimit({ snifferBufferSize: 9999 } as never), SNIFFER_MAX_BUFFER_SIZE)
  assert.equal(snifferBufferLimit({ snifferBufferSize: 37.8 } as never), 37)
  assert.equal(snifferServiceEnabled({} as never), true)
  assert.equal(snifferServiceEnabled({ snifferServiceEnabled: false } as never), false)
  assert.equal(snifferPortEnabled({} as never, 'port-1'), true)
  assert.equal(snifferPortEnabled({ snifferPorts: { 'port-1': false } } as never, 'port-1'), false)
})

test('Sniffer captures inbound frames into a bounded runtime buffer that retains the newest frames', () => {
  const sniffer = testSniffer()
  const source = createDevice('pc', 0, 0, 'PC-PT')
  source.ports[0].ipAddress = '192.168.0.1'
  source.ports[0].subnetMask = '255.255.255.0'
  assert.equal(snifferModulePorts(sniffer).length, 2)

  sniffer.config.snifferBufferSize = 2
  let current = sniffer
  for (let i = 1; i <= 3; i++) {
    const next = captureSnifferPacket(current, testPacket(source, source.ports[0].id, sniffer.ports[0].macAddress, '192.168.0.2', `packet-${i}`, i), sniffer.ports[0], i)
    assert.ok(next)
    current = next
  }
  assert.equal(current.snifferCaptures?.length, 2)
  assert.equal(current.snifferCaptures?.[0].pdu.payload.icmpSeq, 2)
  assert.equal(current.snifferCaptures?.[1].pdu.payload.icmpSeq, 3)
  assert.equal(current.snifferCaptures?.[0].portName, 'FastEthernet1/0')
})

test('Sniffer does not capture when the service or an ingress port is disabled', () => {
  const sniffer = testSniffer()
  const source = createDevice('pc', 0, 0, 'PC-PT')
  const packet = testPacket(source, source.ports[0].id, sniffer.ports[0].macAddress, '192.168.0.2')

  assert.equal(captureSnifferPacket({ ...sniffer, power: false }, packet, sniffer.ports[0], 1), null)
  assert.equal(captureSnifferPacket({ ...sniffer, config: { ...sniffer.config, snifferServiceEnabled: false } }, packet, sniffer.ports[0], 1), null)
  assert.equal(captureSnifferPacket({ ...sniffer, config: { ...sniffer.config, snifferPorts: { [sniffer.ports[0].id]: false } } }, packet, sniffer.ports[0], 1), null)

  const captured = captureSnifferPacket(sniffer, packet, sniffer.ports[0], 1)
  assert.equal(captured?.snifferCaptures?.length, 1)
})

test('Engine captures a frame at a Sniffer ingress port before forwarding it like a repeater', () => {
  const pc1 = createDevice('pc', 0, 100, 'PC-PT')
  const pc2 = createDevice('pc', 300, 100, 'PC-PT')
  const sniffer = testSniffer()

  for (const [pc, ip] of [[pc1, '192.168.0.1'], [pc2, '192.168.0.2']] as const) {
    pc.ports[0].ipAddress = ip
    pc.ports[0].subnetMask = '255.255.255.0'
    pc.ports[0].adminStatus = 'up'
    pc.ports[0].status = 'up'
  }

  const link1: NetworkLink = {
    id: 'sniffer-link-1', type: 'straight', fromDeviceId: pc1.id, fromPortId: pc1.ports[0].id,
    toDeviceId: sniffer.id, toPortId: sniffer.ports[0].id, status: 'up',
  }
  const link2: NetworkLink = {
    id: 'sniffer-link-2', type: 'straight', fromDeviceId: sniffer.id, fromPortId: sniffer.ports[1].id,
    toDeviceId: pc2.id, toPortId: pc2.ports[0].id, status: 'up',
  }
  pc1.ports[0].connectedLinkId = link1.id
  sniffer.ports[0].connectedLinkId = link1.id
  sniffer.ports[1].connectedLinkId = link2.id
  pc2.ports[0].connectedLinkId = link2.id

  const packet: InFlightPacket = {
    id: 'sniffer-frame-1', linkId: link1.id, fromDeviceId: pc1.id, toDeviceId: sniffer.id,
    progress: 0.9, direction: 'forward',
    pdu: createIcmpEchoPdu(pc1, pc1.ports[0].id, sniffer.ports[0].macAddress, '192.168.0.2'),
  }

  const result = stepSimulationTick([pc1, sniffer, pc2], [link1, link2], [packet])
  const updated = result.updatedDevices.find(device => device.id === sniffer.id)
  assert.equal(updated?.snifferCaptures?.length, 1)
  assert.equal(updated?.snifferCaptures?.[0].pdu.protocol, 'ICMP')
  assert.equal(updated?.snifferCaptures?.[0].portId, sniffer.ports[0].id)
  assert.equal(result.newInFlightPackets.length, 1)
  assert.equal(result.newInFlightPackets[0].toDeviceId, pc2.id)
})
