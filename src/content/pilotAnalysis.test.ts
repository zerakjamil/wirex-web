import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PILOT_COLUMNS,
  bootstrapMeanCi,
  computeAnalysis,
  parseCsv,
  parsePilotCsv,
  renderMarkdown,
  type PilotColumn,
} from '../content/pilotAnalysis'

const DEFAULTS: Record<PilotColumn, string> = {
  participant_id: 'P-1',
  cohort: 'A',
  prior_networking_weeks: '4',
  prior_vlan_config: 'no',
  setup_minutes: '8',
  pre_score_12: '4',
  post_score_12: '9',
  gain: '5',
  transfer_rater_a_20: '12',
  transfer_rater_b_20: '14',
  transfer_consensus_20: '13',
  transfer_critical_error: 'no',
  delayed_mcq_8: '6',
  config_recall_5: '4',
  survey_mean_5: '4.5',
  survey_find_5: '4.5',
  completed_session: 'yes',
  completed_delayed: 'yes',
  protocol_deviations: '',
  notes: '',
}

function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function row(overrides: Partial<Record<PilotColumn, string>> = {}): string {
  const values = { ...DEFAULTS, ...overrides }
  return PILOT_COLUMNS.map(column => cell(values[column])).join(',')
}

function csv(rows: Array<Partial<Record<PilotColumn, string>>>): string {
  return `${PILOT_COLUMNS.join(',')}\n${rows.map(row).join('\n')}\n`
}

const SIX_ROWS: Array<Partial<Record<PilotColumn, string>>> = [
  {
    participant_id: 'P-1',
    pre_score_12: '4',
    post_score_12: '9',
    gain: '5',
    transfer_rater_a_20: '12',
    transfer_rater_b_20: '14',
    transfer_consensus_20: '13',
    delayed_mcq_8: '6',
    config_recall_5: '4',
    survey_mean_5: '4.5',
    completed_delayed: 'yes',
  },
  {
    participant_id: 'P-2',
    pre_score_12: '6',
    post_score_12: '8',
    gain: '2',
    transfer_rater_a_20: '10',
    transfer_rater_b_20: '10',
    transfer_consensus_20: '10',
    delayed_mcq_8: '5',
    config_recall_5: '3',
    survey_mean_5: '4',
    completed_delayed: 'yes',
  },
  {
    participant_id: 'P-3',
    pre_score_12: '5',
    post_score_12: '10',
    gain: '5',
    transfer_rater_a_20: '14',
    transfer_rater_b_20: '16',
    transfer_consensus_20: '15',
    delayed_mcq_8: '7',
    config_recall_5: '5',
    survey_mean_5: '5',
    completed_delayed: 'yes',
  },
  {
    participant_id: 'P-4',
    pre_score_12: '7',
    post_score_12: '9',
    gain: '2',
    transfer_rater_a_20: '11',
    transfer_rater_b_20: '13',
    transfer_consensus_20: '12',
    delayed_mcq_8: '4',
    config_recall_5: '2',
    survey_mean_5: '3.5',
    completed_delayed: 'no',
  },
  {
    participant_id: 'P-5',
    pre_score_12: '3',
    post_score_12: '8',
    gain: '5',
    transfer_rater_a_20: '15',
    transfer_rater_b_20: '15',
    transfer_consensus_20: '15',
    delayed_mcq_8: '6',
    config_recall_5: '4',
    survey_mean_5: '4.5',
    completed_delayed: 'yes',
  },
  {
    participant_id: 'P-6',
    pre_score_12: '8',
    post_score_12: '10',
    gain: '2',
    transfer_rater_a_20: '9',
    transfer_rater_b_20: '11',
    transfer_consensus_20: '10',
    transfer_critical_error: 'yes',
    delayed_mcq_8: '',
    config_recall_5: '3',
    survey_mean_5: '3',
    completed_delayed: 'no',
  },
]

function analyzeSixRows(overrides: { warnings?: string[] } = {}) {
  const parsed = parsePilotCsv(csv(SIX_ROWS))
  assert.deepEqual(parsed.errors, [])
  return computeAnalysis(parsed.rows, {
    source: 'fixture.csv',
    generatedAt: '2026-10-21T00:00:00.000Z',
    seed: 7,
    resamples: 1000,
    warnings: overrides.warnings ?? parsed.warnings,
  })
}

