import { create } from 'zustand'
import { useNetworkStore } from './networkStore'
import { useWorkspaceStore } from './workspaceStore'
import {
  buildResultsDocument, deriveInitialNetwork, evaluateActivityItems, parseActivity,
  type ActivityCheck, type AssessmentActivity,
} from '@/simulator/activity'
import type { NetworkAnnotation, NetworkDevice, NetworkLink, DeviceWindow } from '@/types/network'
import { stripRoutingRuntime } from '@/simulator/routingRuntime'

export interface ActivityBackup {
  devices: NetworkDevice[]
  links: NetworkLink[]
  annotations: NetworkAnnotation[]
  deviceWindows: DeviceWindow[]
  fileName: string
}

export interface ActivitySession {
  activity: AssessmentActivity
  backup: ActivityBackup
  checks: ActivityCheck[] | null
  checkedAt: string | null
}

interface ActivityStore {
  session: ActivitySession | null
  error: string | null
  start: (activity: AssessmentActivity) => void
  loadFromFile: (text: string) => boolean
  check: () => void
  reset: () => void
  exit: () => void
  dismissError: () => void
  resultsJson: () => string | null
}

export const useActivityStore = create<ActivityStore>((set, get) => ({
  session: null,
  error: null,
  start: (activity) => {
    const net = useNetworkStore.getState()
    const backup = get().session?.backup ?? structuredClone({
      devices: net.devices, links: net.links, annotations: net.annotations,
      deviceWindows: net.deviceWindows, fileName: useWorkspaceStore.getState().fileName,
    })
    const initial = deriveInitialNetwork(activity)
    set({ session: { activity, backup, checks: null, checkedAt: null }, error: null })
    net.loadLab(initial.devices, initial.links, initial.annotations)
    useNetworkStore.setState({ deviceWindows: [], commandEvents: [] })
    useWorkspaceStore.setState({ past: [], future: [], fileName: '', dialog: null })
    useWorkspaceStore.getState().setTool('select')
    useWorkspaceStore.getState().command('fit-topology')
  },
  loadFromFile: (text) => {
    if (text.length > 16 * 1024 * 1024) {
      set({ error: 'Activity files larger than 16 MB are not supported.' })
      return false
    }
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      set({ error: 'This file is not a valid wireX activity file.' })
      return false
    }
    try {
      const activity = parseActivity(data)
      get().start(activity)
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'This file is not a valid wireX activity file.' })
      return false
    }
  },
  check: () => {
    const session = get().session
    if (!session) return
    const checks = evaluateActivityItems(useNetworkStore.getState().devices, session.activity.items)
    set({ session: { ...session, checks, checkedAt: new Date().toISOString() } })
  },
  reset: () => {
    const session = get().session
    if (!session) return
    const initial = deriveInitialNetwork(session.activity)
    useNetworkStore.getState().loadLab(initial.devices, initial.links, initial.annotations)
    useNetworkStore.setState({ deviceWindows: [], commandEvents: [] })
    useWorkspaceStore.setState({ past: [], future: [], fileName: '' })
    useWorkspaceStore.getState().setTool('select')
    useWorkspaceStore.getState().command('fit-topology')
    set({ session: { ...session, checks: null, checkedAt: null } })
  },
  exit: () => {
    const session = get().session
    if (!session) return
    set({ session: null, error: null })
    const backup = session.backup
    useNetworkStore.getState().loadLab(backup.devices, backup.links, backup.annotations)
    useNetworkStore.setState({ deviceWindows: backup.deviceWindows, commandEvents: [] })
    useWorkspaceStore.setState({ fileName: backup.fileName, past: [], future: [] })
    useWorkspaceStore.getState().setTool('select')
    useWorkspaceStore.getState().command('fit-topology')
  },
  dismissError: () => set({ error: null }),
  resultsJson: () => {
    const session = get().session
    if (!session?.checks || !session.checkedAt) return null
    return buildResultsDocument(session.activity, session.checks, session.checkedAt)
  },
}))

export const ACTIVITY_STORAGE_KEY = 'wireforge-activity-v1'
type ActivityStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }

export function saveActivityToStorage(storage: ActivityStorage) {
  try {
    const session = useActivityStore.getState().session
    let payload: unknown = { version: 1, session: null }
    if (session) {
      const net = useNetworkStore.getState()
      payload = {
        version: 1,
        session: {
          activity: session.activity,
          checks: session.checks,
          checkedAt: session.checkedAt,
          backup: { ...session.backup, devices: stripRoutingRuntime(session.backup.devices) },
          lab: { devices: stripRoutingRuntime(net.devices), links: net.links, annotations: net.annotations },
        },
      }
    }
    storage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function restoreActivityFromStorage(storage: ActivityStorage) {
  try {
    const raw = storage.getItem(ACTIVITY_STORAGE_KEY)
    if (!raw || raw.length > 32 * 1024 * 1024) return false
    const saved = JSON.parse(raw)
    if (!saved || saved.version !== 1) return false
    if (saved.session === null || saved.session === undefined) {
      useActivityStore.setState({ session: null, error: null })
      return false
    }
    const session = saved.session
    const validNetwork = (lab: unknown) => {
      if (!lab || typeof lab !== 'object') return false
      const entry = lab as ActivityBackup
      if (!Array.isArray(entry.devices) || entry.devices.length > 2000 || !Array.isArray(entry.links) || !Array.isArray(entry.annotations)) return false
      return entry.devices.every(d => d && typeof d.id === 'string' && d.config && Array.isArray(d.ports) && Array.isArray(d.routingTable) && Array.isArray(d.arpTable) && Array.isArray(d.macTable) && Number.isFinite(d.x) && Number.isFinite(d.y))
    }
    const activity = parseActivity(session.activity)
    if (!validNetwork(session.backup)) return false
    const backup: ActivityBackup = {
      devices: session.backup.devices, links: session.backup.links, annotations: session.backup.annotations,
      deviceWindows: Array.isArray(session.backup.deviceWindows) ? session.backup.deviceWindows : [], fileName: typeof session.backup.fileName === 'string' ? session.backup.fileName : '',
    }
    const itemIds = new Set(activity.items.map(item => item.id))
    let checks: ActivityCheck[] | null = null
    if (Array.isArray(session.checks)) {
      checks = session.checks.filter((entry: unknown): entry is ActivityCheck => {
        if (!entry || typeof entry !== 'object') return false
        const check = entry as ActivityCheck
        return typeof check.id === 'string' && itemIds.has(check.id) && (check.status === 'successful' || check.status === 'failed') && typeof check.observed === 'string' && check.observed.length <= 200
      })
    }
    const checkedAt = typeof session.checkedAt === 'string' && session.checkedAt.length <= 64 ? session.checkedAt : null
    const lab = validNetwork(session.lab) ? session.lab : deriveInitialNetwork(activity)
    useActivityStore.setState({ session: { activity, backup, checks, checkedAt }, error: null })
    useNetworkStore.getState().loadLab(lab.devices, lab.links, lab.annotations)
    useNetworkStore.setState({ deviceWindows: [], commandEvents: [] })
    useWorkspaceStore.setState({ fileName: '', past: [], future: [] })
    useWorkspaceStore.getState().command('fit-topology')
    return true
  } catch {
    return false
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { __wireforgeActivityStore: typeof useActivityStore }).__wireforgeActivityStore = useActivityStore
}
