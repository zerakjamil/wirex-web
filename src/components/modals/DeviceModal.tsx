'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { getPrompt } from '@/simulator/ios/ciscoParser'
import { Cisco3DIcon } from '@/components/canvas/Cisco3DIcons'
import { useShallow } from 'zustand/react/shallow'
import type { NetworkDevice } from '@/types/network'
import { isValidIpv4 } from '@/simulator/protocols/ip'
import { parseIpv6WithPrefix } from '@/simulator/protocols/ipv6'
import { isValidTftpFileName, MAX_TFTP_FILE_BYTES } from '@/simulator/tftp'
import { isValidSnmpCommunity, isValidSnmpOid } from '@/simulator/snmp'
import { usePingFeedback } from './usePingFeedback'
import { PhoneGui } from './PhoneGui'
import { AsdmTab } from './AsdmTab'
import { getTerminalSuggestions } from './terminalSuggestions'
import {useWorkspaceStore} from '@/store/workspaceStore'
import {useI18n} from '@/i18n/useI18n'
import {PhysicalDeviceView} from './PhysicalDeviceView'
import { EmailServiceSettings } from './EmailServiceSettings'
import { EmailClientApp } from './EmailClientApp'

export function DeviceModal({ deviceId, onClose }: { deviceId: string; onClose: () => void }) {
  const {t}=useI18n()
  const devices = useNetworkStore(state=>state.devices)
  const [activeTab,setActiveTab] = useState<ReturnType<typeof useNetworkStore.getState>['activeTab']>(()=>useNetworkStore.getState().activeTab==='gui'?'cli':useNetworkStore.getState().activeTab)
  const device = devices.find((d) => d.id === deviceId)
  if (!device) return null
  if (device.type === 'phone') return <PhoneDeviceWindow deviceId={device.id} />

  const isEndDevice =
    device.type === 'pc' ||
    device.type === 'server' ||
    device.type === 'laptop' ||
    device.type === 'tablet' ||
    device.type === 'smartphone'

  return (
    <div className="pt-device-panel">
      <div className="bg-[#eff2f7] w-full h-full flex flex-col overflow-hidden font-sans">
        {/* Windows XP Style Dialog Title Bar */}
        <div className="pt-inner-device-title h-8 bg-[#5b9fb3] text-white px-3 flex items-center justify-between flex-shrink-0 border-b border-[#003cb3]">
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <Cisco3DIcon type={device.type} model={device.model} size={20} />
            </div>
            <span className="text-xs font-bold drop-shadow-xs truncate">
              {device.config.hostname || device.name} ({device.model})
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-5 h-5 bg-[#d9383a] hover:bg-[#e9484a] border border-[#b9282a] rounded-sm flex items-center justify-center text-xs text-white font-bold cursor-pointer transition shadow-xs"
              title="Close window (Escape)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Hardware Configuration Tabs with Generous Spacing */}
        <div className="flex items-end px-4 pt-2.5 bg-[#d6dfe7] border-b border-[#94a3b8] flex-shrink-0 gap-2 overflow-x-auto">
          {/* Physical Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('physical')}
            className={`min-h-[42px] px-5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'physical'
                ? 'bg-[#eff2f7] text-slate-900 border-[#94a3b8] -mb-[1px] z-10 shadow-sm'
                : 'bg-[#b8c7d6] text-slate-700 border-transparent hover:bg-[#c6d3e0]'
            }`}
          >
            {t('Physical')}
          </button>

          {/* Config Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`min-h-[42px] px-5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'config'
                ? 'bg-[#eff2f7] text-slate-900 border-[#94a3b8] -mb-[1px] z-10 shadow-sm'
                : 'bg-[#b8c7d6] text-slate-700 border-transparent hover:bg-[#c6d3e0]'
            }`}
          >
            {t('Config')}
          </button>

          {/* Services Tab (Server devices — service enablement: DNS, TFTP, UDP Echo, SNMP, Mail) */}
          {device.type === 'server' && (
            <button
              type="button"
              onClick={() => setActiveTab('services')}
              className={`min-h-[42px] px-5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'services'
                  ? 'bg-[#eff2f7] text-slate-900 border-[#94a3b8] -mb-[1px] z-10 shadow-sm'
                  : 'bg-[#b8c7d6] text-slate-700 border-transparent hover:bg-[#c6d3e0]'
              }`}
            >
              {t('Services')}
            </button>
          )}

          {/* CLI / Command Prompt Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('cli')}
            className={`min-h-[42px] px-5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'cli' || activeTab === 'gui'
                ? 'bg-[#eff2f7] text-slate-900 border-[#94a3b8] -mb-[1px] z-10 shadow-sm'
                : 'bg-[#b8c7d6] text-slate-700 border-transparent hover:bg-[#c6d3e0]'
            }`}
          >
            {isEndDevice ? t('Command Prompt') : t('CLI')}
          </button>

          {/* Desktop Tab (for End Devices) */}
          {isEndDevice && (
            <button
              type="button"
              onClick={() => setActiveTab('desktop')}
              className={`min-h-[42px] px-5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'desktop'
                  ? 'bg-[#eff2f7] text-slate-900 border-[#94a3b8] -mb-[1px] z-10 shadow-sm'
                  : 'bg-[#b8c7d6] text-slate-700 border-transparent hover:bg-[#c6d3e0]'
              }`}
            >
              {t('Desktop')}
            </button>
          )}

          {/* ASDM Tab (for ASA Security Appliances) */}
          {device.type === 'security' && (
            <button
              type="button"
              onClick={() => setActiveTab('asdm')}
              className={`min-h-[42px] px-5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'asdm'
                  ? 'bg-[#eff2f7] text-slate-900 border-[#94a3b8] -mb-[1px] z-10 shadow-sm'
                  : 'bg-[#b8c7d6] text-slate-700 border-transparent hover:bg-[#c6d3e0]'
              }`}
            >
              {t('ASDM')}
            </button>
          )}

          {/* Programming Tab */}
          <button
            type="button"
            onClick={() => alert('Programming Tab: Python and Blockly IoT scripting engine.')}
            className="min-h-[42px] px-5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 bg-[#b8c7d6] text-slate-700 border-transparent hover:bg-[#c6d3e0] cursor-pointer"
          >
            {t('Programming')}
          </button>

          {device.importedRunningConfig?.length ? <button type="button" onClick={() => setActiveTab('imported')}
            className={`min-h-[42px] px-5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 ${activeTab==='imported'?'bg-[#eff2f7] text-slate-900 border-[#94a3b8]':'bg-[#b8c7d6] text-slate-700 border-transparent'}`}>{t('Imported Config')}</button> : null}
          {/* Attributes Tab */}
          <button
            type="button"
            onClick={() => alert('Attributes Tab: Device power draw, rack placement and cost.')}
            className="min-h-[42px] px-5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 bg-[#b8c7d6] text-slate-700 border-transparent hover:bg-[#c6d3e0] cursor-pointer"
          >
            {t('Attributes')}
          </button>
        </div>

        {/* Tab Content Body with Spacious Padding */}
        <div className="flex-1 overflow-hidden p-3 sm:p-4 bg-[#eff2f7] flex flex-col">
          {(activeTab === 'cli' || activeTab === 'gui') && <CliTab deviceId={device.id} onSelectTab={setActiveTab} />}
          {activeTab === 'config' && <ConfigTab deviceId={device.id} />}
          {activeTab === 'services' && <ServicesTab deviceId={device.id} />}
          {activeTab === 'desktop' && <DesktopTab deviceId={device.id} />}
          {activeTab === 'physical' && <PhysicalTab deviceId={device.id} />}
          {activeTab === 'asdm' && <AsdmTab deviceId={device.id} />}
          {activeTab === 'imported' && <div className="flex-1 min-h-0 overflow-auto bg-white text-slate-900 p-4">
            <p className="text-sm mb-3">Original configuration from the imported file. Preserved commands may include features this simulator does not execute.</p>
            <h3 className="font-bold text-sm">Running configuration at import</h3><pre className="text-xs font-mono whitespace-pre-wrap p-3">{device.importedRunningConfig?.join('\n')}</pre>
            <h3 className="font-bold text-sm">Startup configuration at import</h3><pre className="text-xs font-mono whitespace-pre-wrap p-3">{device.importedStartupConfig?.join('\n')}</pre>
          </div>}
        </div>
      </div>
    </div>
  )
}

function PhoneDeviceWindow({deviceId}: {deviceId:string}) {
  const {t}=useI18n()
  const [tab,setTab]=useState<'gui'|'physical'|'config'>('gui')
  const device=useNetworkStore(state=>state.devices.find(device=>device.id===deviceId))
  if(!device)return null
  return <section className="pt-phone-content" aria-label={`${device.name} phone window`}>
    <div className="phone-window-tabs" role="tablist">{(['physical','config','gui'] as const).map(value=><button key={value} role="tab" aria-selected={tab===value} onClick={()=>setTab(value)}>{value==='gui'?'GUI':value==='physical'?t('Physical'):t('Config')}</button>)}</div>
    <div className="phone-window-body">{tab==='gui'?<PhoneGui deviceId={deviceId}/>:tab==='physical'?<PhysicalTab deviceId={deviceId}/>:<ConfigTab deviceId={deviceId}/>}</div>
  </section>
}

export function CliTab({ deviceId, onSelectTab }: { deviceId: string; onSelectTab?: (tab: ReturnType<typeof useNetworkStore.getState>['activeTab'])=>void }) {
  const {t}=useI18n()
  const { devices, setActiveTab: selectGlobalTab } = useNetworkStore(useShallow(state => ({
    devices: state.devices, setActiveTab: state.setActiveTab,
  })))
  const setActiveTab=onSelectTab || selectGlobalTab
  const device = devices.find((d) => d.id === deviceId)
  if (!device) return null

  const isEndDevice =
    device.type === 'pc' ||
    device.type === 'server' ||
    device.type === 'laptop' ||
    device.type === 'tablet' ||
    device.type === 'smartphone'

  if (device.power === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-black rounded-md border-2 border-slate-700 p-6 font-mono text-center">
        <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-rose-500 mb-3">
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        </div>
        <div className="text-rose-500 font-bold text-sm mb-1">{t('Device is Powered Off')}</div>
        <p className="text-slate-400 text-xs max-w-sm mb-4">
          {t('The device is currently powered off. Switch to the Physical tab and click the power switch to turn on the chassis.')}
        </p>
        <button
          type="button"
          onClick={() => setActiveTab('physical')}
          className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded text-xs font-semibold cursor-pointer"
        >
          {t('Go to Physical Tab')}
        </button>
      </div>
    )
  }

  return <CliSession key={device.id} device={device} isEndDevice={isEndDevice} />
}

