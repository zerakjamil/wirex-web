'use client'

import React from 'react'
import { useMidtermQuestStore } from '@/store/midtermQuestStore'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useI18n } from '@/i18n/useI18n'
import { CliTab } from '@/components/modals/DeviceModal'
import './midtermMentor.css'

export function MidtermCliDock() {
  const { dir } = useI18n()
  const activeDeviceId = useMidtermQuestStore((s) => s.activeDeviceId)
  const setActiveDeviceId = useMidtermQuestStore((s) => s.setActiveDeviceId)
  const devices = useNetworkStore((s) => s.devices)
  const events = useNetworkStore((s) => s.commandEvents)

  const activeDevice =
    devices.find((d) => d.id === activeDeviceId) ||
    devices.find((d) => d.name.toLowerCase().includes(activeDeviceId.toLowerCase())) ||
    devices[0]

  const lastEvent = events.filter((e) => e.deviceId === activeDevice?.id).at(-1)

  const terminalDevices = devices.filter((d) =>
    ['switch', 'router', 'pc', 'laptop', 'server'].includes(d.type)
  )

  return (
    <aside className="midterm-cli-dock" dir={dir} aria-label="Cisco Terminal">
      {/* 1. Device Tab Row */}
      <div className="midterm-dock-header">
        <div className="midterm-quick-pills">
          {terminalDevices.slice(0, 7).map((d) => (
            <button
              key={d.id}
              className={`midterm-pill-btn ${activeDevice?.id === d.id ? 'is-active' : ''}`}
              onClick={() => setActiveDeviceId(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
        {activeDevice && (
          <button
            className="midterm-inspect-btn"
            onClick={() => useWorkspaceStore.setState({ inspectedDeviceId: activeDevice.id })}
            title="Inspect MAC, ARP, and routing tables"
          >
            Tables
          </button>
        )}
      </div>

      {/* 2. Live Cisco Terminal */}
      <div className="midterm-terminal-container">
        {activeDevice ? (
          <CliTab deviceId={activeDevice.id} />
        ) : (
          <div className="midterm-terminal-empty">No device selected</div>
        )}
      </div>

      {/* 3. Live State Diff (Only displayed when there are real changes) */}
      {lastEvent && lastEvent.changes && lastEvent.changes.length > 0 && (
        <div className="midterm-feedback-card" aria-live="polite">
          <code className="midterm-event-cmd">{lastEvent.command}</code>
          <div className="midterm-changes-grid">
            {lastEvent.changes.map((c) => (
              <div key={c.field} className="midterm-change-row">
                <span className="midterm-change-field">{c.field}</span>
                <span className="midterm-change-diff">
                  <span className="midterm-diff-before">{c.before || 'none'}</span>
                  <span className="midterm-diff-arrow">→</span>
                  <span className="midterm-diff-after">{c.after}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
