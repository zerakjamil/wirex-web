'use client'

import React, { useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { PacketPdu } from '@/types/network'
import { useI18n } from '@/i18n/useI18n'

export function PduDetailsModal() {
  const activeModal = useNetworkStore(state => state.activeModal)
  if (activeModal?.type !== 'pdu' || !activeModal.pdu) return null
  return <PduDetailsDialog pdu={activeModal.pdu} />
}

function PduDetailsDialog({ pdu }: { pdu: PacketPdu }) {
  const { t } = useI18n()
  const setActiveModal = useNetworkStore(state => state.setActiveModal)
  const [activeTab, setActiveTab] = useState<'osi' | 'headers'>('osi')

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="h-12 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-slate-100">
              {t('PDU Information:')} <span className="font-mono text-sky-400">{pdu.protocol}</span>
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-200 text-sm rounded transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-4 border-b border-slate-800 bg-slate-900 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('osi')}
            className={`min-h-[44px] px-4 text-xs font-medium border-b-2 transition cursor-pointer ${
              activeTab === 'osi'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('OSI Model Inspection')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={`min-h-[44px] px-4 text-xs font-medium border-b-2 transition cursor-pointer ${
              activeTab === 'headers'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('Raw Headers & Payload')}
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 overflow-y-auto flex-1 bg-slate-950 space-y-4">
          {activeTab === 'osi' ? (
            <div className="space-y-3">
              {/* Device Decision Callout */}
              <div className="bg-sky-950/40 border border-sky-800 rounded-lg p-3">
                <span className="text-[11px] font-semibold uppercase text-sky-400 block mb-1">
                  {t('Device Decision & Routing Logic')}
                </span>
                <p className="text-xs text-sky-100 leading-relaxed font-sans">
                  {pdu.explanation.deviceDecision}
                </p>
              </div>

              {/* OSI Layer Breakdown Cards */}
              <div className="space-y-2">
                {/* Layer 4 / 7 */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200">{t('Layer 4 & 7: Transport & Application')}</span>
                    <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                      {pdu.protocol}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{pdu.explanation.layer4AndAbove}</p>
                </div>

                {/* Layer 3 */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200">{t('Layer 3: Network (IPv4)')}</span>
                    <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                      TTL: {pdu.ttl}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{pdu.explanation.layer3}</p>
                </div>

                {/* Layer 2 */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200">{t('Layer 2: Data Link (Ethernet)')}</span>
                    <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                      {pdu.etherType}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{pdu.explanation.layer2}</p>
                </div>

                {/* Layer 1 */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200">{t('Layer 1: Physical Interface')}</span>
                    <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                      Copper / 100Mbps
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{pdu.explanation.layer1}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-black p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-200 space-y-2">
              <div>
                <span className="text-slate-500 block">Ethernet II Header:</span>
                <div>Source MAC: {pdu.sourceMac}</div>
                <div>Destination MAC: {pdu.destMac}</div>
                <div>EtherType: {pdu.etherType}</div>
              </div>
              <div className="border-t border-slate-900 pt-2">
                <span className="text-slate-500 block">IP Header:</span>
                <div>Source IP: {pdu.sourceIp}</div>
                <div>Destination IP: {pdu.destIp}</div>
                <div>TTL: {pdu.ttl}</div>
                {pdu.payload.dscp !== undefined && (
                  <div>{t('TOS / DSCP')}: 0x{pdu.payload.dscp.toString(16).toUpperCase().padStart(2, '0')} ({pdu.payload.dscp})</div>
                )}
              </div>
              <div className="border-t border-slate-900 pt-2">
                <span className="text-slate-500 block">Payload Details:</span>
                <div>Summary: {pdu.summary}</div>
                {pdu.protocol === 'TCP' && pdu.payload.tcpFlags && <div className="mt-2 border-t border-slate-900 pt-2">
                  <span className="text-slate-500 block">{t('TCP segment')}</span>
                  <div>{t('Flags')}: {pdu.payload.tcpFlags}</div>
                  <div>{t('Source port')}: {pdu.payload.tcpSourcePort ?? '-'} · {t('Destination port')}: {pdu.payload.tcpDestinationPort ?? '-'}</div>
                  <div>{t('Sequence')}: {pdu.payload.tcpSequenceNumber ?? '-'} · {t('Acknowledgment')}: {pdu.payload.tcpAcknowledgmentNumber ?? '-'}</div>
                  {pdu.payload.tcpSegmentCount !== undefined && <div>{t('Segment')}: {(pdu.payload.tcpSegmentIndex ?? 0) + 1}/{pdu.payload.tcpSegmentCount}</div>}
                  {pdu.payload.tcpDataChunk !== undefined && <details className="mt-2 rounded border border-slate-800 bg-slate-900 p-2">
                    <summary className="cursor-pointer text-sky-300">{t('TCP application data')}{pdu.payload.tcpApplication ? ` · ${pdu.payload.tcpApplication}` : ''}</summary>
                    <pre dir="ltr" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-slate-200">{pdu.payload.tcpDataChunk}</pre>
                    {pdu.payload.tcpApplication === 'SMTP' && pdu.payload.tcpDataChunk.includes('AUTH PLAIN ') && <p role="note" className="mt-2 rounded border border-amber-700 bg-amber-950/50 p-2 text-amber-200">{t('AUTH PLAIN is visible in this no-TLS lab; Base64 is encoding, not encryption.')}</p>}
                    {pdu.payload.tcpApplication === 'POP3' && pdu.payload.tcpDataChunk.includes('PASS ') && <p role="note" className="mt-2 rounded border border-amber-700 bg-amber-950/50 p-2 text-amber-200">{t('POP3 sends the PASS password in clear text in this no-TLS lab.')}</p>}
                  </details>}
                </div>}
                {pdu.payload.ospf && <pre dir="ltr" className="whitespace-pre-wrap break-all mt-2">{JSON.stringify(pdu.payload.ospf, null, 2)}</pre>}
                {pdu.payload.rip && <pre dir="ltr" className="whitespace-pre-wrap break-all mt-2">{JSON.stringify(pdu.payload.rip, null, 2)}</pre>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-end flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded transition cursor-pointer"
          >
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  )
}
