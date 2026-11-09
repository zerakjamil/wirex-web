'use client'

import React, { useState, useMemo } from 'react'
import {
  curiousKidStories,
  pastExamPapers,
  predictedMidterm2026,
  type ExamQuestion,
  type SubnetCalcProblem,
} from '@/content/pastExamsData'
import { useAcademyStore } from '@/store/academyStore'
import { useMidtermQuestStore, type QuestLabId } from '@/store/midtermQuestStore'
import { useI18n } from '@/i18n/useI18n'
import { AcademyIcon } from './AcademyIcons'

// Web Audio API Synthesizer for Game-Feel
function playSound(type: 'success' | 'wrong' | 'streak' | 'click') {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    if (type === 'click') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(440, now)
      gain.gain.setValueAtTime(0.04, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.04)
    } else if (type === 'success') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, now) // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12) // G5
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.22)
    } else if (type === 'wrong') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(164.81, now) // E3
      osc.frequency.exponentialRampToValueAtTime(130.81, now + 0.18) // C3
      gain.gain.setValueAtTime(0.06, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.2)
    } else if (type === 'streak') {
      // Fanfare Arpeggio: C5 -> E5 -> G5 -> C6
      const freqs = [523.25, 659.25, 783.99, 1046.5]
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(f, now + i * 0.07)
        gain.gain.setValueAtTime(0.08, now + i * 0.07)
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.2)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + i * 0.07)
        osc.stop(now + i * 0.07 + 0.2)
      })
    }
  } catch {
    // AudioContext blocked or not supported
  }
}

type ArenaTab = 'prediction' | 'duel' | 'subnet' | 'stories' | 'papers'

