import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import {
  activityFileName, activityFileSlug, clearAssessedConfig, collectAssessmentCandidates, deriveInitialNetwork,
  evaluateActivityItems, parseActivity, scoreActivity, serializeActivity,
  type ActivityFacetSpec, type AssessmentActivity,
} from './activity'
import type { NetworkDevice, RouteEntry } from '@/types/network'

function route(entry: Pick<RouteEntry, 'network' | 'netmask' | 'type'> & Partial<RouteEntry>): RouteEntry {
  return { nextHop: '', interfaceName: '', metric: 0, ...entry }
}

function answerNetwork() {
  const sw = createDevice('switch', 100, 100)
  sw.name = 'SW1'
  sw.config.vlans = [{ id: 10, name: 'Sales' }, { id: 20, name: 'Eng' }]
  sw.ports[0].portMode = 'access'
  sw.ports[0].vlan = 10
  sw.ports[1].portMode = 'trunk'
  sw.ports[1].allowedVlans = [20, 10]
  sw.ports[1].nativeVlan = 99

  const router = createDevice('router', 400, 100)
  router.name = 'R1'
  router.ports[0].ipAddress = '10.0.0.1'
  router.ports[0].subnetMask = '255.255.255.0'
  router.ports[0].adminStatus = 'down'
  router.ports[1].ipAddress = '10.0.1.1'
  router.ports[1].subnetMask = '255.255.255.252'
  router.ports[1].adminStatus = 'up'
  router.routingTable = [
    route({ network: '10.0.0.0', netmask: '255.255.255.0', interfaceName: 'GigabitEthernet0/0', type: 'C' }),
    route({ network: '192.168.5.0', netmask: '255.255.255.0', nextHop: '10.0.1.2', type: 'S' }),
  ]
  router.config.ripNetworks = ['10.0.0.0']
  router.config.ripVersion = 2

  const pc = createDevice('pc', 200, 320)
  pc.name = 'PC1'
  pc.ports[0].ipAddress = '192.168.1.10'
  pc.ports[0].subnetMask = '255.255.255.0'
  pc.config.defaultGateway = '192.168.1.1'
  pc.config.dnsServer = '8.8.8.8'

  return { sw, router, pc }
}

function activityFrom(devices: NetworkDevice[]): AssessmentActivity {
  return {
    version: 1,
    name: 'VLAN & Routing Lab',
    author: 'Instructor',
    instructions: ['Create VLAN 10', 'Set the trunk'],
    createdAt: '2026-01-01T00:00:00.000Z',
    items: collectAssessmentCandidates(devices),
    answer: { devices: structuredClone(devices), links: [], annotations: [] },
  }
}

const specOf = (kind: ActivityFacetSpec['kind']) => (item: { spec: ActivityFacetSpec }) => item.spec.kind === kind
const l2Mode = (item: { spec: ActivityFacetSpec }, mode: string) => item.spec.kind === 'port-l2' && item.spec.mode === mode

test('candidate collection derives items from the answer network state', () => {
  const { sw, router, pc } = answerNetwork()
  const items = collectAssessmentCandidates([sw, router, pc])
  const kinds = (device: NetworkDevice) => items.filter(item => item.deviceId === device.id).map(item => item.spec.kind).sort()

  assert.deepEqual(kinds(sw), ['port-l2', 'port-l2', 'vlan', 'vlan'])
  assert.deepEqual(kinds(router), ['port-admin', 'port-ip', 'port-ip', 'route', 'routing-protocol'])
  assert.deepEqual(kinds(pc), ['default-gateway', 'dns-server', 'ipv4-address'])

  const trunk = items.find(item => l2Mode(item, 'trunk'))!
  assert.equal(trunk.expected, 'trunk, allowed 10,20, native VLAN 99')
  const access = items.find(item => l2Mode(item, 'access'))!
  assert.equal(access.expected, 'access VLAN 10')
  const vlan10 = items.find(item => specOf('vlan')(item) && (item.spec as { vlanId: number }).vlanId === 10)!
  assert.equal(vlan10.expected, 'name "Sales"')
  const staticRoute = items.find(specOf('route'))!
  assert.equal(staticRoute.expected, 'S 192.168.5.0 255.255.255.0 via 10.0.1.2')
  const rip = items.find(specOf('routing-protocol'))!
  assert.equal(rip.label, 'RIP')
  assert.equal(rip.expected, 'RIP v2: network 10.0.0.0')
  const host = items.find(specOf('ipv4-address'))!
  assert.equal(host.expected, 'IP 192.168.1.10 / 255.255.255.0')
})

