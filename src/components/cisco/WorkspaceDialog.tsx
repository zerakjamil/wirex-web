'use client'
import { useEffect, useRef, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useNetworkStore } from '@/store/networkStore'
import { useShallow } from 'zustand/react/shallow'
import {useI18n} from '@/i18n/useI18n'
export function WorkspaceDialog() {
  const {t}=useI18n()
  const [complexProtocol,setComplexProtocol]=useState<'ICMP'|'UDP'>('ICMP')
  const ws=useWorkspaceStore();const net=useNetworkStore(useShallow(state => ({ devices: state.devices, links: state.links, showPortLabels: state.showPortLabels, togglePortLabels: state.togglePortLabels, setActiveModal: state.setActiveModal })));const ref=useRef<HTMLDialogElement>(null)
  const handledDialogs = ['delete-device', 'note', 'help', 'about', 'preferences', 'activity', 'extensions', 'complex-pdu', 'pdu-error']
  const isHandled = !!(ws.dialog && handledDialogs.includes(ws.dialog))

  useEffect(() => {
    if (isHandled) ref.current?.showModal()
    else ref.current?.close()
  }, [isHandled])

  const titles: Record<string, string> = {
    help: 'wireX Help',
    about: 'About wireX',
    preferences: 'Preferences',
    activity: 'Activity Wizard',
    extensions: 'Extensions',
    'complex-pdu': 'Create Complex PDU',
    'pdu-error': 'Cannot send packet',
    'delete-device': 'Delete Device',
    note: ws.noteDraft?.annotationId ? 'Edit Note' : 'Place Note',
  }

  if (!isHandled) return null
  return <dialog ref={ref} className="pt-dialog" onCancel={() => ws.setDialog(null)} onClick={e => {if(e.target===e.currentTarget)ws.setDialog(null)}}>
    <div className="pt-dialog-title"><strong>{ws.dialog && titles[ws.dialog] ? t(titles[ws.dialog]) : ''}</strong><button aria-label={t('Close')} onClick={() => ws.setDialog(null)}>×</button></div>
    <div className="pt-dialog-body">
      {ws.dialog==='pdu-error' && ws.pduError && <div role="alert">
        <p><strong><bdi>{net.devices.find(d=>d.id===ws.pduError?.deviceId)?.name}</bdi></strong>: {t(ws.pduError.message)}</p>
        <p>{t('Open Desktop > IP Configuration and obtain a DHCP lease or enter a valid IPv4 address and subnet mask. For routers, use Config or CLI.')}</p>
        <button className="pt-button" autoFocus onClick={()=>{
          const id=ws.pduError?.deviceId
          ws.setDialog(null)
          if(id){useNetworkStore.getState().setActiveTab('config');net.setActiveModal({type:'device',deviceId:id})}
        }}>{t('Open device settings')}</button>
      </div>}
      {ws.dialog==='delete-device' && <><p>{t('Delete these devices?')} <bdi>{ws.pendingDeletion?.deviceIds?.map(id=>net.devices.find(device=>device.id===id)?.name).filter(Boolean).join(', ')}</bdi></p><p>{t('The device configuration and its connected cables will be removed.')}</p><div className="pt-dialog-actions"><button className="pt-button" autoFocus onClick={()=>ws.setDialog(null)}>{t('Cancel')}</button><button className="pt-button" onClick={ws.confirmDeletion}>{t('Delete')}</button></div></>}
      {ws.dialog==='note' && <form className="pt-note-form" onSubmit={event=>{event.preventDefault();ws.saveNote(String(new FormData(event.currentTarget).get('text') || ''))}}><label htmlFor="pt-note-text">{t('Label text')}</label><textarea id="pt-note-text" name="text" autoFocus required defaultValue={ws.noteDraft?.text || ''} onKeyDown={event=>{if((event.ctrlKey || event.metaKey) && event.key==='Enter'){event.preventDefault();event.currentTarget.form?.requestSubmit()}}}/><div className="pt-dialog-actions"><button className="pt-button" type="button" onClick={()=>ws.setDialog(null)}>{t('Cancel')}</button><button className="pt-button" type="submit">{t('Save')}</button></div></form>}
      {ws.dialog==='help' && <><p>{t('Select a category in the device box, then select a model to add it. Drag devices to position them.')}</p><p>{t('Choose Connections, select a cable, then click the source and destination devices. Double-click a device, or focus it and press Enter, to open Physical, Config, CLI, and Desktop.')}</p><p>{t('Use Simple PDU to send an ICMP test. Simulation mode lets you pause and advance packets. Ctrl+S saves a JSON export, Ctrl+O opens PKT, PKA, or JSON files, Ctrl+Z undoes a workspace edit.')}</p><p>{t('PKT import restores devices, cables, positions, supported interface settings, and original configurations. Check import messages for unsupported devices and protocols. Imported Config displays the original commands; importing a command does not add its protocol to the simulator.')}</p></>}
      {ws.dialog==='about' && <><p>{t('wireX is an independent browser-native network simulator and interactive training environment.')}</p><p>{net.devices.length} {t('devices,')} {net.links.length} {t('links in this network.')}</p><p>{t('Built for zero-install network design and CCNA lab practice.')}</p></>}
      {ws.dialog==='preferences' && <><label><input type="checkbox" checked={ws.showGrid} onChange={ws.toggleGrid}/> {t('Show workspace grid')}</label><label><input type="checkbox" checked={net.showPortLabels} onChange={net.togglePortLabels}/> {t('Show port labels')}</label><label><input type="checkbox" checked={ws.showPduList} onChange={ws.togglePduList}/> {t('Show PDU list window')}</label></>}
      {ws.dialog==='activity' && <><p>{t('Derive a graded activity from the current answer network, then save the activity file for a student.')}</p><button className="pt-button" onClick={() => {ws.setDialog(null);net.setActiveModal({type:'activity-wizard'})}}>{t('Open Activity Wizard')}</button></>}
      {ws.dialog==='extensions' && <p>{t('Multiuser connections and external extensions are not available in this web simulator.')}</p>}
      {ws.dialog==='complex-pdu' && <form onSubmit={event => {
        event.preventDefault()
        const formData=new FormData(event.currentTarget)
        const targetIp=String(formData.get('targetIp') || '')
        const protocol=String(formData.get('protocol') || 'ICMP') as 'ICMP'|'UDP'
        const port=Number(formData.get('port') || 7)
        const data=String(formData.get('data') || '')
        const source=ws.pduSource,destination=ws.pduDestination
        ws.setDialog(null);ws.setTool('select')
        if(source && destination)ws.firePdu(source,destination,targetIp,{protocol,port,data})
      }} className="pt-pdu-form">
        <p>{t('Source')}: {net.devices.find(d=>d.id===ws.pduSource)?.name}</p>
        <p>{t('Destination')}: {net.devices.find(d=>d.id===ws.pduDestination)?.name}</p>
        <label>{t('Protocol')} <select name="protocol" value={complexProtocol} onChange={event=>setComplexProtocol(event.target.value as 'ICMP'|'UDP')}><option value="ICMP">{t('ICMP Echo')}</option><option value="UDP">{t('UDP Echo')}</option></select></label>
        <label>{t('Destination IP')} <input name="targetIp" aria-label={t('Destination IP')} defaultValue={net.devices.find(d=>d.id===ws.pduDestination)?.ports.find(p=>p.ipAddress)?.ipAddress || ''} required pattern={'(?:[0-9]{1,3}\\.){3}[0-9]{1,3}'}/></label>
        {complexProtocol==='UDP' && <>
          <label>{t('UDP destination port')} <input name="port" aria-label={t('UDP destination port')} type="number" min={1} max={65535} defaultValue={7} required /></label>
          <label>{t('UDP Echo payload')} <textarea name="data" aria-label={t('UDP Echo payload')} maxLength={65507} defaultValue="wireX UDP Echo test" rows={3} required /></label>
          <p>{t('The destination server must have UDP Echo enabled and listen on this port.')}</p>
        </>}
        <button className="pt-button" type="submit">{t('Create PDU')}</button>
      </form>}
    </div>{ws.dialog!=='note' && ws.dialog!=='delete-device' && <div className="pt-dialog-footer"><button className="pt-button" onClick={() => ws.setDialog(null)}>{t('Close')}</button></div>}
  </dialog>
}
