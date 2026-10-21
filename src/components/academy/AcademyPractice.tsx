'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ccnaChecks, getChapter, getSection } from '@/content/ccnaCourse'
import { examTaskIds } from '@/simulator/trainingLabs'
import { useAcademyStore } from '@/store/academyStore'
import { useTrainingStore } from '@/store/trainingStore'
import { useI18n } from '@/i18n/useI18n'
import { AcademyIcon } from './AcademyIcons'
import { ProgressRing } from './ProgressRing'
import { startPracticalExam } from './actions'

interface PracticeAnswer {
  checkId: string
  selected: number
  correct: boolean
}

type PracticeMode = 'practical' | 'theory'

const PRACTICAL_GROUPS = [
  { title: 'VLANs and access ports', ids: examTaskIds.slice(0, 5) },
  { title: 'LACP bundle and trunks', ids: examTaskIds.slice(5, 9) },
  { title: 'Router-on-a-stick', ids: examTaskIds.slice(9, 12) },
  { title: 'STP and verification', ids: examTaskIds.slice(12) },
] as const

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const value = copy[index]
    copy[index] = copy[swap]
    copy[swap] = value
  }
  return copy
}

export function AcademyPractice() {
  const { t, dir } = useI18n()
  const recordCheck = useAcademyStore(state => state.recordCheck)
  const setPracticeBest = useAcademyStore(state => state.setPracticeBest)
  const practiceBest = useAcademyStore(state => state.practiceBest)
  const openSection = useAcademyStore(state => state.openSection)
  const setView = useAcademyStore(state => state.setView)
  const examProgress = useTrainingStore(state => state.progress.exam)
  const [mode, setMode] = useState<PracticeMode>('practical')
  const [questions, setQuestions] = useState(() => shuffle(ccnaChecks).slice(0, 10))
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [answers, setAnswers] = useState<PracticeAnswer[]>([])
  const [finished, setFinished] = useState(false)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (finished) resultHeadingRef.current?.focus({ preventScroll: true })
  }, [finished])

  const question = questions[index]
  const section = question ? getSection(question.sectionId) : undefined
  const chapter = section ? getChapter(section.chapterId) : undefined
  const correctCount = answers.filter(answer => answer.correct).length
  const practicalMax = Math.max(1, examProgress?.maxScore ?? examTaskIds.length)
  const practicalScore = Math.max(0, Math.min(practicalMax, examProgress?.score ?? 0))
  const practicalCompleted = examProgress?.completed === true
  const theoryBest = Math.max(0, Math.min(10, Math.round(practiceBest / 10)))
  const totalBest = theoryBest + practicalScore
  const totalMax = 10 + practicalMax

  const submit = () => {
    if (!question || selected === null) return
    const correct = selected === question.answer
    const answer = { checkId: question.id, selected, correct }
    setAnswers(current => [...current, answer])
    recordCheck(question.id, correct)
    setSubmitted(true)
  }

  const next = () => {
    if (!question) return
    if (index + 1 >= questions.length) {
      const finalAnswers = submitted && !answers.some(answer => answer.checkId === question.id)
        ? [...answers, { checkId: question.id, selected: selected ?? -1, correct: selected === question.answer }]
        : answers
      const finalScore = questions.length ? Math.round((finalAnswers.filter(answer => answer.correct).length / questions.length) * 100) : 0
      setAnswers(finalAnswers)
      setPracticeBest(finalScore)
      setFinished(true)
      return
    }
    setIndex(current => current + 1)
    setSelected(null)
    setSubmitted(false)
  }

  const restart = () => {
    setQuestions(shuffle(ccnaChecks).slice(0, 10))
    setIndex(0)
    setSelected(null)
    setSubmitted(false)
    setAnswers([])
    setFinished(false)
    setMode('theory')
  }

  const selectMode = (nextMode: PracticeMode) => {
    setMode(nextMode)
  }

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const order: PracticeMode[] = ['practical', 'theory']
    const current = order.indexOf(mode)
    let nextIndex = current
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = order.length - 1
    else {
      const direction = event.key === 'ArrowRight' ? 1 : -1
      nextIndex = (current + (dir === 'rtl' ? -direction : direction) + order.length) % order.length
    }
    selectMode(order[nextIndex])
    const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs[nextIndex]?.focus()
  }

  const tabs = <div className="ccna-practice-tabs" role="tablist" aria-label={t('Exam sections')} onKeyDown={handleTabKeyDown}>
    <button
      type="button"
      role="tab"
      id="academy-practice-tab-practical"
      aria-selected={mode === 'practical'}
      aria-controls="academy-practice-panel"
      tabIndex={mode === 'practical' ? 0 : -1}
      onClick={() => selectMode('practical')}
      data-testid="academy-practice-tab-practical"
    >
      <AcademyIcon name="flask" size={13} />{t('Practical')}<span className="ccna-practice-tab-count">{examTaskIds.length}</span>
    </button>
    <button
      type="button"
      role="tab"
      id="academy-practice-tab-theory"
      aria-selected={mode === 'theory'}
      aria-controls="academy-practice-panel"
      tabIndex={mode === 'theory' ? 0 : -1}
      onClick={() => selectMode('theory')}
      data-testid="academy-practice-tab-theory"
    >
      <AcademyIcon name="target" size={13} />{t('Theory')}<span className="ccna-practice-tab-count">10</span>
    </button>
  </div>

  if (mode === 'practical') {
    const practicalAction = practicalCompleted
      ? t('Retake exam')
      : practicalScore > 0
        ? t('Resume exam')
        : t('Start 14-task exam')
    return <div className="ccna-practice" data-testid="academy-practice-practical">
      {tabs}
      <div role="tabpanel" id="academy-practice-panel" aria-labelledby="academy-practice-tab-practical">
      <header className="ccna-practice-head">
        <div>
          <span className="ccna-eyebrow">{t('Skills exam')}</span>
          <h1>{t('Prove it on the wire')}</h1>
          <p className="ccna-practice-sub">{t('10 theory points + 14 practical points. The simulator does the grading.')}</p>
        </div>
        <div className="ccna-practice-count">
          <strong>{practicalScore}</strong><span>{t('of')} {practicalMax} {t('practical points')}</span>
        </div>
      </header>

      <div className="ccna-exam-scorebar" role="status" aria-label={t('Exam score')}>
        <div><span>{t('Theory best')}</span><strong dir="ltr">{theoryBest}<small> / 10</small></strong></div>
        <div><span>{t('Practical score')}</span><strong dir="ltr">{practicalScore}<small> / {practicalMax}</small></strong></div>
        <div><span>{t('Total score')}</span><strong dir="ltr">{totalBest}<small> / {totalMax}</small></strong></div>
      </div>

      <div className="ccna-exam-layout">
        <section className="ccna-exam-brief" aria-labelledby="ccna-exam-brief-title">
          <span className="ccna-side-eyebrow"><AcademyIcon name="flask" size={12} />{t('Live practical exam')}</span>
          <h2 id="ccna-exam-brief-title">{t('One topology. 14 checkpoints.')}</h2>
          <p>{t('You configure a real two-switch campus with a router. The grader reads the simulator state, not your typing.')}</p>
          <div className="ccna-exam-chips">
            <span>{t('2 switches · 1 router · 6 PCs')}</span>
            <span>{t('VLANs 10, 20, 30')}</span>
            <span>{t('LACP · 802.1Q · STP')}</span>
          </div>
          <div className="ccna-exam-steps">
            <span className="ccna-side-eyebrow">{t('How the exam works')}</span>
            <ol>
              <li><span>1</span>{t('Configure the live topology.')}</li>
              <li><span>2</span>{t('Press Check my work.')}</li>
              <li><span>3</span>{t('Return here for your score.')}</li>
            </ol>
          </div>
          <div className="ccna-exam-rules">
            <span className="ccna-side-eyebrow">{t('What the grader checks')}</span>
            <ul>
              <li><AcademyIcon name="check" size={12} />{t('Names, VLAN IDs, port modes, trunks, IPs, STP priority, and a live ping.')}</li>
              <li><AcademyIcon name="check" size={12} />{t('Each checkpoint is one point. You can check and fix without losing credit.')}</li>
            </ul>
          </div>
          <p className="ccna-exam-note"><AcademyIcon name="shield" size={13} />{t('Your imported network is backed up automatically and restored when you exit the exam.')}</p>
        </section>

        <section className="ccna-exam-tasks" aria-labelledby="ccna-exam-tasks-title">
          <div className="ccna-exam-tasks-head">
            <span className="ccna-side-eyebrow">{t('What you will do')}</span>
            <span dir="ltr">{practicalScore} / {practicalMax}</span>
          </div>
          <h2 id="ccna-exam-tasks-title">{t('14 scored actions')}</h2>
          <div className="ccna-exam-groups">
            {PRACTICAL_GROUPS.map(group => <div className="ccna-exam-group" key={group.title}>
              <h3>{t(group.title)}</h3>
              <ol>
                {group.ids.map(id => <li key={id}>
                  <span>{examTaskIds.indexOf(id) + 1}</span>
                  <bdi>{t(`task.${id}`)}</bdi>
                </li>)}
              </ol>
            </div>)}
          </div>
        </section>
      </div>

      <div className="ccna-exam-cta">
        <button type="button" className="ccna-button ccna-button-primary" onClick={() => startPracticalExam(practicalCompleted)} data-testid="academy-practical-start">
          <AcademyIcon name="play" size={14} />{practicalAction}<AcademyIcon name={dir === 'rtl' ? 'arrow-left' : 'arrow-right'} size={14} />
        </button>
        <p>{t('The exam opens the live simulator. Configure the devices, then return here for your score.')}</p>
      </div>
      </div>
    </div>
  }

  if (finished) {
    const theoryPoints = correctCount
    const total = theoryPoints + practicalScore
    const totalPercent = Math.round((total / totalMax) * 100)
    const wrongAnswers = answers.filter(answer => !answer.correct)
    const weak = new Map<string, { chapterTitle: string; sectionId: string; count: number }>()
    for (const answer of wrongAnswers) {
      const check = ccnaChecks.find(item => item.id === answer.checkId)
      const answerSection = check ? getSection(check.sectionId) : undefined
      if (!answerSection) continue
      const existing = weak.get(answerSection.chapterId)
      if (existing) existing.count += 1
      else weak.set(answerSection.chapterId, { chapterTitle: answerSection.chapterTitle, sectionId: answerSection.id, count: 1 })
    }
    const weakRows = [...weak.values()].sort((a, b) => b.count - a.count)
    return <div className="ccna-practice" data-testid="academy-practice-result">
      {tabs}
      <div role="tabpanel" id="academy-practice-panel" aria-labelledby="academy-practice-tab-theory">
      <div className="ccna-result-card">
        <span className="ccna-eyebrow">{t('Exam result')}</span>
        <div className="ccna-score-wrap">
          <ProgressRing value={totalPercent} size={116} stroke={7} label={`${total}/${totalMax}`} />
          <strong>{totalPercent}%</strong>
        </div>
        <h1 ref={resultHeadingRef} tabIndex={-1}>{t('Exam result')}</h1>
        <p>{t('Theory and practical are scored separately. The practical exam is the larger half.')}</p>
        <div className="ccna-result-stats">
          <div><strong dir="ltr">{theoryPoints} / 10</strong><span>{t('Theory')}</span></div>
          <div><strong dir="ltr">{practicalScore} / {practicalMax}</strong><span>{t('Practical')}</span></div>
          <div><strong dir="ltr">{total} / {totalMax}</strong><span>{t('Total')}</span></div>
        </div>
        {weakRows.length > 0 && <div className="ccna-weak-list">
          <span className="ccna-side-eyebrow">{t('Weakest chapter')}</span>
          {weakRows.map(row => <div className="ccna-weak-row" key={row.chapterTitle}>
            <span className="ccna-content-title" dir="ltr">{row.chapterTitle}</span>
            <span>{row.count}</span>
            <button type="button" className="ccna-text-button" onClick={() => openSection(row.sectionId)}>{t('Review this section')}<AcademyIcon name={dir === 'rtl' ? 'arrow-left' : 'arrow-right'} size={12} /></button>
          </div>)}
        </div>}
        <div className="ccna-result-actions">
          <button type="button" className="ccna-button" onClick={restart} data-testid="academy-practice-restart"><AcademyIcon name="reset" size={14} />{t('Retake theory')}</button>
          <button type="button" className="ccna-button ccna-button-primary" onClick={() => startPracticalExam(practicalCompleted)} data-testid="academy-practice-practical-cta"><AcademyIcon name="flask" size={14} />{practicalCompleted ? t('Retake exam') : practicalScore > 0 ? t('Resume exam') : t('Open practical exam')}</button>
          <button type="button" className="ccna-button" onClick={() => setView('rescue')} data-testid="academy-practice-rescue"><AcademyIcon name="flame" size={14} />{t('Start rescue')}</button>
        </div>
      </div>
      </div>
    </div>
  }

  if (!question || !section) return null

  const questionProgress = Math.round(((index + (submitted ? 1 : 0)) / questions.length) * 100)
  const isCorrect = selected === question.answer

  return <div className="ccna-practice" data-testid="academy-practice-question">
    {tabs}
    <div role="tabpanel" id="academy-practice-panel" aria-labelledby="academy-practice-tab-theory">
      <header className="ccna-practice-head">
        <div>
          <span className="ccna-eyebrow">{t('Theory check')}</span>
          <h1>{t('Theory')}</h1>
          <p className="ccna-practice-sub">{t('10 questions. One point each. The practical exam carries 14 points.')}</p>
        </div>
        <div className="ccna-practice-count">
          <strong>{index + 1}</strong><span>{t('of')} {questions.length}</span>
        </div>
      </header>

      <div className="ccna-practice-progress" aria-hidden="true"><span style={{ width: `${questionProgress}%` }} /></div>

      <section className="ccna-question-card">
        <div className="ccna-question-head">
          <span className="ccna-question-badge">{chapter?.label ?? section.chapterLabel}</span>
          <span className="ccna-question-section" dir="ltr">{section.number}</span>
        </div>
        <p className="ccna-question-prompt" dir="ltr">{question.prompt}</p>
        <div className="ccna-question-options" role="group" aria-label={t('Theory check')}>
          {question.options.map((option, optionIndex) => {
            const state = submitted
              ? optionIndex === question.answer ? ' is-correct' : optionIndex === selected ? ' is-wrong' : ''
              : selected === optionIndex ? ' is-selected' : ''
            return <button
              key={optionIndex}
              type="button"
              className={`ccna-question-option${state}`}
              aria-pressed={selected === optionIndex}
              disabled={submitted}
              onClick={() => setSelected(optionIndex)}
              data-testid={`academy-practice-option-${optionIndex}`}
            >
              <span className="ccna-check-letter">{String.fromCharCode(65 + optionIndex)}</span>
              <span dir="ltr">{option}</span>
            </button>
          })}
        </div>
        {submitted
          ? <div className={`ccna-question-feedback${isCorrect ? ' is-correct' : ' is-wrong'}`} aria-live="polite" data-testid="academy-practice-feedback">
            <strong dir="auto">{isCorrect ? t('Correct') : t('Not quite')}</strong>
            <p dir="ltr">{question.explanation}</p>
            <button type="button" className="ccna-button ccna-button-primary" onClick={next} data-testid="academy-practice-next">
              {index + 1 >= questions.length ? t('See results') : t('Next question')}<AcademyIcon name={dir === 'rtl' ? 'arrow-left' : 'arrow-right'} size={14} />
            </button>
          </div>
          : <button type="button" className="ccna-button ccna-button-primary ccna-question-submit" disabled={selected === null} onClick={submit} data-testid="academy-practice-submit">{t('Check answer')}</button>}
      </section>
    </div>
  </div>
}