test('default access ports and DHCP hosts contribute no items', () => {
  const bare = createDevice('switch', 0, 0)
  assert.equal(collectAssessmentCandidates([bare]).length, 0)

  const { pc } = answerNetwork()
  pc.config.dhcpEnabled = true
  assert.equal(collectAssessmentCandidates([pc]).length, 0)
})

test('trunk allowed-VLAN semantics follow all | none | list', () => {
  const sw = createDevice('switch', 0, 0)
  sw.ports[0].portMode = 'trunk'
  const expected = () => collectAssessmentCandidates([sw]).find(item => item.spec.kind === 'port-l2')!.expected
  sw.ports[0].allowedVlans = undefined
  assert.equal(expected(), 'trunk, allowed all, native VLAN 1')
  sw.ports[0].allowedVlans = []
  assert.equal(expected(), 'trunk, allowed none, native VLAN 1')
  sw.ports[0].allowedVlans = [10]
  assert.equal(expected(), 'trunk, allowed 10, native VLAN 1')
})

test('clearing removes exactly the assessed facets', () => {
  const { sw, router, pc } = answerNetwork()
  const activity = activityFrom([sw, router, pc])
  const initial = deriveInitialNetwork(activity)

  const swInit = initial.devices.find(device => device.id === sw.id)!
  assert.deepEqual(swInit.config.vlans, [])
  assert.equal(swInit.ports[0].portMode, 'access')
  assert.equal(swInit.ports[0].vlan, 1)
  assert.equal(swInit.ports[1].portMode, 'access')
  assert.equal(swInit.ports[1].vlan, 1)
  assert.equal(swInit.ports[1].allowedVlans, undefined)
  assert.equal(swInit.ports[1].nativeVlan, undefined)

  const routerInit = initial.devices.find(device => device.id === router.id)!
  assert.equal(routerInit.ports[0].ipAddress, undefined)
  assert.equal(routerInit.ports[0].subnetMask, undefined)
  assert.equal(routerInit.ports[1].ipAddress, undefined)
  assert.equal(routerInit.ports[1].adminStatus, 'down')
  assert.deepEqual(routerInit.routingTable.map(entry => entry.type), ['C'])
  assert.deepEqual(routerInit.config.ripNetworks, [])
  assert.equal(routerInit.config.ripVersion, undefined)

  const pcInit = initial.devices.find(device => device.id === pc.id)!
  assert.equal(pcInit.ports[0].ipAddress, undefined)
  assert.equal(pcInit.config.defaultGateway, undefined)
  assert.equal(pcInit.config.dnsServer, undefined)

  // The answer network itself is never mutated.
  assert.equal(router.ports[0].ipAddress, '10.0.0.1')
  assert.equal(sw.config.vlans?.length, 2)
})

