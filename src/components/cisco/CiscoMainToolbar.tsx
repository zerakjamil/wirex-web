'use client'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore, newWorkspace, saveWorkspace } from '@/store/workspaceStore'
import { CiscoIcon, type IconName } from './CiscoIcon'
import { useShallow } from 'zustand/react/shallow'
import {useI18n} from '@/i18n/useI18n'
export function CiscoMainToolbar() {
  const {t}=useI18n()
  const ws = useWorkspaceStore()
  const net = useNetworkStore(useShallow(state => ({ selectedDeviceId: state.selectedDeviceId })))
  const controls: {icon: IconName; title: string; action: () => void; disabled?: boolean}[] = [
    {icon:'new', title:'New (Ctrl+N)', action:newWorkspace},
    {icon:'open', title:'Open (Ctrl+O)', action:() => document.getElementById('pt-open-file')?.click()},
    {icon:'save', title:'Save (Ctrl+S)', action:saveWorkspace},
    {icon:'print', title:'Print', action:() => window.print()},
    {icon:'info', title:'Network information', action:() => ws.setDialog('about')},
    {icon:'user', title:'Multiuser', action:() => ws.setDialog('extensions')},
    {icon:'activity', title:'Activity Wizard', action:() => ws.setDialog('activity')},
    {icon:'copy', title:'Copy selected device', action:ws.copyDevice, disabled:!net.selectedDeviceId},
    {icon:'paste', title:'Paste device', action:ws.pasteDevice, disabled:!ws.clipboard},
    {icon:'undo', title:'Undo (Ctrl+Z)', action:ws.undo, disabled:!ws.past.length},
    {icon:'redo', title:'Redo (Ctrl+Shift+Z)', action:ws.redo, disabled:!ws.future.length},
    {icon:'zoom-in', title:'Zoom In', action:() => ws.command('zoom-in')},
    {icon:'zoom-reset', title:'Reset Zoom', action:() => ws.command('zoom-reset')},
    {icon:'zoom-out', title:'Zoom Out', action:() => ws.command('zoom-out')},
    {icon:'fit', title:'Fit workspace', action:() => ws.command('fit')},
    {icon:'list', title:'Toggle PDU List Window', action:ws.togglePduList},
    {icon:'rack', title:'Physical workspace', action:() => ws.setView(ws.view === 'logical' ? 'physical' : 'logical')},
  ]
  return <div className="pt-main-toolbar" role="toolbar" aria-label="Main toolbar">
    <div className="pt-toolbar-scroll">{controls.map(c => <button key={c.title} className="pt-icon-button" title={t(c.title)} aria-label={t(c.title)} onClick={c.action} disabled={c.disabled}><CiscoIcon name={c.icon}/></button>)}</div>
    <button className="pt-icon-button pt-help-button" title={t('Help')} aria-label={t('Help')} onClick={() => ws.setDialog('help')}>?</button>
  </div>
}
