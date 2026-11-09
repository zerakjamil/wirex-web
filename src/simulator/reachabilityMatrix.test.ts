import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPredictedMidterm2026Lab } from './pastExamLabs'
import { diagnoseStageInvariants } from './midtermDiagnostics'
import { useNetworkStore } from '../store/networkStore'
import { useMidtermQuestStore } from '../store/midtermQuestStore'

test('full-mesh protocol diagnostics isolate exact L1-L3 fault layers', () => {
  const lab = getPredictedMidterm2026Lab()

  // 1. Unconfigured initial state -> Stage 1 diagnostics flag missing VLAN 10 & 20
  const stage1Findings = diagnoseStageInvariants(1, lab.devices, lab.links)
  assert.ok(stage1Findings.some((f) => f.layer === 'L2_DATALINK' && f.diagnosis.includes('VLAN 10 is missing on SW1-Distribution')))
  assert.ok(stage1Findings.some((f) => f.layer === 'L2_DATALINK' && f.diagnosis.includes('VLAN 20 is missing on SW1-Distribution')))

  // 2. Unconfigured access ports -> Stage 2 diagnostics flag access mode and missing PortFast
  const stage2Findings = diagnoseStageInvariants(2, lab.devices, lab.links)
  assert.ok(stage2Findings.some((f) => f.layer === 'L2_DATALINK' && f.interfaceName === 'fa0/1'))
  assert.ok(stage2Findings.some((f) => f.layer === 'L2_STP' && f.diagnosis.includes('PortFast')))

  // 3. Unconfigured trunks -> Stage 3 diagnostics flag inter-switch trunk fault
  const stage3Findings = diagnoseStageInvariants(3, lab.devices, lab.links)
  assert.ok(stage3Findings.some((f) => f.layer === 'L2_TRUNK' && f.interfaceName === 'Gi0/1'))

  // 4. Router parent down -> Stage 4 diagnostics flag L1 physical shutdown
  const router = lab.devices.find((d) => d.id === 'pred-r1')!
  const parent = router.ports.find((p) => p.shortName.toLowerCase() === 'gi0/0')!
  parent.adminStatus = 'down'

  const stage4Findings = diagnoseStageInvariants(4, lab.devices, lab.links)
  assert.ok(stage4Findings.some((f) => f.layer === 'L1_PHYSICAL' && f.diagnosis.includes('Gi0/0 is administratively down')))
  assert.ok(stage4Findings.some((f) => f.layer === 'L3_ENCAPSULATION' && f.interfaceName === 'Gi0/0.10'))
})

test('full-mesh reachability matrix: intra-VLAN and inter-VLAN routed delivery', () => {
  // Load predicted midterm lab
  useMidtermQuestStore.getState().startQuest('predicted-2026')
  const net = useNetworkStore.getState()

  const sw1 = net.devices.find((d) => d.id === 'pred-sw1')!
  const sw2 = net.devices.find((d) => d.id === 'pred-sw2')!
  const sw3 = net.devices.find((d) => d.id === 'pred-sw3')!
  const router = net.devices.find((d) => d.id === 'pred-r1')!
  const stu1 = net.devices.find((d) => d.id === 'pred-pc-stu1')!
  const stu2 = net.devices.find((d) => d.id === 'pred-pc-stu2')!
  const tch1 = net.devices.find((d) => d.id === 'pred-pc-tch1')!

  // 1. Configure VLANs on switches
  for (const sw of [sw1, sw2, sw3]) {
    sw.config.vlans = [
      { id: 1, name: 'default' },
      { id: 10, name: 'Students' },
      { id: 20, name: 'Teachers' },
      { id: 30, name: 'Admin' },
    ]
  }

  // 2. Configure Access Ports & PortFast
  for (const sw of [sw1, sw2, sw3]) {
    for (const p of sw.ports) {
      if (p.shortName.toLowerCase().startsWith('fa0/1') || p.shortName.toLowerCase().startsWith('fa0/2')) {
        p.portMode = 'access'
        p.vlan = sw === sw1 ? 10 : sw === sw2 ? 20 : 30
        p.portfast = true
        p.adminStatus = 'up'
        p.status = 'up'
      }
    }
  }

  // 3. Configure 802.1Q Trunks
  for (const sw of [sw1, sw2, sw3]) {
    for (const p of sw.ports) {
      if (['gi0/1', 'gi0/2', 'fa0/24'].includes(p.shortName.toLowerCase()) && p.connectedLinkId) {
        p.portMode = 'trunk'
        p.adminStatus = 'up'
        p.status = 'up'
      }
    }
  }

  // 4. Configure Router-on-a-Stick Subinterfaces
  const parentPort = router.ports.find((p) => p.shortName.toLowerCase() === 'gi0/0')!
  parentPort.adminStatus = 'up'
  parentPort.status = 'up'

  // Subinterface Gi0/0.10
  router.ports.push({
    id: 'r1-sub-10',
    name: 'GigabitEthernet0/0.10',
    shortName: 'Gi0/0.10',
    type: 'gigabitethernet',
    macAddress: parentPort.macAddress,
    adminStatus: 'up',
    status: 'up',
    parentPortId: parentPort.id,
    dot1qVlan: 10,
    ipAddress: '10.10.10.1',
    subnetMask: '255.255.255.128',
  })

  // Subinterface Gi0/0.20
  router.ports.push({
    id: 'r1-sub-20',
    name: 'GigabitEthernet0/0.20',
    shortName: 'Gi0/0.20',
    type: 'gigabitethernet',
    macAddress: parentPort.macAddress,
    adminStatus: 'up',
    status: 'up',
    parentPortId: parentPort.id,
    dot1qVlan: 20,
    ipAddress: '10.10.10.129',
    subnetMask: '255.255.255.192',
  })

  // Subinterface Gi0/0.30
  router.ports.push({
    id: 'r1-sub-30',
    name: 'GigabitEthernet0/0.30',
    shortName: 'Gi0/0.30',
    type: 'gigabitethernet',
    macAddress: parentPort.macAddress,
    adminStatus: 'up',
    status: 'up',
    parentPortId: parentPort.id,
    dot1qVlan: 30,
    ipAddress: '10.10.11.1',
    subnetMask: '255.255.255.224',
  })

  // 5. Verify Invariant Evaluators pass 100%
  const stg1 = diagnoseStageInvariants(1, net.devices, net.links)
  assert.equal(stg1.length, 0, 'Stage 1 VLAN invariants must pass with 0 faults')

  const stg2 = diagnoseStageInvariants(2, net.devices, net.links)
  assert.equal(stg2.length, 0, 'Stage 2 Access/PortFast invariants must pass with 0 faults')

  const stg3 = diagnoseStageInvariants(3, net.devices, net.links)
  assert.equal(stg3.length, 0, 'Stage 3 Trunk invariants must pass with 0 faults')

  const stg4 = diagnoseStageInvariants(4, net.devices, net.links)
  assert.equal(stg4.length, 0, 'Stage 4 Router-on-a-stick invariants must pass with 0 faults')

  // 6. Test Intra-VLAN Addressing
  assert.equal(stu1.config.defaultGateway, '10.10.10.1')
  assert.equal(stu2.config.defaultGateway, '10.10.10.1')

  // 7. Test Inter-VLAN Addressing
  assert.equal(tch1.ports[0].ipAddress, '10.10.10.131')
  assert.equal(tch1.config.defaultGateway, '10.10.10.129')

  // Cleanup
  useMidtermQuestStore.getState().exitQuest()
})
