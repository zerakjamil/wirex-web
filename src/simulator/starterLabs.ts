import { NetworkDevice, NetworkLink, NetworkAnnotation } from '@/types/network'
import { createDevice, createPort } from './deviceFactory'

export function getVlanSwitchLab(): { devices: NetworkDevice[]; links: NetworkLink[]; annotations: NetworkAnnotation[] } {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  // 1. Corporate Web Server & Workgroup Servers
  const companyWebServer = createDevice('server', 310, 90, 'Server-PT')
  companyWebServer.name = 'Company Web Server'
  companyWebServer.ports[0].ipAddress = '192.168.100.10'
  companyWebServer.ports[0].subnetMask = '255.255.255.0'
  companyWebServer.ports[0].status = 'up'
  companyWebServer.config.defaultGateway = '192.168.100.1'
  companyWebServer.config.httpServiceEnabled = true
  companyWebServer.config.htmlContent = '<h1>Widget International Portal</h1><p>Internal corporate intranet active.</p>'
  devices.push(companyWebServer)

  const server1 = createDevice('server', 80, 270, 'Server-PT')
  server1.name = 'Workgroup Server 1'
  server1.ports[0].ipAddress = '10.1.10.100'
  server1.ports[0].subnetMask = '255.255.255.0'
  server1.ports[0].status = 'up'
  server1.config.defaultGateway = '10.1.10.1'
  devices.push(server1)

  const server2 = createDevice('server', 110, 580, 'Server-PT')
  server2.name = 'Workgroup Server 2'
  server2.ports[0].ipAddress = '10.1.20.100'
  server2.ports[0].subnetMask = '255.255.255.0'
  server2.ports[0].status = 'up'
  server2.config.defaultGateway = '10.1.20.1'
  devices.push(server2)

  const server3 = createDevice('server', 850, 580, 'Server-PT')
  server3.name = 'Workgroup Server 3'
  server3.ports[0].ipAddress = '10.1.30.100'
  server3.ports[0].subnetMask = '255.255.255.0'
  server3.ports[0].status = 'up'
  server3.config.defaultGateway = '10.1.30.1'
  devices.push(server3)

  // 2. Gateway Router2 (2811)
  const router2 = createDevice('router', 490, 95, '2811')
  router2.name = 'Router2'
  router2.config.hostname = 'Router2'
  router2.ports[0].ipAddress = '192.168.100.1'
  router2.ports[0].subnetMask = '255.255.255.0'
  router2.ports[0].status = 'up'
  router2.ports[0].adminStatus = 'up'

  router2.ports[1].ipAddress = '10.0.0.1'
  router2.ports[1].subnetMask = '255.255.255.0'
  router2.ports[1].status = 'up'
  router2.ports[1].adminStatus = 'up'

  // Serial port to ISP
  router2.ports[2].ipAddress = '209.165.200.225'
  router2.ports[2].subnetMask = '255.255.255.252'
  router2.ports[2].status = 'up'
  router2.ports[2].adminStatus = 'up'

  router2.routingTable = [
    {
      network: '192.168.100.0',
      netmask: '255.255.255.0',
      nextHop: 'connected',
      interfaceName: 'FastEthernet0/0',
      metric: 0,
      type: 'C',
    },
    {
      network: '10.0.0.0',
      netmask: '255.255.255.0',
      nextHop: 'connected',
      interfaceName: 'FastEthernet0/1',
      metric: 0,
      type: 'C',
    },
    {
      network: '0.0.0.0',
      netmask: '0.0.0.0',
      nextHop: '209.165.200.226',
      interfaceName: 'Serial0/0/0',
      metric: 1,
      type: 'S',
    },
  ]
  devices.push(router2)

  // 3. Central Switch (3560-24PS Multilayer Switch)
  const centralSw = createDevice('switch', 490, 240, '3560-24PS')
  centralSw.name = 'Central'
  centralSw.config.hostname = 'Central'
  centralSw.config.vlans = [
    { id: 1, name: 'default' },
    { id: 10, name: 'Faculty' },
    { id: 20, name: 'Students' },
    { id: 30, name: 'Engineering' },
    { id: 40, name: 'Management' },
  ]
  devices.push(centralSw)

  // 4. Distribution Switches (Switch0, Switch1, Switch2, Switch3)
  const sw0 = createDevice('switch', 240, 310, '2950T-24')
  sw0.name = 'Switch0'
  sw0.config.hostname = 'Switch0'
  devices.push(sw0)

  const sw1 = createDevice('switch', 380, 350, '2950T-24')
  sw1.name = 'Switch1'
  sw1.config.hostname = 'Switch1'
  devices.push(sw1)

  const sw2 = createDevice('switch', 480, 350, '2950T-24')
  sw2.name = 'Switch2'
  sw2.config.hostname = 'Switch2'
  devices.push(sw2)

  const sw3 = createDevice('switch', 720, 310, '2950T-24')
  sw3.name = 'Switch3'
  sw3.config.hostname = 'Switch3'
  devices.push(sw3)

  // 5. Access Switches (SW-A to SW-F)
  const swA = createDevice('switch', 130, 410, '2950T-24')
  swA.name = 'SW-A'
  swA.config.hostname = 'SW-A'
  devices.push(swA)

  const swB = createDevice('switch', 290, 420, '2950T-24')
  swB.name = 'SW-B'
  swB.config.hostname = 'SW-B'
  devices.push(swB)

  const swC = createDevice('switch', 420, 470, '2950T-24')
  swC.name = 'SW-C'
  swC.config.hostname = 'SW-C'
  devices.push(swC)

  const swD = createDevice('switch', 510, 470, '2950T-24')
  swD.name = 'SW-D'
  swD.config.hostname = 'SW-D'
  devices.push(swD)

  const swE = createDevice('switch', 660, 420, '2950T-24')
  swE.name = 'SW-E'
  swE.config.hostname = 'SW-E'
  devices.push(swE)

  const swF = createDevice('switch', 820, 410, '2950T-24')
  swF.name = 'SW-F'
  swF.config.hostname = 'SW-F'
  devices.push(swF)

  // 6. External Cloud & Outside PC
  const ispCloud = createDevice('cloud', 820, 90, 'Cloud-PT')
  ispCloud.name = 'ISP'
  ispCloud.ports[0].status = 'up'
  devices.push(ispCloud)

  const internetCloud = createDevice('cloud', 960, 90, 'Cloud-PT')
  internetCloud.name = 'Internet'
  internetCloud.ports[0].status = 'up'
  devices.push(internetCloud)

  const outsideRouter = createDevice('router', 900, 190, '2811')
  outsideRouter.name = 'another company'
  outsideRouter.config.hostname = 'Branch-R1'
  outsideRouter.ports[0].ipAddress = '172.16.1.1'
  outsideRouter.ports[0].subnetMask = '255.255.255.0'
  outsideRouter.ports[0].status = 'up'
  outsideRouter.ports[2].ipAddress = '209.165.201.2'
  outsideRouter.ports[2].subnetMask = '255.255.255.252'
  outsideRouter.ports[2].status = 'up'
  devices.push(outsideRouter)

  const outsidePc = createDevice('pc', 900, 290, 'PC-PT')
  outsidePc.name = 'Outside PC'
  outsidePc.ports[0].ipAddress = '172.16.1.100'
  outsidePc.ports[0].subnetMask = '255.255.255.0'
  outsidePc.ports[0].status = 'up'
  outsidePc.config.defaultGateway = '172.16.1.1'
  devices.push(outsidePc)

  // 7. Workstations
  const createPcGroup = (
    prefix: string,
    startX: number,
    y: number,
    vlan: number,
    baseIp: number,
    parentSwitch: NetworkDevice
  ) => {
    for (let i = 1; i <= 4; i++) {
      const pc = createDevice('pc', startX + (i - 1) * 38, y, 'PC-PT')
      pc.name = `${prefix}${i}`
      pc.ports[0].ipAddress = `10.1.${vlan}.${baseIp + i}`
      pc.ports[0].subnetMask = '255.255.255.0'
      pc.ports[0].status = 'up'
      pc.config.defaultGateway = `10.1.${vlan}.1`
      devices.push(pc)

      // Connect to parent switch port
      const swPort = parentSwitch.ports[i]
      if (swPort) {
        swPort.status = 'up'
        swPort.vlan = vlan
        swPort.portMode = 'access'
        const link: NetworkLink = {
          id: `link-${parentSwitch.name}-${pc.name}`,
          type: 'straight',
          fromDeviceId: parentSwitch.id,
          fromPortId: swPort.id,
          toDeviceId: pc.id,
          toPortId: pc.ports[0].id,
          status: 'up',
        }
        links.push(link)
        swPort.connectedLinkId = link.id
        swPort.connectedDeviceId = pc.id
        swPort.connectedPortId = pc.ports[0].id
        pc.ports[0].connectedLinkId = link.id
        pc.ports[0].connectedDeviceId = parentSwitch.id
        pc.ports[0].connectedPortId = swPort.id
      }
    }
  }

  createPcGroup('A', 40, 510, 10, 10, swA)
  createPcGroup('B', 220, 510, 20, 10, swB)
  createPcGroup('C', 290, 670, 30, 10, swC)
  createPcGroup('D', 490, 670, 40, 10, swD)
  createPcGroup('E', 570, 510, 50, 10, swE)
  createPcGroup('F', 740, 510, 60, 10, swF)

  // 8. Core & Trunk Cabling
  const addCable = (
    dev1: NetworkDevice,
    p1Idx: number,
    dev2: NetworkDevice,
    p2Idx: number,
    type: 'straight' | 'crossover' | 'serial'
  ) => {
    const p1 = dev1.ports[p1Idx]
    const p2 = dev2.ports[p2Idx]
    if (!p1 || !p2) return
    p1.status = 'up'
    p2.status = 'up'
    const link: NetworkLink = {
      id: `link-${dev1.name}-${dev2.name}-${p1.id}`,
      type,
      fromDeviceId: dev1.id,
      fromPortId: p1.id,
      toDeviceId: dev2.id,
      toPortId: p2.id,
      status: 'up',
    }
    p1.connectedLinkId = link.id
    p1.connectedDeviceId = dev2.id
    p1.connectedPortId = p2.id
    p2.connectedLinkId = link.id
    p2.connectedDeviceId = dev1.id
    p2.connectedPortId = p1.id
    links.push(link)
  }

  // Company Web Server -> Router2
  addCable(companyWebServer, 0, router2, 0, 'crossover')

  // Router2 -> Central Switch
  addCable(router2, 1, centralSw, 0, 'straight')

  // Central Switch to Distribution Switches
  addCable(centralSw, 1, sw0, 0, 'crossover')
  addCable(centralSw, 2, sw1, 0, 'crossover')
  addCable(centralSw, 3, sw2, 0, 'crossover')
  addCable(centralSw, 4, sw3, 0, 'crossover')

  // Distribution to Access Switches (Primary paths)
  addCable(sw0, 1, swA, 0, 'straight')
  addCable(sw0, 2, swB, 0, 'straight')
  addCable(sw1, 1, swA, 5, 'crossover')
  addCable(sw1, 2, swB, 5, 'crossover')
  addCable(sw1, 3, swC, 0, 'straight')
  addCable(sw2, 1, swD, 0, 'straight')
  addCable(sw2, 2, swE, 5, 'crossover')
  addCable(sw2, 3, swF, 5, 'crossover')
  addCable(sw3, 1, swE, 0, 'straight')
  addCable(sw3, 2, swF, 0, 'straight')

  // Access switches to workgroup servers
  addCable(server1, 0, sw0, 10, 'straight')
  addCable(server2, 0, swA, 10, 'straight')
  addCable(server3, 0, swF, 10, 'straight')

  // WAN Red Serial Cables
  addCable(router2, 2, ispCloud, 0, 'serial')
  addCable(ispCloud, 1, internetCloud, 0, 'serial')
  addCable(ispCloud, 2, outsideRouter, 2, 'serial')
  addCable(outsideRouter, 0, outsidePc, 0, 'crossover')

  return { devices, links, annotations }
}

