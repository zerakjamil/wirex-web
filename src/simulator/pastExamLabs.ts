import { createDevice } from './deviceFactory'
import type { NetworkDevice, NetworkLink, NetworkAnnotation } from '@/types/network'

export interface ExamLabBundle {
  id: string
  title: string
  description: string
  devices: NetworkDevice[]
  links: NetworkLink[]
  annotations: NetworkAnnotation[]
  gradingChecklist?: {
    id: string
    title: string
    description: string
    validator: (devices: NetworkDevice[], links: NetworkLink[]) => boolean
  }[]
}

function makeDevice(
  type: NetworkDevice['type'],
  id: string,
  name: string,
  x: number,
  y: number,
  model?: string
): NetworkDevice {
  const d = createDevice(type, x, y, model || (type === 'switch' ? '2960-24TT' : type === 'router' ? '1941' : undefined))
  d.id = id
  d.name = name
  d.config.hostname = name
  return d
}

function getPort(device: NetworkDevice, shortName: string) {
  const p = device.ports.find(port => port.shortName.toLowerCase() === shortName.toLowerCase())
  if (!p) throw new Error(`Port ${shortName} not found on device ${device.name}`)
  return p
}

function linkDevices(
  devices: NetworkDevice[],
  links: NetworkLink[],
  fromId: string,
  fromPortName: string,
  toId: string,
  toPortName: string,
  cableType: NetworkLink['type'] = 'straight'
) {
  const fromDev = devices.find(d => d.id === fromId)
  const toDev = devices.find(d => d.id === toId)
  if (!fromDev || !toDev) throw new Error(`Device not found for link: ${fromId} -> ${toId}`)

  const fp = getPort(fromDev, fromPortName)
  const tp = getPort(toDev, toPortName)

  const linkId = `exam-link-${links.length + 1}`
  const link: NetworkLink = {
    id: linkId,
    type: cableType,
    fromDeviceId: fromDev.id,
    toDeviceId: toDev.id,
    fromPortId: fp.id,
    toPortId: tp.id,
    status: 'up',
  }

  fp.adminStatus = 'up'
  fp.status = 'up'
  fp.connectedLinkId = link.id
  fp.connectedDeviceId = toDev.id
  fp.connectedPortId = tp.id

  tp.adminStatus = 'up'
  tp.status = 'up'
  tp.connectedLinkId = link.id
  tp.connectedDeviceId = fromDev.id
  tp.connectedPortId = fp.id

  links.push(link)
}

/**
 * Tomorrow's Predicted Midterm Lab (2026)
 * Router-on-a-stick + 3 Switches + VLANs 10, 20, 30 + PortFast + SVI Management + End-to-End Ping
 */
