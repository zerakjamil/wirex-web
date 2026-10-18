import { create } from 'zustand'
import { useNetworkStore } from './networkStore'
import { useWorkspaceStore } from './workspaceStore'
import type { NetworkDevice, DeviceWindow } from '@/types/network'
import { useTrainingStore, saveTrainingToStorage, restoreTrainingFromStorage } from './trainingStore'
import { useActivityStore, saveActivityToStorage, restoreActivityFromStorage } from './activityStore'
import { parseWorkspace } from '@/simulator/workspaceSchema'
import { stripRoutingRuntime } from '@/simulator/routingRuntime'

export const STORAGE_KEY = 'wireforge-workspace-v1'
type WorkspaceStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }
export const useWorkspacePersistence = create<{ ready: boolean }>(() => ({ ready: true }))

export function saveWorkspaceToStorage(storage: WorkspaceStorage): boolean {
  try {
    const training = useTrainingStore.getState()
    const activity = useActivityStore.getState()
    const snapshot = training.active && training.backup
      ? training.backup
      : activity.session
        ? activity.session.backup
        : { ...useNetworkStore.getState(), fileName: useWorkspaceStore.getState().fileName }
    const { devices, links, annotations, deviceWindows, fileName } = snapshot
    // Physical layout is saved with the live workspace; while a training backup or activity
    // backup is active the saved devices differ from the live ones, so the layout is omitted
    // to avoid dangling references.
    const live = useNetworkStore.getState()
    const sandboxed = (training.active && training.backup) || activity.session
    const physical = !sandboxed
      ? { containers: live.physicalContainers, assignment: live.physicalAssignment, clusters: live.clusters }
      : undefined
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, devices: stripRoutingRuntime(devices), links, annotations, deviceWindows, fileName, physical }))
    return true
  } catch {
    return false
  }
}

export function restoreWorkspaceFromStorage(storage: WorkspaceStorage, restoreWindows = true): boolean {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw || raw.length > 32 * 1024 * 1024) return false
    const saved = parseWorkspace(JSON.parse(raw))
    const frames = saved.deviceWindows
    useNetworkStore.getState().loadLab(saved.devices, saved.links, saved.annotations, saved.physical)
    useNetworkStore.setState({ deviceWindows: restoreWindows ? frames : [] })
    useWorkspaceStore.setState({ fileName: saved.fileName || '', status: `Restored ${saved.fileName || 'workspace'} from local storage.` })
    useWorkspaceStore.getState().command('fit-topology')
    return true
  } catch {
    return false
  }
}

export async function saveWorkspaceToSqlite(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const training = useTrainingStore.getState()
    const activity = useActivityStore.getState()
    const snapshot = training.active && training.backup
      ? training.backup
      : activity.session
        ? activity.session.backup
        : { ...useNetworkStore.getState(), fileName: useWorkspaceStore.getState().fileName }
    const { devices, links, annotations, deviceWindows, fileName } = snapshot
    if (!Array.isArray(devices) || devices.length === 0) return false
    const live = useNetworkStore.getState()
    const sandboxed = (training.active && training.backup) || activity.session
    const physical = !sandboxed
      ? { containers: live.physicalContainers, assignment: live.physicalAssignment, clusters: live.clusters }
      : undefined
    const res = await fetch('/api/sqlite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save-autosave',
        fileName: fileName || 'Active Workspace',
        snapshot: { version: 1, devices: stripRoutingRuntime(devices), links, annotations, deviceWindows, fileName, physical },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function restoreWorkspaceFromSqlite(restoreWindows = true): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const res = await fetch('/api/sqlite?action=get-autosave')
    if (res.ok) {
      const data = await res.json()
      if (data.ok && data.checkpoint && data.checkpoint.snapshotJson) {
        const saved = parseWorkspace(JSON.parse(data.checkpoint.snapshotJson))
        if (saved && Array.isArray(saved.devices) && saved.devices.length > 0) {
          useNetworkStore.getState().loadLab(saved.devices, saved.links || [], saved.annotations || [], saved.physical)
          const frames = (saved.deviceWindows || []).filter((frame: DeviceWindow) =>
            saved.devices.some((device: NetworkDevice) => device.id === frame.deviceId) &&
            [frame.x, frame.y, frame.width, frame.height, frame.z].every(Number.isFinite) &&
            frame.width >= 100 && frame.height >= 100
          )
          useNetworkStore.setState({ deviceWindows: restoreWindows ? frames : [] })
          const restoredName = saved.fileName || data.checkpoint.title || ''
          useWorkspaceStore.setState({
            fileName: restoredName,
            status: `Restored ${restoredName || 'workspace'} from study vault.`,
          })
          useWorkspaceStore.getState().command('fit-topology')
          return true
        }
      }
    }

    const chkRes = await fetch('/api/sqlite?action=list-checkpoints')
    if (chkRes.ok) {
      const chkData = await chkRes.json()
      if (chkData.ok && Array.isArray(chkData.checkpoints) && chkData.checkpoints.length > 0) {
        const latest = chkData.checkpoints[0]
        const saved = parseWorkspace(JSON.parse(latest.snapshotJson))
        if (saved && Array.isArray(saved.devices) && saved.devices.length > 0) {
          useNetworkStore.getState().loadLab(saved.devices, saved.links || [], saved.annotations || [], saved.physical)
          const frames = (saved.deviceWindows || []).filter((frame: DeviceWindow) =>
            saved.devices.some((device: NetworkDevice) => device.id === frame.deviceId) &&
            [frame.x, frame.y, frame.width, frame.height, frame.z].every(Number.isFinite) &&
            frame.width >= 100 && frame.height >= 100
          )
          useNetworkStore.setState({ deviceWindows: restoreWindows ? frames : [] })
          const restoredName = saved.fileName || latest.title || ''
          useWorkspaceStore.setState({
            fileName: restoredName,
            status: `Restored latest checkpoint "${restoredName}" from study vault.`,
          })
          useWorkspaceStore.getState().command('fit-topology')
          return true
        }
      }
    }
  } catch {
    // ignore
  }
  return false
}

