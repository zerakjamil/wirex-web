'use client'

import React, { useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useI18n } from '@/i18n/useI18n'

const JS_DEFAULT_TEMPLATE = `// Cisco Packet Tracer Board Controller
// Available APIs:
//   analogRead(pin), digitalRead(pin)
//   digitalWrite(pin, HIGH/LOW), analogWrite(pin, value)
//   pinMode(pin, INPUT/OUTPUT)

function setup() {
  pinMode(D0, OUTPUT);
}

function loop() {
  var sensorVal = analogRead(A0);
  if (sensorVal > 500) {
    digitalWrite(D0, HIGH);
  } else {
    digitalWrite(D0, LOW);
  }
}
`

const PYTHON_DEFAULT_TEMPLATE = `# Cisco Packet Tracer Python Controller
from gpio import *
from time import *

def main():
    pinMode(D0, OUTPUT)
    val = analogRead(A0)
    if val > 500:
        digitalWrite(D0, HIGH)
    else:
        digitalWrite(D0, LOW)

if __name__ == "__main__":
    main()
`

export function ProgrammingTab({ deviceId }: { deviceId: string }) {
  const { t } = useI18n()
  const device = useNetworkStore(state => state.devices.find(d => d.id === deviceId))
  const links = useNetworkStore(state => state.links)
  const allDevices = useNetworkStore(state => state.devices)
  const updateDeviceConfig = useNetworkStore(state => state.updateDeviceConfig)

  const [code, setCode] = useState<string>(() => {
    return device?.config.programCode ?? JS_DEFAULT_TEMPLATE
  })
  const [language, setLanguage] = useState<'javascript' | 'python'>(() => {
    return device?.config.programLanguage ?? 'javascript'
  })
  const [isRunning, setIsRunning] = useState<boolean>(() => {
    return device?.config.programRunning !== false
  })
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    'Board runtime initialized.',
    'I/O event loop synchronized with simulation clock.',
  ])

  if (!device) return null

  const pinStates = device.config.pinStates ?? {}

  const handleCodeChange = (newCode: string) => {
    setCode(newCode)
    updateDeviceConfig(deviceId, { programCode: newCode })
  }

  const handleToggleRunning = () => {
    const nextRunning = !isRunning
    setIsRunning(nextRunning)
    updateDeviceConfig(deviceId, { programRunning: nextRunning })
    setConsoleLogs(prev => [
      ...prev.slice(-40),
      nextRunning ? `[${new Date().toLocaleTimeString()}] Program started.` : `[${new Date().toLocaleTimeString()}] Program stopped.`,
    ])
  }

  const handleLanguageChange = (lang: 'javascript' | 'python') => {
    setLanguage(lang)
    const newTemplate = lang === 'python' ? PYTHON_DEFAULT_TEMPLATE : JS_DEFAULT_TEMPLATE
    setCode(newTemplate)
    updateDeviceConfig(deviceId, { programLanguage: lang, programCode: newTemplate })
    setConsoleLogs(prev => [...prev.slice(-40), `Switched language mode to ${lang.toUpperCase()}.`])
  }

  const handleResetTemplate = () => {
    const defaultCode = language === 'python' ? PYTHON_DEFAULT_TEMPLATE : JS_DEFAULT_TEMPLATE
    setCode(defaultCode)
    updateDeviceConfig(deviceId, { programCode: defaultCode })
    setConsoleLogs(prev => [...prev.slice(-40), 'Reset code to default template.'])
  }

  // Map connected pins to peer devices
  const connectedPins = device.ports
    .filter(port => port.id.startsWith('A') || port.id.startsWith('D'))
    .map(port => {
      const link = links.find(l => l.id === port.connectedLinkId)
      let peerName = 'Not Connected'
      if (link) {
        const peerId = link.fromDeviceId === device.id ? link.toDeviceId : link.fromDeviceId
        const peer = allDevices.find(d => d.id === peerId)
        if (peer) {
          const peerPortId = link.fromDeviceId === device.id ? link.toPortId : link.fromPortId
          peerName = `${peer.name} (${peerPortId})`
        }
      }
      const state = pinStates[port.id] ?? { mode: port.id.startsWith('A') ? 'INPUT' : 'OUTPUT', value: 0 }
      return {
        id: port.id,
        name: port.name,
        type: port.id.startsWith('A') ? 'Analog' : 'Digital',
        mode: state.mode,
        value: state.value,
        peer: peerName,
      }
    })

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#eef2f7] text-[#1e293b] text-xs font-sans p-2 gap-2 overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between bg-white border border-[#cbd5e1] rounded p-2 shadow-xs flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-[#0f172a]">{t('Programming')}:</span>
          <select
            value={language}
            onChange={e => handleLanguageChange(e.target.value as 'javascript' | 'python')}
            className="border border-[#94a3b8] rounded px-2 py-0.5 bg-white text-xs font-semibold focus:outline-hidden"
          >
            <option value="javascript">JavaScript (ECMAScript)</option>
            <option value="python">Python 3 (gpio / time)</option>
          </select>
          <div className="flex items-center gap-1.5 ml-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="font-semibold text-[11px] text-[#475569]">
              {isRunning ? 'RUNNING' : 'STOPPED'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleRunning}
            className={`px-3 py-1 rounded font-semibold text-white shadow-xs cursor-pointer transition ${
              isRunning
                ? 'bg-[#d9383a] hover:bg-[#b9282a]'
                : 'bg-[#10b981] hover:bg-[#059669]'
            }`}
          >
            {isRunning ? 'Stop' : 'Run'}
          </button>
          <button
            type="button"
            onClick={handleResetTemplate}
            className="px-2.5 py-1 rounded border border-[#cbd5e1] bg-[#f8fafc] hover:bg-[#e2e8f0] text-[#334155] font-medium cursor-pointer"
          >
            Reset Template
          </button>
        </div>
      </div>

      {/* Main Split Body: Code Editor and Pin Inspector */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        {/* Code Editor */}
        <div className="flex-1 flex flex-col border border-[#cbd5e1] rounded bg-[#1e293b] text-[#f8fafc] overflow-hidden shadow-xs">
          <div className="h-6 bg-[#0f172a] px-3 flex items-center justify-between text-[11px] text-[#94a3b8] border-b border-[#334155] flex-shrink-0">
            <span>{language === 'python' ? 'main.py' : 'main.js'}</span>
            <span>UTF-8</span>
          </div>
          {device.config.programError === 'unsupported-syntax' && (
            <div role="alert" className="border-b border-rose-300 bg-rose-950 px-3 py-2 text-[11px] leading-snug text-rose-100">
              {t('Program rejected: unsupported syntax. Use pinMode, analogRead/digitalRead, analogWrite/digitalWrite, assignments, and simple if/else only.')}
            </div>
          )}
          <textarea
            value={code}
            onChange={e => handleCodeChange(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full p-3 font-mono text-[12px] bg-[#0f172a] text-[#38bdf8] focus:outline-hidden resize-none leading-relaxed"
          />
        </div>

        {/* Pin I/O Status Inspector */}
        <div className="w-[280px] flex flex-col border border-[#cbd5e1] rounded bg-white overflow-hidden shadow-xs flex-shrink-0">
          <div className="h-6 bg-[#e2e8f0] px-2 flex items-center justify-between text-[11px] font-bold text-[#334155] border-b border-[#cbd5e1] flex-shrink-0">
            <span>{t('Pin I/O Status')}</span>
            <span className="text-[10px] text-[#64748b]">{connectedPins.length} pins</span>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {connectedPins.map(pin => {
              const isHigh = pin.value > 512
              return (
                <div
                  key={pin.id}
                  className="p-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded text-[11px] flex flex-col gap-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0f172a]">{pin.name}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                        isHigh
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {pin.type === 'Analog' ? `Val: ${pin.value}` : isHigh ? 'HIGH' : 'LOW'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#64748b]">
                    <span>{pin.type} · {pin.mode}</span>
                    <span className="truncate max-w-[130px]" title={pin.peer}>
                      {pin.peer}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Console Output Terminal */}
      <div className="h-[95px] flex flex-col border border-[#cbd5e1] rounded bg-[#090d16] text-[#38bdf8] font-mono text-[11px] overflow-hidden flex-shrink-0">
        <div className="h-5 bg-[#0f172a] px-2 flex items-center justify-between text-[10px] text-[#94a3b8] border-b border-[#1e293b] flex-shrink-0">
          <span>{t('Console Output')}</span>
          <button
            type="button"
            onClick={() => setConsoleLogs([])}
            className="text-[10px] text-[#64748b] hover:text-[#94a3b8] cursor-pointer"
          >
            Clear
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 leading-tight select-text">
          {consoleLogs.map((log, i) => (
            <div key={i} className="text-[#94a3b8]">
              <span className="text-emerald-400">&gt;</span> {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