test('parseCsv handles BOM, CRLF, quoted commas, and escaped quotes', () => {
  const rows = parseCsv('\uFEFFa,b,c\r\n1,"two, too","say ""hi"""\r\n')
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['1', 'two, too', 'say "hi"'],
  ])
  assert.throws(() => parseCsv('a\n"unterminated'), /Unterminated quoted field/)
})

test('parsePilotCsv accepts the template and converts typed fields', () => {
  const result = parsePilotCsv(csv([{}]))
  assert.deepEqual(result.errors, [])
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].preScore, 4)
  assert.equal(result.rows[0].postScore, 9)
  assert.equal(result.rows[0].completedSession, true)
  assert.equal(result.rows[0].completedDelayed, true)
  assert.equal(result.rows[0].transferCriticalError, false)
  assert.equal(result.rows[0].surveyMean, 4.5)
  assert.equal(result.rows[0].surveyFind, 4.5)
  assert.equal(result.rows[0].setupMinutes, 8)
})

test('parsePilotCsv rejects missing columns and duplicate participant ids', () => {
  const missing = parsePilotCsv(csv([{}]).replace('pre_score_12,', ''))
  assert.ok(missing.errors.some(error => error.includes('Missing required column')))
  assert.ok(missing.errors.some(error => error.includes('pre_score_12')))

  const duplicate = parsePilotCsv(csv([{}, {}]))
  assert.ok(duplicate.errors.some(error => error.includes('duplicate participant_id')))
})

test('parsePilotCsv reports invalid booleans and out-of-range scores', () => {
  const result = parsePilotCsv(
    csv([
      {
        completed_session: 'maybe',
        pre_score_12: '13',
        survey_mean_5: '6',
        survey_find_5: '0',
        setup_minutes: '601',
      },
    ])
  )
  assert.ok(result.errors.some(error => error.includes('completed_session')))
  assert.ok(result.errors.some(error => error.includes('pre_score_12')))
  assert.ok(result.errors.some(error => error.includes('survey_mean_5')))
  assert.ok(result.errors.some(error => error.includes('survey_find_5')))
  assert.ok(result.errors.some(error => error.includes('setup_minutes')))
})

test('parsePilotCsv warns when the supplied gain contradicts pre and post', () => {
  const result = parsePilotCsv(csv([{ gain: '3' }]))
  assert.deepEqual(result.errors, [])
  assert.ok(result.warnings.some(warning => warning.includes('does not match')))
})

test('computeAnalysis produces paired gains, completion, and criterion decisions', () => {
  const analysis = analyzeSixRows()

  assert.equal(analysis.counts.enrolled, 6)
  assert.equal(analysis.counts.sessionCompleters, 6)
  assert.equal(analysis.counts.delayedCompleters, 4)
  assert.equal(analysis.counts.delayedScored, 4)
  assert.equal(analysis.counts.transferScored, 6)
  assert.equal(analysis.counts.criticalErrors, 1)
  assert.equal(analysis.completion.delayedRate, 4 / 6)
  assert.equal(analysis.completion.delayedEnrolledRate, 4 / 6)
  assert.equal(analysis.completion.sessionRate, 1)

  assert.equal(analysis.prePost.n, 6)
  assert.equal(analysis.prePost.preMean, 5.5)
  assert.equal(analysis.prePost.postMean, 9)
  assert.equal(analysis.prePost.gainMean, 3.5)
  assert.equal(analysis.prePost.gainMedian, 3.5)
  assert.ok(analysis.prePost.gainSd !== null && Math.abs(analysis.prePost.gainSd - 1.6432) < 0.001)
  assert.ok(analysis.prePost.ci95 !== null && analysis.prePost.ci95[0] > 0)

  assert.equal(analysis.delayed.n, 4)
  assert.equal(analysis.delayed.mean, 6)
  assert.ok(analysis.delayed.sd !== null && Math.abs(analysis.delayed.sd - 0.8165) < 0.001)
  assert.equal(analysis.configRecall.mean, 3.5)
  assert.ok(analysis.survey.mean !== null && Math.abs(analysis.survey.mean - 4.0833) < 0.001)

  assert.equal(analysis.prePost.gainAtLeast2Rate, 1)
  assert.equal(analysis.setup.median, 8)
  assert.equal(analysis.usabilityFind.mean, 4.5)
  assert.equal(analysis.transfer.mean, 12.5)
  assert.equal(analysis.transfer.median, 12.5)
  assert.equal(analysis.transfer.rateAtLeast12, 4 / 6)
  assert.equal(analysis.transfer.rateAtLeast14, 2 / 6)
  assert.equal(analysis.transfer.criticalErrorRate, 1 / 6)
  assert.ok(analysis.retention.delayedMeanRatio !== null && Math.abs(analysis.retention.delayedMeanRatio - 2 / 3) < 0.001)
  assert.equal(analysis.retention.rateDelayedAtLeast6, 3 / 4)
  assert.equal(analysis.retention.rateRecallAtLeast4, 3 / 6)
  assert.equal(analysis.interRater.n, 6)
  assert.equal(analysis.interRater.exactAgreement, 2 / 6)
  assert.equal(analysis.interRater.withinOne, 2 / 6)
  assert.equal(analysis.interRater.withinTwo, 1)
  assert.ok(
    analysis.interRater.meanAbsoluteDifference !== null &&
      Math.abs(analysis.interRater.meanAbsoluteDifference - 8 / 6) < 0.001
  )

  const statuses = Object.fromEntries(analysis.criteria.map(item => [item.id, item.status]))
  assert.equal(statuses.sample, 'met')
  assert.equal(statuses['session-completion'], 'met')
  assert.equal(statuses['delayed-completion'], 'not-met')
  assert.equal(statuses.setup, 'met')
  assert.equal(statuses.learning, 'met')
  assert.equal(statuses.transfer, 'not-met')
  assert.equal(statuses.retention, 'not-met')
  assert.equal(statuses.usability, 'met')
  assert.equal(statuses['content-review'], 'not-assessed')
  assert.equal(statuses['language-review'], 'not-assessed')
  assert.equal(statuses['p0-blocker'], 'not-assessed')
  assert.equal(statuses.fidelity, 'not-assessed')
})