export function MidtermArena() {
  const { t, dir } = useI18n()
  const [activeTab, setActiveTab] = useState<ArenaTab>('prediction')
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [highestStreak, setHighestStreak] = useState(0)
  const [selectedStoryId, setSelectedStoryId] = useState(curiousKidStories[0]?.id || '')
  const [selectedPaperId, setSelectedPaperId] = useState(pastExamPapers[0]?.id || '')

  // Quick Duel state
  const allQuestions = useMemo(() => {
    const list: (ExamQuestion & { source: string })[] = []
    predictedMidterm2026.sections.forEach(s => {
      s.questions.forEach(q => list.push({ ...q, source: 'Predicted Midterm 2026' }))
    })
    pastExamPapers.forEach(p => {
      p.questions.forEach(q => list.push({ ...q, source: p.title }))
    })
    return list
  }, [])

  const [duelIndex, setDuelIndex] = useState(0)
  const [duelSelected, setDuelSelected] = useState<number | null>(null)
  const [duelSubmitted, setDuelSubmitted] = useState(false)

  // Subnet Surgeon state
  const subnetProblems: SubnetCalcProblem[] = useMemo(() => {
    const list: SubnetCalcProblem[] = []
    pastExamPapers.forEach(p => {
      if (p.subnetProblems) list.push(...p.subnetProblems)
    })
    if (predictedMidterm2026.sections[1]?.subnetDrill) {
      list.push(predictedMidterm2026.sections[1].subnetDrill)
    }
    return list
  }, [])

  const [currentSubnetIdx, setCurrentSubnetIdx] = useState(0)
  const [inputFirst, setInputFirst] = useState('')
  const [inputLast, setInputLast] = useState('')
  const [inputBroadcast, setInputBroadcast] = useState('')
  const [inputUsable, setInputUsable] = useState('')
  const [subnetFeedback, setSubnetFeedback] = useState<{
    submitted: boolean
    firstOk: boolean
    lastOk: boolean
    bcastOk: boolean
    usableOk: boolean
  } | null>(null)

  const activeSubnet = subnetProblems[currentSubnetIdx] || subnetProblems[0]

  // Switch tabs with sound
  const handleTabSwitch = (tab: ArenaTab) => {
    playSound('click')
    setActiveTab(tab)
  }

  // Handle Duel Submit
  const handleDuelSubmit = () => {
    const currentQ = allQuestions[duelIndex]
    if (!currentQ || duelSelected === null) return

    const isCorrect = duelSelected === currentQ.answer
    setDuelSubmitted(true)

    if (isCorrect) {
      const newStreak = streak + 1
      setStreak(newStreak)
      if (newStreak > highestStreak) setHighestStreak(newStreak)
      const multiplier = newStreak >= 5 ? 3 : newStreak >= 3 ? 2 : 1
      const pointsEarned = 10 * multiplier
      setScore(s => s + pointsEarned)

      if (newStreak >= 3) {
        playSound('streak')
      } else {
        playSound('success')
      }
    } else {
      setStreak(0)
      playSound('wrong')
    }
  }

  const handleDuelNext = () => {
    playSound('click')
    setDuelIndex((duelIndex + 1) % allQuestions.length)
    setDuelSelected(null)
    setDuelSubmitted(false)
  }

  // Handle Subnet Check
  const handleSubnetCheck = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSubnet) return

    const firstOk = inputFirst.trim() === activeSubnet.firstHost
    const lastOk = inputLast.trim() === activeSubnet.lastHost
    const bcastOk = inputBroadcast.trim() === activeSubnet.broadcast
    const usableOk = parseInt(inputUsable.trim(), 10) === activeSubnet.usableHosts

    const allOk = firstOk && lastOk && bcastOk && usableOk
    setSubnetFeedback({ submitted: true, firstOk, lastOk, bcastOk, usableOk })

    if (allOk) {
      setScore(s => s + 50)
      setStreak(st => st + 1)
      playSound('streak')
    } else {
      playSound('wrong')
    }
  }

  const handleSubnetNext = () => {
    playSound('click')
    setCurrentSubnetIdx((currentSubnetIdx + 1) % subnetProblems.length)
    setInputFirst('')
    setInputLast('')
    setInputBroadcast('')
    setInputUsable('')
    setSubnetFeedback(null)
  }

  // Handle Lab Launch into live simulator canvas with Mentor HUD
  const handleLaunchLab = (labKey: string) => {
    playSound('streak')
    let questId: QuestLabId = 'predicted-2026'
    if (labKey === 'midterm-2024-2025') questId = 'midterm-2024'
    if (labKey.startsWith('final-2025')) questId = 'final-2025'

    useAcademyStore.getState().closeAcademy()
    useMidtermQuestStore.getState().startQuest(questId)
  }

  const activeStory = curiousKidStories.find(s => s.id === selectedStoryId) || curiousKidStories[0]
  const activePaper = pastExamPapers.find(p => p.id === selectedPaperId) || pastExamPapers[0]

  return (
    <div className="midterm-arena" dir={dir}>
      {/* ARENA HEADER */}
      <header className="arena-header">
        <div className="arena-header-left">
          <div className="arena-badge">
            <span className="arena-pulse" aria-hidden="true" />
            <AcademyIcon name="spark" size={14} />
            <span>NDI704 · Midterm 2026 Battle Arena</span>
          </div>
          <h1>{t('Tomorrow’s Cisco Exam Preparation Arena')}</h1>
          <p className="arena-subtitle">
            {t(
              'Train on real semester questions, predict Dr. Reben Kurda’s exam, master concepts with 5-year-old stories, and launch live simulator topologies!'
            )}
          </p>
        </div>

        {/* GAMIFIED STATS HUD */}
        <div className="arena-hud">
          <div className="hud-card">
            <span className="hud-label">{t('XP Score')}</span>
            <span className="hud-value hud-score">{score}</span>
          </div>
          <div className="hud-card">
            <span className="hud-label">{t('Current Streak')}</span>
            <span className="hud-value hud-streak">
              {streak > 0 ? `🔥 ${streak}x` : '0'}
            </span>
          </div>
          <div className="hud-card">
            <span className="hud-label">{t('Best Streak')}</span>
            <span className="hud-value">{highestStreak}</span>
          </div>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <nav className="arena-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'prediction'}
          className={`arena-tab ${activeTab === 'prediction' ? 'is-active' : ''}`}
          onClick={() => handleTabSwitch('prediction')}
        >
          <AcademyIcon name="target" size={15} />
          <span>{t('Predicted Exam 2026')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'duel'}
          className={`arena-tab ${activeTab === 'duel' ? 'is-active' : ''}`}
          onClick={() => handleTabSwitch('duel')}
        >
          <AcademyIcon name="award" size={15} />
          <span>{t('Rapid Concept Duel')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'subnet'}
          className={`arena-tab ${activeTab === 'subnet' ? 'is-active' : ''}`}
          onClick={() => handleTabSwitch('subnet')}
        >
          <AcademyIcon name="flask" size={15} />
          <span>{t('Subnet Surgeon Matrix')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'stories'}
          className={`arena-tab ${activeTab === 'stories' ? 'is-active' : ''}`}
          onClick={() => handleTabSwitch('stories')}
        >
          <AcademyIcon name="book" size={15} />
          <span>{t('Curious Kid Stories')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'papers'}
          className={`arena-tab ${activeTab === 'papers' ? 'is-active' : ''}`}
          onClick={() => handleTabSwitch('papers')}
        >
          <AcademyIcon name="clock" size={15} />
          <span>{t('Past Exam Archives (PKT)')}</span>
        </button>
      </nav>

      {/* TAB CONTENT PANELS */}
      <div className="arena-panel">
        {/* 1. PREDICTED MIDTERM 2026 */}
        {activeTab === 'prediction' && (
          <div className="prediction-view">
            <div className="prediction-banner">
              <div className="banner-content">
                <span className="banner-tag">Erbil Technical Engineering · NDI704</span>
                <h2>{predictedMidterm2026.title}</h2>
                <p>{predictedMidterm2026.overview}</p>
                <div className="banner-meta">
                  <span>
                    <strong>Instructor:</strong> A.Prof. Dr. Reben Kurda
                  </span>
                  <span>
                    <strong>Total Marks:</strong> 100 Points
                  </span>
                  <span>
                    <strong>Passing Grade:</strong> 60 Points
                  </span>
                </div>
              </div>
              <div className="banner-action">
                <button
                  type="button"
                  className="btn-launch-primary"
                  onClick={() => handleLaunchLab('predicted-midterm-2026')}
                >
                  <AcademyIcon name="play" size={16} />
                  <span>{t('Load Predicted Exam Lab (PT)')}</span>
                </button>
                <small>{t('Opens live 3-Switch + Router-on-a-stick topology')}</small>
              </div>
            </div>

            <div className="prediction-rounds">
              {predictedMidterm2026.sections.map((round, idx) => (
                <div key={idx} className="round-card">
                  <div className="round-head">
                    <span className="round-number">Round {idx + 1}</span>
                    <h3>{round.title}</h3>
                    <span className="round-points">{round.points} Marks</span>
                  </div>
                  <p className="round-desc">{round.description}</p>

                  <div className="round-questions">
                    {round.questions.map(q => (
                      <div key={q.id} className="preview-question">
                        <span className="pq-text">{q.text}</span>
                        {q.highYieldTip && (
                          <div className="pq-tip">
                            <strong>⚡ Examiner Tip:</strong> {q.highYieldTip}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. RAPID CONCEPT DUEL */}
        {activeTab === 'duel' && (
          <div className="duel-view">
            {allQuestions[duelIndex] && (
              <div className="duel-card">
                <div className="duel-card-meta">
                  <span className="duel-source">
                    {allQuestions[duelIndex].source}
                  </span>
                  <span className="duel-count">
                    {duelIndex + 1} / {allQuestions.length}
                  </span>
                </div>

                <h3 className="duel-question-text">
                  {allQuestions[duelIndex].text}
                </h3>

                {allQuestions[duelIndex].curiousAnalogyRef && (
                  <button
                    type="button"
                    className="analogy-link-btn"
                    onClick={() => {
                      setSelectedStoryId(allQuestions[duelIndex].curiousAnalogyRef!)
                      setActiveTab('stories')
                    }}
                  >
                    🧸 {t('Need a simple story? Read Curious Kid Analogy')}
                  </button>
                )}

                <div className="duel-options">
                  {allQuestions[duelIndex].options?.map((opt, oIdx) => {
                    let optClass = 'duel-option-btn'
                    if (duelSubmitted) {
                      if (oIdx === allQuestions[duelIndex].answer) {
                        optClass += ' is-correct'
                      } else if (duelSelected === oIdx) {
                        optClass += ' is-wrong'
                      }
                    } else if (duelSelected === oIdx) {
                      optClass += ' is-selected'
                    }

                    return (
                      <button
                        key={oIdx}
                        type="button"
                        className={optClass}
                        disabled={duelSubmitted}
                        onClick={() => {
                          playSound('click')
                          setDuelSelected(oIdx)
                        }}
                      >
                        <span className="opt-letter">
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <span className="opt-text">{opt}</span>
                      </button>
                    )
                  })}
                </div>

                {duelSubmitted && (
                  <div
                    className={`duel-explanation ${
                      duelSelected === allQuestions[duelIndex].answer
                        ? 'is-success'
                        : 'is-failure'
                    }`}
                  >
                    <strong>
                      {duelSelected === allQuestions[duelIndex].answer
                        ? '🎉 Spot on!'
                        : '❌ Not quite!'}
                    </strong>
                    <p>{allQuestions[duelIndex].explanation}</p>
                    {allQuestions[duelIndex].highYieldTip && (
                      <p className="tip-callout">
                        💡 {allQuestions[duelIndex].highYieldTip}
                      </p>
                    )}
                  </div>
                )}

                <div className="duel-actions">
                  {!duelSubmitted ? (
                    <button
                      type="button"
                      className="btn-duel-submit"
                      disabled={duelSelected === null}
                      onClick={handleDuelSubmit}
                    >
                      {t('Lock Answer')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-duel-next"
                      onClick={handleDuelNext}
                    >
                      {t('Next Duel Question')} →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. SUBNET SURGEON MATRIX */}
        {activeTab === 'subnet' && (
          <div className="subnet-view">
            <div className="subnet-challenge-card">
              <div className="subnet-header">
                <div>
                  <span className="subnet-tag">{t('Calculation Challenge')}</span>
                  <h2>
                    {activeSubnet?.networkAddress} / {activeSubnet?.cidr}
                  </h2>
                </div>
                <div className="subnet-pagination">
                  <span>
                    {currentSubnetIdx + 1} of {subnetProblems.length}
                  </span>
                  <button
                    type="button"
                    className="btn-cycle"
                    onClick={handleSubnetNext}
                  >
                    {t('Next Subnet')} ↻
                  </button>
                </div>
              </div>

              <p className="subnet-prompt">
                {t(
                  'Given the network address and prefix length above, calculate the first usable host, last usable host, broadcast address, and total usable hosts.'
                )}
              </p>

              <form onSubmit={handleSubnetCheck} className="subnet-form">
                <div className="subnet-input-grid">
                  <div className="form-group">
                    <label>{t('First Usable Host')}</label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.10.1"
                      value={inputFirst}
                      onChange={e => setInputFirst(e.target.value)}
                      className={
                        subnetFeedback
                          ? subnetFeedback.firstOk
                            ? 'input-ok'
                            : 'input-bad'
                          : ''
                      }
                    />
                    {subnetFeedback && !subnetFeedback.firstOk && (
                      <span className="hint-err">
                        Correct: {activeSubnet.firstHost}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>{t('Last Usable Host')}</label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.10.62"
                      value={inputLast}
                      onChange={e => setInputLast(e.target.value)}
                      className={
                        subnetFeedback
                          ? subnetFeedback.lastOk
                            ? 'input-ok'
                            : 'input-bad'
                          : ''
                      }
                    />
                    {subnetFeedback && !subnetFeedback.lastOk && (
                      <span className="hint-err">
                        Correct: {activeSubnet.lastHost}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>{t('Broadcast Address')}</label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.10.63"
                      value={inputBroadcast}
                      onChange={e => setInputBroadcast(e.target.value)}
                      className={
                        subnetFeedback
                          ? subnetFeedback.bcastOk
                            ? 'input-ok'
                            : 'input-bad'
                          : ''
                      }
                    />
                    {subnetFeedback && !subnetFeedback.bcastOk && (
                      <span className="hint-err">
                        Correct: {activeSubnet.broadcast}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>{t('Total Usable Hosts')}</label>
                    <input
                      type="number"
                      placeholder="e.g. 62"
                      value={inputUsable}
                      onChange={e => setInputUsable(e.target.value)}
                      className={
                        subnetFeedback
                          ? subnetFeedback.usableOk
                            ? 'input-ok'
                            : 'input-bad'
                          : ''
                      }
                    />
                    {subnetFeedback && !subnetFeedback.usableOk && (
                      <span className="hint-err">
                        Correct: {activeSubnet.usableHosts}
                      </span>
                    )}
                  </div>
                </div>

                <div className="subnet-actions">
                  <button type="submit" className="btn-check-subnet">
                    {t('Verify Subnet Math')}
                  </button>
                  <button
                    type="button"
                    className="btn-next-subnet"
                    onClick={handleSubnetNext}
                  >
                    {t('Try Another Problem')} →
                  </button>
                </div>
              </form>

              {subnetFeedback?.submitted && (
                <div className="subnet-explanation">
                  <strong>💡 Mathematical Proof & Sizing Steps:</strong>
                  <p>{activeSubnet.explanation}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. CURIOUS KID STORIES */}
        {activeTab === 'stories' && (
          <div className="stories-view">
            <aside className="stories-sidebar">
              <span className="sidebar-label">{t('First-Principles Stories')}</span>
              {curiousKidStories.map(st => (
                <button
                  key={st.id}
                  type="button"
                  className={`story-nav-btn ${
                    st.id === selectedStoryId ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    playSound('click')
                    setSelectedStoryId(st.id)
                  }}
                >
                  <span className="story-nav-title">{st.title}</span>
                  <span className="story-nav-topic">{st.topic}</span>
                </button>
              ))}
            </aside>

            <main className="story-content">
              {activeStory && (
                <article className="story-card">
                  <div className="story-head">
                    <span className="story-tag">{activeStory.topic}</span>
                    <h2>{activeStory.title}</h2>
                  </div>

                  <div className="story-box">
                    <span className="box-label">🧸 {t('The Story')}</span>
                    <p className="story-narrative">{activeStory.story}</p>
                  </div>

                  <div className="story-mapping">
                    <span className="box-label">🌐 {t('In Real Life')}</span>
                    <ul className="mapping-list">
                      {activeStory.inRealLife.map(([analog, reality], idx) => (
                        <li key={idx}>
                          <span className="analog">{analog}</span>
                          <span className="arrow">➔</span>
                          <strong className="reality">{reality}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="story-caveat">
                    <strong>⚠️ {t('Where It’s Not Perfect:')}</strong>{' '}
                    {activeStory.whereNotPerfect}
                  </div>

                  <div className="story-truth">
                    <strong>✨ {t('The Simple Truth:')}</strong>{' '}
                    {activeStory.simpleTruth}
                  </div>

                  {activeStory.cliCommands && (
                    <div className="story-cli">
                      <span className="box-label">💻 {t('Cisco IOS Commands')}</span>
                      <pre>
                        <code>{activeStory.cliCommands.join('\n')}</code>
                      </pre>
                    </div>
                  )}
                </article>
              )}
            </main>
          </div>
        )}

        {/* 5. PAST EXAM PAPERS ARCHIVES */}
        {activeTab === 'papers' && (
          <div className="papers-view">
            <aside className="papers-sidebar">
              <span className="sidebar-label">{t('Past Exam Archives')}</span>
              {pastExamPapers.map(paper => (
                <button
                  key={paper.id}
                  type="button"
                  className={`paper-nav-btn ${
                    paper.id === selectedPaperId ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    playSound('click')
                    setSelectedPaperId(paper.id)
                  }}
                >
                  <span className="paper-nav-title">{paper.title}</span>
                  <span className="paper-nav-year">{paper.academicYear}</span>
                </button>
              ))}
            </aside>

            <main className="paper-content">
              {activePaper && (
                <article className="paper-card">
                  <header className="paper-card-header">
                    <div className="paper-details">
                      <span className="paper-code">{activePaper.courseCode}</span>
                      <h2>{activePaper.title}</h2>
                      <p className="paper-desc">{activePaper.description}</p>
                      <div className="paper-meta-row">
                        <span>
                          <strong>Instructor:</strong> {activePaper.instructor}
                        </span>
                        <span>
                          <strong>Time:</strong> {activePaper.timeLimit}
                        </span>
                        <span>
                          <strong>PKT Source:</strong> {activePaper.pktFile || 'PDF Scan'}
                        </span>
                      </div>
                    </div>

                    <div className="paper-action">
                      <button
                        type="button"
                        className="btn-launch-primary"
                        onClick={() => handleLaunchLab(activePaper.labKey)}
                      >
                        <AcademyIcon name="play" size={15} />
                        <span>{t('Launch Lab in Simulator')}</span>
                      </button>
                      <small>{t('Loads full Packet Tracer topology')}</small>
                    </div>
                  </header>

                  <section className="paper-tasks">
                    <h3>{t('Official Examination Practical Tasks')}</h3>
                    <div className="task-list">
                      {activePaper.practicalTasks.map((task, idx) => (
                        <div key={idx} className="task-item">
                          <h4>
                            Task {idx + 1}: {task.title}
                          </h4>
                          <p>{task.description}</p>
                          <div className="task-code-block">
                            <span className="code-label">{t('IOS Commands:')}</span>
                            <pre>
                              <code>{task.cliCommands}</code>
                            </pre>
                          </div>
                          <div className="task-verify">
                            <span>Verification Command:</span>{' '}
                            <code>{task.verification}</code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </article>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  )
}
