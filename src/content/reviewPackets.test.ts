import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { examTaskIds, lessonIds } from '../simulator/trainingLabs'

const csv = readFileSync(
  join(process.cwd(), 'docs/evaluation/generated/academy-ui-strings.csv'),
  'utf8'
).replace(/^\uFEFF/, '')

const hasRow = (key: string) => new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`, 'm').test(csv)

test('review packet includes every practical-exam task label', () => {
  for (const id of examTaskIds) assert.ok(hasRow(`task.${id}`), `missing task.${id}`)
})

test('review packet includes dynamic lesson, diagnostic, and mode labels', () => {
  for (const id of lessonIds) {
    assert.ok(hasRow(`lesson.${id}`), `missing lesson.${id}`)
    assert.ok(hasRow(`lesson.${id}.goal`), `missing lesson.${id}.goal`)
  }
  assert.ok(hasRow('diag.no-path'), 'missing diag.no-path')
  assert.ok(hasRow('Guided'), 'missing Guided mode label')
  assert.ok(hasRow('Free practice'), 'missing Free practice mode label')
})
