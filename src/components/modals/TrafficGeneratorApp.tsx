'use client'

import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNetworkStore } from '@/store/networkStore'
import { useI18n } from '@/i18n/useI18n'
import { outgoingRoute } from '@/simulator/engine'
import {
  TRAFFIC_GENERATOR_APPLICATIONS,
  TRAFFIC_GENERATOR_PACKET_COLORS,
  defaultTrafficGeneratorSettings,
  parseTrafficGeneratorInterval,
  type TrafficGeneratorError,
  type TrafficGeneratorSettings,
} from '@/simulator/trafficGenerator'

export function TrafficGeneratorApp({ deviceId, onBack }: { deviceId: string; onBack: () => void }) {
  const { t } = useI18n()
  const { device, run, startTrafficGenerator, stopTrafficGenerator, sendTrafficGeneratorOnce } = useNetworkStore(useShallow(state => ({
    device: state.devices.find(item => item.id === deviceId),
    run: state.trafficGenerators.find(candidate => candidate.deviceId === deviceId) ?? null,
    startTrafficGenerator: state.startTrafficGenerator,
    stopTrafficGenerator: state.stopTrafficGenerator,
    sendTrafficGeneratorOnce: state.sendTrafficGeneratorOnce,
  })))
  const [settings, setSettings] = useState<TrafficGeneratorSettings>(() => defaultTrafficGeneratorSettings())
  const [mode, setMode] = useState<'single-shot' | 'periodic'>('single-shot')
  const [intervalInput, setIntervalInput] = useState('1')
  const [dscpInput, setDscpInput] = useState('')
  const [portInput, setPortInput] = useState('7')
  const [sourcePortInput, setSourcePortInput] = useState('0')
  const [payloadInput, setPayloadInput] = useState('0')
  const [manualSent, setManualSent] = useState(0)
  const [error, setError] = useState('')

  const update = (patch: Partial<TrafficGeneratorSettings>) => setSettings(current => ({ ...current, ...patch }))

  // PT muscle memory: Ctrl+F4 closes the Traffic Generator window.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'F4') {
        event.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onBack])

  const errorMessage = (code: TrafficGeneratorError): string => {
    switch (code) {
      case 'device-missing': return t('The selected device is no longer available.')
      case 'interval-invalid': return t('Enter the interval as a number of seconds.')
      case 'interval-range': return t('The interval must be between 0.001 and 1,000,000 seconds.')
      case 'domain-invalid': return t('Enter a destination domain name.')
      case 'path-invalid': return t('The request path must start with "/".')
      case 'file-invalid': return t('Enter a valid TFTP file name.')
      case 'port-invalid': return t('Enter a destination port between 1 and 65535.')
      case 'dscp-invalid': return t('Enter the DSCP value as a number from 0 to 63.')
      case 'source-port-invalid': return t('Enter a source port between 1 and 65535, or 0 for automatic.')
      case 'payload-invalid': return t('Enter the payload size in bytes from 0 to 1472.')
      case 'source-mac-invalid': return t('Enter the source MAC as 00:60:2f:aa:bb:cc.')
      case 'source-ip-invalid': return t('Enter a valid IPv4 source address.')
      case 'port-unknown': return t('The selected outgoing port is no longer available on this device.')
      case 'target-invalid': return settings.application === 'icmp' ? t('Enter a valid IPv4 or IPv6 destination address.') : t('Enter a valid IPv4 destination address.')
    }
  }

  const sourcePort = device?.ports.find(port => port.ipAddress)
  const isRawApplication = settings.application === 'raw-udp' || settings.application === 'raw-tcp'
  const route = useMemo(() => (device && settings.target.trim() ? outgoingRoute(device, settings.target.trim()) : undefined), [device, settings.target])
  const sentCount = (run?.sentCount ?? 0) + manualSent

  const dispatchOnce = () => {
    const result = sendTrafficGeneratorOnce(deviceId, settings)
    if (!result.ok) {
      setError(errorMessage(result.error))
      return
    }
    setManualSent(count => count + 1)
    setError('')
  }

  const stopRun = () => {
    if (!run) return
    setManualSent(count => count + run.sentCount)
    stopTrafficGenerator(run.id)
  }

  const startRun = () => {
    const parsed = parseTrafficGeneratorInterval(intervalInput)
    if (!parsed.ok) {
      setError(errorMessage(parsed.error))
      return
    }
    const result = startTrafficGenerator(deviceId, settings, parsed.seconds)
    if (!result.ok) {
      setError(errorMessage(result.error))
      return
    }
    setManualSent(0)
    setError('')
  }

  if (!device) return null

  const applicationLabel = (application: TrafficGeneratorSettings['application']) =>
    t(TRAFFIC_GENERATOR_APPLICATIONS.find(item => item.id === application)?.label ?? 'Select Application')
  const targetLabel = settings.application === 'dns' ? t('Domain Name') : t('Destination IP')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-slate-300 bg-white" data-testid="pt-traffic-generator">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{t('Traffic Generator')}</h3>
          <p className="text-xs text-slate-500">{t('Generate test traffic from this device and watch the labeled packets on the canvas.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            role="status"
            data-testid="pt-tg-status"
            data-running={run ? 'true' : 'false'}
            className={`rounded border px-3 py-1 text-xs font-semibold ${run ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-600'}`}
          >
            {run ? t('Running') : t('Stopped')}
          </span>
          <span className="text-xs text-slate-600">
            {t('PDUs Sent')}: <span data-testid="pt-tg-count" className="font-mono font-semibold">{sentCount}</span>
          </span>
          <button type="button" onClick={onBack} className="min-h-[38px] rounded border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100">{t('Back to Desktop')}</button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-2">
        <section className="space-y-3" aria-labelledby={`tg-source-${deviceId}`}>
          <h4 id={`tg-source-${deviceId}`} className="text-xs font-bold uppercase tracking-wide text-slate-700">{t('Source Settings')}</h4>
          <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-source-device-${deviceId}`}>{t('Source Device')}
            <input id={`tg-source-device-${deviceId}`} value={device.name} readOnly className="mt-1 min-h-[38px] w-full rounded border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-600" />
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`tg-auto-port-${deviceId}`}
              type="checkbox"
              data-testid="pt-tg-auto-port"
              checked={settings.autoSelectPort}
              onChange={event => update(event.target.checked
                ? { autoSelectPort: true }
                : { autoSelectPort: false, outgoingPortId: settings.outgoingPortId || device.ports[0]?.id || '' })}
              className="h-4 w-4"
            />
            <label htmlFor={`tg-auto-port-${deviceId}`} className="text-xs font-semibold text-slate-700">{t('Auto Select Port')}</label>
          </div>
          <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-outgoing-port-${deviceId}`}>{t('Outgoing Port')}
            {settings.autoSelectPort
              ? <input id={`tg-outgoing-port-${deviceId}`} value={route ? route.port.name : t('No route')} readOnly className="mt-1 min-h-[38px] w-full rounded border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-600" />
              : <select
                  id={`tg-outgoing-port-${deviceId}`}
                  data-testid="pt-tg-outgoing-port"
                  value={settings.outgoingPortId}
                  onChange={event => update({ outgoingPortId: event.target.value })}
                  className="mt-1 min-h-[38px] w-full rounded border border-slate-300 bg-white px-3 font-mono text-xs"
                >
                  {device.ports.map(port => <option key={port.id} value={port.id}>{port.name}{port.ipAddress ? ` — ${port.ipAddress}` : ''}</option>)}
                </select>}
          </label>
          <p className="text-xs text-slate-500">{t('Manual port and source overrides apply to the raw UDP/TCP injectors; other applications follow the routing table.')}</p>
        </section>

        <section className="space-y-3" aria-labelledby={`tg-l2-${deviceId}`}>
          <h4 id={`tg-l2-${deviceId}`} className="text-xs font-bold uppercase tracking-wide text-slate-700">{t('L2 Config')}</h4>
          <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-source-mac-${deviceId}`}>{t('Source MAC')}
            <input
              id={`tg-source-mac-${deviceId}`}
              data-testid="pt-tg-source-mac"
              value={settings.sourceMac}
              onChange={event => update({ sourceMac: event.target.value })}
              placeholder={sourcePort?.macAddress ?? '—'}
              disabled={!isRawApplication}
              className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs disabled:bg-slate-50 disabled:text-slate-400"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-destination-mac-${deviceId}`}>{t('Destination MAC')}
            <input id={`tg-destination-mac-${deviceId}`} value={t('Resolved by ARP')} readOnly className="mt-1 min-h-[38px] w-full rounded border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600" />
          </label>
        </section>

        <section className="space-y-3" aria-labelledby={`tg-l3-${deviceId}`}>
          <h4 id={`tg-l3-${deviceId}`} className="text-xs font-bold uppercase tracking-wide text-slate-700">{t('L3 Config')}</h4>
          <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-source-ip-${deviceId}`}>{t('Source IP')}
            <input
              id={`tg-source-ip-${deviceId}`}
              data-testid="pt-tg-source-ip"
              value={settings.sourceIp}
              onChange={event => update({ sourceIp: event.target.value })}
              placeholder={sourcePort?.ipAddress ?? '—'}
              disabled={!isRawApplication}
              className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs disabled:bg-slate-50 disabled:text-slate-400"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-target-${deviceId}`}>{targetLabel}
            <input
              id={`tg-target-${deviceId}`}
              value={settings.target}
              onChange={event => update({ target: event.target.value })}
              placeholder={settings.application === 'dns' ? 'server.example.test' : '192.168.1.10'}
              className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs"
            />
          </label>
        </section>

        <section className="space-y-3" aria-labelledby={`tg-pdu-${deviceId}`}>
          <h4 id={`tg-pdu-${deviceId}`} className="text-xs font-bold uppercase tracking-wide text-slate-700">{t('PDU Settings')}</h4>
          <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-application-${deviceId}`}>{t('Select Application')}
            <select
              id={`tg-application-${deviceId}`}
              value={settings.application}
              onChange={event => update({ application: event.target.value as TrafficGeneratorSettings['application'] })}
              className="mt-1 min-h-[38px] w-full rounded border border-slate-300 bg-white px-3 text-xs"
            >
              {TRAFFIC_GENERATOR_APPLICATIONS.map(application => <option key={application.id} value={application.id}>{applicationLabel(application.id)}</option>)}
            </select>
          </label>
          {isRawApplication && <p className="text-xs text-slate-500">{t('Raw UDP sends a bare datagram; raw TCP opens a SYN handshake and shows the SYN-ACK or reset it gets back.')}</p>}
          {settings.application === 'http' && (
            <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-path-${deviceId}`}>{t('Request Path')}
              <input id={`tg-path-${deviceId}`} value={settings.path} onChange={event => update({ path: event.target.value })} placeholder="/" className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" />
            </label>
          )}
          {settings.application === 'tftp' && (
            <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-file-${deviceId}`}>{t('File Name')}
              <input id={`tg-file-${deviceId}`} value={settings.fileName} onChange={event => update({ fileName: event.target.value })} className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" />
            </label>
          )}
          {(settings.application === 'udp' || isRawApplication) && (<>
            <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-port-${deviceId}`}>{t('Destination Port')}
              <input id={`tg-port-${deviceId}`} value={portInput} inputMode="numeric" onChange={event => { setPortInput(event.target.value); update({ port: Number(event.target.value.trim()) }) }} className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" />
            </label>
            {isRawApplication && (
              <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-source-port-${deviceId}`}>{t('Source Port')}
                <input
                  id={`tg-source-port-${deviceId}`}
                  data-testid="pt-tg-source-port"
                  value={sourcePortInput}
                  inputMode="numeric"
                  onChange={event => { setSourcePortInput(event.target.value); const trimmed = event.target.value.trim(); update({ sourcePort: trimmed === '' ? 0 : Number(trimmed) }) }}
                  className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs"
                />
              </label>
            )}
            {(settings.application === 'udp' || settings.application === 'raw-udp') && (
              <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-data-${deviceId}`}>{t('Data')}
                <input id={`tg-data-${deviceId}`} value={settings.data} onChange={event => update({ data: event.target.value })} className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" />
              </label>
            )}
            {(settings.application === 'raw-udp' || settings.application === 'udp') && (
              <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-payload-${deviceId}`}>{t('Payload Size (bytes)')}
                <input
                  id={`tg-payload-${deviceId}`}
                  data-testid="pt-tg-payload"
                  value={payloadInput}
                  inputMode="numeric"
                  onChange={event => { setPayloadInput(event.target.value); const trimmed = event.target.value.trim(); update({ payloadSize: trimmed === '' ? 0 : Number(trimmed) }) }}
                  className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs"
                />
              </label>
            )}
          </>)}
          <fieldset>
            <legend className="text-xs font-semibold text-slate-700">{t('Packet Color')}</legend>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={settings.packetColor === ''}
                onClick={() => update({ packetColor: '' })}
                className={`min-h-[32px] rounded border px-3 text-xs font-semibold ${settings.packetColor === '' ? 'border-sky-700 bg-sky-50 text-sky-800' : 'border-slate-300 bg-white text-slate-600'}`}
              >
                {t('Automatic')}
              </button>
              {TRAFFIC_GENERATOR_PACKET_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  aria-label={`${t('Packet Color')} ${color}`}
                  aria-pressed={settings.packetColor === color}
                  onClick={() => update({ packetColor: color })}
                  className={`h-8 w-8 rounded-full border-2 ${settings.packetColor === color ? 'border-slate-900' : 'border-white'} shadow-sm`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </fieldset>
          <label className="block text-xs font-semibold text-slate-700" htmlFor={`tg-dscp-${deviceId}`}>{t('QoS Stamp (DSCP)')}
            <input id={`tg-dscp-${deviceId}`} value={dscpInput} inputMode="numeric" onChange={event => { setDscpInput(event.target.value); const trimmed = event.target.value.trim(); update({ dscp: trimmed === '' ? null : Number(trimmed) }) }} className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" />
          </label>
          <p className="text-xs text-slate-500">{t('DSCP is a decimal value from 0 to 63. It appears as hex in the PDU details.')}</p>
        </section>

        <section className="space-y-3 xl:col-span-2" aria-labelledby={`tg-simulation-${deviceId}`}>
          <h4 id={`tg-simulation-${deviceId}`} className="text-xs font-bold uppercase tracking-wide text-slate-700">{t('Simulation Settings')}</h4>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="radio" name={`tg-mode-${deviceId}`} checked={mode === 'single-shot'} onChange={() => setMode('single-shot')} />
              {t('Single Shot')}
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="radio" name={`tg-mode-${deviceId}`} checked={mode === 'periodic'} onChange={() => setMode('periodic')} />
              {t('Periodic')}
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700" htmlFor={`tg-interval-${deviceId}`}>{t('Interval (seconds)')}
              <input
                id={`tg-interval-${deviceId}`}
                value={intervalInput}
                inputMode="decimal"
                disabled={mode !== 'periodic'}
                onChange={event => setIntervalInput(event.target.value)}
                className="min-h-[38px] w-32 rounded border border-slate-300 px-3 font-mono text-xs disabled:bg-slate-50 disabled:text-slate-400"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={dispatchOnce} className="min-h-[40px] rounded border border-slate-400 bg-white px-5 text-xs font-bold text-slate-700 hover:bg-slate-100">{t('Test')}</button>
            {run
              ? <button type="button" onClick={stopRun} className="min-h-[40px] rounded border border-rose-800 bg-rose-700 px-5 text-xs font-bold text-white hover:bg-rose-800">{t('Stop')}</button>
              : <button type="button" onClick={mode === 'periodic' ? startRun : dispatchOnce} className="min-h-[40px] rounded border border-sky-800 bg-sky-800 px-5 text-xs font-bold text-white hover:bg-sky-900">{t('Send')}</button>}
            <button type="button" onClick={onBack} className="min-h-[40px] rounded border border-slate-300 bg-white px-5 text-xs font-semibold text-slate-700 hover:bg-slate-100">{t('Close')}</button>
          </div>
          {error && <p role="alert" data-testid="pt-tg-error" className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
          {run && <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{t('Running')}: {t('Interval (seconds)')} {run.intervalSeconds}</p>}
        </section>
      </div>
    </div>
  )
}
