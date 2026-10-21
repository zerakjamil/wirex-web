import test from 'node:test'
import assert from 'node:assert/strict'
import { lessonIds } from '@/simulator/trainingLabs'
import {
  ccnaChapters,
  ccnaChecks,
  ccnaLessonSection,
  ccnaRescuePaths,
  ccnaSectionNotes,
  ccnaSections,
  ccnaStats,
  getAdjacentSections,
  getChapterChecks,
  getReadingMinutes,
  getRescueSections,
  getSection,
  getSectionCommands,
  getSectionLab,
  getSectionQuickHits,
  getSectionSummary,
  searchCcnaSections,
} from './ccnaCourse'

test('course has five chapters, forty-six sections, and unique identifiers', () => {
  assert.equal(ccnaChapters.length, 5)
  assert.equal(ccnaSections.length, 46)
  assert.equal(new Set(ccnaSections.map(section => section.id)).size, ccnaSections.length)
  assert.equal(new Set(ccnaChapters.map(chapter => chapter.id)).size, ccnaChapters.length)
  assert.deepEqual(ccnaChapters.map(chapter => chapter.order), [1, 2, 3, 4, 5])
  for (const chapter of ccnaChapters) {
    assert.ok(chapter.sections.length > 0, chapter.id)
    assert.ok(chapter.label.trim(), chapter.id)
    assert.ok(chapter.kicker.trim(), chapter.id)
    assert.ok(chapter.description.trim(), chapter.id)
    assert.match(chapter.accent, /^#[0-9a-f]{6}$/i, chapter.id)
    for (const section of chapter.sections) {
      assert.equal(section.chapterId, chapter.id)
      assert.equal(section.chapterTitle, chapter.title)
      assert.ok(section.title.trim(), section.id)
      assert.ok(section.number.trim(), section.id)
      assert.ok(section.markdown.length > 120, section.id)
    }
  }
})

test('stats describe the core course, checks, and rescue paths', () => {
  assert.equal(ccnaStats.chapters, 4)
  assert.equal(ccnaStats.sections, 43)
  assert.equal(ccnaStats.checks, ccnaChecks.length)
  assert.equal(ccnaStats.rescuePaths, 3)
  assert.equal(ccnaChecks.length, 33)
})

test('every check is answerable, explained, and attached to a real section', () => {
  assert.equal(new Set(ccnaChecks.map(check => check.id)).size, ccnaChecks.length)
  for (const check of ccnaChecks) {
    assert.ok(getSection(check.sectionId), check.id)
    assert.ok(check.prompt.trim(), check.id)
    assert.equal(check.options.length, 4, check.id)
    assert.equal(new Set(check.options).size, 4, check.id)
    assert.ok(Number.isInteger(check.answer) && check.answer >= 0 && check.answer < check.options.length, check.id)
    assert.ok(check.explanation.trim(), check.id)
    assert.ok(check.explanation.length > 30, check.id)
  }
  for (const chapter of ccnaChapters) {
    assert.equal(getChapterChecks(chapter.id).length > 0, chapter.id !== 'appendix', chapter.id)
  }
})

test('rescue paths and labs only reference existing sections and training lessons', () => {
  assert.equal(new Set(ccnaRescuePaths.map(path => path.id)).size, ccnaRescuePaths.length)
  const knownLessons = new Set(lessonIds)
  for (const path of ccnaRescuePaths) {
    assert.ok(path.title.trim())
    assert.ok(path.description.trim())
    assert.ok(path.minutes > 0)
    assert.ok(path.sectionIds.length >= 6)
    assert.equal(new Set(path.sectionIds).size, path.sectionIds.length)
    assert.equal(getRescueSections(path).length, path.sectionIds.length)
    if (path.lab) assert.ok(knownLessons.has(path.lab.lesson), path.id)
  }
  for (const [lesson, sectionId] of Object.entries(ccnaLessonSection)) {
    assert.ok(knownLessons.has(lesson as (typeof lessonIds)[number]), lesson)
    assert.ok(getSection(sectionId), `${lesson} -> ${sectionId}`)
  }
  assert.equal(ccnaLessonSection.tcpip, '1.8')
  assert.equal(ccnaLessonSection.ethernet, '2.9')
  assert.equal(ccnaLessonSection.vlans, '4.5')
  assert.equal(ccnaLessonSection.campus, '3.6')
})

test('section notes and helpers stay usable across the entire course', () => {
  for (const section of ccnaSections) {
    const summary = getSectionSummary(section.id)
    assert.ok(summary.length > 20, section.id)
    assert.ok(!summary.includes('```'), section.id)
    const minutes = getReadingMinutes(section.id)
    assert.ok(minutes >= 2 && minutes <= 20, section.id)
    const quickHits = getSectionQuickHits(section.id)
    assert.ok(Array.isArray(quickHits))
    for (const hit of quickHits) assert.ok(hit.length > 0, section.id)
    const commands = getSectionCommands(section.id)
    for (const command of commands) assert.ok(command.trim().length > 0, section.id)
    if (section.id in ccnaSectionNotes) {
      const note = ccnaSectionNotes[section.id]
      if (note.why) assert.ok(note.why.length > 20, section.id)
      if (note.trap) assert.ok(note.trap.length > 15, section.id)
      if (note.lab) assert.ok(lessonIds.includes(note.lab.lesson), section.id)
    }
    if (getSectionLab(section.id)) assert.ok(ccnaSectionNotes[section.id]?.lab, section.id)
  }
  assert.equal(getSectionLab('1.8')?.lesson, 'tcpip')
  assert.equal(getSectionLab('2.9')?.lesson, 'ethernet')
  assert.equal(getSectionLab('3.6')?.lesson, 'campus')
  assert.equal(getSectionLab('4.5')?.lesson, 'vlans')
  assert.equal(getSectionLab('missing'), undefined)
})

test('adjacent navigation respects the first and last section', () => {
  const first = ccnaSections[0]
  const last = ccnaSections[ccnaSections.length - 1]
  assert.equal(getAdjacentSections(first.id).previous, undefined)
  assert.equal(getAdjacentSections(first.id).next?.id, ccnaSections[1].id)
  assert.equal(getAdjacentSections(last.id).next, undefined)
  assert.equal(getAdjacentSections(last.id).previous?.id, ccnaSections[ccnaSections.length - 2].id)
  assert.deepEqual(getAdjacentSections('missing'), {})
})

test('search returns sections by title, chapter, or body and caps the result set', () => {
  assert.ok(searchCcnaSections('vlan').length > 0)
  assert.ok(searchCcnaSections('VLAN').some(section => section.chapterId === 'ch8'))
  assert.ok(searchCcnaSections('broadcast domain').length > 0)
  assert.equal(searchCcnaSections('   ').length, 0)
  assert.ok(searchCcnaSections('e').length <= 24)
  assert.equal(searchCcnaSections('zzzz-not-in-course').length, 0)
})

test('known lecture-deck errors never become Academy instructions', () => {
  const text = ccnaSections.filter(section => section.chapterId !== 'appendix').map(section => section.markdown).join('\n')
  assert.equal(/channel-group\s+1\s+mode\s+ac\b/i.test(text), false)
  assert.equal(/192\.168\.1\.128\/26/i.test(text), false)
  assert.equal(ccnaChecks.some(check => /channel-group\s+1\s+mode\s+ac/i.test(`${check.prompt} ${check.options.join(' ')} ${check.explanation}`)), false)
})
