'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { LabCheckpoint, CramCard } from '@/simulator/sqliteStore'
import { exportLabToPktFile } from '@/store/workspacePersistence'
import { useI18n } from '@/i18n/useI18n'
import { studyVaultRequest } from '@/store/browserStudyVault'
import { parseWorkspace } from '@/simulator/workspaceSchema'
import { stripRoutingRuntime } from '@/simulator/routingRuntime'

interface ExamRevisionModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ExamRevisionModal({ isOpen, onClose }: ExamRevisionModalProps) {
  const { t, locale } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activeTab, setActiveTab] = useState<'checkpoints' | 'cram'>('checkpoints')
  const [checkpoints, setCheckpoints] = useState<LabCheckpoint[]>([])
  const [cramCards, setCramCards] = useState<CramCard[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LabCheckpoint | null>(null)

  // New Checkpoint Form State
  const [isCreating, setIsCreating] = useState(false)
  const [checkpointTitle, setCheckpointTitle] = useState('')
  const [checkpointDesc, setCheckpointDesc] = useState('')
  const [checkpointTags, setCheckpointTags] = useState('')

  const fileName = useWorkspaceStore(s => s.fileName) || 'My Network Lab'
  const setStatus = useWorkspaceStore(s => s.setStatus)

  const showFeedback = (msg: string) => {
    setNotification(msg)
  }

  const fetchCheckpoints = useCallback(async () => {
    try {
      const res = await studyVaultRequest('list-checkpoints')
      const data = await res.json()
      if(!res.ok){setNotification(data.error || 'Study vault unavailable. Use File > Save for a browser backup.');return}
      if (data.ok && Array.isArray(data.checkpoints)) {
        setCheckpoints(data.checkpoints)
      }
    } catch {
      showFeedback('Could not read browser study storage.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCramCards = useCallback(async () => {
    try {
      const res = await studyVaultRequest('list-cram-cards')
      const data = await res.json()
      if (data.ok && Array.isArray(data.cards)) {
        setCramCards(data.cards)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      if (!dialogRef.current?.open) {
        dialogRef.current?.showModal()
      }
      const initial=window.setTimeout(()=>{fetchCheckpoints();fetchCramCards()},0)
      return ()=>window.clearTimeout(initial)
    } else {
      if (dialogRef.current?.open) {
        dialogRef.current?.close()
      }
    }
  }, [isOpen, fetchCheckpoints, fetchCramCards])

  if (!isOpen) return null

  const handleSaveCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkpointTitle.trim()) return

    const netState = useNetworkStore.getState()
    const snapshot = {
      devices: stripRoutingRuntime(netState.devices),
      links: netState.links,
      annotations: netState.annotations,
      deviceWindows: netState.deviceWindows,
      fileName,
    }

    const tags = checkpointTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    try {
      setLoading(true)
      const res = await studyVaultRequest('create-checkpoint', {
          labId: fileName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default_lab',
          labName: fileName,
          title: checkpointTitle.trim(),
          description: checkpointDesc.trim(),
          snapshot,
          tags,
      })

      const data = await res.json()
      if (data.ok) {
        showFeedback(`Created checkpoint: "${checkpointTitle}"`)
        setCheckpointTitle('')
        setCheckpointDesc('')
        setCheckpointTags('')
        setIsCreating(false)
        fetchCheckpoints()
      } else {
        showFeedback(data.error || 'Failed to save checkpoint.')
      }
    } catch {
      showFeedback('Could not save checkpoint in this browser. Use File > Save for a backup.')
    } finally {
      setLoading(false)
    }
  }

  const handleRollback = (chk: LabCheckpoint) => {
    try {
      const snapshot = parseWorkspace(JSON.parse(chk.snapshotJson))

      useNetworkStore.getState().loadLab(
        snapshot.devices,
        snapshot.links,
        snapshot.annotations || []
      )

      if (Array.isArray(snapshot.deviceWindows)) {
        useNetworkStore.setState({ deviceWindows: snapshot.deviceWindows })
      }

      if (snapshot.fileName) {
        useWorkspaceStore.setState({ fileName: snapshot.fileName })
      }

      const msg = `Rolled back to checkpoint: "${chk.title}" (${snapshot.devices.length} devices, ${snapshot.links.length} cables).`
      setStatus(msg)
      showFeedback(msg)
    } catch {
      showFeedback('Failed to rollback. Checkpoint data corrupted.')
    }
  }

  const handleDeleteCheckpoint = async (id: string) => {
    try {
      const res = await studyVaultRequest('delete-checkpoint', { id })
      const data = await res.json()
      if (data.ok) {
        showFeedback('Checkpoint removed.')
        setCheckpoints(prev => prev.filter(c => c.id !== id))
        setPendingDelete(null)
      } else {
        showFeedback(data.error || 'Could not delete checkpoint.')
      }
    } catch {
      showFeedback('Could not delete checkpoint.')
    }
  }

  const handleToggleStar = async (id: string) => {
    try {
      const res = await studyVaultRequest('toggle-star', { id })
      const data = await res.json()
      if (data.ok) {
        setCheckpoints(prev =>
          prev.map(c => (c.id === id ? { ...c, isStarred: data.isStarred } : c))
        )
      } else {
        showFeedback(data.error || 'Could not update checkpoint.')
      }
    } catch {
      // ignore
    }
  }

  const categories = ['All', ...Array.from(new Set(cramCards.map(c => c.category)))]

  const filteredCramCards = cramCards.filter(c => {
    const matchesCat = selectedCategory === 'All' || c.category === selectedCategory
    const matchesSearch =
      !searchQuery ||
      [c.title, c.keyPoint, c.mnemonic || '', t(c.title), t(c.keyPoint), t(c.mnemonic || '')].some(text => text.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesCat && matchesSearch
  })

  return (
    <dialog
      ref={dialogRef}
      className="pt-training-catalog"
      onCancel={onClose}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <header>
        <h2>{t('Exam Revision & Rollback Vault')}</h2>
        <button aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>

      <p>
        {t('Checkpoints are saved in this browser. Export a file backup before clearing browser data or changing computers.')}
      </p>
      {pendingDelete && <section role="alertdialog" aria-label={t('Delete checkpoint')}>
        <p>{t('Delete checkpoint')}: {pendingDelete.title}?</p>
        <button autoFocus onClick={() => setPendingDelete(null)}>{t('Cancel')}</button>
        <button onClick={() => handleDeleteCheckpoint(pendingDelete.id)}>{t('Delete')}</button>
      </section>}

      {notification && (
        <p
          role="status"
          style={{
            background: '#e0f2fe',
            color: '#0369a1',
            padding: '6px 10px',
            borderRadius: 4,
            margin: '8px 0',
            fontSize: 13,
            border: '1px solid #bae6fd',
          }}
        >
          {notification}
          <button aria-label={t('Close')} onClick={() => setNotification(null)}>×</button>
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 8px 0', flexWrap: 'wrap' }}>
        <label style={{ margin: 0, flex: 1, minWidth: 200 }}>
          {t('Study view')}
          <select
            value={activeTab}
            onChange={e => setActiveTab(e.target.value as 'checkpoints' | 'cram')}
            style={{ marginTop: 4 }}
          >
            <option value="checkpoints">{t('Checkpoints & Rollbacks')} ({checkpoints.length})</option>
            <option value="cram">{t('Quick Cram Cards')} ({cramCards.length})</option>
          </select>
        </label>

        {activeTab === 'checkpoints' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 18 }}>
            <button
              type="button"
              onClick={() => setIsCreating(!isCreating)}
              style={{ fontWeight: 'bold' }}
            >
              {isCreating ? t('Cancel') : t('+ Save Checkpoint')}
            </button>
            <button
              type="button"
              onClick={() => exportLabToPktFile()}
            >
              {t('Export as .pkt')}
            </button>
            <button
              type="button"
              onClick={fetchCheckpoints}
            >
              {t('Refresh')}
            </button>
          </div>
        )}
      </div>

      {activeTab === 'checkpoints' && isCreating && (
        <form
          onSubmit={handleSaveCheckpoint}
          style={{
            padding: 12,
            background: 'var(--pt-control, #fff)',
            border: '1px solid #c0cacf',
            margin: '8px 0 12px 0',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', fontSize: 13 }}>
            {t('Create New Checkpoint')} &quot;{fileName}&quot;
          </h3>
          <label>
            {t('Checkpoint Title *')}
            <input
              type="text"
              required
              placeholder="e.g. Before OSPF configuration, VLANs working, Post-DHCP"
              value={checkpointTitle}
              onChange={e => setCheckpointTitle(e.target.value)}
              style={{ width: '100%', padding: 5, border: '1px solid #a4aeb4', marginTop: 3, display: 'block' }}
            />
          </label>
          <label style={{ marginTop: 8 }}>
            {t('Optional Notes / Verification')}
            <input
              type="text"
              placeholder="e.g. Switches SW1-SW3 ping each other on VLAN 10"
              value={checkpointDesc}
              onChange={e => setCheckpointDesc(e.target.value)}
              style={{ width: '100%', padding: 5, border: '1px solid #a4aeb4', marginTop: 3, display: 'block' }}
            />
          </label>
          <label style={{ marginTop: 8 }}>
            {t('Tags (comma separated)')}
            <input
              type="text"
              placeholder="e.g. OSPF, VLAN, CCNA"
              value={checkpointTags}
              onChange={e => setCheckpointTags(e.target.value)}
              style={{ width: '100%', padding: 5, border: '1px solid #a4aeb4', marginTop: 3, display: 'block' }}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => setIsCreating(false)}>
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !checkpointTitle.trim()}
              style={{ fontWeight: 'bold' }}
            >
              {loading ? t('Saving...') : t('Save Checkpoint')}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'checkpoints' && (
        <>
          {checkpoints.length === 0 ? (
            <p style={{ padding: '24px 0', textAlign: 'center', color: '#64748b' }}>
              {t('No checkpoints recorded yet. Save checkpoints as you progress through labs to rollback instantly if a configuration breaks.')}
            </p>
          ) : (
            <ol>
              {checkpoints.map(chk => {
                let devCount = 0
                let linkCount = 0
                try {
                  const data = JSON.parse(chk.snapshotJson)
                  devCount = data.devices?.length || 0
                  linkCount = data.links?.length || 0
                } catch {
                  // ignore
                }
                return (
                  <li key={chk.id}>
                    <h3>
                      {chk.title} {chk.isStarred ? '⭐' : ''}
                    </h3>
                    <p>{chk.description || 'Saved topology snapshot.'}</p>
                    <small dir="ltr">
                      {devCount} {t('devices,')} · {linkCount} {t('cables')} · {new Date(chk.createdAt).toLocaleString(locale)}
                    </small>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleRollback(chk)}
                        style={{ fontWeight: 'bold' }}
                      >
                        {t('Restore')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStar(chk.id)}
                      >
                        {t(chk.isStarred ? 'Unstar' : 'Star')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(chk)}
                      >
                        {t('Delete')}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </>
      )}

      {activeTab === 'cram' && (
        <>
          <div style={{ display: 'flex', gap: 8, margin: '8px 0', alignItems: 'center' }}>
            <label style={{ margin: 0, flex: 1 }}>
              {t('Category')}
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                style={{ marginTop: 3 }}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? t('All Categories') : t(cat)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ margin: 0, flex: 1 }}>
              {t('Search')}
              <input
                type="text"
                placeholder={t('Search flashcards, topics, commands...')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: 5, border: '1px solid #a4aeb4', marginTop: 3, display: 'block' }}
              />
            </label>
          </div>
          <ol>
            {filteredCramCards.map(card => (
              <li key={card.id}>
                <h3>
                  {t(card.title)} · <small style={{ fontWeight: 'normal' }}>{t(card.category)}</small>
                </h3>
                <p style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                  {t(card.keyPoint)}
                </p>
                {card.mnemonic && (
                  <p>
                    <small>{t('Memory hook')}: {t(card.mnemonic)}</small>
                  </p>
                )}
                {card.commandSnippet && (
                  <div style={{ marginTop: 6 }}>
                    <pre
                      dir="ltr"
                      style={{
                        margin: '4px 0',
                        padding: 6,
                        background: 'var(--cisco-canvas-bg, #1e293b)',
                        color: '#8fe0b5',
                        fontSize: 11,
                        overflow: 'auto',
                      }}
                    >
                      {card.commandSnippet}
                    </pre>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(card.commandSnippet || '').then(() => showFeedback('Copied command to clipboard')).catch(() => showFeedback('Clipboard is unavailable. Select and copy the command above.'))
                      }}
                    >
                      {t('Copy command')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid #c0cacf',
        }}
      >
        <small>{t('Browser study vault')} · {t('Offline study storage')}</small>
        <button type="button" onClick={onClose}>
          {t('Close')}
        </button>
      </div>
    </dialog>
  )
}