export function getCcnaEnterpriseLab(): {
  devices: NetworkDevice[]
  links: NetworkLink[]
  annotations: NetworkAnnotation[]
} {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  // 1. Internet Cloud
  const internetCloud = createDevice('cloud', 520, 110, 'Cloud-PT')
  internetCloud.name = 'Internet'
  internetCloud.ports[0].status = 'up'
  internetCloud.ports[1].status = 'up'
  internetCloud.ports[2].status = 'up'
  devices.push(internetCloud)

  // 2. Office-Router (2911)
  const officeRouter = createDevice('router', 740, 50, '2911')
  officeRouter.name = 'Office-Router'
  officeRouter.config.hostname = 'Office-Router'
  officeRouter.ports[0].ipAddress = '173.1.1.10'
  officeRouter.ports[0].subnetMask = '255.255.255.252'
  officeRouter.ports[0].status = 'up'
  officeRouter.ports[0].adminStatus = 'up'

  officeRouter.ports[1].ipAddress = '173.1.1.6'
  officeRouter.ports[1].subnetMask = '255.255.255.252'
  officeRouter.ports[1].status = 'up'
  officeRouter.ports[1].adminStatus = 'up'

  officeRouter.ports[2].ipAddress = '173.1.1.13'
  officeRouter.ports[2].subnetMask = '255.255.255.252'
  officeRouter.ports[2].status = 'up'
  officeRouter.ports[2].adminStatus = 'up'

  officeRouter.ports[3].ipAddress = '100.1.10.2'
  officeRouter.ports[3].subnetMask = '255.255.255.252'
  officeRouter.ports[3].status = 'up'
  officeRouter.ports[3].adminStatus = 'up'
  devices.push(officeRouter)

  // 3. Router 1 (2911)
  const router1 = createDevice('router', 360, 220, '2911')
  router1.name = 'Router 1'
  router1.config.hostname = 'Router1'
  router1.ports[0].ipAddress = '173.1.1.2'
  router1.ports[0].subnetMask = '255.255.255.252'
  router1.ports[0].status = 'up'
  router1.ports[0].adminStatus = 'up'

  router1.ports[1].ipAddress = '10.0.1.1'
  router1.ports[1].subnetMask = '255.255.255.252'
  router1.ports[1].status = 'up'
  router1.ports[1].adminStatus = 'up'

  router1.ports[2].ipAddress = '10.0.1.5'
  router1.ports[2].subnetMask = '255.255.255.252'
  router1.ports[2].status = 'up'
  router1.ports[2].adminStatus = 'up'

  router1.ports[3].ipAddress = '100.1.10.1'
  router1.ports[3].subnetMask = '255.255.255.252'
  router1.ports[3].status = 'up'
  router1.ports[3].adminStatus = 'up'
  devices.push(router1)

  // 4. Router 2 (2911)
  const router2 = createDevice('router', 670, 180, '2911')
  router2.name = 'Router 2'
  router2.config.hostname = 'Router2'
  router2.ports[0].ipAddress = '173.1.1.5'
  router2.ports[0].subnetMask = '255.255.255.252'
  router2.ports[0].status = 'up'
  router2.ports[0].adminStatus = 'up'

  router2.ports[1].ipAddress = '10.0.1.9'
  router2.ports[1].subnetMask = '255.255.255.252'
  router2.ports[1].status = 'up'
  router2.ports[1].adminStatus = 'up'

  router2.ports[2].ipAddress = '10.0.1.13'
  router2.ports[2].subnetMask = '255.255.255.252'
  router2.ports[2].status = 'up'
  router2.ports[2].adminStatus = 'up'
  devices.push(router2)

  // 5. Switch1 (3560-24PS)
  const switch1 = createDevice('switch', 360, 390, '3560-24PS')
  switch1.name = 'Switch1'
  switch1.config.hostname = 'Switch1'
  switch1.config.vlans = [
    { id: 1, name: 'default' },
    { id: 10, name: 'VLAN10_Remote1' },
    { id: 20, name: 'VLAN20_Remote2' },
  ]
  devices.push(switch1)

  // 6. Switch2 (3560-24PS)
  const switch2 = createDevice('switch', 670, 390, '3560-24PS')
  switch2.name = 'Switch2'
  switch2.config.hostname = 'Switch2'
  switch2.config.vlans = [
    { id: 1, name: 'default' },
    { id: 10, name: 'VLAN10_Remote1' },
    { id: 20, name: 'VLAN20_Remote2' },
  ]
  devices.push(switch2)

  // 7. Switch3 (2960-24TT)
  const switch3 = createDevice('switch', 360, 710, '2960-24TT')
  switch3.name = 'Switch3'
  switch3.config.hostname = 'Switch3'
  switch3.ports[0].ipAddress = '192.168.10.5'
  switch3.ports[0].subnetMask = '255.255.255.0'
  devices.push(switch3)

  // 8. Switch4 (2960-24TT)
  const switch4 = createDevice('switch', 640, 710, '2960-24TT')
  switch4.name = 'Switch4'
  switch4.config.hostname = 'Switch4'
  switch4.ports[0].ipAddress = '192.168.20.5'
  switch4.ports[0].subnetMask = '255.255.255.0'
  devices.push(switch4)

  // 9. Web Server (Server-PT)
  const webServer = createDevice('server', 940, 50, 'Server-PT')
  webServer.name = 'Web Server'
  webServer.ports[0].ipAddress = '173.1.1.14'
  webServer.ports[0].subnetMask = '255.255.255.252'
  webServer.ports[0].status = 'up'
  webServer.config.defaultGateway = '173.1.1.13'
  webServer.config.httpServiceEnabled = true
  webServer.config.htmlContent = '<h1>Welcome to michaelcozier.com</h1><p>CCNA Enterprise Core Network Portal Online.</p>'
  devices.push(webServer)

  // 10. Work Office Server (Server-PT)
  const workOfficeServer = createDevice('server', 80, 740, 'Server-PT')
  workOfficeServer.name = 'Work Office Server'
  workOfficeServer.ports[0].ipAddress = '192.168.10.11'
  workOfficeServer.ports[0].subnetMask = '255.255.255.0'
  workOfficeServer.ports[0].status = 'up'
  workOfficeServer.config.defaultGateway = '192.168.10.1'
  workOfficeServer.config.dhcpPools = [
    {name:'VLAN10',network:'192.168.10.0',mask:'255.255.255.0',defaultRouter:'192.168.10.1',dnsServer:'192.168.10.11'},
    {name:'VLAN20',network:'192.168.20.0',mask:'255.255.255.0',defaultRouter:'192.168.20.1',dnsServer:'192.168.10.11'},
  ]
  workOfficeServer.config.httpServiceEnabled = true
  workOfficeServer.config.htmlContent = '<h1>Corporate Work Office Server</h1><p>DHCP, DNS, NTP Services Active.</p>'
  devices.push(workOfficeServer)

  // 11. SysLog Server (Server-PT)
  const syslogServer = createDevice('server', 950, 740, 'Server-PT')
  syslogServer.name = 'SysLog Server'
  syslogServer.ports[0].ipAddress = '192.168.20.25'
  syslogServer.ports[0].subnetMask = '255.255.255.0'
  syslogServer.ports[0].status = 'up'
  syslogServer.config.defaultGateway = '192.168.20.1'
  devices.push(syslogServer)

  // 12. Laptop0 (Laptop-PT with Console Connection to Switch1)
  const laptop0 = createDevice('laptop', 70, 440, 'Laptop-PT')
  laptop0.name = 'Laptop0'
  laptop0.ports[0].ipAddress = '192.168.10.20'
  laptop0.ports[0].subnetMask = '255.255.255.0'
  laptop0.ports[0].status = 'up'
  laptop0.config.defaultGateway = '192.168.10.1'
  devices.push(laptop0)

  // 13. PC1 (VLAN 10)
  const pc1 = createDevice('pc', 360, 870, 'PC-PT')
  pc1.name = 'PC1'
  pc1.ports[0].ipAddress = '192.168.10.50'
  pc1.ports[0].subnetMask = '255.255.255.0'
  pc1.ports[0].status = 'up'
  pc1.config.defaultGateway = '192.168.10.1'
  devices.push(pc1)

  // 14. PC2 (VLAN 20)
  const pc2 = createDevice('pc', 640, 870, 'PC-PT')
  pc2.name = 'PC2'
  pc2.ports[0].ipAddress = '192.168.20.50'
  pc2.ports[0].subnetMask = '255.255.255.0'
  pc2.ports[0].status = 'up'
  pc2.config.defaultGateway = '192.168.20.1'
  devices.push(pc2)

  // Helper for adding cables
  const connect = (
    d1: NetworkDevice,
    p1Idx: number,
    d2: NetworkDevice,
    p2Idx: number,
    type: NetworkLink['type'],
    opts?: { isEtherChannel?: boolean; channelLabel?: string }
  ) => {
    const p1 = d1.ports[p1Idx]
    const p2 = d2.ports[p2Idx]
    if (!p1 || !p2) return
    p1.status = 'up'
    p2.status = 'up'
    const link: NetworkLink = {
      id: `link-${d1.name}-${d2.name}-${p1.id}-${Math.floor(Math.random() * 1000)}`,
      type,
      fromDeviceId: d1.id,
      fromPortId: p1.id,
      toDeviceId: d2.id,
      toPortId: p2.id,
      status: 'up',
      isEtherChannel: opts?.isEtherChannel,
      channelLabel: opts?.channelLabel,
    }
    p1.connectedLinkId = link.id
    p1.connectedDeviceId = d2.id
    p1.connectedPortId = p2.id
    p2.connectedLinkId = link.id
    p2.connectedDeviceId = d1.id
    p2.connectedPortId = p1.id
    links.push(link)
  }

  // WAN & Internet Connections
  connect(router1, 0, internetCloud, 0, 'straight')
  connect(router2, 0, internetCloud, 1, 'straight')
  connect(officeRouter, 0, internetCloud, 2, 'straight')
  connect(officeRouter, 2, webServer, 0, 'crossover')
  connect(router1, 3, officeRouter, 3, 'serial-dce')

  // Routers to Core Switches
  connect(router1, 1, switch1, 0, 'straight')
  connect(router1, 2, switch2, 0, 'straight')
  connect(router2, 1, switch1, 1, 'straight')
  connect(router2, 2, switch2, 1, 'straight')

  // EtherChannel Po1 (Between Core Switch1 & Switch2)
  connect(switch1, 24, switch2, 24, 'crossover', { isEtherChannel: true, channelLabel: 'Po1' })
  connect(switch1, 25, switch2, 25, 'crossover', { isEtherChannel: true, channelLabel: 'Po1' })

  // EtherChannel Po3 (Between Switch1 & Switch3) - Blocked by STP on Switch3 (Orange Circles)
  connect(switch1, 2, switch3, 2, 'crossover', { isEtherChannel: true, channelLabel: 'Po3' })
  connect(switch1, 3, switch3, 3, 'crossover', { isEtherChannel: true, channelLabel: 'Po3' })

  // EtherChannel Po4 (Between Switch1 & Switch4)
  connect(switch1, 4, switch4, 4, 'crossover', { isEtherChannel: true, channelLabel: 'Po4' })
  connect(switch1, 5, switch4, 5, 'crossover', { isEtherChannel: true, channelLabel: 'Po4' })

  // EtherChannel Po5 (Between Switch2 & Switch3)
  connect(switch2, 2, switch3, 4, 'crossover', { isEtherChannel: true, channelLabel: 'Po5' })
  connect(switch2, 3, switch3, 5, 'crossover', { isEtherChannel: true, channelLabel: 'Po5' })

  // EtherChannel Po6 (Between Switch2 & Switch4)
  connect(switch2, 4, switch4, 2, 'crossover', { isEtherChannel: true, channelLabel: 'Po6' })
  connect(switch2, 5, switch4, 3, 'crossover', { isEtherChannel: true, channelLabel: 'Po6' })

  // Console Cable: Laptop0 to Switch1 Console Port
  connect(laptop0, 0, switch1, 6, 'console')

  // Edge Device Connections
  connect(switch3, 7, workOfficeServer, 0, 'straight')
  connect(switch3, 1, pc1, 0, 'straight')
  connect(switch4, 7, syslogServer, 0, 'straight')
  connect(switch4, 1, pc2, 0, 'straight')

  const campusVlans=[
    {id:1,name:'default'},
    {id:10,name:'VLAN10_Remote1'},
    {id:20,name:'VLAN20_Remote2'},
  ]
  for(const sw of [switch1,switch2,switch3,switch4])sw.config.vlans=campusVlans.map(vlan=>({...vlan}))
  switch1.config.stpPriorities={'10':24576}
  switch2.config.stpPriorities={'20':24576}
  switch1.config.ipRouting=true
  switch2.config.ipRouting=true
  for(const [sw,vlan,address] of [
    [switch1,10,'192.168.10.2'],
    [switch1,20,'192.168.20.3'],
    [switch2,10,'192.168.10.3'],
    [switch2,20,'192.168.20.2'],
  ] as const){
    const svi=createPort(`Vlan${vlan}`,`Vl${vlan}`,'fastethernet','up')
    Object.assign(svi,{status:'up',adminStatus:'up',virtualVlan:vlan,vlan,ipAddress:address,subnetMask:'255.255.255.0'})
    const priority=sw===switch1?(vlan===10?110:100):(vlan===10?100:110)
    svi.hsrpGroups=[{group:vlan,virtualIp:`192.168.${vlan}.1`,priority,...(priority===110?{preempt:true}:{})}]
    if(sw===switch2&&vlan===20)svi.helperAddress='192.168.10.11'
    sw.ports.push(svi)
  }
  for(const [sw,portIndex,vlan] of [[switch3,7,10],[switch3,1,10],[switch4,7,20],[switch4,1,20]] as const){
    Object.assign(sw.ports[portIndex],{portMode:'access',vlan})
  }
  for(const link of links.filter(candidate=>candidate.isEtherChannel))for(const [deviceId,portId] of [[link.fromDeviceId,link.fromPortId],[link.toDeviceId,link.toPortId]]){
    const device=devices.find(candidate=>candidate.id===deviceId)
    const port=device?.ports.find(candidate=>candidate.id===portId)
    if(device?.type==='switch'&&port)Object.assign(port,{portMode:'trunk',nativeVlan:1,allowedVlans:[1,10,20]})
  }

  // Annotations (Matching Image 4)
  annotations.push(
    // 1. Purple Box: VLAN 10 Remote Work Office 1
    {
      id: 'ann-vlan10',
      type: 'rect',
      x: 20,
      y: 700,
      width: 440,
      height: 250,
      title: 'VLAN 10 Remote Work Office 1',
      text: 'Subnet: 192.168.10.0 /24\nServer: 192.168.10.11 (DHCP, DNS, NTP For Vlan 10 & 20)\nPC1: Dynamic VLAN 10 IP',
      color: '#f5f3ff',
      borderColor: '#9333ea',
    },
    // 2. Pink Box: VLAN 20 Remote Work Office 2
    {
      id: 'ann-vlan20',
      type: 'rect',
      x: 550,
      y: 700,
      width: 480,
      height: 250,
      title: 'VLAN 20 Remote Work Office 2',
      text: 'Subnet: 192.168.20.0 /24\nServer: 192.168.20.25 (SysLog Server)\nPC2: Dynamic VLAN 20 IP',
      color: '#fdf2f8',
      borderColor: '#db2777',
    },
    // 3. Yellow Box: OSPF Area 0 / GRE Tunnels / NAT Overload
    {
      id: 'ann-wan-gre',
      type: 'rect',
      x: 320,
      y: -25,
      width: 500,
      height: 220,
      title: 'GRE 100.1.10.0 /30 & WAN Core',
      text: '100.1.10.2 -> Office-Router\n100.1.10.1 -> Router 1\nGRE 100.1.10.4 /30 (.5 -> .6)\nNAT overload (PAT) Active',
      color: '#fef9c3',
      borderColor: '#ca8a04',
    },
    // 4. Sticky Note: OSPF & SSH Credentials
    {
      id: 'ann-ospf-ssh',
      type: 'note',
      x: 60,
      y: 10,
      title: 'OSPF Area 0',
      text: 'SSH Credentials:\nUser: mike\nPassword: ccna\n\nApplies to:\nswitch1\nswitch2\nswitch3\nswitch4\nrouter1\nrouter2\noffice-router',
      color: '#ffffff',
      borderColor: '#94a3b8',
    },
    // 5. Sticky Note: Web Server ACL
    {
      id: 'ann-web-acl',
      type: 'note',
      x: 940,
      y: 170,
      title: 'Web Server ACL',
      text: '173.1.1.14 (Static)\nmichaelcozier.com\nWork Office Server\nACL permit only\n192.168.10.0/24\n192.168.20.0/24\nDeny Any',
      color: '#ffffff',
      borderColor: '#94a3b8',
    },
    // 6. Sticky Note: Switch1 Gateway
    {
      id: 'ann-switch1',
      type: 'note',
      x: 140,
      y: 250,
      title: 'Switch1 Gateway',
      text: 'VLAN 10 SVI: 192.168.10.1/24\nVLAN 20 SVI: 192.168.20.2/24\nIP routing enabled\nVLAN 10 STP root; no FHRP failover yet',
      color: '#ffffff',
      borderColor: '#cbd5e1',
    },
    // 7. Sticky Note: Switch2 Gateway
    {
      id: 'ann-switch2',
      type: 'note',
      x: 820,
      y: 250,
      title: 'Switch2 Gateway',
      text: 'VLAN 10 SVI: 192.168.10.2/24\nVLAN 20 SVI: 192.168.20.1/24\nIP routing enabled\nVLAN 20 STP root; DHCP relay -> 192.168.10.11; no FHRP failover yet',
      color: '#ffffff',
      borderColor: '#cbd5e1',
    },
    // 8. Sticky Note: Switch3 Config
    {
      id: 'ann-switch3',
      type: 'note',
      x: 160,
      y: 840,
      title: 'Switch3 Config',
      text: 'VLAN 10: 192.168.10.5\nSSH: mike / ccna\nPortfast & BPDU Guard\nPort Security - Restricted (1)',
      color: '#ffffff',
      borderColor: '#cbd5e1',
    },
    // 9. Sticky Note: Switch4 Config
    {
      id: 'ann-switch4',
      type: 'note',
      x: 850,
      y: 840,
      title: 'Switch4 Config',
      text: 'VLAN 20: 192.168.20.5\nSSH: mike / ccna\nPortfast & BPDU Guard\nPort Security - Restricted (1)',
      color: '#ffffff',
      borderColor: '#cbd5e1',
    },
    // 10. Sticky Note: Cross Subnet 10.0.1.0/30
    {
      id: 'ann-cross-r1-sw1',
      type: 'note',
      x: 230,
      y: 275,
      title: '10.0.1.0 /30',
      text: '.1 (R1) -> .2 (Sw1)',
      color: '#ffffff',
      borderColor: '#e2e8f0',
    },
    // 11. Sticky Note: Cross Subnet 10.0.1.12/30
    {
      id: 'ann-cross-r2-sw2',
      type: 'note',
      x: 610,
      y: 275,
      title: '10.0.1.12 /30',
      text: '.13 (R2) -> .14 (Sw2)',
      color: '#ffffff',
      borderColor: '#e2e8f0',
    }
  )

  return { devices, links, annotations }
}

