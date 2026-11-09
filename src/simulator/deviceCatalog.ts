import type { DeviceType } from '@/types/network'
import { IOT_THINGS, COMPONENT_THINGS } from './iot'

export interface PaletteModelEntry {
  name: string
  type: DeviceType
  source?: 'stock' | 'custom'
}

export interface PaletteSubcategory {
  id: string
  name: string
  identifier: string
  models: PaletteModelEntry[]
}

export interface PaletteCategory {
  id: string
  name: string
  identifier: string
  subcategories: PaletteSubcategory[]
}

/**
 * Authoritative 2-level palette hierarchy matching Cisco Packet Tracer 9.0.1
 * (7 top-level categories, 18 subcategories, 181 models).
 */
export const deviceCatalogHierarchy: PaletteCategory[] = [
  {
    id: 'network',
    name: 'Network Devices',
    identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.group_Network_Devices',
    subcategories: [
      {
        id: 'routers',
        name: 'Routers',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Routers',
        models: [
          { name: '1841', type: 'router', source: 'stock' },
          { name: '1941', type: 'router', source: 'stock' },
          { name: '2620XM', type: 'router', source: 'stock' },
          { name: '2621XM', type: 'router', source: 'stock' },
          { name: '2901', type: 'router', source: 'stock' },
          { name: '2911', type: 'router', source: 'stock' },
          { name: '819HG-4G-IOX', type: 'router', source: 'stock' },
          { name: '819HGW', type: 'router', source: 'stock' },
          { name: '829', type: 'router', source: 'stock' },
          { name: 'CGR1240', type: 'router', source: 'stock' },
          { name: 'IR1101', type: 'router', source: 'stock' },
          { name: 'IR8340', type: 'router', source: 'stock' },
          { name: 'ISR4321', type: 'router', source: 'stock' },
          { name: 'ISR4331', type: 'router', source: 'stock' },
          { name: 'PT8200', type: 'router', source: 'stock' },
          { name: 'Router-PT', type: 'router', source: 'stock' },
          { name: 'Router-PT-Empty', type: 'router', source: 'stock' },
          { name: '2811 IOS15', type: 'router', source: 'custom' },
        ],
      },
      {
        id: 'switches',
        name: 'Switches',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Switches',
        models: [
          { name: '2960 IOS15', type: 'switch', source: 'custom' },
          { name: '2950-24', type: 'switch', source: 'stock' },
          { name: '2950T-24', type: 'switch', source: 'stock' },
          { name: 'Switch-PT', type: 'switch', source: 'stock' },
          { name: 'Switch-PT-Empty', type: 'switch', source: 'stock' },
          { name: '3560-24PS', type: 'switch', source: 'stock' },
          { name: '3650-24PS', type: 'switch', source: 'stock' },
          { name: 'IE-2000', type: 'switch', source: 'stock' },
          { name: 'IE-3400', type: 'switch', source: 'stock' },
          { name: 'IE-9320', type: 'switch', source: 'stock' },
          { name: 'Bridge-PT', type: 'switch', source: 'stock' },
        ],
      },
      {
        id: 'hubs',
        name: 'Hubs',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Hubs',
        models: [
          { name: 'Hub-PT', type: 'hub', source: 'stock' },
          { name: 'Repeater-PT', type: 'hub', source: 'stock' },
          { name: 'CoAxialSplitter-PT', type: 'hub', source: 'stock' },
        ],
      },
      {
        id: 'wireless',
        name: 'Wireless Devices',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Wireless',
        models: [
          { name: 'AccessPoint-PT', type: 'wireless', source: 'stock' },
          { name: 'AccessPoint-PT-A', type: 'wireless', source: 'stock' },
          { name: 'AccessPoint-PT-AC', type: 'wireless', source: 'stock' },
          { name: 'AccessPoint-PT-N', type: 'wireless', source: 'stock' },
          { name: 'Linksys-WRT300N', type: 'wireless', source: 'stock' },
          { name: 'HomeRouter-PT-AC', type: 'wireless', source: 'stock' },
          { name: 'DLC100', type: 'wireless', source: 'stock' },
          { name: 'Cell-Tower', type: 'wireless', source: 'stock' },
          { name: 'Central-Office-Server', type: 'wireless', source: 'stock' },
          { name: 'WLC-2504', type: 'wlc', source: 'stock' },
          { name: 'WLC-3504', type: 'wlc', source: 'stock' },
          { name: 'WLC-PT', type: 'wlc', source: 'stock' },
          { name: '3702i', type: 'wireless', source: 'stock' },
          { name: 'LAP-PT', type: 'wireless', source: 'stock' },
          { name: 'Meraki-MX65W', type: 'wireless', source: 'stock' },
        ],
      },
      {
        id: 'security',
        name: 'Security',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Security',
        models: [
          { name: '5505', type: 'security', source: 'stock' },
          { name: '5506-X', type: 'security', source: 'stock' },
          { name: 'ISA-3000', type: 'security', source: 'stock' },
          { name: 'CyberObserver', type: 'security', source: 'stock' },
        ],
      },
      {
        id: 'wan',
        name: 'WAN Emulation',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_WAN',
        models: [
          { name: 'Cloud-PT', type: 'cloud', source: 'stock' },
          { name: 'Cloud-PT-Empty', type: 'cloud', source: 'stock' },
          { name: 'DSL-Modem-PT', type: 'modem', source: 'stock' },
          { name: 'Cable-Modem-PT', type: 'modem', source: 'stock' },
        ],
      },
    ],
  },
  {
    id: 'end',
    name: 'End Devices',
    identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.group_End_Devices',
    subcategories: [
      {
        id: 'endDevices',
        name: 'End Devices',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_End_Devices',
        models: [
          { name: 'PC-PT', type: 'pc', source: 'stock' },
          { name: 'Laptop-PT', type: 'laptop', source: 'stock' },
          { name: 'Server-PT', type: 'server', source: 'stock' },
          { name: 'Meraki-Server', type: 'server', source: 'stock' },
          { name: 'NetworkController', type: 'pc', source: 'stock' },
          { name: 'Printer-PT', type: 'printer', source: 'stock' },
          { name: '7960', type: 'phone', source: 'stock' },
          { name: 'Home-VoIP-PT', type: 'phone', source: 'stock' },
          { name: 'Analog-Phone-PT', type: 'phone', source: 'stock' },
          { name: 'TV-PT', type: 'tv', source: 'stock' },
          { name: 'TabletPC-PT', type: 'tablet', source: 'stock' },
          { name: 'SMARTPHONE-PT', type: 'smartphone', source: 'stock' },
          { name: 'WirelessEndDevice-PT', type: 'pc', source: 'stock' },
          { name: 'WiredEndDevice-PT', type: 'pc', source: 'stock' },
          { name: 'Sniffer', type: 'hub', source: 'stock' },
        ],
      },
      {
        id: 'smartHome',
        name: 'Smart Home',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Home',
        models: [
          { name: 'AC', type: 'iot', source: 'stock' },
          { name: 'Appliance', type: 'iot', source: 'stock' },
          { name: 'Bluetooth Speaker', type: 'iot', source: 'stock' },
          { name: 'Ceiling Fan', type: 'iot', source: 'stock' },
          { name: 'Door', type: 'iot', source: 'stock' },
          { name: 'Furnace', type: 'iot', source: 'stock' },
          { name: 'Garage Door', type: 'iot', source: 'stock' },
          { name: 'Home Speaker', type: 'iot', source: 'stock' },
          { name: 'Humidifier', type: 'iot', source: 'stock' },
          { name: 'Humiture Monitor', type: 'iot', source: 'stock' },
          { name: 'Lawn Sprinkler', type: 'iot', source: 'stock' },
          { name: 'Light', type: 'iot', source: 'stock' },
          { name: 'Motion Detector', type: 'iot', source: 'stock' },
          { name: 'Portable Music Player', type: 'iot', source: 'stock' },
          { name: 'Siren', type: 'iot', source: 'stock' },
          { name: 'Smoke Detector', type: 'iot', source: 'stock' },
          { name: 'Sound Frequency Detector', type: 'iot', source: 'stock' },
          { name: 'Thermostat', type: 'iot', source: 'stock' },
          { name: 'Water Level Monitor', type: 'iot', source: 'stock' },
          { name: 'Webcam', type: 'iot', source: 'stock' },
          { name: 'Window', type: 'iot', source: 'stock' },
        ],
      },
      {
        id: 'smartCity',
        name: 'Smart City',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Smart_City',
        models: [
          { name: 'Atm Pressure Monitor', type: 'iot', source: 'stock' },
          { name: 'Beacon', type: 'iot', source: 'stock' },
          { name: 'Carbon Dioxide Detector', type: 'iot', source: 'stock' },
          { name: 'Carbon Monoxide Detector', type: 'iot', source: 'stock' },
          { name: 'Fire Monitor', type: 'iot', source: 'stock' },
          { name: 'Fire Sprinkler', type: 'iot', source: 'stock' },
          { name: 'Humidity Monitor', type: 'iot', source: 'stock' },
          { name: 'Old Car', type: 'iot', source: 'stock' },
          { name: 'RFID Card', type: 'iot', source: 'stock' },
          { name: 'RFID Reader', type: 'iot', source: 'stock' },
          { name: 'Smart LED', type: 'iot', source: 'stock' },
          { name: 'Street Lamp', type: 'iot', source: 'stock' },
          { name: 'Temperature Monitor', type: 'iot', source: 'stock' },
          { name: 'Trip Sensor', type: 'iot', source: 'stock' },
          { name: 'Water Drain', type: 'iot', source: 'stock' },
          { name: 'Wind Detector', type: 'iot', source: 'stock' },
        ],
      },
      {
        id: 'industrialOt',
        name: 'Industrial - OT',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Industrial',
        models: [
          { name: 'PLC-PT', type: 'pc', source: 'stock' },
          { name: 'DataHistorianServer', type: 'server', source: 'stock' },
          { name: 'Blower', type: 'iot', source: 'stock' },
          { name: 'HMI', type: 'pc', source: 'stock' },
          { name: 'Signal Generator', type: 'iot', source: 'stock' },
          { name: 'Smart LED', type: 'iot', source: 'stock' },
        ],
      },
      {
        id: 'powerGrid',
        name: 'Power Grid',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Power_Grid',
        models: [
          { name: 'Battery', type: 'iot', source: 'stock' },
          { name: 'Power Meter', type: 'iot', source: 'stock' },
          { name: 'Solar Panel', type: 'iot', source: 'stock' },
          { name: 'Wind Turbine', type: 'iot', source: 'stock' },
        ],
      },
    ],
  },
  {
    id: 'components',
    name: 'Components',
    identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.group_Components',
    subcategories: [
      {
        id: 'boards',
        name: 'Boards',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Boards',
        models: [
          { name: 'MCU-PT', type: 'iot', source: 'stock' },
          { name: 'SBC-PT', type: 'iot', source: 'stock' },
          { name: 'Thing', type: 'iot', source: 'stock' },
        ],
      },
      {
        id: 'actuators',
        name: 'Actuators',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Actuators',
        models: [
          { name: 'Air Cooler', type: 'iot', source: 'stock' },
          { name: 'Alarm', type: 'iot', source: 'stock' },
          { name: 'Ceiling Sprinkler', type: 'iot', source: 'stock' },
          { name: 'Dimmable LED', type: 'iot', source: 'stock' },
          { name: 'Floor Sprinkler', type: 'iot', source: 'stock' },
          { name: 'Heating Element', type: 'iot', source: 'stock' },
          { name: 'LCD', type: 'iot', source: 'stock' },
          { name: 'LED', type: 'iot', source: 'stock' },
          { name: 'Motor', type: 'iot', source: 'stock' },
          { name: 'Piezo Speaker', type: 'iot', source: 'stock' },
          { name: 'RGB LED', type: 'iot', source: 'stock' },
          { name: 'Servo', type: 'iot', source: 'stock' },
          { name: 'Smart LED', type: 'iot', source: 'stock' },
          { name: 'Speaker', type: 'iot', source: 'stock' },
        ],
      },
      {
        id: 'sensors',
        name: 'Sensors',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Sensors',
        models: [
          { name: 'Flex Sensor', type: 'iot', source: 'stock' },
          { name: 'Generic Environment Sensor', type: 'iot', source: 'stock' },
          { name: 'Generic Sensor', type: 'iot', source: 'stock' },
          { name: 'Humidity Sensor', type: 'iot', source: 'stock' },
          { name: 'Humiture Sensor', type: 'iot', source: 'stock' },
          { name: 'Membrane Potentiometer', type: 'iot', source: 'stock' },
          { name: 'Metal Sensor', type: 'iot', source: 'stock' },
          { name: 'Motion Sensor', type: 'iot', source: 'stock' },
          { name: 'Photo Sensor', type: 'iot', source: 'stock' },
          { name: 'Potentiometer', type: 'iot', source: 'stock' },
          { name: 'Push Button Toggle Switch', type: 'iot', source: 'stock' },
          { name: 'Push Button', type: 'iot', source: 'stock' },
          { name: 'Rocker Switch', type: 'iot', source: 'stock' },
          { name: 'Smoke Sensor', type: 'iot', source: 'stock' },
          { name: 'Sound Sensor', type: 'iot', source: 'stock' },
          { name: 'Temperature Sensor', type: 'iot', source: 'stock' },
          { name: 'Toggle Push Button', type: 'iot', source: 'stock' },
          { name: 'Trip Wire', type: 'iot', source: 'stock' },
          { name: 'Water Detector', type: 'iot', source: 'stock' },
          { name: 'Water Sensor', type: 'iot', source: 'stock' },
          { name: 'Wind Sensor', type: 'iot', source: 'stock' },
        ],
      },
    ],
  },
  {
    id: 'connections',
    name: 'Connections',
    identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.group_Connections',
    subcategories: [
      {
        id: 'connections',
        name: 'Connections',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Connections',
        models: [
          { name: 'Automatically Choose Connection Type', type: 'cloud', source: 'stock' },
          { name: 'Console', type: 'cloud', source: 'stock' },
          { name: 'Copper Straight-Through', type: 'cloud', source: 'stock' },
          { name: 'Copper Cross-Over', type: 'cloud', source: 'stock' },
          { name: 'Single Mode Fiber', type: 'cloud', source: 'stock' },
          { name: 'Multi Mode Fiber', type: 'cloud', source: 'stock' },
          { name: 'Phone', type: 'cloud', source: 'stock' },
          { name: 'Coaxial', type: 'cloud', source: 'stock' },
          { name: 'Serial DCE', type: 'cloud', source: 'stock' },
          { name: 'Serial DTE', type: 'cloud', source: 'stock' },
          { name: 'Octal', type: 'cloud', source: 'stock' },
          { name: 'IoT Custom Cable', type: 'cloud', source: 'stock' },
          { name: 'USB', type: 'cloud', source: 'stock' },
        ],
      },
      {
        id: 'structuredCabling',
        name: 'Structured Cabling',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Structured_Cabling',
        models: [
          { name: 'Copper Patch Panel', type: 'hub', source: 'stock' },
          { name: 'Fiber Patch Panel', type: 'hub', source: 'stock' },
          { name: 'Copper Wall Mount', type: 'hub', source: 'stock' },
          { name: 'Fiber Wall Mount', type: 'hub', source: 'stock' },
        ],
      },
    ],
  },
  {
    id: 'misc',
    name: 'Miscellaneous',
    identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.group_Miscellaneous',
    subcategories: [
      {
        id: 'misc',
        name: 'Miscellaneous',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Miscellaneous',
        models: [
          { name: '1841 WIC-2T', type: 'router', source: 'custom' },
          { name: '2621XM NM-2FE2W (2) WIC-2T', type: 'router', source: 'custom' },
          { name: '2811 with IOS 12', type: 'router', source: 'custom' },
          { name: '2811 NM-ESW-161 (2) WIC-2T', type: 'router', source: 'custom' },
          { name: '2960 with IOS 12', type: 'switch', source: 'custom' },
          { name: 'PT8000 Activated', type: 'router', source: 'custom' },
          { name: 'Wireless Laptop', type: 'laptop', source: 'custom' },
          { name: 'Wireless PC', type: 'pc', source: 'custom' },
        ],
      },
    ],
  },
  {
    id: 'multiuser',
    name: 'Multiuser Connection',
    identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.group_Multiuser',
    subcategories: [
      {
        id: 'multiuser',
        name: 'Multiuser Connection',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Multiuser',
        models: [
          { name: 'Multiuser Connection', type: 'cloud', source: 'stock' },
        ],
      },
    ],
  },
  {
    id: 'legacy',
    name: 'Legacy',
    identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.group_Legacy',
    subcategories: [
      {
        id: 'legacy',
        name: 'Legacy',
        identifier: 'PtApp.CAppWindowBase.centralwidget.m_pNetWorkCompBoxFrame.m_bottomSplitter.m_pNetWorkCompBox.CDeviceTypesBox.type_Legacy',
        models: [],
      },
    ],
  },
]

