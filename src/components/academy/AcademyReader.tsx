'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  ccnaSectionNotes,
  ccnaSections,
  getAdjacentSections,
  getReadingMinutes,
  getSection,
  getSectionChecks,
  getSectionCommands,
  getSectionLab,
  getSectionQuickHits,
  getSectionSummary,
  type CcnaCheck,
} from '@/content/ccnaCourse'
import { useAcademyStore } from '@/store/academyStore'
import { useI18n } from '@/i18n/useI18n'
import { AcademyIcon } from './AcademyIcons'
import { MarkdownView } from './MarkdownView'
import { startGuidedLab } from './actions'

function SectionCheck({ check }: { check: CcnaCheck }) {
  const { t } = useI18n()
  const correctChecks = useAcademyStore(state => state.correctChecks)
  const recordCheck = useAcademyStore(state => state.recordCheck)
  const alreadyCorrect = correctChecks.includes(check.id)
  const [selected, setSelected] = useState<number | null>(alreadyCorrect ? check.answer : null)
  const [submitted, setSubmitted] = useState(alreadyCorrect)
  const correct = selected === check.answer

  const submit = () => {
    if (selected === null) return
    setSubmitted(true)
    recordCheck(check.id, selected === check.answer)
  }

  const retry = () => {
    setSelected(null)
    setSubmitted(false)
  }

  return <section className={`ccna-check${submitted ? correct ? ' is-correct' : ' is-wrong' : ''}`} data-testid={`academy-check-${check.id}`}>
    <div className="ccna-check-head">
      <span><AcademyIcon name="target" size={12} />{t('Quick check')}</span>
      {alreadyCorrect && <span className="ccna-check-badge"><AcademyIcon name="check" size={12} />{t('Completed')}</span>}
    </div>
    <p className="ccna-check-prompt" dir="ltr">{check.prompt}</p>
    <div className="ccna-check-options" role="group" aria-label={t('Quick check')}>
      {check.options.map((option, index) => {
        const state = submitted
          ? index === check.answer ? ' is-correct' : index === selected ? ' is-wrong' : ''
          : selected === index ? ' is-selected' : ''
        return <button
          key={index}
          type="button"
          className={`ccna-check-option${state}`}
          aria-pressed={selected === index}
          disabled={submitted}
          onClick={() => setSelected(index)}
          data-testid={`academy-check-${check.id}-option-${index}`}
        >
          <span className="ccna-check-letter">{String.fromCharCode(65 + index)}</span>
          <span dir="ltr">{option}</span>
        </button>
      })}
    </div>
    {submitted
      ? <div className="ccna-check-feedback" aria-live="polite" data-testid={`academy-check-${check.id}-feedback`}>
        <strong dir="auto">{correct ? t('Correct') : t('Not quite')}</strong>
        <p dir="ltr">{check.explanation}</p>
        {!correct && <button type="button" className="ccna-text-button" onClick={retry}>{t('Try again')}</button>}
      </div>
      : <button type="button" className="ccna-button ccna-button-primary ccna-check-submit" disabled={selected === null} onClick={submit} data-testid={`academy-check-${check.id}-submit`}>{t('Check answer')}</button>}
  </section>
}

