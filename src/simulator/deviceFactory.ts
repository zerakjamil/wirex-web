import { NetworkDevice, DeviceType, NetworkPort } from '@/types/network'
import { generateMacAddress } from './protocols/ip'
import { defaultIotState, iotThingSpec } from './iot'

const deviceCounters: Record<DeviceType, number> = {
  router: 0,
  switch: 0,
  pc: 0,
  laptop: 0,
  server: 0,
  printer: 0,
  phone: 0,
  tv: 0,
  tablet: 0,
  smartphone: 0,
  wireless: 0,
  wlc: 0,
  iot: 0,
  security: 0,
  hub: 0,
  cloud: 0,
  modem: 0,
}

export function createDevice(type: DeviceType, x: number, y: number, customModel?: string): NetworkDevice {
  const index = deviceCounters[type]++
  const id = `${type}-${crypto.randomUUID()}`

  let name = ''
  let model = customModel || ''
  let ports: NetworkPort[] = []
  let iotKind: NetworkDevice['config']['iotKind']

  switch (type) {
    case 'router': {
      model = customModel || '2911'
      name = `Router${index}`

      if (model === '4331' || model === '4321' || model === 'ISR4331' || model === 'ISR4321') {
        ports = [
          createPort('GigabitEthernet0/0/0', 'Gi0/0/0', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/0/1', 'Gi0/0/1', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/0/2', 'Gi0/0/2', 'gigabitethernet', 'down'),
          createPort('Serial0/1/0', 'Se0/1/0', 'serial', 'down'),
          createPort('Serial0/1/1', 'Se0/1/1', 'serial', 'down'),
        ]
      } else if (model === '1941' || model === '2901') {
        ports = [
          createPort('GigabitEthernet0/0', 'Gi0/0', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/1', 'Gi0/1', 'gigabitethernet', 'down'),
          createPort('Serial0/0/0', 'Se0/0/0', 'serial', 'down'),
          createPort('Serial0/0/1', 'Se0/0/1', 'serial', 'down'),
        ]
      } else if (model === '2911') {
        ports = [
          createPort('GigabitEthernet0/0', 'Gi0/0', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/1', 'Gi0/1', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/2', 'Gi0/2', 'gigabitethernet', 'down'),
          createPort('Serial0/0/0', 'Se0/0/0', 'serial', 'down'),
          createPort('Serial0/0/1', 'Se0/0/1', 'serial', 'down'),
        ]
      } else if (model === '819HGW' || model === '819HG-4G-IOX' || model === '829') {
        ports = [
          createPort('FastEthernet0', 'Fa0', 'fastethernet', 'down'),
          createPort('FastEthernet1', 'Fa1', 'fastethernet', 'down'),
          createPort('FastEthernet2', 'Fa2', 'fastethernet', 'down'),
          createPort('FastEthernet3', 'Fa3', 'fastethernet', 'down'),
          createPort('Cellular0', 'Cell0', 'wireless', 'down'),
        ]
      } else if (model === 'CGR1240') {
        ports = [
          createPort('FastEthernet0/0', 'Fa0/0', 'fastethernet', 'down'),
          createPort('FastEthernet0/1', 'Fa0/1', 'fastethernet', 'down'),
          createPort('Serial0/0', 'Se0/0', 'serial', 'down'),
          createPort('Serial0/1', 'Se0/1', 'serial', 'down'),
          createPort('Cellular0', 'Cell0', 'wireless', 'down'),
        ]
      } else if (model === 'IR1101') {
        ports = [
          createPort('GigabitEthernet0/0', 'Gi0/0', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/1', 'Gi0/1', 'gigabitethernet', 'down'),
          createPort('Serial0/0', 'Se0/0', 'serial', 'down'),
          createPort('Cellular0', 'Cell0', 'wireless', 'down'),
        ]
      } else if (model === 'IR8340') {
        ports = [
          createPort('GigabitEthernet0/0', 'Gi0/0', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/1', 'Gi0/1', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/2', 'Gi0/2', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/3', 'Gi0/3', 'gigabitethernet', 'down'),
          createPort('Serial0/0', 'Se0/0', 'serial', 'down'),
          createPort('Serial0/1', 'Se0/1', 'serial', 'down'),
        ]
      } else if (model === 'PT8200') {
        ports = [
          createPort('GigabitEthernet0/0/0', 'Gi0/0/0', 'gigabitethernet', 'down'),
          createPort('GigabitEthernet0/0/1', 'Gi0/0/1', 'gigabitethernet', 'down'),
          createPort('Serial0/1/0', 'Se0/1/0', 'serial', 'down'),
          createPort('Serial0/1/1', 'Se0/1/1', 'serial', 'down'),
        ]
      } else if (model === '2620XM') {
        ports = [
          createPort('FastEthernet0/0', 'Fa0/0', 'fastethernet', 'down'),
          createPort('Serial0/0', 'Se0/0', 'serial', 'down'),
        ]
      } else {
        // Default 2811, 1841, PT-Router
        ports = [
          createPort('FastEthernet0/0', 'Fa0/0', 'fastethernet', 'down'),
          createPort('FastEthernet0/1', 'Fa0/1', 'fastethernet', 'down'),
          createPort('Serial0/0/0', 'Se0/0/0', 'serial', 'down'),
          createPort('Serial0/0/1', 'Se0/0/1', 'serial', 'down'),
        ]
      }
      break
    }

    case 'switch': {
      model = customModel || '2960-24TT'
      name = `Switch${index}`

      if (model === '3560-24PS' || model === '3650-24PS') {
        // Multilayer L3 switches
        ports = []
        for (let i = 1; i <= 24; i++) {
          ports.push(createPort(`FastEthernet0/${i}`, `Fa0/${i}`, 'fastethernet', 'up'))
        }
        ports.push(createPort('GigabitEthernet0/1', 'Gi0/1', 'gigabitethernet', 'up'))
        ports.push(createPort('GigabitEthernet0/2', 'Gi0/2', 'gigabitethernet', 'up'))
      } else if (model === '2950-24') {
        ports = []
        for (let i = 1; i <= 24; i++) {
          ports.push(createPort(`FastEthernet0/${i}`, `Fa0/${i}`, 'fastethernet', 'up'))
        }
      } else if (model === 'IE-2000') {
        ports = []
        for (let i = 1; i <= 8; i++) {
          ports.push(createPort(`FastEthernet0/${i}`, `Fa0/${i}`, 'fastethernet', 'up'))
        }
        ports.push(createPort('GigabitEthernet0/1', 'Gi0/1', 'gigabitethernet', 'up'))
        ports.push(createPort('GigabitEthernet0/2', 'Gi0/2', 'gigabitethernet', 'up'))
      } else if (model === 'IE-3400') {
        ports = []
        for (let i = 1; i <= 8; i++) {
          ports.push(createPort(`GigabitEthernet0/${i}`, `Gi0/${i}`, 'gigabitethernet', 'up'))
        }
        ports.push(createPort('GigabitEthernet0/9', 'Gi0/9', 'gigabitethernet', 'up'))
        ports.push(createPort('GigabitEthernet0/10', 'Gi0/10', 'gigabitethernet', 'up'))
      } else if (model === 'IE-9320') {
        ports = []
        for (let i = 1; i <= 24; i++) {
          ports.push(createPort(`GigabitEthernet0/${i}`, `Gi0/${i}`, 'gigabitethernet', 'up'))
        }
        for (let i = 25; i <= 28; i++) {
          ports.push(createPort(`GigabitEthernet0/${i}`, `Gi0/${i}`, 'gigabitethernet', 'up'))
        }
      } else if (model === 'Bridge-PT') {
        ports = [
          createPort('FastEthernet0/1', 'Fa0/1', 'fastethernet', 'up'),
          createPort('FastEthernet0/2', 'Fa0/2', 'fastethernet', 'up'),
        ]
      } else if (model === 'PT-Switch' || model === 'Switch-PT') {
        ports = [
          createPort('FastEthernet0/1', 'Fa0/1', 'fastethernet', 'up'),
          createPort('FastEthernet0/2', 'Fa0/2', 'fastethernet', 'up'),
          createPort('FastEthernet0/3', 'Fa0/3', 'fastethernet', 'up'),
          createPort('FastEthernet0/4', 'Fa0/4', 'fastethernet', 'up'),
        ]
      } else {
        // Standard 2960-24TT / 2950T-24
        ports = []
        for (let i = 1; i <= 24; i++) {
          ports.push(createPort(`FastEthernet0/${i}`, `Fa0/${i}`, 'fastethernet', 'up'))
        }
        ports.push(createPort('GigabitEthernet0/1', 'Gi0/1', 'gigabitethernet', 'up'))
        ports.push(createPort('GigabitEthernet0/2', 'Gi0/2', 'gigabitethernet', 'up'))
      }
      break
    }

    case 'hub': {
      model = customModel || 'PT-Hub'
      name = `Hub${index}`
      if (model === 'Coaxial Splitter' || model === 'CoAxialSplitter-PT') {
        ports = [
          createPort('Port 0', 'Port0', 'coaxial', 'up'),
          createPort('Port 1', 'Port1', 'coaxial', 'up'),
          createPort('Port 2', 'Port2', 'coaxial', 'up'),
        ]
      } else if (model === 'Repeater-PT') {
        ports = [
          createPort('FastEthernet0', 'Fa0', 'fastethernet', 'up'),
          createPort('FastEthernet1', 'Fa1', 'fastethernet', 'up'),
        ]
      } else {
        ports = [
          createPort('FastEthernet0', 'Fa0', 'fastethernet', 'up'),
          createPort('FastEthernet1', 'Fa1', 'fastethernet', 'up'),
          createPort('FastEthernet2', 'Fa2', 'fastethernet', 'up'),
          createPort('FastEthernet3', 'Fa3', 'fastethernet', 'up'),
          createPort('FastEthernet4', 'Fa4', 'fastethernet', 'up'),
          createPort('FastEthernet5', 'Fa5', 'fastethernet', 'up'),
        ]
      }
      break
    }

    case 'wireless': {
      model = customModel || 'WRT300N'
      name = `Wireless${index}`
      if (model === 'WRT300N' || model === 'Linksys-WRT300N' || model === 'HomeRouter-PT-AC') {
        ports = [
          createPort('Internet', 'Internet', 'fastethernet', 'up'),
          createPort('Ethernet 1', 'Eth1', 'fastethernet', 'up'),
          createPort('Ethernet 2', 'Eth2', 'fastethernet', 'up'),
          createPort('Ethernet 3', 'Eth3', 'fastethernet', 'up'),
          createPort('Ethernet 4', 'Eth4', 'fastethernet', 'up'),
          createPort('Wireless-N', 'Wlan0', 'wireless', 'up'),
        ]
      } else {
        // Access Point (autonomous) and Lightweight Access Point
        ports = [
          createPort('Port 0', 'Port0', 'fastethernet', 'up'),
          createPort('Port 1', 'Port1', 'wireless', 'up'),
        ]
      }
      break
    }

    case 'wlc': {
      model = customModel || 'WLC-PT'
      name = `WLC${index}`
      ports = [
        createPort('GigabitEthernet0/0', 'Gi0/0', 'gigabitethernet', 'up'),
        createPort('GigabitEthernet0/1', 'Gi0/1', 'gigabitethernet', 'up'),
      ]
      break
    }

    case 'iot': {
      const spec = iotThingSpec(customModel || '')
      model = spec.model
      iotKind = spec.kind
      name = `${spec.label.replace(/\s+/g, '')}${index}`
      ports = [
        createPort('FastEthernet0', 'Fa0', 'fastethernet', 'up'),
        createPort('Wireless0', 'Wlan0', 'wireless', 'up'),
      ]
      break
    }

    case 'security': {
      model = customModel || '5505'
      name = `ASA${index}`
      const p0 = createPort('Ethernet0/0', 'Eth0/0', 'fastethernet', 'up')
      p0.nameif = 'outside'
      p0.securityLevel = 0
      p0.vlan = 2

      const p1 = createPort('Ethernet0/1', 'Eth0/1', 'fastethernet', 'up')
      p1.nameif = 'inside'
      p1.securityLevel = 100
      p1.vlan = 1
      p1.ipAddress = '192.168.1.1'
      p1.subnetMask = '255.255.255.0'

      ports = [
        p0,
        p1,
        createPort('Ethernet0/2', 'Eth0/2', 'fastethernet', 'up'),
        createPort('Ethernet0/3', 'Eth0/3', 'fastethernet', 'up'),
        createPort('Ethernet0/4', 'Eth0/4', 'fastethernet', 'up'),
        createPort('Ethernet0/5', 'Eth0/5', 'fastethernet', 'up'),
        createPort('Ethernet0/6', 'Eth0/6', 'fastethernet', 'up'),
        createPort('Ethernet0/7', 'Eth0/7', 'fastethernet', 'up'),
      ]
      for (let i = 2; i < ports.length; i++) {
        ports[i].vlan = 1
      }
      break
    }

    case 'pc': {
      model = customModel || 'PC-PT'
      name = `PC${index}`
      ports = [model === 'Wireless PC'
        ? createPort('Wireless0', 'Wlan0', 'wireless', 'up')
        : createPort('FastEthernet0', 'Fa0', 'fastethernet', 'up')]
      break
    }

    case 'laptop': {
      model = customModel || 'Laptop-PT'
      name = `Laptop${index}`
      // By default, laptops start with a wired FastEthernet NIC.
      // Students swap it for a WPC300N wireless card in the Physical tab;
      // the preconfigured Wireless Laptop ships with that card installed.
      ports = [model === 'Wireless Laptop'
        ? createPort('Wireless0', 'Wlan0', 'wireless', 'up')
        : createPort('FastEthernet0', 'Fa0', 'fastethernet', 'up')]
      break
    }

    case 'server': {
      model = customModel || 'Server-PT'
      name = `Server${index}`
      ports = [
        createPort('FastEthernet0', 'Fa0', 'fastethernet', 'up'),
        createPort('GigabitEthernet0', 'Gi0', 'gigabitethernet', 'up'),
      ]
      break
    }

    case 'printer': {
      model = customModel || 'Printer-PT'
      name = `Printer${index}`
      ports = [createPort('FastEthernet0', 'Fa0', 'fastethernet', 'up')]
      break
    }

    case 'phone': {
      model = customModel || 'IP-Phone-PT'
      name = `IP Phone${index}`
      ports = [
        createPort('FastEthernet0', 'Fa0', 'fastethernet', 'up'),
        createPort('PC Port', 'PCPort', 'fastethernet', 'up'),
      ]
      break
    }

    case 'tv': {
      model = customModel || 'TV-PT'
      name = `TV${index}`
      ports = [createPort('FastEthernet0', 'Fa0', 'fastethernet', 'up')]
      break
    }

    case 'tablet': {
      model = customModel || 'Tablet-PT'
      name = `Tablet${index}`
      ports = [createPort('Wireless0', 'Wlan0', 'wireless', 'up')]
      break
    }

    case 'smartphone': {
      model = customModel || 'Smartphone-PT'
      name = `Smartphone${index}`
      ports = [
        createPort('Wireless0', 'Wlan0', 'wireless', 'up'),
        createPort('Cellular0', 'Cell0', 'wireless', 'up'),
      ]
      break
    }

    case 'cloud': {
      model = customModel || 'Cloud-PT'
      name = `Cloud${index}`
      ports = [
        createPort('Ethernet6', 'Eth6', 'fastethernet', 'up'),
        createPort('Ethernet7', 'Eth7', 'fastethernet', 'up'),
        createPort('Ethernet8', 'Eth8', 'fastethernet', 'up'),
        createPort('Serial0', 'Se0', 'serial', 'up'),
        createPort('Serial1', 'Se1', 'serial', 'up'),
        createPort('Serial2', 'Se2', 'serial', 'up'),
        createPort('Coaxial7', 'Coax7', 'coaxial', 'up'),
        createPort('Modem4', 'Modem4', 'phone', 'up'),
      ]
      break
    }

    case 'modem': {
      model = customModel || 'Cable-Modem-PT'
      name = `Modem${index}`
      ports = [
        createPort('Port 0', 'Port0', model.includes('DSL')?'phone':'coaxial', 'up'),
        createPort('Port 1', 'Port1', 'fastethernet', 'up'),
      ]
      break
    }
  }

  const defaultModules: Record<DeviceType, string[]> = {
    laptop: [model === 'Wireless Laptop' ? 'WPC300N' : 'PT-LAPTOP-NM-1CFE'],
    pc: [model === 'Wireless PC' ? 'WPC300N' : 'PT-HOST-NM-1CFE'],
    router: !['819IOX','819HGW','819HG-4G-IOX','829','1240','CGR1240','IR1101'].includes(model)&&ports.some(p=>p.type==='serial')?[ports.filter(p=>p.type==='serial').length===1?'WIC-1T':'WIC-2T']:[],
    switch: [],
    wireless: [],
    wlc: [],
    iot: [],
    smartphone: [],
    tablet: [],
    server: ['PT-HOST-NM-1CGE'],
    printer: [],
    phone: [],
    tv: [],
    security: [],
    hub: [],
    cloud: [],
    modem: [],
  }

  const emptyChassis = ['PT-Empty', 'Router-PT-Empty', 'Switch-PT-Empty', 'Cloud-Empty', 'Cloud-PT-Empty'].includes(model)
  if (emptyChassis) {
    ports = []
  }
  ports = ports.map(port => ({
    ...port,
    ...(['laptop', 'pc'].includes(type) || (type === 'server' && port.name === 'GigabitEthernet0') || (type === 'router' && port.type === 'serial' && defaultModules.router.length>0) ? { moduleSlot: 0 } : {})
  }))
  return {
    id,
    name,
    type,
    model,
    x,
    y,
    ports,
    power: true,
    modules: emptyChassis ? [] : [...(defaultModules[type] || [])],
    config: {
      hostname: type === 'security' ? 'ciscoasa' : name,
      banner: 'Unauthorized access is prohibited!',
      vlans: type === 'security'
        ? [{ id: 1, name: 'inside' }, { id: 2, name: 'outside' }]
        : [{ id: 1, name: 'default' }],
      ...(model === 'LAP-PT' || model === '3702i' ? { apMode: 'lightweight' as const } : {}),
      ...(type === 'wireless' && model !== 'Cell-Tower' && ports.some(port => port.type === 'wireless')
        ? {
            wirelessSsid: ['WRT300N', 'Linksys-WRT300N', 'HomeRouter-PT-AC'].includes(model) ? 'linksys' : 'Default',
            wirelessChannel: 6,
            wirelessAuthentication: 'open' as const,
            wirelessEncryption: 'aes' as const,
          }
        : {}),
      ...(type === 'iot' && iotKind
        ? {
            iotKind,
            iotState: { ...(iotThingSpec(model).initial ?? defaultIotState(iotKind)) },
            iotServerAddress: 'auto',
            dhcpEnabled: true,
          }
        : {}),
      ...(type === 'security'
        ? {
            asaInspection: { icmp: true, http: true, tcp: true, dns: true, udp: true, tftp: true },
            asaNatRules: [
              {
                id: 'nat-inside-pat',
                sourceInterface: 'inside',
                destInterface: 'outside',
                type: 'dynamic-pat' as const,
                sourceNet: '192.168.1.0/24',
              },
            ],
          }
        : {}),
    },
    routingTable: type === 'security'
      ? [
          {
            network: '192.168.1.0',
            netmask: '255.255.255.0',
            nextHop: '192.168.1.1',
            interfaceName: 'Ethernet0/1',
            metric: 0,
            type: 'C' as const,
          },
        ]
      : [],
    arpTable: [],
    macTable: [],
    cliHistory: [],
    currentCliMode: type === 'router' || type === 'switch' ? 'user' : 'priv',
  }
}

export interface ModuleDefinition {
  portCount?: number
  media?: 'copper' | 'fiber'
  id: string
  name: string
  description: string
  applicableTypes: DeviceType[]
  portType?: 'fastethernet' | 'gigabitethernet' | 'serial' | 'wireless' | 'phone' | 'coaxial'
  portName?: string
  shortName?: string
}

export const MODULE_CATALOG: Record<string, ModuleDefinition> = {
  'WPC300N': {
    id: 'WPC300N',
    name: 'Linksys-WPC300N 2.4GHz Wireless-N Adapter',
    description:
      'The Linksys-WPC300N module provides one 2.4GHz wireless interface suitable for connection to wireless networks. The module supports protocols that use Ethernet for LAN access.',
    applicableTypes: ['laptop', 'pc'],
    portType: 'wireless',
    portName: 'Wireless0',
    shortName: 'Wlan0',
  },
  'PT-LAPTOP-NM-1AM': {
    id: 'PT-LAPTOP-NM-1AM',
    name: '1-Port Analog Modem RJ-11',
    description:
      'The PT-LAPTOP-NM-1AM module provides one RJ-11 connector for connection to a public switched telephone network (PSTN) telephone line.',
    applicableTypes: ['laptop'],
    portType: 'phone',
    portName: 'Modem0',
    shortName: 'Mo0',
  },
  'PT-LAPTOP-NM-1CE': {
    id: 'PT-LAPTOP-NM-1CE',
    name: '1-Port 10BASE-T Ethernet RJ-45',
    description:
      'The PT-LAPTOP-NM-1CE module provides one 10Base-T Ethernet interface for connection to LAN networks.',
    applicableTypes: ['laptop'],
    portType: 'fastethernet',
    portName: 'Ethernet0',
    shortName: 'Eth0',
  },
  'PT-LAPTOP-NM-1CFE': {
    id: 'PT-LAPTOP-NM-1CFE',
    name: '1-Port 100BASE-TX FastEthernet RJ-45',
    description:
      'The PT-LAPTOP-NM-1CFE module provides one 10/100Base-TX Fast Ethernet interface for copper network connections.',
    applicableTypes: ['laptop'],
    portType: 'fastethernet',
    portName: 'FastEthernet0',
    shortName: 'Fa0',
  },
  'PT-LAPTOP-NM-1CGE': {
    id: 'PT-LAPTOP-NM-1CGE',
    name: '1-Port 1000BASE-T Gigabit Ethernet',
    description:
      'The PT-LAPTOP-NM-1CGE module provides one Gigabit Ethernet interface for high speed copper connections.',
    applicableTypes: ['laptop'],
    portType: 'gigabitethernet',
    portName: 'GigabitEthernet0',
    shortName: 'Gi0',
  },
  'PT-LAPTOP-NM-1FFE': {
    id: 'PT-LAPTOP-NM-1FFE',
    name: '1-Port Fast Ethernet Multi-mode Fiber',
    description:
      'The PT-LAPTOP-NM-1FFE module provides one Fast Ethernet multi-mode fiber interface for high speed optical networking.',
    applicableTypes: ['laptop'],
    portType: 'fastethernet',
    portName: 'FastEthernet0',
    shortName: 'Fa0',
  },
  'PT-LAPTOP-NM-1FGE': {
    id: 'PT-LAPTOP-NM-1FGE',
    name: '1-Port Gigabit Ethernet Multi-mode Fiber',
    description:
      'The PT-LAPTOP-NM-1FGE module provides one Gigabit Ethernet optical fiber interface.',
    applicableTypes: ['laptop'],
    portType: 'gigabitethernet',
    portName: 'GigabitEthernet0',
    shortName: 'Gi0',
  },
  'PT-LAPTOP-NM-1W': {
    id: 'PT-LAPTOP-NM-1W',
    name: '1-Port 2.4GHz 802.11b/g Wireless',
    description:
      'The PT-LAPTOP-NM-1W module provides a 2.4GHz wireless interface for IEEE 802.11b/g connectivity.',
    applicableTypes: ['laptop'],
    portType: 'wireless',
    portName: 'Wireless0',
    shortName: 'Wlan0',
  },
  'PT-LAPTOP-NM-1W-A': {
    id: 'PT-LAPTOP-NM-1W-A',
    name: '1-Port 5GHz 802.11a Wireless',
    description:
      'The PT-LAPTOP-NM-1W-A module provides a 5GHz wireless interface for IEEE 802.11a connectivity.',
    applicableTypes: ['laptop'],
    portType: 'wireless',
    portName: 'Wireless0',
    shortName: 'Wlan0',
  },
  'PT-LAPTOP-NM-1W-AC': {
    id: 'PT-LAPTOP-NM-1W-AC',
    name: '1-Port Dual-Band 802.11ac Wireless',
    description:
      'The PT-LAPTOP-NM-1W-AC module provides high-speed dual-band 802.11ac wireless connectivity.',
    applicableTypes: ['laptop'],
    portType: 'wireless',
    portName: 'Wireless0',
    shortName: 'Wlan0',
  },
  'PT-LAPTOP-NM-3G/4G': {
    id: 'PT-LAPTOP-NM-3G/4G',
    name: '1-Port Cellular 3G/4G Interface',
    description:
      'The PT-LAPTOP-NM-3G/4G module provides wireless wide area network (WWAN) cellular connectivity.',
    applicableTypes: ['laptop'],
    portType: 'wireless',
    portName: 'Cellular0',
    shortName: 'Cell0',
  },
  'PT-HEADPHONE': {
    id: 'PT-HEADPHONE',
    name: 'Headphone Audio Jack',
    description:
      'Analog audio output for VoIP communication and multimedia playback.',
    applicableTypes: ['laptop', 'pc'],
  },
  'PT-MICROPHONE': {
    id: 'PT-MICROPHONE',
    name: 'Microphone Audio Jack',
    description:
      'Analog audio input for VoIP phone calling and voice recording.',
    applicableTypes: ['laptop', 'pc'],
  },
  'WIC-2T': {
    portCount: 2,
    id: 'WIC-2T',
    name: '2-Port Serial WAN Interface Card',
    description:
      'The Cisco WIC-2T provides two high-speed serial WAN ports for point-to-point leased lines and frame relay connections.',
    applicableTypes: ['router'],
    portType: 'serial',
    portName: 'Serial0/0/0',
    shortName: 'Se0/0/0',
  },
  'WIC-1T': {
    id: 'WIC-1T',
    name: '1-Port Serial WAN Interface Card',
    description:
      'The Cisco WIC-1T provides one high-speed serial port for serial synchronous connections.',
    applicableTypes: ['router'],
    portType: 'serial',
    portName: 'Serial0/0/0',
    shortName: 'Se0/0/0',
  },
  'HWIC-2T': {
    portCount: 2,
    id: 'HWIC-2T',
    name: '2-Port Cisco High-Speed Serial WAN Interface Card',
    description:
      'The Cisco HWIC-2T provides 2 high-speed synchronous serial ports for Cisco 1900/2900 series ISRs.',
    applicableTypes: ['router'],
    portType: 'serial',
    portName: 'Serial0/1/0',
    shortName: 'Se0/1/0',
  },
  'NM-ESW-16': {
    portCount: 16,
    id: 'NM-ESW-16',
    name: '16-Port 10/100 EtherSwitch Network Module',
    description:
      'The Cisco NM-ESW-16 adds 16 switched 10/100 Ethernet ports directly inside the router chassis.',
    applicableTypes: ['router'],
    portType: 'fastethernet',
    portName: 'FastEthernet1/0',
    shortName: 'Fa1/0',
  },
  'GLC-LH-SMD': {
    id: 'GLC-LH-SMD',
    name: '1000BASE-LX/LH SFP Transceiver Module',
    description:
      'Cisco SFP optical transceiver module operating on standard single-mode and multi-mode fiber-optic links.',
    applicableTypes: ['switch', 'router'],
    portType: 'gigabitethernet',
    portName: 'GigabitEthernet0/2',
    shortName: 'Gi0/2',
  },
  'GLC-SX-MMD': {
    id: 'GLC-SX-MMD',
    name: '1000BASE-SX SFP Transceiver Module',
    description:
      'Cisco SFP optical transceiver module operating on 850nm multi-mode fiber links up to 550 meters.',
    applicableTypes: ['switch', 'router'],
    portType: 'gigabitethernet',
    portName: 'GigabitEthernet0/2',
    shortName: 'Gi0/2',
  },
  'GLC-T': {
    id: 'GLC-T',
    name: '1000BASE-T SFP Copper RJ-45 Transceiver',
    description:
      'Cisco SFP copper transceiver providing 1000BASE-T connectivity over Category 5 unshielded twisted pair cables.',
    applicableTypes: ['switch', 'router'],
    portType: 'gigabitethernet',
    portName: 'GigabitEthernet0/2',
    shortName: 'Gi0/2',
  },
  'HWIC-4ESW': {
    portCount: 4,
    id: 'HWIC-4ESW',
    name: '4-Port 10/100 EtherSwitch HWIC',
    description:
      'The Cisco 4-Port EtherSwitch 10/100 High-Speed WAN Interface Card provides switched FastEthernet ports for integrated routing and switching.',
    applicableTypes: ['router'],
    portType: 'fastethernet',
    portName: 'FastEthernet0/1/0',
    shortName: 'Fa0/1/0',
  },
  'PT-HOST-NM-1CFE': {
    id: 'PT-HOST-NM-1CFE',
    name: '1-Port FastEthernet Copper NIC (RJ-45)',
    description:
      'The PT-HOST-NM-1CFE provides one 10/100Base-TX Fast Ethernet interface for desktop and server network connectivity.',
    applicableTypes: ['pc', 'server'],
    portType: 'fastethernet',
    portName: 'FastEthernet0',
    shortName: 'Fa0',
  },
  'PT-HOST-NM-1CGE': {
    id:'PT-HOST-NM-1CGE',name:'1-Port Gigabit Ethernet Host Adapter',
    description:'Adds one Gigabit Ethernet interface to a PC or server.',
    applicableTypes:['pc','server'],portType:'gigabitethernet',portName:'GigabitEthernet0',shortName:'Gi0',
  },
  'PT-CLOUD-NM-1CFE': {id:'PT-CLOUD-NM-1CFE',name:'Cloud Ethernet Adapter',description:'Adds an Ethernet network connector.',applicableTypes:['cloud'],portType:'fastethernet',portName:'Ethernet0',shortName:'Eth0'},
  'PT-CLOUD-NM-1S': {id:'PT-CLOUD-NM-1S',name:'Cloud Serial Adapter',description:'Adds a serial network connector.',applicableTypes:['cloud'],portType:'serial',portName:'Serial0',shortName:'Se0'},
  'PT-CLOUD-NM-1CX': {id:'PT-CLOUD-NM-1CX',name:'Cloud Coaxial Adapter',description:'Adds a coaxial network connector.',applicableTypes:['cloud'],portType:'coaxial',portName:'Coaxial0',shortName:'Coax0'},
  'PT-CLOUD-NM-1AM': {id:'PT-CLOUD-NM-1AM',name:'Cloud Telephone Adapter',description:'Adds a telephone network connector.',applicableTypes:['cloud'],portType:'phone',portName:'Modem0',shortName:'Mo0'},
  'PT-SWITCH-NM-1CFE': {id:'PT-SWITCH-NM-1CFE',name:'Switch FastEthernet Copper Adapter',description:'Adds one copper FastEthernet connector.',applicableTypes:['switch'],portType:'fastethernet',portName:'FastEthernet0',shortName:'Fa0'},
  'PT-SWITCH-NM-1CGE': {id:'PT-SWITCH-NM-1CGE',name:'Switch Gigabit Copper Adapter',description:'Adds one copper Gigabit Ethernet connector.',applicableTypes:['switch'],portType:'gigabitethernet',portName:'GigabitEthernet0',shortName:'Gi0'},
  'PT-SWITCH-NM-1FFE': {id:'PT-SWITCH-NM-1FFE',name:'Switch FastEthernet Fiber Adapter',description:'Adds one optical FastEthernet connector.',applicableTypes:['switch'],portType:'fastethernet',portName:'FastEthernet0',shortName:'Fa0'},
  'PT-SWITCH-NM-1FGE': {id:'PT-SWITCH-NM-1FGE',name:'Switch Gigabit Fiber Adapter',description:'Adds one optical Gigabit Ethernet connector.',applicableTypes:['switch'],portType:'gigabitethernet',portName:'GigabitEthernet0',shortName:'Gi0'},
}


export function createPort(
  id: string,
  shortName: string,
  type: 'fastethernet' | 'gigabitethernet' | 'serial' | 'wireless' | 'coaxial' | 'phone',
  adminStatus: 'up' | 'down'
): NetworkPort {
  return {
    id,
    name: id,
    shortName,
    type,
    macAddress: generateMacAddress(),
    status: 'down',
    adminStatus,
    vlan: 1,
    portMode: 'access',
  }
}
