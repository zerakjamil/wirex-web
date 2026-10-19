'use client'
import {useState} from 'react'
import {useShallow} from 'zustand/react/shallow'
import {useNetworkStore} from '@/store/networkStore'
import {useWorkspaceStore} from '@/store/workspaceStore'
import {MODULE_CATALOG} from '@/simulator/deviceFactory'
import {getHardwareProfile,getPhysicalPorts} from '@/simulator/physicalHardware'
import {isStoredOnShelf} from '@/simulator/physical'
import {useI18n} from '@/i18n/useI18n'
import type {NetworkDevice,CableType} from '@/types/network'
import {HardwareChassis} from './HardwareChassis'
import './physical.css'

export function PhysicalDeviceView({deviceId}:{deviceId:string}){
  const device=useNetworkStore(state=>state.devices.find(d=>d.id===deviceId))
  return device?<PhysicalHardware key={device.id} device={device}/>:null
}

function PhysicalHardware({device}:{device:NetworkDevice}){
  const {t,dir}=useI18n()
  const {devices,links,toggleDevicePower,installDeviceModule,removeDeviceModule,connectPorts,deleteLink,physicalContainers,physicalAssignment}=useNetworkStore(useShallow(s=>({devices:s.devices,links:s.links,toggleDevicePower:s.toggleDevicePower,installDeviceModule:s.installDeviceModule,removeDeviceModule:s.removeDeviceModule,connectPorts:s.connectPorts,deleteLink:s.deleteLink,physicalContainers:s.physicalContainers,physicalAssignment:s.physicalAssignment})))
  const profile=getHardwareProfile(device),ports=getPhysicalPorts(device),power=device.power!==false
  const storedOnShelf=isStoredOnShelf(physicalContainers,physicalAssignment,device.id)
  const [face,setFace]=useState<'front'|'rear'>(profile.portFace)
  const [zoom,setZoom]=useState(1)
  const [moduleId,setModuleId]=useState(profile.moduleIds[0]??'')
  const [selectedPortId,setSelectedPortId]=useState('')
  const [targetId,setTargetId]=useState(''),[targetPortId,setTargetPortId]=useState('')
  const [cable,setCable]=useState<CableType>('straight')
  const [message,setMessage]=useState('')
  const port=ports.find(p=>p.id===selectedPortId)
  const target=devices.find(d=>d.id===targetId)
  const storedTarget=target?isStoredOnShelf(physicalContainers,physicalAssignment,target.id):false
  const connections=port?links.filter(l=>l.fromDeviceId===device.id&&l.fromPortId===port.id||l.toDeviceId===device.id&&l.toPortId===port.id):[]
  const operate=(operation:()=>{success:boolean;message?:string})=>{
    const result=operation()
    if(result.success)setMessage('Hardware updated.');else setMessage(result.message??'Hardware could not be updated.')
  }
  const changeModule=(slot:number,id:string|null)=>{
    if(power){setMessage('Turn off the device before changing modules.');return}
    useWorkspaceStore.getState().checkpoint()
    operate(()=>id?installDeviceModule(device.id,slot,id):removeDeviceModule(device.id,slot))
  }
  const togglePower=()=>{
    if(!power&&storedOnShelf){setMessage('Devices stored on a shelf cannot be connected or powered on. Move the device to a rack or table first.');return}
    useWorkspaceStore.getState().checkpoint()
    toggleDevicePower(device.id)
  }
  return <section className="pt-hardware" dir={dir} aria-label={t('Physical Device View')}>
    <header className="hardware-toolbar">
      <strong dir="ltr">{device.name} · {device.model}</strong>
      <div className="hardware-toolbar-controls">
        {(profile.shape==='laptop'?['rear','front'] as const:['front','rear'] as const).map(value=><button key={value} className={face===value?'is-active':''} aria-pressed={face===value} onClick={()=>setFace(value)}>{t(profile.shape==='laptop'?(value==='front'?'Top':'Rear'):(value==='front'?'Front':'Rear'))}</button>)}
        <span className="hardware-toolbar-sep" aria-hidden="true"/>
        <button aria-label={t('Zoom Out')} disabled={zoom<=.5} onClick={()=>setZoom(z=>Math.max(.5,z-.25))}>−</button>
        <button onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button>
        <button aria-label={t('Zoom In')} disabled={zoom>=2} onClick={()=>setZoom(z=>Math.min(2,z+.25))}>+</button>
      </div>
    </header>
    <div className="hardware-layout">
      <aside className="hardware-module-list"><h3>{t('MODULES')}</h3>{profile.moduleIds.length?profile.moduleIds.map(id=><button key={id} draggable aria-pressed={moduleId===id} onClick={()=>setModuleId(id)} onDragStart={event=>{setModuleId(id);event.dataTransfer.setData('application/x-hardware-module',id)}}><span dir="ltr">{id}</span></button>):<p>{t('Fixed hardware. No replaceable network modules.')}</p>}</aside>
      <div className="hardware-main">
        <div className="hardware-scroll">
          <div className="hardware-zoom-space" style={{width:`${Math.max(100,zoom*100)}%`}}>
            <div className="hardware-chassis" dir="ltr" style={{zoom}}>
              <HardwareChassis
                device={device}
                ports={ports}
                profile={profile}
                face={face}
                power={power}
                selectedPortId={selectedPortId}
                moduleId={moduleId}
                onSelectPort={id=>{setSelectedPortId(id);setMessage('')}}
                onTogglePower={togglePower}
                onInstallModule={(slot,id)=>changeModule(slot,id)}
                onEjectModule={slot=>changeModule(slot,null)}
              />
            </div>
            {face!==profile.portFace&&!['access-point','laptop','hub'].includes(profile.shape)&&<p className="hardware-other-face">{t('Network connectors are on the other side.')}</p>}
          </div>
        </div>
        {moduleId&&<div className="hardware-module-description"><strong dir="ltr">{MODULE_CATALOG[moduleId]?.name??moduleId}</strong><span>{t('Interfaces')}: {MODULE_CATALOG[moduleId]?.portCount??1} · {MODULE_CATALOG[moduleId]?.portType}</span>{MODULE_CATALOG[moduleId]?.description&&<p>{MODULE_CATALOG[moduleId].description}</p>}<p className="hardware-module-hint">{t('Select a module, switch off power, and install it in an empty bay. You can also drag the module into a bay.')}</p></div>}
        {message&&<p className="hardware-message" role="status">{t(message)}<button aria-label={t('Close')} onClick={()=>setMessage('')}>×</button></p>}
        {port&&<section className="hardware-port-details"><header><strong dir="ltr">{port.name}</strong><button onClick={()=>setSelectedPortId('')}>{t('Close')}</button></header><dl><dt>{t('Port Status')}</dt><dd>{t(power?port.status:'down')} · {t(port.adminStatus==='up'?'Administratively enabled':'Administratively disabled')}</dd><dt>MAC</dt><dd dir="ltr">{port.macAddress}</dd><dt>{t('IP Address')}</dt><dd dir="ltr">{port.ipAddress??t('Not assigned')}</dd><dt>VLAN</dt><dd>{port.vlan??1}</dd></dl>
          {connections.length?<ul>{connections.map(link=>{const other=devices.find(d=>d.id===(link.fromDeviceId===device.id?link.toDeviceId:link.fromDeviceId));return <li key={link.id}><span dir="ltr">{other?.name} · {link.type}</span><button onClick={()=>{useWorkspaceStore.getState().checkpoint();deleteLink(link.id)}}>{t('Disconnect cable')}</button></li>})}</ul>:<div className="hardware-connect"><label>{t('Destination')}<select value={targetId} onChange={event=>{setTargetId(event.target.value);setTargetPortId('')}}><option value="">{t('Choose a device')}</option>{devices.filter(d=>d.id!==device.id).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>{t('Interface')}<select value={targetPortId} onChange={event=>setTargetPortId(event.target.value)}><option value="">{t('Choose an interface')}</option>{target&&getPhysicalPorts(target).filter(p=>!p.connectedLinkId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>{t('Cable')}<select value={cable} onChange={event=>setCable(event.target.value as CableType)}>{(['straight','crossover','fiber','serial','serial-dce','console','phone','coaxial','wireless'] as const).map(type=><option key={type} value={type}>{type}</option>)}</select></label><button disabled={!targetId||!targetPortId} onClick={()=>{if(storedOnShelf||storedTarget){setMessage('Devices stored on a shelf cannot be connected or powered on. Move the device to a rack or table first.');return}useWorkspaceStore.getState().checkpoint();setMessage(connectPorts(device.id,port.id,targetId,targetPortId,cable)?'Cable connected.':'These interfaces cannot use this cable, or a port is occupied.')}}>{t('Connect')}</button></div>}
        </section>}
      </div>
    </div>
  </section>
}