export type DeviceCategory =
  | 'routers'
  | 'switches'
  | 'hubs'
  | 'wireless'
  | 'security'
  | 'wan'
  | 'end'
  | 'iot'
  | 'connections'
  | 'components'
  | 'custom'
  | 'misc'
  | 'multiuser'

/**
 * Backward-compatible deviceCatalog record indexing groups and models.
 * Maintains full compatibility with existing unit tests and UI state.
 */
export const deviceCatalog: Partial<Record<DeviceCategory, { type: DeviceType; models: string[] }[]>> = {
  routers: [{ type: 'router', models: ['1841', '1941', '2620XM', '2621XM', '2901', '2911', '819HG-4G-IOX', '819HGW', '829', 'CGR1240', 'IR1101', 'IR8340', 'ISR4321', 'ISR4331', 'PT8200', 'Router-PT', 'Router-PT-Empty', '2811 IOS15'] }],
  switches: [{ type: 'switch', models: ['2960 IOS15', '2950-24', '2950T-24', '3560-24PS', '3650-24PS', 'Switch-PT', 'Switch-PT-Empty', 'IE-2000', 'IE-3400', 'IE-9320', 'Bridge-PT'] }],
  hubs: [{ type: 'hub', models: ['Hub-PT', 'Repeater-PT', 'CoAxialSplitter-PT'] }],
  wireless: [
    { type: 'wireless', models: ['AccessPoint-PT', 'AccessPoint-PT-A', 'AccessPoint-PT-AC', 'AccessPoint-PT-N', '3702i', 'LAP-PT', 'Linksys-WRT300N', 'HomeRouter-PT-AC', 'Cell-Tower', 'DLC100', 'Central-Office-Server', 'Meraki-MX65W'] },
    { type: 'wlc', models: ['WLC-PT', 'WLC-2504', 'WLC-3504'] },
  ],
  security: [{ type: 'security', models: ['5505', '5506-X', 'ISA-3000', 'CyberObserver'] }],
  wan: [
    { type: 'cloud', models: ['Cloud-PT', 'Cloud-PT-Empty'] },
    { type: 'modem', models: ['DSL-Modem-PT', 'Cable-Modem-PT'] },
  ],
  end: [
    { type: 'pc', models: ['PC-PT'] },
    { type: 'laptop', models: ['Laptop-PT'] },
    { type: 'server', models: ['Server-PT', 'Meraki-Server', 'DataHistorianServer'] },
    { type: 'pc', models: ['NetworkController', 'PLC-PT', 'HMI'] },
    { type: 'printer', models: ['Printer-PT'] },
    { type: 'phone', models: ['7960', 'Home-VoIP-PT', 'Analog-Phone-PT'] },
    { type: 'tv', models: ['TV-PT'] },
    { type: 'tablet', models: ['TabletPC-PT'] },
    { type: 'smartphone', models: ['SMARTPHONE-PT'] },
    { type: 'pc', models: ['WirelessEndDevice-PT', 'WiredEndDevice-PT'] },
    { type: 'hub', models: ['Sniffer'] },
    { type: 'iot', models: ['RFID Card', 'RFID Reader'] },
  ],
  misc: [
    { type: 'pc', models: ['Wireless PC'] },
    { type: 'laptop', models: ['Wireless Laptop'] },
    { type: 'router', models: ['1841 WIC-2T', '2621XM NM-2FE2W (2) WIC-2T', '2811 with IOS 12', '2811 NM-ESW-161 (2) WIC-2T', 'PT8000 Activated'] },
    { type: 'switch', models: ['2960 with IOS 12'] },
  ],
  iot: [{ type: 'iot', models: IOT_THINGS.map(spec => spec.model) }],
  components: [{ type: 'iot', models: COMPONENT_THINGS.filter(s => !['RFID Card', 'RFID Reader', 'Smart LED'].includes(s.model)).map(spec => spec.model) }],
  connections: [{ type: 'hub', models: ['Copper Patch Panel', 'Fiber Patch Panel', 'Copper Wall Mount', 'Fiber Wall Mount'] }],
  multiuser: [{ type: 'cloud', models: ['Multiuser Connection'] }],
}

export const cableCatalog = {
  models: [
    'Automatically Choose Connection Type',
    'Console',
    'Copper Straight-Through',
    'Copper Cross-Over',
    'Single Mode Fiber',
    'Multi Mode Fiber',
    'Phone',
    'Coaxial',
    'Serial DCE',
    'Serial DTE',
    'Octal',
    'IoT Custom Cable',
    'USB',
  ],
}
