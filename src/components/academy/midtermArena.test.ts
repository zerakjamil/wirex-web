import test from 'node:test'
import assert from 'node:assert/strict'
import { pastExamLabs } from '@/simulator/pastExamLabs'
import { useNetworkStore } from '@/store/networkStore'
import { useAcademyStore } from '@/store/academyStore'

test('midterm arena can switch academy views and target midterm tab', () => {
  useAcademyStore.setState({ open: false, view: 'home' })
  useAcademyStore.getState().openAcademy('midterm')

  assert.equal(useAcademyStore.getState().view, 'midterm')
  assert.equal(useAcademyStore.getState().open, true)

  useAcademyStore.getState().setView('midterm')
  assert.equal(useAcademyStore.getState().view, 'midterm')
})

test('predicted midterm 2026 lab can load into live networkStore', () => {
  const labFactory = pastExamLabs['predicted-midterm-2026']
  assert.ok(labFactory, 'Predicted midterm lab factory must be registered')

  const lab = labFactory()
  useNetworkStore.getState().loadLab(lab.devices, lab.links, lab.annotations)

  const state = useNetworkStore.getState()
  assert.equal(state.devices.length, lab.devices.length)
  assert.equal(state.links.length, lab.links.length)

  // Verify router exists with subinterfaces or connections
  const router = state.devices.find(d => d.type === 'router')
  assert.ok(router, 'Edge-Router must be present in simulation')
  assert.equal(router.name, 'Edge-Router')

  // Verify switches exist
  const switches = state.devices.filter(d => d.type === 'switch')
  assert.equal(switches.length, 3, 'Must have 3 switches for VLAN distribution')

  // Verify Student, Teacher, and Admin PCs
  const pcs = state.devices.filter(d => d.type === 'pc')
  assert.equal(pcs.length, 6, 'Must have 6 PCs across 3 VLANs')

  // Verify Laptop exists
  const laptop = state.devices.find(d => d.type === 'laptop')
  assert.ok(laptop, 'Tech-Laptop must be present for console management')
})

test('all historical past exam labs load cleanly without orphan ports', () => {
  const keys = [
    'midterm-2024-2025',
    'final-2025-2026-ga',
    'final-2024-2025-a',
    'final-2022-2023',
  ]

  for (const key of keys) {
    const labFactory = pastExamLabs[key]
    assert.ok(labFactory, `Factory for ${key} must exist`)
    const lab = labFactory()

    useNetworkStore.getState().loadLab(lab.devices, lab.links, lab.annotations)
    const state = useNetworkStore.getState()
    assert.ok(state.devices.length >= 4)
    assert.ok(state.links.length >= 3)
  }
})
