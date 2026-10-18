'use client'

import React, { useEffect, useState } from 'react'
import { useActivityStore } from '@/store/activityStore'
import { useNetworkStore } from '@/store/networkStore'
import { useI18n } from '@/i18n/useI18n'
import { activityFileSlug, scoreActivity } from '@/simulator/activity'

export function ActivityWorkspace() {
  const { t, dir } = useI18n()
  const session = useActivityStore(state => state.session)
  const error = useActivityStore(state => state.error)
  const devices = useNetworkStore(state => state.devices)
  const [open, setOpen] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [uiActivity, setUiActivity] = useState(session?.activity ?? null)
  if ((session?.activity ?? null) !== uiActivity) {
    setUiActivity(session?.activity ?? null)
    setOpen(false)
    setResetArmed(false)
    setMessage(null)
  }
  useEffect(() => {
    if (!resetArmed) return
    const id = setTimeout(() => setResetArmed(false), 4000)
    return () => clearTimeout(id)
  }, [resetArmed])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const score = session?.checks ? scoreActivity(session.checks) : null
  const itemsById = new Map((session?.activity.items ?? []).map(item => [item.id, item]))
  const answerNames = new Map((session?.activity.answer.devices ?? []).map(device => [device.id, device.name]))

  const saveResults = () => {
    const json = useActivityStore.getState().resultsJson()
    if (!json || !session) return
    const fileName = `${activityFileSlug(session.activity.name)}-results.json`
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage(`Results saved as ${fileName}.`)
  }

  return (
    <>
      {session && !open && (
        <button type="button" className="pt-activity-chip" aria-expanded={false} onClick={() => setOpen(true)}>
          <span
            className={`pt-activity-dot ${score ? (score.total > 0 && score.passed === score.total ? 'is-success' : 'is-failed') : 'is-pending'}`}
            aria-hidden="true"
          />
          <span className="pt-activity-chip-name">{session.activity.name}</span>
          {score && <span dir="ltr">{score.passed}/{score.total}</span>}
        </button>
      )}
      {session && open && (
        <aside className="pt-activity-panel" dir={dir} aria-label={t('Activity')}>
          <header>
            <h2>{session.activity.name}</h2>
            <button aria-label={t('Close')} onClick={() => setOpen(false)}>×</button>
          </header>
          {session.activity.author && (
            <p className="pt-activity-author">
              {t('Author')}: <span dir="auto">{session.activity.author}</span>
            </p>
          )}
          {session.activity.instructions.length > 0 && (
            <section>
              <h3>{t('Instructions')}</h3>
              <ol dir="auto">
                {session.activity.instructions.map((line, index) => <li key={index}>{line}</li>)}
              </ol>
            </section>
          )}
          <div className="pt-training-actions">
            <button type="button" onClick={() => useActivityStore.getState().check()}>{t('Check Results')}</button>
            <button
              type="button"
              onClick={() => {
                if (!resetArmed) {
                  setResetArmed(true)
                  return
                }
                setResetArmed(false)
                setMessage(null)
                useActivityStore.getState().reset()
              }}
            >
              {resetArmed ? t('Reset Activity?') : t('Reset Activity')}
            </button>
            <button type="button" onClick={saveResults} disabled={!session.checks}>{t('Save Results...')}</button>
            <button type="button" onClick={() => useActivityStore.getState().exit()}>{t('Exit Activity')}</button>
          </div>
          {message && <p className="pt-activity-message" role="status">{message}</p>}
          <section className="pt-activity-results">
            {session.checks && score ? (
              <>
                <h3>{t('Score')} <span dir="ltr">{score.passed} / {score.total} ({score.percent}%)</span></h3>
                <ul>
                  {session.checks.map(check => {
                    const item = itemsById.get(check.id)
                    if (!item) return null
                    const deviceName = devices.find(device => device.id === item.deviceId)?.name ?? answerNames.get(item.deviceId) ?? item.deviceId
                    const successful = check.status === 'successful'
                    return (
                      <li key={check.id} className={successful ? 'is-successful' : 'is-failed'}>
                        <span aria-hidden="true">{successful ? '✓' : '✗'}</span>
                        <div>
                          <strong>{deviceName} · {item.label}</strong>
                          <small>{successful ? t('Successful') : t('Failed')}</small>
                          {!successful && (
                            <small>
                              {t('Expected')}: <span dir="ltr">{item.expected}</span><br />
                              {t('Observed')}: <span dir="ltr">{check.observed}</span>
                            </small>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p>{t('Run Check Results to grade your work.')}</p>
            )}
          </section>
        </aside>
      )}
      {error && (
        <div className="pt-activity-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => useActivityStore.getState().dismissError()}>{t('Close')}</button>
        </div>
      )}
    </>
  )
}