export function restoreLabFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  if (!hash || !hash.includes('lab=')) return false
  try {
    const rawBase64 = hash.split('lab=')[1].split('&')[0]
    if (!rawBase64 || rawBase64.length > 12 * 1024 * 1024) return false
    const jsonStr = decodeURIComponent(escape(atob(rawBase64)))
    const data = parseWorkspace(JSON.parse(jsonStr))
    if (data && Array.isArray(data.devices)) {
      useNetworkStore.getState().loadLab(data.devices, data.links || [], data.annotations || [], data.physical)
      useWorkspaceStore.setState({
        fileName: data.fileName || 'Shared Lab',
        status: 'Loaded shared network lab from URL.'
      })
      return true
    }
  } catch (err) {
    console.warn('Failed to parse lab from URL hash:', err)
  }
  return false
}

export function generateShareableUrl(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const net = useNetworkStore.getState()
    const payload = {
      format: 'wireforge-web',
      version: 1,
      devices: stripRoutingRuntime(net.devices),
      links: net.links,
      annotations: net.annotations,
      fileName: useWorkspaceStore.getState().fileName || 'Shared Lab',
      physical: { containers: net.physicalContainers, assignment: net.physicalAssignment, clusters: net.clusters },
    }
    const jsonStr = JSON.stringify(payload)
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)))
    const url = new URL(window.location.href)
    url.hash = `lab=${base64}`
    return url.toString()
  } catch {
    return null
  }
}

export async function exportLabToPktFile(filename?: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!navigator.onLine) {
    useWorkspaceStore.getState().setStatus('PKT conversion requires a connection in the browser edition. Use File > Save for an offline JSON backup.')
    return false
  }
  try {
    const net = useNetworkStore.getState()
    const name = (filename || useWorkspaceStore.getState().fileName || 'lab').replace(/\.(pkt|wf\.json)$/i, '')
    const response = await fetch('/api/export-pkt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ devices: stripRoutingRuntime(net.devices), links: net.links }),
    })
    if (!response.ok) throw new Error('Failed to encode PKT file')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.pkt`
    a.click()
    URL.revokeObjectURL(url)
    useWorkspaceStore.getState().setStatus(`Exported ${name}.pkt with supported device settings. Keep a JSON backup of your workspace.`)
    return true
  } catch {
    useWorkspaceStore.getState().setStatus('Could not export PKT file.')
    return false
  }
}

export function initializeWorkspacePersistence(): () => void {
  useWorkspacePersistence.setState({ ready: true })
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    // ignore
  }

  const fromUrl = restoreLabFromUrl()
  let restored = fromUrl
  if (!restored && storage) {
    restored = restoreWorkspaceFromStorage(storage, false)
  }
  if (storage) {
    restoreTrainingFromStorage(storage)
    if (!useTrainingStore.getState().active) restoreActivityFromStorage(storage)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!dirty) return
    dirty = false
    if (storage) {
      if (!saveWorkspaceToStorage(storage)) {
        useWorkspaceStore.getState().setStatus('Browser storage is full or unavailable. Use File > Save to keep a copy.')
      }
      saveTrainingToStorage(storage)
      saveActivityToStorage(storage)
    }
  }
  const schedule = () => {
    dirty = true
    if (!timer) timer = setTimeout(flush, 400)
  }
  const unsubscribe = useNetworkStore.subscribe((state, previous) => {
    const deviceChanged = state.devices !== previous.devices && (state.devices.length !== previous.devices.length || state.devices.some((d, index) => {
      const old = previous.devices[index]
      const configured = d.routingTable.filter(r => r.type !== 'O' && r.type !== 'R'), oldRoutes = old?.routingTable.filter(r => r.type !== 'O' && r.type !== 'R')
      return !old || Object.keys(d).some(key => key !== 'ospf' && key !== 'rip' && key !== 'ospfSequence' && key !== 'routingTable' && d[key as keyof NetworkDevice] !== old[key as keyof NetworkDevice]) || configured.some((r, i) => r !== oldRoutes?.[i]) || configured.length !== oldRoutes?.length
    }))
    if (
      deviceChanged ||
      state.links !== previous.links ||
      state.annotations !== previous.annotations ||
      state.deviceWindows !== previous.deviceWindows ||
      state.physicalContainers !== previous.physicalContainers ||
      state.physicalAssignment !== previous.physicalAssignment ||
      state.clusters !== previous.clusters
    ) {
      schedule()
    }
  })
  const unsubscribeName = useWorkspaceStore.subscribe((state, previous) => {
    if (state.fileName !== previous.fileName) schedule()
  })
  const unsubscribeTraining = useTrainingStore.subscribe(schedule)
  const unsubscribeActivity = useActivityStore.subscribe(schedule)
  window.addEventListener('pagehide', flush)
  const visibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  document.addEventListener('visibilitychange', visibility)
  return () => {
    flush()
    unsubscribe()
    unsubscribeName()
    unsubscribeTraining()
    unsubscribeActivity()
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', visibility)
  }
}
