import type {DeviceType} from '@/types/network'

export type DeviceCategory='routers'|'switches'|'hubs'|'wireless'|'security'|'wan'|'end'|'connections'|'components'|'custom'|'multiuser'
export const deviceCatalog:Partial<Record<DeviceCategory,{type:DeviceType;models:string[]}[]>>={
  routers:[{type:'router',models:['4331','4321','1941','2901','2911','819IOX','819HGW','829','1240','PT-Router','PT-Empty','1841','2620XM','2621XM','2811']}],
  switches:[{type:'switch',models:['2960-24TT','2950-24','2950T-24','3560-24PS','3650-24PS','PT-Switch','PT-Empty']}],
  hubs:[{type:'hub',models:['PT-Hub','Coaxial Splitter']}],
  wireless:[{type:'wireless',models:['WRT300N','AccessPoint-PT','AccessPoint-PT-A','AccessPoint-PT-N','Cell-Tower']}],
  security:[{type:'security',models:['ASA 5505','ASA 5506-X']}],
  wan:[{type:'cloud',models:['Cloud-PT','Cloud-Empty']},{type:'modem',models:['DSL-Modem','Cable-Modem']}],
  end:[{type:'pc',models:['PC-PT']},{type:'laptop',models:['Laptop-PT']},{type:'server',models:['Server-PT']},{type:'printer',models:['Printer-PT']},{type:'phone',models:['IP-Phone-PT','Home-VoIP']},{type:'tv',models:['TV-PT']},{type:'tablet',models:['Tablet-PT']},{type:'smartphone',models:['Smartphone-PT']}],
}