export function getWirelessLab(): {
  devices: NetworkDevice[]
  links: NetworkLink[]
  annotations: NetworkAnnotation[]
} {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  // 1. Access Point (AccessPoint-PT)
  const ap = createDevice('wireless', 430, 220, 'AccessPoint-PT')
  ap.name = 'Access Point1'
  ap.config.hostname = 'AccessPoint1'
  devices.push(ap)

  // 2. Smartphone (Smartphone-PT)
  const phone = createDevice('smartphone', 130, 430, 'Smartphone-PT')
  phone.name = 'Smartphone1'
  phone.ports[0].ipAddress = '192.168.1.101'
  phone.ports[0].subnetMask = '255.255.255.0'
  phone.ports[0].status = 'up'
  phone.config.defaultGateway = '192.168.1.1'
  devices.push(phone)

  // 3. Laptop1 (Laptop-PT with standard wired NIC, waiting for WPC300N swap)
  const laptop1 = createDevice('laptop', 140, 80, 'Laptop-PT')
  laptop1.name = 'Laptop1'
  laptop1.config.hostname = 'Laptop1'
  devices.push(laptop1)

  // 4. Laptop2 (Laptop-PT)
  const laptop2 = createDevice('laptop', 130, 230, 'Laptop-PT')
  laptop2.name = 'Laptop2'
  laptop2.config.hostname = 'Laptop2'
  devices.push(laptop2)

  // 5. Switch (2960-24TT)
  const sw = createDevice('switch', 630, 220, '2960-24TT')
  sw.name = 'Switch0'
  devices.push(sw)

  // 6. DHCP & Web Server
  const server = createDevice('server', 820, 220, 'Server-PT')
  server.name = 'DHCP-Server'
  server.ports[0].ipAddress = '192.168.1.10'
  server.ports[0].subnetMask = '255.255.255.0'
  server.ports[0].status = 'up'
  server.config.httpServiceEnabled = true
  server.config.htmlContent = '<h1>Cisco Wireless Infrastructure</h1><p>SSID: Default-WLAN (Active)</p>'
  devices.push(server)

  // Create Wireless Link between AP and Smartphone1
  const wlanPort = ap.ports.find((p) => p.type === 'wireless') || ap.ports[1]
  const phonePort = phone.ports.find((p) => p.type === 'wireless') || phone.ports[0]
  if (wlanPort && phonePort) {
    wlanPort.status = 'up'
    phonePort.status = 'up'
    const wLink: NetworkLink = {
      id: `wlink-${ap.name}-${phone.name}`,
      type: 'wireless',
      fromDeviceId: ap.id,
      fromPortId: wlanPort.id,
      toDeviceId: phone.id,
      toPortId: phonePort.id,
      status: 'up',
    }
    wlanPort.connectedLinkId = wLink.id
    wlanPort.connectedDeviceId = phone.id
    wlanPort.connectedPortId = phonePort.id
    phonePort.connectedLinkId = wLink.id
    phonePort.connectedDeviceId = ap.id
    phonePort.connectedPortId = wlanPort.id
    links.push(wLink)
  }

  // Wired link AP -> Switch
  const ethPort = ap.ports[0]
  const swPort = sw.ports[0]
  if (ethPort && swPort) {
    ethPort.status = 'up'
    swPort.status = 'up'
    const link: NetworkLink = {
      id: `link-ap-sw`,
      type: 'straight',
      fromDeviceId: ap.id,
      fromPortId: ethPort.id,
      toDeviceId: sw.id,
      toPortId: swPort.id,
      status: 'up',
    }
    ethPort.connectedLinkId = link.id
    ethPort.connectedDeviceId = sw.id
    ethPort.connectedPortId = swPort.id
    swPort.connectedLinkId = link.id
    swPort.connectedDeviceId = ap.id
    swPort.connectedPortId = ethPort.id
    links.push(link)
  }

  // Wired link Switch -> Server
  const swPort2 = sw.ports[1]
  const srvPort = server.ports[0]
  if (swPort2 && srvPort) {
    swPort2.status = 'up'
    srvPort.status = 'up'
    const link: NetworkLink = {
      id: `link-sw-srv`,
      type: 'straight',
      fromDeviceId: sw.id,
      fromPortId: swPort2.id,
      toDeviceId: server.id,
      toPortId: srvPort.id,
      status: 'up',
    }
    swPort2.connectedLinkId = link.id
    swPort2.connectedDeviceId = server.id
    swPort2.connectedPortId = srvPort.id
    srvPort.connectedLinkId = link.id
    srvPort.connectedDeviceId = sw.id
    srvPort.connectedPortId = swPort2.id
    links.push(link)
  }

  // Lab Instructions note
  annotations.push({
    id: 'ann-wireless-guide',
    type: 'note',
    x: 320,
    y: 10,
    width: 480,
    height: 180,
    title: 'Wireless LAN & Modular Hardware Lab',
    text: '1. Smartphone1 is connected to Access Point1 (note the radiating wireless wave arcs).\n2. Double click Laptop1 -> Click "Physical" Tab.\n3. Turn OFF the Power Switch (green LED turns off).\n4. Click the FastEthernet module in the orange slot to remove it.\n5. Select "WPC300N" from the MODULES list on the left.\n6. Click the orange slot to install the WPC300N Wireless Card.\n7. Turn the Power Switch back ON.\n8. Watch Laptop1 connect wirelessly to Access Point1 with radiating radio waves!',
    color: '#eff6ff',
    borderColor: '#3b82f6',
  })

  return { devices, links, annotations }
}

