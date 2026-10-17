'use client'

import React, { useMemo } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useNetworkStore } from '@/store/networkStore'
import { Cisco3DIcon } from './Cisco3DIcons'
import { useI18n } from '@/i18n/useI18n'

export function ConnectionHoverCard() {
  const { t } = useI18n()
  const hovered = useWorkspaceStore((state) => state.hoveredConnection)
  const connectingSource = useNetworkStore((state) => state.connectingSource)
  const activeTool = useNetworkStore((state) => state.activeTool)
  const devices = useNetworkStore((state) => state.devices)
  const links = useNetworkStore((state) => state.links)

  const activeLinkTool = activeTool.startsWith('cable-') || Boolean(connectingSource)

  const data = useMemo(() => {
    if (!hovered || activeLinkTool) return null
    const dev = devices.find((d) => d.id === hovered.deviceId)
    if (!dev) return null

    const port = hovered.portId ? dev.ports.find((p) => p.id === hovered.portId) : undefined
    const peerDev = hovered.peerDeviceId ? devices.find((d) => d.id === hovered.peerDeviceId) : undefined
    const peerPort = peerDev && hovered.peerPortId ? peerDev.ports.find((p) => p.id === hovered.peerPortId) : undefined
    const link = hovered.linkId ? links.find((l) => l.id === hovered.linkId) : undefined

    return {
      dev,
      port,
      peerDev,
      peerPort,
      link,
      mode: hovered.mode,
      clientX: hovered.clientX,
      clientY: hovered.clientY,
      hoveredPortId: hovered.portId,
    }
  }, [hovered, activeLinkTool, devices, links])

  if (!data) return null

  const { dev, port, peerDev, peerPort, link, mode, clientX, clientY, hoveredPortId } = data

  // Screen clamping so the floating card stays inside the viewport
  const cardWidth = mode === 'device' ? 440 : 340
  const cardHeight = mode === 'device' ? 280 : 200

  const winW = typeof window !== 'undefined' ? window.innerWidth : 1200
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800

  let left = clientX + 16
  let top = clientY + 16

  if (left + cardWidth > winW - 20) {
    left = Math.max(16, clientX - cardWidth - 16)
  }
  if (top + cardHeight > winH - 20) {
    top = Math.max(16, clientY - cardHeight - 16)
  }

  return (
    <div
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-50 pointer-events-none select-none font-sans text-xs bg-[#ffffe6] dark:bg-[#0f172a] text-[#1a1a1a] dark:text-slate-100 border-2 border-[#7f9db9] dark:border-slate-600 rounded-md shadow-2xl p-2.5 max-w-[95vw] animate-in fade-in zoom-in-95 duration-100"
    >
      {mode === 'port' && port ? (
        /* Port / Cable Connection Dot Information */
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between pb-1.5 border-b border-[#cbd5e1] dark:border-slate-700">
            <div className="flex items-center gap-1.5 font-bold">
              <span className={`w-2.5 h-2.5 rounded-full ${port.status === 'up' ? 'bg-emerald-500 shadow-xs' : port.status === 'learning' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-sm text-slate-900 dark:text-white font-mono">{port.name}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">({port.shortName})</span>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide border ${
                port.status === 'up'
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                  : port.status === 'learning'
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                  : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
              }`}
            >
              Link: {port.status === 'learning' ? t('STP Learning') : port.status.toUpperCase()}
            </span>
          </div>

          {/* Device subtitle */}
          <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <span className="font-semibold text-sky-700 dark:text-sky-400">{t('Device:')}</span>
            <span className="font-bold text-slate-900 dark:text-white">{dev.config.hostname || dev.name}</span>
            <span className="text-slate-500">({dev.model})</span>
          </div>

          {/* Properties list */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] bg-white/70 dark:bg-slate-800/70 p-2 rounded border border-slate-200 dark:border-slate-700/60 font-mono">
            <div>
              <span className="font-sans text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">{t('IP address')}</span>
              <span className="text-slate-800 dark:text-slate-200">
                {port.ipAddress ? `${port.ipAddress} / ${port.subnetMask || '24'}` : t('unassigned')}
              </span>
            </div>
            <div>
              <span className="font-sans text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">{t('MAC address')}</span>
              <span className="text-slate-800 dark:text-slate-200">{port.macAddress}</span>
            </div>
            <div>
              <span className="font-sans text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">{t('VLAN')}</span>
              <span className="text-slate-800 dark:text-slate-200 font-sans">
                {port.portMode === 'trunk'
                  ? `802.1Q Trunk (Native: ${port.nativeVlan || 1})`
                  : `VLAN ${port.vlan || 1}${port.voiceVlan ? ` (Voice: ${port.voiceVlan})` : ''}`}
              </span>
            </div>
            <div>
              <span className="font-sans text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">{t('Link:')}</span>
              <span className="text-slate-800 dark:text-slate-200 font-sans font-semibold">
                {port.adminStatus === 'up' ? t('Enabled (no shut)') : t('Admin down')}
              </span>
            </div>
          </div>

          {/* Connection peer information */}
          <div className="text-[11px] bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 p-1.5 rounded flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sky-600 dark:text-sky-400 font-bold">{t('Connected To:')}</span>
              {peerDev ? (
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {peerDev.config.hostname || peerDev.name} <span className="font-mono text-slate-600 dark:text-slate-400">({peerPort?.name || 'Port'})</span>
                </span>
              ) : (
                <span className="text-slate-400 italic">{t('Not Connected')}</span>
              )}
            </div>
            {link && (
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                {link.type}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Device Summary Hover Table (Live Interface Status) */
        <div className="space-y-2">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-1.5 border-b border-[#cbd5e1] dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <Cisco3DIcon type={dev.type} model={dev.model} size={20} />
              </div>
              <div>
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {dev.config.hostname || dev.name}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1.5 font-semibold">
                  ({dev.model})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  dev.power !== false
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                    : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                }`}
              >
                Power: {dev.power !== false ? 'ON' : 'OFF'}
              </span>
              {dev.config.defaultGateway && (
                <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                  GW: {dev.config.defaultGateway}
                </span>
              )}
            </div>
          </div>

          {/* Port List Table */}
          <div className="max-h-[220px] overflow-y-auto overflow-x-hidden border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 shadow-xs">
            <table className="w-full text-left text-[11px] border-collapse font-sans">
              <thead className="sticky top-0 bg-[#e2e8f0] dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700 font-bold text-[10px] uppercase">
                <tr>
                  <th className="p-1.5">{t('Port')}</th>
                  <th className="p-1.5 text-center">{t('Link')}</th>
                  <th className="p-1.5">{t('IP Address')}</th>
                  <th className="p-1.5">{t('MAC Address')}</th>
                  <th className="p-1.5">{t('VLAN')}</th>
                  <th className="p-1.5">{t('Connected Peer')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {dev.ports.map((p) => {
                  const connLink = links.find((l) => l.id === p.connectedLinkId)
                  const peerId = connLink ? (connLink.fromDeviceId === dev.id ? connLink.toDeviceId : connLink.fromDeviceId) : null
                  const peerPId = connLink ? (connLink.fromDeviceId === dev.id ? connLink.toPortId : connLink.fromPortId) : null
                  const peerD = peerId ? devices.find((d) => d.id === peerId) : null
                  const peerP = peerD && peerPId ? peerD.ports.find((portItem) => portItem.id === peerPId) : null

                  const isTargetHovered = hoveredPortId === p.id

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isTargetHovered
                          ? 'bg-amber-100 dark:bg-amber-950 font-semibold'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <td className="p-1.5 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {p.shortName || p.name}
                      </td>
                      <td className="p-1.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            p.status === 'up'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : p.status === 'learning'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {p.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-1.5 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {p.ipAddress || <span className="text-slate-400 italic font-sans text-[10px]">{t('unassigned')}</span>}
                      </td>
                      <td className="p-1.5 font-mono text-slate-600 dark:text-slate-400 text-[10px] whitespace-nowrap">
                        {p.macAddress}
                      </td>
                      <td className="p-1.5 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {p.portMode === 'trunk' ? (
                          <span className="font-bold text-sky-700 dark:text-sky-400">Trunk</span>
                        ) : (
                          <span>{p.vlan || 1}{p.voiceVlan ? ` (V:${p.voiceVlan})` : ''}</span>
                        )}
                      </td>
                      <td className="p-1.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {peerD ? (
                          <span>
                            {peerD.config.hostname || peerD.name} <span className="font-mono text-[10px] text-slate-500">({peerP?.shortName || peerP?.name})</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">--</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer quick help */}
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
            <span>{t('Hover on link dot for port details')}</span>
            <span>{t('Double-click to open device')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
