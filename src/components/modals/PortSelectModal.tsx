'use client'

import React, { useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { CableType } from '@/types/network'
import { useI18n } from '@/i18n/useI18n'

export function PortSelectModal() {
  const { activeModal } = useNetworkStore()
  if (activeModal?.type !== 'port-select') return null
  return <PortSelectDialog />
}

function PortSelectDialog() {
  const { t } = useI18n()
  const { devices, activeModal, setActiveModal, connectPorts, activeTool } = useNetworkStore()

  const sourceDev = devices.find((d) => d.id === activeModal?.sourceDeviceId)
  const targetDev = devices.find((d) => d.id === activeModal?.targetDeviceId)

  const [selectedSourcePort, setSelectedSourcePort] = useState<string>(
    sourceDev?.ports.find((p) => p.virtualVlan===undefined&&!p.connectedLinkId)?.id || ''
  )
  const [selectedTargetPort, setSelectedTargetPort] = useState<string>(
    targetDev?.ports.find((p) => p.virtualVlan===undefined&&!p.connectedLinkId)?.id || ''
  )

  if (!sourceDev || !targetDev) {
    return null
  }

  const cableType: CableType =
    activeTool === 'cable-crossover'
      ? 'crossover'
      : activeTool === 'cable-fiber'
      ? 'fiber'
      : 'straight'

  const handleConnect = () => {
    if (!selectedSourcePort || !selectedTargetPort) return
    const success = connectPorts(sourceDev.id, selectedSourcePort, targetDev.id, selectedTargetPort, cableType)
    if (success) {
      setActiveModal(null)
    } else {
      alert('Selected ports could not be connected. Please verify ports are available.')
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
            {t('Connect Cable:')} {cableType.toUpperCase()}
          </h3>
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            className="text-slate-400 hover:text-slate-200 text-sm p-1 rounded transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Source Device Ports */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-xs font-semibold text-slate-300 block mb-2">
              {sourceDev.name} ({sourceDev.model})
            </span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {sourceDev.ports.filter(p=>p.virtualVlan===undefined).map((port) => {
                const isOccupied = !!port.connectedLinkId
                return (
                  <button
                    key={port.id}
                    type="button"
                    disabled={isOccupied}
                    onClick={() => setSelectedSourcePort(port.id)}
                    className={`w-full min-h-[44px] px-3 py-2 rounded text-left text-xs font-mono transition flex items-center justify-between cursor-pointer ${
                      selectedSourcePort === port.id
                        ? 'bg-sky-950 border border-sky-500 text-sky-200'
                        : isOccupied
                        ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-500'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-transparent'
                    }`}
                  >
                    <span>{port.name}</span>
                    <span className="text-[10px] uppercase font-sans">
                      {isOccupied ? t('Occupied') : t('Free')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Target Device Ports */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-xs font-semibold text-slate-300 block mb-2">
              {targetDev.name} ({targetDev.model})
            </span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {targetDev.ports.filter(p=>p.virtualVlan===undefined).map((port) => {
                const isOccupied = !!port.connectedLinkId
                return (
                  <button
                    key={port.id}
                    type="button"
                    disabled={isOccupied}
                    onClick={() => setSelectedTargetPort(port.id)}
                    className={`w-full min-h-[44px] px-3 py-2 rounded text-left text-xs font-mono transition flex items-center justify-between cursor-pointer ${
                      selectedTargetPort === port.id
                        ? 'bg-sky-950 border border-sky-500 text-sky-200'
                        : isOccupied
                        ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-500'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-transparent'
                    }`}
                  >
                    <span>{port.name}</span>
                    <span className="text-[10px] uppercase font-sans">
                      {isOccupied ? t('Occupied') : t('Free')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded transition cursor-pointer"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            disabled={!selectedSourcePort || !selectedTargetPort}
            onClick={handleConnect}
            className="min-h-[44px] px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition cursor-pointer"
          >
            {t('Connect Cable')}
          </button>
        </div>
      </div>
    </div>
  )
}
