'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useTrainingStore } from '@/store/trainingStore'
import { useActivityStore } from '@/store/activityStore'
import { useI18n } from '@/i18n/useI18n'
import {
  collectAssessmentCandidates, serializeActivity, activityFileName,
  type ActivityItem, type AssessmentActivity,
} from '@/simulator/activity'
import { stripRoutingRuntime } from '@/simulator/routingRuntime'

export function ActivityWizardModal() {
  const { t } = useI18n()
  const activeModal = useNetworkStore(state => state.activeModal)
  const setActiveModal = useNetworkStore(state => state.setActiveModal)
  const devices = useNetworkStore(state => state.devices)
  const links = useNetworkStore(state => state.links)
  const annotations = useNetworkStore(state => state.annotations)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [instructions, setInstructions] = useState('')
  const [deselected, setDeselected] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (activeModal?.type === 'activity-wizard') {
      if (!dialogRef.current?.open) dialogRef.current?.showModal()
    } else if (dialogRef.current?.open) {
      dialogRef.current.close()
    }
  }, [activeModal])

  const candidates = useMemo(() => collectAssessmentCandidates(devices), [devices])
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; items: ActivityItem[] }>()
    for (const item of candidates) {
      const device = devices.find(d => d.id === item.deviceId)
      if (!device) continue
      const group = map.get(item.deviceId) ?? { id: device.id, name: device.name, items: [] }
      group.items.push(item)
      map.set(item.deviceId, group)
    }
    return [...map.values()]
  }, [candidates, devices])

  if (activeModal?.type !== 'activity-wizard') return null

  const deselectedSet = new Set(deselected)
  const selected = candidates.filter(item => !deselectedSet.has(item.id))

  const toggleItem = (id: string) => setDeselected(current => current.includes(id) ? current.filter(entry => entry !== id) : [...current, id])
  const toggleGroup = (items: ActivityItem[]) => {
    const ids = items.map(item => item.id)
    const allSelected = ids.every(id => !deselectedSet.has(id))
    setDeselected(current => allSelected ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)))
  }
  const toggleAll = () => setDeselected(selected.length ? candidates.map(item => item.id) : [])

  const build = (): AssessmentActivity | null => {
    if (!name.trim()) {
      setMessage(t('Enter an activity name.'))
      return null
    }
    if (!selected.length) {
      setMessage(t('Select at least one assessment item.'))
      return null
    }
    setMessage(null)
    return {
      version: 1,
      name: name.trim(),
      author: author.trim(),
      instructions: instructions.split('\n').map(line => line.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
      items: selected,
      answer: {
        devices: stripRoutingRuntime(structuredClone(devices)),
        links: structuredClone(links),
        annotations: structuredClone(annotations),
      },
    }
  }

  const saveFile = () => {
    const activity = build()
    if (!activity) return
    const fileName = activityFileName(activity.name)
    const url = URL.createObjectURL(new Blob([serializeActivity(activity)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage(`Activity file saved as ${fileName}.`)
  }

  const startTrial = () => {
    const activity = build()
    if (!activity) return
    if (useTrainingStore.getState().active) useTrainingStore.getState().exit()
    useActivityStore.getState().start(activity)
    setActiveModal(null)
  }

  return (
    <dialog
      ref={dialogRef}
      className="pt-activity-wizard"
      onCancel={() => setActiveModal(null)}
      onClick={e => {
        if (e.target === e.currentTarget) setActiveModal(null)
      }}
    >
      <header>
        <h2>{t('Activity Wizard')}</h2>
        <button aria-label={t('Close')} onClick={() => setActiveModal(null)}>×</button>
      </header>
      <p>{t('Create a graded activity from this network: the values below come from the current answer network, and the student network starts from this network with the selected items cleared.')}</p>
      <div className="pt-activity-fields">
        <label>
          {t('Activity name')}
          <input value={name} maxLength={120} onChange={e => setName(e.currentTarget.value)} />
        </label>
        <label>
          {t('Author')}
          <input value={author} maxLength={120} onChange={e => setAuthor(e.currentTarget.value)} />
        </label>
      </div>
      <label className="pt-activity-instructions">
        {t('Instructions (one step per line)')}
        <textarea rows={4} value={instructions} onChange={e => setInstructions(e.currentTarget.value)} />
      </label>
      <div className="pt-activity-items-header">
        <h3>{t('Assessment items')}</h3>
        <span dir="ltr">{selected.length} / {candidates.length} {t('selected')}</span>
        <button type="button" onClick={toggleAll} disabled={!candidates.length}>{selected.length ? t('None') : t('All')}</button>
      </div>
      {candidates.length === 0 ? (
        <p>{t('This network has no items that can be assessed yet.')}</p>
      ) : (
        <div className="pt-activity-items" role="group" aria-label={t('Assessment items')}>
          {groups.map(group => {
            const groupSelected = group.items.filter(item => !deselectedSet.has(item.id)).length
            return (
              <section key={group.id}>
                <header>
                  <strong>{group.name}</strong>
                  <span dir="ltr">{groupSelected} / {group.items.length}</span>
                  <button type="button" onClick={() => toggleGroup(group.items)}>{groupSelected === group.items.length ? t('None') : t('All')}</button>
                </header>
                <ul>
                  {group.items.map(item => (
                    <li key={item.id}>
                      <label>
                        <input type="checkbox" checked={!deselectedSet.has(item.id)} onChange={() => toggleItem(item.id)} />
                        <span>{item.label}</span>
                        <small dir="ltr">{item.expected}</small>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      {message && <p className="pt-activity-message" role="status">{message}</p>}
      <footer className="pt-training-actions">
        <button type="button" onClick={startTrial} disabled={!candidates.length}>{t('Start Trial')}</button>
        <button type="button" onClick={saveFile} disabled={!candidates.length}>{t('Save Activity File...')}</button>
        <button type="button" onClick={() => setActiveModal(null)}>{t('Close')}</button>
      </footer>
    </dialog>
  )
}
