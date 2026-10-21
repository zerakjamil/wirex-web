import test from 'node:test'
import assert from 'node:assert/strict'
import { ccnaChecks, ccnaRescuePaths, ccnaSections } from '@/content/ccnaCourse'
import {
  ACADEMY_STORAGE_KEY,
  initializeAcademy,
  parseAcademyProgress,
  serializeAcademyProgress,
  useAcademyStore,
} from './academyStore'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
})

const section = ccnaSections[0]
const secondSection = ccnaSections[1]
const check = ccnaChecks[0]
const rescue = ccnaRescuePaths[0]

function reset() {
  storage.clear()
  useAcademyStore.setState({
    open: false,
    view: 'home',
    sectionId: null,
    initialized: false,
    completedSections: [],
    correctChecks: [],
    lastSectionId: null,
    activeRescueId: null,
    practiceBest: 0,
  })
}

test('progress parser accepts valid v1 data and rejects unknown IDs', () => {
  assert.equal(parseAcademyProgress(null), null)
  assert.equal(parseAcademyProgress('not json'), null)
  assert.equal(parseAcademyProgress(JSON.stringify({ version: 2 })), null)
  const parsed = parseAcademyProgress(JSON.stringify({
    version: 1,
    completedSections: [section.id, 'missing-section'],
    correctChecks: [check.id, 'missing-check'],
    lastSectionId: secondSection.id,
    activeRescueId: rescue.id,
    practiceBest: 87.6,
  }))
  assert.deepEqual(parsed, {
    completedSections: [section.id],
    correctChecks: [check.id],
    lastSectionId: secondSection.id,
    activeRescueId: rescue.id,
    practiceBest: 88,
  })
  const clamped = parseAcademyProgress(JSON.stringify({ version: 1, practiceBest: 200 }))
  assert.equal(clamped?.practiceBest, 100)
  assert.equal(clamped?.completedSections.length, 0)
})

test('serializer round-trips the public progress shape', () => {
  const progress = {
    completedSections: [section.id],
    correctChecks: [check.id],
    lastSectionId: section.id,
    activeRescueId: rescue.id,
    practiceBest: 75,
  }
  assert.deepEqual(parseAcademyProgress(serializeAcademyProgress(progress)), progress)
})

test('opening a valid section switches to the reader and persists it', () => {
  reset()
  useAcademyStore.getState().openSection(section.id)
  const state = useAcademyStore.getState()
  assert.equal(state.open, true)
  assert.equal(state.view, 'reader')
  assert.equal(state.sectionId, section.id)
  assert.equal(state.lastSectionId, section.id)
  const saved = JSON.parse(storage.get(ACADEMY_STORAGE_KEY) ?? '{}')
  assert.equal(saved.lastSectionId, section.id)
  useAcademyStore.getState().openSection('not-a-section')
  assert.equal(useAcademyStore.getState().sectionId, section.id)
})

test('marking a section read is idempotent and records the last section', () => {
  reset()
  useAcademyStore.getState().markSectionRead(section.id)
  useAcademyStore.getState().markSectionRead(section.id)
  assert.deepEqual(useAcademyStore.getState().completedSections, [section.id])
  assert.equal(useAcademyStore.getState().lastSectionId, section.id)
  useAcademyStore.getState().markSectionRead('not-a-section')
  assert.deepEqual(useAcademyStore.getState().completedSections, [section.id])
})

test('only correct answers to known checks are recorded, once', () => {
  reset()
  useAcademyStore.getState().recordCheck(check.id, false)
  assert.deepEqual(useAcademyStore.getState().correctChecks, [])
  useAcademyStore.getState().recordCheck('not-a-check', true)
  assert.deepEqual(useAcademyStore.getState().correctChecks, [])
  useAcademyStore.getState().recordCheck(check.id, true)
  useAcademyStore.getState().recordCheck(check.id, true)
  assert.deepEqual(useAcademyStore.getState().correctChecks, [check.id])
})

test('rescue paths start, persist, and clear without losing section progress', () => {
  reset()
  useAcademyStore.getState().markSectionRead(section.id)
  useAcademyStore.getState().startRescue(rescue.id)
  assert.equal(useAcademyStore.getState().activeRescueId, rescue.id)
  assert.equal(useAcademyStore.getState().view, 'rescue')
  assert.equal(useAcademyStore.getState().open, true)
  assert.deepEqual(useAcademyStore.getState().completedSections, [section.id])
  useAcademyStore.getState().startRescue('not-a-path')
  assert.equal(useAcademyStore.getState().activeRescueId, rescue.id)
  useAcademyStore.getState().clearRescue()
  assert.equal(useAcademyStore.getState().activeRescueId, null)
  assert.deepEqual(useAcademyStore.getState().completedSections, [section.id])
})

test('practice best never decreases, clamps, and persists', () => {
  reset()
  useAcademyStore.getState().setPracticeBest(64.4)
  assert.equal(useAcademyStore.getState().practiceBest, 64)
  useAcademyStore.getState().setPracticeBest(40)
  assert.equal(useAcademyStore.getState().practiceBest, 64)
  useAcademyStore.getState().setPracticeBest(140)
  assert.equal(useAcademyStore.getState().practiceBest, 100)
  useAcademyStore.getState().setPracticeBest(Number.NaN)
  assert.equal(useAcademyStore.getState().practiceBest, 100)
})

test('initialization restores saved progress and reset clears it', () => {
  reset()
  storage.set(ACADEMY_STORAGE_KEY, serializeAcademyProgress({
    completedSections: [section.id],
    correctChecks: [check.id],
    lastSectionId: section.id,
    activeRescueId: rescue.id,
    practiceBest: 72,
  }))
  initializeAcademy()
  assert.equal(useAcademyStore.getState().initialized, true)
  assert.deepEqual(useAcademyStore.getState().completedSections, [section.id])
  assert.equal(useAcademyStore.getState().practiceBest, 72)
  useAcademyStore.getState().resetProgress()
  const state = useAcademyStore.getState()
  assert.deepEqual(state.completedSections, [])
  assert.deepEqual(state.correctChecks, [])
  assert.equal(state.lastSectionId, null)
  assert.equal(state.activeRescueId, null)
  assert.equal(state.practiceBest, 0)
  assert.equal(state.view, 'home')
  assert.equal(state.sectionId, null)
})

test('initialization tolerates unavailable storage', () => {
  reset()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } },
  })
  assert.doesNotThrow(initializeAcademy)
  assert.equal(useAcademyStore.getState().initialized, true)
  assert.doesNotThrow(() => useAcademyStore.getState().openSection(section.id))
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
})
