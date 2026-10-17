'use client'

import React, { useState } from 'react'

export function CiscoInstructionsPanel() {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute bottom-2 left-2 bg-white/90 border border-[#cbd5e1] text-[11px] font-semibold text-slate-700 px-2 py-0.5 rounded shadow-xs z-10 hover:bg-white cursor-pointer"
      >
        ▲ Show Instructions
      </button>
    )
  }

  return (
    <div className="absolute bottom-2 left-2 max-w-xl bg-white/95 border border-[#cbd5e1] rounded shadow-xs p-2 text-xs select-none z-10 backdrop-blur-xs">
      <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-1 mb-1">
        <span className="text-[11px] font-bold text-slate-800">Instructions:</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-slate-400 hover:text-slate-600 text-[10px] cursor-pointer"
        >
          ▼ Hide
        </button>
      </div>
      <p className="text-[11px] text-slate-700 leading-snug">
        Configure the switches and routers to establish full end-to-end IP connectivity. Double-click any PC to access Command Prompt or IP Config, and double-click any Cisco Switch or Router to access the Cisco IOS CLI.
      </p>
    </div>
  )
}
