'use client'

import React, { useState } from 'react'
import type { NetworkDevice, NetworkPort } from '@/types/network'
import type { NetworkLink } from '@/types/network'
import { MODULE_CATALOG } from '@/simulator/deviceFactory'
import { useI18n } from '@/i18n/useI18n'

interface PhysicalChassisProps {
  device: NetworkDevice
  links: NetworkLink[]
  isPowerOn: boolean
  currentSlotModule?: string
  selectedModuleId: string
  onSlotClick: () => void
  onTogglePower?: () => void
}

// ==========================================
// 1. Catalyst Switch Physical Chassis (2960 / 3560)
// Matches a standard Catalyst 2960 front panel layout
// ==========================================
export function SwitchChassis({
  device,
  links,
  onSlotClick,
}: PhysicalChassisProps) {
  const { t } = useI18n()
  const [switchMode, setSwitchMode] = useState<'STAT' | 'UTIL' | 'DUPLX' | 'SPEED'>('STAT')

  const handleModeClick = () => {
    setSwitchMode((prev) => {
      if (prev === 'STAT') return 'UTIL'
      if (prev === 'UTIL') return 'DUPLX'
      if (prev === 'DUPLX') return 'SPEED'
      return 'STAT'
    })
  }

  // FastEthernet 0/1 to 0/24 port map
  const fastPorts: { portNum: number; port?: NetworkPort; link?: NetworkLink }[] = []
  for (let i = 1; i <= 24; i++) {
    const p = device.ports.find((item) => item.id === `FastEthernet0/${i}` || item.name === `FastEthernet0/${i}`)
    const l = p ? links.find((link) => (link.fromDeviceId === device.id && link.fromPortId === p.id) || (link.toDeviceId === device.id && link.toPortId === p.id)) : undefined
    fastPorts.push({ portNum: i, port: p, link: l })
  }

  // GigabitEthernet 0/1 and 0/2 uplink ports
  const gigaPorts: { portNum: number; port?: NetworkPort; link?: NetworkLink }[] = [1, 2].map((i) => {
    const p = device.ports.find((item) => item.id === `GigabitEthernet0/${i}` || item.name === `GigabitEthernet0/${i}`)
    const l = p ? links.find((link) => (link.fromDeviceId === device.id && link.fromPortId === p.id) || (link.toDeviceId === device.id && link.toPortId === p.id)) : undefined
    return { portNum: i, port: p, link: l }
  })

  // Compute LED status according to active Cisco Switch Mode
  const getPortLedState = (portNum: number, link?: NetworkLink, port?: NetworkPort) => {
    const isUp = port?.adminStatus !== 'down' && link && link.status === 'up'
    if (switchMode === 'STAT') {
      if (!isUp) return 'off'
      if (port?.status === 'learning' || port?.stpState === 'blocking' || port?.stpState === 'listening' || port?.stpState === 'learning') return 'amber'
      return 'green'
    }
    if (switchMode === 'UTIL') {
      // Bargraph representation of switch traffic load
      return portNum <= 8 ? 'green' : portNum <= 16 ? 'amber' : 'off'
    }
    if (switchMode === 'DUPLX') {
      return isUp ? 'green' : 'off'
    }
    if (switchMode === 'SPEED') {
      return isUp ? 'green' : 'off'
    }
    return 'off'
  }

  return (
    <div className="w-[820px] select-none flex items-stretch shadow-2xl rounded-xs overflow-hidden border border-[#1e293b]">
      {/* Left Rack Mount Flange Ear */}
      <div className="w-6 bg-gradient-to-r from-[#242b35] to-[#1e252e] border-r border-[#151c24] flex flex-col justify-around items-center py-3 flex-shrink-0">
        <div className="w-2.5 h-4 rounded-full bg-[#0a0d11] border border-slate-600 shadow-inner" />
        <div className="w-2.5 h-4 rounded-full bg-[#0a0d11] border border-slate-600 shadow-inner" />
      </div>

      {/* Main Switch Chassis Body */}
      <div className="flex-1 flex flex-col bg-[#1c242c]">
        {/* TOP FACEPLATE: Signature Cisco Catalyst Teal (#184a5c) */}
        <div className="h-28 bg-gradient-to-b from-[#1c5366] via-[#174656] to-[#123846] border-b border-[#0c242e] px-3 py-2 flex items-center justify-between relative shadow-md">
          {/* Subtle Top Metallic Highlight Line */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#2b7996] to-transparent" />

          {/* Left Block: Cisco Systems Logo + SYST/RPS LEDs + MODE Button */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Cisco Classic Bridge Logo */}
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-black tracking-widest text-slate-100 font-sans leading-tight">
                CISCO SYSTEMS
              </span>
              <svg className="w-16 h-3.5 text-slate-200 mt-0.5" viewBox="0 0 100 24" fill="currentColor">
                <rect x="6" y="16" width="3.5" height="8" rx="0.5" />
                <rect x="14" y="12" width="3.5" height="12" rx="0.5" />
                <rect x="22" y="8" width="3.5" height="16" rx="0.5" />
                <rect x="30" y="4" width="3.5" height="20" rx="0.5" />
                <rect x="38" y="0" width="3.5" height="24" rx="0.5" />
                <rect x="46" y="0" width="3.5" height="24" rx="0.5" />
                <rect x="54" y="4" width="3.5" height="20" rx="0.5" />
                <rect x="62" y="8" width="3.5" height="16" rx="0.5" />
                <rect x="70" y="12" width="3.5" height="12" rx="0.5" />
                <rect x="78" y="16" width="3.5" height="8" rx="0.5" />
              </svg>
            </div>

            {/* SYST & RPS System Status LEDs */}
            <div className="flex flex-col gap-1 pl-1 border-l border-[#246177]">
              <div className="flex items-center gap-1.5">
                <span className="text-[7.5px] font-bold font-mono text-slate-200 tracking-tight">SYST</span>
                <div className="w-2 h-2 rounded-full bg-emerald-400 border border-emerald-300 shadow-[0_0_6px_#22c55e]" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[7.5px] font-bold font-mono text-slate-200 tracking-tight">RPS</span>
                <div className="w-2 h-2 rounded-full bg-emerald-400 border border-emerald-300 shadow-[0_0_6px_#22c55e]" />
              </div>
            </div>

            {/* Mode Controls Section (Matching User Red Arrow & Red Box!) */}
            <div className="flex flex-col items-center bg-[#0d2f3c]/90 px-2.5 py-1 rounded border border-[#205d73] shadow-inner">
              {/* Mode Labels */}
              <div className="flex items-center gap-1.5 mb-1">
                {(['STAT', 'UTIL', 'DUPLX', 'SPEED'] as const).map((m) => (
                  <div key={m} className="flex flex-col items-center">
                    <span
                      className={`text-[6.5px] font-bold font-mono tracking-tighter ${
                        switchMode === m ? 'text-amber-300' : 'text-slate-300'
                      }`}
                    >
                      {m}
                    </span>
                    <div
                      className={`w-1.5 h-1.5 rounded-full mt-0.5 border ${
                        switchMode === m
                          ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_6px_#22c55e]'
                          : 'bg-[#06151c] border-slate-700'
                      }`}
                    />
                  </div>
                ))}
              </div>

              {/* Push Button: MODE */}
              <button
                type="button"
                onClick={handleModeClick}
                className="w-12 h-4 bg-[#0a2632] hover:bg-[#123e50] active:scale-95 active:bg-[#071c25] border border-[#2b6d85] rounded-full flex items-center justify-center cursor-pointer shadow-inner transition-transform"
                title={t('Click to toggle Switch Mode')}
              >
                <span className="text-[7px] font-black tracking-wider text-slate-100">MODE</span>
              </button>
            </div>
          </div>

          {/* Right Block: 3 Groups of 8 FastEthernet Ports + Uplinks */}
          <div className="flex items-center gap-1.5">
            {[
              { start: 1, end: 8 },
              { start: 9, end: 16 },
              { start: 17, end: 24 },
            ].map((bank) => (
              <div key={bank.start} className="flex flex-col gap-0.5 items-center">
                {/* Port Numbers & Status LEDs Row */}
                <div className="flex gap-1 px-1">
                  {Array.from({ length: 8 }, (_, i) => bank.start + i).map((portNum) => {
                    const item = fastPorts.find((p) => p.portNum === portNum)
                    const led = getPortLedState(portNum, item?.link, item?.port)
                    return (
                      <div key={portNum} className="flex flex-col items-center w-4.5">
                        <span className="text-[7px] font-bold font-mono text-slate-200 leading-none mb-0.5">
                          {portNum}
                        </span>
                        <div
                          className={`w-2 h-1 rounded-full border ${
                            led === 'green'
                              ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_5px_#22c55e]'
                              : led === 'amber'
                              ? 'bg-amber-400 border-amber-300 shadow-[0_0_5px_#f59e0b]'
                              : 'bg-[#091016] border-slate-700'
                          }`}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* Yellow/Gold Framed RJ-45 Jacks */}
                <div className="border-2 border-[#f59e0b] bg-[#070d13] p-1 rounded-xs shadow-inner flex items-center gap-1">
                  {Array.from({ length: 8 }, (_, i) => bank.start + i).map((portNum) => {
                    const item = fastPorts.find((p) => p.portNum === portNum)
                    return (
                      <div
                        key={portNum}
                        className="w-4.5 h-4.5 bg-[#0b1219] border border-slate-700 rounded-xs flex flex-col justify-between p-0.5 relative group hover:border-amber-400 cursor-pointer shadow-inner"
                        title={`FastEthernet0/${portNum} - ${item?.link?.status === 'up' ? 'Connected (Up)' : 'Disconnected'}`}
                      >
                        <div className="flex justify-between px-0.5 pt-0.5">
                          {[...Array(6)].map((_, pin) => (
                            <div key={pin} className="w-[1px] h-1 bg-amber-400/90" />
                          ))}
                        </div>
                        <div className="w-2 h-1 bg-black mx-auto rounded-t-xs" />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Uplink Gigabit Ports (G1, G2) */}
            <div className="flex flex-col gap-0.5 items-center">
              <div className="flex gap-1 px-1">
                {gigaPorts.map((g) => {
                  const isUp = g.port?.adminStatus !== 'down' && g.link && g.link.status === 'up'
                  return (
                    <div key={g.portNum} className="flex flex-col items-center w-4.5">
                      <span className="text-[7px] font-bold font-mono text-slate-200 leading-none mb-0.5">
                        G{g.portNum}
                      </span>
                      <div
                        className={`w-2 h-1 rounded-full border ${
                          isUp
                            ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_5px_#22c55e]'
                            : 'bg-[#091016] border-slate-700'
                        }`}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="border-2 border-[#f59e0b] bg-[#070d13] p-1 rounded-xs shadow-inner flex items-center gap-1">
                {gigaPorts.map((g) => {
                  const isUp = g.port?.adminStatus !== 'down' && g.link && g.link.status === 'up'
                  return (
                    <div
                      key={g.portNum}
                      className="w-4.5 h-4.5 bg-[#0b1219] border border-slate-700 rounded-xs flex flex-col justify-between p-0.5 relative group hover:border-amber-400 cursor-pointer shadow-inner"
                      title={`GigabitEthernet0/${g.portNum} - ${isUp ? 'Connected (Up)' : 'Disconnected'}`}
                    >
                      <div className="flex justify-between px-0.5 pt-0.5">
                        {[...Array(6)].map((_, pin) => (
                          <div key={pin} className="w-[1px] h-1 bg-amber-400/90" />
                        ))}
                      </div>
                      <div className="w-2 h-1 bg-black mx-auto rounded-t-xs" />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM FACEPLATE: Brushed Dark Charcoal Metal (#29313a) */}
        <div className="h-14 bg-gradient-to-b from-[#2e3742] via-[#242b34] to-[#1c2229] px-6 flex items-center justify-between border-t border-[#3c4756] relative">
          {/* Phillips Screws (Crosshead X Screws) */}
          <div className="flex items-center gap-6">
            <div className="w-3.5 h-3.5 rounded-full bg-slate-500 border border-slate-600 flex items-center justify-center shadow-inner">
              <div className="text-[9px] text-slate-800 font-bold leading-none select-none">+</div>
            </div>
            <div className="w-3.5 h-3.5 rounded-full bg-slate-500 border border-slate-600 flex items-center justify-center shadow-inner">
              <div className="text-[9px] text-slate-800 font-bold leading-none select-none">+</div>
            </div>
          </div>

          {/* Model Information Badge */}
          <div className="text-center">
            <div className="text-[10px] font-bold text-slate-200 font-mono tracking-wider">
              Cisco Catalyst {device.model || '2960-24TT'}
            </div>
            <div className="text-[8px] text-slate-400 font-mono">
              24 10/100 FastEthernet + 2 10/100/1000 GigabitEthernet
            </div>
          </div>

          {/* CONSOLE Port (Cream / Light Bezel Matching User Screenshot) */}
          <div className="flex flex-col items-center">
            <span className="text-[7.5px] font-black font-mono text-slate-200 tracking-wider mb-0.5">
              CONSOLE
            </span>
            <div
              className="w-7 h-6 bg-[#f1f5f9] border border-slate-400 rounded-xs flex flex-col items-center justify-between p-0.5 shadow-md cursor-pointer hover:border-sky-400"
              title="RJ-45 Management Console Port"
            >
              <div className="w-5 h-3 bg-slate-900 rounded-t-xs flex justify-between px-0.5 pt-0.5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="w-[1px] h-1.5 bg-amber-400" />
                ))}
              </div>
              <div className="w-3 h-1 bg-slate-400 rounded-t-xs" />
            </div>
          </div>

          {/* Right Phillips Screws */}
          <div className="flex items-center gap-6">
            <div className="w-3.5 h-3.5 rounded-full bg-slate-500 border border-slate-600 flex items-center justify-center shadow-inner">
              <div className="text-[9px] text-slate-800 font-bold leading-none select-none">+</div>
            </div>
            <div className="w-3.5 h-3.5 rounded-full bg-slate-500 border border-slate-600 flex items-center justify-center shadow-inner">
              <div className="text-[9px] text-slate-800 font-bold leading-none select-none">+</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Rack Mount Flange Ear */}
      <div className="w-6 bg-gradient-to-l from-[#242b35] to-[#1e252e] border-l border-[#151c24] flex flex-col justify-around items-center py-3 flex-shrink-0">
        <div className="w-2.5 h-4 rounded-full bg-[#0a0d11] border border-slate-600 shadow-inner" />
        <div className="w-2.5 h-4 rounded-full bg-[#0a0d11] border border-slate-600 shadow-inner" />
      </div>
    </div>
  )
}

// ==========================================
// 2. Cisco ISR Router Physical Chassis (1941 / 2911)
// ==========================================
export function RouterChassis({
  device,
  links,
  isPowerOn,
  currentSlotModule,
  selectedModuleId,
  onSlotClick,
  onTogglePower,
}: PhysicalChassisProps) {
  const { t } = useI18n()
  const modDef = currentSlotModule ? MODULE_CATALOG[currentSlotModule] : null

  return (
    <div className="w-[750px] bg-gradient-to-b from-[#3a4452] via-[#2a323d] to-[#1c222a] border-2 border-slate-700 rounded-md shadow-2xl p-4 select-none flex flex-col gap-3">
      {/* Top Banner: Cisco Brand, Model, Power Switch & AC Inlet */}
      <div className="flex items-center justify-between border-b border-slate-600/60 pb-3">
        {/* Left: Interactive Power Rocker Switch */}
        <div className="flex items-center gap-4 bg-slate-900/90 px-3 py-2 rounded border border-slate-700 shadow-inner">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[7.5px] font-bold font-mono text-slate-300">POWER</span>
            {/* Rocker Switch Button */}
            <button
              type="button"
              onClick={onTogglePower}
              className={`w-7 h-5 rounded-xs border cursor-pointer flex items-center justify-center font-mono font-bold text-[9px] shadow-sm transition-all ${
                isPowerOn
                  ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white shadow-[0_0_8px_#22c55e]'
                  : 'bg-rose-900 hover:bg-rose-800 border-rose-700 text-slate-300'
              }`}
              title={isPowerOn ? t('Power is ON - Click to turn OFF') : t('Power is OFF - Click to turn ON')}
            >
              {isPowerOn ? 'I' : 'O'}
            </button>
          </div>

          {/* System LEDs */}
          <div className="flex flex-col gap-1 pl-2 border-l border-slate-700">
            <div className="flex items-center gap-1.5">
              <span className="text-[7.5px] font-mono text-slate-400">PWR</span>
              <div
                className={`w-2 h-2 rounded-full border ${
                  isPowerOn
                    ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_6px_#22c55e]'
                    : 'bg-slate-700 border-slate-800'
                }`}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[7.5px] font-mono text-slate-400">SYS</span>
              <div
                className={`w-2 h-2 rounded-full border ${
                  isPowerOn
                    ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_6px_#22c55e]'
                    : 'bg-slate-700 border-slate-800'
                }`}
              />
            </div>
          </div>

          {/* IEC AC Power Connector */}
          <div className="flex flex-col items-center pl-2 border-l border-slate-700">
            <div className="w-5 h-4 bg-slate-950 border border-slate-600 rounded-xs flex flex-col justify-around items-center p-0.5">
              <div className="w-1.5 h-0.5 bg-amber-400/80 rounded-full" />
              <div className="flex gap-1">
                <div className="w-1 h-0.5 bg-amber-400/80" />
                <div className="w-1 h-0.5 bg-amber-400/80" />
              </div>
            </div>
            <span className="text-[6.5px] font-mono text-slate-400">~100-240V</span>
          </div>
        </div>

        {/* Center: Cisco Logo & Router Model Badge */}
        <div className="text-center">
          <div className="text-xs font-black tracking-widest text-slate-100 font-sans">
            CISCO SYSTEMS
          </div>
          <div className="text-sm font-bold text-sky-400 font-mono tracking-wide">
            Cisco {device.model || '1941'} Integrated Services Router
          </div>
        </div>

        {/* Right: Cooling Fan Vents */}
        <div className="flex gap-1 h-9 px-3 bg-slate-900/90 rounded border border-slate-700 items-center">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="w-0.5 h-7 bg-slate-700" />
          ))}
        </div>
      </div>

      {/* Middle Row: Fixed Network Interfaces & Expansion Slot Bays */}
      <div className="flex items-stretch justify-between gap-4">
        {/* Fixed Built-in Interfaces Panel */}
        <div className="bg-[#121820] p-3 rounded border border-slate-700 flex items-center gap-4 shadow-inner">
          {/* CONSOLE Port (Light Blue Bezel) */}
          <div className="flex flex-col items-center">
            <span className="text-[7.5px] font-bold font-mono text-cyan-300 mb-0.5">CONSOLE</span>
            <div
              className="w-7 h-6 bg-[#0369a1] border-2 border-sky-400 rounded-xs flex flex-col items-center justify-between p-0.5 shadow-md"
              title="RJ-45 Cisco Management Console Port"
            >
              <div className="w-5 h-3 bg-slate-950 rounded-t-xs flex justify-between px-0.5 pt-0.5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="w-[1px] h-1.5 bg-amber-400" />
                ))}
              </div>
              <div className="w-3 h-1 bg-sky-200 rounded-t-xs" />
            </div>
          </div>

          {/* AUX Port (Cream Bezel) */}
          <div className="flex flex-col items-center">
            <span className="text-[7.5px] font-bold font-mono text-slate-300 mb-0.5">AUX</span>
            <div
              className="w-7 h-6 bg-[#f1f5f9] border border-slate-400 rounded-xs flex flex-col items-center justify-between p-0.5 shadow-md"
              title="Auxiliary Dial-in Port"
            >
              <div className="w-5 h-3 bg-slate-950 rounded-t-xs flex justify-between px-0.5 pt-0.5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="w-[1px] h-1.5 bg-amber-400" />
                ))}
              </div>
              <div className="w-3 h-1 bg-slate-400 rounded-t-xs" />
            </div>
          </div>

          {/* GE 0/0 and GE 0/1 GigabitEthernet Ports */}
          {['GE 0/0', 'GE 0/1'].map((label, idx) => {
            const portId = `GigabitEthernet0/${idx}`
            const port = device.ports.find((p) => p.id === portId || p.name === portId)
            const link = port ? links.find((l) => (l.fromDeviceId === device.id && l.fromPortId === port.id) || (l.toDeviceId === device.id && l.toPortId === port.id)) : undefined
            const isUp = isPowerOn && port?.adminStatus !== 'down' && link && link.status === 'up'

            return (
              <div key={label} className="flex flex-col items-center">
                <span className="text-[7.5px] font-bold font-mono text-slate-300 mb-0.5">{label}</span>
                <div
                  className="w-7 h-6 bg-slate-900 border border-slate-600 rounded-xs flex flex-col items-center justify-between p-0.5 relative shadow-md hover:border-amber-400 cursor-pointer"
                  title={`${portId} - ${isUp ? 'Connected (Up)' : 'Disconnected'}`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full absolute -top-1 right-0.5 border ${
                      isUp
                        ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_5px_#22c55e]'
                        : 'bg-slate-800 border-slate-700'
                    }`}
                  />
                  <div className="w-5 h-3 bg-slate-950 rounded-t-xs flex justify-between px-0.5 pt-0.5">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="w-[1px] h-1.5 bg-amber-400" />
                    ))}
                  </div>
                  <div className="w-3 h-1 bg-amber-400/80 rounded-t-xs" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Modular HWIC Expansion Slot Bay (HWIC 0) */}
        <div
          onClick={onSlotClick}
          className="flex-1 bg-[#10151c] border-2 border-orange-500 rounded ring-4 ring-orange-400/40 p-3 flex items-center justify-between cursor-pointer transition hover:border-orange-400 select-none shadow-xl"
          title={currentSlotModule ? t('Click to eject module') : `${t('Click to insert')} ${selectedModuleId}`}
        >
          {modDef ? (
            <div className="flex items-center justify-between w-full">
              {currentSlotModule?.includes('2T') ? (
                /* Cisco WIC-2T / HWIC-2T Dual Smart Serial Connectors */
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <span className="text-[7.5px] font-mono text-slate-300">Serial 0/0/0</span>
                    <div className="w-14 h-7 bg-slate-800 border-2 border-slate-500 rounded flex items-center justify-around px-1 shadow-inner">
                      <div className="w-2 h-2 rounded-full bg-slate-600" />
                      <div className="text-[7px] font-mono text-cyan-300 font-bold">26-PIN</div>
                      <div className="w-2 h-2 rounded-full bg-slate-600" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[7.5px] font-mono text-slate-300">Serial 0/0/1</span>
                    <div className="w-14 h-7 bg-slate-800 border-2 border-slate-500 rounded flex items-center justify-around px-1 shadow-inner">
                      <div className="w-2 h-2 rounded-full bg-slate-600" />
                      <div className="text-[7px] font-mono text-cyan-300 font-bold">26-PIN</div>
                      <div className="w-2 h-2 rounded-full bg-slate-600" />
                    </div>
                  </div>
                </div>
              ) : currentSlotModule === 'HWIC-4ESW' ? (
                /* 4-Port FastEthernet Switch Card */
                <div className="flex items-center gap-1.5 border border-yellow-500/70 p-1 bg-black/60 rounded">
                  {[0, 1, 2, 3].map((sw) => (
                    <div key={sw} className="w-6 h-5 bg-slate-900 border border-slate-600 rounded-xs flex flex-col justify-between p-0.5">
                      <div className="flex justify-between px-0.5 pt-0.5">
                        {[...Array(6)].map((_, pin) => (
                          <div key={pin} className="w-[1px] h-1 bg-amber-400" />
                        ))}
                      </div>
                      <span className="text-[6px] font-mono text-emerald-400 text-center">Fa{sw}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-slate-950 border border-slate-600 rounded flex items-center justify-center text-[9px] text-amber-400 font-bold">
                    RJ-45
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-200">{modDef.id}</div>
                </div>
              )}

              {/* Module Tag & Eject Button */}
              <div className="flex flex-col items-end gap-1">
                <span className="text-[9px] font-bold font-mono text-emerald-400">{modDef.id}</span>
                <span className="text-[9px] font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800 hover:bg-rose-900">
                  [{t('Eject')}]
                </span>
              </div>
            </div>
          ) : (
            /* Blank Metal Slot Cover Plate with Thumbscrews */
            <div className="flex items-center justify-between w-full px-2">
              <div className="w-3.5 h-3.5 rounded-full bg-slate-600 border border-slate-500 flex items-center justify-center shadow-inner">
                <div className="text-[9px] text-slate-900 font-bold">+</div>
              </div>
              <div className="text-[10px] text-orange-400 font-bold tracking-tight text-center">
                [ {t('Empty Slot - Click to Insert')} {selectedModuleId} ]
              </div>
              <div className="w-3.5 h-3.5 rounded-full bg-slate-600 border border-slate-500 flex items-center justify-center shadow-inner">
                <div className="text-[9px] text-slate-900 font-bold">+</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ==========================================
// 3. PC Desktop Physical Chassis (Rear Panel)
// ==========================================
export function PcChassis({
  device,
  links,
  isPowerOn,
  currentSlotModule,
  selectedModuleId,
  onSlotClick,
  onTogglePower,
}: PhysicalChassisProps) {
  const { t } = useI18n()
  const modDef = currentSlotModule ? MODULE_CATALOG[currentSlotModule] : null

  return (
    <div className="w-[420px] bg-gradient-to-b from-[#64748b] via-[#475569] to-[#334155] border-2 border-slate-500 rounded-md shadow-2xl p-4 select-none flex flex-col gap-4">
      {/* Top: ATX Power Supply Unit (PSU) */}
      <div className="bg-[#1e293b] p-3 rounded border border-slate-600 flex items-center justify-between shadow-inner">
        {/* AC Power Inlet Socket */}
        <div className="flex flex-col items-center">
          <div className="w-8 h-6 bg-slate-950 border border-slate-700 rounded flex flex-col justify-around items-center p-1">
            <div className="w-2 h-1 bg-amber-400/80 rounded-full" />
            <div className="flex gap-2">
              <div className="w-1.5 h-1 bg-amber-400/80" />
              <div className="w-1.5 h-1 bg-amber-400/80" />
            </div>
          </div>
          <span className="text-[7.5px] font-mono text-slate-400">115V / 230V</span>
        </div>

        {/* Power Rocker Switch & Green LED */}
        <div className="flex items-center gap-3 bg-slate-900/90 px-3 py-1.5 rounded border border-slate-700">
          <button
            type="button"
            onClick={onTogglePower}
            className={`w-7 h-5 rounded-xs border cursor-pointer flex items-center justify-center font-mono font-bold text-[9px] transition-all ${
              isPowerOn
                ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white shadow-[0_0_8px_#22c55e]'
                : 'bg-rose-900 hover:bg-rose-800 border-rose-700 text-slate-300'
            }`}
            title="Toggle PC Power"
          >
            {isPowerOn ? 'I' : 'O'}
          </button>
          <div
            className={`w-2.5 h-2.5 rounded-full border ${
              isPowerOn
                ? 'bg-emerald-400 border-emerald-300 shadow-[0_0_6px_#22c55e]'
                : 'bg-slate-700 border-slate-800'
            }`}
          />
        </div>

        {/* Power Supply Fan Exhaust Grill */}
        <div className="w-14 h-12 bg-slate-950 rounded-full border-2 border-slate-600 flex items-center justify-center p-1">
          <div className="w-8 h-8 rounded-full border border-slate-700 flex items-center justify-center animate-spin">
            <div className="w-2 h-2 rounded-full bg-slate-600" />
          </div>
        </div>
      </div>

      {/* Middle: Motherboard Rear I/O Panel */}
      <div className="bg-[#cbd5e1] border-2 border-slate-400 rounded p-2.5 flex items-center justify-between text-slate-800">
        {/* PS/2 Keyboard & Mouse Ports */}
        <div className="flex flex-col gap-1.5">
          <div className="w-4 h-4 rounded-full bg-[#7c3aed] border border-slate-600 shadow-xs" title="PS/2 Keyboard" />
          <div className="w-4 h-4 rounded-full bg-[#16a34a] border border-slate-600 shadow-xs" title="PS/2 Mouse" />
        </div>

        {/* Serial DB-9 & VGA Video */}
        <div className="flex flex-col gap-1.5">
          <div className="w-6 h-3 bg-[#0d9488] border border-slate-600 rounded-xs" title="Serial COM1" />
          <div className="w-6 h-3 bg-[#2563eb] border border-slate-600 rounded-xs" title="VGA Video" />
        </div>

        {/* USB 2.0 & Built-in FastEthernet Port */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <div className="w-4 h-2 bg-slate-900 border border-slate-600" />
            <div className="w-4 h-2 bg-slate-900 border border-slate-600" />
          </div>
          <div className="w-6 h-5 bg-slate-900 border border-slate-600 rounded-xs flex flex-col items-center justify-between p-0.5">
            <div className="flex justify-between w-full px-0.5 pt-0.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-[1px] h-1 bg-amber-400" />
              ))}
            </div>
            <div className="w-2 h-0.5 bg-amber-400" />
          </div>
        </div>

        {/* 3.5mm Audio Jacks (Mic, Line-out, Line-in) */}
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-full bg-[#f43f5e] border border-slate-600" title="Microphone In" />
          <div className="w-3 h-3 rounded-full bg-[#22c55e] border border-slate-600" title="Audio Out" />
          <div className="w-3 h-3 rounded-full bg-[#38bdf8] border border-slate-600" title="Line In" />
        </div>
      </div>

      {/* Bottom: Modular PCI Expansion Card Slot */}
      <div
        onClick={onSlotClick}
        className="bg-[#0f172a] border-2 border-orange-500 rounded ring-4 ring-orange-400/40 p-3 flex items-center justify-between cursor-pointer transition hover:border-orange-400 select-none shadow-xl"
        title={currentSlotModule ? t('Click to eject module') : `${t('Click to insert')} ${selectedModuleId}`}
      >
        {modDef ? (
          <div className="flex items-center justify-between w-full">
            {currentSlotModule === 'WPC300N' ? (
              /* Wireless Antenna Card */
              <div className="flex items-center gap-3">
                <div className="w-4 h-8 bg-gradient-to-t from-slate-900 to-slate-700 rounded-t-full border border-slate-600 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#22c55e]" />
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold text-emerald-400">WPC300N 802.11n</div>
                  <div className="text-[8px] text-slate-400">Linksys Wireless Adapter</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-6 h-5 bg-slate-800 border border-slate-500 rounded flex items-center justify-center text-[8px] text-amber-300 font-bold">
                  NIC
                </div>
                <div className="text-[10px] font-mono font-bold text-slate-200">{modDef.id}</div>
              </div>
            )}
            <span className="text-[9px] font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800">
              [{t('Eject')}]
            </span>
          </div>
        ) : (
          <div className="text-center w-full">
            <span className="text-[10px] text-orange-400 font-bold">
              [ {t('Empty Slot - Click to Insert')} {selectedModuleId} ]
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
