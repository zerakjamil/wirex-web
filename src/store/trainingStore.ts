import { create } from 'zustand'
import { useNetworkStore } from './networkStore'
import { useWorkspaceStore } from './workspaceStore'
import { useActivityStore } from './activityStore'
import { createTrainingLab,lessonIds,type LessonId,type LearningMode } from '@/simulator/trainingLabs'
import type { NetworkDevice,NetworkLink,NetworkAnnotation,DeviceWindow } from '@/types/network'
import { getStpTopology,getOperationalChannels } from '@/simulator/spanningTree'
import { stripRoutingRuntime } from '@/simulator/routingRuntime'

export type TrainingBackup={devices:NetworkDevice[];links:NetworkLink[];annotations:NetworkAnnotation[];deviceWindows:DeviceWindow[];fileName:string}
type Progress={hintsUsed:number;completed:boolean;attempts:number;score?:number;maxScore?:number}
interface TrainingStore {
  active:boolean;catalogOpen:boolean;lesson:LessonId;mode:LearningMode;deviceId:string;hintLevel:number;progress:Partial<Record<LessonId,Progress>>;backup:TrainingBackup|null;testId:string|null;testFingerprint:string|null;checked:boolean
  openCatalog:()=>void;start:(lesson:LessonId,mode:LearningMode,restart?:boolean)=>void;exit:()=>void;reset:()=>void;revealHint:()=>void;check:()=>void;testTraffic:()=>void
}
export function evaluateLesson(lesson:LessonId,devices:NetworkDevice[],links:NetworkLink[]){
  const switches=devices.filter(d=>d.type==='switch'),sw=switches.slice(0,2)
  if(lesson==='exam'){
    const swA=devices.find(d=>d.id==='exam-sw-a'),swB=devices.find(d=>d.id==='exam-sw-b'),router=devices.find(d=>d.id==='exam-router')
    const p=(sw:NetworkDevice|undefined,short:string)=>sw?.ports.find(x=>x.shortName.toLowerCase()===short.toLowerCase())
    const vlan=(sw:NetworkDevice|undefined,id:number,name:string)=>!!sw?.config.vlans?.some(v=>v.id===id&&v.name===name)
    const access=(sw:NetworkDevice|undefined,items:readonly (readonly [string,number])[])=>!!sw&&items.every(([short,id])=>{const x=p(sw,short);return x?.portMode==='access'&&x.vlan===id&&x.adminStatus==='up'})
    const lacp=(sw:NetworkDevice|undefined)=>['Gi0/1','Gi0/2'].every(short=>{const x=p(sw,short);return x?.channelGroup===1&&(x.channelMode==='active'||x.channelMode==='passive')})
    const trunk=(sw:NetworkDevice|undefined)=>['Gi0/1','Gi0/2'].every(short=>{const x=p(sw,short);return x?.portMode==='trunk'&&x.adminStatus==='up'&&(!x.allowedVlans||[10,20,30].every(v=>x.allowedVlans!.includes(v)))})
    const routerTrunk=p(swA,'Fa0/24')?.portMode==='trunk'
    const sub=(vlanId:number,ip:string)=>{const x=router?.ports.find(y=>y.dot1qVlan===vlanId);const parent=x?.parentPortId?router?.ports.find(y=>y.id===x.parentPortId):undefined;return !!x&&x.ipAddress===ip&&x.subnetMask==='255.255.255.0'&&x.adminStatus==='up'&&parent?.adminStatus==='up'&&routerTrunk}
    const bundle=getOperationalChannels(devices,links).some(channel=>channel.links.length===2&&channel.links.every(link=>[link.fromDeviceId,link.toDeviceId].includes('exam-sw-a')&&[link.fromDeviceId,link.toDeviceId].includes('exam-sw-b')))
    const root=(vlanId:number)=>getStpTopology(devices,links,vlanId).roots.get('exam-sw-a')==='exam-sw-a'
    return [
      {id:'exam-vlan10',complete:vlan(swA,10,'Sales')&&vlan(swB,10,'Sales')},
      {id:'exam-vlan20',complete:vlan(swA,20,'Management')&&vlan(swB,20,'Management')},
      {id:'exam-vlan30',complete:vlan(swA,30,'Admin')&&vlan(swB,30,'Admin')},
      {id:'exam-access-a',complete:access(swA,[['Fa0/1',10],['Fa0/2',10],['Fa0/3',20],['Fa0/4',30]])},
      {id:'exam-access-b',complete:access(swB,[['Fa0/1',10],['Fa0/3',20]])},
      {id:'exam-lacp-a',complete:lacp(swA)&&bundle},
      {id:'exam-lacp-b',complete:lacp(swB)&&bundle},
      {id:'exam-trunk-a',complete:trunk(swA)&&bundle},
      {id:'exam-trunk-b',complete:trunk(swB)&&bundle},
      {id:'exam-route10',complete:sub(10,'192.168.10.1')},
      {id:'exam-route20',complete:sub(20,'192.168.20.1')},
      {id:'exam-route30',complete:sub(30,'192.168.30.1')},
      {id:'exam-stp',complete:root(10)&&root(20)&&root(30)&&[10,20,30].every(vlanId=>typeof swA?.config.stpPriorities?.[String(vlanId)]==='number')},
      {id:'exam-traffic',complete:false},
    ]
  }
  if(lesson==='campus')return [
    {id:'departments',complete:sw.length===2&&sw.every(d=>[[10,'Sales'],[20,'Management'],[30,'Admin']].every(([id,name])=>d.config.vlans?.some(v=>v.id===id&&v.name===name)))},
    {id:'range',complete:sw.length===2&&sw.every(d=>[['Fa0/1',10],['Fa0/2',10],['Fa0/3',20],['Fa0/4',30]].every(([name,vlan])=>d.ports.some(p=>p.shortName===name&&p.vlan===vlan&&p.portMode==='access'&&p.adminStatus==='up')))},
    {id:'campus-trunks',complete:sw.length===2&&sw.every(d=>d.ports.some(p=>p.shortName==='Gi0/1'&&p.portMode==='trunk'&&[10,20,30].every(v=>!p.allowedVlans||p.allowedVlans.includes(v))))},
    {id:'svi',complete:sw.length===2&&sw.every((d,index)=>d.ports.some(p=>p.virtualVlan===10&&p.ipAddress===`192.168.10.${index+2}`&&p.subnetMask==='255.255.255.0'&&p.status==='up'))},
    {id:'traffic',complete:false},
  ]
  if(lesson==='vlans')return [
    {id:'vlans',complete:sw.length===2&&sw.every(d=>d.config.vlans?.some(v=>v.id===10))},
    {id:'names',complete:sw.length===2&&sw.every(d=>d.config.vlans?.some(v=>v.id===10&&v.name.toLowerCase()==='sales'))},
    {id:'access',complete:sw.length===2&&sw.every(d=>d.ports.some(p=>p.shortName==='Fa0/1'&&p.vlan===10&&p.portMode==='access'&&p.adminStatus==='up'))},
    {id:'trunks',complete:sw.length===2&&sw.every(d=>d.ports.some(p=>p.shortName==='Gi0/1'&&p.portMode==='trunk'&&(!p.allowedVlans||p.allowedVlans.includes(10))&&p.adminStatus==='up'))},
    {id:'traffic',complete:false},
  ]
  if(lesson==='stp'){
    const topology=getStpTopology(devices,links,10)
    return [{id:'root',complete:topology.roots.get('campus-sw-a')==='campus-sw-a'},{id:'block',complete:[...topology.ports.values()].some(p=>p.role==='Altn')},{id:'traffic',complete:false}]
  }
  if(lesson==='channel')return [{id:'channel',complete:getOperationalChannels(devices,links).some(channel=>channel.links.length===2)},{id:'traffic',complete:false}]
  return [...(lesson==='ethernet'?[{id:'mac',complete:switches.some(d=>d.macTable.length>=2)}]:[]),{id:'traffic',complete:false}]
}
export function trainingFingerprint(devices:NetworkDevice[],links:NetworkLink[]){
  const runtimeKeys=new Set(['stpState','stpSinceTick','stpVlanStates','rootInconsistentVlans'])
  return JSON.stringify({devices:devices.map(d=>({id:d.id,power:d.power,config:d.config,ports:d.ports.map(port=>Object.fromEntries(Object.entries(port).filter(([key])=>!runtimeKeys.has(key)))),routes:d.routingTable})),links})
}
export function hasValidTrainingReply(){const net=useNetworkStore.getState(),state=useTrainingStore.getState();return state.testFingerprint===trainingFingerprint(net.devices,net.links)&&net.pingResults.some(r=>r.id===state.testId&&r.status==='successful')}
export const useTrainingStore=create<TrainingStore>((set,get)=>({
  active:false,catalogOpen:false,lesson:'vlans',mode:'guided',deviceId:'campus-sw-a',hintLevel:0,progress:{},backup:null,testId:null,testFingerprint:null,checked:false,
  openCatalog:()=>set({catalogOpen:true}),
  start:(lesson,mode,restart=false)=>{
    useActivityStore.getState().exit()
    const net=useNetworkStore.getState()
    const backup=get().backup || structuredClone({devices:net.devices,links:net.links,annotations:net.annotations,deviceWindows:net.deviceWindows,fileName:useWorkspaceStore.getState().fileName})
    const old=get().progress[lesson] || {hintsUsed:0,completed:false,attempts:0}
    const nextProgress=restart?{hintsUsed:0,completed:false,attempts:old.attempts+1}:{...old,attempts:old.attempts+1}
    set({backup,active:true,catalogOpen:false,lesson,mode,deviceId:'campus-sw-a',hintLevel:0,testId:null,checked:false,progress:{...get().progress,[lesson]:nextProgress}})
    const lab=createTrainingLab(lesson,mode);net.loadLab(lab.devices,lab.links,lab.annotations)
    useNetworkStore.setState({deviceWindows:[],commandEvents:[]})
    useWorkspaceStore.setState({past:[],future:[],fileName:'',dialog:null})
    useWorkspaceStore.getState().setTool('select');useWorkspaceStore.getState().command('fit-topology')
  },
  exit:()=>{
    const backup=get().backup;if(!backup)return
    set({active:false,backup:null,testId:null,catalogOpen:false})
    useNetworkStore.getState().loadLab(backup.devices,backup.links,backup.annotations)
    useNetworkStore.setState({deviceWindows:backup.deviceWindows,commandEvents:[]})
    useWorkspaceStore.setState({fileName:backup.fileName,past:[],future:[]});useWorkspaceStore.getState().setTool('select');useWorkspaceStore.getState().command('fit-topology')
  },
  reset:()=>get().start(get().lesson,get().mode),
  revealHint:()=>{const {lesson,progress,hintLevel}=get();const p=progress[lesson] || {hintsUsed:0,completed:false,attempts:1};if(hintLevel<3)set({hintLevel:hintLevel+1,progress:{...progress,[lesson]:{...p,hintsUsed:p.hintsUsed+1}}})},
  check:()=>{
    const net=useNetworkStore.getState(),state=get(),checks=evaluateLesson(state.lesson,net.devices,net.links)
    const successful=hasValidTrainingReply()
    const traffic=(id:string)=>id==='traffic'||id==='exam-traffic'
    const complete=checks.every(c=>traffic(c.id)?successful:c.complete)
    const score=checks.filter(c=>traffic(c.id)?successful:c.complete).length
    const p=state.progress[state.lesson] || {hintsUsed:0,completed:false,attempts:1}
    set({checked:true,progress:{...state.progress,[state.lesson]:{...p,completed:p.completed||complete,score,maxScore:checks.length}}})
  },
  testTraffic:()=>{
    const net=useNetworkStore.getState(),state=get()
    const [source,targetDevice]=state.lesson==='exam'?['exam-pc-sales-a','exam-pc-mgmt-a']:['campus-pc-a','campus-pc-b']
    const target=net.devices.find(d=>d.id===targetDevice)?.ports.find(p=>p.ipAddress)?.ipAddress
    if(!target)return
    set({testId:net.sendPing(source,target),testFingerprint:trainingFingerprint(net.devices,net.links),checked:false})
  },
}))

