'use client'

import React, { useEffect } from 'react'
import { CiscoTitleBar } from '@/components/cisco/CiscoTitleBar'
import { CiscoMenuBar } from '@/components/cisco/CiscoMenuBar'
import { CiscoMainToolbar } from '@/components/cisco/CiscoMainToolbar'
import { CiscoRightPalette } from '@/components/cisco/CiscoRightPalette'
import { WorkspaceDialog } from '@/components/cisco/WorkspaceDialog'
import dynamic from 'next/dynamic'
import { CiscoWorkspaceHeader } from '@/components/cisco/CiscoWorkspaceHeader'
const TopologyCanvas = dynamic(
  () => import('@/components/canvas/TopologyCanvas').then((mod) => mod.TopologyCanvas),
  { ssr: false }
)
import { CiscoBottomBar } from '@/components/cisco/CiscoBottomBar'
import { DeviceWindows } from '@/components/modals/DeviceWindows'
import { DeviceNavigator } from '@/components/cisco/DeviceNavigator'
import { PortSelectModal } from '@/components/modals/PortSelectModal'
import { PduDetailsModal } from '@/components/modals/PduDetailsModal'
import { SampleLabsModal } from '@/components/modals/SampleLabsModal'
import { ActivityWizardModal } from '@/components/modals/ActivityWizardModal'
import { ActivityWorkspace } from '@/components/cisco/ActivityWorkspace'
import { NetworkDoctorModal } from '@/components/modals/NetworkDoctorModal'
import { ShareLabModal } from '@/components/modals/ShareLabModal'
import { ExamRevisionModal } from '@/components/modals/ExamRevisionModal'
import { DesktopInstallModal } from '@/components/modals/DesktopInstallModal'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { initializeWorkspacePersistence, useWorkspacePersistence } from '@/store/workspacePersistence'
import {TrainingCatalog,TrainingPanel,TrainingDock,ConnectionDiagnostics} from '@/components/cisco/CampusTraining'
import {useTrainingStore} from '@/store/trainingStore'
import {initializeLocale,useI18n} from '@/i18n/useI18n'
import {initializeTheme} from '@/store/themeStore'
import { isLoopbackAutomationHost } from '@/store/testHost'

export default function Home() {
  const activeModal = useNetworkStore(state => state.activeModal)
  const ready=useWorkspacePersistence(state=>state.ready)
  const training=useTrainingStore(s=>s.active),{t}=useI18n()
  const [diagnostics,setDiagnostics]=React.useState(false)
  const [trainingView,setTrainingView]=React.useState<'lesson'|'network'|'cli'>('network')
  const wsDialog = useWorkspaceStore(state => state.dialog)
  const setWsDialog = useWorkspaceStore(state => state.setDialog)
  // Reapply the saved language when Fast Refresh replaces the locale store.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>initializeLocale(),[initializeLocale])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>initializeTheme(),[initializeTheme])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>initializeWorkspacePersistence(),[initializeWorkspacePersistence])
  useEffect(() => {
    if (!isLoopbackAutomationHost(window.location.hostname)) return
    const automationWindow = window as Window & { __NET_STORE__?: typeof useNetworkStore }
    automationWindow.__NET_STORE__ = useNetworkStore
    return () => {
      delete automationWindow.__NET_STORE__
    }
  }, [])

  return (
    <main className="pt-app">
      <CiscoTitleBar onDiagnose={training?undefined:()=>setDiagnostics(!diagnostics)} />

      <CiscoMenuBar />

      <CiscoMainToolbar />
      <CiscoRightPalette />

      <CiscoWorkspaceHeader />

      {training&&<nav className="pt-training-mobile-tabs" aria-label={t('Training')}>{(['lesson','network','cli'] as const).map(view=><button key={view} aria-pressed={trainingView===view} onClick={()=>setTrainingView(view)}>{t(view==='lesson'?'Lesson':view==='network'?'Network':'CLI')}</button>)}</nav>}
      <div className="pt-canvas-area" data-training-view={training?trainingView:undefined}>
        {training?<TrainingPanel/>:<DeviceNavigator />}
        <div className="pt-topology-container"><TopologyCanvas /></div>
        {training?<TrainingDock/>:diagnostics&&<aside className="pt-network-doctor"><ConnectionDiagnostics onClose={()=>setDiagnostics(false)}/></aside>}
      </div>

      <CiscoBottomBar />
      <WorkspaceDialog />
      <TrainingCatalog/>

      <DeviceWindows />
      {activeModal?.type === 'port-select' && <PortSelectModal />}
      {activeModal?.type === 'pdu' && <PduDetailsModal />}
      {activeModal?.type === 'labs' && <SampleLabsModal />}
      {activeModal?.type === 'activity-wizard' && <ActivityWizardModal />}
      <ActivityWorkspace />
      <NetworkDoctorModal />
      <ShareLabModal />
      <ExamRevisionModal isOpen={wsDialog === 'revision'} onClose={() => setWsDialog(null)} />
      <DesktopInstallModal isOpen={wsDialog === 'install'} onClose={() => setWsDialog(null)} />
    </main>
  )
}
