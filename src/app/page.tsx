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
const CcnaAcademy = dynamic(
  () => import('@/components/academy/CcnaAcademy').then((mod) => mod.CcnaAcademy),
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
import { ClusterAssociationsModal } from '@/components/modals/ClusterAssociationsModal'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { initializeWorkspacePersistence, STORAGE_KEY } from '@/store/workspacePersistence'
import { useActivityStore } from '@/store/activityStore'
import { WelcomeModal } from '@/components/modals/WelcomeModal'
import {TrainingCatalog,TrainingPanel,TrainingDock,ConnectionDiagnostics} from '@/components/cisco/CampusTraining'
import { MidtermMentorHUD } from '@/components/cisco/MidtermMentorHUD'
import { MidtermCliDock } from '@/components/cisco/MidtermCliDock'
import { useMidtermQuestStore } from '@/store/midtermQuestStore'
import {useTrainingStore} from '@/store/trainingStore'
import {initializeLocale,useI18n} from '@/i18n/useI18n'
import {initializeTheme} from '@/store/themeStore'
import { isLoopbackAutomationHost } from '@/store/testHost'
import { initializeAcademy, useAcademyStore } from '@/store/academyStore'

const WELCOME_DISMISSED_KEY = 'wireforge-welcome-dismissed-v1'

export default function Home() {
  const activeModal = useNetworkStore(state => state.activeModal)
  const training=useTrainingStore(s=>s.active),{t}=useI18n()
  const midtermQuest = useMidtermQuestStore(s => s.active)
  const academyOpen=useAcademyStore(s=>s.open)
  const [diagnostics,setDiagnostics]=React.useState(false)
  const [welcomeOpen,setWelcomeOpen]=React.useState(false)
  const [trainingView,setTrainingView]=React.useState<'lesson'|'network'|'cli'>('network')
  const wsDialog = useWorkspaceStore(state => state.dialog)
  const setWsDialog = useWorkspaceStore(state => state.setDialog)
  const topCollapsed = useWorkspaceStore(state => state.topCollapsed)
  const bottomCollapsed = useWorkspaceStore(state => state.bottomCollapsed)
  const toggleTopCollapsed = useWorkspaceStore(state => state.toggleTopCollapsed)
  const toggleBottomCollapsed = useWorkspaceStore(state => state.toggleBottomCollapsed)

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return

      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        toggleTopCollapsed()
      } else if (e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        toggleBottomCollapsed()
      }
    }
    window.addEventListener('keydown', handleGlobalKeys)
    return () => window.removeEventListener('keydown', handleGlobalKeys)
  }, [toggleTopCollapsed, toggleBottomCollapsed])
  // Reapply the saved language when Fast Refresh replaces the locale store.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>initializeLocale(),[initializeLocale])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>initializeTheme(),[initializeTheme])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>initializeAcademy(),[initializeAcademy])
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
  const dismissWelcome = React.useCallback(() => {
    setWelcomeOpen(false)
    try {
      localStorage.setItem(WELCOME_DISMISSED_KEY, '1')
    } catch {
      // Storage can be unavailable in private or restricted browser modes.
    }
  }, [])
  // The persistence effect above has already restored any saved or shared workspace by the
  // time the deferred first-visit check runs, so returning users never see the start chooser.
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      if (useTrainingStore.getState().active || useActivityStore.getState().session) return
      if (useNetworkStore.getState().devices.length > 0) return
      let hasSavedWorkspace = false
      let welcomeDismissed = false
      try {
        hasSavedWorkspace = Boolean(localStorage.getItem(STORAGE_KEY))
        welcomeDismissed = localStorage.getItem(WELCOME_DISMISSED_KEY) === '1'
      } catch {
        // Treat unavailable storage as a first visit.
      }
      if (!hasSavedWorkspace && !welcomeDismissed) setWelcomeOpen(true)
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])
  useEffect(() => {
    if (!welcomeOpen) return
    return useNetworkStore.subscribe((state, previous) => {
      if (state.devices === previous.devices || state.devices.length === 0) return
      dismissWelcome()
    })
  }, [welcomeOpen, dismissWelcome])

  return (
    <main className="pt-app">
      {!topCollapsed ? (
        <header className="pt-top-chrome">
          <CiscoTitleBar onDiagnose={training ? undefined : () => setDiagnostics(!diagnostics)} />
          <CiscoMenuBar />
          <CiscoMainToolbar />
          <CiscoRightPalette />
          <CiscoWorkspaceHeader />
          <div className="pt-collapse-strip pt-collapse-strip-top">
            <button
              type="button"
              onClick={toggleTopCollapsed}
              className="pt-collapse-toggle-btn"
              title="Collapse top toolbar and menus (Alt+T)"
              aria-label="Collapse top toolbars"
            >
              <span className="pt-collapse-arrow">▲</span>
              <span>Collapse Top Controls</span>
            </button>
          </div>
        </header>
      ) : (
        <div className="pt-collapsed-bar pt-collapsed-bar-top">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="pt-collapsed-title">wireX · Focus Mode</span>
          </div>
          <button
            type="button"
            onClick={toggleTopCollapsed}
            className="pt-collapse-toggle-btn is-collapsed"
            title="Expand top toolbar and menus (Alt+T)"
            aria-label="Expand top toolbars"
          >
            <span className="pt-collapse-arrow">▼</span>
            <span>Show Top Controls</span>
          </button>
        </div>
      )}

      {training && (
        <nav className="pt-training-mobile-tabs" aria-label={t('Training')}>
          {(['lesson', 'network', 'cli'] as const).map(view => (
            <button key={view} aria-pressed={trainingView === view} onClick={() => setTrainingView(view)}>
              {t(view === 'lesson' ? 'Lesson' : view === 'network' ? 'Network' : 'CLI')}
            </button>
          ))}
        </nav>
      )}

      <div className="pt-canvas-area" data-training-view={training ? trainingView : midtermQuest ? 'quest' : undefined}>
        {midtermQuest ? <MidtermMentorHUD /> : training ? <TrainingPanel /> : <DeviceNavigator />}
        <div className="pt-topology-container"><TopologyCanvas /></div>
        {midtermQuest ? <MidtermCliDock /> : training ? <TrainingDock /> : diagnostics && <aside className="pt-network-doctor"><ConnectionDiagnostics onClose={() => setDiagnostics(false)} /></aside>}
      </div>

      {!bottomCollapsed ? (
        <div className="pt-bottom-section">
          <div className="pt-collapse-strip pt-collapse-strip-bottom">
            <button
              type="button"
              onClick={toggleBottomCollapsed}
              className="pt-collapse-toggle-btn"
              title="Collapse device shelf and simulation bar (Alt+B)"
              aria-label="Collapse device shelf"
            >
              <span className="pt-collapse-arrow">▼</span>
              <span>Collapse Device Shelf</span>
            </button>
          </div>
          <CiscoBottomBar />
        </div>
      ) : (
        <div className="pt-collapsed-bar pt-collapsed-bar-bottom">
          <span className="pt-collapsed-title">Device Shelf & Simulation Dock</span>
          <button
            type="button"
            onClick={toggleBottomCollapsed}
            className="pt-collapse-toggle-btn is-collapsed"
            title="Expand device shelf and simulation bar (Alt+B)"
            aria-label="Expand device shelf"
          >
            <span className="pt-collapse-arrow">▲</span>
            <span>Show Device Shelf</span>
          </button>
        </div>
      )}
      <WorkspaceDialog />
      <TrainingCatalog/>
      {academyOpen && <CcnaAcademy/>}
      {welcomeOpen && <WelcomeModal onDismiss={dismissWelcome} />}

      <DeviceWindows />
      {activeModal?.type === 'port-select' && <PortSelectModal />}
      {activeModal?.type === 'pdu' && <PduDetailsModal />}
      {activeModal?.type === 'labs' && <SampleLabsModal />}
      {activeModal?.type === 'activity-wizard' && <ActivityWizardModal />}
      <ActivityWorkspace />
      <NetworkDoctorModal />
      <ShareLabModal />
      <ExamRevisionModal isOpen={wsDialog === 'revision'} onClose={() => setWsDialog(null)} />
      <ClusterAssociationsModal />
    </main>
  )
}
