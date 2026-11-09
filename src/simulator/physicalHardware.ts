import type { DeviceType, NetworkDevice, NetworkPort, CableType } from '@/types/network'
import { MODULE_CATALOG, createPort } from './deviceFactory'
import { isGenericEndDevice } from './endDevice'

export type HardwareShape =
  | 'rack'
  | 'tower'
  | 'laptop'
  | 'printer'
  | 'phone'
  | 'display'
  | 'tablet'
  | 'handheld'
  | 'access-point'
  | 'hub'
  | 'sniffer'
  | 'cloud'
  | 'modem'
  | 'enddevice'
  | 'board'
  | 'industrial'
  | 'patch-panel'
  | 'wall-mount'

const shapes: Record<DeviceType, HardwareShape> = {
  router: 'rack',
  switch: 'rack',
  wlc: 'rack',
  security: 'rack',
  pc: 'tower',
  server: 'tower',
  laptop: 'laptop',
  printer: 'printer',
  phone: 'phone',
  tv: 'display',
  tablet: 'tablet',
  smartphone: 'handheld',
  wireless: 'access-point',
  hub: 'hub',
  cloud: 'cloud',
  modem: 'modem',
  iot: 'display',
}

const SENSOR_MODELS = new Set([
  'Flex Sensor', 'Generic Environment Sensor', 'Generic Sensor', 'Humidity Sensor',
  'Humiture Sensor', 'Membrane Potentiometer', 'Metal Sensor', 'Motion Sensor',
  'Photo Sensor', 'Potentiometer', 'Push Button Toggle Switch', 'Push Button',
  'Rocker Switch', 'Smoke Sensor', 'Sound Sensor', 'Temperature Sensor',
  'Toggle Push Button', 'Trip Wire', 'Water Detector', 'Water Sensor', 'Wind Sensor',
])

const ACTUATOR_MODELS = new Set([
  'Air Cooler', 'Alarm', 'Ceiling Sprinkler', 'Dimmable LED', 'Floor Sprinkler',
  'Heating Element', 'LCD', 'LED', 'Motor', 'Piezo Speaker', 'RGB LED', 'Servo',
  'Smart LED', 'Speaker',
])

