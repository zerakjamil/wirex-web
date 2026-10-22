import { createDevice } from './deviceFactory'
import type { NetworkDevice,NetworkLink,NetworkAnnotation } from '@/types/network'
export type LessonId='vlans'|'ethernet'|'tcpip'|'stp'|'channel'|'campus'|'exam'
export type LearningMode='guided'|'recall'|'troubleshoot'|'free'|'exam'
export const lessonIds:LessonId[]=['vlans','ethernet','tcpip','stp','channel','campus','exam']
export const examTaskIds=['exam-vlan10','exam-vlan20','exam-vlan30','exam-access-a','exam-access-b','exam-lacp-a','exam-lacp-b','exam-trunk-a','exam-trunk-b','exam-route10','exam-route20','exam-route30','exam-stp','exam-traffic'] as const
export const lessonReferences:Record<LessonId,string>={vlans:'CCNA2 Lab 1 · Slides 8-18',ethernet:'CCNA Chapter 2 · Ethernet LANs',tcpip:'CCNA Chapter 1 · TCP/IP',stp:'CCNA2 Lab 3 · Slides 2-12',channel:'CCNA2 Lab 3 · Slides 13-15',campus:'CCNA2 Lab 1 · Slides 9-18',exam:'CCNA2 Labs 1-3 · Practical skills exam'}
export const lessonCommands:Record<LessonId,string>={
  vlans:'! Distribution-A\nenable\nconfigure terminal\nvlan 10\nname Sales\nexit\ninterface fa0/1\nswitchport mode access\nswitchport access vlan 10\nexit\ninterface gi0/1\nswitchport mode trunk\nexit\nend\n! Distribution-B\nenable\nconfigure terminal\nvlan 10\nname Sales\nexit\ninterface fa0/1\nswitchport mode access\nswitchport access vlan 10\nexit\ninterface gi0/1\nswitchport mode trunk\nexit\nend\nshow vlan brief\nshow interfaces trunk',
  ethernet:'! Distribution-A\nenable\nshow mac address-table\nshow arp\nshow interfaces status\n! Distribution-B\nenable\nshow mac address-table\nshow arp\nshow interfaces status',
  tcpip:'! Campus-Router\nenable\nshow ip interface brief\nshow ip route\nshow arp\n! Distribution-A\nenable\nshow mac address-table\nshow vlan brief\n! Distribution-B\nenable\nshow mac address-table\nshow vlan brief',
  stp:'! Distribution-A\nenable\nconfigure terminal\nspanning-tree vlan 10 root primary\ninterface fa0/1\nspanning-tree portfast\nexit\nend\n! Distribution-B\nenable\nconfigure terminal\nspanning-tree vlan 10 root secondary\ninterface fa0/1\nspanning-tree portfast\nexit\nend\n! Access-C\nenable\nshow spanning-tree vlan 10\n! Distribution-A\nshow spanning-tree vlan 10',
  channel:'! Distribution-A\nenable\nconfigure terminal\nvlan 10\nname Sales\nexit\ninterface fa0/1\nswitchport mode access\nswitchport access vlan 10\nexit\ninterface range gi0/1-2\nswitchport mode trunk\nchannel-group 1 mode active\nexit\nend\n! Distribution-B\nenable\nconfigure terminal\nvlan 10\nname Sales\nexit\ninterface fa0/1\nswitchport mode access\nswitchport access vlan 10\nexit\ninterface range gi0/1-2\nswitchport mode trunk\nchannel-group 1 mode active\nexit\nend\nshow etherchannel summary\nshow interfaces trunk\nshow spanning-tree vlan 10',
  campus:'! Distribution-A\nenable\nconfigure terminal\nvlan 10\nname Sales\nexit\nvlan 20\nname Management\nexit\nvlan 30\nname Admin\nexit\ninterface range fa0/1-2\nswitchport mode access\nswitchport access vlan 10\nexit\ninterface fa0/3\nswitchport mode access\nswitchport access vlan 20\nexit\ninterface fa0/4\nswitchport mode access\nswitchport access vlan 30\nexit\ninterface gi0/1\nswitchport mode trunk\nexit\ninterface vlan 10\nip address 192.168.10.2 255.255.255.0\nno shutdown\nend\n! Distribution-B\nenable\nconfigure terminal\nvlan 10\nname Sales\nexit\nvlan 20\nname Management\nexit\nvlan 30\nname Admin\nexit\ninterface range fa0/1-2\nswitchport mode access\nswitchport access vlan 10\nexit\ninterface fa0/3\nswitchport mode access\nswitchport access vlan 20\nexit\ninterface fa0/4\nswitchport mode access\nswitchport access vlan 30\nexit\ninterface gi0/1\nswitchport mode trunk\nexit\ninterface vlan 10\nip address 192.168.10.3 255.255.255.0\nno shutdown\nend\nshow vlan brief\nshow interfaces trunk\nshow ip interface brief',
  exam:'! Core-SW1\nenable\nconfigure terminal\nvlan 10\nname Sales\nexit\nvlan 20\nname Management\nexit\nvlan 30\nname Admin\nexit\ninterface range fa0/1-2\nswitchport mode access\nswitchport access vlan 10\nexit\ninterface fa0/3\nswitchport mode access\nswitchport access vlan 20\nexit\ninterface fa0/4\nswitchport mode access\nswitchport access vlan 30\nexit\ninterface range gi0/1-2\nswitchport mode trunk\nchannel-group 1 mode active\nexit\ninterface fa0/24\nswitchport mode trunk\nexit\nspanning-tree vlan 10 root primary\nspanning-tree vlan 20 root primary\nspanning-tree vlan 30 root primary\nend\n! Core-SW2\nenable\nconfigure terminal\nvlan 10\nname Sales\nexit\nvlan 20\nname Management\nexit\nvlan 30\nname Admin\nexit\ninterface fa0/1\nswitchport mode access\nswitchport access vlan 10\nexit\ninterface fa0/3\nswitchport mode access\nswitchport access vlan 20\nexit\ninterface range gi0/1-2\nswitchport mode trunk\nchannel-group 1 mode active\nexit\nend\n! Edge-R1\nenable\nconfigure terminal\ninterface gi0/0\nno shutdown\nexit\ninterface gi0/0.10\nencapsulation dot1q 10\nip address 192.168.10.1 255.255.255.0\nexit\ninterface gi0/0.20\nencapsulation dot1q 20\nip address 192.168.20.1 255.255.255.0\nexit\ninterface gi0/0.30\nencapsulation dot1q 30\nip address 192.168.30.1 255.255.255.0\nexit\nend\nshow vlan brief\nshow interfaces trunk\nshow etherchannel summary\nshow ip interface brief',
}
function device(type:NetworkDevice['type'],id:string,name:string,x:number,y:number){const d=createDevice(type,x,y,type==='switch'?'2960-24TT':undefined);d.id=id;d.name=name;d.config.hostname=name;return d}
function port(d:NetworkDevice,shortName:string){return d.ports.find(p=>p.shortName.toLowerCase()===shortName.toLowerCase())!}
function connect(devices:NetworkDevice[],links:NetworkLink[],a:string,aPort:string,b:string,bPort:string){
  const from=devices.find(d=>d.id===a)!,to=devices.find(d=>d.id===b)!,fp=port(from,aPort),tp=port(to,bPort)
  const link:NetworkLink={id:`campus-link-${links.length}`,type:'straight',fromDeviceId:a,toDeviceId:b,fromPortId:fp.id,toPortId:tp.id,status:'up'}
  for(const [p,peer,peerPort] of [[fp,to,tp],[tp,from,fp]] as const)Object.assign(p,{adminStatus:'up',status:'up',connectedLinkId:link.id,connectedDeviceId:peer.id,connectedPortId:peerPort.id})
  links.push(link)
}
function createExamLab(){
  const a=device('switch','exam-sw-a','Core-SW1',220,220),b=device('switch','exam-sw-b','Core-SW2',620,220)
  const router=device('router','exam-router','Edge-R1',420,60)
  const salesA=device('pc','exam-pc-sales-a','Sales-A',100,430),salesA2=device('pc','exam-pc-sales-a2','Sales-A2',280,430),salesB=device('pc','exam-pc-sales-b','Sales-B',620,430)
  const mgmtA=device('pc','exam-pc-mgmt-a','Management-A',160,620),mgmtB=device('pc','exam-pc-mgmt-b','Management-B',580,620),adminA=device('pc','exam-pc-admin-a','Admin-A',360,760)
  const devices=[a,b,router,salesA,salesA2,salesB,mgmtA,mgmtB,adminA],links:NetworkLink[]=[],annotations:NetworkAnnotation[]=[]
  for(const [pc,ip,gateway] of [[salesA,'192.168.10.11','192.168.10.1'],[salesA2,'192.168.10.12','192.168.10.1'],[salesB,'192.168.10.21','192.168.10.1'],[mgmtA,'192.168.20.11','192.168.20.1'],[mgmtB,'192.168.20.21','192.168.20.1'],[adminA,'192.168.30.11','192.168.30.1']] as const){
    Object.assign(pc.ports[0],{ipAddress:ip,subnetMask:'255.255.255.0'});pc.config.defaultGateway=gateway
  }
  connect(devices,links,a.id,'Fa0/1',salesA.id,'Fa0');connect(devices,links,a.id,'Fa0/2',salesA2.id,'Fa0');connect(devices,links,b.id,'Fa0/1',salesB.id,'Fa0')
  connect(devices,links,a.id,'Fa0/3',mgmtA.id,'Fa0');connect(devices,links,b.id,'Fa0/3',mgmtB.id,'Fa0');connect(devices,links,a.id,'Fa0/4',adminA.id,'Fa0')
  connect(devices,links,a.id,'Gi0/1',b.id,'Gi0/1');connect(devices,links,a.id,'Gi0/2',b.id,'Gi0/2')
  const rp=router.ports.find(p=>p.type==='gigabitethernet')!
  connect(devices,links,a.id,'Fa0/24',router.id,rp.shortName)
  a.macAddress='0000.0000.0001';b.macAddress='0000.0000.0002'
  annotations.push({id:'ann-exam-sales',type:'rect',x:60,y:380,width:640,height:140,title:'Sales · VLAN 10',color:'rgba(231,239,245,0.35)',borderColor:'#b4c5d0'},{id:'ann-exam-management',type:'rect',x:110,y:570,width:580,height:140,title:'Management · VLAN 20',borderColor:'#ab8794',color:'rgba(249,239,243,0.35)'},{id:'ann-exam-admin',type:'rect',x:310,y:710,width:300,height:140,title:'Admin · VLAN 30',borderColor:'#b29b6d',color:'rgba(249,244,230,0.35)'})
  return {devices,links,annotations}
}