export function getPredictedMidterm2026Lab(): ExamLabBundle {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  // 1. Central Router
  const router = makeDevice('router', 'pred-r1', 'Edge-Router', 500, 70, '1941')
  devices.push(router)

  // 2. Three Distribution & Access Switches
  const sw1 = makeDevice('switch', 'pred-sw1', 'SW1-Distribution', 250, 220)
  const sw2 = makeDevice('switch', 'pred-sw2', 'SW2-Academic', 500, 220)
  const sw3 = makeDevice('switch', 'pred-sw3', 'SW3-Admin', 750, 220)
  devices.push(sw1, sw2, sw3)

  // 3. End Devices (Students, Teachers, Admin)
  const pcA1 = makeDevice('pc', 'pred-pc-stu1', 'Student-A1', 140, 420)
  const pcA2 = makeDevice('pc', 'pred-pc-stu2', 'Student-A2', 260, 420)
  const pcB1 = makeDevice('pc', 'pred-pc-tch1', 'Teacher-B1', 440, 420)
  const pcB2 = makeDevice('pc', 'pred-pc-tch2', 'Teacher-B2', 560, 420)
  const pcC1 = makeDevice('pc', 'pred-pc-adm1', 'Admin-C1', 690, 420)
  const pcC2 = makeDevice('pc', 'pred-pc-adm2', 'Admin-C2', 810, 420)
  const laptop = makeDevice('laptop', 'pred-laptop', 'Tech-Laptop', 120, 160)
  devices.push(pcA1, pcA2, pcB1, pcB2, pcC1, pcC2, laptop)

  // IP Addressing
  // VLAN 10 (Students): 10.10.10.0/25 (Gateway 10.10.10.1)
  pcA1.ports[0].ipAddress = '10.10.10.11'
  pcA1.ports[0].subnetMask = '255.255.255.128'
  pcA1.config.defaultGateway = '10.10.10.1'

  pcA2.ports[0].ipAddress = '10.10.10.12'
  pcA2.ports[0].subnetMask = '255.255.255.128'
  pcA2.config.defaultGateway = '10.10.10.1'

  // VLAN 20 (Teachers): 10.10.10.128/26 (Gateway 10.10.10.129)
  pcB1.ports[0].ipAddress = '10.10.10.131'
  pcB1.ports[0].subnetMask = '255.255.255.192'
  pcB1.config.defaultGateway = '10.10.10.129'

  pcB2.ports[0].ipAddress = '10.10.10.132'
  pcB2.ports[0].subnetMask = '255.255.255.192'
  pcB2.config.defaultGateway = '10.10.10.129'

  // VLAN 30 (Admin & IoT): 10.10.11.0/27 (Gateway 10.10.11.1)
  pcC1.ports[0].ipAddress = '10.10.11.11'
  pcC1.ports[0].subnetMask = '255.255.255.224'
  pcC1.config.defaultGateway = '10.10.11.1'

  pcC2.ports[0].ipAddress = '10.10.11.12'
  pcC2.ports[0].subnetMask = '255.255.255.224'
  pcC2.config.defaultGateway = '10.10.11.1'

  // Laptop for console management
  laptop.ports[0].ipAddress = '10.10.10.99'
  laptop.ports[0].subnetMask = '255.255.255.128'
  laptop.config.defaultGateway = '10.10.10.1'

  // Connections
  // Router to SW2 (Trunk)
  linkDevices(devices, links, router.id, 'Gi0/0', sw2.id, 'Gi0/1')

  // Switch Interconnect Trunks
  linkDevices(devices, links, sw1.id, 'Gi0/1', sw2.id, 'Gi0/2', 'crossover')
  linkDevices(devices, links, sw2.id, 'Fa0/24', sw3.id, 'Gi0/1', 'crossover')

  // Access links from switches to PCs
  linkDevices(devices, links, sw1.id, 'Fa0/1', pcA1.id, 'Fa0')
  linkDevices(devices, links, sw1.id, 'Fa0/2', pcA2.id, 'Fa0')
  linkDevices(devices, links, sw2.id, 'Fa0/1', pcB1.id, 'Fa0')
  linkDevices(devices, links, sw2.id, 'Fa0/2', pcB2.id, 'Fa0')
  linkDevices(devices, links, sw3.id, 'Fa0/1', pcC1.id, 'Fa0')
  linkDevices(devices, links, sw3.id, 'Fa0/2', pcC2.id, 'Fa0')
  linkDevices(devices, links, sw1.id, 'Fa0/23', laptop.id, 'Fa0')

  // Annotations
  annotations.push(
    {
      id: 'ann-pred-vl10',
      type: 'rect',
      x: 100,
      y: 370,
      width: 250,
      height: 150,
      title: 'Students · VLAN 10 (10.10.10.0/25)',
      color: 'rgba(56, 189, 248, 0.12)',
      borderColor: '#0284c7',
    },
    {
      id: 'ann-pred-vl20',
      type: 'rect',
      x: 400,
      y: 370,
      width: 250,
      height: 150,
      title: 'Teachers · VLAN 20 (10.10.10.128/26)',
      color: 'rgba(52, 211, 153, 0.12)',
      borderColor: '#059669',
    },
    {
      id: 'ann-pred-vl30',
      type: 'rect',
      x: 650,
      y: 370,
      width: 250,
      height: 150,
      title: 'Admin & IoT · VLAN 30 (10.10.11.0/27)',
      color: 'rgba(251, 191, 36, 0.12)',
      borderColor: '#d97706',
    },
    {
      id: 'ann-pred-core',
      type: 'rect',
      x: 200,
      y: 50,
      width: 650,
      height: 140,
      title: 'Router-on-a-Stick Backbone (802.1Q Trunks)',
      color: 'rgba(168, 85, 247, 0.10)',
      borderColor: '#9333ea',
    }
  )

  return {
    id: 'predicted-midterm-2026',
    title: 'Predicted Midterm Exam 2026 (Live Interactive Lab)',
    description:
      'Configure VLANs 10, 20, 30 across all switches. Enable dot1Q trunks between switches and router. Enable PortFast on PC ports. Configure router subinterfaces for inter-VLAN routing.',
    devices,
    links,
    annotations,
  }
}