export function AcademyReader() {
  const { t, dir } = useI18n()
  const sectionId = useAcademyStore(state => state.sectionId)
  const completedSections = useAcademyStore(state => state.completedSections)
  const markSectionRead = useAcademyStore(state => state.markSectionRead)
  const openSection = useAcademyStore(state => state.openSection)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const section = sectionId ? getSection(sectionId) : ccnaSections[0]

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('.ccna-main')
    if (scroller) scroller.scrollTop = 0
    headingRef.current?.focus({ preventScroll: true })
  }, [section?.id])

  if (!section) return null

  const completed = completedSections.includes(section.id)
  const notes = ccnaSectionNotes[section.id]
  const checks = getSectionChecks(section.id)
  const lab = getSectionLab(section.id)
  const summary = notes?.why ?? getSectionSummary(section.id)
  const readingMinutes = getReadingMinutes(section.id)
  const { previous, next } = getAdjacentSections(section.id)
  const previousIcon = dir === 'rtl' ? 'arrow-right' : 'arrow-left'
  const nextIcon = dir === 'rtl' ? 'arrow-left' : 'arrow-right'

  return <div className="ccna-reader" dir={dir} data-testid="academy-reader">
    <div className="ccna-reader-breadcrumb">
      <span>{section.chapterLabel}</span>
      <AcademyIcon name={dir === 'rtl' ? 'chevron-left' : 'chevron-right'} size={11} />
      <span dir="ltr">{section.number}</span>
      <span className="ccna-breadcrumb-dot" aria-hidden="true" />
      <span className="ccna-content-title" dir="ltr">{section.chapterTitle}</span>
    </div>

    <header className="ccna-reader-head">
      <h1 ref={headingRef} className="ccna-content-title" dir="ltr" tabIndex={-1}>{section.title}</h1>
      <div className="ccna-reader-meta">
        <span><AcademyIcon name="clock" size={12} />{readingMinutes} {t('min read')}</span>
        <span className="ccna-badge">{t('English source')}</span>
        {lab && <span className="ccna-badge ccna-badge--teal"><AcademyIcon name="flask" size={11} />{t('Lab available')}</span>}
        {completed && <span className="ccna-badge ccna-badge--success"><AcademyIcon name="check" size={11} />{t('Completed')}</span>}
      </div>
    </header>

    {summary && <aside className="ccna-why">
      <span className="ccna-callout-label" dir="auto">{notes?.why ? t('Why this matters') : t('In one line')}</span>
      <p dir="ltr">{summary}</p>
    </aside>}

    <div className="ccna-reader-body" dir="ltr">
      <MarkdownView markdown={section.markdown} />
    </div>

    {notes?.trap && <aside className="ccna-trap">
      <span className="ccna-callout-label" dir="auto"><AcademyIcon name="shield" size={12} />{t('Exam trap')}</span>
      <p dir="ltr">{notes.trap}</p>
    </aside>}

    {checks.length > 0 && <section className="ccna-checks" aria-label={t('Quick check')}>
      {checks.map(check => <SectionCheck key={check.id} check={check} />)}
    </section>}

    <footer className="ccna-reader-foot" dir={dir}>
      <div className="ccna-reader-nav ccna-reader-nav-prev">
        {previous && <button type="button" className="ccna-reader-nav-button" onClick={() => openSection(previous.id)}>
          <AcademyIcon name={previousIcon} size={15} />
          <span><small>{t('Previous')}</small><strong className="ccna-content-title" dir="ltr">{previous.title}</strong></span>
        </button>}
      </div>
      <div className="ccna-reader-actions">
        {completed
          ? <span className="ccna-read-complete"><AcademyIcon name="check" size={14} />{t('Completed')}</span>
          : <button type="button" className="ccna-button ccna-button-primary" onClick={() => markSectionRead(section.id)} data-testid="academy-mark-read"><AcademyIcon name="check" size={14} />{t('Mark section read')}</button>}
      </div>
      <div className="ccna-reader-nav ccna-reader-nav-next">
        {next && <button type="button" className="ccna-reader-nav-button" onClick={() => openSection(next.id)}>
          <span><small>{t('Next')}</small><strong className="ccna-content-title" dir="ltr">{next.title}</strong></span>
          <AcademyIcon name={nextIcon} size={15} />
        </button>}
      </div>
    </footer>
  </div>
}

export function AcademyReaderSide() {
  const { t } = useI18n()
  const sectionId = useAcademyStore(state => state.sectionId)
  const completedSections = useAcademyStore(state => state.completedSections)
  const correctChecks = useAcademyStore(state => state.correctChecks)
  const practiceBest = useAcademyStore(state => state.practiceBest)
  const section = sectionId ? getSection(sectionId) : ccnaSections[0]
  const [copied, setCopied] = useState(false)

  if (!section) return null
  const lab = getSectionLab(section.id)
  const hits = getSectionQuickHits(section.id)
  const commands = getSectionCommands(section.id)
  const commandText = commands.join('\n\n')

  const copyCommands = async () => {
    try {
      await navigator.clipboard.writeText(commandText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return <div className="ccna-side" dir="auto">
    {lab && <section className="ccna-side-card ccna-side-card--lab">
      <span className="ccna-side-eyebrow"><AcademyIcon name="flask" size={12} />{t('In the simulator')}</span>
      <strong className="ccna-side-title ccna-content-title" dir="ltr">{lab.label}</strong>
      <p className="ccna-content-title" dir="ltr">{lab.description}</p>
      <button type="button" className="ccna-button ccna-button-primary ccna-side-primary" onClick={() => startGuidedLab(lab.lesson)} data-testid="academy-open-lab">
        <AcademyIcon name="play" size={13} />{t('Start guided lab')}
      </button>
      <small>{t('This lab uses the existing simulator. Your current workspace is backed up automatically.')}</small>
    </section>}

    {hits.length > 0 && <section className="ccna-side-card">
      <span className="ccna-side-eyebrow"><AcademyIcon name="list" size={12} />{t('Quick hits')}</span>
      <ul className="ccna-quick-hits">{hits.map((hit, index) => <li key={index}><span aria-hidden="true" /> <span dir="ltr">{hit}</span></li>)}</ul>
    </section>}

    {commands.length > 0 && <section className="ccna-side-card ccna-side-card--code">
      <div className="ccna-side-card-head">
        <span className="ccna-side-eyebrow"><AcademyIcon name="layers" size={12} />{t('CLI on this page')}</span>
        <button type="button" className="ccna-mini-button" onClick={copyCommands}>{copied ? t('Copied') : t('Copy all')}</button>
      </div>
      <pre dir="ltr">{commandText}</pre>
    </section>}

    <section className="ccna-side-card">
      <span className="ccna-side-eyebrow"><AcademyIcon name="award" size={12} />{t('Your progress')}</span>
      <div className="ccna-side-stats">
        <div><strong>{completedSections.length}</strong><span>{t('sections read')}</span></div>
        <div><strong>{correctChecks.length}</strong><span>{t('checks correct')}</span></div>
        <div><strong>{practiceBest}%</strong><span>{t('Practice best')}</span></div>
      </div>
    </section>

    <p className="ccna-side-source">{t('Study companion')} · CCNA 200-301</p>
  </div>
}