test('grading compares live state: initial fails, answer passes, partial fixes count', () => {
  const { sw, router, pc } = answerNetwork()
  const activity = activityFrom([sw, router, pc])
  const items = activity.items
  const initial = deriveInitialNetwork(activity)

  assert.equal(evaluateActivityItems(initial.devices, items).every(check => check.status === 'failed'), true)
  const answerChecks = evaluateActivityItems(activity.answer.devices, items)
  assert.equal(answerChecks.every(check => check.status === 'successful'), true)
  assert.deepEqual(scoreActivity(answerChecks), { passed: items.length, total: items.length, percent: 100 })

  const partial = clearAssessedConfig(activity.answer.devices, items)
  const swNow = partial.find(device => device.id === sw.id)!
  swNow.config.vlans = [{ id: 10, name: 'Sales' }]
  const pcNow = partial.find(device => device.id === pc.id)!
  pcNow.ports[0].ipAddress = '192.168.1.10'
  pcNow.ports[0].subnetMask = '255.255.255.0'

  const checks = evaluateActivityItems(partial, items)
  assert.deepEqual(scoreActivity(checks), { passed: 2, total: items.length, percent: Math.round((2 / items.length) * 100) })
  assert.ok(checks.some(check => check.observed === 'no address'))
  assert.ok(checks.some(check => check.observed === 'administratively down'))
  const vlan20 = items.find(item => specOf('vlan')(item) && (item.spec as { vlanId: number }).vlanId === 20)!
  assert.equal(checks.find(check => check.id === vlan20.id)!.observed, 'no VLAN 20')
  const routerNow = partial.find(device => device.id === router.id)!
  assert.equal(routerNow.routingTable.every(entry => entry.type === 'C'), true)
})

test('switch IP routing and L2 default gateway are assessed when present', () => {
  const sw = createDevice('switch', 0, 0)
  sw.config.ipRouting = true
  sw.config.defaultGateway = '10.0.0.254'
  const items = collectAssessmentCandidates([sw])
  assert.deepEqual(items.map(item => item.spec.kind), ['ip-routing'])
  assert.equal(clearAssessedConfig([sw], items)[0].config.ipRouting, false)

  const l2 = createDevice('switch', 0, 0)
  l2.config.defaultGateway = '10.0.0.254'
  assert.deepEqual(collectAssessmentCandidates([l2]).map(item => item.spec.kind), ['default-gateway'])
})

test('activity files serialize, parse, and slug file names', () => {
  const { sw, router, pc } = answerNetwork()
  const activity = activityFrom([sw, router, pc])
  const parsed = parseActivity(JSON.parse(serializeActivity(activity)))
  assert.equal(parsed.name, activity.name)
  assert.equal(parsed.author, activity.author)
  assert.deepEqual(parsed.items, activity.items)
  assert.equal(parsed.answer.devices.length, 3)
  assert.equal(activityFileName('VLAN & Routing Lab!'), 'vlan-routing-lab.wxact.json')
  assert.equal(activityFileSlug('مختبر'), 'activity')
})

test('parseActivity rejects malformed activity files', () => {
  const { sw } = answerNetwork()
  const items = collectAssessmentCandidates([sw])
  const answer = { devices: [sw], links: [], annotations: [] }
  const valid = { version: 1, name: 'Mini Lab', author: '', instructions: ['Do it'], createdAt: '', items, answer }
  assert.equal(parseActivity(valid).items.length, items.length)
  assert.throws(() => parseActivity('nope'), /valid wireX activity file/)
  assert.throws(() => parseActivity({ ...valid, version: 2 }), /version is not supported/)
  assert.throws(() => parseActivity({ ...valid, name: '   ' }), /activity name/)
  assert.throws(() => parseActivity({ ...valid, items: [] }), /no assessment items/)
  assert.throws(() => parseActivity({ ...valid, items: [{ ...items[0], deviceId: 'ghost-device' }] }), /invalid assessment item/)
  assert.throws(() => parseActivity({ ...valid, items: [{ ...items[0], spec: { kind: 'vlan', vlanId: 0, name: 'X' } }] }), /invalid assessment item/)
  assert.throws(() => parseActivity({ ...valid, answer: { devices: [sw, structuredClone(sw)], links: [], annotations: [] } }), /invalid answer network/)
  assert.throws(() => parseActivity({ ...valid, answer: { devices: [sw], links: [{ id: 'l1', fromDeviceId: sw.id, toDeviceId: 'ghost' }] as never, annotations: [] } }), /invalid answer network/)
})

