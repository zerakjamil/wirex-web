'use client'

import { useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { Cisco3DIcon } from '@/components/canvas/Cisco3DIcons'
import {useI18n} from '@/i18n/useI18n'

export function DeviceNavigator() {
  const {t}=useI18n()
  const devices=useNetworkStore(state=>state.devices)
  const windows=useNetworkStore(state=>state.deviceWindows)
  const [query,setQuery]=useState('')
  return <aside className="pt-device-navigator" aria-label={t('Device navigator')}>
    <h2>{t('Devices')} <span>{devices.length}</span></h2>
    <input aria-label={t('Find device…')} placeholder={t('Find device…')} value={query} onChange={event=>setQuery(event.target.value)}/>
    <div className="pt-device-list">{devices.filter(device=>`${device.name} ${device.model}`.toLowerCase().includes(query.toLowerCase())).map(device=>{
      const frame=windows.find(window=>window.deviceId===device.id)
      return <button key={device.id} className={frame?'is-open':''} onClick={()=>useNetworkStore.getState().setActiveModal({type:'device',deviceId:device.id})}>
        <Cisco3DIcon type={device.type} model={device.model} size={28}/><span dir="ltr"><strong>{device.name}</strong><small>{device.model}</small></span><small>{t(frame?.minimized?'Min':frame?'Open':'')}</small>
      </button>
    })}</div>
    <p>{t('Drag a window by its title. Resize from its lower-right corner.')}</p>
  </aside>
}