function CliSession({ device, isEndDevice }: { device: NetworkDevice; isEndDevice: boolean }) {
  const [inputVal, setInputVal] = useState('')
  const [historyLines, setHistoryLines] = useState<Array<{ text: string; isInput?: boolean }>>(() => {
    if (isEndDevice) {
      return [
        { text: 'Microsoft Windows [Version 10.0.19044.2006]' },
        { text: '(c) Microsoft Corporation. All rights reserved.\n' },
      ]
    }
    return [
      { text: 'System Bootstrap, Version 15.1(4)M4, RELEASE SOFTWARE (fc1)' },
      { text: `Cisco ${device.model} processor with 512MB of memory.` },
      { text: 'Press RETURN to get started!\n' },
    ]
  })

  const [historyIndex, setHistoryIndex] = useState(-1)
  const appendOutput = useCallback((text: string) => setHistoryLines(lines => [...lines, { text }]), [])
  const feedback = usePingFeedback(appendOutput)
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [historyLines])

  const prompt = isEndDevice ? 'C:\\>' : getPrompt(device)

  const handleRunCommand = (cmdToRun?: string) => {
    const raw = cmdToRun !== undefined ? cmdToRun : inputVal
    const trimmed = raw.trim()

    if (!trimmed) {
      setHistoryLines((prev) => [...prev, { text: `${prompt} `, isInput: true }])
      setInputVal('')
      return
    }

    setHistoryLines((prev) => [...prev, { text: `${prompt} ${trimmed}`, isInput: true }])

    if (isEndDevice) {
      // PC command prompt handler
      const parts = trimmed.split(/\s+/)
      const root = parts[0].toLowerCase()

      if (root === 'ping') {
        const targetIp = parts[1]
        if (!targetIp) {
          setHistoryLines((prev) => [...prev, { text: 'Usage: ping <ip-address>' }])
        } else {
          feedback.ping(device.id, targetIp)
        }
      } else if (root === 'ipconfig') {
        if(parts[1]==='/renew'){setHistoryLines(prev=>[...prev,{text:useNetworkStore.getState().requestDhcp(device.id)}]);setInputVal('');setHistoryIndex(-1);return}
        const port = device.ports[0]
        let out = '\nWindows IP Configuration\n\nEthernet adapter Ethernet0:\n'
        out += `   Connection-specific DNS Suffix  . :\n`
        out += `   Link-local IPv6 Address . . . . . : fe80::d0b4:74c3:9115\n`
        out += `   IPv4 Address. . . . . . . . . . . : ${port.ipAddress || '0.0.0.0'}\n`
        out += `   Subnet Mask . . . . . . . . . . . : ${port.subnetMask || '0.0.0.0'}\n`
        out += `   Default Gateway . . . . . . . . . : ${device.config.defaultGateway || '0.0.0.0'}\n`
        setHistoryLines((prev) => [...prev, { text: out }])
      } else if (root === 'arp' && (parts[1] === '-a' || !parts[1])) {
        let out = '\nInterface: 192.168.1.10 --- 0xb\n  Internet Address      Physical Address      Type\n'
        for (const a of device.arpTable) {
          out += `  ${a.ipAddress.padEnd(22)}${a.macAddress.padEnd(22)}dynamic\n`
        }
        if (device.arpTable.length === 0) {
          out += '  No ARP entries found.\n'
        }
        setHistoryLines((prev) => [...prev, { text: out }])
      } else if (root === 'cls') {
        setHistoryLines([])
      } else {
        setHistoryLines((prev) => [
          ...prev,
          { text: `'${parts[0]}' is not recognized as an internal or external command.` },
        ])
      }
    } else {
      // Cisco IOS command parser
      const output = feedback.ios(device.id, trimmed)
      if (output) {
        setHistoryLines((prev) => [...prev, { text: output }])
      }
    }

    setInputVal('')
    setHistoryIndex(-1)
  }

  const runQuickCiscoCommand = (cmd: string) => {
    const isConfig = prompt.includes('(config') || prompt.includes('-config')
    if (isConfig && (cmd.startsWith('show') || cmd.startsWith('sh') || cmd.startsWith('write') || cmd === 'wr')) {
      handleRunCommand(`do ${cmd}`)
    } else {
      handleRunCommand(cmd)
    }
  }

  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [dismissedSuggestions, setDismissedSuggestions] = useState(false)

  const { suggestions, ghostText } = useMemo(() => {
    if (dismissedSuggestions || !inputVal.trim()) return { suggestions: [], ghostText: '' }
    return getTerminalSuggestions(inputVal, prompt, isEndDevice)
  }, [inputVal, prompt, isEndDevice, dismissedSuggestions])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRunCommand()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDismissedSuggestions(true)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (suggestions.length > 0) {
        const topCmd = suggestions[selectedSuggestionIndex]?.command
        if (topCmd) {
          const filled = topCmd.includes('<') ? topCmd.split('<')[0] : topCmd
          setInputVal(filled)
          return
        }
      }
      handleTabCompletion()
    } else if (e.key === 'ArrowRight') {
      if (ghostText && inputRef.current && inputRef.current.selectionStart === inputVal.length) {
        e.preventDefault()
        setInputVal(inputVal + ghostText)
        return
      }
    } else if (e.key === 'ArrowUp') {
      if (suggestions.length > 0) {
        e.preventDefault()
        setSelectedSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
        return
      }
      e.preventDefault()
      if (device.cliHistory.length > 0) {
        const nextIdx = historyIndex + 1
        if (nextIdx < device.cliHistory.length) {
          setHistoryIndex(nextIdx)
          setInputVal(device.cliHistory[device.cliHistory.length - 1 - nextIdx])
        }
      }
    } else if (e.key === 'ArrowDown') {
      if (suggestions.length > 0) {
        e.preventDefault()
        setSelectedSuggestionIndex((prev) => (prev + 1) % suggestions.length)
        return
      }
      e.preventDefault()
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1
        setHistoryIndex(nextIdx)
        setInputVal(device.cliHistory[device.cliHistory.length - 1 - nextIdx])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setInputVal('')
      }
    } else if (e.altKey && e.key >= '1' && e.key <= '5') {
      const num = parseInt(e.key, 10) - 1
      if (suggestions[num]) {
        e.preventDefault()
        const topCmd = suggestions[num].command
        const filled = topCmd.includes('<') ? topCmd.split('<')[0] : topCmd
        setInputVal(filled)
      }
    }
  }

  const handleTabCompletion = () => {
    const lower = inputVal.toLowerCase().trim()
    if (lower === 'sh') setInputVal('show ')
    else if (lower === 'sh ip') setInputVal('show ip ')
    else if (lower === 'sh ip int' || lower === 'sh ip in') setInputVal('show ip interface brief')
    else if (lower === 'sh run') setInputVal('show running-config')
    else if (lower === 'sh vl' || lower === 'sh vlan') setInputVal('show vlan brief')
    else if (lower === 'conf' || lower === 'con') setInputVal('configure terminal')
    else if (lower === 'en') setInputVal('enable')
    else if (lower === 'int') setInputVal('interface ')
    else if (lower === 'int fa' || lower === 'int f') setInputVal('interface FastEthernet0/')
    else if (lower === 'int g' || lower === 'int gi') setInputVal('interface GigabitEthernet0/')
    else if (lower === 'no sh') setInputVal('no shutdown')
    else if (lower === 'sw mo') setInputVal('switchport mode ')
    else if (lower === 'sw acc') setInputVal('switchport access vlan ')
    else if (lower === 'ip add') setInputVal('ip address ')
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="flex-1 flex flex-col h-full bg-[#0a0b0d] rounded-lg border-2 border-slate-700 font-mono text-sm overflow-hidden shadow-2xl cursor-text select-text"
    >
      {/* Scrollable Terminal Output Screen */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 text-slate-100 font-mono leading-relaxed select-text">
        {historyLines.map((line, idx) => (
          <div
            key={idx}
            className={
              line.isInput
                ? 'text-white font-bold'
                : 'text-slate-200 whitespace-pre-wrap font-mono'
            }
          >
            {line.text}
          </div>
        ))}

        {/* Authentic Inline Terminal Prompt Line */}
        <div className="relative flex items-center font-mono text-sm leading-6 min-h-[26px] mt-0.5">
          <span className="text-emerald-400 font-bold mr-2 select-none whitespace-pre">
            {prompt}
          </span>
          <div className="relative flex items-center flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value)
                setDismissedSuggestions(false)
                setSelectedSuggestionIndex(0)
              }}
              onKeyDown={handleKeyDown}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="Cisco Terminal Command Input"
              className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-transparent border-none outline-none z-10 font-mono text-sm cursor-text focus:outline-none focus:ring-0"
              style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
            />
            <span className="text-white whitespace-pre font-mono text-sm">{inputVal}</span>
            {ghostText && (
              <span className="text-slate-500 font-mono text-sm pointer-events-none select-none opacity-80 whitespace-pre">
                {ghostText}
              </span>
            )}
            <span className="inline-block w-2.5 h-4.5 bg-emerald-400 ml-0.5 align-middle animate-[pulse_1s_infinite] shadow-[0_0_8px_#22c55e]" />
          </div>
        </div>

        {/* Interactive Cisco Command Suggestions (Matching User Terminal Experience) */}
        {suggestions.length > 0 && (
          <div className="mt-2 mb-1 p-2 bg-[#10141e] border border-slate-700/80 rounded-md font-mono text-xs shadow-2xl animate-in fade-in select-none">
            <div className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center justify-between border-b border-slate-800 pb-1">
              <span className="text-emerald-400 font-bold">Cisco Command Suggestions:</span>
              <span className="text-slate-500 text-[9px]">[Alt+1-5]: pick | Tab / →: complete | Esc: close</span>
            </div>
            <div className="space-y-1 mt-1">
              {suggestions.map((sug, idx) => {
                const isSelected = idx === selectedSuggestionIndex
                return (
                  <div
                    key={`${sug.command}-${idx}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      const completed = sug.command.includes('<') ? sug.command.split('<')[0] : sug.command
                      setInputVal(completed)
                      inputRef.current?.focus()
                    }}
                    className={`px-2 py-1 rounded flex items-center justify-between cursor-pointer transition ${
                      isSelected
                        ? 'bg-sky-950 text-sky-200 border border-sky-600/70 font-semibold shadow-xs'
                        : 'hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-amber-400 font-bold text-[11px]">[{idx + 1}]</span>
                      <span className="text-white font-mono">{sug.command}</span>
                      {idx === 0 && (
                        <span className="text-[10px] text-slate-400 font-sans hidden sm:inline">
                          (→: first | Tab: complete)
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-sans truncate max-w-[320px] ml-2">
                      {sug.description}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div ref={terminalEndRef} />
      </div>

      {/* Mobile & Touch Quick-Command Study Bar */}
      <div className="bg-[#0b0f19] border-t border-slate-800 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto select-none">
        <span className="text-[10px] text-indigo-400 font-mono font-semibold uppercase tracking-wider flex-shrink-0 mr-1">
          Quick CLI:
        </span>
        {isEndDevice ? (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRunCommand('ipconfig') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-sky-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              ipconfig
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRunCommand('ipconfig /renew') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-sky-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              ipconfig /renew
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRunCommand('arp -a') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-cyan-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              arp -a
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setInputVal('ping '); inputRef.current?.focus() }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-emerald-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              ping ...
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRunCommand('enable') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-emerald-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              en
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRunCommand('configure terminal') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-emerald-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              conf t
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runQuickCiscoCommand('show ip interface brief') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-sky-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              sh ip int br
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runQuickCiscoCommand('show running-config') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-sky-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              sh run
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runQuickCiscoCommand('show ip route') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-sky-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              sh ip route
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runQuickCiscoCommand('show vlan brief') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-sky-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              sh vlan
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setInputVal('interface FastEthernet0/'); inputRef.current?.focus() }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-amber-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              int Fa0/...
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRunCommand('no shutdown') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-emerald-400 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              no shut
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRunCommand('exit') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-slate-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              exit
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); runQuickCiscoCommand('write memory') }}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 active:bg-indigo-950 text-purple-300 rounded border border-slate-700/80 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
            >
              wr
            </button>
          </>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (device.cliHistory.length > 0) {
              const nextIdx = historyIndex + 1
              if (nextIdx < device.cliHistory.length) {
                setHistoryIndex(nextIdx)
                setInputVal(device.cliHistory[device.cliHistory.length - 1 - nextIdx])
              }
            }
          }}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs font-mono font-bold cursor-pointer"
          title="Previous command"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (historyIndex > 0) {
              const nextIdx = historyIndex - 1
              setHistoryIndex(nextIdx)
              setInputVal(device.cliHistory[device.cliHistory.length - 1 - nextIdx])
            } else if (historyIndex === 0) {
              setHistoryIndex(-1)
              setInputVal('')
            }
          }}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs font-mono font-bold cursor-pointer"
          title="Next command"
        >
          ↓
        </button>
      </div>

      {/* Spacious, Elegant Terminal Control Bar (No Cramped Squeezed Boxes) */}
      <div className="bg-[#0f172a] border-t border-slate-800 px-4 py-2.5 flex items-center justify-between flex-shrink-0 select-none">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>IOS 15.1 Console (wireX Engine)</span>
        </div>

        {/* Clean, Spacious Shortcut Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleTabCompletion()
            }}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-amber-300 rounded-md border border-slate-700 text-xs font-mono font-semibold cursor-pointer transition shadow-xs"
            title="Auto-complete command (Tab key)"
          >
            Tab ⇥
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleRunCommand('?')
            }}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-cyan-300 rounded-md border border-slate-700 text-xs font-mono font-semibold cursor-pointer transition shadow-xs"
            title="Context-sensitive command help"
          >
            ? Help
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setHistoryLines((prev) => [...prev, { text: `${prompt} ^C`, isInput: true }])
              setInputVal('')
              inputRef.current?.focus()
            }}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-rose-300 rounded-md border border-slate-700 text-xs font-mono font-semibold cursor-pointer transition shadow-xs"
            title="Interrupt current command (Ctrl+C)"
          >
            Ctrl+C
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setHistoryLines([])
              inputRef.current?.focus()
            }}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-300 rounded-md border border-slate-700 text-xs font-mono font-semibold cursor-pointer transition shadow-xs"
            title="Clear terminal screen"
          >
            Clear Screen
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfigTab({ deviceId }: { deviceId: string }) {
  const device = useNetworkStore(state => state.devices.find(item => item.id === deviceId))
  return device ? <ConfigSession key={device.id} device={device} /> : null
}

function ConfigSession({ device }: { device: NetworkDevice }) {
  const {t}=useI18n()
  const { updatePortConfig, updateDeviceConfig } = useNetworkStore(useShallow(state => ({
    updatePortConfig: state.updatePortConfig, updateDeviceConfig: state.updateDeviceConfig,
  })))

  const [selectedPortId, setSelectedPortId] = useState(device.ports[0]?.id || '')
  const selectedPort = device.ports.find((p) => p.id === selectedPortId)
  const [ipv6Draft, setIpv6Draft] = useState<{ portId: string; text: string } | null>(null)
  const selectedIpv6 = selectedPort?.ipv6Addresses?.[0]
  const selectedIpv6Value = ipv6Draft && ipv6Draft.portId === selectedPort?.id ? ipv6Draft.text : selectedIpv6 ? `${selectedIpv6.address}/${selectedIpv6.prefixLength}` : ''

  return (
    <div className="flex-1 flex flex-col md:flex-row gap-4 h-full overflow-hidden bg-white p-4 rounded-xl border border-[#94a3b8] shadow-xs">
      {/* Interface List Sidebar with Generous Spacing */}
      <div className="w-full md:w-64 bg-[#f8fafc] rounded-xl border border-[#cbd5e1] p-3 flex flex-col flex-shrink-0">
        <div className="text-xs font-bold text-slate-700 px-3 py-2 uppercase tracking-wider border-b border-slate-200 mb-2">
          {t('Interfaces')}
        </div>
        <div className="space-y-2 mt-1 overflow-y-auto flex-1 pr-1">
          {device.ports.map((port) => (
            <button
              key={port.id}
              type="button"
              onClick={() => setSelectedPortId(port.id)}
              className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg text-left text-xs font-medium transition cursor-pointer flex items-center justify-between shadow-2xs ${
                selectedPortId === port.id
                  ? 'bg-[#0284c7] text-white shadow-sm font-bold ring-1 ring-sky-400'
                  : 'text-slate-800 bg-white hover:bg-[#e2e8f0] border border-slate-200'
              }`}
            >
              <span className="truncate">{port.name}</span>
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  port.status === 'up' && port.adminStatus === 'up' ? 'bg-emerald-500 shadow-[0_0_6px_#22c55e]' : 'bg-rose-500'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Selected Interface Settings */}
      {selectedPort && (
        <div className="flex-1 bg-white rounded-xl border border-[#cbd5e1] p-6 overflow-y-auto space-y-6">
          <div className="border-b border-[#e2e8f0] pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800">{selectedPort.name}</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">MAC: {selectedPort.macAddress}</p>
            </div>

            {/* Port Status Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-700 font-semibold">{t('Port Status:')}</span>
              <button
                type="button"
                onClick={() =>
                  updatePortConfig(device.id, selectedPort.id, {
                    adminStatus: selectedPort.adminStatus === 'up' ? 'down' : 'up',
                  })
                }
                className={`min-h-[40px] px-4 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs ${
                  selectedPort.adminStatus === 'up'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                }`}
              >
                {selectedPort.adminStatus === 'up' ? t('Port On') : t('Port Off')}
              </button>
            </div>
          </div>

          {/* IP Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('IPv4 Address')}</label>
              <input
                type="text"
                value={selectedPort.ipAddress || ''}
                placeholder="e.g. 192.168.1.1"
                onChange={(e) =>
                  updatePortConfig(device.id, selectedPort.id, {
                    ipAddress: e.target.value.trim(),
                  })
                }
                className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('Subnet Mask')}</label>
              <input
                type="text"
                value={selectedPort.subnetMask || ''}
                placeholder="e.g. 255.255.255.0"
                onChange={(e) =>
                  updatePortConfig(device.id, selectedPort.id, {
                    subnetMask: e.target.value.trim(),
                  })
                }
                className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('IPv6 Address/Prefix')}</label>
              <input
                type="text"
                value={selectedIpv6Value}
                placeholder="e.g. 2001:db8:1::1/64"
                onChange={(e) => {
                  const raw = e.target.value
                  setIpv6Draft({ portId: selectedPort.id, text: raw })
                  const trimmed = raw.trim()
                  if (trimmed === '') {
                    updatePortConfig(device.id, selectedPort.id, { ipv6Addresses: undefined })
                    return
                  }
                  const parsed = parseIpv6WithPrefix(trimmed)
                  if (parsed) updatePortConfig(device.id, selectedPort.id, { ipv6Addresses: [{ address: parsed.address, prefixLength: parsed.prefixLength }] })
                }}
                onBlur={() => setIpv6Draft((current) => (current && current.portId === selectedPort.id ? null : current))}
                className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
              />
            </div>
          </div>

          {/* Switchport VLAN settings */}
          {device.type === 'switch' && (
            <div className="pt-4 border-t border-[#e2e8f0]">
              <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">{t('Switchport Settings')}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">{t('Port Mode')}</label>
                  <select
                    value={selectedPort.portMode || 'access'}
                    onChange={(e) =>
                      updatePortConfig(device.id, selectedPort.id, {
                        portMode: e.target.value as 'access' | 'trunk',
                      })
                    }
                    className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs text-slate-800"
                  >
                    <option value="access">{t('Access')}</option>
                    <option value="trunk">{t('Trunk')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">{t('Access VLAN')}</label>
                  <input
                    type="number"
                    value={selectedPort.vlan || 1}
                    min={1}
                    max={4094}
                    onChange={(e) =>
                      updatePortConfig(device.id, selectedPort.id, {
                        vlan: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Default Gateway for End Devices */}
          {(device.type === 'pc' || device.type === 'server') && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('Default Gateway')}</label>
              <input
                type="text"
                value={device.config.defaultGateway || ''}
                placeholder="e.g. 192.168.1.1"
                onChange={(e) => updateDeviceConfig(device.id, { defaultGateway: e.target.value.trim() })}
                className="w-full min-h-[40px] bg-[#f8fafc] border border-[#94a3b8] rounded px-3 py-1.5 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none"
              />
            </div>
          )}

        </div>
      )}
    </div>
  )
}

function ServicesTab({ deviceId }: { deviceId: string }) {
  const device = useNetworkStore(state => state.devices.find(item => item.id === deviceId))
  return device ? <ServicesSession key={device.id} device={device} /> : null
}

function ServicesSession({ device }: { device: NetworkDevice }) {
  const {t}=useI18n()
  const { updateDeviceConfig } = useNetworkStore(useShallow(state => ({ updateDeviceConfig: state.updateDeviceConfig })))
  const [dnsDraftDomain, setDnsDraftDomain] = useState('')
  const [dnsDraftIp, setDnsDraftIp] = useState('')
  const [dnsDraftError, setDnsDraftError] = useState('')
  const [udpEchoPortDraft, setUdpEchoPortDraft] = useState('7')
  const [udpEchoPortError, setUdpEchoPortError] = useState('')
  const [tftpFileDraftName, setTftpFileDraftName] = useState('')
  const [tftpFileDraftContents, setTftpFileDraftContents] = useState('')
  const [tftpFileError, setTftpFileError] = useState('')
  const [snmpCommunityDraft, setSnmpCommunityDraft] = useState('classroom')
  const [snmpConfigError, setSnmpConfigError] = useState('')
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white p-4 rounded-xl border border-[#94a3b8] shadow-xs space-y-4">
            <>
            <section className="pt-4 border-t border-[#e2e8f0] space-y-3" aria-labelledby={`snmp-config-${device.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 id={`snmp-config-${device.id}`} className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('SNMP Service')}</h4>
                  <p className="mt-1 text-xs text-slate-500">{t('SNMP v2c read-only communities')}</p>
                </div>
                <label className="inline-flex min-h-[40px] items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={(device.config.snmpCommunities?.length ?? 0) > 0} onChange={event => updateDeviceConfig(device.id, { snmpCommunities: event.target.checked ? device.config.snmpCommunities?.length ? device.config.snmpCommunities : ['classroom'] : [] })} className="h-4 w-4 accent-sky-600" />
                  {t('Enable SNMP Service')}
                </label>
              </div>
              <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end" onSubmit={event => {
                event.preventDefault()
                const community = snmpCommunityDraft.trim()
                if (!isValidSnmpCommunity(community)) {
                  setSnmpConfigError(t('Use 1 to 64 letters, numbers, periods, underscores or hyphens.'))
                  return
                }
                const communities = device.config.snmpCommunities ?? []
                updateDeviceConfig(device.id, { snmpCommunities: [...new Set([...communities, community])] })
                setSnmpCommunityDraft('')
                setSnmpConfigError('')
              }}>
                <label className="block text-xs font-semibold text-slate-700">{t('Read-only community')}<input value={snmpCommunityDraft} onChange={event => setSnmpCommunityDraft(event.target.value)} maxLength={64} autoComplete="off" className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" /></label>
                <button type="submit" className="min-h-[40px] rounded border border-sky-700 bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">{t('Add community')}</button>
              </form>
              {snmpConfigError && <p role="alert" className="text-xs font-semibold text-rose-700">{snmpConfigError}</p>}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">{t('System contact')}<input value={device.config.snmpSystemContact ?? ''} maxLength={255} onChange={event => updateDeviceConfig(device.id, { snmpSystemContact: event.target.value })} className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 text-xs" /></label>
                <label className="block text-xs font-semibold text-slate-700">{t('System location')}<input value={device.config.snmpSystemLocation ?? ''} maxLength={255} onChange={event => updateDeviceConfig(device.id, { snmpSystemLocation: event.target.value })} className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 text-xs" /></label>
              </div>
              <div className="flex flex-wrap gap-2">{(device.config.snmpCommunities ?? []).map(community => <span key={community} className="inline-flex items-center gap-2 rounded border border-slate-300 px-2 py-1 font-mono text-xs">{community} · RO<button type="button" aria-label={`${t('Remove')} ${community}`} onClick={() => updateDeviceConfig(device.id, { snmpCommunities: (device.config.snmpCommunities ?? []).filter(item => item !== community) })} className="font-sans font-bold text-rose-700">×</button></span>)}</div>
              {(device.config.snmpCommunities ?? []).length === 0 && <p className="text-xs text-slate-500">{t('No SNMP communities configured.')}</p>}
            </section>
            <section className="pt-4 border-t border-[#e2e8f0] space-y-4" aria-labelledby={`dns-config-${device.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 id={`dns-config-${device.id}`} className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('DNS Service')}</h4>
                  <p className="text-xs text-slate-500 mt-1">{t('DNS Records')}</p>
                </div>
                <label className="inline-flex min-h-[40px] items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={device.config.dnsServiceEnabled === true}
                    onChange={event => updateDeviceConfig(device.id, { dnsServiceEnabled: event.target.checked })}
                    className="h-4 w-4 accent-sky-600"
                  />
                  {t('Enable DNS Service')}
                </label>
              </div>

              <form
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end"
                onSubmit={event => {
                  event.preventDefault()
                  const domain = dnsDraftDomain.trim().toLowerCase().replace(/\.$/, '')
                  const labels = domain.split('.')
                  const validDomain = domain.length <= 253 && labels.every(label => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
                  if (!validDomain || !isValidIpv4(dnsDraftIp.trim())) {
                    setDnsDraftError(t('Enter a valid domain and IPv4 address.'))
                    return
                  }
                  const current = device.config.dnsRecords ?? []
                  updateDeviceConfig(device.id, { dnsRecords: [...current.filter(record => record.domain.toLowerCase() !== domain), { domain, ip: dnsDraftIp.trim() }] })
                  setDnsDraftDomain('')
                  setDnsDraftIp('')
                  setDnsDraftError('')
                }}
              >
                <label className="block text-xs font-semibold text-slate-700">
                  {t('Domain name')}
                  <input value={dnsDraftDomain} onChange={event => setDnsDraftDomain(event.target.value)} placeholder="www.example.test" className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  {t('IPv4 address')}
                  <input value={dnsDraftIp} onChange={event => setDnsDraftIp(event.target.value)} placeholder="192.168.1.100" className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" />
                </label>
                <button type="submit" className="min-h-[40px] rounded border border-sky-700 bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">{t('Add record')}</button>
              </form>
              {dnsDraftError && <p role="alert" className="text-xs font-semibold text-rose-700">{dnsDraftError}</p>}

              <div className="space-y-2">
                {(device.config.dnsRecords ?? []).map((record, index) => (
                  <div key={`${record.domain}-${index}`} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center rounded border border-slate-200 p-2">
                    <input aria-label={`${t('Domain name')} ${index + 1}`} value={record.domain} onChange={event => {
                      const dnsRecords = [...(device.config.dnsRecords ?? [])]
                      dnsRecords[index] = { ...record, domain: event.target.value }
                      updateDeviceConfig(device.id, { dnsRecords })
                    }} className="min-h-[38px] min-w-0 rounded border border-slate-300 px-2 font-mono text-xs" />
                    <input aria-label={`${t('IPv4 address')} ${index + 1}`} value={record.ip} onChange={event => {
                      const dnsRecords = [...(device.config.dnsRecords ?? [])]
                      dnsRecords[index] = { ...record, ip: event.target.value }
                      updateDeviceConfig(device.id, { dnsRecords })
                    }} className="min-h-[38px] min-w-0 rounded border border-slate-300 px-2 font-mono text-xs" />
                    <button type="button" onClick={() => updateDeviceConfig(device.id, { dnsRecords: (device.config.dnsRecords ?? []).filter((_, itemIndex) => itemIndex !== index) })} className="min-h-[38px] rounded border border-slate-300 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50">{t('Remove')}</button>
                  </div>
                ))}
              </div>
            </section>
            <section className="pt-4 border-t border-[#e2e8f0] space-y-3" aria-labelledby={`udp-echo-config-${device.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 id={`udp-echo-config-${device.id}`} className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('UDP Echo Service')}</h4>
                  <p className="text-xs text-slate-500 mt-1">{t('UDP Echo listens on configured ports and returns the received payload.')}</p>
                </div>
                <label className="inline-flex min-h-[40px] items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={device.config.udpEchoServiceEnabled === true} onChange={event => updateDeviceConfig(device.id, { udpEchoServiceEnabled: event.target.checked, udpEchoPorts: device.config.udpEchoPorts ?? [7] })} className="h-4 w-4 accent-sky-600" />
                  {t('Enable UDP Echo')}
                </label>
              </div>
              <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end" onSubmit={event => {
                event.preventDefault()
                const port = Number(udpEchoPortDraft)
                if (!Number.isInteger(port) || port < 1 || port > 65535) {
                  setUdpEchoPortError(t('Enter a UDP port from 1 to 65535.'))
                  return
                }
                const ports = device.config.udpEchoPorts ?? [7]
                updateDeviceConfig(device.id, { udpEchoPorts: [...new Set([...ports, port])].sort((a, b) => a - b) })
                setUdpEchoPortDraft('')
                setUdpEchoPortError('')
              }}>
                <label className="block text-xs font-semibold text-slate-700">{t('UDP listening port')}<input aria-label={t('UDP listening port')} type="number" min={1} max={65535} value={udpEchoPortDraft} onChange={event => setUdpEchoPortDraft(event.target.value)} className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" /></label>
                <button type="submit" className="min-h-[40px] rounded border border-sky-700 bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">{t('Add port')}</button>
              </form>
              {udpEchoPortError && <p role="alert" className="text-xs font-semibold text-rose-700">{udpEchoPortError}</p>}
              <div className="flex flex-wrap gap-2">{(device.config.udpEchoPorts ?? [7]).map(port => <span key={port} className="inline-flex items-center gap-2 rounded border border-slate-300 px-2 py-1 font-mono text-xs">UDP/{port}<button type="button" aria-label={`${t('Remove')} UDP ${port}`} onClick={() => updateDeviceConfig(device.id, { udpEchoPorts: (device.config.udpEchoPorts ?? [7]).filter(item => item !== port) })} className="font-sans font-bold text-rose-700">×</button></span>)}</div>
            </section>
            <section className="pt-4 border-t border-[#e2e8f0] space-y-3" aria-labelledby={`tftp-config-${device.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 id={`tftp-config-${device.id}`} className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('TFTP Service')}</h4>
                  <p className="text-xs text-slate-500 mt-1">{t('TFTP serves files in 512-byte blocks over UDP port 69.')}</p>
                </div>
                <label className="inline-flex min-h-[40px] items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={device.config.tftpServiceEnabled === true} onChange={event => updateDeviceConfig(device.id, { tftpServiceEnabled: event.target.checked })} className="h-4 w-4 accent-sky-600" />
                  {t('Enable TFTP Service')}
                </label>
              </div>
              <form className="grid grid-cols-1 gap-2" onSubmit={event => {
                event.preventDefault()
                const name = tftpFileDraftName.trim()
                const contents = tftpFileDraftContents
                if (!isValidTftpFileName(name) || new TextEncoder().encode(contents).byteLength > MAX_TFTP_FILE_BYTES) {
                  setTftpFileError(t('Enter a valid filename and a UTF-8 file up to 65536 bytes.'))
                  return
                }
                updateDeviceConfig(device.id, { tftpFiles: [...(device.config.tftpFiles ?? []).filter(file => file.name !== name), { name, contents }] })
                setTftpFileDraftName('')
                setTftpFileDraftContents('')
                setTftpFileError('')
              }}>
                <label className="block text-xs font-semibold text-slate-700">{t('Filename')}<input value={tftpFileDraftName} onChange={event => setTftpFileDraftName(event.target.value)} placeholder="startup.cfg" className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" /></label>
                <label className="block text-xs font-semibold text-slate-700">{t('File contents')}<textarea value={tftpFileDraftContents} onChange={event => setTftpFileDraftContents(event.target.value)} rows={4} className="mt-1 w-full min-h-[96px] resize-y rounded border border-[#94a3b8] bg-[#f8fafc] px-3 py-2 font-mono text-xs" /></label>
                <button type="submit" className="min-h-[40px] justify-self-start rounded border border-sky-700 bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">{t('Add file')}</button>
              </form>
              {tftpFileError && <p role="alert" className="text-xs font-semibold text-rose-700">{tftpFileError}</p>}
              <div className="space-y-2">
                {(device.config.tftpFiles ?? []).map((file, index) => (
                  <details key={`${file.name}-${index}`} className="rounded border border-slate-200 bg-white p-2">
                    <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700"><span className="font-mono">{file.name}</span><span className="text-slate-500">{new TextEncoder().encode(file.contents).byteLength} {t('bytes')}</span></summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700">{file.contents}</pre>
                    <button type="button" aria-label={`${t('Remove')} ${file.name}`} onClick={() => updateDeviceConfig(device.id, { tftpFiles: (device.config.tftpFiles ?? []).filter((_, itemIndex) => itemIndex !== index) })} className="mt-2 min-h-[34px] rounded border border-slate-300 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50">{t('Remove')}</button>
                  </details>
                ))}
                {(device.config.tftpFiles ?? []).length === 0 && <p className="text-xs text-slate-500">{t('No TFTP files configured.')}</p>}
              </div>
            </section>
            <EmailServiceSettings device={device} />
    </>
    </div>
  )
}

function DesktopTab({ deviceId }: { deviceId: string }) {
  const device = useNetworkStore(state => state.devices.find(item => item.id === deviceId))
  return device ? <DesktopSession key={device.id} device={device} /> : null
}

function DesktopSession({ device }: { device: NetworkDevice }) {
  const {t}=useI18n()
  const {
    devices,
    links,
    updatePortConfig,
    updateDeviceConfig,
    setActiveTab,
    connectPorts,
    deleteLink,
    requestHttp,
    requestDns,
    requestTftpRead,
    requestSnmpQuery,
    httpTransactions,
    dnsTransactions,
    dhcpTransactions,
    udpTransactions,
    simulationWarning,
  } = useNetworkStore(useShallow(state => ({
    devices: state.devices, links: state.links, updatePortConfig: state.updatePortConfig,
    updateDeviceConfig: state.updateDeviceConfig, setActiveTab: state.setActiveTab,
    connectPorts: state.connectPorts, deleteLink: state.deleteLink,
    requestHttp: state.requestHttp, requestDns: state.requestDns, httpTransactions: state.httpTransactions,
    requestTftpRead: state.requestTftpRead, requestSnmpQuery: state.requestSnmpQuery, udpTransactions: state.udpTransactions,
    dnsTransactions: state.dnsTransactions, dhcpTransactions: state.dhcpTransactions, simulationWarning: state.simulationWarning,
  })))
  const [activeApp, setActiveApp] = useState<'launcher' | 'ip' | 'wireless' | 'cmd' | 'terminal' | 'browser' | 'tftp' | 'snmp' | 'email'>('launcher')
  const [ipv6HostDraft, setIpv6HostDraft] = useState<{ portId: string; text: string } | null>(null)
  const [leaseClockNow,setLeaseClockNow]=useState(0)
  const [urlInput, setUrlInput] = useState('http://192.168.100.10')
  const [browserRender, setBrowserRender] = useState<string | null>(null)
  const [activeHttpRequestId, setActiveHttpRequestId] = useState<string | null>(null)
  const [pendingBrowserRequest, setPendingBrowserRequest] = useState<{ requestId: string; path: string } | null>(null)
  const [tftpServerDraft, setTftpServerDraft] = useState('')
  const [tftpClientFileDraft, setTftpClientFileDraft] = useState('')
  const [tftpRequestId, setTftpRequestId] = useState<string | null>(null)
  const [tftpClientError, setTftpClientError] = useState('')
  const [snmpAgentDraft, setSnmpAgentDraft] = useState('')
  const [snmpCommunityDraft, setSnmpCommunityDraft] = useState('classroom')
  const [snmpOperationDraft, setSnmpOperationDraft] = useState<'get' | 'get-next'>('get')
  const [snmpOidDraft, setSnmpOidDraft] = useState('1.3.6.1.2.1.1.5.0')
  const [snmpRequestId, setSnmpRequestId] = useState<string | null>(null)
  const [snmpClientError, setSnmpClientError] = useState('')
  const startedDnsHttpRequests = useRef(new Set<string>())

  useEffect(()=>{
    if(activeApp!=='ip')return
    const updateClock=()=>setLeaseClockNow(Date.now())
    updateClock()
    const timer=setInterval(updateClock,1000)
    return ()=>clearInterval(timer)
  },[activeApp])

  // Command prompt state
  const [cmdInput, setCmdInput] = useState('')
  const [cmdLines, setCmdLines] = useState<Array<{ text: string }>>([
    { text: 'Microsoft Windows [Version 10.0.19044.2006]' },
    { text: '(c) Microsoft Corporation. All rights reserved.\n' },
  ])
  const cmdBottomRef = useRef<HTMLDivElement>(null)
  const cmdInputRef = useRef<HTMLInputElement>(null)

  // Terminal state for console connection
  const [terminalConnected, setTerminalConnected] = useState(false)
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalLines, setTerminalLines] = useState<Array<{ text: string }>>([
    { text: 'Cisco IOS Console Terminal Session [9600 8-N-1]' },
    { text: 'Connected to direct RS-232 serial console line.\n' },
  ])
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const terminalInputRef = useRef<HTMLInputElement>(null)

  // Wireless tab state
  const [wirelessSubTab, setWirelessSubTab] = useState<'info' | 'connect'>('info')
  const appendCommand = useCallback((text: string) => setCmdLines(lines => [...lines, { text }]), [])
  const appendTerminal = useCallback((text: string) => setTerminalLines(lines => [...lines, { text }]), [])
  const commandFeedback = usePingFeedback(appendCommand)
  const terminalFeedback = usePingFeedback(appendTerminal)

  const wirelessPort = device.ports.find((p) => p.type === 'wireless')
  const activeWirelessLink = wirelessPort
    ? links.find(
        (l) =>
          (l.fromPortId === wirelessPort.id || l.toPortId === wirelessPort.id) &&
          l.type === 'wireless'
      )
    : null

  // Find console connection if any
  const consoleLink = links.find(
    (l) =>
      (l.fromDeviceId === device.id || l.toDeviceId === device.id) &&
      l.type === 'console'
  )
  const remoteConsoleDeviceId = consoleLink
    ? consoleLink.fromDeviceId === device.id
      ? consoleLink.toDeviceId
      : consoleLink.fromDeviceId
    : null
  const remoteConsoleDevice = remoteConsoleDeviceId
    ? devices.find((d) => d.id === remoteConsoleDeviceId)
    : null

  useEffect(() => {
    cmdBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [cmdLines])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  useEffect(() => {
    if (!pendingBrowserRequest || startedDnsHttpRequests.current.has(pendingBrowserRequest.requestId)) return
    const lookup = dnsTransactions.find(item => item.requestId === pendingBrowserRequest.requestId)
    if (lookup?.status !== 'successful' || !lookup.resolvedIp) return
    startedDnsHttpRequests.current.add(lookup.requestId)
    requestHttp(device.id, lookup.resolvedIp, pendingBrowserRequest.path, lookup.requestId)
  }, [device.id, dnsTransactions, pendingBrowserRequest, requestHttp])

  // 1. IP Configuration App
  if (activeApp === 'ip') {
    const port = device.ports[0] || wirelessPort
    const dhcpTransaction = [...dhcpTransactions].reverse().find(transaction => transaction.sourceDeviceId === device.id)
    const dhcpStatusLabel = dhcpTransaction?.renewalPhase
      ? dhcpTransaction.status === 'successful'
        ? t('DHCP lease renewed')
        : dhcpTransaction.status === 'failed'
          ? t('DHCP renewal failed')
          : t(dhcpTransaction.renewalPhase === 'rebind' ? 'DHCP lease rebinding' : 'DHCP lease renewing')
      : dhcpTransaction?.status === 'successful'
        ? t('DHCP lease assigned')
        : dhcpTransaction?.status === 'failed'
          ? t('DHCP exchange failed')
        : dhcpTransaction?.phase === 'probe'
          ? t('Checking offered address')
          : dhcpTransaction?.phase === 'offer' || dhcpTransaction?.phase === 'request'
            ? t('DHCP Offer received, requesting address')
            : t('DHCP Discover sent')
    const dhcpLease=device.config.dhcpLease
    const leaseDuration=dhcpLease?.leaseDurationSeconds??86400
    const leaseRemaining=dhcpLease?.acquiredAtMs===undefined||leaseClockNow===0?leaseDuration:Math.max(0,Math.ceil((dhcpLease.acquiredAtMs+leaseDuration*1000-leaseClockNow)/1000))
    const dhcpServerName=dhcpLease?devices.find(item=>item.id===dhcpLease.serverId)?.name??dhcpLease.serverId:undefined
    return (
      <div className="flex-1 bg-white rounded-xl border border-[#94a3b8] p-6 sm:p-8 flex flex-col space-y-6 overflow-y-auto shadow-xs">
        <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-800">{t('IP Configuration')}</span>
            <span className="text-xs text-slate-500 font-mono">({port ? port.name : 'No Interface'})</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveApp('launcher')}
            className="min-h-[36px] px-4 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition"
          >
            {t('Back to Desktop')}
          </button>
        </div>

        {port ? (
          <div className="space-y-5 max-w-lg">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center gap-8 text-xs font-semibold text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="ip-mode" checked={!device.config.dhcpEnabled} onChange={()=>useNetworkStore.getState().updateDeviceConfig(device.id,{dhcpEnabled:false,dhcpLease:undefined})} className="w-4 h-4 text-sky-600 cursor-pointer" />
                <span>{t('Static')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-500">
                <input type="radio" name="ip-mode" checked={device.config.dhcpEnabled===true} onChange={()=>useWorkspaceStore.getState().setStatus(useNetworkStore.getState().requestDhcp(device.id))} className="w-4 h-4 text-sky-600 cursor-pointer" />
                <span>{t('DHCP (Auto Request)')}</span>
              </label>
            </div>

            {dhcpTransaction && (
              <div role="status" aria-live="polite" className={`rounded-lg border px-3 py-2 text-xs ${dhcpTransaction.status === 'failed' ? 'border-red-300 bg-red-50 text-red-800' : dhcpTransaction.status === 'successful' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-sky-300 bg-sky-50 text-sky-800'}`}>
                <div className="font-semibold">{dhcpStatusLabel}{dhcpTransaction.assignedIp ? `: ${dhcpTransaction.assignedIp}` : ''}</div>
                {dhcpTransaction.reason && <div className="mt-1 leading-relaxed">{dhcpTransaction.reason}</div>}
              </div>
            )}

            {dhcpLease && (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <div><span className="font-semibold">{t('DHCP server')}:</span> {dhcpServerName}</div>
                <div><span className="font-semibold">{t('Lease state')}:</span> {t(dhcpLease.state==='renewing'?'Renewing':dhcpLease.state==='rebinding'?'Rebinding':'Bound')}</div>
                <div><span className="font-semibold">{t('Lease remaining')}:</span> {leaseRemaining} {t('seconds')}</div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('IPv4 Address')}</label>
              <input
                type="text"
                value={port.ipAddress || ''}
                onChange={(e) => updatePortConfig(device.id, port.id, { ipAddress: e.target.value.trim() })}
                placeholder="e.g. 192.168.1.10"
                className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('Subnet Mask')}</label>
              <input
                type="text"
                value={port.subnetMask || ''}
                onChange={(e) => updatePortConfig(device.id, port.id, { subnetMask: e.target.value.trim() })}
                placeholder="e.g. 255.255.255.0"
                className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('IPv6 Configuration')}</label>
              <select
                value={port.ipv6Dhcp ? 'dhcpv6' : port.ipv6Autoconfig ? 'auto' : 'static'}
                onChange={(e) => useNetworkStore.getState().setIpv6HostMode(device.id, port.id, e.target.value as 'static' | 'auto' | 'dhcpv6')}
                className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
              >
                <option value="static">{t('Static')}</option>
                <option value="auto">{t('Auto Config')}</option>
                <option value="dhcpv6">{t('DHCPv6')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('IPv6 Address/Prefix')}</label>
              <input
                type="text"
                disabled={port.ipv6Dhcp === true || port.ipv6Autoconfig === true}
                value={
                  port.ipv6Dhcp === true || port.ipv6Autoconfig === true
                    ? (port.ipv6Addresses ?? []).map(address => `${address.address}/${address.prefixLength}`).join(', ')
                    : ipv6HostDraft?.portId === port.id ? ipv6HostDraft.text : port.ipv6Addresses?.[0] ? `${port.ipv6Addresses[0].address}/${port.ipv6Addresses[0].prefixLength}` : ''
                }
                onChange={(e) => {
                  const raw = e.target.value
                  setIpv6HostDraft({ portId: port.id, text: raw })
                  const trimmed = raw.trim()
                  if (trimmed === '') {
                    updatePortConfig(device.id, port.id, { ipv6Addresses: undefined })
                    return
                  }
                  const parsed = parseIpv6WithPrefix(trimmed)
                  if (parsed) updatePortConfig(device.id, port.id, { ipv6Addresses: [{ address: parsed.address, prefixLength: parsed.prefixLength, source: 'static' }] })
                }}
                onBlur={() => setIpv6HostDraft((current) => (current && current.portId === port.id ? null : current))}
                placeholder="e.g. 2001:db8:1::10/64"
                className={`w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs${port.ipv6Dhcp === true || port.ipv6Autoconfig === true ? ' opacity-70' : ''}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('Default Gateway')}</label>
              <input
                type="text"
                value={device.config.defaultGateway || ''}
                onChange={(e) => updateDeviceConfig(device.id, { defaultGateway: e.target.value.trim() })}
                placeholder="e.g. 192.168.1.1"
                className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('IPv6 Default Gateway')}</label>
              <input
                type="text"
                value={device.config.ipv6DefaultGateway || ''}
                onChange={(e) => updateDeviceConfig(device.id, { ipv6DefaultGateway: e.target.value.trim() })}
                placeholder="e.g. 2001:db8:1::1"
                className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('DNS Server')}</label>
              <input
                type="text"
                value={device.config.dnsServer || ''}
                onChange={(e) => updateDeviceConfig(device.id, { dnsServer: e.target.value.trim() })}
                placeholder="e.g. 192.168.10.11"
                className="w-full min-h-[44px] bg-[#f8fafc] border border-[#94a3b8] rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-[#0284c7] outline-none shadow-2xs"
              />
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-slate-500 text-xs">
            No active network interface installed on this device.
          </div>
        )}
      </div>
    )
  }

  if (activeApp === 'tftp') {
    const transaction = udpTransactions.find(item => item.requestId === tftpRequestId)
    const receivedFiles = device.config.tftpClientFiles ?? []
    return (
      <div className="flex-1 min-h-0 overflow-y-auto rounded border border-[#94a3b8] bg-white p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">{t('TFTP Client')}</h3>
            <p className="mt-1 text-xs text-slate-500">{t('Request a file from a TFTP server and inspect each DATA and ACK block in Simulation mode.')}</p>
          </div>
          <button type="button" onClick={() => setActiveApp('launcher')} className="min-h-[36px] rounded border border-slate-300 bg-slate-100 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-200">{t('Back to Desktop')}</button>
        </div>
        <form className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={event => {
          event.preventDefault()
          const serverIp = tftpServerDraft.trim()
          const fileName = tftpClientFileDraft.trim()
          if (!isValidIpv4(serverIp) || !isValidTftpFileName(fileName)) {
            setTftpClientError(t('Enter a valid TFTP server IPv4 address and filename.'))
            return
          }
          const requestId = requestTftpRead(device.id, serverIp, fileName)
          if (!requestId) {
            setTftpClientError(simulationWarning || t('TFTP request could not be sent. Check the route, gateway, ACL and link status.'))
            return
          }
          setTftpRequestId(requestId)
          setTftpClientError('')
        }}>
          <label className="block text-xs font-semibold text-slate-700">{t('TFTP Server IPv4')}<input value={tftpServerDraft} onChange={event => setTftpServerDraft(event.target.value)} placeholder="192.168.1.10" className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" /></label>
          <label className="block text-xs font-semibold text-slate-700">{t('Filename')}<input value={tftpClientFileDraft} onChange={event => setTftpClientFileDraft(event.target.value)} placeholder="startup.cfg" className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" /></label>
          <button type="submit" className="min-h-[40px] rounded border border-sky-700 bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">{t('Read File')}</button>
        </form>
        {tftpClientError && <p role="alert" className="mt-3 max-w-2xl rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{tftpClientError}</p>}
        {transaction && <div role={transaction.status === 'failed' ? 'alert' : 'status'} aria-live="polite" className={`mt-4 max-w-2xl rounded border px-3 py-2 text-xs ${transaction.status === 'failed' ? 'border-rose-300 bg-rose-50 text-rose-800' : transaction.status === 'successful' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-sky-300 bg-sky-50 text-sky-800'}`}>
          <div className="font-semibold">{transaction.status === 'successful' ? t('TFTP file received') : transaction.status === 'failed' ? t('TFTP request failed') : t('TFTP transfer in progress')}</div>
          {transaction.reason && <div className="mt-1">{transaction.reason}</div>}
          {transaction.status === 'successful' && transaction.response !== undefined && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-white/70 p-2 font-mono text-[11px]">{transaction.response}</pre>}
        </div>}
        <section className="mt-6 max-w-3xl" aria-labelledby={`tftp-received-${device.id}`}>
          <h4 id={`tftp-received-${device.id}`} className="border-b border-[#e2e8f0] pb-2 text-xs font-bold uppercase tracking-wide text-slate-700">{t('Received files')}</h4>
          <div className="mt-3 space-y-2">
            {receivedFiles.map((file, index) => <details key={`${file.serverIp}-${file.name}-${index}`} className="rounded border border-slate-200 bg-white p-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700"><span className="font-mono">{file.name}</span><span className="ml-2 text-slate-500">{file.serverIp} · {new TextEncoder().encode(file.contents).byteLength} {t('bytes')}</span></summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700">{file.contents}</pre>
            </details>)}
            {receivedFiles.length === 0 && <p className="text-xs text-slate-500">{t('No TFTP files received yet.')}</p>}
          </div>
        </section>
      </div>
    )
  }

  if (activeApp === 'snmp') {
    const transaction = udpTransactions.find(item => item.requestId === snmpRequestId)
    return (
      <div className="flex-1 min-h-0 overflow-y-auto rounded border border-[#94a3b8] bg-white p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">{t('SNMP Manager')}</h3>
            <p className="mt-1 max-w-3xl text-xs text-slate-500">{t('Query SNMPv2c system objects over routed UDP. Configure a read-only community on the agent with snmp-server community <name> ro.')}</p>
          </div>
          <button type="button" onClick={() => setActiveApp('launcher')} className="min-h-[36px] rounded border border-slate-300 bg-slate-100 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-200">{t('Back to Desktop')}</button>
        </div>
        <form className="grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_minmax(170px,1fr)_minmax(245px,1.4fr)_auto] sm:items-end" onSubmit={event => {
          event.preventDefault()
          const agentIp = snmpAgentDraft.trim()
          const community = snmpCommunityDraft.trim()
          const oid = snmpOidDraft.trim()
          if (!isValidIpv4(agentIp) || !isValidSnmpCommunity(community) || !isValidSnmpOid(oid)) {
            setSnmpClientError(t('Enter a valid agent IPv4 address, read-only community, and numeric OID.'))
            return
          }
          const requestId = requestSnmpQuery(device.id, agentIp, snmpOperationDraft, oid, community)
          if (!requestId) {
            setSnmpClientError(t('SNMP request could not be sent. Check the route, gateway, UDP 161 ACL and link status.'))
            return
          }
          setSnmpRequestId(requestId)
          setSnmpClientError('')
        }}>
          <label className="block text-xs font-semibold text-slate-700">{t('SNMP Agent IPv4')}<input value={snmpAgentDraft} onChange={event => setSnmpAgentDraft(event.target.value)} placeholder="192.168.1.10" className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" /></label>
          <label className="block text-xs font-semibold text-slate-700">{t('Community')}<input value={snmpCommunityDraft} onChange={event => setSnmpCommunityDraft(event.target.value)} autoComplete="off" className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" /></label>
          <label className="block text-xs font-semibold text-slate-700">{t('Operation')}<select value={snmpOperationDraft} onChange={event => setSnmpOperationDraft(event.target.value as 'get' | 'get-next')} className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 text-xs"><option value="get">{t('Get (GET)')}</option><option value="get-next">{t('Get next (GETNEXT)')}</option></select></label>
          <label className="block text-xs font-semibold text-slate-700">{t('Numeric OID')}<input value={snmpOidDraft} onChange={event => setSnmpOidDraft(event.target.value)} placeholder="1.3.6.1.2.1.1.5.0" className="mt-1 w-full min-h-[40px] rounded border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs" /></label>
          <button type="submit" className="min-h-[40px] rounded border border-sky-700 bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">{t('Query SNMP')}</button>
        </form>
        {snmpClientError && <p role="alert" className="mt-3 max-w-4xl rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{snmpClientError}</p>}
        {transaction && <div role={transaction.status === 'failed' ? 'alert' : 'status'} aria-live="polite" className={`mt-4 max-w-4xl rounded border px-3 py-2 text-xs ${transaction.status === 'failed' ? 'border-rose-300 bg-rose-50 text-rose-800' : transaction.status === 'successful' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-sky-300 bg-sky-50 text-sky-800'}`}>
          <div className="font-semibold">{transaction.status === 'successful' ? t('SNMP response received') : transaction.status === 'failed' ? t('SNMP request failed') : t('SNMP request in progress')}</div>
          {transaction.reason && <div className="mt-1">{transaction.reason}</div>}
          {transaction.status === 'successful' && <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr]"><dt className="font-semibold">{t('Numeric OID')}</dt><dd className="break-all font-mono">{transaction.oid ?? snmpOidDraft}</dd><dt className="font-semibold">{t('Value')}</dt><dd className="break-all font-mono">{transaction.value ?? transaction.response ?? ''}</dd></dl>}
        </div>}
        <p className="mt-6 max-w-4xl rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('System OID values are simulated. SNMPv2c GET and GETNEXT are modeled; BER encoding, SNMPv3, write operations, and traps are not included yet.')}</p>
      </div>
    )
  }

  if (activeApp === 'email') return <EmailClientApp deviceId={device.id} onBack={() => setActiveApp('launcher')} />

  // 2. PC Wireless App
  if (activeApp === 'wireless') {
    if (!wirelessPort) {
      return (
        <div className="flex-1 bg-white rounded border border-[#94a3b8] p-6 flex flex-col items-center justify-center space-y-4 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 border-2 border-amber-300 flex items-center justify-center text-amber-600 text-2xl font-bold">
            !
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">No Wireless Interface Detected</h3>
            <p className="text-xs text-slate-600 max-w-md">
              A wireless network adapter (such as <strong>Linksys WPC300N</strong>) was not detected in this computer.
              To use wireless networking, navigate to the <strong>Physical</strong> tab, turn off the power switch, remove the copper NIC, and install a wireless module.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('physical')}
              className="px-4 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold rounded cursor-pointer shadow-xs"
            >
              Go to Physical Tab
            </button>
            <button
              type="button"
              onClick={() => setActiveApp('launcher')}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded cursor-pointer"
            >
              Back to Desktop
            </button>
          </div>
        </div>
      )
    }

    const availableAps = devices.filter((d) => d.type === 'wireless')
    const connectedAp = activeWirelessLink
      ? devices.find((d) => d.id === (activeWirelessLink.fromDeviceId === device.id ? activeWirelessLink.toDeviceId : activeWirelessLink.fromDeviceId))
      : null

    return (
      <div className="flex-1 bg-[#eff2f7] rounded-xl border border-[#94a3b8] flex flex-col overflow-hidden shadow-xs">
        {/* App Title Header */}
        <div className="bg-[#0284c7] text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold shadow-xs">
          <div className="flex items-center gap-2">
            <span>Linksys - Cisco Wireless Network Adapter Utility (WPC300N)</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveApp('launcher')}
            className="min-h-[32px] px-3.5 py-1 bg-sky-900/60 hover:bg-sky-900 text-white rounded-md text-xs font-semibold cursor-pointer transition"
          >
            ← Back to Desktop
          </button>
        </div>

        {/* Tab Navigation with Generous Spacing */}
        <div className="flex border-b border-[#cbd5e1] bg-[#e2e8f0] px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setWirelessSubTab('info')}
            className={`min-h-[38px] px-4 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 cursor-pointer transition ${
              wirelessSubTab === 'info'
                ? 'bg-white border-[#cbd5e1] text-slate-900 -mb-[2px] shadow-xs'
                : 'bg-slate-200 border-transparent text-slate-600 hover:bg-slate-300'
            }`}
          >
            Link Information
          </button>
          <button
            type="button"
            onClick={() => setWirelessSubTab('connect')}
            className={`min-h-[38px] px-4 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x-2 cursor-pointer transition ${
              wirelessSubTab === 'connect'
                ? 'bg-white border-[#cbd5e1] text-slate-900 -mb-[2px] shadow-xs'
                : 'bg-slate-200 border-transparent text-slate-600 hover:bg-slate-300'
            }`}
          >
            Connect (Site Survey)
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 bg-white p-6 overflow-y-auto">
          {wirelessSubTab === 'info' ? (
            <div className="space-y-4 max-w-lg">
              <div className="border border-[#cbd5e1] rounded p-3 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Radio Status:</span>
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    RADIO ON
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Connection Status:</span>
                  <span className={`text-xs font-bold ${connectedAp ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {connectedAp ? `Connected to ${connectedAp.name}` : 'Not Associated'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Network Name (SSID):</span>
                  <span className="text-xs font-mono font-bold text-slate-900">
                    {connectedAp?.name || 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Wireless Channel:</span>
                  <span className="text-xs font-mono text-slate-800">Channel 6 (2.412 GHz)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Security Type:</span>
                  <span className="text-xs text-slate-800">Open / WPA2-Personal</span>
                </div>
              </div>

              {/* Signal and Quality Meters */}
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Signal Strength:</span>
                    <span>{connectedAp ? '92% (Excellent)' : '0%'}</span>
                  </div>
                  <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        connectedAp ? 'w-[92%] bg-emerald-500' : 'w-0'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Link Quality:</span>
                    <span>{connectedAp ? '96% (Stable)' : '0%'}</span>
                  </div>
                  <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        connectedAp ? 'w-[96%] bg-sky-500' : 'w-0'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Network Details */}
              <div className="border-t border-[#e2e8f0] pt-3 text-xs font-mono text-slate-700 space-y-1">
                <div>IPv4: {wirelessPort.ipAddress || '192.168.1.101'}</div>
                <div>Subnet: {wirelessPort.subnetMask || '255.255.255.0'}</div>
                <div>MAC: {wirelessPort.macAddress}</div>
              </div>

              {connectedAp && activeWirelessLink && (
                <button
                  type="button"
                  onClick={() => deleteLink(activeWirelessLink.id)}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded cursor-pointer shadow-xs"
                >
                  Disconnect from {connectedAp.name}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Available Wireless Networks</h4>
                  <p className="text-[11px] text-slate-500">Select an Access Point and click Connect.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {}}
                  className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-xs font-semibold rounded cursor-pointer"
                >
                  Refresh
                </button>
              </div>

              <div className="border border-[#cbd5e1] rounded overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-[#cbd5e1] text-slate-700 font-bold">
                    <tr>
                      <th className="p-2">SSID (Network Name)</th>
                      <th className="p-2">Signal</th>
                      <th className="p-2">Channel</th>
                      <th className="p-2">Security</th>
                      <th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableAps.map((ap) => {
                      const isThisConnected = connectedAp?.id === ap.id
                      const apWlan = ap.ports.find((p) => p.type === 'wireless')
                      return (
                        <tr key={ap.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-2 font-bold text-slate-800">{ap.name}</td>
                          <td className="p-2 text-emerald-600 font-semibold">95% (Strong)</td>
                          <td className="p-2">6</td>
                          <td className="p-2 text-slate-600">None</td>
                          <td className="p-2 text-right">
                            {isThisConnected ? (
                              <button
                                type="button"
                                onClick={() => activeWirelessLink && deleteLink(activeWirelessLink.id)}
                                className="px-2.5 py-1 bg-rose-600 text-white font-bold rounded text-[11px] cursor-pointer"
                              >
                                Disconnect
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (apWlan) {
                                    connectPorts(device.id, wirelessPort.id, ap.id, apWlan.id, 'wireless')
                                  }
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[11px] cursor-pointer"
                              >
                                Connect
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {availableAps.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-500 text-xs">
                          No wireless Access Points discovered in the topology. Place an Access Point from Network Devices.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 3. Command Prompt App
  if (activeApp === 'cmd') {
    const runCmd = () => {
      const raw = cmdInput.trim()
      if (!raw) {
        setCmdLines((prev) => [...prev, { text: 'C:\\>' }])
        setCmdInput('')
        return
      }

      setCmdLines((prev) => [...prev, { text: `C:\\> ${raw}` }])
      const parts = raw.split(/\s+/)
      const command = parts[0].toLowerCase()

      if (command === 'ping') {
        const target = parts[1]
        if (!target) {
          setCmdLines((prev) => [...prev, { text: 'Usage: ping <ip-address>' }])
        } else {
          commandFeedback.ping(device.id, target)
        }
      } else if (command === 'ipconfig') {
        if(parts[1]==='/renew'){setCmdLines(prev=>[...prev,{text:useNetworkStore.getState().requestDhcp(device.id)}]);setCmdInput('');return}
        const port = device.ports[0] || wirelessPort
        let out = '\nWindows IP Configuration\n\nEthernet adapter Ethernet0:\n'
        out += `   Connection-specific DNS Suffix  . :\n`
        out += `   Link-local IPv6 Address . . . . . : fe80::a1b2:c3d4:e5f6\n`
        out += `   IPv4 Address. . . . . . . . . . . : ${port?.ipAddress || '0.0.0.0'}\n`
        out += `   Subnet Mask . . . . . . . . . . . : ${port?.subnetMask || '0.0.0.0'}\n`
        out += `   Default Gateway . . . . . . . . . : ${device.config.defaultGateway || '0.0.0.0'}\n`
        if (parts[1] === '/all') {
          out += `   Physical Address (MAC). . . . . . : ${port?.macAddress || '00:00:00:00:00:00'}\n`
          out += `   DHCP Enabled. . . . . . . . . . . : ${device.config.dhcpEnabled?'Yes':'No'}\n`
          out += `   DNS Servers . . . . . . . . . . . : ${device.config.dnsServer || '0.0.0.0'}\n`
        }
        setCmdLines((prev) => [...prev, { text: out }])
      } else if (command === 'tracert') {
        setCmdLines(prev => [...prev, { text: 'Traceroute is not implemented in this simulator.' }])
      } else if (command === 'arp') {
        let out = '\nInterface: 192.168.1.10 --- 0xb\n  Internet Address      Physical Address      Type\n'
        for (const a of device.arpTable) {
          out += `  ${a.ipAddress.padEnd(22)}${a.macAddress.padEnd(22)}dynamic\n`
        }
        if (device.arpTable.length === 0) {
          out += '  No ARP entries found.\n'
        }
        setCmdLines((prev) => [...prev, { text: out }])
      } else if (command === 'cls') {
        setCmdLines([])
      } else if (command === 'help') {
        setCmdLines((prev) => [
          ...prev,
          { text: 'Available commands: PING, IPCONFIG, IPCONFIG /ALL, TRACERT, ARP -A, CLS, HELP' },
        ])
      } else {
        setCmdLines((prev) => [
          ...prev,
          { text: `'${parts[0]}' is not recognized as an internal or external command.` },
        ])
      }

      setCmdInput('')
    }

    return (
      <div
        onClick={() => cmdInputRef.current?.focus()}
        className="flex-1 bg-[#0a0b0d] rounded-lg border-2 border-slate-700 flex flex-col font-mono text-sm overflow-hidden shadow-2xl cursor-text select-text"
      >
        <div className="bg-[#1e293b] px-4 py-2 flex items-center justify-between text-slate-200 font-bold border-b border-slate-700 select-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span>Command Prompt (cmd.exe)</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setActiveApp('launcher')
            }}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs cursor-pointer transition font-sans"
          >
            ✕ Close
          </button>
        </div>
        <div className="flex-1 p-4 overflow-y-auto text-slate-100 space-y-1">
          {cmdLines.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap">
              {line.text}
            </div>
          ))}
          <div className="relative flex items-center font-mono text-sm leading-6 min-h-[26px] mt-0.5">
            <span className="text-emerald-400 font-bold mr-2 select-none">C:\&gt;</span>
            <div className="relative flex items-center flex-1">
              <input
                ref={cmdInputRef}
                type="text"
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    runCmd()
                  }
                }}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-transparent border-none outline-none z-10 font-mono text-sm cursor-text"
              />
              <span className="text-white whitespace-pre font-mono text-sm">{cmdInput}</span>
              <span className="inline-block w-2.5 h-4.5 bg-emerald-400 ml-0.5 align-middle animate-[pulse_1s_infinite] shadow-[0_0_8px_#22c55e]" />
            </div>
          </div>
          <div ref={cmdBottomRef} />
        </div>
      </div>
    )
  }

  // 4. Terminal App (Direct Console Cable Session)
  if (activeApp === 'terminal') {
    if (!consoleLink || !remoteConsoleDevice) {
      return (
        <div className="flex-1 bg-white rounded border border-[#94a3b8] p-6 flex flex-col items-center justify-center space-y-4 text-center">
          <div className="w-14 h-14 rounded-full bg-cyan-50 border-2 border-cyan-400 flex items-center justify-center text-cyan-600 text-xs font-mono font-bold">
            RS-232
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">No Console Connection Active</h3>
            <p className="text-xs text-slate-600 max-w-md">
              The RS-232 serial port is not connected to any device.
              To establish a direct console session, connect a light-blue <strong>Console Cable</strong> from this device to a Switch or Router <strong>Console</strong> port.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveApp('launcher')}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded cursor-pointer"
          >
            ← Back to Desktop
          </button>
        </div>
      )
    }

    if (!terminalConnected) {
      return (
        <div className="flex-1 bg-[#eff2f7] rounded border border-[#94a3b8] p-6 flex items-center justify-center">
          <div className="bg-white border-2 border-[#3b6b95] rounded-md shadow-xl p-4 w-80 space-y-3 font-sans">
            <h3 className="text-xs font-bold text-[#0055ea] border-b border-[#cbd5e1] pb-1.5">
              Port Configuration (COM1)
            </h3>
            <div className="text-xs space-y-2 text-slate-700">
              <div className="flex justify-between">
                <span>Bits per second:</span>
                <span className="font-bold">9600</span>
              </div>
              <div className="flex justify-between">
                <span>Data bits:</span>
                <span className="font-bold">8</span>
              </div>
              <div className="flex justify-between">
                <span>Parity:</span>
                <span className="font-bold">None</span>
              </div>
              <div className="flex justify-between">
                <span>Stop bits:</span>
                <span className="font-bold">1</span>
              </div>
              <div className="flex justify-between">
                <span>Flow control:</span>
                <span className="font-bold">None</span>
              </div>
            </div>
            <div className="border-t border-[#cbd5e1] pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTerminalConnected(true)}
                className="px-4 py-1 bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold rounded cursor-pointer"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setActiveApp('launcher')}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )
    }

    const runTerminalCmd = () => {
      const raw = terminalInput.trim()
      const prompt = getPrompt(remoteConsoleDevice)
      if (!raw) {
        setTerminalLines((prev) => [...prev, { text: `${prompt} ` }])
        setTerminalInput('')
        return
      }

      setTerminalLines((prev) => [...prev, { text: `${prompt} ${raw}` }])
      const out = terminalFeedback.ios(remoteConsoleDevice.id, raw)
      if (out) {
        setTerminalLines((prev) => [...prev, { text: out }])
      }
      setTerminalInput('')
    }

    return (
      <div
        onClick={() => terminalInputRef.current?.focus()}
        className="flex-1 bg-[#0a0b0d] rounded-lg border-2 border-slate-700 flex flex-col font-mono text-sm overflow-hidden shadow-2xl cursor-text select-text"
      >
        <div className="bg-[#1e293b] px-4 py-2 flex items-center justify-between text-cyan-400 font-bold border-b border-slate-700 select-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Terminal [Direct Console to {remoteConsoleDevice.name}]</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setActiveApp('launcher')
            }}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs cursor-pointer transition font-sans"
          >
            ✕ Disconnect
          </button>
        </div>
        <div className="flex-1 p-4 overflow-y-auto text-slate-100 space-y-1">
          {terminalLines.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap">
              {line.text}
            </div>
          ))}
          <div className="relative flex items-center font-mono text-sm leading-6 min-h-[26px] mt-0.5">
            <span className="text-cyan-400 font-bold mr-2 select-none">
              {getPrompt(remoteConsoleDevice)}
            </span>
            <div className="relative flex items-center flex-1">
              <input
                ref={terminalInputRef}
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    runTerminalCmd()
                  }
                }}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-transparent border-none outline-none z-10 font-mono text-sm cursor-text"
              />
              <span className="text-white whitespace-pre font-mono text-sm">{terminalInput}</span>
              <span className="inline-block w-2.5 h-4.5 bg-cyan-400 ml-0.5 align-middle animate-[pulse_1s_infinite] shadow-[0_0_8px_#22d3ee]" />
            </div>
          </div>
          <div ref={terminalEndRef} />
        </div>
      </div>
    )
  }

  // 5. Web Browser App
  if (activeApp === 'browser') {
    const transaction = httpTransactions.find(item => item.requestId === activeHttpRequestId)
    const dnsTransaction = dnsTransactions.find(item => item.requestId === activeHttpRequestId)
    const dnsFailureDocument = dnsTransaction?.status === 'failed'
      ? (() => {
          const reason = (dnsTransaction.reason || 'The DNS query did not receive a valid answer.').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
          return `<main style="font-family:sans-serif;color:#991b1b;padding:20px"><h2>DNS lookup failed</h2><p>${reason}</p><p>Check the workstation DNS Server field, the route to that resolver, UDP port 53 ACLs, and the DNS service records.</p></main>`
        })()
      : null
    const httpStartFailureDocument = dnsTransaction?.status === 'successful' && !transaction && simulationWarning
      ? (() => {
          const reason = simulationWarning.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
          return `<main style="font-family:sans-serif;color:#991b1b;padding:20px"><h2>HTTP request not sent</h2><p>${reason}</p><p>DNS resolved ${dnsTransaction.domain} to ${dnsTransaction.resolvedIp ?? 'an unknown address'}.</p></main>`
        })()
      : null
    const transactionDocument = dnsFailureDocument || httpStartFailureDocument || (transaction?.status === 'successful'
      ? transaction.response || '<h1>HTTP 200 OK</h1><p>Empty response body.</p>'
      : transaction?.status === 'failed'
        ? transaction.response
          ? `<h1>HTTP ${transaction.httpStatus ?? 'Error'}</h1>${transaction.response}`
          : (() => {
              const reason = (transaction.reason || 'The request did not receive a response.').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
              return `<main style="font-family:sans-serif;color:#991b1b;padding:20px"><h2>Connection failed</h2><p>${reason}</p><p>Check the destination address, gateway, route, ACL and server service.</p></main>`
            })()
        : null)
    const handleGo = () => {
      setPendingBrowserRequest(null)
      let destination: URL
      try {
        destination = new URL(urlInput.includes('://') ? urlInput : `http://${urlInput}`)
      } catch {
        setActiveHttpRequestId(null)
        setBrowserRender('<h2>Invalid URL</h2><p>Enter a valid http:// URL.</p>')
        return
      }
      if (destination.protocol !== 'http:') {
        setActiveHttpRequestId(null)
        setBrowserRender('<h2>Unsupported protocol</h2><p>This lab models HTTP over IPv4. HTTPS is not implemented.</p>')
        return
      }
      if (destination.port && destination.port !== '80') {
        setActiveHttpRequestId(null)
        setBrowserRender('<h2>Unsupported port</h2><p>This HTTP model listens on TCP service port 80.</p>')
        return
      }
      const path = `${destination.pathname}${destination.search}`
      const targetHost = destination.hostname
      if (isValidIpv4(targetHost)) {
        const requestId = requestHttp(device.id, targetHost, path)
        if (!requestId) {
          setActiveHttpRequestId(null)
          setBrowserRender('<h2>Request not sent</h2><p>Check the IPv4 address, gateway, route, outbound ACL and packet queue.</p>')
          return
        }
        setActiveHttpRequestId(requestId)
        setBrowserRender('<h2>Connecting…</h2><p>HTTP request is crossing the simulated network.</p>')
        return
      }
      const requestId = requestDns(device.id, targetHost)
      if (!requestId) {
        setActiveHttpRequestId(null)
        setBrowserRender('<main style="font-family:sans-serif;color:#991b1b;padding:20px"><h2>DNS query not sent</h2><p>Check the workstation DNS Server address, route, gateway, UDP 53 ACL and packet queue.</p></main>')
        return
      }
      setPendingBrowserRequest({ requestId, path })
      setActiveHttpRequestId(requestId)
      setBrowserRender(`<main style="font-family:sans-serif;padding:20px"><h2>Resolving ${targetHost}</h2><p>UDP DNS query is crossing the simulated network.</p>${simulationWarning ? `<p>${simulationWarning}</p>` : ''}</main>`)
    }

    return (
      <div className="flex-1 bg-white rounded-xl border border-[#94a3b8] flex flex-col overflow-hidden shadow-xs">
        <div className="bg-[#e2e8f0] p-3.5 flex items-center gap-3 border-b border-[#cbd5e1] flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveApp('launcher')}
            className="min-h-[42px] px-3.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition border border-slate-300 shadow-2xs"
            title="Back to Desktop"
          >
            ← Back
          </button>
          <span className="text-xs font-bold text-slate-700">URL:</span>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGo()}
            placeholder="http://wirex.test or http://192.168.1.100"
            className="flex-1 min-h-[42px] bg-white border border-[#94a3b8] rounded-lg px-4 py-2 text-xs font-mono shadow-inner outline-none focus:border-[#0284c7]"
          />
          <button
            type="button"
            onClick={handleGo}
            className="min-h-[42px] px-5 bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold rounded-lg cursor-pointer transition shadow-xs"
          >
            Go
          </button>
        </div>
        <div className="flex-1 p-6 bg-white overflow-y-auto">
          {transactionDocument || browserRender ? (
            <iframe title="Simulated server page" sandbox="" referrerPolicy="no-referrer" srcDoc={transactionDocument || browserRender || ''} style={{width:'100%',height:'100%',minHeight:240,border:0,background:'#fff'}} />
          ) : (
            <div className="text-slate-500 text-center mt-12 text-xs font-medium">
              Enter an HTTP URL and click Go. Hostnames are resolved by the DNS server configured on this device.
            </div>
          )}
        </div>
      </div>
    )
  }

  // Desktop App Launcher Grid with Spacious Cards
  return (
    <div className="flex-1 bg-[#f8fafc] rounded-xl border border-[#94a3b8] p-8 shadow-xs">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
        {/* IP Config App */}
        <button
          type="button"
          onClick={() => setActiveApp('ip')}
          className="min-h-[125px] p-5 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-[#0284c7] rounded-xl flex flex-col items-center justify-center gap-3 transition cursor-pointer shadow-xs hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-xl bg-sky-100 border border-sky-300 text-sky-700 flex items-center justify-center shadow-xs">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-800">{t('IP Configuration')}</span>
        </button>

        {/* PC Wireless App */}
        <button
          type="button"
          onClick={() => setActiveApp('wireless')}
          className="min-h-[125px] p-5 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-[#0284c7] rounded-xl flex flex-col items-center justify-center gap-3 transition cursor-pointer shadow-xs hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shadow-xs">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-800">{t('PC Wireless')}</span>
        </button>

        {/* Command Prompt App */}
        <button
          type="button"
          onClick={() => setActiveApp('cmd')}
          className="min-h-[125px] p-5 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-[#0284c7] rounded-xl flex flex-col items-center justify-center gap-3 transition cursor-pointer shadow-xs hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 text-emerald-400 flex items-center justify-center shadow-xs font-mono font-bold text-base">
            &gt;_
          </div>
          <span className="text-xs font-bold text-slate-800">{t('Command Prompt')}</span>
        </button>

        {/* Terminal Console App */}
        <button
          type="button"
          onClick={() => setActiveApp('terminal')}
          className="min-h-[125px] p-5 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-[#0284c7] rounded-xl flex flex-col items-center justify-center gap-3 transition cursor-pointer shadow-xs hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-xl bg-cyan-100 border border-cyan-300 text-cyan-700 flex items-center justify-center shadow-xs">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="7" y1="8" x2="7" y2="8" strokeWidth="3" />
              <line x1="11" y1="8" x2="17" y2="8" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="7" y1="16" x2="13" y2="16" />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-800">{t('Terminal')}</span>
        </button>

        {/* Web Browser App */}
        <button
          type="button"
          onClick={() => setActiveApp('browser')}
          className="min-h-[125px] p-5 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-[#0284c7] rounded-xl flex flex-col items-center justify-center gap-3 transition cursor-pointer shadow-xs hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shadow-xs">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-800">{t('Web Browser')}</span>
        </button>

        {(device.type === 'pc' || device.type === 'laptop') && <button
          type="button"
          onClick={() => setActiveApp('email')}
          aria-label={t('Email')}
          className="min-h-[125px] p-5 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-[#0284c7] rounded-xl flex flex-col items-center justify-center gap-3 transition cursor-pointer shadow-xs hover:shadow-md"
        >
          <div aria-hidden="true" className="w-12 h-12 rounded-xl bg-violet-100 border border-violet-300 text-violet-800 flex items-center justify-center shadow-xs">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
          </div>
          <span className="text-xs font-bold text-slate-800">{t('Email')}</span>
        </button>}

        {(device.type === 'pc' || device.type === 'laptop') && <button
          type="button"
          onClick={() => setActiveApp('tftp')}
          className="min-h-[125px] p-5 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-[#0284c7] rounded-xl flex flex-col items-center justify-center gap-3 transition cursor-pointer shadow-xs hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center shadow-xs">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M8.5 13h7M8.5 17h7M12 10v6m-2-2 2 2 2-2" />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-800">{t('TFTP Client')}</span>
        </button>}

        {(device.type === 'pc' || device.type === 'laptop') && <button
          type="button"
          onClick={() => setActiveApp('snmp')}
          aria-label={t('SNMP Manager')}
          className="min-h-[125px] p-5 bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-[#0284c7] rounded-xl flex flex-col items-center justify-center gap-3 transition cursor-pointer shadow-xs hover:shadow-md"
        >
          <div aria-hidden="true" className="w-12 h-12 rounded-xl bg-violet-100 border border-violet-300 text-violet-800 flex items-center justify-center shadow-xs font-bold text-xs">SNMP</div>
          <span className="text-xs font-bold text-slate-800">{t('SNMP Manager')}</span>
        </button>}
      </div>
    </div>
  )
}

function PhysicalTab({deviceId}:{deviceId:string}) {
  return <PhysicalDeviceView deviceId={deviceId}/>
}
