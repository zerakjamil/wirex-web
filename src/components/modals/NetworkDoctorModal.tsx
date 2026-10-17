'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { auditWholeNetwork, NetworkAuditIssue } from '@/simulator/diagnostics'
import { useI18n } from '@/i18n/useI18n'

export function NetworkDoctorModal() {
  const { t } = useI18n()
  const ws = useWorkspaceStore()
  const devices = useNetworkStore((state) => state.devices)
  const links = useNetworkStore((state) => state.links)
  const setActiveModal = useNetworkStore((state) => state.setActiveModal)

  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activeCategory, setActiveCategory] = useState<'all' | 'ip' | 'vlan' | 'routing' | 'dhcp' | 'physical'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const audit = useMemo(() => {
    return auditWholeNetwork(devices, links)
  }, [devices, links])

  useEffect(() => {
    if (ws.dialog === 'doctor') {
      if (!dialogRef.current?.open) dialogRef.current?.showModal()
    } else {
      if (dialogRef.current?.open) dialogRef.current?.close()
    }
  }, [ws.dialog])

  if (ws.dialog !== 'doctor') return null

  const filteredIssues = activeCategory === 'all'
    ? audit.issues
    : audit.issues.filter((i) => i.category === activeCategory)

  const copyCommands = (issue: NetworkAuditIssue) => {
    const text = issue.commands.join('\n')
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
      setCopiedId(issue.code + issue.deviceId + (issue.portId || ''))
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const handleOpenDevice = (deviceId: string) => {
    ws.setDialog(null)
    setActiveModal({ type: 'device', deviceId })
  }

  const categories: { key: 'all' | 'ip' | 'vlan' | 'routing' | 'dhcp' | 'physical'; label: string }[] = [
    { key: 'all', label: `${t('All Issues')} (${audit.issues.length})` },
    { key: 'ip', label: `${t('IP & Gateways')} (${audit.issues.filter(i => i.category === 'ip').length})` },
    { key: 'vlan', label: `${t('VLANs & Trunks')} (${audit.issues.filter(i => i.category === 'vlan').length})` },
    { key: 'physical', label: `${t('Physical & Power')} (${audit.issues.filter(i => i.category === 'physical').length})` },
    { key: 'dhcp', label: `${t('DHCP')} (${audit.issues.filter(i => i.category === 'dhcp').length})` },
  ]

  return (
    <dialog
      ref={dialogRef}
      className="pt-training-catalog"
      onCancel={() => ws.setDialog(null)}
      onClick={e => {
        if (e.target === e.currentTarget) ws.setDialog(null)
      }}
    >
      <header>
        <h2>{t('Network Diagnostics & Configuration Audit')}</h2>
        <button aria-label="Close" onClick={() => ws.setDialog(null)}>
          ×
        </button>
      </header>

      <p>
        Health Score: {audit.score}% · {audit.summary} ({audit.totalDevices} devices, {audit.totalLinks} links, {audit.healthyDevices} healthy).
      </p>

      <label>
        {t('Filter category')}
        <select
          value={activeCategory}
          onChange={e => setActiveCategory(e.target.value as typeof activeCategory)}
          style={{ marginTop: 3 }}
        >
          {categories.map(c => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {filteredIssues.length === 0 ? (
        <p style={{ padding: '24px 0', textAlign: 'center', color: '#10b981' }}>
          {t('✓ Clean topology audit. No configuration faults detected in this category.')}
        </p>
      ) : (
        <ol>
          {filteredIssues.map(issue => {
            const dev = devices.find(d => d.id === issue.deviceId)
            const port = dev?.ports.find(p => p.id === issue.portId)
            const issueKey = issue.code + issue.deviceId + (issue.portId || '')
            const isCopied = copiedId === issueKey

            return (
              <li key={issueKey}>
                <h3>
                  {dev?.config.hostname || dev?.name || 'Device'}
                  {port ? ` · ${port.shortName || port.name}` : ''}
                </h3>
                <p>{issue.description}</p>
                <small dir="ltr">
                  Actual: {issue.actual}
                  {issue.expected ? ` · Expected: ${issue.expected}` : ''}
                </small>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {dev && (
                    <button
                      type="button"
                      onClick={() => handleOpenDevice(dev.id)}
                      style={{ fontWeight: 'bold' }}
                    >
                      {t('Open Device')}
                    </button>
                  )}
                  {issue.commands.length > 0 && (
                    <button
                      type="button"
                      onClick={() => copyCommands(issue)}
                    >
                      {isCopied ? '✓ Copied Fix!' : t('Copy Fix Commands')}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
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
        <small>{t('Real-time topology diagnostics')}</small>
        <button type="button" onClick={() => ws.setDialog(null)}>
          {t('Close')}
        </button>
      </div>
    </dialog>
  )
}
