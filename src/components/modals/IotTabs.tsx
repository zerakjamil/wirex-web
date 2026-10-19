'use client'

import React, { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useI18n } from '@/i18n/useI18n'
import { isValidIpv4 } from '@/simulator/protocols/ip'
import {
  IOT_CLIENT_STALE_MS,
  IOT_DEFAULT_PASSWORD,
  IOT_DEFAULT_USERNAME,
  IOT_DISCOVERY_MS,
  IOT_REPORT_MS,
  iotClientOnline,
  iotKindOf,
  iotServerClients,
  iotStateOf,
  iotThingSpec,
  iotThingSpecByKind,
} from '@/simulator/iot'
import type { IotServerClient, IotThingKind, IotThingState, NetworkDevice } from '@/types/network'

export function IotTab({ deviceId }: { deviceId: string }) {
  const device = useNetworkStore(state => state.devices.find(item => item.id === deviceId))
  return device ? <IotThingSession key={device.id} device={device} /> : null
}

function sensorReading(kind: IotThingKind, state: IotThingState, translate: (key: string) => string) {
  switch (kind) {
    case 'smoke-detector':
      return state.smoke ? translate('Smoke detected') : translate('Clear air')
    case 'water-detector':
      return `${Math.round(state.level ?? 0)}% ${translate('Water level')}`
    case 'light-sensor':
      return `${Math.round(state.level ?? 0)}% ${translate('Light level')}`
    case 'thermostat':
      return `${(state.temperature ?? 22).toFixed(1)} °C`
    case 'humiture':
      return `${(state.temperature ?? 22).toFixed(1)} °C · ${Math.round(state.humidity ?? 0)}% ${translate('Humidity')}`
    case 'motion-sensor':
      return state.motion ? translate('Motion detected') : translate('No motion')
    case 'sound-sensor':
      return `${Math.round(state.sound ?? 0)} dB`
    case 'sensor':
      return `${state.reading ?? 0} ${state.unit ?? ''}`.trim()
    case 'generator':
      return `${Math.round(state.output ?? 0)}%`
    case 'battery':
      return `${Math.round(state.level ?? 0)}%`
    case 'valve':
      return state.open ? translate('Open') : translate('Close')
    case 'fire-detector':
      return state.fire ? translate('Fire detected') : translate('No fire')
    default:
      return ''
  }
}