/**
 * Midterm 2024-2025 Original Lab
 * From official Midterm (2024-2025).pkt
 */
export function getMidterm2024Lab(): ExamLabBundle {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  const router0 = makeDevice('router', 'm24-r0', 'Router0', 500, 70, '1941')
  const sw1 = makeDevice('switch', 'm24-sw1', 'SW1', 250, 220)
  const sw2 = makeDevice('switch', 'm24-sw2', 'SW2', 500, 220)
  const sw3 = makeDevice('switch', 'm24-sw3', 'SW3', 750, 220)
  devices.push(router0, sw1, sw2, sw3)

  // 9 PCs + 1 Laptop
  const pc1 = makeDevice('pc', 'm24-pc1', 'PC1', 120, 360)
  const pc2 = makeDevice('pc', 'm24-pc2', 'PC2', 200, 460)
  const pc3 = makeDevice('pc', 'm24-pc3', 'PC3', 280, 560)

  const pc4 = makeDevice('pc', 'm24-pc4', 'PC4', 440, 360)
  const pc5 = makeDevice('pc', 'm24-pc5', 'PC5', 500, 460)
  const pc6 = makeDevice('pc', 'm24-pc6', 'PC6', 560, 560)

  const pc7 = makeDevice('pc', 'm24-pc7', 'PC7', 700, 360)
  const pc8 = makeDevice('pc', 'm24-pc8', 'PC8', 760, 460)
  const pc9 = makeDevice('pc', 'm24-pc9', 'PC9', 820, 560)

  const laptop0 = makeDevice('laptop', 'm24-lap0', 'Laptop0', 250, 70)
  devices.push(pc1, pc2, pc3, pc4, pc5, pc6, pc7, pc8, pc9, laptop0)

  // IP Addressing
  // VLAN 10: 110.110.1.0/24
  for (const [pc, ip] of [[pc1, '110.110.1.2'], [pc4, '110.110.1.3'], [pc7, '110.110.1.4']] as const) {
    pc.ports[0].ipAddress = ip
    pc.ports[0].subnetMask = '255.255.255.0'
    pc.config.defaultGateway = '110.110.1.1'
  }

  // VLAN 20: 130.130.2.0/24
  for (const [pc, ip] of [[pc2, '130.130.2.2'], [pc5, '130.130.2.3'], [pc8, '130.130.2.4']] as const) {
    pc.ports[0].ipAddress = ip
    pc.ports[0].subnetMask = '255.255.255.0'
    pc.config.defaultGateway = '130.130.2.1'
  }

  // VLAN 30: 193.193.3.0/24
  for (const [pc, ip] of [[pc3, '193.193.3.2'], [pc6, '193.193.3.3'], [pc9, '193.193.3.4']] as const) {
    pc.ports[0].ipAddress = ip
    pc.ports[0].subnetMask = '255.255.255.0'
    pc.config.defaultGateway = '193.193.3.1'
  }

  laptop0.ports[0].ipAddress = '110.110.1.10'
  laptop0.ports[0].subnetMask = '255.255.255.0'
  laptop0.config.defaultGateway = '110.110.1.1'

  // Router connections
  linkDevices(devices, links, router0.id, 'Gi0/0', sw2.id, 'Gi0/1')

  // Trunks
  linkDevices(devices, links, sw1.id, 'Gi0/1', sw2.id, 'Gi0/2')
  linkDevices(devices, links, sw2.id, 'Fa0/24', sw3.id, 'Gi0/1')

  // Access ports
  linkDevices(devices, links, sw1.id, 'Fa0/1', pc1.id, 'Fa0')
  linkDevices(devices, links, sw1.id, 'Fa0/2', pc2.id, 'Fa0')
  linkDevices(devices, links, sw1.id, 'Fa0/3', pc3.id, 'Fa0')

  linkDevices(devices, links, sw2.id, 'Fa0/1', pc4.id, 'Fa0')
  linkDevices(devices, links, sw2.id, 'Fa0/2', pc5.id, 'Fa0')
  linkDevices(devices, links, sw2.id, 'Fa0/3', pc6.id, 'Fa0')

  linkDevices(devices, links, sw3.id, 'Fa0/1', pc7.id, 'Fa0')
  linkDevices(devices, links, sw3.id, 'Fa0/2', pc8.id, 'Fa0')
  linkDevices(devices, links, sw3.id, 'Fa0/3', pc9.id, 'Fa0')

  linkDevices(devices, links, sw1.id, 'Fa0/23', laptop0.id, 'Fa0')

  annotations.push(
    {
      id: 'ann-m24-title',
      type: 'rect',
      x: 100,
      y: 330,
      width: 780,
      height: 280,
      title: 'NDI704 Midterm · Class A (110.x), Class B (130.x), Class C (193.x)',
      color: 'rgba(231,239,245,0.25)',
      borderColor: '#0284c7',
    }
  )

  return {
    id: 'midterm-2024-2025',
    title: 'Midterm 2024–2025 (Official Topology)',
    description:
      'Official examination topology by Dr. Reben Kurda. 3 switches, 9 PCs in VLANs 10, 20, 30 across multi-class subnets (110.110.1.0, 130.130.2.0, 193.193.3.0).',
    devices,
    links,
    annotations,
  }
}

