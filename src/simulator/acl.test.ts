import test from 'node:test'
import assert from 'node:assert/strict'
import { parseIosCommand } from './ios/ciscoParser'
import { createDevice } from './deviceFactory'
import { evaluateAcl, matchesWildcard, parseAclRule } from './acl'
import { createIcmpEchoPdu, stepSimulationTick } from './engine'
import type { InFlightPacket, NetworkDevice, NetworkLink } from '@/types/network'

test('matchesWildcard matches exact host, subnets, and any', () => {
  assert.equal(matchesWildcard('192.168.1.50', '192.168.1.50', '0.0.0.0'), true)
  assert.equal(matchesWildcard('192.168.1.51', '192.168.1.50', '0.0.0.0'), false)

  assert.equal(matchesWildcard('192.168.1.100', '192.168.1.0', '0.0.0.255'), true)
  assert.equal(matchesWildcard('192.168.2.100', '192.168.1.0', '0.0.0.255'), false)

  assert.equal(matchesWildcard('10.5.20.1', '10.0.0.0', '0.255.255.255'), true)
  assert.equal(matchesWildcard('172.16.0.1', '10.0.0.0', '0.255.255.255'), false)

  assert.equal(matchesWildcard('1.2.3.4', 'any'), true)
})

test('parseAclRule parses standard and extended rules accurately', () => {
  const std = parseAclRule(['10', 'permit', '192.168.1.0', '0.0.0.255'])
  assert.ok('rule' in std && std.rule.type === 'standard')
  if ('rule' in std && std.rule.type === 'standard') {
    assert.equal(std.type, 'standard')
    assert.equal(std.rule.action, 'permit')
    assert.equal(std.rule.sourceIp, '192.168.1.0')
    assert.equal(std.rule.wildcard, '0.0.0.255')
  }

  const ext = parseAclRule(['101', 'deny', 'tcp', '192.168.1.0', '0.0.0.255', 'host', '10.0.0.1', 'eq', '80'])
  assert.ok('rule' in ext && ext.rule.type === 'extended')
  if ('rule' in ext && ext.rule.type === 'extended') {
    assert.equal(ext.type, 'extended')
    assert.equal(ext.rule.action, 'deny')
    assert.equal(ext.rule.protocol, 'tcp')
    assert.equal(ext.rule.sourceIp, '192.168.1.0')
    assert.equal(ext.rule.destIp, '10.0.0.1')
    assert.equal(ext.rule.destPort, 80)
  }
})

test('extended ACLs match GRE outer packets and reject transport-port clauses', () => {
  const parsed = parseAclRule(['101', 'permit', 'gre', 'host', '198.51.100.2', 'host', '198.51.100.1'])
  assert.ok('rule' in parsed && parsed.rule.type === 'extended')
  if ('rule' in parsed && parsed.rule.type === 'extended') {
    assert.equal(parsed.rule.protocol, 'gre')
    assert.equal(evaluateAcl({ id: '101', number: 101, type: 'extended', rules: [parsed.rule] }, { sourceIp: '198.51.100.2', destIp: '198.51.100.1', protocol: 'GRE' }).action, 'permit')
    assert.equal(evaluateAcl({ id: '101', number: 101, type: 'extended', rules: [parsed.rule] }, { sourceIp: '198.51.100.2', destIp: '198.51.100.1', protocol: 'ICMP' }).action, 'deny')
  }
  const invalid = parseAclRule(['101', 'permit', 'gre', 'any', 'any', 'eq', '47'])
  assert.ok('error' in invalid && /no transport ports/.test(invalid.error))
})

