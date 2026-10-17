import { create } from 'zustand'
import { useNetworkStore } from './networkStore'
import { useWorkspaceStore } from './workspaceStore'
import { createTrainingLab,lessonIds,type LessonId,type LearningMode } from '@/simulator/trainingLabs'
import type { NetworkDevice,NetworkLink,NetworkAnnotation,DeviceWindow } from '@/types/network'
import { getStpTopology,getOperationalChannels } from '@/simulator/spanningTree'
import { stripRoutingRuntime } from '@/simulator/routingRuntime'

export type TrainingBackup={devices:NetworkDevice[];links:NetworkLink[];annotations:NetworkAnnotation[];deviceWindows:DeviceWindow[];fileName:string}
type Progress={hintsUsed:number;completed:boolean;attempts:number}
interface TrainingStore {
  active:boolean;catalogOpen:boolean;lesson:LessonId;mode:LearningMode;deviceId:string;hintLevel:number;progress:Partial<Record<LessonId,Progress>>;backup:TrainingBackup|null;testId:string|null;testFingerprint:string|null;checked:boolean
  openCatalog:()=>void;start:(lesson:LessonId,mode:LearningMode)=>void;exit:()=>void;reset:()=>void;revealHint:()=>void;check:()=>void;testTraffic:()=>void
}
export function evaluateLesson(lesson:LessonId,devices:NetworkDevice[],links:NetworkLink[]){
  const switches=devices.filter(d=>d.type==='switch'),sw=switches.slice(0,2)
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
export function trainingFingerprint(devices:NetworkDevice[],links:NetworkLink[]){return JSON.stringify({devices:devices.map(d=>({id:d.id,power:d.power,config:d.config,ports:d.ports,routes:d.routingTable})),links})}
export function hasValidTrainingReply(){const net=useNetworkStore.getState(),state=useTrainingStore.getState();return state.testFingerprint===trainingFingerprint(net.devices,net.links)&&net.pingResults.some(r=>r.id===state.testId&&r.status==='successful')}
export const useTrainingStore=create<TrainingStore>((set,get)=>({
  active:false,catalogOpen:false,lesson:'vlans',mode:'guided',deviceId:'campus-sw-a',hintLevel:0,progress:{},backup:null,testId:null,testFingerprint:null,checked:false,
  openCatalog:()=>set({catalogOpen:true}),
  start:(lesson,mode)=>{
    const net=useNetworkStore.getState()
    const backup=get().backup || structuredClone({devices:net.devices,links:net.links,annotations:net.annotations,deviceWindows:net.deviceWindows,fileName:useWorkspaceStore.getState().fileName})
    const old=get().progress[lesson] || {hintsUsed:0,completed:false,attempts:0}
    set({backup,active:true,catalogOpen:false,lesson,mode,deviceId:'campus-sw-a',hintLevel:0,testId:null,checked:false,progress:{...get().progress,[lesson]:{...old,attempts:old.attempts+1}}})
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
    const complete=checks.every(c=>c.id==='traffic'?successful:c.complete)
    const p=state.progress[state.lesson] || {hintsUsed:0,completed:false,attempts:1}
    set({checked:true,progress:{...state.progress,[state.lesson]:{...p,completed:p.completed||complete}}})
  },
  testTraffic:()=>{
    const net=useNetworkStore.getState(),target=net.devices.find(d=>d.id==='campus-pc-b')?.ports.find(p=>p.ipAddress)?.ipAddress
    if(!target)return
    set({testId:net.sendPing('campus-pc-a',target),testFingerprint:trainingFingerprint(net.devices,net.links),checked:false})
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
    if(saved.version!==1||!lessonIds.includes(saved.lesson)||!['guided','recall','troubleshoot','free'].includes(saved.mode))return false
    const valid=(lab:TrainingBackup)=>lab&&Array.isArray(lab.devices)&&lab.devices.length<=2000&&Array.isArray(lab.links)&&Array.isArray(lab.annotations)&&lab.devices.every(d=>d&&typeof d.id==='string'&&d.config&&Array.isArray(d.ports)&&Array.isArray(d.routingTable)&&Array.isArray(d.arpTable)&&Array.isArray(d.macTable)&&Number.isFinite(d.x)&&Number.isFinite(d.y))&&lab.links.every(l=>lab.devices.some(d=>d.id===l.fromDeviceId)&&lab.devices.some(d=>d.id===l.toDeviceId))
    if(saved.active&&(!valid(saved.lab)||!valid(saved.backup)))return false
    const progress:TrainingStore['progress']={}
    for(const id of lessonIds){const p=saved.progress?.[id];if(p&&Number.isInteger(p.hintsUsed)&&p.hintsUsed>=0&&Number.isInteger(p.attempts)&&p.attempts>=0)progress[id]={hintsUsed:p.hintsUsed,attempts:p.attempts,completed:p.completed===true}}
    useTrainingStore.setState({active:saved.active===true,lesson:saved.lesson,mode:saved.mode,deviceId:typeof saved.deviceId==='string'?saved.deviceId:'campus-sw-a',hintLevel:Math.max(0,Math.min(3,Number(saved.hintLevel)||0)),progress,backup:saved.active?saved.backup:null,testId:null,checked:false})
    if(saved.active){useNetworkStore.getState().loadLab(saved.lab.devices,saved.lab.links,saved.lab.annotations);useNetworkStore.setState({deviceWindows:[]});useWorkspaceStore.setState({fileName:'',past:[],future:[]});useWorkspaceStore.getState().command('fit-topology')}
    return true
  }catch{return false}
}