/**
 * Final 2024-2025 Group A Lab
 * Dual Router WAN (195.165.65.0/24), VTP Server/Client/Transparent, PortFast
 */
export function getFinal2024GroupALab(): ExamLabBundle {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  const r2 = makeDevice('router', 'f24-r2', 'R2', 260, 100, '1941')
  const r1 = makeDevice('router', 'f24-r1', 'R1', 660, 100, '1941')
  const sw2 = makeDevice('switch', 'f24-sw2', 'Sw2', 260, 260)
  const sw1 = makeDevice('switch', 'f24-sw1', 'Sw1', 660, 260)
  const pc2 = makeDevice('pc', 'f24-pc2', 'PC2', 120, 260)
  const pc1 = makeDevice('pc', 'f24-pc1', 'PC1', 800, 260)

  // S1, S2, S3 for VTP Question 2
  const s1 = makeDevice('switch', 'f24-s1', 'S1-Server', 260, 480)
  const s2 = makeDevice('switch', 'f24-s2', 'S2-Client', 500, 480)
  const s3 = makeDevice('switch', 'f24-s3', 'S3-Transparent', 740, 480)

  devices.push(r2, r1, sw2, sw1, pc2, pc1, s1, s2, s3)

  // IPs
  r2.ports[0].ipAddress = '195.165.65.2'
  r2.ports[0].subnetMask = '255.255.255.0'
  r2.ports[1].ipAddress = '10.0.0.1'
  r2.ports[1].subnetMask = '255.0.0.0'

  r1.ports[0].ipAddress = '195.165.65.1'
  r1.ports[0].subnetMask = '255.255.255.0'
  r1.ports[1].ipAddress = '20.0.0.1'
  r1.ports[1].subnetMask = '255.0.0.0'

  pc2.ports[0].ipAddress = '10.0.0.2'
  pc2.ports[0].subnetMask = '255.0.0.0'
  pc2.config.defaultGateway = '10.0.0.1'

  pc1.ports[0].ipAddress = '20.0.0.2'
  pc1.ports[0].subnetMask = '255.0.0.0'
  pc1.config.defaultGateway = '20.0.0.1'

  // Links
  linkDevices(devices, links, r2.id, 'Gi0/0', r1.id, 'Gi0/0', 'crossover')
  linkDevices(devices, links, r2.id, 'Gi0/1', sw2.id, 'Gi0/1')
  linkDevices(devices, links, r1.id, 'Gi0/1', sw1.id, 'Gi0/1')
  linkDevices(devices, links, sw2.id, 'Fa0/1', pc2.id, 'Fa0')
  linkDevices(devices, links, sw1.id, 'Fa0/1', pc1.id, 'Fa0')

  // Connect VTP switches
  linkDevices(devices, links, s1.id, 'Gi0/1', s2.id, 'Gi0/1', 'crossover')
  linkDevices(devices, links, s2.id, 'Gi0/2', s3.id, 'Gi0/1', 'crossover')

  annotations.push(
    {
      id: 'ann-f24-wan',
      type: 'rect',
      x: 100,
      y: 50,
      width: 750,
      height: 270,
      title: 'Q1: Dual Router WAN (195.165.65.0/24) + PortFast + VTY',
      color: 'rgba(56, 189, 248, 0.10)',
      borderColor: '#0284c7',
    },
    {
      id: 'ann-f24-vtp',
      type: 'rect',
      x: 200,
      y: 420,
      width: 600,
      height: 140,
      title: 'Q2: VTP Modes (Server -> Client -> Transparent)',
      color: 'rgba(251, 191, 36, 0.10)',
      borderColor: '#d97706',
    }
  )

  return {
    id: 'final-2024-2025-a',
    title: 'Final 2024–2025 [Group A] (Official Topology)',
    description:
      'Dual router WAN routing with PortFast, VTY configuration, and VTP domain with Server, Client, and Transparent switches.',
    devices,
    links,
    annotations,
  }
}

