'use client'
import { useEffect, useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Cisco3DIcon } from '@/components/canvas/Cisco3DIcons'
import { CiscoIcon, type IconName } from './CiscoIcon'
import {deviceCatalog as catalog,type DeviceCategory as Category} from '@/simulator/deviceCatalog'
import type {DeviceType} from '@/types/network'
import { useShallow } from 'zustand/react/shallow'
import {useI18n} from '@/i18n/useI18n'

const labels: Record<Category,string>={routers:'Routers',switches:'Switches',hubs:'Hubs',wireless:'Wireless Devices',security:'Security',wan:'WAN Emulation',end:'End Devices',connections:'Connections',components:'Components',custom:'Custom Made Devices',multiuser:'Multiuser Connection'}
const cables=[{tool:'cable-auto',label:'Automatically Choose Connection Type',color:'#df931a'}, {tool:'cable-console',label:'Console',color:'#57c9e5'}, {tool:'cable-straight',label:'Copper Straight-Through',color:'#222'}, {tool:'cable-crossover',label:'Copper Cross-Over',color:'#222'}, {tool:'cable-fiber',label:'Fiber',color:'#eb8c22'}, {tool:'cable-phone',label:'Phone',color:'#738aa7'}, {tool:'cable-coaxial',label:'Coaxial',color:'#186ab5'}, {tool:'cable-serial-dce',label:'Serial DCE',color:'#c33434'}, {tool:'cable-serial',label:'Serial DTE',color:'#c33434'}, {tool:'cable-octal',label:'Octal',color:'#5d7c4e'}, {tool:'cable-usb',label:'USB',color:'#396792'}] as const
export function CiscoBottomBar() {
  const {t}=useI18n()
  const net=useNetworkStore(useShallow(state => ({
    devices: state.devices, udpTransactions: state.udpTransactions, activeTool: state.activeTool, addDevice: state.addDevice,
    setActiveTool: state.setActiveTool, toggleDevicePower: state.toggleDevicePower,
    stepSimulation: state.stepSimulation, toggleSimulationMode: state.toggleSimulationMode,
    simulationMode: state.simulationMode, simulationPlaying: state.simulationPlaying,
    setSimulationPlaying: state.setSimulationPlaying, setActiveModal: state.setActiveModal,
    packetCount: state.inFlightPackets.length, simulationWarning: state.simulationWarning, clearSimulation: state.clearSimulation,
  })));const ws=useWorkspaceStore()
  const [category,setCategory]=useState<Category>('routers'); const [hovered,setHovered]=useState('4331')
  const [seconds,setSeconds]=useState(0)
  useEffect(() => {const timer=setInterval(() => setSeconds(s=>s+1),1000);return () => clearInterval(timer)},[])
  const time=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':')
  const powerCycle=()=>{const state=useNetworkStore.getState();useWorkspaceStore.getState().checkpoint();state.devices.forEach(d=>{if(d.power!==false){state.toggleDevicePower(d.id);state.toggleDevicePower(d.id)}});useWorkspaceStore.getState().setStatus('Powered devices restarted.')}
  const fastForward=()=>{const state=useNetworkStore.getState();for(let i=0;i<30;i++)state.stepSimulation();setSeconds(s=>s+30)}
  const togglePlay=()=>{const state=useNetworkStore.getState();state.setSimulationPlaying(!state.simulationPlaying)}
  const captureForward=()=>{const state=useNetworkStore.getState();for(let i=0;i<7;i++){state.stepSimulation();if(useNetworkStore.getState().inFlightPackets.length===0)break}}
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return
      if((event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]'))return
      const state=useNetworkStore.getState()
      if(event.code==='KeyS'){event.preventDefault();powerCycle()}
      else if(event.code==='KeyD'){event.preventDefault();fastForward()}
      else if(state.simulationMode==='simulation'&&event.code==='KeyP'){event.preventDefault();togglePlay()}
      else if(state.simulationMode==='simulation'&&event.code==='KeyC'){event.preventDefault();captureForward()}
      else if(state.simulationMode==='simulation'&&event.code==='KeyI'){event.preventDefault();useWorkspaceStore.getState().togglePduList()}
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[])
  const choose=(value:Category) => {ws.cancelPlacement();setCategory(value);setHovered(labels[value])}
  const categoryButton=(value:Category,icon:IconName|DeviceType,isDevice=false) => <button key={value} className="pt-category-button" title={t(labels[value])} aria-label={t(labels[value])} aria-pressed={category===value} onClick={()=>choose(value)}>{isDevice?<Cisco3DIcon type={icon as DeviceType} size={27}/>:<CiscoIcon name={icon as IconName} size={27}/>}</button>
  return <footer className="pt-bottom">
    <div className="pt-mode-bar">
      <div className="pt-time-controls"><span>{t('Time:')} {time}</span><button title={`${t('Power Cycle Devices')} (Alt+S)`} aria-label={t('Power Cycle Devices')} onClick={powerCycle}><CiscoIcon name="clock"/></button><button title={`${t('Fast Forward Time')} (Alt+D)`} aria-label={t('Fast Forward Time')} onClick={fastForward}><CiscoIcon name="fast"/></button></div>
      <div className="pt-mode-tabs"><button aria-pressed={net.simulationMode==='realtime'} onClick={()=>{if(net.simulationMode!=='realtime')net.toggleSimulationMode()}}><CiscoIcon name="clock" size={20}/>{t('Realtime')}</button><button aria-pressed={net.simulationMode==='simulation'} onClick={()=>{if(net.simulationMode!=='simulation'){net.toggleSimulationMode();useWorkspaceStore.setState({showPduList:true})}}}><CiscoIcon name="list" size={20}/>{t('Simulation')}</button></div>
    </div>
    {net.simulationMode==='simulation' && <div className="pt-simulation-controls"><span>{t('Simulation Panel')}</span><button className="pt-button" title={`${t(net.simulationPlaying?'Pause':'Auto Capture / Play')} (Alt+P)`} onClick={togglePlay}>{t(net.simulationPlaying?'Pause':'Auto Capture / Play')}</button><button className="pt-button" title={`${t('Capture / Forward')} (Alt+C)`} onClick={captureForward}>{t('Capture / Forward')}</button><button className="pt-button" onClick={net.clearSimulation}>{t('Reset Simulation')}</button><button className="pt-button" title={`${t('Event List')} (Alt+I)`} onClick={ws.togglePduList}>{t('Event List')}</button><span>{net.packetCount} {t('packets in flight')}</span>{net.packetCount > 0 && <button className="pt-button bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold" onClick={() => { const first = useNetworkStore.getState().inFlightPackets[0]; if (first) net.setActiveModal({ type: 'pdu', pdu: first.pdu }) }}>✉ {t('Sniff In-Flight PDU')}</button>}</div>}
    <div className={`pt-device-dock ${ws.showPduList?'':'pt-pdu-hidden'}`}>
      <div className="pt-categories"><div className="pt-category-row">
        <button className="pt-category-button" aria-label={t('Network Devices')} title={t('Network Devices')} aria-pressed={!['end','connections','components','custom','multiuser'].includes(category)} onClick={()=>choose('routers')}><CiscoIcon name="network" size={27}/></button>
        {categoryButton('end','end')}{categoryButton('components','components')}{categoryButton('connections','connections')}{categoryButton('custom','folder')}{categoryButton('multiuser','multiuser')}
      </div><div className="pt-category-divider"/><div className="pt-category-row">
        {categoryButton('routers','router',true)}{categoryButton('switches','switch',true)}{categoryButton('hubs','hub',true)}{categoryButton('wireless','wireless',true)}{categoryButton('security','security',true)}{categoryButton('wan','cloud',true)}
      </div><div className="pt-device-description">{t(labels[category])}</div></div>
      <div className="pt-model-box"><div className="pt-model-shelf">
        {catalog[category]?.flatMap(group=>group.models.map(model=>{
          const selected=ws.placement?.type===group.type && ws.placement.model===model
          return <button className="pt-model" key={model} aria-label={selected?`Cancel placing ${model}`:`Place ${model}`} aria-pressed={selected} title={selected?'Cancel placement':`${model}: click or drag to place. Ctrl-click for multiple.`} draggable onMouseEnter={()=>setHovered(model)} onFocus={()=>setHovered(model)} onPointerDown={event=>{
            if(event.ctrlKey){event.preventDefault();ws.selectDeviceForPlacement(group.type,model,true)}
          }} onContextMenu={event=>event.preventDefault()} onClick={event=>{if(!event.ctrlKey)ws.selectDeviceForPlacement(group.type,model,false)}} onDragStart={event=>{
            ws.cancelPlacement()
            ws.selectDeviceForPlacement(group.type,model,event.ctrlKey)
            event.dataTransfer.setData('application/x-wireforge-device',model)
            event.dataTransfer.effectAllowed='copy'
          }} onDragEnd={event=>{if(event.dataTransfer.dropEffect==='none')ws.cancelPlacement()}}>
            {selected && ws.placement?.repeat?<svg width="33" height="33" viewBox="0 0 33 33" aria-hidden="true"><circle cx="16.5" cy="16.5" r="13" fill="none" stroke="#404040" strokeWidth="3"/><path d="M7 26L26 7" stroke="#404040" strokeWidth="3"/></svg>:<Cisco3DIcon type={group.type} model={model} size={33}/>}<span>{model}</span>
          </button>
        }))}
        {category==='connections' && cables.map(c=><button className="pt-model pt-cable" key={c.tool} title={t(c.label)} aria-label={t(c.label)} aria-pressed={net.activeTool===c.tool} onMouseEnter={()=>setHovered(c.label)} onFocus={()=>setHovered(c.label)} onClick={()=>{ws.setTool('select');net.setActiveTool(c.tool)}}>{c.tool==='cable-auto'?<CiscoIcon name="connections" size={30}/>:<svg width="32" height="30" viewBox="0 0 32 30" aria-hidden="true"><path d={c.tool.includes('serial')?'M2 22 10 8 19 22 30 8':'M2 15H30'} stroke={c.color} strokeWidth="3" strokeDasharray={c.tool==='cable-crossover'?'6 4':undefined}/></svg>}</button>)}
        {category==='components' && <p className="pt-shelf-message">{t('Open a device’s Physical tab to install or remove modules.')}</p>}
        {category==='custom' && <button className="pt-button" onClick={()=>net.setActiveModal({type:'labs'})}>{t('Open saved practice labs')}</button>}
        {category==='multiuser' && <p className="pt-shelf-message">{t('Multiuser connections are not available.')}</p>}
      </div><div className="pt-device-description">{t(hovered)}</div></div>
      {ws.showPduList && <div className="pt-pdu-window"><div className="pt-scenario-controls"><div><CiscoIcon name="info" size={15}/><select aria-label={t('Scenario')} value={ws.scenario} onChange={e=>useWorkspaceStore.setState({scenario:Number(e.target.value)})}>{ws.scenarios.map(id=><option key={id} value={id}>{t('Scenario')} {id}</option>)}</select></div><div><button className="pt-button" onClick={ws.addScenario}>{t('New')}</button><button className="pt-button" onClick={ws.deleteScenario}>{t('Delete')}</button></div><button className="pt-button" onClick={ws.togglePduList}>{t('Toggle PDU List Window')}</button></div><div className="pt-pdu-table-scroll"><table className="pt-pdu-table"><thead><tr>{['Fire','Last Status','Source','Destination','Type'].map(h=><th key={h}>{t(h)}</th>)}</tr></thead><tbody>{ws.pdus.filter(p=>p.scenario===ws.scenario).length === 0 ? <tr><td colSpan={5} className="text-center py-4 text-slate-500 dark:text-slate-400 italic">{t('No PDUs in this scenario. Press P or use the envelope tool to send a packet.')}</td></tr> : ws.pdus.filter(p=>p.scenario===ws.scenario).map(p=>{
        const pduObj=p.pdu || useNetworkStore.getState().inFlightPackets.find(packet=>packet.pdu.pingId===p.pingId || packet.pdu.payload.udpRequestId===p.udpRequestId || packet.pdu.pendingPacket?.payload.udpRequestId===p.udpRequestId)?.pdu
        const udpResult=net.udpTransactions.find(result=>result.requestId===p.udpRequestId)
        const status=p.protocol==='UDP'?(udpResult?.status==='successful'?'Successful':udpResult?.status==='failed'?'Failed':p.status):p.status
        const reason=udpResult?.reason??p.reason
        return <tr key={p.id} className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors" title={reason??t('Double-click to inspect PDU layers')} onClick={()=>{if(pduObj)net.setActiveModal({type:'pdu',pdu:pduObj});else ws.setStatus(reason??status)}} onDoubleClick={()=>{if(pduObj)net.setActiveModal({type:'pdu',pdu:pduObj});else ws.setStatus(reason??status)}}><td><button title={t('Fire PDU')} aria-label={t('Fire PDU')} onClick={event=>{event.stopPropagation();ws.firePdu(p.sourceId,p.destinationId,p.targetIp,{protocol:p.protocol,port:p.udpPort,data:p.udpData})}}><CiscoIcon name="play" size={12}/></button></td><td>{status==='Successful' ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold"><span>✓</span> {t('Successful')}</span> : status==='In Progress' ? <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping inline-block" /> {t('In Progress')}</span> : <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold"><span>✕</span> {t('Failed')}</span>}{reason&&<small className="block max-w-64 whitespace-normal">{t(reason)}</small>}</td><td dir="ltr">{net.devices.find(device=>device.id===p.sourceId)?.name??t('Removed')}</td><td dir="ltr">{net.devices.find(device=>device.id===p.destinationId)?.name??p.targetIp}</td><td><span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-semibold font-mono text-[9px] border border-amber-300 dark:border-amber-800"><span>✉</span>{p.protocol==='UDP'?t('UDP Echo'):'ICMP'}</span></td></tr>
      })}</tbody></table></div></div>}
    </div>
    {ws.status && <div className="pt-status" role="status"><span>{t(ws.status)}</span><button aria-label="Dismiss status" onClick={()=>ws.setStatus('')}>×</button></div>}
    {net.simulationWarning && <div className="pt-status" role="alert"><span>{net.simulationWarning}</span><button className="pt-button" onClick={net.clearSimulation}>{t('Reset Simulation')}</button></div>}
  </footer>
}
