import test from 'node:test'
import assert from 'node:assert/strict'
import {
  curiousKidStories,
  pastExamPapers,
  predictedMidterm2026,
} from './pastExamsData'
import {
  pastExamLabs,
  getPredictedMidterm2026Lab,
  getMidterm2024Lab,
  getFinal2025GroupALab,
  getFinal2024GroupALab,
  getFinal2022Lab,
  getVoiceTelephonyLab,
} from '@/simulator/pastExamLabs'

test('curious-kid stories follow simplicity and pedagogical invariants', () => {
  assert.ok(curiousKidStories.length >= 5, 'Should have at least 5 core stories')
  for (const story of curiousKidStories) {
    assert.ok(story.id, 'Story must have an ID')
    assert.ok(story.title, 'Story must have a title')
    assert.ok(story.topic, 'Story must specify a topic')
    assert.ok(story.story.length > 20, 'Story body must not be empty')

    // Invariant: Stories should be concise (< 120 words)
    const wordCount = story.story.trim().split(/\s+/).length
    assert.ok(
      wordCount <= 120,
      `Story "${story.id}" exceeds word count limit (${wordCount} words)`
    )

    // Invariant: Exactly 1 to 3 real-life mapped items
    assert.ok(
      story.inRealLife.length >= 1 && story.inRealLife.length <= 3,
      `Story "${story.id}" must map 1 to 3 real-world items`
    )

    assert.ok(story.whereNotPerfect.length > 5, 'Must explain where analogy is imperfect')
    assert.ok(story.simpleTruth.length > 5, 'Must provide the simple truth')
  }
})

test('past examination papers are complete and mathematically verified', () => {
  assert.ok(pastExamPapers.length >= 5, 'Should have at least 5 historical papers')

  for (const paper of pastExamPapers) {
    assert.ok(paper.id, 'Paper must have an ID')
    assert.ok(paper.title, 'Paper must have a title')
    assert.ok(paper.instructor, 'Paper must cite instructor')
    assert.ok(paper.questions.length >= 1, 'Paper must contain questions')

    for (const q of paper.questions) {
      assert.ok(q.text.length > 10, 'Question text must be detailed')
      if (q.type === 'single-choice' || q.type === 'true-false') {
        assert.ok(Array.isArray(q.options), 'MCQ must have options array')
        assert.ok(typeof q.answer === 'number', 'Answer must be a valid option index')
        assert.ok(
          (q.answer as number) >= 0 && (q.answer as number) < q.options!.length,
          'Answer index must be in range'
        )
      }
      assert.ok(q.explanation.length > 10, 'Question must provide detailed explanation')
    }

    if (paper.subnetProblems) {
      for (const p of paper.subnetProblems) {
        const expectedUsable = Math.pow(2, 32 - p.cidr) - 2
        assert.equal(
          p.usableHosts,
          expectedUsable,
          `Subnet ${p.networkAddress}/${p.cidr} usable hosts formula mismatch`
        )
      }
    }
  }
})

test('predicted midterm 2026 exam contains 100 points across 4 rounds', () => {
  assert.equal(predictedMidterm2026.totalPoints, 100)
  assert.equal(predictedMidterm2026.sections.length, 4)
  const totalSectionPoints = predictedMidterm2026.sections.reduce(
    (sum, s) => sum + s.points,
    0
  )
  assert.equal(totalSectionPoints, 100)
  assert.ok(predictedMidterm2026.sections[0].questions.length >= 5)
})

test('past exam labs generate valid devices, links, and port bindings', () => {
  const labFactories = [
    getPredictedMidterm2026Lab,
    getMidterm2024Lab,
    getFinal2025GroupALab,
    getFinal2024GroupALab,
    getFinal2022Lab,
    getVoiceTelephonyLab,
  ]

  for (const factory of labFactories) {
    const lab = factory()
    assert.ok(lab.id, 'Lab must have an ID')
    assert.ok(lab.title, 'Lab must have a title')
    assert.ok(lab.devices.length >= 4, `Lab ${lab.id} must have at least 4 devices`)
    assert.ok(lab.links.length >= 3, `Lab ${lab.id} must have at least 3 links`)

    const deviceMap = new Map(lab.devices.map(d => [d.id, d]))

    for (const link of lab.links) {
      assert.ok(deviceMap.has(link.fromDeviceId), `Link fromDevice ${link.fromDeviceId} missing`)
      assert.ok(deviceMap.has(link.toDeviceId), `Link toDevice ${link.toDeviceId} missing`)

      const fromDev = deviceMap.get(link.fromDeviceId)!
      const toDev = deviceMap.get(link.toDeviceId)!

      const fromPort = fromDev.ports.find(p => p.id === link.fromPortId)
      const toPort = toDev.ports.find(p => p.id === link.toPortId)

      assert.ok(fromPort, `Port ${link.fromPortId} missing on ${fromDev.name}`)
      assert.ok(toPort, `Port ${link.toPortId} missing on ${toDev.name}`)

      assert.equal(fromPort?.connectedLinkId, link.id)
      assert.equal(toPort?.connectedLinkId, link.id)
    }
  }
})

test('pastExamLabs registry exposes all declared lab keys', () => {
  const keys = [
    'predicted-midterm-2026',
    'midterm-2024-2025',
    'final-2025-2026-ga',
    'final-2024-2025-a',
    'final-2022-2023',
    'voice-telephony-lab',
  ]
  for (const key of keys) {
    assert.ok(typeof pastExamLabs[key] === 'function', `Missing key ${key} in registry`)
  }
})
