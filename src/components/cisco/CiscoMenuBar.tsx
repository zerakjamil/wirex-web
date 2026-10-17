'use client'
import { useEffect, useRef, useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore, newWorkspace, saveWorkspace } from '@/store/workspaceStore'
import { generateShareableUrl, exportLabToPktFile } from '@/store/workspacePersistence'
import { useShallow } from 'zustand/react/shallow'
import {useI18n} from '@/i18n/useI18n'
import {useTrainingStore} from '@/store/trainingStore'
import { parseWorkspace } from '@/simulator/workspaceSchema'
export function CiscoMenuBar() {
  const {t}=useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const ws = useWorkspaceStore(); const net = useNetworkStore(useShallow(state => ({
    selectedDeviceId: state.selectedDeviceId, deleteDevice: state.deleteDevice,
    togglePortLabels: state.togglePortLabels, setActiveModal: state.setActiveModal, loadLab: state.loadLab,
  })))
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(null) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(null) }
    document.addEventListener('pointerdown',close); document.addEventListener('keydown',key)
    return () => { document.removeEventListener('pointerdown',close); document.removeEventListener('keydown',key) }
  }, [])
  const menus: Record<string, {label:string; action:()=>void; disabled?:boolean}[]> = {
    File:[
      {label:'New',action:newWorkspace},
      {label:'Open...',action:() => document.getElementById('pt-open-file')?.click()},
      {label:'Save (JSON)',action:saveWorkspace},
      {label:'Export as PKT (Universal)...',action:() => exportLabToPktFile()},
      {label:'Save Checkpoint...',action:() => ws.setDialog('revision')},
      {label:'Share Lab (QR & Link)...',action:() => ws.setDialog('share')},
      {label:'Print...',action:() => window.print()}
    ],
    Edit:[{label:'Undo',action:ws.undo,disabled:!ws.past.length},{label:'Redo',action:ws.redo,disabled:!ws.future.length},{label:'Copy',action:ws.copyDevice,disabled:!net.selectedDeviceId},{label:'Paste',action:ws.pasteDevice,disabled:!ws.clipboard},{label:'Delete selected device',action:() => {if(net.selectedDeviceId)ws.requestDeletion({deviceIds:[net.selectedDeviceId]})},disabled:!net.selectedDeviceId}],
    Options:[{label:'Preferences...',action:() => ws.setDialog('preferences')}],
    View:[{label:'Zoom In',action:() => ws.command('zoom-in')},{label:'Zoom Out',action:() => ws.command('zoom-out')},{label:'Reset Zoom',action:() => ws.command('zoom-reset')},{label:'Fit workspace',action:() => ws.command('fit')},{label:'Port labels',action:net.togglePortLabels}],
    Tools:[
      {label:'Select',action:() => ws.setTool('select')},
      {label:'Exam Revision & Rollbacks...',action:() => ws.setDialog('revision')},
      {label:'Network Doctor (Audit)...',action:() => ws.setDialog('doctor')},
      {label:'Place Note',action:() => ws.setTool('note')},
      {label:'Drawing Palette',action:() => ws.setTool('rect')},
      {label:'Add Simple PDU',action:() => ws.setTool('pdu')}
    ],
    Extensions:[{label:'Extensions availability...',action:() => ws.setDialog('extensions')}],
    Window:[{label:'Logical Workspace',action:() => ws.setView('logical')},{label:'Physical Workspace',action:() => ws.setView('physical')},{label:'PDU List Window',action:ws.togglePduList}],
    Help:[{label:'Training',action:()=>useTrainingStore.getState().openCatalog()},{label:'Contents',action:() => ws.setDialog('help')},{label:'Practice Labs',action:() => net.setActiveModal({type:'labs'})},{label:'Install Desktop App (Offline)...',action:() => ws.setDialog('install')},{label:'About',action:() => ws.setDialog('about')}],
  }
  return <nav ref={root} className="pt-menubar" aria-label="Application menus">{Object.entries(menus).map(([name,items]) => <div className="pt-menu" key={name}>
    <button aria-expanded={open===name} aria-haspopup="menu" onClick={() => setOpen(open===name?null:name)} onKeyDown={e => {if(e.key==='ArrowDown'){e.preventDefault();setOpen(name);requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[role="menu"] button:not(:disabled)')?.focus())}}}>{t(name)}</button>
    {open===name && <div className="pt-menu-popup" role="menu" aria-label={name} onKeyDown={e => {
      if(!['ArrowDown','ArrowUp'].includes(e.key)) return
      e.preventDefault(); const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); const i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()
    }}>{items.map(item => <button role="menuitem" key={item.label} disabled={item.disabled} onClick={() => {item.action();setOpen(null)}}>{t(item.label)}</button>)}</div>}
  </div>)}<input id="pt-open-file" type="file" hidden onChange={async e => {
    const input=e.currentTarget; const file=input.files?.[0]; if(!file)return
    ws.setStatus('Loading network file...')
    try {
      if(file.size > 8*1024*1024) throw new Error('Maximum network file size is 8 MB.')
      let data
      if(/\.(pkt|pka)$/i.test(file.name)) {
        if(!navigator.onLine) throw new Error('PKT conversion requires a connection in the browser edition. Open a JSON backup offline, or use the desktop edition.')
        const response=await fetch('/api/import-pkt',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:await file.arrayBuffer()})
        data=await response.json()
        if(!response.ok) throw new Error(data.error || 'Could not decode this PKT file.')
        data.version = 1
      } else data=JSON.parse(await file.text())
      const validated = parseWorkspace(data)
      if(useTrainingStore.getState().active)useTrainingStore.getState().exit()
      ws.checkpoint();net.loadLab(validated.devices,validated.links,validated.annotations,validated.physical);ws.command('fit-topology')
      useWorkspaceStore.setState({fileName:file.name})
      ws.setStatus(`Opened ${file.name}: ${data.devices.length} devices, ${data.links.length} links.${data.warnings?.length ? ' '+data.warnings.join(' ') : ''}`)
    } catch(error) {ws.setStatus(error instanceof Error ? error.message : 'Could not open the network file.')}
    input.value=''
  }}/></nav>
}
