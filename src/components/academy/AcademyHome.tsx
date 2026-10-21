'use client'

import React, { useId, useState } from 'react'
import { ccnaChapters, ccnaSections, ccnaStats, getAdjacentSections, getRescuePath, getSection } from '@/content/ccnaCourse'
import { useAcademyStore } from '@/store/academyStore'
import { useI18n } from '@/i18n/useI18n'
import { AcademyIcon } from './AcademyIcons'

function HeroArt() {
  const rawId = useId()
  const glowId = `ccna-glow-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const nodes: { x: number; y: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = [
    { x: 58, y: 192, label: 'ACCESS', anchor: 'start' },
    { x: 148, y: 74, label: 'TCP/IP', anchor: 'middle' },
    { x: 238, y: 132, label: 'TRUNK', anchor: 'middle' },
    { x: 332, y: 58, label: 'SSH', anchor: 'middle' },
    { x: 366, y: 198, label: 'VLAN 10', anchor: 'end' },
  ]
  const links = [[0, 1], [1, 2], [2, 3], [2, 4], [0, 2], [3, 4]]
  return <svg viewBox="0 0 420 258" className="ccna-hero-art" aria-hidden="true">
    <defs>
      <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#2dd4bf" stopOpacity=".32" />
        <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="214" cy="130" r="128" fill={`url(#${glowId})`} />
    <g fill="none" stroke="rgba(45,212,191,.15)" strokeWidth="1">
      <circle cx="214" cy="130" r="62" />
      <circle cx="214" cy="130" r="104" />
      <circle cx="214" cy="130" r="144" opacity=".55" />
    </g>
    <g stroke="rgba(255,255,255,.16)" strokeWidth="1">
      {links.map(([from, to], index) => <line key={index} x1={nodes[from].x} y1={nodes[from].y} x2={nodes[to].x} y2={nodes[to].y} />)}
    </g>
    {nodes.map((node, index) => <g key={node.label}>
      <circle cx={node.x} cy={node.y} r={index === 2 ? 13 : 9} fill="rgba(13,74,70,.62)" stroke="rgba(94,234,212,.42)" strokeWidth="1" />
      <circle cx={node.x} cy={node.y} r={index === 2 ? 4.5 : 3.2} fill="#5eead4" className={`ccna-hero-node ccna-hero-node-${index}`} />
      <text x={node.x} y={node.y + 25} textAnchor={node.anchor} fill="rgba(204,251,241,.6)" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="7.5" letterSpacing="1.4">{node.label}</text>
    </g>)}
    <g fill="none" stroke="rgba(255,255,255,.24)" strokeWidth="1.2">
      <path d="M34 34h12M40 28v12" />
      <path d="M382 224h12M388 218v12" />
    </g>
  </svg>
}

export function AcademyHome() {
  const { t, dir } = useI18n()
  const completedSections = useAcademyStore(state => state.completedSections)
  const lastSectionId = useAcademyStore(state => state.lastSectionId)
  const practiceBest = useAcademyStore(state => state.practiceBest)
  const activeRescueId = useAcademyStore(state => state.activeRescueId)
  const openSection = useAcademyStore(state => state.openSection)
  const setView = useAcademyStore(state => state.setView)
  const resetProgress = useAcademyStore(state => state.resetProgress)
  const [confirmReset, setConfirmReset] = useState(false)

  const lastSection = lastSectionId ? getSection(lastSectionId) : undefined
  const resumeSection = lastSection && !completedSections.includes(lastSection.id)
    ? lastSection
    : lastSection
      ? getAdjacentSections(lastSection.id).next ?? lastSection
      : ccnaSections[0]
  const progress = ccnaSections.length ? Math.round((completedSections.length / ccnaSections.length) * 100) : 0
  const activeRescue = activeRescueId ? getRescuePath(activeRescueId) : undefined
  const hasProgress = completedSections.length > 0

  const chapterRead = (chapterId: string) => {
    const chapter = ccnaChapters.find(item => item.id === chapterId)
    return chapter ? chapter.sections.filter(section => completedSections.includes(section.id)).length : 0
  }

  return <div className="ccna-home" data-testid="academy-home">
    <section className="ccna-hero">
      <div className="ccna-hero-copy">
        <span className="ccna-hero-badge"><AcademyIcon name="spark" size={12} />{t('Free study layer · No account')}</span>
        <h1>{t('Read it. Wire it. Prove it.')}</h1>
        <p>{t('Read a short concept, check your understanding, then configure it for real in the simulator.')}</p>
        <div className="ccna-hero-actions">
          <button type="button" className="ccna-hero-primary" onClick={() => openSection(resumeSection.id)} data-testid="academy-continue">
            <AcademyIcon name="play" size={14} />{hasProgress ? t('Continue reading') : t('Start with Chapter 1')}
          </button>
          <button type="button" className="ccna-hero-ghost" onClick={() => setView('rescue')}>
            <AcademyIcon name="flame" size={14} />{t('Open rescue path')}
          </button>
        </div>
        <div className="ccna-hero-stats">
          <div><strong>{ccnaStats.chapters}</strong><span>{t('Chapters')}</span></div>
          <div><strong>{ccnaSections.length}</strong><span>{t('Sections')}</span></div>
          <div><strong>{ccnaStats.checks}</strong><span>{t('Checks')}</span></div>
          <div><strong>{progress}%</strong><span>{t('Complete')}</span></div>
        </div>
      </div>
      <HeroArt />
    </section>

    <section className="ccna-action-grid" aria-label={t('Continue learning')}>
      <button type="button" className="ccna-action" onClick={() => openSection(resumeSection.id)}>
        <span className="ccna-action-icon"><AcademyIcon name="book" size={18} /></span>
        <span className="ccna-action-eyebrow">{t('Continue')}</span>
        <strong className="ccna-content-title" dir="ltr">{resumeSection.title}</strong>
        <span className="ccna-action-desc">{completedSections.length} {t('of')} {ccnaSections.length} {t('sections read')}</span>
        <span className="ccna-action-more">{t('Continue reading')}<AcademyIcon name={dir === 'rtl' ? 'arrow-left' : 'arrow-right'} size={13} /></span>
      </button>
      <button type="button" className="ccna-action" onClick={() => setView('practice')} data-testid="academy-home-practice">
        <span className="ccna-action-icon"><AcademyIcon name="target" size={18} /></span>
        <span className="ccna-action-eyebrow">{t('Practice')}</span>
        <strong>{t('10-question check')}</strong>
        <span className="ccna-action-desc">{practiceBest > 0 ? `${t('Best score')}: ${practiceBest}%` : t('Every answer links back to the section.')}</span>
        <span className="ccna-action-more">{t('Start practice')}<AcademyIcon name={dir === 'rtl' ? 'arrow-left' : 'arrow-right'} size={13} /></span>
      </button>
      <button type="button" className="ccna-action" onClick={() => setView('rescue')} data-testid="academy-home-rescue">
        <span className="ccna-action-icon"><AcademyIcon name="flame" size={18} /></span>
        <span className="ccna-action-eyebrow">{t('Rescue')}</span>
        <strong className="ccna-content-title" dir={activeRescue ? 'ltr' : undefined}>{activeRescue ? activeRescue.title : t('Last-minute path')}</strong>
        <span className="ccna-action-desc">{activeRescue ? `${activeRescue.minutes} ${t('minutes')} · ${activeRescue.sectionIds.length} ${t('sections')}` : t('A guided path for the night before lab.')}</span>
        <span className="ccna-action-more">{activeRescue ? t('Resume path') : t('Choose a path')}<AcademyIcon name={dir === 'rtl' ? 'arrow-left' : 'arrow-right'} size={13} /></span>
      </button>
    </section>

    <section className="ccna-section-block" aria-labelledby="ccna-course-map-title">
      <div className="ccna-section-heading">
        <div>
          <span className="ccna-eyebrow">{t('Course map')}</span>
          <h2 id="ccna-course-map-title">{t('Choose a chapter')}</h2>
        </div>
        <span className="ccna-section-count">{completedSections.length} / {ccnaSections.length} {t('sections read')}</span>
      </div>
      <div className="ccna-chapter-grid">
        {ccnaChapters.map(chapter => {
          const read = chapterRead(chapter.id)
          const percent = chapter.sections.length ? Math.round((read / chapter.sections.length) * 100) : 0
          const first = chapter.sections.find(section => !completedSections.includes(section.id)) ?? chapter.sections[0]
          return <button
            type="button"
            key={chapter.id}
            className="ccna-chapter-card"
            style={{ '--chapter-accent': chapter.accent } as React.CSSProperties}
            onClick={() => openSection(first.id)}
            data-testid={`academy-chapter-${chapter.id}`}
          >
            <span className="ccna-chapter-top">
              <span className="ccna-chapter-label">{chapter.id === 'appendix' ? t('Appendix') : `${t('Chapter')} ${chapter.bookNumber}`}</span>
              <span className="ccna-chapter-count">{read}/{chapter.sections.length}</span>
            </span>
            <strong className="ccna-chapter-title ccna-content-title" dir="ltr">{chapter.title}</strong>
            <span className="ccna-chapter-desc" dir="ltr">{chapter.description}</span>
            <span className="ccna-chapter-progress" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
            <span className="ccna-chapter-foot">
              <span dir="ltr">{chapter.kicker}</span>
              <span>{percent}%</span>
            </span>
          </button>
        })}
      </div>
    </section>

    <section className="ccna-how" aria-labelledby="ccna-how-title">
      <div className="ccna-section-heading">
        <div>
          <span className="ccna-eyebrow">{t('How it works')}</span>
          <h2 id="ccna-how-title">{t('The book is the map. The simulator is the lab.')}</h2>
        </div>
      </div>
      <div className="ccna-how-grid">
        <div className="ccna-how-step"><span className="ccna-how-number">01</span><span className="ccna-how-icon"><AcademyIcon name="book" size={17} /></span><strong>{t('Read the concept')}</strong><p>{t('Short, dense sections built from the official cert guide. No filler.')}</p></div>
        <div className="ccna-how-step"><span className="ccna-how-number">02</span><span className="ccna-how-icon"><AcademyIcon name="target" size={17} /></span><strong>{t('Check yourself')}</strong><p>{t('Every check is tied to a section and explains the reasoning, not just the answer.')}</p></div>
        <div className="ccna-how-step"><span className="ccna-how-number">03</span><span className="ccna-how-icon"><AcademyIcon name="flask" size={17} /></span><strong>{t('Wire it up')}</strong><p>{t('Open the matching guided lab and prove the concept on a real topology.')}</p></div>
      </div>
    </section>

    <footer className="ccna-home-foot">
      <p>{t('Built from the Cisco CCNA 200-301 Official Cert Guide, Volume 1. Paraphrased for study. Not affiliated with or endorsed by Cisco. Cisco, CCNA, and Packet Tracer are trademarks of Cisco Systems, Inc.')}</p>
      <p className="ccna-home-foot-note">{t('Course content is in English. The interface follows your language.')} {t('Your progress is stored only in this browser.')}</p>
      {confirmReset ? <div className="ccna-reset-confirm">
        <span>{t('Reset all Academy progress on this browser?')}</span>
        <button type="button" className="ccna-text-button" onClick={() => setConfirmReset(false)}>{t('Cancel')}</button>
        <button type="button" className="ccna-text-button ccna-text-button-danger" onClick={() => { resetProgress(); setConfirmReset(false) }} data-testid="academy-reset-confirm">{t('Reset')}</button>
      </div> : <button type="button" className="ccna-text-button" onClick={() => setConfirmReset(true)} data-testid="academy-reset"><AcademyIcon name="reset" size={13} />{t('Reset progress')}</button>}
    </footer>
  </div>
}
