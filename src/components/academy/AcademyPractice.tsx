'use client'

import React, { useState } from 'react'
import { ccnaChecks, getChapter, getSection } from '@/content/ccnaCourse'
import { useAcademyStore } from '@/store/academyStore'
import { useI18n } from '@/i18n/useI18n'
import { AcademyIcon } from './AcademyIcons'
import { ProgressRing } from './ProgressRing'

interface PracticeAnswer {
  checkId: string
  selected: number
  correct: boolean
}

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
  const openSection = useAcademyStore(state => state.openSection)
  const setView = useAcademyStore(state => state.setView)
  const [questions, setQuestions] = useState(() => shuffle(ccnaChecks).slice(0, 10))
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [answers, setAnswers] = useState<PracticeAnswer[]>([])
  const [finished, setFinished] = useState(false)

  const question = questions[index]
  const section = question ? getSection(question.sectionId) : undefined
  const chapter = section ? getChapter(section.chapterId) : undefined
  const correctCount = answers.filter(answer => answer.correct).length
  const score = questions.length ? Math.round((correctCount / questions.length) * 100) : 0

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
  }

  if (finished) {
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
      <div className="ccna-result-card">
        <span className="ccna-eyebrow">{t('Practice complete')}</span>
        <div className="ccna-score-wrap">
          <ProgressRing value={score} size={116} stroke={7} label={`${score}%`} />
          <strong>{score}%</strong>
        </div>
        <h1>{t('Practice complete')}</h1>
        <p>{t('Practice score is a checkpoint, not a certification.')}</p>
        <div className="ccna-result-stats">
          <div><strong>{correctCount}</strong><span>{t('correct answers')}</span></div>
          <div><strong>{questions.length - correctCount}</strong><span>{t('to review')}</span></div>
          <div><strong>{questions.length}</strong><span>{t('questions')}</span></div>
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
          <button type="button" className="ccna-button" onClick={restart} data-testid="academy-practice-restart"><AcademyIcon name="reset" size={14} />{t('Start over')}</button>
          <button type="button" className="ccna-button ccna-button-primary" onClick={() => setView('rescue')} data-testid="academy-practice-rescue"><AcademyIcon name="flame" size={14} />{t('Start rescue')}</button>
        </div>
      </div>
    </div>
  }

  if (!question || !section) return null

  const questionProgress = Math.round(((index + (submitted ? 1 : 0)) / questions.length) * 100)
  const isCorrect = selected === question.answer

  return <div className="ccna-practice" data-testid="academy-practice-question">
    <header className="ccna-practice-head">
      <div>
        <span className="ccna-eyebrow">{t('Practice check')}</span>
        <h1>{t('Practice')}</h1>
        <p className="ccna-practice-sub">{t('10 questions across the four chapters. Every answer links back to the section.')}</p>
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
      <div className="ccna-question-options" role="group" aria-label={t('Practice check')}>
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
}
