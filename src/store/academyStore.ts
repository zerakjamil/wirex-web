import { create } from 'zustand'
import { ccnaChecks, ccnaRescuePaths, ccnaSectionById, ccnaSections } from '@/content/ccnaCourse'

export const ACADEMY_STORAGE_KEY = 'wirex-academy-v1'
export type AcademyView = 'home' | 'reader' | 'practice' | 'rescue'

export interface AcademyProgress {
  completedSections: string[]
  correctChecks: string[]
  lastSectionId: string | null
  activeRescueId: string | null
  practiceBest: number
}

interface AcademyStore extends AcademyProgress {
  open: boolean
  view: AcademyView
  sectionId: string | null
  initialized: boolean
  openAcademy: () => void
  closeAcademy: () => void
  setView: (view: AcademyView) => void
  openSection: (sectionId: string) => void
  markSectionRead: (sectionId: string) => void
  recordCheck: (checkId: string, correct: boolean) => void
  startRescue: (rescueId: string) => void
  clearRescue: () => void
  setPracticeBest: (score: number) => void
  resetProgress: () => void
}

const sectionIds = new Set(ccnaSections.map(section => section.id))
const checkIds = new Set(ccnaChecks.map(check => check.id))
const rescueIds = new Set(ccnaRescuePaths.map(path => path.id))

export function parseAcademyProgress(raw: string | null): AcademyProgress | null {
  if (!raw) return null
  try {
    const saved = JSON.parse(raw) as Partial<AcademyProgress> & { version?: number }
    if (saved.version !== 1) return null
    const completedSections = Array.isArray(saved.completedSections)
      ? saved.completedSections.filter((id): id is string => typeof id === 'string' && sectionIds.has(id))
      : []
    const correctChecks = Array.isArray(saved.correctChecks)
      ? saved.correctChecks.filter((id): id is string => typeof id === 'string' && checkIds.has(id))
      : []
    const lastSectionId = typeof saved.lastSectionId === 'string' && ccnaSectionById.has(saved.lastSectionId) ? saved.lastSectionId : null
    const activeRescueId = typeof saved.activeRescueId === 'string' && rescueIds.has(saved.activeRescueId) ? saved.activeRescueId : null
    const practiceBest = typeof saved.practiceBest === 'number' && Number.isFinite(saved.practiceBest)
      ? Math.max(0, Math.min(100, Math.round(saved.practiceBest)))
      : 0
    return { completedSections, correctChecks, lastSectionId, activeRescueId, practiceBest }
  } catch {
    return null
  }
}

export function serializeAcademyProgress(progress: AcademyProgress): string {
  return JSON.stringify({
    version: 1,
    completedSections: progress.completedSections,
    correctChecks: progress.correctChecks,
    lastSectionId: progress.lastSectionId,
    activeRescueId: progress.activeRescueId,
    practiceBest: progress.practiceBest,
  })
}

function save(progress: AcademyProgress) {
  try {
    localStorage.setItem(ACADEMY_STORAGE_KEY, serializeAcademyProgress(progress))
  } catch {
    // Private browsing and storage quotas should not break a lesson.
  }
}

export function initializeAcademy() {
  let progress: AcademyProgress | null = null
  try {
    progress = parseAcademyProgress(localStorage.getItem(ACADEMY_STORAGE_KEY))
  } catch {
    progress = null
  }
  useAcademyStore.setState({
    ...(progress ?? { completedSections: [], correctChecks: [], lastSectionId: null, activeRescueId: null, practiceBest: 0 }),
    initialized: true,
  })
}

export const useAcademyStore = create<AcademyStore>((set, get) => ({
  open: false,
  view: 'home',
  sectionId: null,
  initialized: false,
  completedSections: [],
  correctChecks: [],
  lastSectionId: null,
  activeRescueId: null,
  practiceBest: 0,
  openAcademy: () => set({ open: true, view: 'home' }),
  closeAcademy: () => set({ open: false }),
  setView: view => set({ open: true, view, sectionId: view === 'reader' ? get().sectionId : null }),
  openSection: sectionId => {
    if (!ccnaSectionById.has(sectionId)) return
    set({ open: true, view: 'reader', sectionId, lastSectionId: sectionId })
    save({ ...get(), lastSectionId: sectionId })
  },
  markSectionRead: sectionId => {
    if (!ccnaSectionById.has(sectionId)) return
    const state = get()
    const completedSections = state.completedSections.includes(sectionId) ? state.completedSections : [...state.completedSections, sectionId]
    set({ completedSections, lastSectionId: sectionId })
    save({ ...state, completedSections, lastSectionId: sectionId })
  },
  recordCheck: (checkId, correct) => {
    if (!correct || !checkIds.has(checkId)) return
    const state = get()
    if (state.correctChecks.includes(checkId)) return
    const correctChecks = [...state.correctChecks, checkId]
    set({ correctChecks })
    save({ ...state, correctChecks })
  },
  startRescue: rescueId => {
    if (!rescueIds.has(rescueId)) return
    set({ open: true, view: 'rescue', activeRescueId: rescueId })
    save({ ...get(), activeRescueId: rescueId })
  },
  clearRescue: () => {
    set({ activeRescueId: null })
    save({ ...get(), activeRescueId: null })
  },
  setPracticeBest: score => {
    if (!Number.isFinite(score)) return
    const state = get()
    const practiceBest = Math.max(state.practiceBest, Math.max(0, Math.min(100, Math.round(score))))
    set({ practiceBest })
    save({ ...state, practiceBest })
  },
  resetProgress: () => {
    set({ completedSections: [], correctChecks: [], lastSectionId: null, activeRescueId: null, practiceBest: 0, view: 'home', sectionId: null })
    save({ completedSections: [], correctChecks: [], lastSectionId: null, activeRescueId: null, practiceBest: 0 })
  },
}))