/**
 * Final 2025-2026 Group A Lab
 * VLSM Subnetting allocation from 10.10.10.0/23 for 3 VLANs
 */
export function getFinal2025GroupALab(): ExamLabBundle {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  const router = makeDevice('router', 'f25-r1', 'Campus-Router', 480, 80, '1941')
  const sw = makeDevice('switch', 'f25-sw1', 'Main-Switch', 480, 240)
  const pcStudents = makeDevice('pc', 'f25-pc-stu', 'Students-PC (63 users)', 220, 420)
  const pcTeachers = makeDevice('pc', 'f25-pc-tch', 'Teachers-PC (100 users)', 480, 420)
  const pcAdmin = makeDevice('pc', 'f25-pc-adm', 'Admin-PC (6 users + Cameras)', 740, 420)

  devices.push(router, sw, pcStudents, pcTeachers, pcAdmin)

  // Sizing from 10.10.10.0/23:
  // VLAN 20 Teachers (100 users): 10.10.10.0/25 (Gateway 10.10.10.1)
  pcTeachers.ports[0].ipAddress = '10.10.10.10'
  pcTeachers.ports[0].subnetMask = '255.255.255.128'
  pcTeachers.config.defaultGateway = '10.10.10.1'

  // VLAN 10 Students (63 users): 10.10.10.128/25 (Gateway 10.10.10.129)
  pcStudents.ports[0].ipAddress = '10.10.10.140'
  pcStudents.ports[0].subnetMask = '255.255.255.128'
  pcStudents.config.defaultGateway = '10.10.10.129'

  // VLAN 30 Admin (6 users + Cameras): 10.10.11.0/27 (Gateway 10.10.11.1)
  pcAdmin.ports[0].ipAddress = '10.10.11.10'
  pcAdmin.ports[0].subnetMask = '255.255.255.224'
  pcAdmin.config.defaultGateway = '10.10.11.1'

  linkDevices(devices, links, router.id, 'Gi0/0', sw.id, 'Gi0/1')
  linkDevices(devices, links, sw.id, 'Fa0/1', pcStudents.id, 'Fa0')
  linkDevices(devices, links, sw.id, 'Fa0/2', pcTeachers.id, 'Fa0')
  linkDevices(devices, links, sw.id, 'Fa0/3', pcAdmin.id, 'Fa0')

  annotations.push({
    id: 'ann-f25-vlsm',
    type: 'rect',
    x: 160,
    y: 350,
    width: 680,
    height: 150,
    title: 'NDI704 Final 2025–2026: VLSM Allocation from 10.10.10.0/23',
    color: 'rgba(52, 211, 153, 0.12)',
    borderColor: '#059669',
  })

  return {
    id: 'final-2025-2026-ga',
    title: 'Final 2025–2026 [Group A] (VLSM Campus Lab)',
    description:
      'Subnetting 10.10.10.0/23 for Students (63 users), Teachers (100 users), and Admin (6 users + IP cameras expansion). Router-on-a-stick ping test.',
    devices,
    links,
    annotations,
  }
}

/**
 * Final 2022-2023 Original Lab
 * Router-on-a-stick subinterfaces (130.130.0.0, 140.140.0.0, 10.0.0.0, 20.0.0.0) + WAN (192.168.255.0/24)
 */
