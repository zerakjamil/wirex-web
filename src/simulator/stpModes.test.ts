import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { createTrainingLab } from './trainingLabs'
import { getPrompt, parseIosCommand } from './ios/ciscoParser'
import {
  STP_RAPID_SYNC_TICKS,
  advanceStpPortStates,
  compressVlanRanges,
  formatMstConfiguration,
  formatStpInstanceView,
  formatStpSummary,
  formatStpVlanView,
  getStpTopology,
  mstInstanceForVlan,
  prepareStpTick,
  receiveStpBpdu,
  stpInstanceVlans,
  stpPriorityForVlan,
} from './spanningTree'
import type { NetworkDevice, NetworkLink } from '../types/network'

function runCli(device: NetworkDevice, command: string) {
  const result = parseIosCommand(device, command)
  if (result.newDeviceConfig) device.config = { ...device.config, ...result.newDeviceConfig }
  if (result.modifiedPorts) device.ports = device.ports.map(port => {
    const mod = result.modifiedPorts?.find(entry => entry.portId === port.id)
    return mod ? { ...port, ...mod } : port
  })
  if (result.newMode) device.currentCliMode = result.newMode
  return result
}

function activateSwitchPorts(devices: NetworkDevice[], state: 'listening' | 'forwarding' = 'listening') {
  return devices.map(device => device.type !== 'switch' ? device : {
    ...device,
    ports: device.ports.map(port => port.connectedLinkId ? { ...port, adminStatus: 'up' as const, stpState: state, stpSinceTick: 0, stpVlanStates: undefined } : port),
  })
}

function converge(devices: NetworkDevice[], links: NetworkLink[], ticks: number) {
  let current = devices
  for (let tick = 1; tick <= ticks; tick++) {
    const prepared = prepareStpTick(current, links, tick)
    current = prepared.devices
    for (const frame of prepared.outbound) {
      const link = links.find(candidate => candidate.id === frame.linkId)!
      if (link.status !== 'up') continue
      const receiverId = link.fromDeviceId === frame.deviceId ? link.toDeviceId : link.fromDeviceId
      const receiverPortId = link.fromDeviceId === frame.deviceId ? link.toPortId : link.fromPortId
      receiveStpBpdu(current.find(device => device.id === receiverId)!, receiverPortId, link.id, frame.deviceId, frame.pdu, tick)
    }
    current = advanceStpPortStates(current, links, tick)
  }
  return current
}

test('spanning-tree mode and MST region CLI drive the running config and show views', () => {
  const sw = createDevice('switch', 0, 0)
  sw.id = 'mst-sw'
  sw.name = 'MST-SW'
  sw.config.hostname = 'MST-SW'
  sw.currentCliMode = 'config'
  assert.equal(runCli(sw, 'spanning-tree mode bogus').output, '% Specify spanning-tree mode pvst|rapid-pvst|mst.')
  runCli(sw, 'spanning-tree mode rapid-pvst')
  assert.equal(sw.config.stpMode, 'rapid-pvst')
  runCli(sw, 'spanning-tree mst configuration')
  assert.equal(sw.currentCliMode, 'config-mst')
  assert.equal(getPrompt(sw), 'MST-SW(config-mst)#')
  runCli(sw, 'name WIREX')
  runCli(sw, 'revision 7')
  runCli(sw, 'instance 1 vlan 10,20')
  runCli(sw, 'instance 2 vlan 30-31')
  assert.deepEqual(sw.config.mstInstances, [{ instance: 1, vlans: [10, 20] }, { instance: 2, vlans: [30, 31] }])
  const mstView = runCli(sw, 'show spanning-tree mst configuration').output
  assert.match(mstView, /Name      \[WIREX\]/)
  assert.match(mstView, /Revision  7     Instances configured 3/)
  assert.match(mstView, /1         10,20/)
  assert.match(mstView, /2         30-31/)
  assert.match(mstView, /^0         1-9,11-19,21-29,32-4094$/m)
  runCli(sw, 'instance 2 vlan 20')
  assert.deepEqual(sw.config.mstInstances, [{ instance: 1, vlans: [10] }, { instance: 2, vlans: [20, 30, 31] }])
  runCli(sw, 'no instance 2')
  assert.deepEqual(sw.config.mstInstances, [{ instance: 1, vlans: [10] }])
  assert.equal(runCli(sw, 'revision 70000').output, '% Revision must be an integer 0-65535.')
  assert.equal(runCli(sw, 'instance 0 vlan 10').output, '% Instance must be an integer 1-4094.')
  runCli(sw, 'exit')
  assert.equal(sw.currentCliMode, 'config')
  runCli(sw, 'spanning-tree mst 1 priority 4096')
  runCli(sw, 'spanning-tree mst 2 root primary')
  assert.deepEqual(sw.config.mstPriorities, { '1': 4096, '2': 24576 })
  runCli(sw, 'no spanning-tree mst 2 priority')
  assert.deepEqual(sw.config.mstPriorities, { '1': 4096 })
  runCli(sw, 'no spanning-tree mode')
  assert.equal(sw.config.stpMode, undefined)
  runCli(sw, 'spanning-tree mode rapid-pvst')
  runCli(sw, 'end')
  assert.match(runCli(sw, 'show spanning-tree summary').output, /Switch is in rapid-pvst mode/)
  const running = runCli(sw, 'show running-config').output
  assert.match(running, /spanning-tree mode rapid-pvst/)
  assert.match(running, /spanning-tree mst 1 priority 4096/)
  assert.match(running, /spanning-tree mst configuration/)
  assert.match(running, / instance 1 vlan 10/)
})