function IotThingSession({ device }: { device: NetworkDevice }) {
  const { t } = useI18n()
  const { updateDeviceConfig, setIotState, requestDhcp, simulationTick } = useNetworkStore(useShallow(state => ({
    updateDeviceConfig: state.updateDeviceConfig,
    setIotState: state.setIotState,
    requestDhcp: state.requestDhcp,
    simulationTick: state.simulationTick,
  })))
  const [serverAddressDraft, setServerAddressDraft] = useState(device.config.iotServerAddress ?? 'auto')
  const [serverAddressError, setServerAddressError] = useState('')
  const spec = iotThingSpec(device.model)
  const kind = iotKindOf(device)
  const state = iotStateOf(device)
  const runtime = device.iotRuntime
  const registered = runtime?.state === 'registered' && !!runtime.serverAddress
  const powered = state.power === true
  const opened = state.open === true
  const level = Math.max(0, Math.min(100, state.level ?? 0))
  const temperature = state.temperature ?? 22
  const humidity = Math.max(0, Math.min(100, state.humidity ?? 0))
  const sound = Math.max(0, Math.min(100, state.sound ?? 0))
  const reading = state.reading ?? 0
  const output = Math.max(0, Math.min(100, state.output ?? 0))
  const ageSeconds = runtime?.lastReportTick !== undefined ? Math.max(0, (simulationTick - runtime.lastReportTick) * 0.06) : undefined
  const saveServerAddress = () => {
    const value = serverAddressDraft.trim() || 'auto'
    if (value !== 'auto' && !isValidIpv4(value)) {
      setServerAddressError(t('Enter an IPv4 address or leave automatic discovery enabled.'))
      return
    }
    setServerAddressError('')
    updateDeviceConfig(device.id, { iotServerAddress: value })
  }
  const actionButton = (patch: IotThingState, label: string, action: string, selected = false) => (
    <button
      type="button"
      data-iot-action={action}
      aria-pressed={selected}
      onClick={() => setIotState(device.id, patch)}
      className={`min-h-[40px] rounded-lg px-4 text-xs font-bold transition cursor-pointer shadow-xs ${selected ? 'bg-[#0284c7] text-white ring-1 ring-sky-400' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
    >
      {label}
    </button>
  )
  return (
    <div data-iot-tab className="flex-1 min-h-0 overflow-y-auto bg-white p-4 rounded-xl border border-[#94a3b8] shadow-xs space-y-4">
      <section className="space-y-3" aria-labelledby={`iot-controls-${device.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 id={`iot-controls-${device.id}`} className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('Smart device controls')}</h4>
            <p className="mt-1 text-xs text-slate-500">{t(spec.label)} · {device.model}</p>
          </div>
          <span
            data-iot-registration={registered ? 'registered' : 'searching'}
            className={`inline-flex min-h-[30px] items-center gap-2 rounded-full px-3 text-xs font-bold ${registered ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-amber-50 text-amber-700 border border-amber-300'}`}
          >
            <span className={`h-2 w-2 rounded-full ${registered ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {registered ? t('Registered') : t('Searching for an IoT server…')}
          </span>
        </div>

        {spec.control === 'toggle' && (
          <div className="flex flex-wrap gap-2">
            {actionButton({ power: true }, t('Turn on'), 'on', powered)}
            {actionButton({ power: false }, t('Turn off'), 'off', !powered)}
          </div>
        )}
        {spec.control === 'open-close' && (
          <div className="flex flex-wrap gap-2">
            {actionButton({ open: true }, t('Open'), 'open', opened)}
            {actionButton({ open: false }, t('Close'), 'close', !opened)}
          </div>
        )}
        {spec.control === 'level' && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={spec.min ?? 0}
                max={spec.max ?? 100}
                value={level}
                data-iot-action="level"
                onChange={event => setIotState(device.id, { level: Number(event.target.value) })}
                className="h-2 w-full max-w-sm cursor-pointer accent-sky-600"
                aria-label={kind === 'blinds' ? t('Blinds position') : t('Level')}
              />
              <span className="text-xs font-bold text-slate-700 min-w-[3rem]">{level}{spec.unit}</span>
            </div>
          </div>
        )}
        {spec.control === 'temperature' && (
          <div className="flex items-center gap-3">
            <button type="button" data-iot-action="temperature-down" onClick={() => setIotState(device.id, { temperature: temperature - 1 })} className="min-h-[40px] w-12 rounded-lg border border-slate-300 bg-white text-lg font-bold text-slate-700 hover:bg-slate-50">−</button>
            <span className="min-w-[4.5rem] text-center text-sm font-bold text-slate-800">{temperature.toFixed(1)} °C</span>
            <button type="button" data-iot-action="temperature-up" onClick={() => setIotState(device.id, { temperature: temperature + 1 })} className="min-h-[40px] w-12 rounded-lg border border-slate-300 bg-white text-lg font-bold text-slate-700 hover:bg-slate-50">＋</button>
          </div>
        )}
        {spec.control === 'smoke' && (
          <div className="flex flex-wrap items-center gap-2">
            {actionButton({ smoke: true }, t('Simulate smoke'), 'smoke-on', state.smoke === true)}
            {actionButton({ smoke: false }, t('Clear smoke'), 'smoke-off', state.smoke !== true)}
            <span className="text-xs text-slate-500">{sensorReading(kind, state, t)}</span>
          </div>
        )}
        {spec.control === 'humiture' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs font-semibold text-slate-600">{t('Temperature')}</span>
              <input
                type="range"
                min={0}
                max={50}
                value={Math.round(temperature)}
                data-iot-action="humiture-temperature"
                onChange={event => setIotState(device.id, { temperature: Number(event.target.value) })}
                className="h-2 w-full max-w-sm cursor-pointer accent-sky-600"
                aria-label={t('Temperature')}
              />
              <span className="min-w-[4rem] text-xs font-bold text-slate-700">{temperature.toFixed(1)} °C</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs font-semibold text-slate-600">{t('Humidity')}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(humidity)}
                data-iot-action="humiture-humidity"
                onChange={event => setIotState(device.id, { humidity: Number(event.target.value) })}
                className="h-2 w-full max-w-sm cursor-pointer accent-sky-600"
                aria-label={t('Humidity')}
              />
              <span className="min-w-[4rem] text-xs font-bold text-slate-700">{Math.round(humidity)}%</span>
            </div>
          </div>
        )}
        {spec.control === 'motion' && (
          <div className="flex flex-wrap items-center gap-2">
            {actionButton({ motion: true }, t('Simulate motion'), 'motion-on', state.motion === true)}
            {actionButton({ motion: false }, t('Clear motion'), 'motion-off', state.motion !== true)}
            <span className="text-xs text-slate-500">{sensorReading(kind, state, t)}</span>
          </div>
        )}
        {spec.control === 'sound' && (
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sound)}
              data-iot-action="sound-level"
              onChange={event => setIotState(device.id, { sound: Number(event.target.value) })}
              className="h-2 w-full max-w-sm cursor-pointer accent-sky-600"
              aria-label={t('Sound level')}
            />
            <span className="min-w-[4rem] text-xs font-bold text-slate-700">{Math.round(sound)}{spec.unit}</span>
          </div>
        )}
        {spec.control === 'reading' && (
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={spec.min ?? 0}
              max={spec.max ?? 1000}
              step={spec.max !== undefined && spec.max <= 50 ? 0.1 : 1}
              value={reading}
              data-iot-action="reading"
              onChange={event => setIotState(device.id, { reading: Number(event.target.value) })}
              className="h-2 w-full max-w-sm cursor-pointer accent-sky-600"
              aria-label={t('Reading')}
            />
            <span className="min-w-[5rem] text-xs font-bold text-slate-700">{reading} {state.unit ?? spec.unit ?? ''}</span>
          </div>
        )}
        {spec.control === 'output' && (
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(output)}
              data-iot-action="output"
              onChange={event => setIotState(device.id, { output: Number(event.target.value) })}
              className="h-2 w-full max-w-sm cursor-pointer accent-sky-600"
              aria-label={t('Output')}
            />
            <span className="min-w-[4rem] text-xs font-bold text-slate-700">{Math.round(output)}%</span>
          </div>
        )}
        {spec.control === 'fire' && (
          <div className="flex flex-wrap items-center gap-2">
            {actionButton({ fire: true }, t('Simulate fire'), 'fire-on', state.fire === true)}
            {actionButton({ fire: false }, t('Clear fire'), 'fire-off', state.fire !== true)}
            <span className="text-xs text-slate-500">{sensorReading(kind, state, t)}</span>
          </div>
        )}
        {spec.control === 'button' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-iot-action="press"
              onClick={() => setIotState(device.id, { pressedAtTick: simulationTick })}
              className="min-h-[40px] rounded-lg px-5 text-xs font-bold bg-[#0284c7] text-white hover:bg-[#0369a1] cursor-pointer shadow-xs"
            >
              {t('Press')}
            </button>
            {state.pressedAtTick !== undefined && <span className="text-xs text-slate-500">{t('Last press at tick')} {state.pressedAtTick}</span>}
          </div>
        )}
      </section>

      <section className="pt-4 border-t border-[#e2e8f0] space-y-3" aria-labelledby={`iot-registration-${device.id}`}>
        <h4 id={`iot-registration-${device.id}`} className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('Registration status')}</h4>
        <p className="text-xs text-slate-600">
          {registered
            ? `${t('Connected to')} ${runtime?.serverName ?? runtime?.serverAddress} (${runtime?.serverAddress}).`
            : t('The device broadcasts a discovery request until an IoT registration server answers.')}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600 sm:grid-cols-4">
          <div><dt className="font-semibold text-slate-500">{t('Discovery interval')}</dt><dd>{(IOT_DISCOVERY_MS / 1000).toFixed(1)} s</dd></div>
          <div><dt className="font-semibold text-slate-500">{t('State report interval')}</dt><dd>{(IOT_REPORT_MS / 1000).toFixed(1)} s</dd></div>
          <div><dt className="font-semibold text-slate-500">{t('Reports sent')}</dt><dd>{runtime?.reportsSent ?? 0}</dd></div>
          <div><dt className="font-semibold text-slate-500">{t('Commands applied')}</dt><dd>{runtime?.controlsApplied ?? 0}</dd></div>
        </dl>
        {registered && ageSeconds !== undefined && <p className="text-xs text-slate-500">{t('Last state report')}: {ageSeconds.toFixed(1)} {t('seconds ago')}</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor={`iot-server-address-${device.id}`}>{t('IoT Server Address')}</label>
            <input
              id={`iot-server-address-${device.id}`}
              type="text"
              value={serverAddressDraft}
              onChange={event => setServerAddressDraft(event.target.value)}
              placeholder="auto"
              className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono text-slate-800"
            />
          </div>
          <button type="button" onClick={saveServerAddress} className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">{t('Save')}</button>
        </div>
        {serverAddressError && <p className="text-xs text-rose-600">{serverAddressError}</p>}
        <p className="text-xs text-slate-500">{t('Enter an IPv4 address or leave automatic discovery enabled.')}</p>
      </section>

      <section className="pt-4 border-t border-[#e2e8f0] space-y-3" aria-labelledby={`iot-network-${device.id}`}>
        <h4 id={`iot-network-${device.id}`} className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('Network')}</h4>
        <ul className="space-y-2">
          {device.ports.map(port => (
            <li key={port.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-700">{port.name}</span>
              <span className="font-mono text-slate-600">{port.ipAddress ? `${port.ipAddress}${port.subnetMask ? ` / ${port.subnetMask}` : ''}` : t('No IPv4 address')}</span>
              <span className={`h-2.5 w-2.5 rounded-full ${port.status === 'up' && port.adminStatus === 'up' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => useWorkspaceStore.getState().setStatus(requestDhcp(device.id))} className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">{t('Obtain DHCP Address')}</button>
          <span className="text-xs text-slate-500">{t('Use the Config tab to change interface addresses.')}</span>
        </div>
      </section>

      <p className="pt-2 text-[11px] leading-relaxed text-slate-500">{t('This smart device runs a reduced IoT model: discovery broadcast, registration with an IoT server, periodic state reports and remote commands. Board programming (MCU/SBC), rule editing and Bluetooth pairing are not simulated.')}</p>
    </div>
  )
}

export function IotServiceSection({ device }: { device: NetworkDevice }) {
  const { t } = useI18n()
  const { devices, updateDeviceConfig, sendIotControl, simulationTick } = useNetworkStore(useShallow(state => ({
    devices: state.devices,
    updateDeviceConfig: state.updateDeviceConfig,
    sendIotControl: state.sendIotControl,
    simulationTick: state.simulationTick,
  })))
  const credentials = device.config.iotCredentials ?? { username: IOT_DEFAULT_USERNAME, password: IOT_DEFAULT_PASSWORD }
  const [usernameDraft, setUsernameDraft] = useState(credentials.username)
  const [passwordDraft, setPasswordDraft] = useState(credentials.password)
  const [message, setMessage] = useState('')
  if (device.type !== 'server') return null
  const enabled = device.config.iotServiceEnabled === true
  const clients = iotServerClients(device)
  const issue = (client: IotServerClient, patch: IotThingState) => {
    const clientDevice = devices.find(item => item.id === client.deviceId)
    const reason = sendIotControl(device.id, client.deviceId, patch)
    setMessage(reason ?? `${t('IoT command sent to')} ${clientDevice?.name ?? client.deviceId}.`)
  }
  const controlButtons = (client: IotServerClient) => {
    const clientDevice = devices.find(item => item.id === client.deviceId)
    const clientState = clientDevice ? iotStateOf(clientDevice) : {}
    const spec = client.model ? iotThingSpec(client.model) : iotThingSpecByKind(client.kind)
    if (spec.control === 'toggle') return (
      <>
        <button type="button" data-iot-action="on" onClick={() => issue(client, { power: true })} className="min-h-[32px] rounded border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{t('Turn on')}</button>
        <button type="button" data-iot-action="off" onClick={() => issue(client, { power: false })} className="min-h-[32px] rounded border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{t('Turn off')}</button>
      </>
    )
    if (spec.control === 'open-close') return (
      <>
        <button type="button" data-iot-action="open" onClick={() => issue(client, { open: true })} className="min-h-[32px] rounded border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{t('Open')}</button>
        <button type="button" data-iot-action="close" onClick={() => issue(client, { open: false })} className="min-h-[32px] rounded border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{t('Close')}</button>
      </>
    )
    if (spec.control === 'level') return (
      <>
        {[0, 50, 100].map(value => (
          <button key={value} type="button" data-iot-action={`level-${value}`} onClick={() => issue(client, { level: value })} className="min-h-[32px] rounded border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{value}</button>
        ))}
      </>
    )
    if (spec.control === 'temperature') return (
      <>
        <button type="button" data-iot-action="temperature-down" onClick={() => issue(client, { temperature: (clientState.temperature ?? 22) - 1 })} className="min-h-[32px] rounded border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">−</button>
        <button type="button" data-iot-action="temperature-up" onClick={() => issue(client, { temperature: (clientState.temperature ?? 22) + 1 })} className="min-h-[32px] rounded border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">＋</button>
      </>
    )
    if (spec.control === 'button') return (
      <button type="button" data-iot-action="press" onClick={() => issue(client, { pressedAtTick: simulationTick })} className="min-h-[32px] rounded border border-slate-300 px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{t('Press')}</button>
    )
    return <span className="text-[11px] text-slate-500">{clientDevice ? sensorReading(client.kind, iotStateOf(clientDevice), t) : t('Offline')}</span>
  }
  return (
    <section data-iot-service className="pt-4 border-t border-[#e2e8f0] space-y-3" aria-labelledby={`iot-service-${device.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 id={`iot-service-${device.id}`} className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t('IoT Registration Service')}</h4>
          <p className="mt-1 text-xs text-slate-500">{t('Smart devices discover this server, register, and report state so you can control them remotely.')}</p>
        </div>
        <label className="inline-flex min-h-[40px] items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={event => updateDeviceConfig(device.id, { iotServiceEnabled: event.target.checked })}
            className="h-4 w-4 accent-sky-600"
          />
          {t('Enable IoT registration service')}
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor={`iot-user-${device.id}`}>{t('Username')}</label>
          <input id={`iot-user-${device.id}`} type="text" value={usernameDraft} onChange={event => setUsernameDraft(event.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono text-slate-800" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor={`iot-pass-${device.id}`}>{t('Password')}</label>
          <input id={`iot-pass-${device.id}`} type="password" value={passwordDraft} onChange={event => setPasswordDraft(event.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono text-slate-800" />
        </div>
        <button
          type="button"
          onClick={() => { updateDeviceConfig(device.id, { iotCredentials: { username: usernameDraft, password: passwordDraft } }); setMessage(t('Credentials saved.')) }}
          className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          {t('Save')}
        </button>
      </div>
      {!enabled && <p className="text-xs text-slate-500">{t('The IoT registration service is disabled.')}</p>}
      {enabled && clients.length === 0 && <p className="text-xs text-slate-500">{t('No IoT devices have registered yet.')}</p>}
      {enabled && clients.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-bold text-slate-700">{t('Registered devices')} ({clients.length})</h5>
          <ul className="space-y-2">
            {clients.map(client => {
              const clientDevice = devices.find(item => item.id === client.deviceId)
              const online = iotClientOnline(client, simulationTick)
              const age = Math.max(0, (simulationTick - client.lastSeenTick) * 0.06)
              const spec = client.model ? iotThingSpec(client.model) : iotThingSpecByKind(client.kind)
              return (
                <li key={client.deviceId} data-iot-client={client.deviceId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-slate-700">
                      <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span>{clientDevice?.name ?? client.deviceId}</span>
                      <span className="font-normal text-slate-500">({t(spec.label)})</span>
                    </div>
                    <span className="font-mono text-slate-600">{client.address}</span>
                    <span className="text-slate-500">{online ? t('Online') : t('Offline')} · {t('last report')} {age.toFixed(1)} {t('seconds ago')}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">{controlButtons(client)}</div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {message && <p role="status" className="text-xs font-semibold text-sky-700">{message}</p>}
      <p className="text-[11px] leading-relaxed text-slate-500">{t('The dashboard reflects the shared simulation state and the last registration or report from each device. Offline devices are marked after')} {Math.round(IOT_CLIENT_STALE_MS / 1000)} {t('seconds without a report.')}</p>
    </section>
  )
}