function serviceRouter() {
  const router = createDevice('router', 0, 0)
  router.name = 'R2'
  router.ports[0].ipAddress = '10.0.0.1'
  router.ports[0].subnetMask = '255.255.255.0'
  router.config.dhcpPools = [{ name: 'LAN', network: '10.0.0.0', mask: '255.255.255.0', defaultRouter: '10.0.0.1', dnsServer: '8.8.8.8', leaseDurationSeconds: 86400 }]
  router.config.accessLists = [{
    id: '101', number: 101, type: 'extended',
    rules: [{ type: 'extended', action: 'permit', protocol: 'tcp', sourceIp: '10.0.0.0', sourceWildcard: '0.0.0.255', destIp: '192.168.1.0', destWildcard: '0.0.0.255', destPort: 80 }],
  }]
  router.ports[1].hsrpGroups = [{ group: 10, virtualIp: '10.0.1.1', priority: 110, preempt: true }]
  router.ports[1].ipv6Addresses = [{ address: '2001:db8:1::1', prefixLength: 64, source: 'static' }]
  return router
}

test('DHCP pools, ACLs, HSRP groups and IPv6 addresses become assessment items', () => {
  const router = serviceRouter()
  const items = collectAssessmentCandidates([router])
  const byKind = (kind: ActivityFacetSpec['kind']) => items.find(item => item.spec.kind === kind)!
  const hsrpPort = router.ports[1]
  const hsrpLabel = hsrpPort.shortName || hsrpPort.name

  assert.equal(byKind('dhcp-pool').label, 'DHCP pool LAN')
  assert.equal(byKind('dhcp-pool').expected, 'LAN: 10.0.0.0 255.255.255.0 (gateway 10.0.0.1, DNS 8.8.8.8, lease 86400s)')
  assert.equal(byKind('acl').label, 'ACL 101')
  assert.equal(byKind('acl').expected, '101 extended: permit tcp 10.0.0.0 0.0.0.255 192.168.1.0 0.0.0.255 eq 80')
  assert.equal(byKind('hsrp').label, `${hsrpLabel} HSRP 10`)
  assert.equal(byKind('hsrp').expected, 'group 10 virtual 10.0.1.1, priority 110, preempt')
  assert.equal(byKind('ipv6-address').label, hsrpLabel)
  assert.equal(byKind('ipv6-address').expected, 'IPv6 2001:db8:1::1/64')
})

test('the new facets are cleared for students and graded against live state', () => {
  const router = serviceRouter()
  const activity = activityFrom([router])
  const initial = deriveInitialNetwork(activity)
  const student = initial.devices[0]
  assert.deepEqual(student.config.dhcpPools, [])
  assert.deepEqual(student.config.accessLists, [])
  assert.equal(student.ports[1].hsrpGroups, undefined)
  assert.equal(student.ports[1].ipv6Addresses, undefined)

  const newKinds = new Set<ActivityFacetSpec['kind']>(['dhcp-pool', 'acl', 'hsrp', 'ipv6-address'])
  const isNew = (id: string) => newKinds.has(activity.items.find(item => item.id === id)!.spec.kind)
  assert.ok(evaluateActivityItems(initial.devices, activity.items).filter(check => isNew(check.id)).every(check => check.status === 'failed'))
  assert.ok(evaluateActivityItems([router], activity.items).every(check => check.status === 'successful'))

  const changed = structuredClone(router)
  changed.config.dhcpPools![0].dnsServer = '1.1.1.1'
  changed.config.accessLists![0].rules[0].action = 'deny'
  changed.ports[1].hsrpGroups![0].priority = 90
  changed.ports[1].ipv6Addresses![0].prefixLength = 48
  const checks = evaluateActivityItems([changed], activity.items)
  assert.ok(checks.filter(check => isNew(check.id)).every(check => check.status === 'failed'))
})

test('activity files round-trip the DHCP, ACL, HSRP and IPv6 snapshots', () => {
  const router = serviceRouter()
  const noop = structuredClone(router)
  noop.config.ospfPassiveDefault = false
  noop.config.ospfPassiveInterfaces = []
  noop.config.ospfActiveInterfaces = [router.ports[0].name]
  assert.equal(collectAssessmentCandidates([noop]).filter(item =>
    item.spec.kind === 'routing-option' && item.spec.protocol === 'ospf' && item.spec.option === 'passive').length, 0)

  const activity = activityFrom([router])
  const parsed = parseActivity(JSON.parse(serializeActivity(activity)))
  assert.deepEqual(parsed.items, activity.items)
})