test('rapid-pvst forwards after a sub-second sync while pvst keeps the two 15-second delays', () => {
  const lab = createTrainingLab('stp', 'guided')
  const converged = converge(activateSwitchPorts(lab.devices), lab.links, 40)
  const tree = getStpTopology(converged, lab.links, 10)
  const rootEntry = [...tree.ports].find(([, port]) => port.role === 'Root')!
  const [rootDeviceId, rootPortId] = rootEntry[0].split('|')
  const freshState = (mode: 'rapid-pvst' | undefined, shared = false) => converged.map(device => device.id !== rootDeviceId ? device : {
    ...device,
    config: mode ? { ...device.config, stpMode: mode } : device.config,
    ports: device.ports.map(port => port.id === rootPortId ? { ...port, stpState: 'listening' as const, stpSinceTick: 0, stpVlanStates: undefined, stpLinkType: shared ? 'shared' as const : undefined } : port),
  })
  const portState = (devices: NetworkDevice[]) => devices.find(device => device.id === rootDeviceId)!.ports.find(port => port.id === rootPortId)!.stpState
  const rapid = freshState('rapid-pvst')
  const rapidSync = advanceStpPortStates(rapid, lab.links, 1)
  assert.equal(portState(rapidSync), 'learning')
  const rapidForward = advanceStpPortStates(rapidSync, lab.links, 1 + STP_RAPID_SYNC_TICKS)
  assert.equal(portState(rapidForward), 'forwarding')
  const classic = freshState(undefined)
  const classicStart = advanceStpPortStates(classic, lab.links, 1)
  assert.equal(portState(classicStart), 'listening')
  const classicWait = advanceStpPortStates(classicStart, lab.links, 1 + STP_RAPID_SYNC_TICKS)
  assert.equal(portState(classicWait), 'listening')
  const sharedLink = freshState('rapid-pvst', true)
  const sharedStart = advanceStpPortStates(sharedLink, lab.links, 1)
  const sharedWait = advanceStpPortStates(sharedStart, lab.links, 1 + STP_RAPID_SYNC_TICKS)
  assert.equal(portState(sharedStart), 'listening')
  assert.equal(portState(sharedWait), 'listening')
})

test('rapid-pvst promotes a blocked alternate link in about a second after root-port loss', () => {
  const recover = (rapid: boolean) => {
    const lab = createTrainingLab('stp', 'guided')
    const withMode = activateSwitchPorts(rapid ? lab.devices.map(device => device.type !== 'switch' ? device : { ...device, config: { ...device.config, stpMode: 'rapid-pvst' as const } }) : lab.devices)
    let devices = converge(withMode, lab.links, 60)
    const tree = getStpTopology(devices, lab.links, 10)
    const alternate = [...tree.ports].find(([, port]) => port.role === 'Altn')!
    assert.ok(alternate, 'expected one blocked alternate link after convergence')
    const [alternateDeviceId, alternatePortId] = alternate[0].split('|')
    const alternateLink = lab.links.find(link => (link.fromDeviceId === alternateDeviceId && link.fromPortId === alternatePortId) || (link.toDeviceId === alternateDeviceId && link.toPortId === alternatePortId))!
    const rootPort = [...tree.ports].find(([key, port]) => key.startsWith(`${alternateDeviceId}|`) && port.role === 'Root')!
    const [rootDeviceId, rootPortId] = rootPort[0].split('|')
    const failedLink = lab.links.find(link => (link.fromDeviceId === rootDeviceId && link.fromPortId === rootPortId) || (link.toDeviceId === rootDeviceId && link.toPortId === rootPortId))!
    const failed = lab.links.map(link => link.id === failedLink.id ? { ...link, status: 'down' as const } : link)
    let recoveredAt: number | undefined
    for (let tick = 61; tick <= 620 && recoveredAt === undefined; tick++) {
      const prepared = prepareStpTick(devices, failed, tick)
      devices = prepared.devices
      for (const frame of prepared.outbound) {
        const link = failed.find(candidate => candidate.id === frame.linkId)!
        if (link.status !== 'up') continue
        const receiverId = link.fromDeviceId === frame.deviceId ? link.toDeviceId : link.fromDeviceId
        const receiverPortId = link.fromDeviceId === frame.deviceId ? link.toPortId : link.fromPortId
        receiveStpBpdu(devices.find(device => device.id === receiverId)!, receiverPortId, link.id, frame.deviceId, frame.pdu, tick)
      }
      devices = advanceStpPortStates(devices, failed, tick)
      if (getStpTopology(devices, failed, 10).forwardingLinks.has(alternateLink.id)) recoveredAt = tick - 60
    }
    return recoveredAt
  }
  const rapidRecovery = recover(true)
  const classicRecovery = recover(false)
  assert.ok(rapidRecovery !== undefined, 'rapid-pvst must restore the alternate link')
  assert.ok(rapidRecovery! <= 60, `rapid-pvst recovery took ${rapidRecovery} ticks`)
  assert.ok(classicRecovery === undefined || classicRecovery > 400, `pvst recovery was ${classicRecovery} ticks; expected the 30-second delays`)
})

