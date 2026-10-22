'use client'
import { trainingGuides } from '@/simulator/trainingGuides'
import type { LearningMode, LessonId } from '@/simulator/trainingLabs'
import { useNetworkStore } from '@/store/networkStore'
import { useTrainingStore } from '@/store/trainingStore'
import { useI18n } from '@/i18n/useI18n'

export function TrainingGuide({ lesson, mode }: { lesson: LessonId; mode: LearningMode }) {
  const devices = useNetworkStore(s => s.devices)
  const { t } = useI18n()
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
            <button type="button" onClick={() => useTrainingStore.setState({ deviceId: step.deviceId })} aria-label={`${t('Use this device')}: ${deviceName(step.deviceId)}`}>{t('Use this device')}</button>
            {showCommands ? <pre dir="ltr">{step.commands.join('\n')}</pre> : <p className="pt-guide-hidden">{t('Commands are hidden in this mode. Reveal a hint when you are ready.')}</p>}
            {showCommands && step.verify && step.verify.length > 0 && <p className="pt-guide-verify"><b>{t('Verify')}:</b> <code dir="ltr">{step.verify.join(' · ')}</code></p>}
          </li>)}</ol>
          <h4>{t('Verify')}</h4>
          <ul>{guide.verify.map(line => <li key={line}>{line}</li>)}</ul>
          <h4>{t('Common mistakes')}</h4>
          <ul>{guide.mistakes.map(line => <li key={line}>{line}</li>)}</ul>
        </div>
      </div>
    </details>
  </>
}
