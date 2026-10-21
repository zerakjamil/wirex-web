export const PILOT_COLUMNS = [
  'participant_id',
  'cohort',
  'prior_networking_weeks',
  'prior_vlan_config',
  'setup_minutes',
  'pre_score_12',
  'post_score_12',
  'gain',
  'transfer_rater_a_20',
  'transfer_rater_b_20',
  'transfer_consensus_20',
  'transfer_critical_error',
  'delayed_mcq_8',
  'config_recall_5',
  'survey_mean_5',
  'survey_find_5',
  'completed_session',
  'completed_delayed',
  'protocol_deviations',
  'notes',
] as const

export type PilotColumn = (typeof PILOT_COLUMNS)[number]

export interface PilotRow {
  participantId: string
  cohort: string
  priorNetworkingWeeks: number | null
  priorVlanConfig: boolean | null
  setupMinutes: number | null
  preScore: number | null
  postScore: number | null
  gainReported: number | null
  transferRaterA: number | null
  transferRaterB: number | null
  transferConsensus: number | null
  transferCriticalError: boolean | null
  delayedMcq: number | null
  configRecall: number | null
  surveyMean: number | null
  surveyFind: number | null
  completedSession: boolean | null
  completedDelayed: boolean | null
  protocolDeviations: string
  notes: string
  rowNumber: number
}

export interface PilotParseResult {
  rows: PilotRow[]
  errors: string[]
  warnings: string[]
}

export type CriterionStatus = 'met' | 'not-met' | 'insufficient' | 'not-assessed'

export interface PilotCriterion {
  id: string
  label: string
  status: CriterionStatus
  detail: string
}

export interface StatSummary {
  n: number
  mean: number | null
  sd: number | null
  median: number | null
  min: number | null
  max: number | null
}

export interface PilotParticipant {
  id: string
  cohort: string
  pre: number | null
  post: number | null
  gain: number | null
  delayed: number | null
  transfer: number | null
  criticalError: boolean | null
  completedSession: boolean | null
  completedDelayed: boolean | null
}

export interface PilotAnalysis {
  source: string
  generatedAt: string
  seed: number
  resamples: number
  counts: {
    enrolled: number
    sessionCompleters: number
    delayedCompleters: number
    delayedScored: number
    transferScored: number
    criticalErrors: number
    criticalErrorUnknown: number
  }
  completion: {
    sessionRate: number | null
    delayedRate: number | null
    delayedEnrolledRate: number | null
  }
  prePost: {
    n: number
    preMean: number | null
    postMean: number | null
    gainMean: number | null
    gainSd: number | null
    gainMedian: number | null
    cohensDz: number | null
    ci95: [number, number] | null
    minGain: number | null
    maxGain: number | null
    gainAtLeast2Rate: number | null
  }
  delayed: StatSummary
  configRecall: StatSummary
  survey: StatSummary
  setup: StatSummary
  usabilityFind: StatSummary
  transfer: {
    n: number
    mean: number | null
    sd: number | null
    median: number | null
    rateAtLeast14: number | null
    rateAtLeast12: number | null
    criticalErrorRate: number | null
  }
  retention: {
    delayedMeanRatio: number | null
    rateDelayedAtLeast6: number | null
    rateRecallAtLeast4: number | null
  }
  interRater: {
    n: number
    exactAgreement: number | null
    withinOne: number | null
    withinTwo: number | null
    meanAbsoluteDifference: number | null
    pearsonR: number | null
  }
  criteria: PilotCriterion[]
  warnings: string[]
  participants: PilotParticipant[]
  protocolDeviations: Array<{ id: string; text: string }>
  criticalErrorIds: string[]
}

export interface PilotAnalysisOptions {
  source?: string
  generatedAt?: string
  seed?: number
  resamples?: number
  warnings?: string[]
}

