import type { NetworkDevice, NetworkLink } from '@/types/network'

export type ProtocolLayer = 'L1_PHYSICAL' | 'L2_DATALINK' | 'L2_STP' | 'L2_TRUNK' | 'L3_ENCAPSULATION' | 'L3_SUBNET' | 'L3_GATEWAY' | 'L4_TRAFFIC'

export interface DiagnosticFinding {
  layer: ProtocolLayer
  passed: boolean
  deviceId: string
  interfaceName?: string
  diagnosis: string
  suggestedCommand?: string
}

/**
 * Evaluates the running network state against formal L1-L3 network invariants
 * and returns exact protocol drop points mimicking Dr. Reben Kurda's exam rubric.
 */
export function diagnoseStageInvariants(
  stageNumber: number,
  devices: NetworkDevice[],
  _links: NetworkLink[]
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = []

  const sw1 = devices.find((d) => d.id === 'pred-sw1')
  const sw2 = devices.find((d) => d.id === 'pred-sw2')
  const sw3 = devices.find((d) => d.id === 'pred-sw3')
  const router = devices.find((d) => d.id === 'pred-r1')
  const stu1 = devices.find((d) => d.id === 'pred-pc-stu1')

  // STAGE 1: VLAN Invariants
  if (stageNumber === 1) {
    for (const sw of [sw1, sw2].filter(Boolean) as NetworkDevice[]) {
      const v10 = sw.config.vlans?.find((v) => v.id === 10)
      if (!v10) {
        findings.push({
          layer: 'L2_DATALINK',
          passed: false,
          deviceId: sw.id,
          diagnosis: `VLAN 10 is missing on ${sw.name}. Create it with 'vlan 10'.`,
          suggestedCommand: `vlan 10\n name Students`,
        })
      } else if (v10.name.toLowerCase() !== 'students') {
        findings.push({
          layer: 'L2_DATALINK',
          passed: false,
          deviceId: sw.id,
          diagnosis: `VLAN 10 exists on ${sw.name}, but name is '${v10.name}'. Dr. Kurda requires exact casing 'Students'.`,
          suggestedCommand: `vlan 10\n name Students`,
        })
      }

      const v20 = sw.config.vlans?.find((v) => v.id === 20)
      if (!v20) {
        findings.push({
          layer: 'L2_DATALINK',
          passed: false,
          deviceId: sw.id,
          diagnosis: `VLAN 20 is missing on ${sw.name}. Create it with 'vlan 20'.`,
          suggestedCommand: `vlan 20\n name Teachers`,
        })
      } else if (v20.name.toLowerCase() !== 'teachers') {
        findings.push({
          layer: 'L2_DATALINK',
          passed: false,
          deviceId: sw.id,
          diagnosis: `VLAN 20 exists on ${sw.name}, but name is '${v20.name}'. Dr. Kurda requires exact casing 'Teachers'.`,
          suggestedCommand: `vlan 20\n name Teachers`,
        })
      }
    }

    if (sw3) {
      const v30 = sw3.config.vlans?.find((v) => v.id === 30)
      if (!v30) {
        findings.push({
          layer: 'L2_DATALINK',
          passed: false,
          deviceId: sw3.id,
          diagnosis: `VLAN 30 is missing on ${sw3.name}. Create it with 'vlan 30'.`,
          suggestedCommand: `vlan 30\n name Admin`,
        })
      }
    }
  }

  // STAGE 2: Access Ports & STP PortFast
  if (stageNumber === 2) {
    if (sw1) {
      for (const pName of ['fa0/1', 'fa0/2']) {
        const port = sw1.ports.find((p) => p.shortName.toLowerCase() === pName)
        if (!port || port.portMode !== 'access' || port.vlan !== 10) {
          findings.push({
            layer: 'L2_DATALINK',
            passed: false,
            deviceId: sw1.id,
            interfaceName: pName,
            diagnosis: `${sw1.name} ${pName.toUpperCase()} must be access port in VLAN 10. Currently in ${port?.portMode || 'dynamic'} mode (VLAN ${port?.vlan || 1}).`,
            suggestedCommand: `interface ${pName}\n switchport mode access\n switchport access vlan 10`,
          })
        }
        if (!port?.portfast) {
          findings.push({
            layer: 'L2_STP',
            passed: false,
            deviceId: sw1.id,
            interfaceName: pName,
            diagnosis: `STP convergence delay: ${sw1.name} ${pName.toUpperCase()} lacks PortFast. Enable 'spanning-tree portfast' so PC links immediately.`,
            suggestedCommand: `interface ${pName}\n spanning-tree portfast`,
          })
        }
      }
    }

    if (sw2) {
      for (const pName of ['fa0/1', 'fa0/2']) {
        const port = sw2.ports.find((p) => p.shortName.toLowerCase() === pName)
        if (!port || port.portMode !== 'access' || port.vlan !== 20) {
          findings.push({
            layer: 'L2_DATALINK',
            passed: false,
            deviceId: sw2.id,
            interfaceName: pName,
            diagnosis: `${sw2.name} ${pName.toUpperCase()} must be access port in VLAN 20. Currently in ${port?.portMode || 'dynamic'} mode (VLAN ${port?.vlan || 1}).`,
            suggestedCommand: `interface ${pName}\n switchport mode access\n switchport access vlan 20`,
          })
        }
      }
    }
  }

  // STAGE 3: 802.1Q Inter-Switch Trunks
  if (stageNumber === 3) {
    if (sw1) {
      const g1 = sw1.ports.find((p) => p.shortName.toLowerCase() === 'gi0/1')
      if (g1?.portMode !== 'trunk') {
        findings.push({
          layer: 'L2_TRUNK',
          passed: false,
          deviceId: sw1.id,
          interfaceName: 'Gi0/1',
          diagnosis: `Inter-switch trunk fault: ${sw1.name} Gi0/1 is negotiating as ${g1?.portMode || 'access'}. Set 'switchport mode trunk' to carry tagged frames.`,
          suggestedCommand: `interface gi0/1\n switchport mode trunk`,
        })
      }
    }

    if (sw2) {
      for (const pName of ['gi0/1', 'gi0/2', 'fa0/24']) {
        const port = sw2.ports.find((p) => p.shortName.toLowerCase() === pName)
        if (port?.portMode !== 'trunk') {
          findings.push({
            layer: 'L2_TRUNK',
            passed: false,
            deviceId: sw2.id,
            interfaceName: pName.toUpperCase(),
            diagnosis: `Backbone trunk missing: ${sw2.name} ${pName.toUpperCase()} is ${port?.portMode || 'access'}. Must be trunk mode.`,
            suggestedCommand: `interface ${pName}\n switchport mode trunk`,
          })
        }
      }
    }
  }

  // STAGE 4: Router-on-a-Stick Subinterfaces
  if (stageNumber === 4 && router) {
    const parent = router.ports.find((p) => p.shortName.toLowerCase() === 'gi0/0')
    if (parent?.adminStatus !== 'up') {
      findings.push({
        layer: 'L1_PHYSICAL',
        passed: false,
        deviceId: router.id,
        interfaceName: 'Gi0/0',
        diagnosis: `Physical interface shutdown: ${router.name} Gi0/0 is administratively down. All subinterfaces stay down until you issue 'no shutdown' on Gi0/0.`,
        suggestedCommand: `interface gi0/0\n no shutdown`,
      })
    }

    const sub10 = router.ports.find((p) => p.dot1qVlan === 10)
    if (!sub10) {
      findings.push({
        layer: 'L3_ENCAPSULATION',
        passed: false,
        deviceId: router.id,
        interfaceName: 'Gi0/0.10',
        diagnosis: `Missing subinterface for VLAN 10. Bind 802.1Q tag with 'encapsulation dot1q 10' before setting IP.`,
        suggestedCommand: `interface gi0/0.10\n encapsulation dot1q 10\n ip address 10.10.10.1 255.255.255.128`,
      })
    } else if (sub10.ipAddress !== '10.10.10.1' || sub10.subnetMask !== '255.255.255.128') {
      findings.push({
        layer: 'L3_SUBNET',
        passed: false,
        deviceId: router.id,
        interfaceName: 'Gi0/0.10',
        diagnosis: `VLSM subnet mismatch on Gi0/0.10: IP is ${sub10.ipAddress}/${sub10.subnetMask}. Dr. Kurda specified /25 (10.10.10.1 255.255.255.128).`,
        suggestedCommand: `interface gi0/0.10\n ip address 10.10.10.1 255.255.255.128`,
      })
    }

    const sub20 = router.ports.find((p) => p.dot1qVlan === 20)
    if (!sub20) {
      findings.push({
        layer: 'L3_ENCAPSULATION',
        passed: false,
        deviceId: router.id,
        interfaceName: 'Gi0/0.20',
        diagnosis: `Missing subinterface for VLAN 20. Run 'interface gi0/0.20' and 'encapsulation dot1q 20'.`,
        suggestedCommand: `interface gi0/0.20\n encapsulation dot1q 20\n ip address 10.10.10.129 255.255.255.192`,
      })
    } else if (sub20.ipAddress !== '10.10.10.129' || sub20.subnetMask !== '255.255.255.192') {
      findings.push({
        layer: 'L3_SUBNET',
        passed: false,
        deviceId: router.id,
        interfaceName: 'Gi0/0.20',
        diagnosis: `VLSM subnet mismatch on Gi0/0.20: IP is ${sub20.ipAddress}/${sub20.subnetMask}. Dr. Kurda specified /26 (10.10.10.129 255.255.255.192).`,
        suggestedCommand: `interface gi0/0.20\n ip address 10.10.10.129 255.255.255.192`,
      })
    }
  }

  // STAGE 5: End-to-End Traffic
  if (stageNumber === 5 && stu1) {
    if (stu1.config.defaultGateway !== '10.10.10.1') {
      findings.push({
        layer: 'L3_GATEWAY',
        passed: false,
        deviceId: stu1.id,
        diagnosis: `Host default gateway fault: ${stu1.name} has gateway '${stu1.config.defaultGateway}'. Must be router subinterface '10.10.10.1'.`,
      })
    }
  }

  return findings
}