test('IOS CLI configures standard ACL, binds to interface, and shows running config', () => {
  const router: NetworkDevice = createDevice('router', 0, 0, '2911')
  router.currentCliMode = 'config'

  // Configure standard ACL 10
  const r1 = parseIosCommand(router, 'access-list 10 permit 192.168.1.0 0.0.0.255')
  assert.equal(r1.output, '')
  assert.ok(r1.newDeviceConfig?.accessLists)
  router.config = { ...router.config, ...r1.newDeviceConfig }

  const r2 = parseIosCommand(router, 'access-list 10 deny any')
  router.config = { ...router.config, ...r2.newDeviceConfig }
  assert.equal(router.config.accessLists?.[0].rules.length, 2)

  // Enter interface GigabitEthernet0/0
  const r3 = parseIosCommand(router, 'interface GigabitEthernet0/0')
  router.currentCliMode = r3.newMode || router.currentCliMode
  router.activeInterface = r3.newActiveInterface

  // Bind inbound ACL
  const r4 = parseIosCommand(router, 'ip access-group 10 in')
  assert.equal(r4.output, '')
  assert.equal(r4.modifiedPorts?.[0].inboundAcl, '10')
  router.ports[0].inboundAcl = '10'

  // show access-lists
  router.currentCliMode = 'priv'
  const r5 = parseIosCommand(router, 'show access-lists')
  assert.ok(r5.output.includes('Standard IP access list 10'))
  assert.ok(r5.output.includes('permit 192.168.1.0, wildcard bits 0.0.0.255'))
  assert.ok(r5.output.includes('deny any'))

  // show ip interface GigabitEthernet0/0
  const r6 = parseIosCommand(router, 'show ip interface GigabitEthernet0/0')
  assert.ok(r6.output.includes('Inbound  access list is 10'))
  assert.ok(r6.output.includes('Outgoing access list is not set'))

  // show running-config
  const r7 = parseIosCommand(router, 'show running-config')
  assert.ok(r7.output.includes('ip access-group 10 in'))
  assert.ok(r7.output.includes('access-list 10 permit 192.168.1.0 0.0.0.255'))
  assert.ok(r7.output.includes('access-list 10 deny any'))
})

test('simulation engine drops transit packets denied by inbound router ACL', () => {
  const router: NetworkDevice = createDevice('router', 100, 100, '2911')
  const pc1: NetworkDevice = createDevice('pc', 0, 100, 'PC-PT')
  const pc2: NetworkDevice = createDevice('pc', 200, 100, 'PC-PT')

  // Setup addressing
  pc1.ports[0].ipAddress = '192.168.1.10'
  pc1.ports[0].subnetMask = '255.255.255.0'
  pc1.ports[0].adminStatus = 'up'
  pc1.ports[0].status = 'up'

  router.ports[0].ipAddress = '192.168.1.1'
  router.ports[0].subnetMask = '255.255.255.0'
  router.ports[0].adminStatus = 'up'
  router.ports[0].status = 'up'

  router.ports[1].ipAddress = '192.168.2.1'
  router.ports[1].subnetMask = '255.255.255.0'
  router.ports[1].adminStatus = 'up'
  router.ports[1].status = 'up'

  pc2.ports[0].ipAddress = '192.168.2.10'
  pc2.ports[0].subnetMask = '255.255.255.0'
  pc2.ports[0].adminStatus = 'up'
  pc2.ports[0].status = 'up'

  // Configure ACL on router denying 192.168.1.10
  router.config.accessLists = [
    {
      id: '1',
      number: 1,
      type: 'standard',
      rules: [
        { type: 'standard', action: 'deny', sourceIp: '192.168.1.10', wildcard: '0.0.0.0' },
        { type: 'standard', action: 'permit', sourceIp: 'any' },
      ],
    },
  ]
  router.ports[0].inboundAcl = '1'

  // Cable links
  const link1: NetworkLink = {
    id: 'link-1',
    type: 'straight',
    fromDeviceId: pc1.id,
    fromPortId: pc1.ports[0].id,
    toDeviceId: router.id,
    toPortId: router.ports[0].id,
    status: 'up',
  }
  const link2: NetworkLink = {
    id: 'link-2',
    type: 'straight',
    fromDeviceId: router.id,
    fromPortId: router.ports[1].id,
    toDeviceId: pc2.id,
    toPortId: pc2.ports[0].id,
    status: 'up',
  }
  pc1.ports[0].connectedLinkId = link1.id
  router.ports[0].connectedLinkId = link1.id
  router.ports[1].connectedLinkId = link2.id
  pc2.ports[0].connectedLinkId = link2.id

  // Create ICMP packet from pc1 targeting pc2
  const pdu = createIcmpEchoPdu(pc1, pc1.ports[0].id, router.ports[0].macAddress, '192.168.2.10')
  const inFlight: InFlightPacket = {
    id: 'pkt-test',
    linkId: link1.id,
    fromDeviceId: pc1.id,
    toDeviceId: router.id,
    progress: 0.9,
    direction: 'forward',
    pdu,
  }

  // Step simulation: arrival at router port with inbound ACL
  const result = stepSimulationTick([pc1, router, pc2], [link1, link2], [inFlight])

  // Packet must be dropped by ACL 1
  assert.equal(result.newInFlightPackets.length, 0)
  assert.equal(result.discardedPackets, 1)
  assert.ok(result.packetDeliveries.some((d) => d.status === 'dropped' && d.reason?.toLowerCase().includes('inbound acl 1') && d.reason?.toLowerCase().includes('deny')))
})