/**
 * A small RFC 4180-style parser. It handles quoted fields, escaped quotes,
 * CRLF, an optional UTF-8 BOM, and trailing empty lines.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }

  if (inQuotes) throw new Error('Unterminated quoted field')
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  while (rows.length > 0 && rows[rows.length - 1].every(value => value.trim() === '')) {
    rows.pop()
  }
  return rows
}

function parseBoolean(
  value: string,
  rowNumber: number,
  label: string,
  errors: string[]
): boolean | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === '') return null
  if (['yes', 'true', '1', 'y'].includes(normalized)) return true
  if (['no', 'false', '0', 'n'].includes(normalized)) return false
  errors.push(`Row ${rowNumber}: ${label} must be yes/no, true/false, or 1/0 (found "${value}").`)
  return null
}

function parseNumber(
  value: string,
  rowNumber: number,
  label: string,
  minimum: number,
  maximum: number,
  errors: string[],
  integer = true
): number | null {
  const normalized = value.trim()
  if (normalized === '') return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    errors.push(`Row ${rowNumber}: ${label} must be a number (found "${value}").`)
    return null
  }
  if (parsed < minimum || parsed > maximum) {
    errors.push(`Row ${rowNumber}: ${label} must be between ${minimum} and ${maximum} (found ${parsed}).`)
    return null
  }
  if (integer && !Number.isInteger(parsed)) {
    errors.push(`Row ${rowNumber}: ${label} must be a whole number (found ${parsed}).`)
    return null
  }
  return parsed
}

export function parsePilotCsv(text: string): PilotParseResult {
  const errors: string[] = []
  const warnings: string[] = []
  const matrix = parseCsv(text)
  if (matrix.length === 0) {
    return { rows: [], errors: ['The CSV is empty.'], warnings }
  }

  const header = matrix[0].map(value => value.trim())
  const headerIndex = new Map<string, number>()
  for (let index = 0; index < header.length; index += 1) {
    const name = header[index]
    if (!name) {
      warnings.push(`Header column ${index + 1} is empty and will be ignored.`)
      continue
    }
    if (headerIndex.has(name)) {
      errors.push(`Duplicate column "${name}" in the header.`)
      continue
    }
    headerIndex.set(name, index)
  }

  const missing = PILOT_COLUMNS.filter(column => !headerIndex.has(column))
  if (missing.length > 0) {
    errors.push(`Missing required column(s): ${missing.join(', ')}.`)
    return { rows: [], errors, warnings }
  }

  const extra = header.filter(column => column && !(PILOT_COLUMNS as readonly string[]).includes(column))
  if (extra.length > 0) {
    warnings.push(`Ignoring extra column(s): ${extra.join(', ')}.`)
  }

  const rows: PilotRow[] = []
  const seenIds = new Set<string>()

  for (let matrixIndex = 1; matrixIndex < matrix.length; matrixIndex += 1) {
    const cells = matrix[matrixIndex]
    const rowNumber = matrixIndex + 1
    if (cells.every(cell => cell.trim() === '')) continue
    if (cells.length !== header.length) {
      errors.push(`Row ${rowNumber}: expected ${header.length} columns, found ${cells.length}.`)
      continue
    }

    const raw = {} as Record<PilotColumn, string>
    for (const column of PILOT_COLUMNS) {
      raw[column] = cells[headerIndex.get(column)!] ?? ''
    }

    const participantId = raw.participant_id.trim()
    if (!participantId) {
      errors.push(`Row ${rowNumber}: participant_id is required.`)
    } else if (seenIds.has(participantId)) {
      errors.push(`Row ${rowNumber}: duplicate participant_id "${participantId}".`)
    } else {
      seenIds.add(participantId)
    }

    const completedSession = parseBoolean(
      raw.completed_session,
      rowNumber,
      'completed_session',
      errors
    )
    if (completedSession === null && raw.completed_session.trim() === '') {
      errors.push(`Row ${rowNumber}: completed_session is required.`)
    }
    const completedDelayed = parseBoolean(
      raw.completed_delayed,
      rowNumber,
      'completed_delayed',
      errors
    )
    if (completedDelayed === null && raw.completed_delayed.trim() === '') {
      errors.push(`Row ${rowNumber}: completed_delayed is required.`)
    }

    const preScore = parseNumber(raw.pre_score_12, rowNumber, 'pre_score_12', 0, 12, errors)
    const postScore = parseNumber(raw.post_score_12, rowNumber, 'post_score_12', 0, 12, errors)
    const gainReported = parseNumber(raw.gain, rowNumber, 'gain', -12, 12, errors)
    const transferRaterA = parseNumber(
      raw.transfer_rater_a_20,
      rowNumber,
      'transfer_rater_a_20',
      0,
      20,
      errors
    )
    const transferRaterB = parseNumber(
      raw.transfer_rater_b_20,
      rowNumber,
      'transfer_rater_b_20',
      0,
      20,
      errors
    )
    const transferConsensus = parseNumber(
      raw.transfer_consensus_20,
      rowNumber,
      'transfer_consensus_20',
      0,
      20,
      errors
    )
    const delayedMcq = parseNumber(raw.delayed_mcq_8, rowNumber, 'delayed_mcq_8', 0, 8, errors)
    const configRecall = parseNumber(
      raw.config_recall_5,
      rowNumber,
      'config_recall_5',
      0,
      5,
      errors
    )
    const surveyMean = parseNumber(
      raw.survey_mean_5,
      rowNumber,
      'survey_mean_5',
      1,
      5,
      errors,
      false
    )
    const surveyFind = parseNumber(
      raw.survey_find_5,
      rowNumber,
      'survey_find_5',
      1,
      5,
      errors,
      false
    )
    const setupMinutes = parseNumber(
      raw.setup_minutes,
      rowNumber,
      'setup_minutes',
      0,
      600,
      errors,
      false
    )
    const priorNetworkingWeeks = parseNumber(
      raw.prior_networking_weeks,
      rowNumber,
      'prior_networking_weeks',
      0,
      520,
      errors
    )
    const priorVlanConfig = parseBoolean(
      raw.prior_vlan_config,
      rowNumber,
      'prior_vlan_config',
      errors
    )
    const transferCriticalError = parseBoolean(
      raw.transfer_critical_error,
      rowNumber,
      'transfer_critical_error',
      errors
    )

    const computedGain =
      preScore !== null && postScore !== null ? postScore - preScore : null
    if (gainReported !== null && computedGain !== null && Math.abs(gainReported - computedGain) > 0.01) {
      warnings.push(
        `Row ${rowNumber}: gain ${gainReported} does not match post_score_12 - pre_score_12 (${computedGain}). The computed gain will be used.`
      )
    }

    if (completedSession === true && (preScore === null || postScore === null)) {
      warnings.push(`Row ${rowNumber}: completed_session is yes but pre or post score is missing.`)
    }
    if (completedSession === true && setupMinutes === null) {
      warnings.push(`Row ${rowNumber}: completed_session is yes but setup_minutes is missing.`)
    }
    if (completedSession === true && surveyFind === null) {
      warnings.push(`Row ${rowNumber}: completed_session is yes but survey_find_5 is missing.`)
    }
    if (completedSession === false && (preScore !== null || postScore !== null)) {
      warnings.push(`Row ${rowNumber}: completed_session is no but a pre or post score is present.`)
    }
    if (completedDelayed === true && delayedMcq === null) {
      warnings.push(`Row ${rowNumber}: completed_delayed is yes but delayed_mcq_8 is missing.`)
    }
    if (completedDelayed !== true && delayedMcq !== null) {
      warnings.push(
        `Row ${rowNumber}: delayed_mcq_8 is present but completed_delayed is not yes. The score will not be included in the delayed analysis.`
      )
    }
    if ((transferRaterA === null) !== (transferRaterB === null)) {
      warnings.push(`Row ${rowNumber}: only one transfer rater score is present.`)
    }
    if (transferConsensus === null && (transferRaterA !== null || transferRaterB !== null)) {
      warnings.push(`Row ${rowNumber}: transfer rater scores are present but no consensus score.`)
    }
    if (
      transferCriticalError === true &&
      transferRaterA === null &&
      transferRaterB === null &&
      transferConsensus === null
    ) {
      warnings.push(`Row ${rowNumber}: a critical transfer error is flagged but no transfer score is present.`)
    }

    rows.push({
      participantId,
      cohort: raw.cohort.trim(),
      priorNetworkingWeeks,
      priorVlanConfig,
      setupMinutes,
      preScore,
      postScore,
      gainReported,
      transferRaterA,
      transferRaterB,
      transferConsensus,
      transferCriticalError,
      delayedMcq,
      configRecall,
      surveyMean,
      surveyFind,
      completedSession,
      completedDelayed,
      protocolDeviations: raw.protocol_deviations.trim(),
      notes: raw.notes.trim(),
      rowNumber,
    })
  }

  if (rows.length === 0) {
    errors.push('The CSV has a header but no participant rows.')
  }
  if (rows.length > 0 && rows.every(row => row.participantId === 'P-XXXX')) {
    errors.push(
      'The CSV still contains the template placeholder participant_id "P-XXXX". Replace it with a pseudonymous participant ID.'
    )
  }

  return { rows, errors, warnings }
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleSd(values: number[]): number | null {
  if (values.length < 2) return null
  const average = mean(values)!
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function summarize(values: number[]): StatSummary {
  return {
    n: values.length,
    mean: mean(values),
    sd: sampleSd(values),
    median: median(values),
    min: values.length > 0 ? Math.min(...values) : null,
    max: values.length > 0 ? Math.max(...values) : null,
  }
}

function quantile(sorted: number[], probability: number): number {
  if (sorted.length === 0) throw new Error('Cannot compute a quantile of an empty array')
  if (sorted.length === 1) return sorted[0]
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const weight = position - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function bootstrapMeanCi(
  values: number[],
  seed: number,
  resamples: number
): [number, number] | null {
  if (values.length < 2 || resamples < 100) return null
  const random = mulberry32(seed)
  const means: number[] = []
  for (let sample = 0; sample < resamples; sample += 1) {
    let total = 0
    for (let index = 0; index < values.length; index += 1) {
      total += values[Math.floor(random() * values.length)]
    }
    means.push(total / values.length)
  }
  means.sort((a, b) => a - b)
  return [quantile(means, 0.025), quantile(means, 0.975)]
}

function pearsonR(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null
  const meanX = mean(xs)!
  const meanY = mean(ys)!
  let numerator = 0
  let sumX = 0
  let sumY = 0
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX
    const dy = ys[index] - meanY
    numerator += dx * dy
    sumX += dx ** 2
    sumY += dy ** 2
  }
  if (sumX === 0 || sumY === 0) return null
  return numerator / Math.sqrt(sumX * sumY)
}

function criterion(
  id: string,
  label: string,
  status: CriterionStatus,
  detail: string
): PilotCriterion {
  return { id, label, status, detail }
}

export function computeAnalysis(rows: PilotRow[], options: PilotAnalysisOptions = {}): PilotAnalysis {
  const seed = options.seed ?? 20261021
  const resamples = options.resamples ?? 10000
  const sessionRows = rows.filter(row => row.completedSession === true)
  const paired = sessionRows.filter(
    (row): row is PilotRow & { preScore: number; postScore: number } =>
      row.preScore !== null && row.postScore !== null
  )
  const gains = paired.map(row => row.postScore - row.preScore)
  const preScores = paired.map(row => row.preScore)
  const postScores = paired.map(row => row.postScore)
  const gainSummary = summarize(gains)
  const ci95 = bootstrapMeanCi(gains, seed, resamples)
  const cohensDz =
    gainSummary.mean !== null && gainSummary.sd !== null && gainSummary.sd > 0
      ? gainSummary.mean / gainSummary.sd
      : null

  const delayedRows = sessionRows.filter(
    (row): row is PilotRow & { delayedMcq: number } =>
      row.completedDelayed === true && row.delayedMcq !== null
  )
  const delayed = summarize(delayedRows.map(row => row.delayedMcq))
  const configRecall = summarize(
    sessionRows
      .map(row => row.configRecall)
      .filter((value): value is number => value !== null)
  )
  const survey = summarize(
    sessionRows.map(row => row.surveyMean).filter((value): value is number => value !== null)
  )
  const setup = summarize(
    sessionRows.map(row => row.setupMinutes).filter((value): value is number => value !== null)
  )
  const usabilityFind = summarize(
    sessionRows.map(row => row.surveyFind).filter((value): value is number => value !== null)
  )
  const gainAtLeast2Rate =
    gains.length > 0 ? gains.filter(value => value >= 2).length / gains.length : null

  const transferRows = sessionRows.filter(
    (row): row is PilotRow & { transferConsensus: number } => row.transferConsensus !== null
  )
  const transferValues = transferRows.map(row => row.transferConsensus)
  const transferMean = mean(transferValues)
  const transferSd = sampleSd(transferValues)
  const transferMedian = median(transferValues)
  const rateAtLeast14 =
    transferValues.length > 0
      ? transferValues.filter(value => value >= 14).length / transferValues.length
      : null
  const rateAtLeast12 =
    transferValues.length > 0
      ? transferValues.filter(value => value >= 12).length / transferValues.length
      : null

  const interRaterRows = sessionRows.filter(
    (row): row is PilotRow & { transferRaterA: number; transferRaterB: number } =>
      row.transferRaterA !== null && row.transferRaterB !== null
  )
  const differences = interRaterRows.map(row => Math.abs(row.transferRaterA - row.transferRaterB))
  const exactAgreement =
    interRaterRows.length > 0
      ? interRaterRows.filter(row => row.transferRaterA === row.transferRaterB).length /
        interRaterRows.length
      : null
  const withinOne =
    interRaterRows.length > 0
      ? interRaterRows.filter(row => Math.abs(row.transferRaterA - row.transferRaterB) <= 1)
          .length / interRaterRows.length
      : null
  const withinTwo =
    interRaterRows.length > 0
      ? interRaterRows.filter(row => Math.abs(row.transferRaterA - row.transferRaterB) <= 2)
          .length / interRaterRows.length
      : null
  const meanAbsoluteDifference = mean(differences)

  const criticalErrorRows = transferRows.filter(row => row.transferCriticalError !== null)
  const criticalErrors = criticalErrorRows.filter(row => row.transferCriticalError === true).length
  const criticalErrorUnknown = transferRows.filter(row => row.transferCriticalError === null).length
  const criticalErrorIds = transferRows
    .filter(row => row.transferCriticalError === true)
    .map(row => row.participantId)

  const delayedCompleters = sessionRows.filter(row => row.completedDelayed === true).length
  const sessionCompleters = sessionRows.length
  const completion = {
    sessionRate: rows.length > 0 ? sessionCompleters / rows.length : null,
    delayedRate: sessionCompleters > 0 ? delayedCompleters / sessionCompleters : null,
    delayedEnrolledRate: rows.length > 0 ? delayedCompleters / rows.length : null,
  }
  const criticalErrorRate =
    transferValues.length > 0 ? criticalErrors / transferValues.length : null
  const delayedMeanRatio =
    delayed.mean !== null && mean(postScores) !== null && mean(postScores)! > 0
      ? delayed.mean / mean(postScores)!
      : null
  const rateDelayedAtLeast6 =
    delayed.n > 0
      ? delayedRows.filter(row => row.delayedMcq >= 6).length / delayed.n
      : null
  const rateRecallAtLeast4 =
    configRecall.n > 0
      ? sessionRows
          .map(row => row.configRecall)
          .filter((value): value is number => value !== null)
          .filter(value => value >= 4).length / configRecall.n
      : null

  const criteria: PilotCriterion[] = []
  criteria.push(
    criterion(
      'sample',
      '5–8 novices complete the session',
      sessionCompleters >= 5 ? 'met' : 'not-met',
      `${sessionCompleters} session completer(s); the feasibility target is 5–8.`
    )
  )
  criteria.push(
    criterion(
      'session-completion',
      'At least 80% of enrolled novices complete Session 1',
      completion.sessionRate !== null && completion.sessionRate >= 0.8 ? 'met' : 'not-met',
      completion.sessionRate === null
        ? 'No enrolled rows, so the rate is not estimable.'
        : `${formatPercent(completion.sessionRate)} of enrolled novices completed Session 1.`
    )
  )
  criteria.push(
    criterion(
      'delayed-completion',
      'At least 80% of enrolled novices complete the delayed check',
      completion.delayedEnrolledRate !== null && completion.delayedEnrolledRate >= 0.8
        ? 'met'
        : 'not-met',
      completion.delayedEnrolledRate === null
        ? 'No enrolled rows, so the rate is not estimable.'
        : `${formatPercent(completion.delayedEnrolledRate)} of enrolled novices completed the delayed check.`
    )
  )
  if (setup.n === 0 || setup.median === null) {
    criteria.push(
      criterion(
        'setup',
        'Median setup time is at most 10 minutes',
        'insufficient',
        'No setup_minutes values were recorded.'
      )
    )
  } else {
    criteria.push(
      criterion(
        'setup',
        'Median setup time is at most 10 minutes',
        setup.median <= 10 ? 'met' : 'not-met',
        `Median setup ${formatNumber(setup.median)} minutes (n=${setup.n}).`
      )
    )
  }
  if (gainSummary.n < 5 || gainSummary.mean === null || ci95 === null || gainAtLeast2Rate === null) {
    criteria.push(
      criterion(
        'learning',
        'Mean gain ≥3, positive 95% interval, and ≥75% gain ≥2',
        'insufficient',
        `Only ${gainSummary.n} paired pre/post score(s); the criterion needs at least 5.`
      )
    )
  } else {
    const passed = gainSummary.mean >= 3 && ci95[0] > 0 && gainAtLeast2Rate >= 0.75
    criteria.push(
      criterion(
        'learning',
        'Mean gain ≥3, positive 95% interval, and ≥75% gain ≥2',
        passed ? 'met' : 'not-met',
        `Mean gain ${formatNumber(gainSummary.mean)}; 95% bootstrap CI ${formatNumber(ci95[0])} to ${formatNumber(ci95[1])}; ${formatPercent(gainAtLeast2Rate)} gained at least 2 points.`
      )
    )
  }
  if (transferValues.length < 5) {
    criteria.push(
      criterion(
        'transfer',
        '≥70% score ≥14/20, median ≥15/20, and ≤25% critical errors',
        'insufficient',
        `Only ${transferValues.length} consensus transfer score(s); the criterion needs at least 5.`
      )
    )
  } else if (transferMean === null || transferMedian === null || rateAtLeast14 === null || criticalErrorRate === null) {
    criteria.push(
      criterion(
        'transfer',
        '≥70% score ≥14/20, median ≥15/20, and ≤25% critical errors',
        'insufficient',
        'The transfer summary could not be computed.'
      )
    )
  } else if (criticalErrorUnknown > 0) {
    criteria.push(
      criterion(
        'transfer',
        '≥70% score ≥14/20, median ≥15/20, and ≤25% critical errors',
        'insufficient',
        `${criticalErrorUnknown} transfer row(s) have an unknown critical-error flag.`
      )
    )
  } else {
    const passed = rateAtLeast14 >= 0.7 && transferMedian >= 15 && criticalErrorRate <= 0.25
    criteria.push(
      criterion(
        'transfer',
        '≥70% score ≥14/20, median ≥15/20, and ≤25% critical errors',
        passed ? 'met' : 'not-met',
        `${formatPercent(rateAtLeast14)} scored at least 14/20; median ${formatNumber(transferMedian)}/20; ${criticalErrors} critical error(s) (${formatPercent(criticalErrorRate)}).`
      )
    )
  }
  if (
    delayed.n === 0 ||
    delayedMeanRatio === null ||
    rateDelayedAtLeast6 === null ||
    rateRecallAtLeast4 === null
  ) {
    criteria.push(
      criterion(
        'retention',
        'Delayed mean ≥70% of post mean, ≥60% score ≥6/8, and ≥60% recall ≥4/5',
        'insufficient',
        'Delayed or configuration-recall data are missing.'
      )
    )
  } else {
    const passed =
      delayedMeanRatio >= 0.7 && rateDelayedAtLeast6 >= 0.6 && rateRecallAtLeast4 >= 0.6
    criteria.push(
      criterion(
        'retention',
        'Delayed mean ≥70% of post mean, ≥60% score ≥6/8, and ≥60% recall ≥4/5',
        passed ? 'met' : 'not-met',
        `Delayed/post mean ratio ${formatPercent(delayedMeanRatio)}; ${formatPercent(rateDelayedAtLeast6)} scored at least 6/8; ${formatPercent(rateRecallAtLeast4)} recalled at least 4/5.`
      )
    )
  }
  if (usabilityFind.n === 0 || usabilityFind.mean === null) {
    criteria.push(
      criterion(
        'usability',
        'Mean ≥4.0 on “I could find the section I needed” with no interface abandonment',
        'insufficient',
        'No survey_find_5 values were recorded.'
      )
    )
  } else {
    criteria.push(
      criterion(
        'usability',
        'Mean ≥4.0 on “I could find the section I needed” with no interface abandonment',
        usabilityFind.mean >= 4 ? 'met' : 'not-met',
        `Mean ${formatNumber(usabilityFind.mean)}/5 (n=${usabilityFind.n}); check observer notes for interface abandonment.`
      )
    )
  }
  criteria.push(
    criterion(
      'content-review',
      'Two instructors accept at least 90% of checks with zero unresolved P0 findings',
      'not-assessed',
      'Separate instructor review gate; see docs/evaluation/CONTENT_REVIEW.md.'
    )
  )
  criteria.push(
    criterion(
      'language-review',
      'Native Arabic and Sorani reviewers accept the UI strings with zero unresolved P0 findings',
      'not-assessed',
      'Separate language review gate; see docs/evaluation/STRINGS_REVIEW.md.'
    )
  )
  criteria.push(
    criterion(
      'p0-blocker',
      'No unresolved P0 blocker remains',
      'not-assessed',
      'Process gate; confirm in the observer log and the content/language reviews.'
    )
  )
  criteria.push(
    criterion(
      'fidelity',
      'Simulator behavior matches the lab and external acceptance checks',
      'not-assessed',
      'Separate simulator-fidelity and external-acceptance gate.'
    )
  )

  const participants: PilotParticipant[] = rows.map(row => ({
    id: row.participantId,
    cohort: row.cohort,
    pre: row.preScore,
    post: row.postScore,
    gain:
      row.preScore !== null && row.postScore !== null ? row.postScore - row.preScore : null,
    delayed: row.completedDelayed === true ? row.delayedMcq : null,
    transfer: row.transferConsensus,
    criticalError: row.transferCriticalError,
    completedSession: row.completedSession,
    completedDelayed: row.completedDelayed,
  }))

  return {
    source: options.source ?? 'pilot CSV',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    seed,
    resamples,
    counts: {
      enrolled: rows.length,
      sessionCompleters,
      delayedCompleters,
      delayedScored: delayedRows.length,
      transferScored: transferValues.length,
      criticalErrors,
      criticalErrorUnknown,
    },
    completion,
    prePost: {
      n: gainSummary.n,
      preMean: mean(preScores),
      postMean: mean(postScores),
      gainMean: gainSummary.mean,
      gainSd: gainSummary.sd,
      gainMedian: gainSummary.median,
      cohensDz,
      ci95,
      minGain: gainSummary.min,
      maxGain: gainSummary.max,
      gainAtLeast2Rate,
    },
    delayed,
    configRecall,
    survey,
    setup,
    usabilityFind,
    transfer: {
      n: transferValues.length,
      mean: transferMean,
      sd: transferSd,
      median: transferMedian,
      rateAtLeast14,
      rateAtLeast12,
      criticalErrorRate,
    },
    retention: {
      delayedMeanRatio,
      rateDelayedAtLeast6,
      rateRecallAtLeast4,
    },
    interRater: {
      n: interRaterRows.length,
      exactAgreement,
      withinOne,
      withinTwo,
      meanAbsoluteDifference,
      pearsonR: pearsonR(
        interRaterRows.map(row => row.transferRaterA),
        interRaterRows.map(row => row.transferRaterB)
      ),
    },
    criteria,
    warnings: options.warnings ?? [],
    participants,
    protocolDeviations: rows
      .filter(row => row.protocolDeviations.length > 0)
      .map(row => ({ id: row.participantId, text: row.protocolDeviations })),
    criticalErrorIds,
  }
}

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits)
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

function formatStat(summary: StatSummary): string {
  if (summary.n === 0) return 'No data'
  const parts = [`mean ${formatNumber(summary.mean)}`]
  if (summary.sd !== null) parts.push(`SD ${formatNumber(summary.sd)}`)
  if (summary.median !== null) parts.push(`median ${formatNumber(summary.median)}`)
  if (summary.min !== null && summary.max !== null) {
    parts.push(`range ${formatNumber(summary.min)}–${formatNumber(summary.max)}`)
  }
  return `${parts.join(', ')} (n=${summary.n})`
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function statusLabel(status: CriterionStatus): string {
  switch (status) {
    case 'met':
      return 'PASS'
    case 'not-met':
      return 'FAIL'
    case 'insufficient':
      return 'INSUFFICIENT'
    case 'not-assessed':
      return 'N/A'
  }
}

export function renderMarkdown(analysis: PilotAnalysis): string {
  const lines: string[] = []
  lines.push('# CCNA Academy pilot analysis')
  lines.push('')
  lines.push(`**Source:** \`${analysis.source.replace(/`/g, '\\`')}\`  `)
  lines.push(`**Generated:** ${analysis.generatedAt}  `)
  lines.push(`**Bootstrap:** ${analysis.resamples.toLocaleString('en-US')} resamples, seed ${analysis.seed}`)
  lines.push('')
  lines.push(
    '> This is a single-group feasibility analysis. It is not a randomized comparison and cannot establish that the Academy causes better learning than the simulator alone. A comparison group is a separate study.'
  )
  lines.push('')
  lines.push('## Sample')
  lines.push('')
  lines.push('| Measure | Count |')
  lines.push('| --- | ---: |')
  lines.push(`| Enrolled rows | ${analysis.counts.enrolled} |`)
  lines.push(`| Completed the session | ${analysis.counts.sessionCompleters} |`)
  lines.push(`| Completed the delayed check | ${analysis.counts.delayedCompleters} |`)
  lines.push(`| Delayed check scored | ${analysis.counts.delayedScored} |`)
  lines.push(`| Transfer task scored | ${analysis.counts.transferScored} |`)
  lines.push(`| Session completion rate | ${formatPercent(analysis.completion.sessionRate)} |`)
  lines.push(`| Delayed completion rate (of session completers) | ${formatPercent(analysis.completion.delayedRate)} |`)
  lines.push(`| Delayed completion rate (of enrolled) | ${formatPercent(analysis.completion.delayedEnrolledRate)} |`)
  lines.push('')
  lines.push('## Pre-test and post-test')
  lines.push('')
  lines.push('| Measure | Value |')
  lines.push('| --- | --- |')
  lines.push(`| Paired learners | ${analysis.prePost.n} |`)
  lines.push(`| Pre-test mean (0–12) | ${formatNumber(analysis.prePost.preMean)} |`)
  lines.push(`| Post-test mean (0–12) | ${formatNumber(analysis.prePost.postMean)} |`)
  lines.push(`| Mean gain | ${formatNumber(analysis.prePost.gainMean)} |`)
  lines.push(`| Gain SD | ${formatNumber(analysis.prePost.gainSd)} |`)
  lines.push(`| Gain median | ${formatNumber(analysis.prePost.gainMedian)} |`)
  lines.push(
    `| Gain range | ${analysis.prePost.minGain === null || analysis.prePost.maxGain === null ? '—' : `${formatNumber(analysis.prePost.minGain)} to ${formatNumber(analysis.prePost.maxGain)}`} |`
  )
  lines.push(
    `| 95% bootstrap CI for mean gain | ${analysis.prePost.ci95 ? `${formatNumber(analysis.prePost.ci95[0])} to ${formatNumber(analysis.prePost.ci95[1])}` : 'not estimable'} |`
  )
  lines.push(`| Cohen's dz (descriptive only) | ${formatNumber(analysis.prePost.cohensDz)} |`)
  lines.push(`| Gained at least 2 points | ${formatPercent(analysis.prePost.gainAtLeast2Rate)} |`)
  lines.push('')
  lines.push('## Delayed, recall, and survey outcomes')
  lines.push('')
  lines.push('| Measure | Summary |')
  lines.push('| --- | --- |')
  lines.push(`| Delayed MCQ (0–8) | ${formatStat(analysis.delayed)} |`)
  lines.push(`| Configuration recall (0–5) | ${formatStat(analysis.configRecall)} |`)
  lines.push(`| Survey mean (1–5) | ${formatStat(analysis.survey)} |`)
  lines.push(`| Delayed/post mean ratio | ${formatPercent(analysis.retention.delayedMeanRatio)} |`)
  lines.push(`| Delayed at or above 6/8 | ${formatPercent(analysis.retention.rateDelayedAtLeast6)} |`)
  lines.push(`| Recall at or above 4/5 | ${formatPercent(analysis.retention.rateRecallAtLeast4)} |`)
  lines.push('')
  lines.push('## Process and usability')
  lines.push('')
  lines.push('| Measure | Summary |')
  lines.push('| --- | --- |')
  lines.push(`| Setup time (minutes) | ${formatStat(analysis.setup)} |`)
  lines.push(`| “I could find the section I needed” (1–5) | ${formatStat(analysis.usabilityFind)} |`)
  lines.push('')
  lines.push('## Transfer task and inter-rater agreement')
  lines.push('')
  lines.push('| Measure | Value |')
  lines.push('| --- | --- |')
  lines.push(`| Consensus transfer score (0–20) | ${analysis.transfer.mean === null ? '—' : `${formatNumber(analysis.transfer.mean)} (SD ${formatNumber(analysis.transfer.sd)})`} |`)
  lines.push(`| Median | ${formatNumber(analysis.transfer.median)} |`)
  lines.push(`| At or above 14/20 | ${formatPercent(analysis.transfer.rateAtLeast14)} |`)
  lines.push(`| At or above 12/20 | ${formatPercent(analysis.transfer.rateAtLeast12)} |`)
  lines.push(`| Critical errors | ${analysis.counts.criticalErrors} (${formatPercent(analysis.transfer.criticalErrorRate)}) |`)
  lines.push(`| Unknown critical-error flags | ${analysis.counts.criticalErrorUnknown} |`)
  lines.push(`| Raters with both scores | ${analysis.interRater.n} |`)
  lines.push(`| Exact agreement | ${formatPercent(analysis.interRater.exactAgreement)} |`)
  lines.push(`| Agreement within 1 point | ${formatPercent(analysis.interRater.withinOne)} |`)
  lines.push(`| Agreement within 2 points | ${formatPercent(analysis.interRater.withinTwo)} |`)
  lines.push(`| Mean absolute difference | ${formatNumber(analysis.interRater.meanAbsoluteDifference)} |`)
  lines.push(`| Pearson r | ${formatNumber(analysis.interRater.pearsonR)} |`)
  lines.push('')
  lines.push('## Pre-registered success criteria')
  lines.push('')
  lines.push('| Criterion | Status | Detail |')
  lines.push('| --- | --- | --- |')
  for (const item of analysis.criteria) {
    lines.push(
      `| ${escapeCell(item.label)} | **${statusLabel(item.status)}** | ${escapeCell(item.detail)} |`
    )
  }
  lines.push('')
  lines.push('## Data quality')
  lines.push('')
  if (analysis.warnings.length === 0) {
    lines.push('No warnings.')
  } else {
    for (const warning of analysis.warnings) lines.push(`- ${warning}`)
  }
  lines.push('')
  lines.push('### Critical transfer errors')
  lines.push('')
  if (analysis.criticalErrorIds.length === 0) {
    lines.push('None reported.')
  } else {
    for (const id of analysis.criticalErrorIds) lines.push(`- \`${escapeCell(id)}\``)
  }
  lines.push('')
  lines.push('### Protocol deviations')
  lines.push('')
  if (analysis.protocolDeviations.length === 0) {
    lines.push('None recorded.')
  } else {
    for (const item of analysis.protocolDeviations) {
      lines.push(`- \`${escapeCell(item.id)}\`: ${escapeCell(item.text)}`)
    }
  }
  lines.push('')
  lines.push('## Participant audit table')
  lines.push('')
  lines.push('| ID | Cohort | Pre | Post | Gain | Delayed | Transfer | Critical error |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |')
  for (const participant of analysis.participants) {
    lines.push(
      `| ${escapeCell(participant.id)} | ${escapeCell(participant.cohort)} | ${participant.pre ?? '—'} | ${participant.post ?? '—'} | ${participant.gain ?? '—'} | ${participant.delayed ?? '—'} | ${participant.transfer ?? '—'} | ${participant.criticalError === null ? 'unknown' : participant.criticalError ? 'yes' : 'no'} |`
    )
  }
  lines.push('')
  lines.push('## Interpretation guardrails')
  lines.push('')
  lines.push('- A PASS on the learning criterion is a signal that the pilot is worth continuing. It is not proof of efficacy.')
  lines.push('- The transfer task is scored by instructors who are blind to condition and to the Academy content review.')
  lines.push('- The delayed check measures retention, not the ability to recognize a familiar screen.')
  lines.push('- The content-review, language-review, and simulator-fidelity criteria are separate gates and are not assessed by this CSV.')
  lines.push('- Missing data are excluded pairwise; no values are imputed.')
  lines.push('- Raw notes remain in the private CSV and are intentionally not copied into this report.')
  lines.push('')
  lines.push('## Privacy')
  lines.push('')
  lines.push(
    'This report and the participant CSV contain pseudonymous data. Keep them in `docs/evaluation/private/`, which is gitignored. Publish only aggregate results and anonymized findings.'
  )
  lines.push('')
  return `${lines.join('\n')}\n`
}
