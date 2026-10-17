'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useNetworkStore } from '@/store/networkStore'
import { generateShareableUrl, exportLabToPktFile } from '@/store/workspacePersistence'
import { useI18n } from '@/i18n/useI18n'
import QRCode from 'qrcode'

export function ShareLabModal() {
  const { t } = useI18n()
  const ws = useWorkspaceStore()
  const devices = useNetworkStore((state) => state.devices)
  const links = useNetworkStore((state) => state.links)
  const annotations = useNetworkStore((state) => state.annotations)

  const dialogRef = useRef<HTMLDialogElement>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [qrSvg, setQrSvg] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (ws.dialog === 'share') {
      if (!dialogRef.current?.open) dialogRef.current?.showModal()
      const url = generateShareableUrl() || window.location.href
      let cancelled=false
      QRCode.toString(url, { type: 'svg', margin: 1 })
        .then((svg) => {if(!cancelled){setShareUrl(url);setQrSvg(svg)}})
        .catch(() => {if(!cancelled){setShareUrl(url);setQrSvg('')}})
      return ()=>{cancelled=true}
    } else {
      if (dialogRef.current?.open) dialogRef.current?.close()
    }
  }, [ws.dialog])

  if (ws.dialog !== 'share') return null

  const handleCopyUrl = () => {
    if (shareUrl && navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handleDownloadJson = () => {
    const data = JSON.stringify({ devices, links, annotations }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ws.fileName || 'wirex-lab'}.wf.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportStandaloneHtml = () => {
    const labJson = JSON.stringify({ devices, links, annotations })
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>wireX Portable Lab - ${devices.length} Devices</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .card { max-width: 800px; margin: 40px auto; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 28px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; color: #38bdf8; }
    pre { background: #0f172a; border: 1px solid #334155; padding: 16px; border-radius: 8px; overflow-x: auto; color: #a5f3fc; font-size: 12px; }
    .btn { background: #0284c7; color: white; padding: 10px 20px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
    .btn:hover { background: #0369a1; }
  </style>
</head>
<body>
  <div class="card">
    <h1>wireX Portable Lab State</h1>
    <p>This is a standalone backup snapshot containing <strong>${devices.length} devices</strong> and <strong>${links.length} links</strong>.</p>
    <div style="margin: 20px 0;">
      <a class="btn" href="${generateShareableUrl()?.replace(/&/g,'&amp;').replace(/"/g,'&quot;') || '#'}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">Open Lab in wireX Web</a>
    </div>
    <h3>Embedded Lab JSON Payload:</h3>
    <pre id="payload">${labJson.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    <div style="margin-top: 20px;">
      <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('payload').textContent);alert('Lab JSON copied to clipboard!');">Copy Topology JSON</button>
    </div>
  </div>
</body>
</html>`
    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ws.fileName || 'wirex-lab'}-portable.html`
    a.click()
    URL.revokeObjectURL(url)
  }

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
        <h2>{t('Share Lab & Portability')}</h2>
        <button aria-label={t('Close')} onClick={() => ws.setDialog(null)}>
          ×
        </button>
      </header>

      <p>
        {t('Share an encoded lab link, QR code, or downloaded file. The recipient needs access to this app address.')}
      </p>

      <ol>
        <li>
          <h3>{t('Shareable Link')}</h3>
          <p>
            {t('Direct URL with encoded lab topology state. Anyone opening this link loads the lab immediately in their browser.')}
          </p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              type="text"
              readOnly
              value={shareUrl}
              style={{
                flex: 1,
                padding: 5,
                border: '1px solid #a4aeb4',
                background: 'var(--cisco-canvas-bg, #fff)',
                color: 'var(--cisco-text-main, #202b31)',
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}
            >
              {copied ? t('✓ Copied!') : t('Copy Link')}
            </button>
          </div>
        </li>

        <li>
          <h3>{t('Mobile & Tablet QR Code')}</h3>
          <p>
            {t('Scan with any smartphone or iPad camera. The entire lab topology will immediately open in the mobile browser with zero installation or login required.')}
          </p>
          {qrSvg ? (
            <div
              style={{
                width: 120,
                height: 120,
                background: '#fff',
                padding: 6,
                border: '1px solid #c0cacf',
                margin: '8px 0',
              }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <small>{t('Generating QR code...')}</small>
          )}
        </li>

        <li>
          <h3>{t('Offline File Downloads')}</h3>
          <p>
            {t('Download JSON or an HTML snapshot. PKT export covers supported devices and settings.')}
          </p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => exportLabToPktFile()}
              style={{ fontWeight: 'bold' }}
            >
              {t('Export .pkt')}
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
            >
              {t('Download .wf.json')}
            </button>
            <button
              type="button"
              onClick={handleExportStandaloneHtml}
            >
              {t('Standalone HTML')}
            </button>
          </div>
        </li>
      </ol>

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
        <small>{t('Lab links contain encoded topology data; they are not compressed.')}</small>
        <button type="button" onClick={() => ws.setDialog(null)}>
          {t('Close')}
        </button>
      </div>
    </dialog>
  )
}
