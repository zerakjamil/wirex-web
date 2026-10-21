import type {DeviceType} from '@/types/network'
import { IOT_THINGS } from './iot'

export type DeviceCategory='routers'|'switches'|'hubs'|'wireless'|'security'|'wan'|'end'|'iot'|'connections'|'components'|'custom'|'misc'|'multiuser'
export const deviceCatalog:Partial<Record<DeviceCategory,{type:DeviceType;models:string[]}[]>>={
  routers:[{type:'router',models:['1841','1941','2620XM','2621XM','2901','2911','819HG-4G-IOX','819HGW','829','CGR1240','IR1101','IR8340','ISR4321','ISR4331','PT8200','Router-PT','Router-PT-Empty','2811 IOS15']}],
  switches:[{type:'switch',models:['2960 IOS15','2950-24','2950T-24','3560-24PS','3650-24PS','Switch-PT','Switch-PT-Empty','IE-2000','IE-3400','IE-9320','Bridge-PT']}],
  hubs:[{type:'hub',models:['Hub-PT','Repeater-PT','CoAxialSplitter-PT']}],
  wireless:[{type:'wireless',models:['AccessPoint-PT','AccessPoint-PT-A','AccessPoint-PT-AC','AccessPoint-PT-N','3702i','LAP-PT','Linksys-WRT300N','HomeRouter-PT-AC','Cell-Tower']},{type:'wlc',models:['WLC-PT','WLC-2504','WLC-3504']}],
  security:[{type:'security',models:['5505','5506-X','ISA-3000','CyberObserver']}],
  wan:[{type:'cloud',models:['Cloud-PT','Cloud-PT-Empty']},{type:'modem',models:['DSL-Modem-PT','Cable-Modem-PT']}],
  end:[{type:'pc',models:['PC-PT']},{type:'laptop',models:['Laptop-PT']},{type:'server',models:['Server-PT']},{type:'pc',models:['NetworkController']},{type:'printer',models:['Printer-PT']},{type:'phone',models:['7960','Home-VoIP-PT']},{type:'tv',models:['TV-PT']},{type:'tablet',models:['TabletPC-PT']},{type:'smartphone',models:['SMARTPHONE-PT']},{type:'pc',models:['WirelessEndDevice-PT','WiredEndDevice-PT']},{type:'hub',models:['Sniffer']}],
  misc:[{type:'pc',models:['Wireless PC']},{type:'laptop',models:['Wireless Laptop']}],
  iot:[{type:'iot',models:IOT_THINGS.map(spec=>spec.model)}],
}