test('simulation engine permits packets when matching ACL permit rule', () => {
  const router: NetworkDevice = createDevice('router', 100, 100, '2911')
  const pc1: NetworkDevice = createDevice('pc', 0, 100, 'PC-PT')
  const pc2: NetworkDevice = createDevice('pc', 200, 100, 'PC-PT')

  pc1.ports[0].ipAddress = '192.168.1.10'
  pc1.ports[0].subnetMask = '255.255.255.0'
  pc1.ports[0].adminStatus = 'up'
  pc1.ports[0].status = 'up'

  router.ports[0].ipAddress = '192.168.1.1'
  router.ports[0].subnetMask = '255.255.255.0'
  router.ports[0].adminStatus = 'up'
  router.ports[0].status = 'up'

  router.ports[1].ipAddress = '192.168.2.1'
  router.ports[1].subnetMask = '255.255.255.0'
  router.ports[1].adminStatus = 'up'
  router.ports[1].status = 'up'

  pc2.ports[0].ipAddress = '192.168.2.10'
  pc2.ports[0].subnetMask = '255.255.255.0'
  pc2.ports[0].adminStatus = 'up'
  pc2.ports[0].status = 'up'

  // Pre-seed ARP table on router so it can forward immediately
  router.arpTable.push({
    ipAddress: '192.168.2.10',
    macAddress: pc2.ports[0].macAddress,
    interfaceName: router.ports[1].name,
    age: 0,
  })

  // ACL permits 192.168.1.0/24
  router.config.accessLists = [
    {
      id: '10',
      number: 10,
      type: 'standard',
      rules: [
        { type: 'standard', action: 'permit', sourceIp: '192.168.1.0', wildcard: '0.0.0.255' },
      ],
    },
  ]
  router.ports[0].inboundAcl = '10'

  const link1: NetworkLink = {
    id: 'link-1',
    type: 'straight',
    fromDeviceId: pc1.id,
    fromPortId: pc1.ports[0].id,
    toDeviceId: router.id,
    toPortId: router.ports[0].id,
    status: 'up',
  }
  const link2: NetworkLink = {
    id: 'link-2',
    type: 'straight',
    fromDeviceId: router.id,
    fromPortId: router.ports[1].id,
    toDeviceId: pc2.id,
    toPortId: pc2.ports[0].id,
    status: 'up',
  }
  pc1.ports[0].connectedLinkId = link1.id
  router.ports[0].connectedLinkId = link1.id
  router.ports[1].connectedLinkId = link2.id
  pc2.ports[0].connectedLinkId = link2.id

  const pdu = createIcmpEchoPdu(pc1, pc1.ports[0].id, router.ports[0].macAddress, '192.168.2.10')
  const inFlight: InFlightPacket = {
    id: 'pkt-permit-test',
    linkId: link1.id,
    fromDeviceId: pc1.id,
    toDeviceId: router.id,
    progress: 0.9,
    direction: 'forward',
    pdu,
  }

  const result = stepSimulationTick([pc1, router, pc2], [link1, link2], [inFlight])

  // Packet must be forwarded to pc2 on link2!
  assert.equal(result.discardedPackets, 0)
  assert.equal(result.newInFlightPackets.length, 1)
  assert.equal(result.newInFlightPackets[0].toDeviceId, pc2.id)
  assert.equal(result.newInFlightPackets[0].linkId, link2.id)
})
