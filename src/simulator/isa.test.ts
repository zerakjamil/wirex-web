import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { evaluateAcl, formatAclRunningConfig } from './acl'
import { createIcmpEchoPdu, stepSimulationTick } from './engine'
import {
  ISA_MODEL,
  buildIsaDenyRule,
  insertIsaRule,
  isIsaPermitAllRule,
  isIsa3000,
  isaAclId,
  isaDefaultAclRules,
  isaFirewallPorts,
  readIsaAcl,
} from './isa'
import type { AccessList, InFlightPacket, NetworkLink } from '@/types/network'

function formatIsaAcl(accessLists: AccessList[]): string[] {
  return formatAclRunningConfig(accessLists, { includeAclType: true })
}

function createIsa() {
  return createDevice('security', 0, 0, ISA_MODEL)
}

test('ISA-3000 hardware matches the industrial appliance interface layout', () => {
  const isa = createIsa()
  assert.equal(isa.name, 'ISA0')
  assert.equal(isIsa3000(isa), true)
  assert.deepEqual(isa.ports.map(port => port.name), [
    'GigabitEthernet1/1',
    'GigabitEthernet1/2',
    'GigabitEthernet1/3',
    'GigabitEthernet1/4',
    'Management1/1',
  ])
  assert.deepEqual(isa.ports.map(port => port.nameif), ['outside1', 'inside1', 'outside2', 'inside2', 'management'])
  assert.deepEqual(isa.ports.map(port => port.securityLevel), [0, 50, 0, 100, 100])
  assert.deepEqual(isa.ports.map(port => port.media), ['fiber', 'fiber', 'copper', 'copper', 'copper'])
  assert.deepEqual(isa.ports.map(port => port.adminStatus), ['up', 'up', 'down', 'up', 'down'])
  assert.deepEqual(isa.ports.map(port => port.inboundAcl), [
    'outside1_access_in',
    'inside1_access_in',
    'outside2_access_in',
    'inside2_access_in',
    undefined,
  ])
  assert.equal(isa.ports[4].ipAddress, '192.168.1.1')
  assert.equal(isa.ports[4].subnetMask, '255.255.255.0')
  assert.deepEqual(isa.modules, [])
  assert.deepEqual(isaFirewallPorts(isa).map(port => port.nameif), ['outside1', 'inside1', 'outside2', 'inside2'])
})

test('ISA default ACLs and interface bindings are real access lists', () => {
  const isa = createIsa()
  const outside = isa.ports.find(port => port.name === 'GigabitEthernet1/1')!
  const { aclId, acl } = readIsaAcl(isa, outside)
  assert.equal(aclId, 'outside1_access_in')
  assert.equal(acl?.type, 'extended')
  assert.deepEqual(acl?.rules, isaDefaultAclRules())
  assert.equal(isIsaPermitAllRule(acl!.rules[0]), true)
  assert.equal(evaluateAcl(acl!, { sourceIp: '203.0.113.10', destIp: '192.0.2.20', protocol: 'UDP', port: 9999 }).action, 'permit')
  assert.equal(isaAclId(outside), 'outside1_access_in')
})

test('ISA deny rules target sources, destinations, traffic and traffic from a host', () => {
  const source = buildIsaDenyRule('source', '10.0.0.5', 'http')
  assert.deepEqual(source, {
    type: 'extended',
    action: 'deny',
    protocol: 'ip',
    sourceIp: '10.0.0.5',
    sourceWildcard: '0.0.0.0',
    destIp: 'any',
  })

  const destination = buildIsaDenyRule('destination', '192.0.2.10', 'dns')
  assert.deepEqual(destination, {
    type: 'extended',
    action: 'deny',
    protocol: 'ip',
    sourceIp: 'any',
    destIp: '192.0.2.10',
    destWildcard: '0.0.0.0',
  })

  const traffic = buildIsaDenyRule('traffic', '', 'http')
  assert.deepEqual(traffic, {
    type: 'extended',
    action: 'deny',
    protocol: 'tcp',
    sourceIp: 'any',
    destIp: 'any',
    destPort: 80,
  })

  const trafficFromHost = buildIsaDenyRule('traffic-source', '10.0.0.5', 'smtp')
  assert.deepEqual(trafficFromHost, {
    type: 'extended',
    action: 'deny',
    protocol: 'tcp',
    sourceIp: '10.0.0.5',
    sourceWildcard: '0.0.0.0',
    destIp: 'any',
    destPort: 25,
  })

  assert.equal(buildIsaDenyRule('source', '10.0.0.999', 'http'), null)
  assert.equal(buildIsaDenyRule('traffic', '', 'not-a-service'), null)
})

test('ISA deny rules are inserted above the baseline permit and take effect first', () => {
  const sourceRule = buildIsaDenyRule('source', '10.0.0.5', 'http')!
  const httpRule = buildIsaDenyRule('traffic', '', 'http')!
  const rules = insertIsaRule(isaDefaultAclRules(), sourceRule)
  assert.equal(rules.length, 2)
  assert.equal(isIsaPermitAllRule(rules[1]), true)
  assert.equal(rules[0], sourceRule)

  const acl: AccessList = { id: 'outside1_access_in', type: 'extended', rules: insertIsaRule(rules, httpRule) }
  assert.deepEqual(acl.rules.map(rule => rule.action), ['deny', 'deny', 'permit'])

  const deniedBySource = evaluateAcl(acl, { sourceIp: '10.0.0.5', destIp: '192.0.2.20', protocol: 'TCP', port: 443 })
  assert.equal(deniedBySource.action, 'deny')
  assert.equal(deniedBySource.matchedRuleIndex, 0)

  const deniedByHttp = evaluateAcl(acl, { sourceIp: '10.0.0.6', destIp: '192.0.2.20', protocol: 'HTTP' })
  assert.equal(deniedByHttp.action, 'deny')
  assert.equal(deniedByHttp.matchedRuleIndex, 1)

  const allowedHttps = evaluateAcl(acl, { sourceIp: '10.0.0.6', destIp: '192.0.2.20', protocol: 'TCP', port: 443 })
  assert.equal(allowedHttps.action, 'permit')
  assert.equal(allowedHttps.matchedRuleIndex, 2)
})