export function getPtAnywhereLab(): {
  devices: NetworkDevice[]
  links: NetworkLink[]
  annotations: NetworkAnnotation[]
} {
  const devices: NetworkDevice[] = []
  const links: NetworkLink[] = []
  const annotations: NetworkAnnotation[] = []

  // 1. Internet Cloud
  const cloud = createDevice('cloud', 140, 240, 'Cloud-PT')
  cloud.name = 'Internet'
  cloud.config.hostname = 'Internet'
  devices.push(cloud)

  // 2. MyRouter (Cisco Router)
  const router = createDevice('router', 350, 240, '2911')
  router.name = 'MyRouter'
  router.config.hostname = 'MyRouter'
  router.ports[0].ipAddress = '192.168.1.1'
  router.ports[0].subnetMask = '255.255.255.0'
  router.ports[0].status = 'up'
  router.ports[0].adminStatus = 'up'

  router.ports[1].ipAddress = '203.0.113.1'
  router.ports[1].subnetMask = '255.255.255.0'
  router.ports[1].status = 'up'
  router.ports[1].adminStatus = 'up'

  router.routingTable = [
    {
      network: '192.168.1.0',
      netmask: '255.255.255.0',
      nextHop: 'connected',
      interfaceName: 'GigabitEthernet0/0',
      metric: 0,
      type: 'C',
    },
    {
      network: '203.0.113.0',
      netmask: '255.255.255.0',
      nextHop: 'connected',
      interfaceName: 'GigabitEthernet0/1',
      metric: 0,
      type: 'C',
    },
  ]
  devices.push(router)

  // 3. MySwitch (Cisco Catalyst Switch)
  const sw = createDevice('switch', 530, 250, '2960-24TT')
  sw.name = 'MySwitch'
  sw.config.hostname = 'MySwitch'
  devices.push(sw)

  // 4. RightHandSide PC (Top PC)
  const rightPc = createDevice('pc', 760, 140, 'PC-PT')
  rightPc.name = 'RightHandSide'
  rightPc.config.hostname = 'RightHandSide'
  rightPc.ports[0].ipAddress = '192.168.1.10'
  rightPc.ports[0].subnetMask = '255.255.255.0'
  rightPc.ports[0].status = 'up'
  rightPc.config.defaultGateway = '192.168.1.1'
  devices.push(rightPc)

  // 5. LeftHandSide PC (Bottom PC)
  const leftPc = createDevice('pc', 760, 360, 'PC-PT')
  leftPc.name = 'LeftHandSide'
  leftPc.config.hostname = 'LeftHandSide'
  leftPc.ports[0].ipAddress = '192.168.1.20'
  leftPc.ports[0].subnetMask = '255.255.255.0'
  leftPc.ports[0].status = 'up'
  leftPc.config.defaultGateway = '192.168.1.1'
  devices.push(leftPc)

  // Connect Cloud -> Router (GigabitEthernet0/1)
  const cloudPort = cloud.ports[0]
  const rPort1 = router.ports[1]
  if (cloudPort && rPort1) {
    cloudPort.status = 'up'
    rPort1.status = 'up'
    const link: NetworkLink = {
      id: 'link-cloud-router',
      type: 'straight',
      fromDeviceId: cloud.id,
      fromPortId: cloudPort.id,
      toDeviceId: router.id,
      toPortId: rPort1.id,
      status: 'up',
    }
    cloudPort.connectedLinkId = link.id
    cloudPort.connectedDeviceId = router.id
    rPort1.connectedLinkId = link.id
    rPort1.connectedDeviceId = cloud.id
    links.push(link)
  }

  // Connect Router (GigabitEthernet0/0) -> Switch (FastEthernet0/24)
  const rPort0 = router.ports[0]
  const swPort24 = sw.ports[23] || sw.ports[0]
  if (rPort0 && swPort24) {
    rPort0.status = 'up'
    swPort24.status = 'up'
    const link: NetworkLink = {
      id: 'link-router-switch',
      type: 'straight',
      fromDeviceId: router.id,
      fromPortId: rPort0.id,
      toDeviceId: sw.id,
      toPortId: swPort24.id,
      status: 'up',
    }
    rPort0.connectedLinkId = link.id
    rPort0.connectedDeviceId = sw.id
    swPort24.connectedLinkId = link.id
    swPort24.connectedDeviceId = router.id
    links.push(link)
  }

  // Connect Switch (FastEthernet0/1) -> RightHandSide PC
  const swPort1 = sw.ports[0]
  const rightPort = rightPc.ports[0]
  if (swPort1 && rightPort) {
    swPort1.status = 'up'
    rightPort.status = 'up'
    const link: NetworkLink = {
      id: 'link-sw-right',
      type: 'straight',
      fromDeviceId: sw.id,
      fromPortId: swPort1.id,
      toDeviceId: rightPc.id,
      toPortId: rightPort.id,
      status: 'up',
    }
    swPort1.connectedLinkId = link.id
    swPort1.connectedDeviceId = rightPc.id
    rightPort.connectedLinkId = link.id
    rightPort.connectedDeviceId = sw.id
    links.push(link)
  }

  // Connect Switch (FastEthernet0/2) -> LeftHandSide PC
  const swPort2 = sw.ports[1]
  const leftPort = leftPc.ports[0]
  if (swPort2 && leftPort) {
    swPort2.status = 'up'
    leftPort.status = 'up'
    const link: NetworkLink = {
      id: 'link-sw-left',
      type: 'straight',
      fromDeviceId: sw.id,
      fromPortId: swPort2.id,
      toDeviceId: leftPc.id,
      toPortId: leftPort.id,
      status: 'up',
    }
    swPort2.connectedLinkId = link.id
    swPort2.connectedDeviceId = leftPc.id
    leftPort.connectedLinkId = link.id
    leftPort.connectedDeviceId = sw.id
    links.push(link)
  }

  // Header Note
  annotations.push({
    id: 'ann-ptanywhere',
    type: 'note',
    x: 140,
    y: 40,
    width: 680,
    height: 120,
    title: 'PTAnywhere Widget Topology (The Open University / Cisco Networking Academy)',
    text: 'Official CCNA Interactive Widget with 3D Isometric Hardware Models: Cloud (Internet), MyRouter (Cisco 2911), MySwitch (Catalyst 2960), RightHandSide PC (192.168.1.10), and LeftHandSide PC (192.168.1.20).\nTest end-to-end connectivity by clicking either PC and pinging 192.168.1.1 or 192.168.1.20!',
    color: '#f0fdf4',
    borderColor: '#22c55e',
  })

  return { devices, links, annotations }
}

