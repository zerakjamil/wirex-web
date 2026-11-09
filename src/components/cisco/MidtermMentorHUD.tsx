'use client'

import React from 'react'
import {
  useMidtermQuestStore,
  getQuestStages,
  type QuestLabId,
} from '@/store/midtermQuestStore'
import { useNetworkStore } from '@/store/networkStore'
import './midtermMentor.css'

export function MidtermMentorHUD() {
  const questId = useMidtermQuestStore((s) => s.questId)
  const currentStageIndex = useMidtermQuestStore((s) => s.currentStageIndex)
  const activeDeviceId = useMidtermQuestStore((s) => s.activeDeviceId)
  const mentorMessage = useMidtermQuestStore((s) => s.mentorMessage)
  const mentorMood = useMidtermQuestStore((s) => s.mentorMood)
  const hintLevel = useMidtermQuestStore((s) => s.hintLevel)
  const lastTrafficTestStatus = useMidtermQuestStore((s) => s.lastTrafficTestStatus)
  const completedStages = useMidtermQuestStore((s) => s.completedStages)

  const startQuest = useMidtermQuestStore((s) => s.startQuest)
  const exitQuest = useMidtermQuestStore((s) => s.exitQuest)
  const goToStage = useMidtermQuestStore((s) => s.goToStage)
  const nextStage = useMidtermQuestStore((s) => s.nextStage)
  const prevStage = useMidtermQuestStore((s) => s.prevStage)
  const setActiveDeviceId = useMidtermQuestStore((s) => s.setActiveDeviceId)
  const checkStageWork = useMidtermQuestStore((s) => s.checkStageWork)
  const testTraffic = useMidtermQuestStore((s) => s.testTraffic)
  const requestHint = useMidtermQuestStore((s) => s.requestHint)

  const devices = useNetworkStore((s) => s.devices)
  const links = useNetworkStore((s) => s.links)

  const stages = getQuestStages(questId)
  const stage = stages[currentStageIndex] || stages[0]

  const tasksStatus = stage.tasks.map((task) => ({
    ...task,
    done: task.isDone(devices, links),
  }))
  const isStageFullyComplete = tasksStatus.every((t) => t.done)

  return (
    <aside className="midterm-mentor-hud" aria-label="Exam Quest">
      {/* 1. Header: Scenario & Exit */}
      <div className="midterm-hud-topbar">
        <select
          className="midterm-hud-select"
          value={questId}
          aria-label="Exam Scenario"
          onChange={(e) => startQuest(e.target.value as QuestLabId)}
        >
          <option value="predicted-2026">Predicted Midterm 2026</option>
          <option value="midterm-2024">Midterm 2024–2025</option>
          <option value="final-2025">Final 2025–2026</option>
          <option value="voice-telephony">Lab 4: Voice & IP Telephony (Unconfigured)</option>
        </select>
        <button className="midterm-hud-exit" onClick={exitQuest} title="Exit Quest">
          Exit
        </button>
      </div>

      {/* 2. Stage Navigation */}
      <div className="midterm-stage-nav">
        <div className="midterm-stage-dots">
          {stages.map((stg, idx) => {
            const isCompleted = completedStages[stg.id] || stg.tasks.every((t) => t.isDone(devices, links))
            const isActive = idx === currentStageIndex
            return (
              <button
                key={stg.id}
                className={`midterm-dot-btn ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-done' : ''}`}
                onClick={() => goToStage(idx)}
                aria-label={`Stage ${idx + 1}: ${stg.title}`}
              >
                {isCompleted ? '✓' : idx + 1}
              </button>
            )
          })}
        </div>
        <div className="midterm-stage-title-row">
          <strong>{stage.title}</strong>
        </div>
      </div>

      {/* 3. Mentor Guidance */}
      <div className={`midterm-speech-card is-${mentorMood}`}>
        <p className="midterm-speech-text">{mentorMessage}</p>
      </div>

      {/* 4. Objectives Checklist */}
      <ul className="midterm-task-list">
        {tasksStatus.map((task) => (
          <li
            key={task.id}
            className={`midterm-task-item ${task.done ? 'is-complete' : 'is-pending'}`}
          >
            <span className="midterm-task-checkbox" aria-hidden="true">
              {task.done ? '✓' : '○'}
            </span>
            <span className="midterm-task-label">{task.label}</span>
            {task.deviceHint && (
              <button
                className={`midterm-device-tag ${activeDeviceId === task.deviceHint ? 'is-active' : ''}`}
                onClick={() => {
                  const match = devices.find(
                    (d) =>
                      d.name.toLowerCase().includes(task.deviceHint.toLowerCase()) ||
                      d.id.toLowerCase().includes(task.deviceHint.toLowerCase())
                  )
                  if (match) setActiveDeviceId(match.id)
                }}
                title={`Open ${task.deviceHint} CLI`}
              >
                {task.deviceHint}
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* 5. Minimal Action Toolbar */}
      <div className="midterm-actions-bar">
        <button className="midterm-btn-primary" onClick={checkStageWork}>
          Check Work
        </button>

        <button
          className="midterm-btn-traffic"
          onClick={testTraffic}
          disabled={lastTrafficTestStatus === 'pending'}
        >
          {lastTrafficTestStatus === 'pending' ? 'Testing...' : 'Test Ping'}
        </button>

        <button
          className="midterm-btn-hint"
          onClick={requestHint}
          disabled={hintLevel >= 3}
        >
          {hintLevel === 0 ? 'Hint' : hintLevel === 1 ? 'Requirements' : 'Commands'}
        </button>
      </div>

      {/* 6. Stage Prev / Next */}
      <div className="midterm-nav-bar">
        <button
          className="midterm-nav-prev"
          onClick={prevStage}
          disabled={currentStageIndex === 0}
        >
          Previous
        </button>
        <button
          className={`midterm-nav-next ${isStageFullyComplete ? 'is-celebrating' : ''}`}
          onClick={nextStage}
          disabled={currentStageIndex === stages.length - 1}
        >
          Next
        </button>
      </div>
    </aside>
  )
}
