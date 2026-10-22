import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  ccnaChapters,
  ccnaChecks,
  ccnaSections,
  getSectionChecks,
  getSectionLab,
} from '../src/content/ccnaCourse'
import { messages } from '../src/i18n/messages'

const root = process.cwd()
const outputDirectory = join(root, 'docs/evaluation/generated')

function cell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(rows: unknown[][]): string {
  return `${rows.map(row => row.map(cell).join(',')).join('\n')}\n`
}

function writeCsv(name: string, rows: unknown[][]): void {
  writeFileSync(join(outputDirectory, name), `\uFEFF${toCsv(rows)}`, 'utf8')
}

function collectSourceFiles(path: string): string[] {
  if (!statSync(path, { throwIfNoEntry: false })) return []
  const stat = statSync(path)
  if (stat.isFile()) return [path]
  return readdirSync(path).flatMap(entry => collectSourceFiles(join(path, entry)))
}

const academySources = collectSourceFiles(join(root, 'src/components/academy'))
const entrySources = [
  'src/components/cisco/CiscoTitleBar.tsx',
  'src/components/cisco/CiscoMenuBar.tsx',
  'src/components/cisco/CampusTraining.tsx',
  'src/components/cisco/TrainingGuide.tsx',
  'src/components/modals/WelcomeModal.tsx',
].map(file => join(root, file))
const allSources = [...academySources, ...entrySources].filter(file => /\.(tsx|ts)$/.test(file))

const keyLocations = new Map<string, Set<string>>()
for (const file of allSources) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\bt\('([^']+)'\)/g)) {
    const key = match[1]
    if (!keyLocations.has(key)) keyLocations.set(key, new Set())
    keyLocations.get(key)!.add(relative(root, file))
  }
}

mkdirSync(outputDirectory, { recursive: true })

const sectionOrder = new Map(ccnaSections.map((section, index) => [section.id, index]))
const sectionById = new Map(ccnaSections.map(section => [section.id, section]))

if (ccnaChecks.length !== 39) throw new Error(`Expected 39 checks, found ${ccnaChecks.length}`)
if (ccnaSections.length !== 52) throw new Error(`Expected 52 sections, found ${ccnaSections.length}`)

const sortedChecks = [...ccnaChecks].sort((a, b) =>
  (sectionOrder.get(a.sectionId) ?? 999) - (sectionOrder.get(b.sectionId) ?? 999)
)

writeCsv('academy-checks.csv', [
  [
    'check_id',
    'section_id',
    'section_number',
    'section_title',
    'prompt',
    'option_a',
    'option_b',
    'option_c',
    'option_d',
    'answer_letter',
    'answer_text',
    'explanation',
    'reviewer_correct',
    'reviewer_clarity_1_5',
    'reviewer_distractors',
    'reviewer_consistency',
    'reviewer_deck_artifact',
    'reviewer_comment',
  ],
  ...sortedChecks.map(check => {
    const section = sectionById.get(check.sectionId)
    const answerLetter = String.fromCharCode(65 + check.answer)
    return [
      check.id,
      check.sectionId,
      section?.number ?? '',
      section?.title ?? '',
      check.prompt,
      check.options[0] ?? '',
      check.options[1] ?? '',
      check.options[2] ?? '',
      check.options[3] ?? '',
      answerLetter,
      check.options[check.answer] ?? '',
      check.explanation,
      '',
      '',
      '',
      '',
      '',
      '',
    ]
  }),
])

writeCsv('academy-sections.csv', [
  ['section_id', 'number', 'title', 'chapter_id', 'chapter_label', 'chapter_title', 'words', 'check_ids', 'lab_lesson'],
  ...ccnaSections.map(section => [
    section.id,
    section.number,
    section.title,
    section.chapterId,
    section.chapterLabel,
    section.chapterTitle,
    section.markdown.split(/\s+/).filter(Boolean).length,
    getSectionChecks(section.id).map(check => check.id).join('; '),
    getSectionLab(section.id)?.lesson ?? '',
  ]),
])

const messagesByKey = messages as Record<string, readonly [string, string, string]>

// The training panel and the practical exam render keys through template
// literals (`task.${id}`, `lesson.${id}`, `diag.${code}`), which a static
// `t('...')` scan cannot see. Include the whole dynamic families so the native
// review packet cannot silently omit a task, lesson, or diagnostic string.
const dynamicSources: readonly [string, string][] = [
  ['task.', 'src/components/cisco/CampusTraining.tsx'],
  ['lesson.', 'src/components/cisco/CampusTraining.tsx'],
  ['diag.', 'src/components/cisco/CampusTraining.tsx'],
]
for (const key of Object.keys(messagesByKey)) {
  const source = dynamicSources.find(([prefix]) => key.startsWith(prefix))?.[1]
  if (!source) continue
  const locations = keyLocations.get(key) ?? new Set<string>()
  locations.add(source)
  if (key.startsWith('task.exam-')) locations.add('src/components/academy/AcademyPractice.tsx')
  keyLocations.set(key, locations)
}
for (const key of ['Guided', 'Recall', 'Troubleshoot', 'Free practice', 'Exam']) {
  if (!messagesByKey[key]) continue
  const locations = keyLocations.get(key) ?? new Set<string>()
  locations.add('src/components/cisco/CampusTraining.tsx')
  keyLocations.set(key, locations)
}

const missingKeys = [...keyLocations.keys()].filter(key => !messagesByKey[key])
if (missingKeys.length > 0) {
  throw new Error(`Academy keys missing from messages.ts: ${missingKeys.join(', ')}`)
}

writeCsv('academy-ui-strings.csv', [
  ['key', 'english', 'arabic', 'central_kurdish', 'used_in', 'arabic_verdict', 'arabic_suggestion', 'kurdish_verdict', 'kurdish_suggestion', 'notes'],
  ...[...keyLocations.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, locations]) => {
      const translations = messagesByKey[key]
      return [
        key,
        translations[0],
        translations[1],
        translations[2],
        [...locations].sort().join('; '),
        '',
        '',
        '',
        '',
        '',
      ]
    }),
])

const academyStrings = [...keyLocations.keys()].length
console.log(`Wrote ${sortedChecks.length} checks, ${ccnaSections.length} sections, and ${academyStrings} Academy UI strings to ${relative(root, outputDirectory)}`)
console.log(`Chapters: ${ccnaChapters.map(chapter => `${chapter.id} (${chapter.sections.length})`).join(', ')}`)