test('parseActivity rejects invalid new facet payloads', () => {
  const router = serviceRouter()
  const raw = JSON.parse(serializeActivity(activityFrom([router]))) as { items: Array<{ spec: { kind: string; group?: number } }> }
  const hsrp = raw.items.find(item => item.spec.kind === 'hsrp')!
  hsrp.spec.group = 999
  assert.throws(() => parseActivity(raw), /invalid assessment item/)
})

function routingOptionRouter() {
  const router = createDevice('router', 0, 0)
  router.config.ospfProcessId = 1
  router.config.ospfNetworks = [{ network: '10.0.0.0', wildcard: '0.0.0.255', area: 0 }]
  router.config.ospfRouterId = '1.1.1.1'
  router.config.ospfPassiveDefault = true
  router.config.ospfActiveInterfaces = [router.ports[0].name]
  router.config.eigrpAs = 100
  router.config.eigrpNetworks = [{ network: '10.0.0.0', wildcard: '0.0.0.255' }]
  router.config.eigrpRouterId = '2.2.2.2'
  router.config.eigrpPassiveInterfaces = [router.ports[1].name]
  router.config.ripNetworks = ['10.0.0.0']
  router.config.ripPassiveDefault = true
  router.config.ripActiveInterfaces = [router.ports[1].name]
  router.config.bgpAs = 65000
  router.config.bgpRouterId = '3.3.3.3'
  router.config.bgpNetworks = [{ network: '10.0.0.0', mask: '255.255.255.0' }]
  return router
}

test('OSPF and EIGRP router-id and passive-interface state become assessment items', () => {
  const router = routingOptionRouter()
  const items = collectAssessmentCandidates([router])
  const optionItems = items.filter(item => item.spec.kind === 'routing-option')
  const byProtocol = (protocol: string, option: string) => optionItems.find(item =>
    item.spec.kind === 'routing-option' && item.spec.protocol === protocol && item.spec.option === option)!

  assert.equal(byProtocol('ospf', 'router-id').label, 'OSPF router-id')
  assert.equal(byProtocol('ospf', 'router-id').expected, 'OSPF router-id 1.1.1.1')
  assert.equal(byProtocol('ospf', 'passive').label, 'OSPF passive interfaces')
  assert.equal(byProtocol('ospf', 'passive').expected, `OSPF passive default, except ${router.ports[0].name}`)
  assert.equal(byProtocol('eigrp', 'router-id').expected, 'EIGRP router-id 2.2.2.2')
  assert.equal(byProtocol('eigrp', 'passive').expected, `EIGRP passive ${router.ports[1].name}`)
  assert.equal(byProtocol('rip', 'passive').expected, `RIP passive default, except ${router.ports[1].name}`)
  assert.equal(byProtocol('bgp', 'router-id').expected, 'BGP router-id 3.3.3.3')

  const initial = clearAssessedConfig([router], optionItems)[0]
  assert.equal(initial.config.ospfRouterId, undefined)
  assert.equal(initial.config.eigrpRouterId, undefined)
  assert.equal(initial.config.bgpRouterId, undefined)
  assert.equal(initial.config.ospfPassiveDefault, false)
  assert.equal(initial.config.ripPassiveDefault, false)
  assert.deepEqual(initial.config.ospfPassiveInterfaces, [])
  assert.deepEqual(initial.config.ospfActiveInterfaces, [])
  assert.deepEqual(initial.config.eigrpPassiveInterfaces, [])
  assert.equal(initial.config.ospfProcessId, 1)
  assert.deepEqual(initial.config.ospfNetworks, router.config.ospfNetworks)
  assert.equal(router.config.ospfRouterId, '1.1.1.1')

  assert.ok(evaluateActivityItems([initial], optionItems).every(check => check.status === 'failed'))
  assert.ok(evaluateActivityItems([router], optionItems).every(check => check.status === 'successful'))

  const changedId = structuredClone(router)
  changedId.config.ospfRouterId = '9.9.9.9'
  const idCheck = evaluateActivityItems([changedId], [byProtocol('ospf', 'router-id')])[0]
  assert.equal(idCheck.status, 'failed')
  assert.equal(idCheck.observed, 'OSPF router-id 9.9.9.9')

  const changedPassive = structuredClone(router)
  changedPassive.config.ospfPassiveDefault = false
  changedPassive.config.ospfActiveInterfaces = []
  const passiveCheck = evaluateActivityItems([changedPassive], [byProtocol('ospf', 'passive')])[0]
  assert.equal(passiveCheck.status, 'failed')
  assert.equal(passiveCheck.observed, 'OSPF passive interfaces not set')

  const noop = structuredClone(router)
  noop.config.ospfPassiveDefault = false
  noop.config.ospfPassiveInterfaces = []
  noop.config.ospfActiveInterfaces = [router.ports[0].name]
  assert.equal(collectAssessmentCandidates([noop]).filter(item =>
    item.spec.kind === 'routing-option' && item.spec.protocol === 'ospf' && item.spec.option === 'passive').length, 0)

  const activity = activityFrom([router])
  const parsed = parseActivity(JSON.parse(serializeActivity(activity)))
  assert.deepEqual(parsed.items, activity.items)
})

