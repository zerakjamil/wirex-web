'use client'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { CiscoIcon } from './CiscoIcon'
import {useI18n} from '@/i18n/useI18n'
export function CiscoWorkspaceHeader() {
  const {t}=useI18n()
  const ws=useWorkspaceStore()
  return <div className="pt-workspace-header">
    <div className="pt-workspace-tabs" role="tablist" aria-label="Workspace">
      <button role="tab" aria-selected={ws.view==='logical'} onClick={() => ws.setView('logical')}><CiscoIcon name="logical" size={18}/>{t('Logical')}</button>
      <button role="tab" aria-selected={ws.view==='physical'} onClick={() => ws.setView('physical')}><CiscoIcon name="physical" size={18}/>{t('Physical')}</button>
    </div>
    <div className="pt-workspace-actions"><span>{ws.view==='logical'?t('[Root]'):t('[Main Wiring Closet]')}</span>
      <button title={t('Return to Logical workspace')} aria-label={t('Return to Logical workspace')} onClick={() => {ws.setView('logical');ws.command('fit')}}><CiscoIcon name="back"/></button>
      <button title={t('New cluster zone')} aria-label={t('New cluster zone')} onClick={() => {ws.setView('logical');ws.setTool('rect')}}><CiscoIcon name="cluster"/></button>
      <button title={t('Move workspace')} aria-label={t('Move workspace')} onClick={() => ws.setTool('pan')}><CiscoIcon name="move"/></button>
      <button title={t('Toggle workspace grid')} aria-label={t('Toggle workspace grid')} aria-pressed={ws.showGrid} onClick={ws.toggleGrid}><CiscoIcon name="background"/></button>
      <button title={t('Fit workspace')} aria-label={t('Fit workspace')} onClick={() => ws.command('fit')}><CiscoIcon name="fit"/></button>
      <button title={t('Network Doctor: Topology Diagnostics')} aria-label={t('Network Doctor: Topology Diagnostics')} onClick={() => ws.setDialog('doctor')}><CiscoIcon name="inspect"/></button>
      <button title={t('Share Lab: QR Code & Link')} aria-label={t('Share Lab: QR Code & Link')} onClick={() => ws.setDialog('share')}><CiscoIcon name="network"/></button>
    </div>
  </div>
}