export function createTrainingLab(lesson:LessonId,mode:LearningMode){
  if(lesson==='exam')return createExamLab()
  const a=device('switch','campus-sw-a','Distribution-A',220,220),b=device('switch','campus-sw-b','Distribution-B',620,220)
  const pcA=device('pc','campus-pc-a','Sales-A',220,420),pcB=device('pc','campus-pc-b','Sales-B',620,420)
  const devices=[a,b,pcA,pcB],links:NetworkLink[]=[],annotations:NetworkAnnotation[]=[]
  for(const [pc,ip] of [[pcA,'192.168.10.11'],[pcB,'192.168.10.12']] as const)Object.assign(pc.ports[0],{ipAddress:ip,subnetMask:'255.255.255.0'})
  connect(devices,links,a.id,'Fa0/1',pcA.id,'Fa0')
  connect(devices,links,b.id,'Fa0/1',pcB.id,'Fa0')
  connect(devices,links,a.id,'Gi0/1',b.id,'Gi0/1')
  if((lesson!=='vlans'&&lesson!=='campus') || mode==='troubleshoot')for(const sw of [a,b]){
    sw.config.vlans=[{id:1,name:'default'},{id:10,name:'Sales'}]
    Object.assign(port(sw,'Fa0/1'),{vlan:10,portMode:'access'})
    Object.assign(port(sw,'Gi0/1'),{portMode:'trunk'})
  }
  if(lesson==='campus'){
    for(const [sw,side,x] of [[a,'A',220],[b,'B',620]] as const){
      for(const [id,name,ip,mask,short,y,px] of [[`campus-sales-${side}` ,`Sales-${side}2`,`192.168.10.${side==='A'?21:22}`,'255.255.255.0','Fa0/2',420,x+100],[`campus-management-${side}`,`Management-${side}`,`192.168.20.${side==='A'?11:12}`,'255.255.255.0','Fa0/3',600,x],[`campus-admin-${side}`,`Admin-${side}`,`192.168.30.${side==='A'?11:12}`,'255.255.255.0','Fa0/4',780,x]] as const){const pc=device('pc',id,name,px,y);Object.assign(pc.ports[0],{ipAddress:ip,subnetMask:mask});devices.push(pc);connect(devices,links,sw.id,short,pc.id,'Fa0')}
      if(mode==='troubleshoot'){sw.config.vlans=[{id:1,name:'default'},{id:10,name:'Sales'},{id:20,name:'Management'},{id:30,name:'Admin'}];for(const [short,vlan] of [['Fa0/2',10],['Fa0/3',20],['Fa0/4',30]] as const)Object.assign(port(sw,short),{vlan,portMode:'access'})}
    }
    annotations.push({id:'ann-campus-management',type:'rect',x:140,y:560,width:700,height:140,title:'Management · VLAN 20',borderColor:'#ab8794',color:'rgba(249,239,243,0.35)'},{id:'ann-campus-admin',type:'rect',x:140,y:740,width:700,height:140,title:'Admin · VLAN 30',borderColor:'#b29b6d',color:'rgba(249,244,230,0.35)'})
  }
  if(lesson==='stp'){
    const c=device('switch','campus-sw-c','Access-C',420,90);devices.push(c);c.config.vlans=[{id:1,name:'default'},{id:10,name:'Sales'}]
    connect(devices,links,a.id,'Gi0/2',c.id,'Gi0/1');connect(devices,links,b.id,'Gi0/2',c.id,'Gi0/2')
    for(const sw of [a,b,c])for(const p of sw.ports.filter(p=>p.connectedLinkId && p.type==='gigabitethernet'))p.portMode='trunk'
    for(const [i,sw] of [a,b,c].entries())sw.macAddress=`0000.0000.000${3-i}`
  }
  if(lesson==='channel'){connect(devices,links,a.id,'Gi0/2',b.id,'Gi0/2');for(const sw of [a,b])port(sw,'Gi0/2').portMode='trunk'}
  if(lesson==='tcpip'){
    const router=device('router','campus-router','Campus-Router',420,80);devices.push(router)
    links.pop();for(const sw of [a,b]){const p=port(sw,'Gi0/1');p.connectedLinkId=undefined;p.connectedDeviceId=undefined;p.connectedPortId=undefined;p.portMode='access';p.vlan=10}
    const rp=router.ports.filter(p=>p.type==='gigabitethernet'||p.type==='fastethernet').slice(0,2)
    Object.assign(rp[0],{ipAddress:'192.168.10.1',subnetMask:'255.255.255.0'});Object.assign(rp[1],{ipAddress:'192.168.20.1',subnetMask:'255.255.255.0'})
    connect(devices,links,a.id,'Gi0/1',router.id,rp[0].shortName);connect(devices,links,b.id,'Gi0/1',router.id,rp[1].shortName)
    pcA.config.defaultGateway='192.168.10.1';pcB.config.defaultGateway='192.168.20.1';pcB.ports[0].ipAddress='192.168.20.12'
  }
  if(mode==='troubleshoot'){
    if(lesson==='vlans'||lesson==='campus')port(b,'Fa0/1').vlan=1
    if(lesson==='ethernet'||lesson==='tcpip')port(b,'Fa0/1').adminStatus='down'
    if(lesson==='channel'){port(a,'Gi0/1').channelGroup=1;port(a,'Gi0/2').channelGroup=1;port(b,'Gi0/1').channelGroup=1;port(b,'Gi0/2').channelGroup=1;for(const sw of [a,b])for(const p of sw.ports.filter(p=>p.channelGroup))p.channelMode='passive'}
  }
  annotations.push({id:'ann-campus-sales',type:'rect',x:160,y:370,width:580,height:180,title:'Sales · VLAN 10',color:'rgba(231,239,245,0.35)',borderColor:'#b4c5d0'})
  return {devices,links,annotations}
}
