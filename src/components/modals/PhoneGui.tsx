'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNetworkStore } from '@/store/networkStore'
import { useVoiceStore } from '@/store/voiceStore'
import { getPhoneRegistrations } from '@/simulator/voice'
import './phone.css'

const letters = ['', '', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ']
function tone(frequency: number, duration = 0.18, volume = 0.1) {
  const context = new AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = frequency
  gain.gain.value = volume
  oscillator.connect(gain); gain.connect(context.destination)
  oscillator.start(); oscillator.stop(context.currentTime + duration)
  oscillator.onended = () => { void context.close() }
}

export function PhoneGui({ deviceId }: { deviceId: string }) {
  const { devices, links } = useNetworkStore(useShallow(state => ({ devices:state.devices,links:state.links })))
  const { calls, errors, dial, answer, hangUp, hold, resume } = useVoiceStore(useShallow(state => ({ calls:state.calls,errors:state.errors,dial:state.dial,answer:state.answer,hangUp:state.hangUp,hold:state.hold,resume:state.resume })))
  const regs = useMemo(() => getPhoneRegistrations(devices,links),[devices,links])
  const reg = regs.find(reg => reg.deviceId === deviceId)
  const device = devices.find(device => device.id === deviceId)
  const call = calls.find(call => call.status !== 'ended' && (call.fromDeviceId === deviceId || call.toDeviceId === deviceId))
  const recent = calls.filter(call => call.fromDeviceId === deviceId || call.toDeviceId === deviceId).slice(-6).reverse()
  const incoming = call?.status === 'ringing' && call.toDeviceId === deviceId
  const otherId = call && (call.fromDeviceId === deviceId ? call.toDeviceId : call.fromDeviceId)
  const other = regs.find(reg => reg.deviceId === otherId)
  const [digits,setDigits] = useState('')
  const [offHook,setOffHook] = useState(false)
  const [muted,setMuted] = useState(false)
  const [speaker,setSpeaker] = useState(false)
  const [volume,setVolume] = useState(4)
  const [panel,setPanel] = useState<'phone'|'directory'|'settings'|'services'|'history'>('phone')
  const [clock,setClock] = useState(() => Date.now())
  const [lastNumber,setLastNumber] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const [scale,setScale] = useState(1)
  const lifted = offHook || !!call && !incoming

  useEffect(() => {
    if(!stage.current)return
    const observer=new ResizeObserver(entries=>setScale(Math.min(1,entries[0].contentRect.width / 640)))
    observer.observe(stage.current)
    return ()=>observer.disconnect()
  },[])

  useEffect(() => {
    if (!call) return
    const timer = setInterval(() => setClock(Date.now()),1000)
    return () => clearInterval(timer)
  },[call])
  useEffect(() => {
    if (!device?.power || !reg?.registered || volume === 0) return
    const ringing = call?.status === 'ringing'
    if (!ringing && !(offHook && !call)) return
    let context: AudioContext
    try { context = new AudioContext() } catch { return }
    const gain = context.createGain()
    gain.gain.value = volume / 100
    gain.connect(context.destination)
    const oscillators = (ringing ? [440,480] : [350,440]).map(frequency => {
      const oscillator = context.createOscillator(); oscillator.frequency.value = frequency; oscillator.connect(gain); oscillator.start(); return oscillator
    })
    let timer: ReturnType<typeof setInterval> | undefined
    if (ringing) {
      let on = true
      timer = setInterval(() => { on = !on; gain.gain.value = on ? volume / 100 : 0 }, incoming ? 650 : 1200)
    }
    return () => { if(timer) clearInterval(timer); oscillators.forEach(oscillator => oscillator.stop()); void context.close() }
  },[call,incoming,offHook,volume,reg?.registered,device?.power])

  if (!device || !reg) return null
  const openOther = () => { if(otherId) { useVoiceStore.getState().openPhone(deviceId);useVoiceStore.getState().openPhone(otherId) } }
  const doDial = (number = digits) => { setPanel('phone');setOffHook(true);setLastNumber(number);dial(deviceId,number) }
  const end = () => { hangUp(deviceId);setOffHook(false);setSpeaker(false);setMuted(false);setDigits('') }
  const pickUp = () => { setPanel('phone'); if(incoming) { answer(deviceId);setOffHook(true) } else if(lifted) end(); else setOffHook(true) }
  const key = (value: string) => { if (!device.power || call) return;setDigits(previous => (previous + value).slice(0,24));setPanel('phone');try {tone(697 + Number(value || 0) * 22,0.09,volume / 100)} catch {} }
  const elapsed = call?.answeredAt ? Math.max(0,Math.floor((clock-call.answeredAt)/1000)) : 0
  const status = !device.power ? 'Powered off' : !reg.registered ? reg.reason : call?.status === 'connected' ? 'Connected' : call?.status === 'held' ? 'On hold' : incoming ? `From: ${call?.fromNumber}` : call ? `Calling ${call.toNumber}` : errors[deviceId] || (offHook ? 'Enter number' : 'Your current options')
  const togglePanel = (next: typeof panel) => setPanel(previous => previous === next ? 'phone' : next)
  const callKeys = incoming ? [{label:'Answer',action:() => { answer(deviceId);setOffHook(true) }},{label:'Decline',action:end}] : call ? [{label:call.status === 'held'?'Resume':'Hold',action:() => call.status === 'held'?resume(deviceId):hold(deviceId),disabled:call.status === 'ringing'},{label:'EndCall',action:end}] : [{label:'Dial',action:() => doDial(),disabled:!digits || !reg.registered},{label:'<<',action:() => setDigits(value => value.slice(0,-1)),disabled:!digits},{label:'Redial',action:() => doDial(lastNumber),disabled:!lastNumber || !reg.registered}]

  return <div className="phone-workspace">
    <div className="phone-stage" ref={stage}><div className="phone-hardware" style={{transform:`scale(${scale})`}} aria-label={`${device.name} Cisco IP Phone 7960`}>
      <svg className="phone-shell" viewBox="0 0 640 405" aria-hidden="true">
        <defs><linearGradient id="phone-body" x2="1" y2="1"><stop stopColor="#4a5052"/><stop offset="1" stopColor="#282d30"/></linearGradient><pattern id="speaker-holes" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.2" fill="#1d2225"/></pattern></defs>
        <path d="M155 22 Q121 22 121 58 L121 366 Q124 383 154 383 L550 390 Q585 388 585 374 L585 150 L609 150 L609 193 L586 193 L586 73 Q586 60 570 60 L267 60 L267 41 Q267 22 240 22Z" fill="url(#phone-body)" stroke="#1b2022" strokeWidth="3"/>
        <rect x="270" y="39" width="302" height="232" rx="4" fill="#d5d5d3" stroke="#858887" strokeWidth="3"/>
        <rect x="290" y="75" width="218" height="155" rx="3" fill="#a7b4a0" stroke="#59615a" strokeWidth="2"/>
        <path d="M139 116 Q150 144 180 144 Q211 143 241 123 L241 356 Q222 369 204 369 L158 369 Q141 363 139 345Z" fill="#434a4d" stroke="#333a3d"/>
        <circle cx="185" cy="230" r="48" fill="url(#speaker-holes)"/>
        <rect className={incoming?'phone-ring-lamp':''} x="162" y="34" width="43" height="13" rx="3" fill={incoming?'#ee3535':'#8a2525'}/>
        <path d="M60 352 L60 394" stroke="#353b3e" strokeWidth="8"/>
        <text x="392" y="63" fontSize="10" fill="#747674" fontFamily="Arial">CISCO IP PHONE</text>
        {[100,126,151,176,202].map(y=><g key={y}><path d={`M509 ${y}H543`} stroke="#545959"/><circle cx="545" cy={y} r="7" fill="#777e80" stroke="#373e40"/></g>)}
      </svg>
      <button className={`phone-handset ${lifted?'phone-handset-lifted':''}`} onClick={pickUp} aria-label={incoming?'Answer with handset':lifted?'Replace handset and hang up':'Lift handset'} disabled={!device.power}><span/><span/><span/></button>
      <div className={`phone-lcd ${!device.power?'phone-lcd-off':''}`} aria-live="polite">
        {device.power && <><div className="phone-lcd-bar"><span>{new Date(clock).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><span>{reg.extension || 'Not registered'}</span></div>
          {panel === 'phone' ? <><div className="phone-number">{incoming?call?.fromNumber:call?call.toDeviceId===deviceId?call.fromNumber:call.toNumber:digits || (reg.registered?reg.extension:'')}</div><div className="phone-status">{status}</div>{call?.status==='connected' && <div>{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')} {muted?'Muted':''} {speaker?'Speaker':''}</div>}</> : panel === 'settings' ? <div className="phone-lcd-info">Network Configuration<br/>IP: {reg.ipAddress || 'Unassigned'}<br/>Voice VLAN: {reg.vlan ?? '-'}<br/>MAC: {reg.macAddress}<br/>Volume: {volume}</div> : panel === 'services' ? <div className="phone-lcd-info">Call Manager Express<br/>{reg.reason}<br/>Extension: {reg.extension || '-'}<br/>SCCP: TCP 2000</div> : panel === 'directory' ? <div className="phone-lcd-info">Local Directory{regs.filter(item => item.deviceId!==deviceId && item.registered).map(item=><button key={item.deviceId} onClick={()=>doDial(item.extension)}>{item.extension} {devices.find(device=>device.id===item.deviceId)?.name}</button>)}</div> : <div className="phone-lcd-info">Call History{recent.map(item=><button key={item.id} onClick={()=>{setDigits(item.fromDeviceId===deviceId?item.toNumber:item.fromNumber);setPanel('phone')}}>{item.fromDeviceId===deviceId?item.toNumber:item.fromNumber}: {item.status==='ended'?item.reason:item.status}</button>)}{!recent.length&&<div>No calls</div>}</div>}
        </>}
      </div>
      {panel === 'phone' && <input className="phone-dial-input" aria-label="Dial extension" inputMode="tel" value={digits} maxLength={24} disabled={!device.power || !!call} onChange={event=>{setDigits(event.target.value.replace(/[^0-9*#]/g,''));setPanel('phone')}} onKeyDown={event=>{if(event.key==='Enter')doDial();if(event.key==='Escape')end()}} placeholder="Enter extension"/>}
      <div className="phone-softkeys">{callKeys.map(item=><button key={item.label} disabled={!device.power || item.disabled} onClick={item.action}>{item.label}</button>)}<button disabled={!device.power} onClick={()=>setPanel('phone')}>Exit</button></div>
      <div className="phone-keypad">{['1','2','3','4','5','6','7','8','9','*','0','#'].map(value=><button key={value} aria-label={`Key ${value}`} onClick={()=>key(value)} disabled={!device.power || !!call}><b>{value}</b><small>{letters[Number(value)] || (value==='0'?'+':'')}</small></button>)}</div>
      <div className="phone-navigation"><button aria-label="Increase volume" onClick={()=>setVolume(v=>Math.min(10,v+1))}>▲</button><button aria-label="Decrease volume" onClick={()=>setVolume(v=>Math.max(0,v-1))}>▼</button></div>
      <div className="phone-featurekeys"><button onClick={()=>togglePanel('history')}>messages</button><button onClick={()=>togglePanel('directory')}>directories</button><button onClick={()=>togglePanel('services')}>services</button><button onClick={()=>togglePanel('settings')}>settings</button></div>
      <div className="phone-volume"><span>VOLUME</span><div><button aria-label="Volume down" onClick={()=>setVolume(v=>Math.max(0,v-1))}>−</button><button aria-label="Volume up" onClick={()=>setVolume(v=>Math.min(10,v+1))}>+</button></div></div>
      <div className="phone-audiokeys"><button onClick={pickUp}>HEADSET<span className={lifted?'on':''}>◉</span></button><button onClick={()=>setMuted(value=>!value)} disabled={!call}>MUTE<span className={muted?'on':''}>◉</span></button><button onClick={()=>{if(incoming)answer(deviceId);if(speaker)end();else{setSpeaker(true);setOffHook(true)}}}>SPEAKER<span className={speaker?'on':''}>◉</span></button></div>
      <div className="phone-linekeys">{Array.from({length:5},(_,index)=><button key={index} aria-label={index===0?'Line 1':`Line ${index+1} unassigned`} disabled={index!==0 || !device.power} onClick={()=>incoming?answer(deviceId):setPanel('phone')}/>)}</div>
      <div className="phone-melody">{[['Do',261.63],['Re',293.66],['Mi',329.63]].map(([label,frequency])=><button key={label} disabled={!device.power} onClick={()=>{try{tone(Number(frequency),0.35,volume/100)}catch{}}}>{label}</button>)}</div>
    </div></div>
    <div className="phone-call-strip"><strong>{reg.registered?`Registered: ${reg.extension}`:reg.reason}</strong><span>{reg.ipAddress}{reg.vlan?` · VLAN ${reg.vlan}`:''}</span>{otherId ? <button onClick={openOther}>Open {devices.find(device=>device.id===otherId)?.name} ({other?.extension})</button> : regs.filter(item=>item.deviceId!==deviceId).map(item=><button key={item.deviceId} onClick={()=>{useVoiceStore.getState().openPhone(deviceId);useVoiceStore.getState().openPhone(item.deviceId)}}>Open {devices.find(device=>device.id===item.deviceId)?.name} ({item.extension || 'unregistered'})</button>)}</div>
    <p className="phone-help">Lift the handset, enter an extension, and press Dial. Open the receiving phone to answer. Calls simulate VoIP signaling and tones.</p>
  </div>
}