test('parseActivity rejects impossible routing-option facets', () => {
  const router = routingOptionRouter()
  const raw = JSON.parse(serializeActivity(activityFrom([router]))) as { items: Array<{ spec: { kind: string; protocol?: string; option?: string } }> }
  const option = raw.items.find(item => item.spec.kind === 'routing-option')!
  option.spec.protocol = 'rip'
  option.spec.option = 'router-id'
  assert.throws(() => parseActivity(raw), /invalid assessment item/)
  option.spec.protocol = 'bgp'
  option.spec.option = 'passive'
  assert.throws(() => parseActivity(raw), /invalid assessment item/)
  option.spec.protocol = 'ospf'
  option.spec.option = 'bogus'
  assert.throws(() => parseActivity(raw), /invalid assessment item/)
})

function wirelessAp() {
  const ap = createDevice('wireless', 0, 0, 'AccessPoint-PT')
  ap.name = 'AP1'
  ap.config.wirelessSsid = 'SecureLab'
  ap.config.wirelessChannel = 11
  ap.config.wirelessAuthentication = 'wpa2-psk'
  ap.config.wirelessPassphrase = 'wirexpass'
  ap.config.wirelessEncryption = 'aes'
  return ap
}

test('wireless access point settings become a graded, clearable facet', () => {
  const ap = wirelessAp()
  const items = collectAssessmentCandidates([ap])
  const item = items.find(candidate => candidate.spec.kind === 'wireless')!
  assert.equal(item.label, 'Wireless settings')
  assert.equal(item.expected, 'SecureLab · channel 11 · WPA2-PSK / AES, key set')

  const initial = clearAssessedConfig([ap], [item])[0]
  assert.equal(initial.config.wirelessSsid, 'Default')
  assert.equal(initial.config.wirelessChannel, 6)
  assert.equal(initial.config.wirelessAuthentication, 'open')
  assert.equal(initial.config.wirelessPassphrase, '')
  assert.equal(initial.config.wirelessWepKey, '')
  assert.equal(initial.config.wirelessEncryption, 'aes')

  const initialCheck = evaluateActivityItems([initial], [item])[0]
  assert.equal(initialCheck.status, 'failed')
  assert.equal(initialCheck.observed, 'Default · channel 6 · Open')
  const correctCheck = evaluateActivityItems([ap], [item])[0]
  assert.equal(correctCheck.status, 'successful')
  assert.equal(correctCheck.observed, 'SecureLab · channel 11 · WPA2-PSK / AES, key set')

  const wrongKey = structuredClone(ap)
  wrongKey.config.wirelessPassphrase = 'wrongpass'
  const keyCheck = evaluateActivityItems([wrongKey], [item])[0]
  assert.equal(keyCheck.status, 'failed')
  assert.equal(keyCheck.observed, 'SecureLab · channel 11 · WPA2-PSK / AES, key set (key mismatch)')
  assert.doesNotMatch(keyCheck.observed, /wirexpass|wrongpass/)

  const wrongSsid = structuredClone(ap)
  wrongSsid.config.wirelessSsid = 'Guest'
  const ssidCheck = evaluateActivityItems([wrongSsid], [item])[0]
  assert.equal(ssidCheck.status, 'failed')
  assert.equal(ssidCheck.observed, 'Guest · channel 11 · WPA2-PSK / AES, key set')
})

