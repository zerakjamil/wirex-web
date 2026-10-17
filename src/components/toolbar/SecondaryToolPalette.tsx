'use client'

import React from 'react'
import { useNetworkStore } from '@/store/networkStore'

export function SecondaryToolPalette() {
  const { activeTool, setActiveTool, sendPing, devices } = useNetworkStore()

  const handleSimplePduClick = () => {
    setActiveTool('select')
    alert('Simple PDU Tool: Double-click any PC or Router to open its Command Prompt and initiate ping traffic.')
  }

  return (
    <div className="absolute top-3 right-3 bg-white border border-[#cbd5e1] rounded shadow-md p-1 flex flex-col gap-1 z-20 select-none">
      {/* Select Cursor */}
      <button
        type="button"
        onClick={() => setActiveTool('select')}
        className={`w-8 h-8 rounded flex items-center justify-center transition cursor-pointer ${
          activeTool === 'select' ? 'bg-[#e2e8f0] border border-[#94a3b8]' : 'hover:bg-[#f1f5f9]'
        }`}
        title="Select Tool (Esc)"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-slate-700">
          <polygon points="3 3 10 21 13 14 20 12 3 3" />
        </svg>
      </button>

      {/* Delete (Red X) */}
      <button
        type="button"
        onClick={() => setActiveTool(activeTool === 'delete' ? 'select' : 'delete')}
        className={`w-8 h-8 rounded flex items-center justify-center transition cursor-pointer ${
          activeTool === 'delete' ? 'bg-red-100 border border-red-400' : 'hover:bg-red-50'
        }`}
        title="Delete (Del)"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-red-600 stroke-[3]" stroke="currentColor" fill="none">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Note / Text Tool */}
      <button
        type="button"
        onClick={() => alert('Place Note Tool: Click canvas to add descriptive label.')}
        className="w-8 h-8 rounded hover:bg-[#f1f5f9] flex items-center justify-center transition cursor-pointer"
        title="Place Note"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </button>

      <div className="w-full h-[1px] bg-[#e2e8f0] my-0.5" />

      {/* Add Simple PDU (Classic Yellow Closed Envelope) */}
      <button
        type="button"
        onClick={handleSimplePduClick}
        className="w-8 h-8 rounded hover:bg-[#fef9c3] flex items-center justify-center transition cursor-pointer group"
        title="Add Simple PDU (ICMP Ping)"
      >
        <div className="relative">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-500 fill-amber-400" stroke="#78350f" strokeWidth="1.5">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" fill="none" />
          </svg>
          <span className="absolute -bottom-1 -right-1 text-[9px] font-bold text-amber-900 leading-none">+</span>
        </div>
      </button>
    </div>
  )
}
