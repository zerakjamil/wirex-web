'use client'

import React, { useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { DeviceType, CableType } from '@/types/network'

type Category = 'network' | 'end' | 'connections'

export function DeviceTray() {
  const {
    addDevice,
    activeTool,
    setActiveTool,
    simulationMode,
    simulationPlaying,
    toggleSimulationMode,
    setSimulationPlaying,
    stepSimulation,
  } = useNetworkStore()

  const [selectedCategory, setSelectedCategory] = useState<Category>('network')

  const handleAdd = (type: DeviceType) => {
    const x = 240 + Math.random() * 220
    const y = 140 + Math.random() * 160
    addDevice(type, x, y)
  }

  return (
    <div className="bg-[#eceff1] border-t-2 border-[#b0bec5] flex flex-col md:flex-row items-stretch select-none text-slate-800 text-xs z-20">
      {/* 1. Category Selector Box (Bottom Left) */}
      <div className="flex md:flex-col border-b md:border-b-0 md:border-r border-[#cfd8dc] p-1.5 gap-1 bg-[#f5f7f8] flex-shrink-0">
        {/* Network Devices Category */}
        <button
          type="button"
          onClick={() => setSelectedCategory('network')}
          className={`px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer transition ${
            selectedCategory === 'network'
              ? 'bg-[#cfd8dc] font-semibold text-slate-900 border border-[#b0bec5]'
              : 'hover:bg-[#e2e8f0] text-slate-600'
          }`}
          title="Routers, Switches, and Hubs"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-sky-600" stroke="#0284c7" strokeWidth="1">
            <circle cx="12" cy="12" r="10" />
          </svg>
          <span className="text-[11px]">Network Devices</span>
        </button>

        {/* End Devices Category */}
        <button
          type="button"
          onClick={() => setSelectedCategory('end')}
          className={`px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer transition ${
            selectedCategory === 'end'
              ? 'bg-[#cfd8dc] font-semibold text-slate-900 border border-[#b0bec5]'
              : 'hover:bg-[#e2e8f0] text-slate-600'
          }`}
          title="PCs, Laptops, and Servers"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span className="text-[11px]">End Devices</span>
        </button>

        {/* Connections Category (Iconic Lightning Bolt!) */}
        <button
          type="button"
          onClick={() => setSelectedCategory('connections')}
          className={`px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer transition ${
            selectedCategory === 'connections'
              ? 'bg-[#cfd8dc] font-semibold text-slate-900 border border-[#b0bec5]'
              : 'hover:bg-[#e2e8f0] text-slate-600'
          }`}
          title="Cables and Media (Connections)"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-500 fill-amber-500" stroke="#b45309" strokeWidth="1">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span className="text-[11px]">Connections</span>
        </button>
      </div>

      {/* 2. Specific Hardware Model Sub-Shelf (Center Bottom) */}
      <div className="flex-1 p-2 bg-[#f8fafc] flex items-center gap-3 overflow-x-auto min-h-[64px]">
        {selectedCategory === 'network' && (
          <>
            {/* Cisco 1941 Router */}
            <button
              type="button"
              onClick={() => handleAdd('router')}
              className="p-1.5 px-3 bg-white hover:bg-sky-50 active:bg-sky-100 border border-[#cbd5e1] hover:border-sky-500 rounded flex flex-col items-center gap-1 transition cursor-pointer min-w-[70px]"
              title="Click to add Cisco 1941 Router"
            >
              <svg viewBox="0 0 36 36" className="w-8 h-8">
                <ellipse cx="18" cy="19" rx="16" ry="10" fill="#0284c7" />
                <ellipse cx="18" cy="15" rx="16" ry="10" fill="#38bdf8" />
                <path d="M11 15h14M14 12l-3 3 3 3M22 12l3 3-3 3" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-semibold text-slate-800">1941</span>
            </button>

            {/* Cisco 2960 Catalyst Switch */}
            <button
              type="button"
              onClick={() => handleAdd('switch')}
              className="p-1.5 px-3 bg-white hover:bg-teal-50 active:bg-teal-100 border border-[#cbd5e1] hover:border-teal-500 rounded flex flex-col items-center gap-1 transition cursor-pointer min-w-[70px]"
              title="Click to add Cisco 2960 Catalyst Switch"
            >
              <svg viewBox="0 0 36 28" className="w-9 h-7">
                <rect x="2" y="6" width="32" height="18" rx="2" fill="#0f766e" />
                <path d="M7 11h22M11 8l-4 3 4 3M25 15l4 3-4 3M29 18H7" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-semibold text-slate-800">2960</span>
            </button>
          </>
        )}

        {selectedCategory === 'end' && (
          <>
            {/* PC-PT Workstation */}
            <button
              type="button"
              onClick={() => handleAdd('pc')}
              className="p-1.5 px-3 bg-white hover:bg-slate-100 active:bg-slate-200 border border-[#cbd5e1] rounded flex flex-col items-center gap-1 transition cursor-pointer min-w-[70px]"
              title="Click to add PC-PT Workstation"
            >
              <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" stroke="currentColor">
                <rect x="4" y="4" width="24" height="16" rx="2" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
                <rect x="7" y="7" width="18" height="10" fill="#1e293b" />
                <path d="M12 20v5M20 20v5M9 25h14" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-semibold text-slate-800">PC-PT</span>
            </button>

            {/* Server-PT */}
            <button
              type="button"
              onClick={() => handleAdd('server')}
              className="p-1.5 px-3 bg-white hover:bg-slate-100 active:bg-slate-200 border border-[#cbd5e1] rounded flex flex-col items-center gap-1 transition cursor-pointer min-w-[70px]"
              title="Click to add Server-PT"
            >
              <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" stroke="currentColor">
                <rect x="4" y="6" width="24" height="8" rx="1.5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
                <rect x="4" y="18" width="24" height="8" rx="1.5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
                <circle cx="8" cy="10" r="1.5" fill="#16a34a" />
                <circle cx="8" cy="22" r="1.5" fill="#16a34a" />
              </svg>
              <span className="text-[10px] font-semibold text-slate-800">Server-PT</span>
            </button>
          </>
        )}

        {selectedCategory === 'connections' && (
          <>
            {/* Auto Connection (Lightning Bolt) */}
            <button
              type="button"
              onClick={() => setActiveTool('cable-straight')}
              className={`p-1.5 px-2.5 rounded flex flex-col items-center gap-1 transition cursor-pointer min-w-[80px] border ${
                activeTool === 'cable-straight'
                  ? 'bg-amber-100 border-amber-500 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-[#cbd5e1]'
              }`}
              title="Automatically Choose Connection Type"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-500 fill-amber-500" stroke="#b45309" strokeWidth="1">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span className="text-[9px] font-semibold text-slate-800">Auto Wire</span>
            </button>

            {/* Copper Straight-Through */}
            <button
              type="button"
              onClick={() => setActiveTool('cable-straight')}
              className={`p-1.5 px-2.5 rounded flex flex-col items-center gap-1 transition cursor-pointer min-w-[80px] border ${
                activeTool === 'cable-straight'
                  ? 'bg-sky-100 border-sky-600 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-[#cbd5e1]'
              }`}
              title="Copper Straight-Through Cable"
            >
              <div className="w-8 h-6 flex items-center justify-center">
                <span className="w-full h-1 bg-black rounded" />
              </div>
              <span className="text-[9px] font-semibold text-slate-800">Straight-Through</span>
            </button>

            {/* Copper Cross-Over */}
            <button
              type="button"
              onClick={() => setActiveTool('cable-crossover')}
              className={`p-1.5 px-2.5 rounded flex flex-col items-center gap-1 transition cursor-pointer min-w-[80px] border ${
                activeTool === 'cable-crossover'
                  ? 'bg-sky-100 border-sky-600 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-[#cbd5e1]'
              }`}
              title="Copper Cross-Over Cable"
            >
              <div className="w-8 h-6 flex items-center justify-center">
                <span className="w-full h-0 border-t-2 border-dashed border-black" />
              </div>
              <span className="text-[9px] font-semibold text-slate-800">Cross-Over</span>
            </button>

            {/* Fiber Optic */}
            <button
              type="button"
              onClick={() => setActiveTool('cable-fiber')}
              className={`p-1.5 px-2.5 rounded flex flex-col items-center gap-1 transition cursor-pointer min-w-[80px] border ${
                activeTool === 'cable-fiber'
                  ? 'bg-orange-100 border-orange-600 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-[#cbd5e1]'
              }`}
              title="Fiber Optic Cable"
            >
              <div className="w-8 h-6 flex items-center justify-center">
                <span className="w-full h-1 bg-orange-500 rounded" />
              </div>
              <span className="text-[9px] font-semibold text-slate-800">Fiber</span>
            </button>
          </>
        )}
      </div>

      {/* 3. Realtime & Simulation Dock (Bottom Right) */}
      <div className="p-2 border-t md:border-t-0 md:border-l border-[#cfd8dc] bg-[#eceff1] flex items-center gap-2 flex-shrink-0">
        <div className="flex flex-col gap-1">
          {/* Realtime vs Simulation Tab Toggles */}
          <div className="inline-flex rounded bg-[#cfd8dc] p-0.5 border border-[#b0bec5]">
            <button
              type="button"
              onClick={simulationMode !== 'realtime' ? toggleSimulationMode : undefined}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition cursor-pointer ${
                simulationMode === 'realtime'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Realtime
            </button>
            <button
              type="button"
              onClick={simulationMode !== 'simulation' ? toggleSimulationMode : undefined}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition cursor-pointer ${
                simulationMode === 'simulation'
                  ? 'bg-amber-400 text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Simulation
            </button>
          </div>

          {/* Simulation Controls when Simulation Tab is active */}
          {simulationMode === 'simulation' && (
            <div className="flex items-center gap-1 bg-white p-1 rounded border border-[#cbd5e1] shadow-xs">
              <button
                type="button"
                onClick={() => setSimulationPlaying(!simulationPlaying)}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[10px] font-medium border border-slate-300 transition cursor-pointer"
                title={simulationPlaying ? 'Pause Capture' : 'Auto Capture / Play'}
              >
                {simulationPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={stepSimulation}
                className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded text-[10px] font-semibold border border-amber-300 transition cursor-pointer"
                title="Capture / Forward one packet hop"
              >
                Capture / Forward &gt;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