test('WEP keys compare case-insensitively', () => {
  const ap = createDevice('wireless', 0, 0, 'AccessPoint-PT')
  ap.name = 'AP1'
  ap.config.wirelessSsid = 'Lab'
  ap.config.wirelessAuthentication = 'wep'
  ap.config.wirelessWepKey = 'AABBCCDDEE'
  const item = collectAssessmentCandidates([ap]).find(candidate => candidate.spec.kind === 'wireless')!
  assert.equal(JSON.parse((item.spec as { snapshot: string }).snapshot).key, 'aabbccddee')
  const lower = structuredClone(ap)
  lower.config.wirelessWepKey = 'aabbccddee'
  assert.equal(evaluateActivityItems([lower], [item])[0].status, 'successful')
  const wrong = structuredClone(ap)
  wrong.config.wirelessWepKey = '0011223344'
  assert.equal(evaluateActivityItems([wrong], [item])[0].status, 'failed')
})

test('default APs, lightweight APs and cell towers contribute no wireless item', () => {
  const defaultAp = createDevice('wireless', 0, 0, 'AccessPoint-PT')
  assert.equal(collectAssessmentCandidates([defaultAp]).filter(item => item.spec.kind === 'wireless').length, 0)

  const homeRouter = createDevice('wireless', 0, 0, 'HomeRouter-PT-AC')
  assert.equal(collectAssessmentCandidates([homeRouter]).filter(item => item.spec.kind === 'wireless').length, 0)
  homeRouter.config.wirelessChannel = 11
  assert.equal(collectAssessmentCandidates([homeRouter]).find(item => item.spec.kind === 'wireless')!.expected, 'linksys · channel 11 · Open')

  const lightweight = createDevice('wireless', 0, 0, 'LAP-PT')
  lightweight.config.wirelessSsid = 'Managed'
  lightweight.config.wirelessAuthentication = 'wpa2-psk'
  lightweight.config.wirelessPassphrase = 'managed1'
  assert.equal(collectAssessmentCandidates([lightweight]).filter(item => item.spec.kind === 'wireless').length, 0)

  const cellTower = createDevice('wireless', 0, 0, 'Cell-Tower')
  cellTower.config.wirelessSsid = 'Cellular'
  assert.equal(collectAssessmentCandidates([cellTower]).filter(item => item.spec.kind === 'wireless').length, 0)
})

test('activity files round-trip wireless snapshots and reject malformed ones', () => {
  const ap = wirelessAp()
  const activity = activityFrom([ap])
  const parsed = parseActivity(JSON.parse(serializeActivity(activity)))
  assert.deepEqual(parsed.items, activity.items)

  const raw = JSON.parse(serializeActivity(activity)) as { items: Array<{ spec: { kind: string; snapshot?: string } }> }
  const wireless = raw.items.find(item => item.spec.kind === 'wireless')!
  wireless.spec.snapshot = JSON.stringify({ ssid: 'SecureLab', channel: 99, authentication: 'open', encryption: null, key: '' })
  assert.throws(() => parseActivity(raw), /invalid assessment item/)
  wireless.spec.snapshot = JSON.stringify({ ssid: 'SecureLab', channel: 6, authentication: 'open', encryption: 'aes', key: '' })
  assert.throws(() => parseActivity(raw), /invalid assessment item/)
  wireless.spec.snapshot = JSON.stringify({ ssid: 'SecureLab', channel: 6, authentication: 'wpa2-psk', encryption: 'aes', key: '' })
  assert.doesNotThrow(() => parseActivity(raw))
})