test('MST instances steer VLAN 10 and VLAN 20 to different roots and ignore PVST priorities', () => {
  const lab = createTrainingLab('stp', 'guided')
  const configured = lab.devices.map(device => device.type !== 'switch' ? device : {
    ...device,
    config: {
      ...device.config,
      stpMode: 'mst' as const,
      vlans: [{ id: 1, name: 'default' }, { id: 10, name: 'Sales' }, { id: 20, name: 'Voice' }],
      mstInstances: [{ instance: 1, vlans: [10] }, { instance: 2, vlans: [20] }],
    },
  })
  const withPriorities = configured.map(device => device.id === 'campus-sw-a'
    ? { ...device, config: { ...device.config, mstPriorities: { '1': 4096 } } }
    : device.id === 'campus-sw-b'
      ? { ...device, config: { ...device.config, mstPriorities: { '2': 4096 }, stpPriorities: { '10': 0 } } }
      : device)
  const devices = converge(activateSwitchPorts(withPriorities), lab.links, 60)
  const switches = devices.filter(device => device.type === 'switch')
  const vlanTen = getStpTopology(devices, lab.links, 10)
  const vlanTwenty = getStpTopology(devices, lab.links, 20)
  for (const sw of switches) {
    assert.equal(vlanTen.roots.get(sw.id), 'campus-sw-a')
    assert.equal(vlanTwenty.roots.get(sw.id), 'campus-sw-b')
  }
  const switchA = devices.find(device => device.id === 'campus-sw-a')!
  const switchB = devices.find(device => device.id === 'campus-sw-b')!
  assert.equal(mstInstanceForVlan(switchA, 10), 1)
  assert.equal(mstInstanceForVlan(switchA, 1), 0)
  assert.equal(stpPriorityForVlan(switchB, 10), 32768)
  assert.equal(stpPriorityForVlan(switchA, 10), 4096)
  assert.equal(compressVlanRanges(stpInstanceVlans(switchA, 0)).startsWith('1-9'), true)
  assert.match(formatMstConfiguration(switchA), /Instance  Vlans mapped/)
  assert.match(formatMstConfiguration(switchA), /1         10/)
  assert.match(formatStpInstanceView(devices, lab.links, 'campus-sw-a', 1), /###### MST1        vlans mapped:   10/)
  assert.match(formatStpSummary(switchA), /Switch is in mst mode/)
})

test('show spanning-tree views report the configured mode and live forwarding state', () => {
  const lab = createTrainingLab('stp', 'guided')
  const rapid = lab.devices.map(device => device.type !== 'switch' ? device : { ...device, config: { ...device.config, stpMode: 'rapid-pvst' as const } })
  const devices = converge(activateSwitchPorts(rapid), lab.links, 40)
  const view = formatStpVlanView(devices, lab.links, 'campus-sw-a', 10)
  assert.match(view, /VLAN0010/)
  assert.match(view, /Spanning tree enabled protocol rstp/)
  assert.match(view, /Interface        Role Sts Cost/)
  const summary = formatStpSummary(devices.find(device => device.id === 'campus-sw-a')!)
  assert.match(summary, /Switch is in rapid-pvst mode/)
  assert.match(summary, /VLAN0010/)
})