export function getFinal2022Lab(): ExamLabBundle {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  const r2 = makeDevice('router', 'f22-r2', 'R2', 320, 100, '1941')
  const r1 = makeDevice('router', 'f22-r1', 'R1', 620, 100, '1941')
  const sw2 = makeDevice('switch', 'f22-sw2', 'Sw2', 200, 260)
  const sw1 = makeDevice('switch', 'f22-sw1', 'Sw1', 740, 260)

  const pc3 = makeDevice('pc', 'f22-pc3', 'PC3 (VLAN 130)', 80, 380)
  const pc4 = makeDevice('pc', 'f22-pc4', 'PC4 (VLAN 140)', 240, 380)
  const pc1 = makeDevice('pc', 'f22-pc1', 'PC1 (VLAN 10)', 680, 380)
  const pc22 = makeDevice('pc', 'f22-pc22', 'PC22 (VLAN 20)', 840, 380)

  devices.push(r2, r1, sw2, sw1, pc3, pc4, pc1, pc22)

  // Addressing
  r2.ports[0].ipAddress = '192.168.255.2'
  r2.ports[0].subnetMask = '255.255.255.0'
  r1.ports[0].ipAddress = '192.168.255.1'
  r1.ports[0].subnetMask = '255.255.255.0'

  pc3.ports[0].ipAddress = '130.130.0.2'
  pc3.ports[0].subnetMask = '255.255.0.0'
  pc3.config.defaultGateway = '130.130.0.1'

  pc4.ports[0].ipAddress = '140.140.0.2'
  pc4.ports[0].subnetMask = '255.255.0.0'
  pc4.config.defaultGateway = '140.140.0.1'

  pc1.ports[0].ipAddress = '10.0.0.2'
  pc1.ports[0].subnetMask = '255.0.0.0'
  pc1.config.defaultGateway = '10.0.0.1'

  pc22.ports[0].ipAddress = '20.0.0.2'
  pc22.ports[0].subnetMask = '255.0.0.0'
  pc22.config.defaultGateway = '20.0.0.1'

  // Links
  linkDevices(devices, links, r2.id, 'Gi0/0', r1.id, 'Gi0/0', 'crossover')
  linkDevices(devices, links, r2.id, 'Gi0/1', sw2.id, 'Gi0/1')
  linkDevices(devices, links, r1.id, 'Gi0/1', sw1.id, 'Gi0/1')

  linkDevices(devices, links, sw2.id, 'Fa0/1', pc3.id, 'Fa0')
  linkDevices(devices, links, sw2.id, 'Fa0/2', pc4.id, 'Fa0')
  linkDevices(devices, links, sw1.id, 'Fa0/1', pc1.id, 'Fa0')
  linkDevices(devices, links, sw1.id, 'Fa0/2', pc22.id, 'Fa0')

  annotations.push({
    id: 'ann-f22-subint',
    type: 'rect',
    x: 60,
    y: 50,
    width: 860,
    height: 420,
    title: 'NDI704 Final 2022–2023: Subinterfaces across Dual Routers & Switches',
    color: 'rgba(231,239,245,0.20)',
    borderColor: '#0284c7',
  })

  return {
    id: 'final-2022-2023',
    title: 'Final 2022–2023 (Official Topology)',
    description:
      'Classic multi-VLAN final examination. Router-on-a-stick subinterfaces (VLAN 130, 140, 10, 20), WAN static routing (192.168.255.0/24), and PortFast.',
    devices,
    links,
    annotations,
  }
}

/**
 * CCNA2: Lab 4 - Voice VLAN & IP Telephony (Unconfigured Student Template)
 * Dr. Diana Hayder Hussein & Dr. Shavan Kamal Askar (Erbil Polytechnic University)
 * Topology:
 * - 1x Cisco 2811 Router (R1)
 * - 1x Cisco 2960-24TT Switch (SW1)
 * - 2x Cisco 7960 IP Phones (IP-Phone-1, IP-Phone-2)
 * - 2x PCs (PC-1, PC-2)
 *
 * All physical links are connected, but configurations are completely blank so the student
 * can configure subinterfaces, DHCP pools with option 150, CME telephony-service, and switchports.
 */