export function getHardwareProfile(device: NetworkDevice) {
  const model = device.model
  const compact = ['819IOX', '819HGW', '819HG-4G-IOX', '829', '1240', 'CGR1240', 'IR1101'].includes(model)
  const empty = ['PT-Empty', 'Router-PT-Empty', 'Switch-PT-Empty', 'Cloud-Empty', 'Cloud-PT-Empty'].includes(model)
  const genericEndDevice = isGenericEndDevice(device)
  const sniffer = device.type === 'hub' && model === 'Sniffer'
  const networkController = device.type === 'pc' && model === 'NetworkController'
  const cyberObserver = device.type === 'security' && model === 'CyberObserver'

  // Component Boards
  const isMcu = model === 'MCU-PT'
  const isSbc = model === 'SBC-PT'
  const isThing = model === 'Thing'
  const isBoard = isMcu || isSbc || isThing

  // Industrial OT
  const isPlc = model === 'PLC-PT'
  const isHmi = model === 'HMI' || model === 'HMI-PT'
  const isDataHistorian = model === 'DataHistorianServer'
  const isIndustrialOt = isPlc || isHmi

  // Structured Cabling
  const isCopperPatchPanel = model === 'Copper Patch Panel'
  const isFiberPatchPanel = model === 'Fiber Patch Panel'
  const isPatchPanel = isCopperPatchPanel || isFiberPatchPanel
  const isCopperWallMount = model === 'Copper Wall Mount'
  const isFiberWallMount = model === 'Fiber Wall Mount'
  const isWallMount = isCopperWallMount || isFiberWallMount
  const isStructuredCabling = isPatchPanel || isWallMount

  // Specialized wireless and end devices
  const isDlc100 = model === 'DLC100'
  const isCentralOffice = model === 'Central-Office-Server'
  const isMerakiMx = model === 'Meraki-MX65W'
  const isMerakiServer = model === 'Meraki-Server'
  const isAnalogPhone = model === 'Analog-Phone-PT'
  const isRfidCard = model === 'RFID Card'
  const isRfidReader = model === 'RFID Reader'
  const isSensorOrActuator = SENSOR_MODELS.has(model) || ACTUATOR_MODELS.has(model)

  // Calculate Slots:
  // MCU-PT has 1 modular bay (Slot 0) for network cards (PT-IOT-NM-1CFE, 1W, 1CG, 1CGE)
  // Thing has 1 modular bay (Slot 0)
  // Central-Office-Server has 2 expansion bays
  // DataHistorianServer has 2 bays
  // Meraki-Server has 1 bay
  let slots = 0
  if (isMcu || isThing) {
    slots = 1
  } else if (isCentralOffice || isDataHistorian) {
    slots = 2
  } else if (isMerakiServer) {
    slots = 1
  } else if (
    genericEndDevice ||
    networkController ||
    cyberObserver ||
    isIndustrialOt ||
    isSbc ||
    isStructuredCabling ||
    isDlc100 ||
    isMerakiMx ||
    isAnalogPhone ||
    isRfidCard ||
    isRfidReader ||
    isSensorOrActuator
  ) {
    slots = 0
  } else if (sniffer) {
    slots = 2
  } else {
    slots = Math.max(
      device.modules?.length ?? 0,
      empty || device.type === 'cloud'
        ? 10
        : device.type === 'router' && !compact
          ? 2
          : device.type === 'switch' && (model.includes('PS') || model === 'PT-Switch' || model === 'Switch-PT')
            ? 2
            : ['laptop', 'pc', 'server'].includes(device.type)
              ? 1
              : 0
    )
  }

  // Calculate Module IDs:
  let moduleIds: string[] = []
  if (isMcu || isThing) {
    moduleIds = ['PT-IOT-NM-1CFE', 'PT-IOT-NM-1W', 'PT-IOT-NM-1CG', 'PT-IOT-NM-1CGE']
  } else if (slots > 0) {
    moduleIds = Object.values(MODULE_CATALOG)
      .filter(m => (m.portType || m.id === 'PT-REPEATER-NM-COVER') && m.id !== 'PT-LAPTOP-NM-3G/4G' && m.applicableTypes.includes(device.type))
      .map(m => m.id)
  }

  // Calculate Shape:
  let shape: HardwareShape = shapes[device.type] ?? 'enddevice'
  if (isBoard) shape = 'board'
  else if (isPlc) shape = 'industrial'
  else if (isHmi) shape = 'display'
  else if (isPatchPanel) shape = 'patch-panel'
  else if (isWallMount) shape = 'wall-mount'
  else if (isCentralOffice || isDataHistorian || isMerakiMx || isMerakiServer || networkController || cyberObserver) shape = 'rack'
  else if (isDlc100) shape = 'access-point'
  else if (isAnalogPhone) shape = 'phone'
  else if (isRfidCard) shape = 'handheld'
  else if (isRfidReader || genericEndDevice || isSensorOrActuator) shape = 'enddevice'
  else if (sniffer) shape = 'sniffer'

  // Calculate Port Face:
  let portFace: 'front' | 'rear' = 'front'
  if (
    isBoard ||
    isPlc ||
    isHmi ||
    isPatchPanel ||
    isWallMount ||
    isMerakiMx ||
    isRfidReader ||
    genericEndDevice ||
    sniffer ||
    networkController ||
    cyberObserver ||
    isSensorOrActuator
  ) {
    portFace = 'front'
  } else if (
    ['router', 'pc', 'server', 'laptop', 'printer', 'phone', 'tv', 'modem'].includes(device.type) ||
    isDlc100 ||
    isCentralOffice ||
    isMerakiServer ||
    isDataHistorian ||
    isAnalogPhone
  ) {
    portFace = 'rear'
  }

  return { shape, slots, moduleIds, portFace }
}

export function getPhysicalPorts(device: NetworkDevice) {
  return device.ports.filter(port => !port.isGreTunnel && port.virtualVlan === undefined && !port.parentPortId && !port.name.includes('.'))
}

