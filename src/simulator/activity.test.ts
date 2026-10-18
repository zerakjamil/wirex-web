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
