import type {DeviceType,NetworkDevice,NetworkPort,CableType} from '@/types/network'
import {MODULE_CATALOG,createPort} from './deviceFactory'
import {isGenericEndDevice} from './endDevice'

export type HardwareShape='rack'|'tower'|'laptop'|'printer'|'phone'|'display'|'tablet'|'handheld'|'access-point'|'hub'|'sniffer'|'cloud'|'modem'|'enddevice'
const shapes:Record<DeviceType,HardwareShape>={router:'rack',switch:'rack',wlc:'rack',security:'rack',pc:'tower',server:'tower',laptop:'laptop',printer:'printer',phone:'phone',tv:'display',tablet:'tablet',smartphone:'handheld',wireless:'access-point',hub:'hub',cloud:'cloud',modem:'modem',iot:'display'}

export function getHardwareProfile(device:NetworkDevice){
  const compact=['819IOX','819HGW','819HG-4G-IOX','829','1240','CGR1240','IR1101'].includes(device.model)
  const empty=['PT-Empty','Router-PT-Empty','Switch-PT-Empty','Cloud-Empty','Cloud-PT-Empty'].includes(device.model)
  const genericEndDevice=isGenericEndDevice(device)
  const sniffer=device.type==='hub'&&device.model==='Sniffer'
  const networkController=device.type==='pc'&&device.model==='NetworkController'
  const slots=genericEndDevice||networkController?0:sniffer?2:Math.max(device.modules?.length??0,empty||device.type==='cloud'?10:device.type==='router'&&!compact?2:device.type==='switch'&&(device.model.includes('PS')||device.model==='PT-Switch'||device.model==='Switch-PT')?2:['laptop','pc','server'].includes(device.type)?1:0)
  const moduleIds=genericEndDevice||networkController?[]:Object.values(MODULE_CATALOG).filter(m=>(m.portType||m.id==='PT-REPEATER-NM-COVER')&&m.id!=='PT-LAPTOP-NM-3G/4G'&&m.applicableTypes.includes(device.type)&&slots>0).map(m=>m.id)
  return {shape:genericEndDevice?'enddevice' as const:sniffer?'sniffer' as const:networkController?'rack' as const:shapes[device.type],slots,moduleIds,portFace:genericEndDevice||sniffer||networkController?'front' as const:['router','pc','server','laptop','printer','phone','tv','modem'].includes(device.type)?'rear' as const:'front' as const}
}

export function getPhysicalPorts(device:NetworkDevice){return device.ports.filter(port=>!port.isGreTunnel&&port.virtualVlan===undefined&&!port.parentPortId&&!port.name.includes('.'))}

export function modulePorts(device:NetworkDevice,slot:number,moduleId:string):NetworkPort[]{
  const definition=MODULE_CATALOG[moduleId]
  if(!definition?.portType)return []
  const count=definition.portCount??1
  const ports:NetworkPort[]=[]
  for(let index=0;index<count;index++){
    const type=definition.portType
    const prefix=type==='serial'?'Serial':type==='gigabitethernet'?'GigabitEthernet':type==='fastethernet'?'FastEthernet':type==='phone'?'Modem':type==='coaxial'?'Coaxial':'Wireless'
    const short=type==='serial'?'Se':type==='gigabitethernet'?'Gi':type==='fastethernet'?'Fa':type==='phone'?'Mo':type==='coaxial'?'Coax':'Wlan'
    let suffix=['pc','server','laptop'].includes(device.type)?`${index}`:type==='serial'?`0/${slot}/${index}`:`${slot+1}/${index}`
    let name=prefix+suffix
    let collision=0
    while(device.ports.some(p=>p.name===name)||ports.some(p=>p.name===name)){suffix=`${slot+1}/${index+ ++collision}`;name=prefix+suffix}
    ports.push({...createPort(name,short+suffix,type,device.type==='router'?'down':'up'),moduleSlot:slot,media:moduleId.includes('FFE')||moduleId.includes('FGE')||moduleId.startsWith('GLC-')&&moduleId!=='GLC-T'?'fiber':'copper'})
  }
  return ports
}

export function getModulePortIds(device:NetworkDevice,slot:number){
  const tagged=device.ports.filter(p=>p.moduleSlot===slot)
  if(tagged.length)return tagged.map(p=>p.id)
  // Imported legacy files have no ownership metadata; never infer a fixed uplink as a module.
  const definition=MODULE_CATALOG[device.modules?.[slot]??'']
  if(slot===0&&['pc','server','laptop'].includes(device.type))return device.ports.filter(p=>p.virtualVlan===undefined&&p.name===definition?.portName).map(p=>p.id)
  return definition?.portType==='serial'?device.ports.filter(p=>p.type==='serial').slice(slot*(definition.portCount??1),(slot+1)*(definition.portCount??1)).map(p=>p.id):[]
}

export function canCableConnect(a:NetworkPort,b:NetworkPort,cable:CableType){
  if(a.virtualVlan!==undefined||b.virtualVlan!==undefined||a.parentPortId||b.parentPortId||a.name.includes('.')||b.name.includes('.'))return false
  const ethernet=(p:NetworkPort)=>['fastethernet','gigabitethernet'].includes(p.type)
  if(cable==='console'||cable==='octal'||cable==='usb')return true
  if(cable==='fiber')return ethernet(a)&&ethernet(b)&&a.media!=='copper'&&b.media!=='copper'
  if(cable==='straight'||cable==='crossover')return ethernet(a)&&ethernet(b)&&a.media!=='fiber'&&b.media!=='fiber'
  if(cable==='serial'||cable==='serial-dce')return a.type==='serial'&&b.type==='serial'
  if(cable==='phone')return a.type==='phone'&&b.type==='phone'
  if(cable==='coaxial')return a.type==='coaxial'&&b.type==='coaxial'
  if(cable==='wireless')return a.type==='wireless'&&b.type==='wireless'
  return a.type===b.type&&a.media===b.media
}