export function modulePorts(device: NetworkDevice, slot: number, moduleId: string): NetworkPort[] {
  const definition = MODULE_CATALOG[moduleId]
  if (!definition?.portType) return []
  const count = definition.portCount ?? 1
  const ports: NetworkPort[] = []
  for (let index = 0; index < count; index++) {
    const type = definition.portType
    const prefix =
      type === 'serial'
        ? 'Serial'
        : type === 'gigabitethernet'
          ? 'GigabitEthernet'
          : type === 'fastethernet'
            ? 'FastEthernet'
            : type === 'phone'
              ? 'Modem'
              : type === 'coaxial'
                ? 'Coaxial'
                : 'Wireless'
    const short =
      type === 'serial'
        ? 'Se'
        : type === 'gigabitethernet'
          ? 'Gi'
          : type === 'fastethernet'
            ? 'Fa'
            : type === 'phone'
              ? 'Mo'
              : type === 'coaxial'
                ? 'Coax'
                : 'Wlan'
    let suffix = ['pc', 'server', 'laptop', 'iot'].includes(device.type)
      ? `${index}`
      : type === 'serial'
        ? `0/${slot}/${index}`
        : `${slot + 1}/${index}`
    let name = prefix + suffix
    let collision = 0
    while (device.ports.some(p => p.name === name) || ports.some(p => p.name === name)) {
      suffix = `${slot + 1}/${index + ++collision}`
      name = prefix + suffix
    }
    ports.push({
      ...createPort(name, short + suffix, type, device.type === 'router' ? 'down' : 'up'),
      moduleSlot: slot,
      media: moduleId.includes('FFE') || moduleId.includes('FGE') || (moduleId.startsWith('GLC-') && moduleId !== 'GLC-T') ? 'fiber' : 'copper',
    })
  }
  return ports
}

export function getModulePortIds(device: NetworkDevice, slot: number) {
  const tagged = device.ports.filter(p => p.moduleSlot === slot)
  if (tagged.length) return tagged.map(p => p.id)
  const definition = MODULE_CATALOG[device.modules?.[slot] ?? '']
  if (slot === 0 && ['pc', 'server', 'laptop', 'iot'].includes(device.type)) {
    return device.ports.filter(p => p.virtualVlan === undefined && p.name === definition?.portName).map(p => p.id)
  }
  return definition?.portType === 'serial'
    ? device.ports.filter(p => p.type === 'serial').slice(slot * (definition.portCount ?? 1), (slot + 1) * (definition.portCount ?? 1)).map(p => p.id)
    : []
}

export function canCableConnect(a: NetworkPort, b: NetworkPort, cable: CableType): boolean {
  if (a.virtualVlan !== undefined || b.virtualVlan !== undefined || a.parentPortId || b.parentPortId || a.name.includes('.') || b.name.includes('.')) {
    return false
  }

  const ethernet = (p: NetworkPort) => ['fastethernet', 'gigabitethernet'].includes(p.type)
  const isPin = (p: NetworkPort) => ['digital', 'analog'].includes(p.type)

  // 1. IoT Custom Cable: Only connects pin ports to pin ports
  if (cable === 'iot') {
    return isPin(a) && isPin(b)
  }

  // Pin ports can ONLY connect via IoT Custom Cable
  if (isPin(a) || isPin(b)) {
    return false
  }

  // 2. Structured Cabling Punchdown Blocks:
  const aPunchdown = a.name.toLowerCase().includes('punchdown')
  const bPunchdown = b.name.toLowerCase().includes('punchdown')
  if (aPunchdown || bPunchdown) {
    if (!aPunchdown || !bPunchdown) return false
    return cable === 'straight' && ethernet(a) && ethernet(b) && a.media !== 'fiber' && b.media !== 'fiber'
  }

  // 3. Permissive Serial / Terminal / Peripheral cables
  if (cable === 'console' || cable === 'octal' || cable === 'usb') return true

  // 4. Fiber: Requires optical Ethernet ports on both ends
  if (cable === 'fiber') return ethernet(a) && ethernet(b) && a.media !== 'copper' && b.media !== 'copper'

  // 5. Copper Ethernet: Straight-through and Crossover
  if (cable === 'straight' || cable === 'crossover') return ethernet(a) && ethernet(b) && a.media !== 'fiber' && b.media !== 'fiber'

  // 6. Serial cables (DCE / DTE)
  if (cable === 'serial' || cable === 'serial-dce') return a.type === 'serial' && b.type === 'serial'

  // 7. Telephone (RJ-11 POTS)
  if (cable === 'phone') return a.type === 'phone' && b.type === 'phone'

  // 8. Coaxial (RF / DOCSIS / Antenna)
  if (cable === 'coaxial') return a.type === 'coaxial' && b.type === 'coaxial'

  // 9. Wireless association
  if (cable === 'wireless') return a.type === 'wireless' && b.type === 'wireless'

  // Default fallback: match type and media
  return a.type === b.type && a.media === b.media
}
