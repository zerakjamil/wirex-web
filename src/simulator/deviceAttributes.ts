import type { DeviceType, NetworkDevice } from '@/types/network'

export interface DeviceAttributes {
  mtbf: number
  cost: number
  powerSource: number
  rackUnits: number
  wattage: number
  ptModel: string
  ptVersion: string
}

type AttributeValues = Omit<DeviceAttributes, 'ptModel' | 'ptVersion'>

// Values harvested from the EXT_ATTRIBUTES blocks of the Packet Tracer 9.0.1
// sample labs that ship with the application. Packet Tracer writes these
// values into every saved device, which makes them the authoritative source
// for the Attributes tab.
const MODEL_ATTRIBUTES: Record<string, AttributeValues> = {
  "1841": { mtbf: 300000, cost: 500, powerSource: 0, rackUnits: 2, wattage: 20 },
  "1941": { mtbf: 300000, cost: 650, powerSource: 0, rackUnits: 2, wattage: 35 },
  "2811": { mtbf: 400000, cost: 1000, powerSource: 0, rackUnits: 1, wattage: 40 },
  "2901": { mtbf: 300000, cost: 730, powerSource: 0, rackUnits: 2, wattage: 40 },
  "2911": { mtbf: 400000, cost: 2200, powerSource: 0, rackUnits: 2, wattage: 210 },
  "2950-24": { mtbf: 300000, cost: 5000, powerSource: 0, rackUnits: 1, wattage: 30 },
  "2960-24TT": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "3560-24PS": { mtbf: 300000, cost: 49750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "7960": { mtbf: 43800, cost: 0, powerSource: 0, rackUnits: 1, wattage: 10 },
  "819HG-4G-IOX": { mtbf: 300000, cost: 3700, powerSource: 0, rackUnits: 1, wattage: 22 },
  "819HGW": { mtbf: 300000, cost: 3200, powerSource: 0, rackUnits: 1, wattage: 20 },
  "829": { mtbf: 300000, cost: 2750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "AccessPoint-PT": { mtbf: 300000, cost: 20, powerSource: 0, rackUnits: 2, wattage: 20 },
  "AccessPoint-PT-A": { mtbf: 300000, cost: 20, powerSource: 0, rackUnits: 2, wattage: 20 },
  "AccessPoint-PT-N": { mtbf: 300000, cost: 20, powerSource: 0, rackUnits: 2, wattage: 20 },
  "Air Conditioner": { mtbf: 300000, cost: 2250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Analog-Phone-PT": { mtbf: 300000, cost: -250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Appliance(0)": { mtbf: 26280, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Battery": { mtbf: 43800, cost: 22500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Beacon": { mtbf: 300000, cost: 2250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Bluetooth Speaker": { mtbf: 300000, cost: 2750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "CGR1240": { mtbf: 300000, cost: 1349.99, powerSource: 1, rackUnits: 2, wattage: 5 },
  "CO Detector": { mtbf: 300000, cost: 8750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Cell-Tower": { mtbf: 300000, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Central-Office-Server": { mtbf: 300000, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "CyberObserver": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "DLC100": { mtbf: 300000, cost: 71500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "DataHistorianServer": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Door": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Fire Monitor": { mtbf: 300000, cost: 2750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Fire Sprinkler": { mtbf: 43800, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Furnace": { mtbf: 300000, cost: 2250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Garage Door": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "HMI-PT": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Home Speaker": { mtbf: 300000, cost: 2750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Home-VoIP-PT": { mtbf: 43800, cost: 0, powerSource: 0, rackUnits: 1, wattage: 10 },
  "HomeRouter-PT-AC": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Hub-PT": { mtbf: 300000, cost: 20, powerSource: 0, rackUnits: 2, wattage: 20 },
  "Humidifier": { mtbf: 26280, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Humidity Monitor": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "IE-2000": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "IE-3400": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "IE-9320": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "IE-9320-26S2C": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "IR1101": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "IR8340": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "ISA-3000": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "ISR4321": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "ISR4331": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "LAP-PT": { mtbf: 300000, cost: 35850, powerSource: 1, rackUnits: 2, wattage: 5 },
  "LCD": { mtbf: 43800, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "LED": { mtbf: 43800, cost: 2000, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Laptop-PT": { mtbf: 26280, cost: 1000, powerSource: 0, rackUnits: 2, wattage: 60 },
  "Light": { mtbf: 43800, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Linksys-WRT300N": { mtbf: 2, cost: 1250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "MCU-PT": { mtbf: 300, cost: 4000, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Membrane Potentiometer": { mtbf: 26280, cost: 3000, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Meraki-MX65W": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Meraki-Server": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Metal Sensor": { mtbf: 300000, cost: 2750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Motor": { mtbf: 17520, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "NetworkController": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Old Car": { mtbf: 8760, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "PC-PT": { mtbf: 43800, cost: 1000, powerSource: 0, rackUnits: 3, wattage: 150 },
  "PLC-PT": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "PT8200": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Piezo Speaker": { mtbf: 300000, cost: 2750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Potentiometer": { mtbf: 26280, cost: 6000, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Power Distribution Device": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Power Meter": { mtbf: 26280, cost: 11500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Push Button": { mtbf: 17520, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Push Button Toggle Switch": { mtbf: 17520, cost: 10500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "RGB LED": { mtbf: 300000, cost: 16750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Rocker Switch": { mtbf: 300000, cost: 2750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Router-PT": { mtbf: 300000, cost: 150, powerSource: 0, rackUnits: 2, wattage: 35 },
  "SBC-PT": { mtbf: 200, cost: 13000, powerSource: 0, rackUnits: 1, wattage: 10 },
  "SMARTPHONE-PT": { mtbf: 25280, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Server-PT": { mtbf: 61320, cost: 1000, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Signal Generator": { mtbf: 26280, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Smart LED": { mtbf: 300000, cost: 5750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Sniffer": { mtbf: 300000, cost: 19000, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Solar Panel": { mtbf: 43800, cost: 8000, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Sound Sensor": { mtbf: 300000, cost: 6750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "TabletPC-PT": { mtbf: 26280, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Temperature Monitor": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Temperature Sensor": { mtbf: 26280, cost: 1000, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Thermostat": { mtbf: 43800, cost: 4500, powerSource: 0, rackUnits: 1, wattage: 10 },
  "Thing": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "WLC-2504": { mtbf: 300000, cost: 1750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "WLC-3504": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  "WLC-PT": { mtbf: 300000, cost: 750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Wind Turbine": { mtbf: 300000, cost: 750, powerSource: 1, rackUnits: 2, wattage: 5 },
  "Window": { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
}

// The 4331 attributes shown by Packet Tracer 9.0.1 on a freshly created
// device differ from the older sample-lab defaults, so keep the live values.
const MODEL_OVERRIDES: Record<string, Partial<DeviceAttributes>> = {
  ISR4331: { mtbf: 587250, cost: 3000, powerSource: 0, rackUnits: 1, wattage: 530, ptVersion: '16.6.4' },
  '4331': { mtbf: 587250, cost: 3000, powerSource: 0, rackUnits: 1, wattage: 530, ptVersion: '16.6.4' },
}

const MODEL_ALIASES: Record<string, string> = {
  '2811 IOS15': '2811',
  '2960 IOS15': '2960-24TT',
  '2960': '2960-24TT',
  '2950T-24': '2950-24',
  '3650-24PS': '3560-24PS',
  '4331': 'ISR4331',
  '4321': 'ISR4321',
  'Router-PT-Empty': 'Router-PT',
  'Switch-PT': '2960-24TT',
  'Switch-PT-Empty': '2960-24TT',
  'Cloud-PT-Empty': 'Cloud-PT',
  'Lamp-PT': 'Light',
  'Sprinkler-PT': 'Fire Sprinkler',
  'Door-PT': 'Door',
  'Window-PT': 'Window',
  'Thermostat-PT': 'Thermostat',
  'Push-Button-PT': 'Push Button',
  'AC': 'Air Conditioner',
  'Appliance': 'Appliance(0)',
  'Bluetooth Speaker': 'Bluetooth Speaker',
  'Furnace': 'Furnace',
  'Garage Door': 'Garage Door',
  'Home Speaker': 'Home Speaker',
  'Humidifier': 'Humidifier',
  'Light': 'Light',
  'Sound Frequency Detector': 'Sound Sensor',
  'Fire Monitor': 'Fire Monitor',
  'Fire Sprinkler': 'Fire Sprinkler',
  'Humidity Monitor': 'Humidity Monitor',
  'Smart LED': 'Smart LED',
  'Temperature Monitor': 'Temperature Monitor',
  'Signal Generator': 'Signal Generator',
  'Battery': 'Battery',
  'Power Meter': 'Power Meter',
  'Solar Panel': 'Solar Panel',
  'Wind Turbine': 'Wind Turbine',
  'Beacon': 'Beacon',
  'Old Car': 'Old Car',
}

const PT_MODEL_ALIASES: Record<string, string> = {
  '2811 IOS15': '2811',
  '2960 IOS15': '2960-24TT',
  '2960': '2960-24TT',
  '4331': 'ISR4331',
  '4321': 'ISR4321',
  'Router-PT-Empty': 'Router-PT',
  'Switch-PT-Empty': 'Switch-PT',
  'Cloud-PT-Empty': 'Cloud-PT',
}

const TYPE_DEFAULTS: Record<DeviceType, AttributeValues> = {
  router: { mtbf: 300000, cost: 1000, powerSource: 0, rackUnits: 2, wattage: 35 },
  switch: { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  hub: { mtbf: 300000, cost: 20, powerSource: 0, rackUnits: 2, wattage: 20 },
  wireless: { mtbf: 300000, cost: 20, powerSource: 0, rackUnits: 2, wattage: 20 },
  wlc: { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  security: { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  cloud: { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  modem: { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
  pc: { mtbf: 43800, cost: 1000, powerSource: 0, rackUnits: 3, wattage: 150 },
  laptop: { mtbf: 26280, cost: 1000, powerSource: 0, rackUnits: 2, wattage: 60 },
  server: { mtbf: 61320, cost: 1000, powerSource: 0, rackUnits: 1, wattage: 10 },
  printer: { mtbf: 43800, cost: 1000, powerSource: 0, rackUnits: 2, wattage: 10 },
  phone: { mtbf: 43800, cost: 0, powerSource: 0, rackUnits: 1, wattage: 10 },
  tv: { mtbf: 43800, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  tablet: { mtbf: 26280, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  smartphone: { mtbf: 25280, cost: 500, powerSource: 0, rackUnits: 1, wattage: 10 },
  iot: { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 },
}

const PT_VERSIONS: Record<string, string> = {
  ISR4331: '16.6.4',
  ISR4321: '16.6.4',
  '2911': '15.1(4)M4',
  '2901': '15.1(4)M4',
  '1941': '15.1(4)M4',
  '1841': '12.4(15)T',
  '2811': '12.4(15)T',
  '2960 IOS15': '15.0(2)SE',
  '2960': '15.0(2)SE',
  '2950-24': '12.1(22)EA4',
  '2950T-24': '12.1(22)EA4',
  '3560-24PS': '12.2(37)SE',
  '3650-24PS': '16.3.3',
  'WLC-3504': '8.5.140.0',
  'WLC-2504': '7.6.130.0',
  'WLC-PT': '7.0.220.0',
  '5505': '9.1(7)',
  '5506-X': '9.12(4)',
}

const TYPE_VERSIONS: Partial<Record<DeviceType, string>> = {
  router: '15.1(4)M4',
  switch: '15.0(2)SE',
  wlc: '8.5.140.0',
  security: '9.12(4)',
  wireless: '1.0',
}

const FALLBACK: AttributeValues = { mtbf: 300000, cost: 250, powerSource: 1, rackUnits: 2, wattage: 5 }

export function ptModelFor(device: Pick<NetworkDevice, 'model'>): string {
  return PT_MODEL_ALIASES[device.model] ?? device.model
}

export function deviceAttributes(device: Pick<NetworkDevice, 'model' | 'type'>): DeviceAttributes {
  const alias = MODEL_ALIASES[device.model] ?? device.model
  const base = MODEL_ATTRIBUTES[alias] ?? TYPE_DEFAULTS[device.type] ?? FALLBACK
  const version = MODEL_OVERRIDES[device.model]?.ptVersion ?? PT_VERSIONS[device.model] ?? PT_VERSIONS[alias] ?? TYPE_VERSIONS[device.type] ?? '1.0'
  return {
    ...base,
    ptModel: ptModelFor(device),
    ptVersion: version,
    ...MODEL_OVERRIDES[device.model],
  }
}
