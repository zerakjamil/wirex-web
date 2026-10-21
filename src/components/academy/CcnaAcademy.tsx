'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ccnaChapters, ccnaSections, searchCcnaSections } from '@/content/ccnaCourse'
import { useAcademyStore } from '@/store/academyStore'
import { useI18n } from '@/i18n/useI18n'
import { AcademyHome } from './AcademyHome'
import { AcademyPractice } from './AcademyPractice'
import { AcademyReader, AcademyReaderSide } from './AcademyReader'
import { AcademyRescue } from './AcademyRescue'
import { AcademyIcon } from './AcademyIcons'
import { ProgressRing } from './ProgressRing'

function CourseRail({ onNavigate, open }: { onNavigate: () => void; open: boolean }) {
  const { t, dir } = useI18n()
  const sectionId = useAcademyStore(state => state.sectionId)
  const completedSections = useAcademyStore(state => state.completedSections)
  const openSection = useAcademyStore(state => state.openSection)
  const resetProgress = useAcademyStore(state => state.resetProgress)
  const [query, setQuery] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const results = useMemo(() => query.trim() ? searchCcnaSections(query) : [], [query])
  const percent = ccnaSections.length ? Math.round((completedSections.length / ccnaSections.length) * 100) : 0

  const navigate = (id: string) => {
    openSection(id)
    onNavigate()
  }

  return <aside className={`ccna-rail${open ? ' is-open' : ''}`} aria-label={t('Course navigation')}>
    <div className="ccna-rail-head">
      <div className="ccna-rail-title-row"><span>{t('Course')}</span><span>{completedSections.length} / {ccnaSections.length}</span></div>
      <div className="ccna-rail-progress" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      <label className="ccna-search">
        <AcademyIcon name="search" size={14} />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('Search chapters, sections, commands...')}
          aria-label={t('Search the course')}
          data-testid="academy-search"
        />
        {query && <button type="button" className="ccna-search-clear" aria-label={t('Clear search')} onClick={() => setQuery('')}><AcademyIcon name="close" size={12} /></button>}
      </label>
    </div>

    <div className="ccna-rail-scroll">
      {query.trim()
        ? <div className="ccna-search-results">
          {results.length === 0 && <p className="ccna-search-empty">{t('No sections found')}</p>}
          {results.map(section => <button type="button" key={section.id} className="ccna-rail-section ccna-search-result" aria-current={sectionId === section.id ? 'page' : undefined} onClick={() => navigate(section.id)} data-testid={`academy-search-result-${section.id}`}>
            <span className="ccna-rail-num" dir="ltr">{section.number}</span>
            <span className="ccna-rail-title"><span className="ccna-content-title" dir="ltr">{section.title}</span><small>{section.chapterLabel}</small></span>
            <AcademyIcon name={sectionId === section.id ? 'check' : dir === 'rtl' ? 'chevron-left' : 'chevron-right'} size={12} />
          </button>)}
        </div>
        : ccnaChapters.map(chapter => {
          const read = chapter.sections.filter(section => completedSections.includes(section.id)).length
          return <div className="ccna-rail-group" key={chapter.id}>
            <div className="ccna-rail-chapter">
              <span>{chapter.id === 'appendix' ? t('Appendix') : `${t('Chapter')} ${chapter.bookNumber}`}</span>
              <span>{read}/{chapter.sections.length}</span>
            </div>
            {chapter.sections.map(section => {
              const done = completedSections.includes(section.id)
              return <button type="button" key={section.id} className="ccna-rail-section" aria-current={sectionId === section.id ? 'page' : undefined} onClick={() => navigate(section.id)} data-testid={`academy-section-${section.id}`}>
                <span className="ccna-rail-num" dir="ltr">{section.number}</span>
                <span className="ccna-rail-title ccna-content-title" dir="ltr">{section.title}</span>
                <span className={`ccna-rail-state${done ? ' is-done' : ''}`} aria-hidden="true">{done ? <AcademyIcon name="check" size={12} /> : <AcademyIcon name="circle" size={10} />}</span>
              </button>
            })}
          </div>
        })}
    </div>

    <div className="ccna-rail-foot">
      {confirmReset
        ? <div className="ccna-rail-reset-confirm">
          <span>{t('Reset all Academy progress on this browser?')}</span>
          <div><button type="button" className="ccna-text-button" onClick={() => setConfirmReset(false)}>{t('Cancel')}</button><button type="button" className="ccna-text-button ccna-text-button-danger" onClick={() => { resetProgress(); setConfirmReset(false) }}>{t('Reset')}</button></div>
        </div>
        : <button type="button" className="ccna-text-button" onClick={() => setConfirmReset(true)}><AcademyIcon name="reset" size={12} />{t('Reset progress')}</button>}
    </div>
  </aside>
}