export const TRAINING_STORAGE_KEY='wireforge-training-v1'
type TrainingStorage={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void}
export function saveTrainingToStorage(storage:TrainingStorage){
  try{const {active,lesson,mode,deviceId,hintLevel,progress,backup}=useTrainingStore.getState();const {devices,links,annotations}=useNetworkStore.getState();const cleanBackup=backup?{...backup,devices:stripRoutingRuntime(backup.devices)}:null;storage.setItem(TRAINING_STORAGE_KEY,JSON.stringify({version:1,active,lesson,mode,deviceId,hintLevel,progress,backup:cleanBackup,lab:active?{devices:stripRoutingRuntime(devices),links,annotations}:null}));return true}catch{return false}
}
export function restoreTrainingFromStorage(storage:TrainingStorage){
  try{
    const raw=storage.getItem(TRAINING_STORAGE_KEY);if(!raw||raw.length>32*1024*1024)return false
    const saved=JSON.parse(raw)
    if(saved.version!==1||!lessonIds.includes(saved.lesson)||!['guided','recall','troubleshoot','free','exam'].includes(saved.mode))return false
    const valid=(lab:TrainingBackup)=>lab&&Array.isArray(lab.devices)&&lab.devices.length<=2000&&Array.isArray(lab.links)&&Array.isArray(lab.annotations)&&lab.devices.every(d=>d&&typeof d.id==='string'&&d.config&&Array.isArray(d.ports)&&Array.isArray(d.routingTable)&&Array.isArray(d.arpTable)&&Array.isArray(d.macTable)&&Number.isFinite(d.x)&&Number.isFinite(d.y))&&lab.links.every(l=>lab.devices.some(d=>d.id===l.fromDeviceId)&&lab.devices.some(d=>d.id===l.toDeviceId))
    if(saved.active&&(!valid(saved.lab)||!valid(saved.backup)))return false
    const progress:TrainingStore['progress']={}
    for(const id of lessonIds){const p=saved.progress?.[id];if(p&&Number.isInteger(p.hintsUsed)&&p.hintsUsed>=0&&Number.isInteger(p.attempts)&&p.attempts>=0)progress[id]={hintsUsed:p.hintsUsed,attempts:p.attempts,completed:p.completed===true,...(Number.isInteger(p.score)&&p.score>=0?{score:p.score}:{}),...(Number.isInteger(p.maxScore)&&p.maxScore>=0?{maxScore:p.maxScore}:{})}}
    useTrainingStore.setState({active:saved.active===true,lesson:saved.lesson,mode:saved.mode,deviceId:typeof saved.deviceId==='string'?saved.deviceId:'campus-sw-a',hintLevel:Math.max(0,Math.min(3,Number(saved.hintLevel)||0)),progress,backup:saved.active?saved.backup:null,testId:null,checked:false})
    if(saved.active){useNetworkStore.getState().loadLab(saved.lab.devices,saved.lab.links,saved.lab.annotations);useNetworkStore.setState({deviceWindows:[]});useWorkspaceStore.setState({fileName:'',past:[],future:[]});useWorkspaceStore.getState().command('fit-topology')}
    return true
  }catch{return false}
}
