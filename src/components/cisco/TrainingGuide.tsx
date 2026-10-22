'use client'
import { useEffect, useRef, useState } from 'react'
import { trainingGuides } from '@/simulator/trainingGuides'
import type { LearningMode, LessonId } from '@/simulator/trainingLabs'
import { useNetworkStore } from '@/store/networkStore'
import { useTrainingStore } from '@/store/trainingStore'
import { useI18n } from '@/i18n/useI18n'

function copyWithSelection(text: string): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  area.style.top = '0'
  document.body.appendChild(area)
  area.focus()
  area.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  area.remove()
  active?.focus()
  return copied
}

export function TrainingGuide({ lesson, mode }: { lesson: LessonId; mode: LearningMode }) {
  const devices = useNetworkStore(s => s.devices)
  const { t } = useI18n()
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const copyTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
  }, [])

  const copyStep = async (commands: string[], index: number) => {
    const text = commands.join('\n')
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else if (!copyWithSelection(text)) {
        return
      }
    } catch {
      if (!copyWithSelection(text)) return
    }
    setCopiedStep(index)
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopiedStep(null), 1600)
  }

  if (mode === 'exam' || lesson === 'exam') return null
  const guide = trainingGuides[lesson]
  const showCommands = mode === 'guided' || mode === 'free'
  const deviceName = (id: string) => devices.find(device => device.id === id)?.name || id

  return <>
    <p className="pt-guide-summary" dir="ltr">{guide.summary}</p>
    <details className="pt-lesson-guide">
      <summary>{t('Full configuration walkthrough')}</summary>
      <div className="pt-lesson-guide-body">
        <div dir="ltr">
          <h4>{t('Topology')}</h4>
          <ul>{guide.topology.map(line => <li key={line}>{line}</li>)}</ul>
          <h4>{t('Before you start')}</h4>
          <ul>{guide.before.map(line => <li key={line}>{line}</li>)}</ul>
          <h4>{t('Configuration steps')}</h4>
          <ol>{guide.steps.map((step, index) => <li className="pt-guide-step" key={`${step.deviceId}-${index}`}>
            <div className="pt-guide-step-head"><strong>{step.title}</strong><small>{deviceName(step.deviceId)}</small></div>
            <p>{step.body}</p>
            <div className="pt-guide-step-actions">
              <button type="button" onClick={() => useTrainingStore.setState({ deviceId: step.deviceId })} aria-label={`${t('Use this device')}: ${deviceName(step.deviceId)}`}>{t('Use this device')}</button>
              {showCommands && <button type="button" className="pt-guide-copy" data-testid={`guide-copy-${index}`} onClick={() => { void copyStep(step.commands, index) }} aria-label={`${copiedStep === index ? t('Copied') : t('Copy all')}: ${step.title}`}>{copiedStep === index ? t('Copied') : t('Copy all')}</button>}
              {showCommands && <span className="pt-sr-only" aria-live="polite">{copiedStep === index ? t('Copied') : ''}</span>}
            </div>
            {showCommands ? <pre dir="ltr">{step.commands.join('\n')}</pre> : <p className="pt-guide-hidden">{t('Commands are hidden in this mode. Reveal a hint when you are ready.')}</p>}
            {showCommands && step.verify && step.verify.length > 0 && <p className="pt-guide-verify"><b>{t('Verify')}:</b> <code dir="ltr">{step.verify.join(' · ')}</code></p>}
          </li>)}</ol>
          <h4>{t('Verify')}</h4>
          <ul>{guide.verify.map(line => <li key={line}>{line}</li>)}</ul>
          {guide.expected && guide.expected.length > 0 && <>
            <h4>{t('Expected')}</h4>
            {guide.expected.map(item => <div className="pt-guide-expected" key={item.title}>
              <p><code dir="ltr">{item.title}</code></p>
              <pre dir="ltr">{item.output.join('\n')}</pre>
            </div>)}
          </>}
          <h4>{t('Common mistakes')}</h4>
          <ul>{guide.mistakes.map(line => <li key={line}>{line}</li>)}</ul>
        </div>
      </div>
    </details>
  </>
}
