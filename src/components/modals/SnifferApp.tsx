'use client'

import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useI18n } from '@/i18n/useI18n'
import type { PacketProtocol } from '@/types/network'
import { SIMULATION_TICK_MS } from '@/simulator/ospf'
import {
  SNIFFER_MAX_BUFFER_SIZE,
  snifferBufferLimit,
  snifferModulePorts,
  snifferPortEnabled,
  snifferServiceEnabled,
} from '@/simulator/sniffer'

const bufferOptions = Array.from(new Set([25, 50, 100, 250, SNIFFER_MAX_BUFFER_SIZE]))
const bufferChoices = (current: number) => Array.from(new Set([...bufferOptions, current])).sort((left, right) => left - right)
const captureSeconds = (tick: number) => (tick * SIMULATION_TICK_MS / 1000).toFixed(3)

export function SnifferApp({ deviceId }: { deviceId: string }) {
  const { t } = useI18n()
  const device = useNetworkStore(state => state.devices.find(item => item.id === deviceId))
  const { setSnifferService, setSnifferPortEnabled, setSnifferBufferSize, clearSnifferCaptures, setActiveModal } = useNetworkStore(useShallow(state => ({
    setSnifferService: state.setSnifferService,
    setSnifferPortEnabled: state.setSnifferPortEnabled,
    setSnifferBufferSize: state.setSnifferBufferSize,
    clearSnifferCaptures: state.clearSnifferCaptures,
    setActiveModal: state.setActiveModal,
  })))
  const checkpoint = useWorkspaceStore(state => state.checkpoint)
  const [protocol, setProtocol] = useState<PacketProtocol | 'ALL'>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const captures = useMemo(() => device?.snifferCaptures ?? [], [device?.snifferCaptures])
  const protocols = useMemo(() => Array.from(new Set(captures.map(capture => capture.pdu.protocol))).sort(), [captures])
  const activeProtocol = protocol === 'ALL' || protocols.includes(protocol) ? protocol : 'ALL'
  const visibleCaptures = useMemo(() => captures
    .filter(capture => activeProtocol === 'ALL' || capture.pdu.protocol === activeProtocol)
    .slice()
    .reverse(), [captures, activeProtocol])
  const selected = captures.find(capture => capture.id === selectedId)
  const ports = device ? snifferModulePorts(device) : []

  if (!device) return null

  const powered = device.power !== false
  const serviceOn = snifferServiceEnabled(device.config)
  const bufferSize = snifferBufferLimit(device.config)
  const change = (action: () => void) => {
    if (!powered) return
    checkpoint()
    action()
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#eef3f6] text-[#14212b]" aria-label={t('Sniffer')}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#9aaab4] bg-[#dfe8ee] px-3 py-2">
        <div className="min-w-[150px]">
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#55707f]">{t('Packet Capture')}</div>
          <div className="font-mono text-[13px] font-semibold" dir="ltr">{device.name}</div>
        </div>

        <div className="flex items-center gap-2" role="group" aria-label={t('Sniffer Service')}>
          <span className="text-[11px] font-semibold">{t('Sniffer Service')}</span>
          <span className={`h-2 w-2 rounded-full ${serviceOn && powered ? 'bg-[#2b8a4b]' : 'bg-[#8c99a1]'}`} aria-hidden="true" />
          <div className="inline-flex overflow-hidden rounded-[2px] border border-[#7f8f99]">
            <button
              type="button"
              aria-pressed={serviceOn}
              disabled={!powered}
              onClick={() => change(() => setSnifferService(device.id, true))}
              className={`h-[22px] px-2 text-[11px] font-semibold ${serviceOn ? 'bg-[#316ac5] text-white' : 'bg-white text-[#24323b] hover:bg-[#f2f6f9]'} disabled:cursor-not-allowed disabled:opacity-50`}
            >{t('On')}</button>
            <button
              type="button"
              aria-pressed={!serviceOn}
              disabled={!powered}
              onClick={() => change(() => setSnifferService(device.id, false))}
              className={`h-[22px] border-l border-[#7f8f99] px-2 text-[11px] font-semibold ${!serviceOn ? 'bg-[#316ac5] text-white' : 'bg-white text-[#24323b] hover:bg-[#f2f6f9]'} disabled:cursor-not-allowed disabled:opacity-50`}
            >{t('Off')}</button>
          </div>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] font-semibold">
          {t('Buffer Size')}
          <select
            aria-label={t('Buffer Size')}
            value={bufferSize}
            disabled={!powered}
            onChange={event => {
              setProtocol('ALL')
              change(() => setSnifferBufferSize(device.id, Number(event.target.value)))
            }}
            className="h-[22px] rounded-[2px] border border-[#7f8f99] bg-white px-1 text-[11px] font-normal disabled:opacity-50"
          >
            {bufferChoices(bufferSize).map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] font-semibold">
          {t('Protocol')}
          <select
            aria-label={t('Protocol')}
            value={activeProtocol}
            onChange={event => setProtocol(event.target.value as PacketProtocol | 'ALL')}
            className="h-[22px] rounded-[2px] border border-[#7f8f99] bg-white px-1 text-[11px] font-normal"
          >
            <option value="ALL">{t('All Protocols')}</option>
            {protocols.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <button
          type="button"
          disabled={captures.length === 0}
          onClick={() => {
            checkpoint()
            clearSnifferCaptures(device.id)
            setSelectedId(null)
            setProtocol('ALL')
          }}
          className="ml-auto h-[22px] rounded-[2px] border border-[#7f8f99] bg-white px-2 text-[11px] font-semibold hover:bg-[#f2f6f9] disabled:cursor-not-allowed disabled:opacity-45"
        >{t('Clear Captures')}</button>
      </header>

      {!powered && (
        <div className="border-b border-[#c4a56b] bg-[#fff4d7] px-3 py-2 text-[11px] text-[#5c4516]" role="status">
          {t('Device is Powered Off')}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2">
        <section className="rounded-[2px] border border-[#a9b7c0] bg-[#f7fafc] px-2 py-1.5" aria-label={t('Port')}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#526872]">{t('Capture only frames that arrive on enabled ports.')}</span>
            {ports.length === 0 ? (
              <span className="text-[11px] text-[#54646e]">{t('Install a repeater module in the Physical tab to capture packets.')}</span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {ports.map(port => {
                  const enabled = snifferPortEnabled(device.config, port.id)
                  return (
                    <label key={port.id} className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#b8c3ca] bg-white px-2 py-1 text-[11px]">
                      <input
                        type="checkbox"
                        aria-label={port.name}
                        checked={enabled}
                        disabled={!powered}
                        onChange={event => change(() => setSnifferPortEnabled(device.id, port.id, event.target.checked))}
                        className="h-3 w-3 accent-[#316ac5]"
                      />
                      <span className="font-mono" dir="ltr">{port.name}</span>
                      <span className={`text-[10px] font-semibold ${enabled ? 'text-[#2b6b43]' : 'text-[#77848c]'}`}>{t(enabled ? 'On' : 'Off')}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2">
          <div className="min-h-0 overflow-auto rounded-[2px] border border-[#a9b7c0] bg-white">
            <table className="w-full border-collapse text-left text-[11px]" data-testid="sniffer-capture-table">
              <thead className="sticky top-0 z-10 bg-[#e7eef2] text-[10px] uppercase tracking-[0.06em] text-[#41545f]">
                <tr>
                  <th className="border-b border-[#b8c3ca] px-2 py-1.5 font-bold">#</th>
                  <th className="border-b border-[#b8c3ca] px-2 py-1.5 font-bold">{t('Time')}</th>
                  <th className="border-b border-[#b8c3ca] px-2 py-1.5 font-bold">{t('Source')}</th>
                  <th className="border-b border-[#b8c3ca] px-2 py-1.5 font-bold">{t('Destination')}</th>
                  <th className="border-b border-[#b8c3ca] px-2 py-1.5 font-bold">{t('Protocol')}</th>
                  <th className="border-b border-[#b8c3ca] px-2 py-1.5 font-bold">{t('Port')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleCaptures.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[11px] text-[#5c6b74]">
                      <div className="font-semibold text-[#33444e]">{t(captures.length === 0 ? 'No packets captured yet.' : 'No packets match this filter.')}</div>
                      <div className="mt-1">{captures.length === 0 ? t('Connect this Sniffer between devices and generate traffic.') : t('All captured packets are hidden by the current protocol filter.')}</div>
                    </td>
                  </tr>
                ) : visibleCaptures.map(capture => {
                  const index = captures.findIndex(item => item.id === capture.id) + 1
                  const source = capture.pdu.sourceIp || capture.pdu.sourceMac
                  const destination = capture.pdu.destIp || capture.pdu.destMac
                  const isSelected = capture.id === selectedId
                  return (
                    <tr
                      key={capture.id}
                      data-testid="sniffer-capture-row"
                      tabIndex={0}
                      aria-selected={isSelected}
                      onClick={() => setSelectedId(capture.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedId(capture.id)
                        }
                      }}
                      className={`cursor-pointer border-b border-[#e1e7ea] outline-none transition-colors ${isSelected ? 'bg-[#dce9f7]' : 'hover:bg-[#f2f7fa]'} focus:bg-[#e8f1fb]`}
                    >
                      <td className="px-2 py-1.5 font-mono text-[#53636c]">{index}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[#53636c]">{captureSeconds(capture.tick)}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5 font-mono" dir="ltr" title={source}>{source}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5 font-mono" dir="ltr" title={destination}>{destination}</td>
                      <td className="px-2 py-1.5 font-semibold">{capture.pdu.protocol}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono" dir="ltr">{capture.portName}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <aside className="min-h-[112px] rounded-[2px] border border-[#a9b7c0] bg-[#f7fafc] px-3 py-2" aria-label={t('Packet Details')}>
            {selected ? (
              <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                <div className="min-w-[220px] flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#526872]">{t('Packet Details')}</div>
                  <div className="mt-1 font-mono text-[12px] font-semibold" dir="ltr">
                    {selected.pdu.sourceIp || selected.pdu.sourceMac} → {selected.pdu.destIp || selected.pdu.destMac}
                  </div>
                  <div className="mt-1 text-[11px] text-[#4e606b]">{selected.pdu.summary}</div>
                </div>
                <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[10px]">
                  <dt className="font-semibold text-[#526872]">{t('Protocol')}</dt><dd>{selected.pdu.protocol}</dd>
                  <dt className="font-semibold text-[#526872]">{t('Port')}</dt><dd className="font-mono" dir="ltr">{selected.portName}</dd>
                  <dt className="font-semibold text-[#526872]">{t('Time')}</dt><dd className="font-mono">{captureSeconds(selected.tick)}</dd>
                </dl>
                <button
                  type="button"
                  onClick={() => setActiveModal({ type: 'pdu', pdu: selected.pdu })}
                  className="h-[24px] rounded-[2px] border border-[#7f8f99] bg-white px-2.5 text-[11px] font-semibold hover:bg-[#eef5f9]"
                >{t('PDU Details')}</button>
              </div>
            ) : (
              <p className="text-[11px] text-[#5c6b74]">{t('Select a packet to inspect its details.')}</p>
            )}
            <p className="mt-1 text-[9px] text-[#7a888f]">{t('Captures stay in this browser session.')}</p>
          </aside>
        </div>
      </div>
    </section>
  )
}