export function CcnaAcademy() {
  const { t, dir } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const view = useAcademyStore(state => state.view)
  const sectionId = useAcademyStore(state => state.sectionId)
  const completedSections = useAcademyStore(state => state.completedSections)
  const closeAcademy = useAcademyStore(state => state.closeAcademy)
  const setView = useAcademyStore(state => state.setView)
  const railKey = `${view}:${sectionId ?? ''}`
  const [railState, setRailState] = useState({ open: false, key: railKey })
  const railOpen = railState.open && railState.key === railKey
  const toggleRail = () => setRailState({ open: !railOpen, key: railKey })
  const closeRail = () => setRailState({ open: false, key: railKey })
  const percent = ccnaSections.length ? Math.round((completedSections.length / ccnaSections.length) * 100) : 0

  useEffect(() => {
    const dialog = dialogRef.current
    const active = document.activeElement
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
      const target = returnFocusRef.current
      window.requestAnimationFrame(() => {
        if (target?.isConnected) target.focus()
        else document.querySelector<HTMLElement>('[data-testid="academy-open"]')?.focus()
      })
    }
  }, [])

  const learnSelected = view === 'home' || view === 'reader'
  const selectedTab = view === 'reader' ? 'home' : view
  const tabOrder = ['home', 'practice', 'rescue'] as const
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const current = tabOrder.indexOf(selectedTab)
    let next = current
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabOrder.length - 1
    else {
      const direction = event.key === 'ArrowRight' ? 1 : -1
      next = (current + (dir === 'rtl' ? -direction : direction) + tabOrder.length) % tabOrder.length
    }
    setView(tabOrder[next])
    const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs[next]?.focus()
  }

  return <dialog
    ref={dialogRef}
    className="ccna-academy"
    dir={dir}
    aria-label={t('CCNA Academy')}
    data-testid="ccna-academy"
    onCancel={event => { event.preventDefault(); closeAcademy() }}
    onClick={event => { if (event.target === event.currentTarget) closeAcademy() }}
  >
    <div className="ccna-shell">
      <header className="ccna-topbar">
        <div className="ccna-brand">
          <span className="ccna-brand-mark"><AcademyIcon name="book" size={18} /></span>
          <div className="ccna-brand-text"><strong>wireX Academy</strong><span>CCNA 200-301 · Volume 1</span></div>
        </div>
        <button type="button" className="ccna-mobile-course" onClick={toggleRail} aria-label={t('Open course navigation')} aria-expanded={railOpen} data-testid="academy-course-toggle"><AcademyIcon name="menu" size={16} /><span>{t('Course')}</span></button>
        <nav className="ccna-view-tabs" role="tablist" aria-label={t('Academy views')} onKeyDown={handleTabKeyDown}>
          <button type="button" role="tab" id="academy-tab-home" aria-controls="academy-panel" aria-selected={learnSelected} tabIndex={learnSelected ? 0 : -1} onClick={() => setView('home')} data-testid="academy-view-learn"><AcademyIcon name="book" size={13} />{t('Learn')}</button>
          <button type="button" role="tab" id="academy-tab-practice" aria-controls="academy-panel" aria-selected={view === 'practice'} tabIndex={view === 'practice' ? 0 : -1} onClick={() => setView('practice')} data-testid="academy-view-practice"><AcademyIcon name="target" size={13} />{t('Practice')}</button>
          <button type="button" role="tab" id="academy-tab-rescue" aria-controls="academy-panel" aria-selected={view === 'rescue'} tabIndex={view === 'rescue' ? 0 : -1} onClick={() => setView('rescue')} data-testid="academy-view-rescue"><AcademyIcon name="flame" size={13} />{t('Rescue')}</button>
        </nav>
        <div className="ccna-top-actions">
          <div className="ccna-top-progress" title={t('Academy progress')} data-testid="academy-progress"><ProgressRing value={percent} size={27} stroke={3} label={`${percent}%`} /><span>{percent}%</span></div>
          <button type="button" className="ccna-close" onClick={closeAcademy} aria-label={t('Close academy')} data-testid="academy-close"><AcademyIcon name="close" size={17} /></button>
        </div>
      </header>

      <div className={`ccna-body${view === 'reader' ? '' : ' ccna-body--no-side'}`}>
        <CourseRail onNavigate={closeRail} open={railOpen} />
        {railOpen && <button type="button" className="ccna-rail-backdrop" aria-label={t('Close course navigation')} onClick={closeRail} />}
        <main className="ccna-main">
          <div role="tabpanel" id="academy-panel" aria-labelledby={`academy-tab-${selectedTab}`} className="ccna-tabpanel" data-testid="academy-tabpanel">
            {view === 'home' && <AcademyHome />}
            {view === 'reader' && <AcademyReader />}
            {view === 'practice' && <AcademyPractice />}
            {view === 'rescue' && <AcademyRescue />}
          </div>
        </main>
        {view === 'reader' && <AcademyReaderSide />}
      </div>
    </div>
  </dialog>
}
