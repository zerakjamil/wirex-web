'use client'

import React, { useRef, useEffect } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { NetworkDevice, NetworkLink } from '@/types/network'
import { createDevice } from '@/simulator/deviceFactory'
import { getVlanSwitchLab, getCcnaEnterpriseLab, getWirelessLab, getPtAnywhereLab, getWlcLab, getIotLab } from '@/simulator/starterLabs'
import { useI18n } from '@/i18n/useI18n'
import { getOspfPracticeLab } from '@/simulator/ospfLab'
import { getRipPracticeLab } from '@/simulator/ripLab'

export function SampleLabsModal() {
  const { t } = useI18n()
  const { activeModal, setActiveModal, loadLab } = useNetworkStore()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (activeModal?.type === 'labs') {
      if (!dialogRef.current?.open) dialogRef.current?.showModal()
    } else {
      if (dialogRef.current?.open) dialogRef.current?.close()
    }
  }, [activeModal])

  if (activeModal?.type !== 'labs') return null

  const handleLoadPtAnywhereLab = () => {
    const { devices, links, annotations } = getPtAnywhereLab()
    loadLab(devices, links, annotations)
    setActiveModal(null)
  }

  const handleLoadVlanSwitch = () => {
    const { devices, links, annotations } = getVlanSwitchLab()
    loadLab(devices, links, annotations)
    setActiveModal(null)
  }

  const handleLoadEnterpriseLab = () => {
    const { devices, links, annotations } = getCcnaEnterpriseLab()
    loadLab(devices, links, annotations)
    setActiveModal(null)
  }

  const handleLoadWirelessLab = () => {
    const { devices, links, annotations } = getWirelessLab()
    loadLab(devices, links, annotations)
    setActiveModal(null)
  }

  const handleLoadWlcLab = () => {
    const { devices, links, annotations } = getWlcLab()
    loadLab(devices, links, annotations)
    setActiveModal(null)
  }

  const handleLoadIotLab = () => {
    const { devices, links, annotations } = getIotLab()
    loadLab(devices, links, annotations)
    setActiveModal(null)
  }

  const handleLoadLab1 = () => {
    // Lab 1: Switch & 2 PCs
    const sw = createDevice('switch', 380, 180)
    sw.name = 'Switch0'

    const pc0 = createDevice('pc', 200, 320)
    pc0.name = 'PC0'
    pc0.ports[0].ipAddress = '192.168.1.10'
    pc0.ports[0].subnetMask = '255.255.255.0'
    pc0.ports[0].status = 'up'

    const pc1 = createDevice('pc', 560, 320)
    pc1.name = 'PC1'
    pc1.ports[0].ipAddress = '192.168.1.20'
    pc1.ports[0].subnetMask = '255.255.255.0'
    pc1.ports[0].status = 'up'

    const link0: NetworkLink = {
      id: 'link-sw-pc0',
      type: 'straight',
      fromDeviceId: sw.id,
      fromPortId: 'FastEthernet0/1',
      toDeviceId: pc0.id,
      toPortId: 'FastEthernet0',
      status: 'up',
    }

    const link1: NetworkLink = {
      id: 'link-sw-pc1',
      type: 'straight',
      fromDeviceId: sw.id,
      fromPortId: 'FastEthernet0/2',
      toDeviceId: pc1.id,
      toPortId: 'FastEthernet0',
      status: 'up',
    }

    sw.ports[0].status = 'up'
    sw.ports[0].connectedLinkId = link0.id
    sw.ports[0].connectedDeviceId = pc0.id
    sw.ports[0].connectedPortId = pc0.ports[0].id

    sw.ports[1].status = 'up'
    sw.ports[1].connectedLinkId = link1.id
    sw.ports[1].connectedDeviceId = pc1.id
    sw.ports[1].connectedPortId = pc1.ports[0].id

    pc0.ports[0].connectedLinkId = link0.id
    pc0.ports[0].connectedDeviceId = sw.id
    pc0.ports[0].connectedPortId = 'FastEthernet0/1'

    pc1.ports[0].connectedLinkId = link1.id
    pc1.ports[0].connectedDeviceId = sw.id
    pc1.ports[0].connectedPortId = 'FastEthernet0/2'

    loadLab([sw, pc0, pc1], [link0, link1])
    setActiveModal(null)
  }

  const handleLoadLab2 = () => {
    // Lab 2: Cisco 1941 Router with 2 subnets
    const r0 = createDevice('router', 380, 100)
    r0.name = 'Router0'
    r0.ports[0].ipAddress = '192.168.1.1'
    r0.ports[0].subnetMask = '255.255.255.0'
    r0.ports[0].status = 'up'
    r0.ports[0].adminStatus = 'up'

    r0.ports[1].ipAddress = '192.168.2.1'
    r0.ports[1].subnetMask = '255.255.255.0'
    r0.ports[1].status = 'up'
    r0.ports[1].adminStatus = 'up'

    r0.routingTable = [
      {
        network: '192.168.1.0',
        netmask: '255.255.255.0',
        nextHop: 'connected',
        interfaceName: 'GigabitEthernet0/0',
        metric: 0,
        type: 'C',
      },
      {
        network: '192.168.2.0',
        netmask: '255.255.255.0',
        nextHop: 'connected',
        interfaceName: 'GigabitEthernet0/1',
        metric: 0,
        type: 'C',
      },
    ]

    const sw0 = createDevice('switch', 220, 240)
    sw0.name = 'Switch0'

    const sw1 = createDevice('switch', 540, 240)
    sw1.name = 'Switch1'

    const pc0 = createDevice('pc', 160, 380)
    pc0.name = 'PC0'
    pc0.ports[0].ipAddress = '192.168.1.10'
    pc0.ports[0].subnetMask = '255.255.255.0'
    pc0.ports[0].status = 'up'
    pc0.config.defaultGateway = '192.168.1.1'

    const pc1 = createDevice('pc', 600, 380)
    pc1.name = 'PC1'
    pc1.ports[0].ipAddress = '192.168.2.10'
    pc1.ports[0].subnetMask = '255.255.255.0'
    pc1.ports[0].status = 'up'
    pc1.config.defaultGateway = '192.168.2.1'

    const linkR0Sw0: NetworkLink = {
      id: 'link-r0-sw0',
      type: 'straight',
      fromDeviceId: r0.id,
      fromPortId: 'GigabitEthernet0/0',
      toDeviceId: sw0.id,
      toPortId: 'GigabitEthernet0/1',
      status: 'up',
    }

    const linkR0Sw1: NetworkLink = {
      id: 'link-r0-sw1',
      type: 'straight',
      fromDeviceId: r0.id,
      fromPortId: 'GigabitEthernet0/1',
      toDeviceId: sw1.id,
      toPortId: 'GigabitEthernet0/1',
      status: 'up',
    }

    const linkSw0Pc0: NetworkLink = {
      id: 'link-sw0-pc0',
      type: 'straight',
      fromDeviceId: sw0.id,
      fromPortId: 'FastEthernet0/1',
      toDeviceId: pc0.id,
      toPortId: 'FastEthernet0',
      status: 'up',
    }

    const linkSw1Pc1: NetworkLink = {
      id: 'link-sw1-pc1',
      type: 'straight',
      fromDeviceId: sw1.id,
      fromPortId: 'FastEthernet0/1',
      toDeviceId: pc1.id,
      toPortId: 'FastEthernet0',
      status: 'up',
    }

    r0.ports[0].connectedLinkId = linkR0Sw0.id
    r0.ports[0].connectedDeviceId = sw0.id
    r0.ports[0].connectedPortId = 'GigabitEthernet0/1'

    r0.ports[1].connectedLinkId = linkR0Sw1.id
    r0.ports[1].connectedDeviceId = sw1.id
    r0.ports[1].connectedPortId = 'GigabitEthernet0/1'

    sw0.ports[0].status = 'up'
    sw0.ports[0].connectedLinkId = linkSw0Pc0.id
    sw0.ports[0].connectedDeviceId = pc0.id
    sw0.ports[0].connectedPortId = 'FastEthernet0'

    sw1.ports[0].status = 'up'
    sw1.ports[0].connectedLinkId = linkSw1Pc1.id
    sw1.ports[0].connectedDeviceId = pc1.id
    sw1.ports[0].connectedPortId = 'FastEthernet0'

    pc0.ports[0].connectedLinkId = linkSw0Pc0.id
    pc0.ports[0].connectedDeviceId = sw0.id
    pc0.ports[0].connectedPortId = 'FastEthernet0/1'

    pc1.ports[0].connectedLinkId = linkSw1Pc1.id
    pc1.ports[0].connectedDeviceId = sw1.id
    pc1.ports[0].connectedPortId = 'FastEthernet0/1'

    loadLab([r0, sw0, sw1, pc0, pc1], [linkR0Sw0, linkR0Sw1, linkSw0Pc0, linkSw1Pc1])
    setActiveModal(null)
  }

  const handleLoadLab3 = () => {
    // Lab 3: Workstation, DNS & Web Server
    const sw = createDevice('switch', 380, 180)
    sw.name = 'Switch0'

    const pc = createDevice('pc', 200, 320)
    pc.name = 'Workstation'
    pc.ports[0].ipAddress = '192.168.1.10'
    pc.ports[0].subnetMask = '255.255.255.0'
    pc.ports[0].status = 'up'
    pc.config.dnsServer = '192.168.1.100'

    const server = createDevice('server', 560, 320)
    server.name = 'WebServer'
    server.ports[0].ipAddress = '192.168.1.100'
    server.ports[0].subnetMask = '255.255.255.0'
    server.ports[0].status = 'up'
    server.config.httpServiceEnabled = true
    server.config.dnsServiceEnabled = true
    server.config.dnsRecords = [{ domain: 'wirex.test', ip: '192.168.1.100' }]
    server.config.htmlContent = '<h1>wireX Web Server</h1><p>HTTP service responding with code 200 OK!</p>'

    const link0: NetworkLink = {
      id: 'link-sw-pc',
      type: 'straight',
      fromDeviceId: sw.id,
      fromPortId: 'FastEthernet0/1',
      toDeviceId: pc.id,
      toPortId: 'FastEthernet0',
      status: 'up',
    }

    const link1: NetworkLink = {
      id: 'link-sw-server',
      type: 'straight',
      fromDeviceId: sw.id,
      fromPortId: 'FastEthernet0/2',
      toDeviceId: server.id,
      toPortId: 'FastEthernet0',
      status: 'up',
    }

    sw.ports[0].status = 'up'
    sw.ports[0].connectedLinkId = link0.id
    sw.ports[0].connectedDeviceId = pc.id

    sw.ports[1].status = 'up'
    sw.ports[1].connectedLinkId = link1.id
    sw.ports[1].connectedDeviceId = server.id

    pc.ports[0].connectedLinkId = link0.id
    pc.ports[0].connectedDeviceId = sw.id

    server.ports[0].connectedLinkId = link1.id
    server.ports[0].connectedDeviceId = sw.id

    loadLab([sw, pc, server], [link0, link1])
    setActiveModal(null)
  }

  return (
    <dialog
      ref={dialogRef}
      className="pt-training-catalog"
      onCancel={() => setActiveModal(null)}
      onClick={e => {
        if (e.target === e.currentTarget) setActiveModal(null)
      }}
    >
      <header>
        <h2>{t('CCNA Practice Lab Scenarios')}</h2>
        <button aria-label="Close" onClick={() => setActiveModal(null)}>
          ×
        </button>
      </header>

      <p>
        {t('Pre-configured network scenarios for CCNA practice, routing protocols, and hardware simulation.')}
      </p>

      <ol>
        <li>
          <h3>{t('RIP route learning and failover')}</h3>
          <p>{t('Three routers exchange RIP updates. Inspect hop counts, ping between student PCs, and shut a transit interface to observe route withdrawal and failover.')}</p>
          <small dir="ltr">RIPv2 · 5 devices</small>
          <button type="button" onClick={() => { const lab = getRipPracticeLab(); loadLab(lab.devices, lab.links, lab.annotations); setActiveModal(null) }}>{t('Load Lab')}</button>
        </li>
        <li>
          <h3>{t('OSPF route learning and failover')}</h3>
          <p>{t('Three routers exchange OSPF packets in area 0. Inspect learned routes, ping between student PCs, and shut a transit interface to observe the backup path.')}</p>
          <small dir="ltr">OSPFv2 · Area 0 · 5 devices</small>
          <button type="button" onClick={() => { const lab = getOspfPracticeLab(); loadLab(lab.devices, lab.links, lab.annotations); setActiveModal(null) }}>{t('Load Lab')}</button>
        </li>
        <li>
          <h3>PTAnywhere 3D Widget: Cloud, MyRouter, MySwitch & PCs</h3>
          <p>
            The Open University and Cisco Networking Academy interactive 3D layout: Internet (Cloud), MyRouter (2911), MySwitch (2960), RightHandSide PC, and LeftHandSide PC with full IP addressing and ping routing!
          </p>
          <small dir="ltr">PTAnywhere 3D Lab</small>
          <button
            type="button"
            onClick={handleLoadPtAnywhereLab}
            style={{ fontWeight: 'bold' }}
          >
            {t('Load Lab')}
          </button>
        </li>

        <li>
          <h3>Enterprise Dual-Core (VLANs, OSPF, EtherChannel, Console)</h3>
          <p>
            Full multi-layer topology matching official Cisco curriculum: 3560 Core Switches, EtherChannel bundles (Po1 to Po6), OSPF routing, GRE tunnel, Web Server (michaelcozier.com), VLAN 10 and VLAN 20 zones, and Laptop0 with Console Cable.
          </p>
          <small dir="ltr">CCNA Enterprise Curriculum</small>
          <button
            type="button"
            onClick={handleLoadEnterpriseLab}
            style={{ fontWeight: 'bold' }}
          >
            {t('Load Lab')}
          </button>
        </li>

        <li>
          <h3>Wireless LAN & WPC300N Hardware Slot</h3>
          <p>
            Demonstrates 802.11 wireless signal propagation from AccessPoint-PT to Smartphone1. Practice opening Laptop1 Physical tab, turning off power, and inserting the WPC300N wireless card!
          </p>
          <small dir="ltr">Wireless LAN & Modular Hardware</small>
          <button
            type="button"
            onClick={handleLoadWirelessLab}
            style={{ fontWeight: 'bold' }}
          >
            {t('Load Lab')}
          </button>
        </li>

        <li>
          <h3>{t('Wireless LAN Controller & Lightweight Access Points')}</h3>
          <p>
            {t('Two lightweight access points join WLC1 over the wired LAN, receive both WLANs through CAPWAP configuration updates, and carry client traffic that is centrally switched by the controller.')}
          </p>
          <small dir="ltr">{t('Wireless LAN Controller')}</small>
          <button
            type="button"
            onClick={handleLoadWlcLab}
            style={{ fontWeight: 'bold' }}
          >
            {t('Load Lab')}
          </button>
        </li>

        <li>
          <h3>{t('Smart Home with IoT Server')}</h3>
          <p>
            {t('Six smart devices register with the IoT server through a switch, report their state, and accept remote commands from the Services tab.')}
          </p>
          <small dir="ltr">{t('IoT Devices')}</small>
          <button
            type="button"
            onClick={handleLoadIotLab}
            style={{ fontWeight: 'bold' }}
          >
            {t('Load Lab')}
          </button>
        </li>

        <li>
          <h3>VLAN-SWITCH.pkt: Multi-Tier Campus</h3>
          <p>
            Classic Enterprise Campus layout with Router2, Central 3560, Distribution Switches, Access SW-A through SW-F, 24 PCs, 4 Servers, and WAN Clouds.
          </p>
          <small dir="ltr">Campus Switch Lab</small>
          <button
            type="button"
            onClick={handleLoadVlanSwitch}
            style={{ fontWeight: 'bold' }}
          >
            {t('Load Lab')}
          </button>
        </li>

        <li>
          <h3>Lab 1: L2 Switch & 2 PCs (ARP & Ping)</h3>
          <p>
            Single broadcast domain. Demonstrates ARP broadcast resolution, CAM MAC address table learning, and ICMP ping replies.
          </p>
          <small dir="ltr">CCNA Basic Switching</small>
          <button
            type="button"
            onClick={handleLoadLab1}
            style={{ fontWeight: 'bold' }}
          >
            {t('Load Lab')}
          </button>
        </li>

        <li>
          <h3>Lab 2: Cisco 1941 Router with 2 Subnets</h3>
          <p>
            Multi-subnet routing between 192.168.1.0/24 and 192.168.2.0/24 through Cisco GigabitEthernet interfaces with default gateways.
          </p>
          <small dir="ltr">CCNA Inter-Network Routing</small>
          <button
            type="button"
            onClick={handleLoadLab2}
            style={{ fontWeight: 'bold' }}
          >
            {t('Load Lab')}
          </button>
        </li>

        <li>
          <h3>{t('Lab 3: Workstation, DNS & HTTP Web Server')}</h3>
          <p>
            {t('Resolve wirex.test with the server DNS service over UDP port 53, then load its HTTP page. Edit the resolver, DNS records, and HTTP service to test success and failure paths.')}
          </p>
          <small dir="ltr">CCNA Application Layer</small>
          <button
            type="button"
            onClick={handleLoadLab3}
            style={{ fontWeight: 'bold' }}
          >
            {t('Load Lab')}
          </button>
        </li>
      </ol>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid #c0cacf',
        }}
      >
        <small>{t('Practice Labs')}</small>
        <button type="button" onClick={() => setActiveModal(null)}>
          {t('Close')}
        </button>
      </div>
    </dialog>
  )
}
