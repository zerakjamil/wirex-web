'use client'
import { Fragment } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { CiscoIcon, type IconName } from './CiscoIcon'
import {useI18n} from '@/i18n/useI18n'
import { allowedChildKinds, containerById } from '@/simulator/physical'
import type { PhysicalContainerKind } from '@/types/network'

const CREATE_KEYS: Record<PhysicalContainerKind, string> = {
  city: 'New City',
  building: 'New Building',
  closet: 'New Wiring Closet',
  rack: 'New Rack',
  table: 'New Table',
  shelf: 'New Inventory Shelf',
  pegboard: 'New Cable Pegboard',
  generic: 'New Generic Container',
}
const CREATE_SHORTCUTS: Partial<Record<PhysicalContainerKind, string>> = { city: 'Shift+C', building: 'Shift+B', closet: 'Shift+J', generic: 'Shift+F' }
const KIND_ICONS: Record<PhysicalContainerKind, IconName> = { city: 'city', building: 'building', closet: 'physical', rack: 'rack', table: 'table', shelf: 'rack', pegboard: 'connections', generic: 'folder' }

export function CiscoWorkspaceHeader() {
  const {t}=useI18n()
  const ws=useWorkspaceStore()
  const containers=useNetworkStore(state=>state.physicalContainers)
  const clusters=useNetworkStore(state=>state.clusters)
  const physicalPath=ws.view==='physical'?ws.physicalPath.filter(id=>containerById(containers,id)):[]
  const currentContainer=physicalPath.length?containerById(containers,physicalPath[physicalPath.length-1]) ?? null:null
  const activeCluster=ws.activeClusterId?clusters.find(cluster=>cluster.id===ws.activeClusterId) ?? null:null
  const backDisabled=ws.view==='physical'?physicalPath.length===0:!activeCluster
  return <div className="pt-workspace-header">
    <div className="pt-workspace-tabs" role="tablist" aria-label="Workspace">
      <button role="tab" aria-selected={ws.view==='logical'} onClick={() => ws.setView('logical')}><CiscoIcon name="logical" size={18}/>{t('Logical')}</button>
      <button role="tab" aria-selected={ws.view==='physical'} onClick={() => ws.setView('physical')}><CiscoIcon name="physical" size={18}/>{t('Physical')}</button>
    </div>
    <div className="pt-workspace-path" aria-label={t('Workspace path')}>
      {ws.view==='logical' ? <>
        <button type="button" className="pt-path-segment" onClick={() => ws.exitCluster()}>{t('[Root]')}</button>
        {activeCluster && <><span className="pt-path-sep" aria-hidden="true">›</span><span className="pt-path-segment pt-path-current">[{activeCluster.name}]</span></>}
      </> : <>
        <button type="button" className="pt-path-segment" onClick={() => ws.setPhysicalPath([])}>{t('Intercity')}</button>
        {physicalPath.map((id,index) => {
          const container=containerById(containers,id)
          if(!container)return null
          return <Fragment key={id}><span className="pt-path-sep" aria-hidden="true">›</span>
            <button type="button" className={`pt-path-segment ${index===physicalPath.length-1?'pt-path-current':''}`} onClick={() => ws.setPhysicalPath(physicalPath.slice(0,index+1))}>[{container.name}]</button></Fragment>
        })}
      </>}
    </div>
    <div className="pt-workspace-actions">
      <button title={t('Back')} aria-label={t('Back')} disabled={backDisabled} onClick={() => ws.pathBack()}><CiscoIcon name="back"/></button>
      {ws.view==='logical' && !activeCluster && <button title={t('Create New Cluster (Shift+U)')} aria-label={t('Create New Cluster')} onClick={() => ws.createClusterFromSelection()}><CiscoIcon name="cluster"/></button>}
      {ws.view==='logical' && activeCluster && <>
        <input className="pt-header-name-input" aria-label={t('Cluster Name')} value={activeCluster.name} onFocus={() => ws.checkpoint()} onChange={event => ws.renameActiveCluster(event.target.value)} />
        <button title={t('Disband Cluster')} aria-label={t('Disband Cluster')} onClick={() => ws.disbandActiveCluster()}><CiscoIcon name="delete"/></button>
      </>}
      {ws.view==='physical' && <>
        {currentContainer && <>
          <input className="pt-header-name-input" aria-label={t('Container name')} value={currentContainer.name} onFocus={() => ws.checkpoint()} onChange={event => useNetworkStore.getState().renamePhysicalContainer(currentContainer.id,event.target.value)} />
          <button title={t('Delete Container')} aria-label={t('Delete Container')} onClick={() => ws.deleteActivePhysicalContainer()}><CiscoIcon name="delete"/></button>
        </>}
        {allowedChildKinds(currentContainer?.kind ?? null).map(kind => <button key={kind} title={`${t(CREATE_KEYS[kind])}${CREATE_SHORTCUTS[kind] ? ` (${CREATE_SHORTCUTS[kind]})` : ''}`} aria-label={t(CREATE_KEYS[kind])} onClick={() => ws.createPhysicalContainer(kind)}><CiscoIcon name={KIND_ICONS[kind]}/></button>)}
      </>}
      <button title={t('Move workspace')} aria-label={t('Move workspace')} onClick={() => ws.setTool('pan')}><CiscoIcon name="move"/></button>
      <button title={t('Toggle workspace grid')} aria-label={t('Toggle workspace grid')} aria-pressed={ws.showGrid} onClick={ws.toggleGrid}><CiscoIcon name="background"/></button>
      <button title={t('Fit workspace')} aria-label={t('Fit workspace')} onClick={() => ws.command('fit')}><CiscoIcon name="fit"/></button>
      <button title={t('Network Doctor: Topology Diagnostics')} aria-label={t('Network Doctor: Topology Diagnostics')} onClick={() => ws.setDialog('doctor')}><CiscoIcon name="inspect"/></button>
      <button title={t('Share Lab: QR Code & Link')} aria-label={t('Share Lab: QR Code & Link')} onClick={() => ws.setDialog('share')}><CiscoIcon name="network"/></button>
    </div>
  </div>
}