test('ISA rule CLI includes exact host wildcards instead of undefined', () => {
  const source = buildIsaDenyRule('source', '10.0.0.5', 'http')!
  const destination = buildIsaDenyRule('destination', '192.0.2.10', 'dns')!
  const lines = formatIsaAcl([
    { id: 'outside1_access_in', type: 'extended', rules: [source, destination, ...isaDefaultAclRules()] },
  ])
  assert.deepEqual(lines, [
    'access-list outside1_access_in extended deny ip host 10.0.0.5 any',
    'access-list outside1_access_in extended deny ip any host 192.0.2.10',
    'access-list outside1_access_in extended permit ip any any',
  ])
  assert.ok(!lines.some(line => line.includes('undefined')))
})

test('ISA inbound ACL denies a real packet and permits it after the policy is removed', () => {
  const isa = createIsa()
  const insideHost = createDevice('pc', 0, 100, 'PC-PT')
  const outsideHost = createDevice('server', 200, 100, 'Server-PT')
  const insidePort = isa.ports.find(port => port.nameif === 'inside1')!
  const outsidePort = isa.ports.find(port => port.nameif === 'outside1')!

  insideHost.ports[0].ipAddress = '192.168.1.10'
  insideHost.ports[0].subnetMask = '255.255.255.0'
  insideHost.ports[0].adminStatus = 'up'
  insideHost.ports[0].status = 'up'
  insideHost.config.defaultGateway = '192.168.1.1'
  outsideHost.ports[0].ipAddress = '203.0.113.10'
  outsideHost.ports[0].subnetMask = '255.255.255.0'
  outsideHost.ports[0].adminStatus = 'up'
  outsideHost.ports[0].status = 'up'
  outsideHost.config.defaultGateway = '203.0.113.1'

  insidePort.ipAddress = '192.168.1.1'
  insidePort.subnetMask = '255.255.255.0'
  insidePort.adminStatus = 'up'
  insidePort.status = 'up'
  outsidePort.ipAddress = '203.0.113.1'
  outsidePort.subnetMask = '255.255.255.0'
  outsidePort.adminStatus = 'up'
  outsidePort.status = 'up'
  isa.routingTable = [
    { network: '192.168.1.0', netmask: '255.255.255.0', nextHop: '192.168.1.1', interfaceName: 'GigabitEthernet1/2', metric: 0, type: 'C' },
    { network: '203.0.113.0', netmask: '255.255.255.0', nextHop: '203.0.113.1', interfaceName: 'GigabitEthernet1/1', metric: 0, type: 'C' },
  ]
  isa.arpTable = [
    { ipAddress: '192.168.1.10', macAddress: insideHost.ports[0].macAddress, interfaceName: 'GigabitEthernet1/2', age: 0 },
    { ipAddress: '203.0.113.10', macAddress: outsideHost.ports[0].macAddress, interfaceName: 'GigabitEthernet1/1', age: 0 },
  ]

  const insideLink: NetworkLink = {
    id: 'isa-link-in', type: 'straight', status: 'up',
    fromDeviceId: insideHost.id, fromPortId: insideHost.ports[0].id,
    toDeviceId: isa.id, toPortId: insidePort.id,
  }
  insideHost.ports[0].connectedLinkId = insideLink.id
  insidePort.connectedLinkId = insideLink.id
  const outsideLink: NetworkLink = {
    id: 'isa-link-out', type: 'straight', status: 'up',
    fromDeviceId: isa.id, fromPortId: outsidePort.id,
    toDeviceId: outsideHost.id, toPortId: outsideHost.ports[0].id,
  }
  outsidePort.connectedLinkId = outsideLink.id
  outsideHost.ports[0].connectedLinkId = outsideLink.id

  const pdu = createIcmpEchoPdu(insideHost, insideHost.ports[0].id, insidePort.macAddress, '203.0.113.10')
  const packet: InFlightPacket = {
    id: 'isa-packet', linkId: insideLink.id, fromDeviceId: insideHost.id, toDeviceId: isa.id,
    progress: 0.9, direction: 'forward', pdu,
  }

  const denyRule = buildIsaDenyRule('source', '192.168.1.10', 'http')!
  const deniedIsa = {
    ...isa,
    config: {
      ...isa.config,
      accessLists: (isa.config.accessLists ?? []).map(acl => acl.id === 'inside1_access_in'
        ? { ...acl, rules: [denyRule, ...isaDefaultAclRules()] }
        : acl),
    },
  }
  const denied = stepSimulationTick([deniedIsa, insideHost, outsideHost], [insideLink, outsideLink], [packet])
  assert.equal(denied.discardedPackets, 1)
  assert.ok(denied.packetDeliveries.some(delivery => delivery.reason?.includes('Packet filtered by inbound ACL inside1_access_in')))

  const permitted = stepSimulationTick([isa, insideHost, outsideHost], [insideLink, outsideLink], [packet])
  const forwarded = permitted.newInFlightPackets.find(candidate => candidate.toDeviceId === outsideHost.id)
  assert.ok(forwarded, 'the same packet should leave the ISA when the inbound ACL permits it')
  assert.equal(forwarded.pdu.sourceIp, '192.168.1.10')
})