export function getVoiceTelephonyLab(): ExamLabBundle {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  // 1. Router R1 (Cisco 2811)
  const router = makeDevice('router', 'voice-r1', 'R1', 450, 70, '2811')
  for (const port of router.ports) {
    port.ipAddress = undefined
    port.subnetMask = undefined
    port.adminStatus = 'down'
    port.status = 'down'
  }
  router.config.telephony = undefined
  router.config.dhcpPools = []
  router.config.excludedDhcpIps = []
  devices.push(router)

  // 2. Switch SW1 (Cisco 2960-24TT)
  const sw1 = makeDevice('switch', 'voice-sw1', 'SW1', 450, 220, '2960-24TT')
  sw1.config.vlans = [{ id: 1, name: 'default' }]
  for (const port of sw1.ports) {
    port.vlan = 1
    port.voiceVlan = undefined
    port.portMode = 'access'
    port.portfast = false
  }
  devices.push(sw1)

  // 3. IP Phone 1 & Daisy-Chained PC 1
  const phone1 = makeDevice('phone', 'voice-phone1', 'IP-Phone-1', 260, 370, '7960')
  const pc1 = makeDevice('pc', 'voice-pc1', 'PC-1', 260, 520)
  pc1.ports[0].ipAddress = undefined
  pc1.ports[0].subnetMask = undefined
  pc1.config.defaultGateway = undefined
  devices.push(phone1, pc1)

  // 4. IP Phone 2 & Daisy-Chained PC 2
  const phone2 = makeDevice('phone', 'voice-phone2', 'IP-Phone-2', 640, 370, '7960')
  const pc2 = makeDevice('pc', 'voice-pc2', 'PC-2', 640, 520)
  pc2.ports[0].ipAddress = undefined
  pc2.ports[0].subnetMask = undefined
  pc2.config.defaultGateway = undefined
  devices.push(phone2, pc2)

  // 5. Physical Cabling (Straight-Through Ethernet)
  linkDevices(devices, links, router.id, 'Fa0/0', sw1.id, 'Gi0/1')
  linkDevices(devices, links, sw1.id, 'Fa0/1', phone1.id, 'Fa0')
  linkDevices(devices, links, phone1.id, 'PCPort', pc1.id, 'Fa0')
  linkDevices(devices, links, sw1.id, 'Fa0/2', phone2.id, 'Fa0')
  linkDevices(devices, links, phone2.id, 'PCPort', pc2.id, 'Fa0')

  // Cisco router physical interfaces are administratively down by default until 'no shutdown'
  for (const port of router.ports) {
    port.adminStatus = 'down'
    port.status = 'down'
  }

  // Annotations
  annotations.push(
    {
      id: 'ann-voice-title',
      type: 'rect',
      x: 60,
      y: 15,
      width: 780,
      height: 40,
      title: 'Lab 4: Voice VLAN & IP Telephony (Unconfigured Student Template)',
      color: 'rgba(59, 130, 246, 0.08)',
      borderColor: '#3b82f6',
    },
    {
      id: 'ann-voice-data-vlan',
      type: 'rect',
      x: 100,
      y: 470,
      width: 700,
      height: 100,
      title: 'Data Network: VLAN 10 (192.168.10.0/24) · PC-1 & PC-2',
      color: 'rgba(16, 185, 129, 0.08)',
      borderColor: '#10b981',
    },
    {
      id: 'ann-voice-vlan-box',
      type: 'rect',
      x: 100,
      y: 320,
      width: 700,
      height: 120,
      title: 'Voice Network: VLAN 11 (192.168.11.0/24) · IP-Phone-1 (Ext 101) & IP-Phone-2 (Ext 102)',
      color: 'rgba(245, 158, 11, 0.08)',
      borderColor: '#f59e0b',
    }
  )

  return {
    id: 'voice-telephony-lab',
    title: 'Lab 4: Voice VLAN & IP Telephony (Unconfigured)',
    description:
      'Unconfigured template from CCNA2 Lab 4 (Dr. Diana Hayder & Dr. Shavan Askar). Pre-wired Cisco 2811 Router, 2960 Switch, two 7960 IP Phones, and two PCs. Ready for manual configuration of Router-on-a-stick, DHCP Option 150, CME Telephony, and Voice VLANs.',
    devices,
    links,
    annotations,
  }
}

export const pastExamLabs: Record<string, () => ExamLabBundle> = {
  'predicted-midterm-2026': getPredictedMidterm2026Lab,
  'midterm-2024-2025': getMidterm2024Lab,
  'final-2025-2026-ga': getFinal2025GroupALab,
  'final-2024-2025-a': getFinal2024GroupALab,
  'final-2022-2023': getFinal2022Lab,
  'voice-telephony-lab': getVoiceTelephonyLab,
}
