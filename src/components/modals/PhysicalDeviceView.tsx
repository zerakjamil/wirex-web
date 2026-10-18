'use client'
import {useState} from 'react'
import {useShallow} from 'zustand/react/shallow'
import {useNetworkStore} from '@/store/networkStore'
import {useWorkspaceStore} from '@/store/workspaceStore'
import {MODULE_CATALOG} from '@/simulator/deviceFactory'
import {getHardwareProfile,getPhysicalPorts,type HardwareShape} from '@/simulator/physicalHardware'
import {isStoredOnShelf} from '@/simulator/physical'
import {useI18n} from '@/i18n/useI18n'
import type {NetworkDevice,NetworkPort,CableType} from '@/types/network'
import './physical.css'

function Connector({port}:{port:NetworkPort}){
  const kind=port.type==='wireless'?'radio':port.type==='serial'?'serial':port.type==='coaxial'?'coax':port.type==='phone'?'rj11':port.media==='fiber'?'fiber':'rj45'
  return <span aria-hidden="true" className={`hardware-connector hardware-connector-${kind}`}><i/><i/><i/><i/></span>
}

function DeviceBody({shape,front,power}:{shape:HardwareShape;front:boolean;power:boolean}){
  const screen=power?'#5bafcf':'#202b31'
  return <svg className={`hardware-body hardware-body-${shape}`} viewBox="0 0 600 240" role="img" aria-label={shape}>
    <defs><linearGradient id={`metal-${shape}`} x2="0" y2="1"><stop stopColor="#98a5ab"/><stop offset="1" stopColor="#4a5c65"/></linearGradient></defs>
    {shape==='rack'?<><rect x="20" y="65" width="560" height="125" rx="5" fill={`url(#metal-${shape})`} stroke="#29373e" strokeWidth="3"/><rect x="40" y="90" width="520" height="70" fill="#344b58"/><path d="M28 88v75m544-75v75" stroke="#d3dee1" strokeWidth="5"/>{Array.from({length:16},(_,i)=><path key={i} d={`M${65+i*11} 108v32`} stroke="#182b35" strokeWidth="4"/>)}</>:
    shape==='laptop'?<><path d="M100 18h400l-24 151H124Z" fill="#29373e" stroke="#637884" strokeWidth="5"/><path d="M117 32h366l-18 123H136Z" fill={front?screen:'#526975'}/><path d="M124 169h352l68 49H56Z" fill="#778994" stroke="#384d59" strokeWidth="4"/>{front?<><path d="M159 182h282l22 19H137Z" fill="#263b47"/><rect x="258" y="204" width="84" height="10" rx="2" fill="#a0b1ba"/></>:<path d="M190 192h220" stroke="#344f60" strokeWidth="5"/>}</>:
    shape==='tower'?<><rect x="192" y="10" width="216" height="222" rx="9" fill="#46565f" stroke="#29373e" strokeWidth="4"/>{front?<><rect x="214" y="38" width="170" height="18" fill="#26343c"/><rect x="214" y="66" width="170" height="18" fill="#26343c"/>{Array.from({length:11},(_,i)=><path key={i} d={`M214 ${107+i*9}h170`} stroke="#27363e" strokeWidth="3"/>)}</>:<><rect x="213" y="33" width="172" height="175" fill="#73848d"/><circle cx="300" cy="92" r="43" fill="#26383f"/>{Array.from({length:6},(_,i)=><path key={i} d={`M${234+i*22} 155v40`} stroke="#27363e" strokeWidth="5"/>)}</>}</>:
    shape==='phone'?<><rect x="160" y="22" width="290" height="203" rx="17" fill="#343f44" stroke="#182b33" strokeWidth="4"/><rect x="115" y="27" width="65" height="193" rx="24" fill="#29363d"/><rect x="216" y="45" width="191" height="85" rx="3" fill={front?'#a4b29e':'#354b57'}/>{front&&Array.from({length:12},(_,i)=><circle key={i} cx={236+(i%3)*27} cy={151+Math.floor(i/3)*16} r="6" fill="#697d84"/>)}<rect x="350" y="153" width="52" height="30" rx="7" fill="#526b77"/></>:
    shape==='printer'?<><rect x="178" y="16" width="244" height="88" rx="5" fill="#c7d0d2"/><rect x="194" y="6" width="212" height="78" fill="#e4e8e9" stroke="#82949d"/><rect x="139" y="92" width="322" height="116" rx="14" fill="#91a4ac" stroke="#405760" strokeWidth="3"/><rect x="167" y="137" width="266" height="48" rx="3" fill="#263942"/><path d="M199 160h202l14 65H185Z" fill="#dbe3e6"/><rect x="354" y="105" width="64" height="19" fill={screen}/></>:
    ['display','tablet','handheld'].includes(shape)?<><rect x={shape==='handheld'?230:shape==='tablet'?190:100} y="10" width={shape==='handheld'?140:shape==='tablet'?220:400} height={shape==='display'?174:215} rx={shape==='display'?5:18} fill="#263941" stroke="#6e8490" strokeWidth="4"/><rect x={shape==='handheld'?240:shape==='tablet'?203:113} y="29" width={shape==='handheld'?120:shape==='tablet'?194:374} height={shape==='display'?139:175} rx="3" fill={front?screen:'#455f6d'}/>{shape==='display'?<path d="M289 187v29h-66v10h154v-10h-66v-29" fill="#687f8c"/>:<circle cx="300" cy="216" r="5" fill="#9eb0ba"/>}</>:
    shape==='cloud'?<><rect x="76" y="73" width="448" height="131" rx="7" fill="#617984" stroke="#293e49" strokeWidth="4"/><path d="M189 94c-20-47 36-76 62-46 8-49 78-55 94-6 43-11 74 42 35 67H204" fill="#91c7dc" stroke="#345e70" strokeWidth="3"/></>:
    <><rect x="122" y="85" width="356" height="120" rx={shape==='access-point'?34:8} fill={shape==='access-point'?'#d1dee3':'#526c7a'} stroke="#294551" strokeWidth="4"/>{shape==='access-point'&&<><path d="M167 98 150 14m283 84 17-84" stroke="#344f60" strokeWidth="11" strokeLinecap="round"/><ellipse cx="300" cy="145" rx="91" ry="26" fill="#647f8e"/></>}{shape==='modem'&&Array.from({length:5},(_,i)=><circle key={i} cx={203+i*48} cy="129" r="6" fill={power?'#79cdb0':'#263b43'}/>)}{shape==='hub'&&<path d="M148 119h304m-304 17h304m-304 17h304" stroke="#304c5b" strokeWidth="4"/>}</>}
  </svg>
}

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
  const changeModule=(slot:number,remove:boolean)=>{
    if(power){setMessage('Turn off the device before changing modules.');return}
    useWorkspaceStore.getState().checkpoint()
    operate(()=>remove?removeDeviceModule(device.id,slot):installDeviceModule(device.id,slot,moduleId))
  }
  return <section className="pt-hardware" dir={dir} aria-label={t('Physical Device View')}>
    <header className="hardware-toolbar"><strong dir="ltr">{device.name} · {device.model}</strong><div>
      {(['front','rear'] as const).map(value=><button key={value} aria-pressed={face===value} onClick={()=>setFace(value)}>{t(value==='front'?'Front':'Rear')}</button>)}
      <button aria-label={t('Zoom Out')} disabled={zoom<=.5} onClick={()=>setZoom(z=>Math.max(.5,z-.25))}>−</button><button onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button aria-label={t('Zoom In')} disabled={zoom>=2} onClick={()=>setZoom(z=>Math.min(2,z+.25))}>+</button>
    </div></header>
    <div className="hardware-layout">
      <aside className="hardware-module-list"><h3>{t('MODULES')}</h3>{profile.moduleIds.length?profile.moduleIds.map(id=><button key={id} draggable aria-pressed={moduleId===id} onClick={()=>setModuleId(id)} onDragStart={event=>{setModuleId(id);event.dataTransfer.setData('application/x-hardware-module',id)}}><span dir="ltr">{id}</span></button>):<p>{t('Fixed hardware. No replaceable network modules.')}</p>}</aside>
      <div className="hardware-main">
        <div className="hardware-scroll"><div className="hardware-zoom-space" style={{width:`${Math.max(100,zoom*100)}%`}}><div className="hardware-chassis" dir="ltr" style={{zoom}}>
          <DeviceBody shape={profile.shape} front={face==='front'} power={power}/>
          <div className="hardware-faceplate"><div className="hardware-brand"><strong>{device.model}</strong><span>{t(face==='front'?'Front':'Rear')}</span><button className="hardware-power" aria-label={t('Device power')} aria-pressed={power} onClick={()=>{if(!power&&storedOnShelf){setMessage('Devices stored on a shelf cannot be connected or powered on. Move the device to a rack or table first.');return}useWorkspaceStore.getState().checkpoint();toggleDevicePower(device.id)}}><span className="hardware-led" data-state={power?'up':'down'}/>⏻ {t(power?'On':'Off')}</button></div>
          {face===profile.portFace&&<div className="hardware-ports">{ports.map(p=><button key={p.id} aria-pressed={port?.id===p.id} aria-label={`${p.name}: ${t(power?p.status:'down')}`} title={p.name} onClick={()=>{setSelectedPortId(p.id);setMessage('')}}><span className="hardware-led" data-state={power?p.status:'down'}/><Connector port={p}/><small>{p.shortName}</small></button>)}{!ports.length&&<p>{t('No network interfaces installed.')}</p>}</div>}
          {face===profile.portFace&&profile.slots>0&&<div className="hardware-bays">{Array.from({length:profile.slots},(_,slot)=>{const installed=device.modules?.[slot];return <div key={slot} className={`hardware-bay ${installed?'is-installed':''}`} onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-hardware-module'))event.preventDefault()}} onDrop={event=>{event.preventDefault();const id=event.dataTransfer.getData('application/x-hardware-module');if(power){setMessage('Turn off the device before changing modules.');return}useWorkspaceStore.getState().checkpoint();operate(()=>installDeviceModule(device.id,slot,id))}}><span>{t('Bay')} {slot}</span><strong>{installed||t('Empty')}</strong><button disabled={!installed&&!moduleId} onClick={()=>changeModule(slot,!!installed)}>{t(installed?'Eject':'Install')}</button></div>})}</div>}
          {face!==profile.portFace&&<p className="hardware-other-face">{t('Network connectors are on the other side.')}</p>}
          </div>
        </div></div></div>
        {moduleId&&<div className="hardware-module-description"><strong dir="ltr">{moduleId}</strong><span>{t('Interfaces')}: {MODULE_CATALOG[moduleId]?.portCount??1} · {MODULE_CATALOG[moduleId]?.portType}</span><p>{t('Select a module, switch off power, and install it in an empty bay. You can also drag the module into a bay.')}</p></div>}
        {message&&<p className="hardware-message" role="status">{t(message)}<button aria-label={t('Close')} onClick={()=>setMessage('')}>×</button></p>}
        {port&&<section className="hardware-port-details"><header><strong dir="ltr">{port.name}</strong><button onClick={()=>setSelectedPortId('')}>{t('Close')}</button></header><dl><dt>{t('Port Status')}</dt><dd>{t(power?port.status:'down')} · {t(port.adminStatus==='up'?'Administratively enabled':'Administratively disabled')}</dd><dt>MAC</dt><dd dir="ltr">{port.macAddress}</dd><dt>{t('IP Address')}</dt><dd dir="ltr">{port.ipAddress??t('Not assigned')}</dd><dt>VLAN</dt><dd>{port.vlan??1}</dd></dl>
          {connections.length?<ul>{connections.map(link=>{const other=devices.find(d=>d.id===(link.fromDeviceId===device.id?link.toDeviceId:link.fromDeviceId));return <li key={link.id}><span dir="ltr">{other?.name} · {link.type}</span><button onClick={()=>{useWorkspaceStore.getState().checkpoint();deleteLink(link.id)}}>{t('Disconnect cable')}</button></li>})}</ul>:<div className="hardware-connect"><label>{t('Destination')}<select value={targetId} onChange={event=>{setTargetId(event.target.value);setTargetPortId('')}}><option value="">{t('Choose a device')}</option>{devices.filter(d=>d.id!==device.id).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>{t('Interface')}<select value={targetPortId} onChange={event=>setTargetPortId(event.target.value)}><option value="">{t('Choose an interface')}</option>{target&&getPhysicalPorts(target).filter(p=>!p.connectedLinkId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>{t('Cable')}<select value={cable} onChange={event=>setCable(event.target.value as CableType)}>{(['straight','crossover','fiber','serial','serial-dce','console','phone','coaxial','wireless'] as const).map(type=><option key={type} value={type}>{type}</option>)}</select></label><button disabled={!targetId||!targetPortId} onClick={()=>{if(storedOnShelf||storedTarget){setMessage('Devices stored on a shelf cannot be connected or powered on. Move the device to a rack or table first.');return}useWorkspaceStore.getState().checkpoint();setMessage(connectPorts(device.id,port.id,targetId,targetPortId,cable)?'Cable connected.':'These interfaces cannot use this cable, or a port is occupied.')}}>{t('Connect')}</button></div>}
        </section>}
      </div>
    </div>
  </section>
}