test('a delayed score without completed_delayed is excluded and warned', () => {
  const analysis = analyzeSixRows()
  assert.equal(analysis.delayed.n, 4)
  assert.equal(analysis.participants.find(item => item.id === 'P-4')?.delayed, null)
  assert.ok(
    analysis.warnings.some(warning => warning.includes('delayed_mcq_8 is present but completed_delayed is not yes'))
  )
})

test('an unknown critical-error flag makes the transfer criterion insufficient', () => {
  const rows = SIX_ROWS.map(item =>
    item.participant_id === 'P-6' ? { ...item, transfer_critical_error: '' } : item
  )
  const parsed = parsePilotCsv(csv(rows))
  assert.deepEqual(parsed.errors, [])
  const analysis = computeAnalysis(parsed.rows, { seed: 7, resamples: 1000 })
  assert.equal(analysis.counts.criticalErrorUnknown, 1)
  const transfer = analysis.criteria.find(item => item.id === 'transfer')
  assert.equal(transfer?.status, 'insufficient')
  assert.ok(transfer?.detail.includes('unknown critical-error'))
})

test('bootstrapMeanCi is deterministic, brackets the mean, and refuses one value', () => {
  const first = bootstrapMeanCi([1, 2, 3, 4, 5], 42, 1000)
  const second = bootstrapMeanCi([1, 2, 3, 4, 5], 42, 1000)
  assert.deepEqual(first, second)
  assert.ok(first !== null && first[0] <= 3 && first[1] >= 3)
  assert.equal(bootstrapMeanCi([1], 42, 1000), null)
  assert.equal(bootstrapMeanCi([1, 2, 3], 42, 99), null)
})

test('renderMarkdown includes the guardrail, criteria, audit table, and privacy note', () => {
  const analysis = analyzeSixRows()
  const markdown = renderMarkdown(analysis)
  assert.ok(markdown.includes('# CCNA Academy pilot analysis'))
  assert.ok(markdown.includes('single-group feasibility analysis'))
  assert.ok(markdown.includes('**PASS**'))
  assert.ok(markdown.includes('**FAIL**'))
  assert.ok(markdown.includes('**N/A**'))
  assert.ok(markdown.includes('Participant audit table'))
  assert.ok(markdown.includes('docs/evaluation/private/'))
  assert.ok(markdown.includes('P-6'))
})

test('the template header without participant rows is rejected', () => {
  const result = parsePilotCsv(`${PILOT_COLUMNS.join(',')}\n`)
  assert.ok(result.errors.some(error => error.includes('no participant rows')))
})

test('the unfilled template placeholder is rejected', () => {
  const result = parsePilotCsv(csv([{ participant_id: 'P-XXXX' }]))
  assert.ok(result.errors.some(error => error.includes('template placeholder')))
})
