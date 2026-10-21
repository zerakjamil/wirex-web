import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import {
  PILOT_COLUMNS,
  computeAnalysis,
  parsePilotCsv,
  renderMarkdown,
} from '../src/content/pilotAnalysis'

interface CliOptions {
  input: string
  outMd: string
  outJson: string
  seed: number
  resamples: number
}

function usage(): string {
  return [
    'Usage: npm run pilot:analyze -- <pilot.csv> [options]',
    '',
    'Options:',
    '  --out-md <path>     Markdown report path (default: docs/evaluation/private/pilot-report.md)',
    '  --out-json <path>   JSON analysis path (default: docs/evaluation/private/pilot-report.json)',
    '  --seed <integer>    Bootstrap seed (default: 20261021)',
    '  --resamples <n>     Bootstrap resamples (default: 10000)',
    '  --help              Show this message',
    '',
    'Input columns:',
    `  ${PILOT_COLUMNS.join(', ')}`,
    '',
    'The template is docs/evaluation/pilot-data-template.csv.',
    'Reports and participant data belong in docs/evaluation/private/, which is gitignored.',
  ].join('\n')
}

function parseInteger(value: string | undefined, name: string, minimum: number): number {
  if (value === undefined) throw new Error(`${name} requires a value`)
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`)
  }
  return parsed
}

function parseArgs(args: string[]): CliOptions | null {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) return null

  let input: string | undefined
  let outMd = 'docs/evaluation/private/pilot-report.md'
  let outJson = 'docs/evaluation/private/pilot-report.json'
  let seed = 20261021
  let resamples = 10000

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--out-md') {
      outMd = args[++index] ?? outMd
      continue
    }
    if (arg === '--out-json') {
      outJson = args[++index] ?? outJson
      continue
    }
    if (arg === '--seed') {
      seed = parseInteger(args[++index], '--seed', 0)
      continue
    }
    if (arg === '--resamples') {
      resamples = parseInteger(args[++index], '--resamples', 100)
      continue
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    if (input) throw new Error(`Unexpected extra argument: ${arg}`)
    input = arg
  }

  if (!input) throw new Error('Provide the pilot CSV path')
  return { input, outMd, outJson, seed, resamples }
}

function main(): void {
  let options: CliOptions | null
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error('')
    console.error(usage())
    process.exitCode = 1
    return
  }

  if (!options) {
    console.log(usage())
    return
  }

  const inputPath = resolve(options.input)
  const source = relative(process.cwd(), inputPath).startsWith('..')
    ? basename(inputPath)
    : relative(process.cwd(), inputPath)

  let parsed: ReturnType<typeof parsePilotCsv>
  try {
    parsed = parsePilotCsv(readFileSync(inputPath, 'utf8'))
  } catch (error) {
    console.error(`Could not read ${inputPath}: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }

  if (parsed.errors.length > 0) {
    console.error(`Pilot CSV has ${parsed.errors.length} validation error(s):`)
    for (const error of parsed.errors) console.error(`- ${error}`)
    console.error('No report was written. Fix the CSV and run again.')
    process.exitCode = 1
    return
  }

  if (parsed.rows.length === 0) {
    console.error('The CSV has no participant rows. Start from docs/evaluation/pilot-data-template.csv.')
    process.exitCode = 1
    return
  }

  const analysis = computeAnalysis(parsed.rows, {
    source,
    seed: options.seed,
    resamples: options.resamples,
    warnings: parsed.warnings,
  })
  const markdown = renderMarkdown(analysis)

  mkdirSync(dirname(options.outMd), { recursive: true })
  mkdirSync(dirname(options.outJson), { recursive: true })
  writeFileSync(options.outMd, markdown, 'utf8')
  writeFileSync(options.outJson, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8')

  const gain = analysis.prePost.gainMean
  const ci = analysis.prePost.ci95
  console.log('Academy pilot analysis')
  console.log(`Source: ${source}`)
  console.log(
    `Participants: ${analysis.counts.enrolled} enrolled, ${analysis.counts.sessionCompleters} completed the session, ${analysis.counts.delayedCompleters} completed the delayed check`
  )
  console.log(
    `Mean pre-to-post gain: ${gain === null ? 'not estimable' : gain.toFixed(2)}${ci ? ` (95% bootstrap CI ${ci[0].toFixed(2)} to ${ci[1].toFixed(2)})` : ''}`
  )
  console.log('Criteria:')
  for (const criterion of analysis.criteria) {
    console.log(`- ${criterion.label}: ${criterion.status} — ${criterion.detail}`)
  }
  console.log(`Wrote ${resolve(options.outMd)}`)
  console.log(`Wrote ${resolve(options.outJson)}`)
  console.log('These reports contain pseudonymous participant data. Keep them in docs/evaluation/private/.')
}

main()
