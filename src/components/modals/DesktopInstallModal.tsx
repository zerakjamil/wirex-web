'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useI18n } from '@/i18n/useI18n'

interface DesktopInstallModalProps {
  isOpen: boolean
  onClose: () => void
}

interface BuildState {
  isBuilding: boolean
  progress: string
  logs: string[]
  error: string | null
  completedAt: number | null
  outputPath: string | null
  installedPath?: string | null
}
interface InstallPrompt extends Event {
  prompt:()=>Promise<void>
  userChoice:Promise<{outcome:'accepted'|'dismissed'}>
}

export function DesktopInstallModal({ isOpen, onClose }: DesktopInstallModalProps) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [detectedOs, setDetectedOs] = useState<{
    name: string
    arch: string
    platform: string
  }>({
    name: 'Auto-detecting OS...',
    arch: 'x64',
    platform: 'unknown',
  })

  const [buildState, setBuildState] = useState<BuildState>({
    isBuilding: false,
    progress: 'idle',
    logs: [],
    error: null,
    completedAt: null,
    outputPath: null,
  })

  const [existingBuild, setExistingBuild] = useState<string[] | null>(null)
  const [isInstalled, setIsInstalled] = useState<boolean>(false)
  const [installedPath, setInstalledPath] = useState<string | null>(null)
  const [installedAt, setInstalledAt] = useState<number | null>(null)
  const [targetPath, setTargetPath] = useState<string>('/Applications/wireX Network Simulator.app')
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPrompt|null>(null)
  const [localAvailable,setLocalAvailable]=useState(false)

  // Listen for PWA install prompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as InstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  // Detect Client OS
  useEffect(() => {
    const ua = navigator.userAgent
    let name = 'Linux'
    let platform = 'linux'

    if (ua.includes('Macintosh') || ua.includes('Mac OS X')) {
      name = 'macOS'
      platform = 'darwin'
    } else if (ua.includes('Windows')) {
      name = 'Windows'
      platform = 'win32'
    }

    const isArm = ua.includes('ARM') || (platform === 'darwin' && navigator.maxTouchPoints > 0)
    const arch = isArm ? 'arm64' : 'x64'

    const timer=window.setTimeout(()=>setDetectedOs({
      name: `${name} (${arch === 'arm64' ? 'Apple Silicon / ARM64' : 'x86_64'})`,
      arch,
      platform,
    }),0)
    return ()=>window.clearTimeout(timer)
  }, [])

  // Poll Build Status & Installation status
  const checkStatus = async () => {
    try {
      const res = await fetch('/api/electron-build')
      const data = await res.json()
      if(!res.ok){setLocalAvailable(false);return}
      if (data.ok) {
        setLocalAvailable(true)
        if (data.existingBuild && data.existingBuild.length > 0) {
          setExistingBuild(data.existingBuild)
        }
        if (data.buildState) {
          setBuildState(data.buildState)
        }
        setIsInstalled(Boolean(data.isInstalled))
        setInstalledPath(data.installedPath || null)
        setInstalledAt(data.installedAt || null)
        if (data.targetPath) {
          setTargetPath(data.targetPath)
        }
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (isOpen) {
      if (!dialogRef.current?.open) {
        dialogRef.current?.showModal()
      }
      const initial=window.setTimeout(checkStatus,0)
      const interval = buildState.isBuilding ? setInterval(checkStatus, 2500) : undefined
      return () => {clearTimeout(initial);clearInterval(interval)}
    } else {
      if (dialogRef.current?.open) {
        dialogRef.current?.close()
      }
    }
  }, [isOpen, buildState.isBuilding])

  if (!isOpen) return null

  const handleInstallPermanent = async () => {
    try {
      setIsProcessing(true)
      setFeedback('Installing wireX permanently to your hardware...')
      const res = await fetch('/api/electron-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install' }),
      })
      const data = await res.json()
      if (data.ok) {
        setFeedback(data.message || 'Successfully installed to hardware!')
        checkStatus()
      } else {
        setFeedback(data.error || 'Failed to install to hardware.')
      }
    } catch {
      setFeedback('Error communicating with installer service.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleLaunchApp = async () => {
    try {
      setIsProcessing(true)
      setFeedback('Launching wireX desktop app...')
      const res = await fetch('/api/electron-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'launch' }),
      })
      const data = await res.json()
      if (data.ok) {
        setFeedback(data.message || 'Desktop application launched!')
      } else {
        setFeedback(data.error || 'Failed to launch desktop app.')
      }
    } catch {
      setFeedback('Failed to trigger desktop launch.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRevealInFinder = async () => {
    try {
      setFeedback('Opening application location in Finder...')
      const res = await fetch('/api/electron-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'show-in-folder' }),
      })
      const data = await res.json()
      if (data.ok) {
        setFeedback(data.message || 'Location revealed in Finder.')
      }
    } catch {
      setFeedback('Could not reveal location in Finder.')
    }
  }

  const handleUninstall = async () => {
    if (!confirm('Are you sure you want to remove the permanently installed application from your hardware?')) {
      return
    }
    try {
      setIsProcessing(true)
      setFeedback('Removing application from hardware...')
      const res = await fetch('/api/electron-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'uninstall' }),
      })
      const data = await res.json()
      if (data.ok) {
        setFeedback(data.message || 'App removed from hardware.')
        checkStatus()
      } else {
        setFeedback(data.error || 'Failed to uninstall.')
      }
    } catch {
      setFeedback('Error attempting to uninstall.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setFeedback('Installed as offline PWA application!')
      }
      setDeferredPrompt(null)
    } else {
      setFeedback('PWA already installed or managed by your browser.')
    }
  }

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
        <h2>{t('Permanent Desktop Installation')}</h2>
        <button aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>

      <p>
        {t('Browser labs and JSON backups work offline after the application finishes downloading. Browser PKT conversion requires a connection. Native installation is available in the local desktop edition.')}
      </p>

      {feedback && (
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
          {feedback}
        </p>
      )}

      <ol>
        {localAvailable && <li>
          <h3>
            {t('Hardware Installation Status')} {isInstalled ? '✓' : ''}
          </h3>
          <p>
            {isInstalled
              ? t('wireX is permanently installed on your system. You can launch it directly without keeping terminal open or needing internet access.')
              : t('Not yet installed to hardware. Click below to install permanently to /Applications.')}
          </p>
          <small dir="ltr">
            Destination: {installedPath || targetPath} · Target Architecture: {detectedOs.name}
            {installedAt ? ` · Installed: ${new Date(installedAt).toLocaleDateString()}` : ''}
          </small>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {isInstalled ? (
              <>
                <button
                  type="button"
                  onClick={handleLaunchApp}
                  disabled={isProcessing}
                  style={{ fontWeight: 'bold' }}
                >
                  {t('Launch from Applications')}
                </button>
                <button
                  type="button"
                  onClick={handleRevealInFinder}
                  disabled={isProcessing}
                >
                  {t('Show in Finder')}
                </button>
                <button
                  type="button"
                  onClick={handleInstallPermanent}
                  disabled={!localAvailable || isProcessing || buildState.isBuilding}
                >
                  {t('Reinstall / Update')}
                </button>
                <button
                  type="button"
                  onClick={handleUninstall}
                  disabled={isProcessing}
                >
                  {t('Uninstall')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleInstallPermanent}
                  disabled={!localAvailable || isProcessing || buildState.isBuilding}
                  style={{ fontWeight: 'bold' }}
                >
                  {buildState.isBuilding ? t('Saving...') : t('Install Permanently to Hardware (/Applications)')}
                </button>
                {existingBuild && (
                  <button
                    type="button"
                    onClick={handleLaunchApp}
                    disabled={isProcessing}
                  >
                    {t('Test Run App')}
                  </button>
                )}
              </>
            )}
          </div>
        </li>}

        <li>
          <h3>{t('Offline study')}</h3>
          <p>
            {t('Checkpoints are saved in this browser. Export a file backup before clearing browser data or changing computers.')}
          </p>
          <small dir="ltr">{t('Zero external network dependency')}</small>
        </li>

        <li>
          <h3>{t('Binary PKT Compatibility')}</h3>
          <p>
            {t('Import supported PKT topologies. Export compatibility with other simulator versions needs verification before classroom use.')}
          </p>
          <small dir="ltr">{t('Use JSON backups to preserve this app workspace.')}</small>
        </li>

        {deferredPrompt && (
          <li>
            <h3>{t('Browser PWA Shortcut')}</h3>
            <p>{t('Also available as browser-managed progressive web app without native compilation.')}</p>
            <button type="button" onClick={handlePwaInstall}>
              {t('Install PWA')}
            </button>
          </li>
        )}
      </ol>

      {(buildState.isBuilding || buildState.logs.length > 0) && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: 13, margin: '0 0 4px 0' }}>{t('Installation Process Logs')}</h3>
          <pre
            dir="ltr"
            style={{
              maxHeight: 120,
              overflow: 'auto',
              background: 'var(--cisco-canvas-bg, #1e293b)',
              color: '#8fe0b5',
              padding: 8,
              fontSize: 11,
              border: '1px solid #667d8a',
            }}
          >
            {buildState.logs.slice(-6).join('\n')}
          </pre>
        </div>
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
        <small>{localAvailable ? `Target: ${targetPath}` : t('Browser study vault')}</small>
        <button type="button" onClick={onClose}>
          {t('Close')}
        </button>
      </div>
    </dialog>
  )
}
