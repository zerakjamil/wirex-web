'use client'

import React from 'react'
import { ccnaRescuePaths, getReadingMinutes, getRescuePath, getRescueSections } from '@/content/ccnaCourse'
import { useAcademyStore } from '@/store/academyStore'
import { useI18n } from '@/i18n/useI18n'
import { AcademyIcon } from './AcademyIcons'
import { ProgressRing } from './ProgressRing'
import { startGuidedLab } from './actions'

export function AcademyRescue() {
  const { t, dir } = useI18n()
  const activeRescueId = useAcademyStore(state => state.activeRescueId)
  const completedSections = useAcademyStore(state => state.completedSections)
  const startRescue = useAcademyStore(state => state.startRescue)
  const clearRescue = useAcademyStore(state => state.clearRescue)
  const openSection = useAcademyStore(state => state.openSection)
  const path = activeRescueId ? getRescuePath(activeRescueId) : undefined

  if (!path) {
    return <div className="ccna-rescue" dir={dir} data-testid="academy-rescue">
      <header className="ccna-rescue-head">
        <span className="ccna-eyebrow"><AcademyIcon name="flame" size={12} />{t('Rescue mode')}</span>
        <h1>{t('Last-minute? Start with the highest-yield path.')}</h1>
        <p>{t('This is a triage plan, not a shortcut around understanding. Read each section, then prove it in the lab.')}</p>
      </header>
      <div className="ccna-rescue-grid">
        {ccnaRescuePaths.map(item => <article className="ccna-rescue-card" key={item.id} data-testid={`academy-rescue-${item.id}`}>
          <span className="ccna-rescue-minutes"><AcademyIcon name="clock" size={12} />{item.minutes} {t('minutes')}</span>
          <h2 className="ccna-content-title" dir="ltr">{item.title}</h2>
          <p className="ccna-content-title" dir="ltr">{item.description}</p>
          <div className="ccna-rescue-meta">
            <span>{item.sectionIds.length} {t('sections')}</span>
            {item.lab && <span><AcademyIcon name="flask" size={12} />{t('Lab')}</span>}
          </div>
          <button type="button" className="ccna-button ccna-button-primary" onClick={() => startRescue(item.id)} data-testid={`academy-rescue-start-${item.id}`}>{t('Start path')}<AcademyIcon name={dir === 'rtl' ? 'arrow-left' : 'arrow-right'} size={14} /></button>
        </article>)}
      </div>
      <p className="ccna-rescue-note">{t('If you are short on time, read the section, answer its check, then open the matching lab. Do not skip the check: it is your fastest feedback.')}</p>
    </div>
  }

  const sections = getRescueSections(path)
  const read = sections.filter(section => completedSections.includes(section.id)).length
  const percent = sections.length ? Math.round((read / sections.length) * 100) : 0
  const nextSection = sections.find(section => !completedSections.includes(section.id))
  const complete = read === sections.length

  return <div className="ccna-rescue" dir={dir} data-testid="academy-rescue-checklist">
    <button type="button" className="ccna-text-button ccna-rescue-back" onClick={clearRescue}><AcademyIcon name={dir === 'rtl' ? 'arrow-right' : 'arrow-left'} size={13} />{t('Choose a path')}</button>
    <header className="ccna-rescue-head ccna-rescue-head--active">
      <div>
        <span className="ccna-eyebrow"><AcademyIcon name="flame" size={12} />{t('Rescue mode')} · {path.minutes} {t('minutes')}</span>
        <h1 className="ccna-content-title" dir="ltr">{path.title}</h1>
        <p className="ccna-content-title" dir="ltr">{path.description}</p>
      </div>
      <div className="ccna-rescue-progress">
        <ProgressRing value={percent} size={70} stroke={5} label={`${percent}%`} />
        <div><strong>{read} / {sections.length}</strong><span>{t('Path progress')}</span></div>
      </div>
    </header>

    <div className="ccna-practice-progress" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>

    <div className="ccna-rescue-list">
      {sections.map(section => {
        const done = completedSections.includes(section.id)
        return <button type="button" key={section.id} className={`ccna-rescue-row${done ? ' is-done' : ''}`} onClick={() => openSection(section.id)} data-testid={`academy-rescue-section-${section.id}`}>
          <span className="ccna-rescue-status" aria-hidden="true">{done ? <AcademyIcon name="check" size={13} /> : <AcademyIcon name="circle" size={13} />}</span>
          <span className="ccna-rescue-number" dir="ltr">{section.number}</span>
          <span className="ccna-rescue-title ccna-content-title" dir="ltr">{section.title}</span>
          <span className="ccna-rescue-time"><AcademyIcon name="clock" size={11} />{getReadingMinutes(section.id)} {t('min')}</span>
          <AcademyIcon name={dir === 'rtl' ? 'chevron-left' : 'chevron-right'} size={13} />
        </button>
      })}
    </div>

    {complete && <section className="ccna-rescue-complete">
      <AcademyIcon name="award" size={22} />
      <div><strong>{t('Path complete')}</strong><p>{t('Now prove it in the simulator.')}</p></div>
    </section>}

    <div className="ccna-rescue-actions">
      {nextSection && <button type="button" className="ccna-button ccna-button-primary" onClick={() => openSection(nextSection.id)}>{t('Next up')}: <span className="ccna-content-title" dir="ltr">{nextSection.title}</span><AcademyIcon name={dir === 'rtl' ? 'arrow-left' : 'arrow-right'} size={14} /></button>}
      {path.lab && <button type="button" className="ccna-button" onClick={() => startGuidedLab(path.lab!.lesson)} data-testid="academy-rescue-lab"><AcademyIcon name="flask" size={14} />{t('Start guided lab')}</button>}
      <button type="button" className="ccna-button ccna-button-ghost" onClick={clearRescue}>{t('Exit path')}</button>
    </div>
    {path.lab && <p className="ccna-rescue-note ccna-content-title" dir="ltr">{path.lab.description}</p>}
  </div>
}
