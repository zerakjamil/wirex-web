'use client'

import { useEffect, useRef } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import type { DeviceWindow } from '@/types/network'
import { DeviceModal } from './DeviceModal'

export function DeviceWindows() {
  const windows=useNetworkStore(state=>state.deviceWindows)
  const devices=useNetworkStore(state=>state.devices)
  useEffect(()=>{
    const keepVisible=()=>{
      const store=useNetworkStore.getState()
      for(const frame of store.deviceWindows){
        const x=Math.max(0,Math.min(frame.x,window.innerWidth-Math.min(frame.width,window.innerWidth)))
        const y=Math.max(0,Math.min(frame.y,window.innerHeight-Math.min(frame.height,window.innerHeight)))
        if(x!==frame.x || y!==frame.y)store.updateDeviceWindow(frame.deviceId,{x,y})
      }
    }
    keepVisible()
    window.addEventListener('resize',keepVisible)
    return()=>window.removeEventListener('resize',keepVisible)
  },[])
  return <div className="pt-device-windows">{windows.filter(window=>devices.some(device=>device.id===window.deviceId)).map(window=><FloatingDevice key={window.deviceId} window={window}/>)}</div>
}

function FloatingDevice({window:frame}: {window:DeviceWindow}) {
  const box=useRef<HTMLElement>(null)
  const dragging=useRef<{pointerX:number;pointerY:number;x:number;y:number}|null>(null)
  const device=useNetworkStore(state=>state.devices.find(device=>device.id===frame.deviceId))
  useEffect(()=>{
    if(!box.current || frame.minimized)return
    const element=box.current
    const observer=new ResizeObserver(()=>{
      const current=useNetworkStore.getState().deviceWindows.find(window=>window.deviceId===frame.deviceId)
      if(!current)return
      const width=element.offsetWidth;const height=element.offsetHeight
      if(width!==Math.round(current.width) || height!==Math.round(current.height))useNetworkStore.getState().updateDeviceWindow(frame.deviceId,{width,height})
    })
    observer.observe(element)
    return()=>observer.disconnect()
  },[frame.deviceId,frame.minimized])
  if(!device || frame.minimized)return null
  return <section ref={box} className="pt-device-window" aria-label={`${device.name} window`} style={{left:frame.x,top:frame.y,width:frame.width,height:frame.height,zIndex:frame.z}} onPointerDownCapture={()=>{
    const windows=useNetworkStore.getState().deviceWindows
    if(windows.some(window=>window.z>frame.z))useNetworkStore.getState().focusDeviceWindow(frame.deviceId)
  }}>
    <header className="pt-device-window-title" onPointerDown={event=>{
      if((event.target as HTMLElement).closest('button'))return
      dragging.current={pointerX:event.clientX,pointerY:event.clientY,x:frame.x,y:frame.y}
      event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={event=>{
      const origin=dragging.current;if(!origin)return
      useNetworkStore.getState().updateDeviceWindow(frame.deviceId,{x:Math.max(0,Math.min(window.innerWidth-80,origin.x+event.clientX-origin.pointerX)),y:Math.max(0,Math.min(window.innerHeight-32,origin.y+event.clientY-origin.pointerY))})
    }} onPointerCancel={()=>{dragging.current=null}} onPointerUp={event=>{dragging.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}>
      <span>{device.name} ({device.model})</span><div><button aria-label={`Minimize ${device.name}`} onClick={()=>useNetworkStore.getState().minimizeDeviceWindow(frame.deviceId)}>−</button><button aria-label={`Close ${device.name}`} onClick={()=>useNetworkStore.getState().closeDeviceWindow(frame.deviceId)}>×</button></div>
    </header>
    <div className="pt-device-window-content"><DeviceModal deviceId={frame.deviceId} onClose={()=>useNetworkStore.getState().closeDeviceWindow(frame.deviceId)}/></div>
  </section>
}
