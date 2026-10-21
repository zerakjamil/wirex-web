'use client'

import { useMemo, useState } from 'react'
import type { NetworkControllerDiscovery, NetworkControllerDiscoveryMode, NetworkDevice, NetworkLink } from '@/types/network'
import { useI18n } from '@/i18n/useI18n'
import { useNetworkStore } from '@/store/networkStore'
import {
  currentNetworkControllerDiscovery,
  defaultNetworkControllerRange,
  discoverNetworkController,
  hashNetworkControllerPassword,
  isNetworkController,
  isNetworkControllerHost,
  networkControllerAddresses,
  networkControllerDeviceStatus,
  networkControllerInventory,
  networkControllerState,
  primaryNetworkControllerAddress,
} from '@/simulator/networkController'

type NcTab = 'dashboard' | 'discovery' | 'inventory' | 'topology'
type Notice = { tone: 'success' | 'error'; key: string }

const fieldClass = 'min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15'
const primaryButton = 'inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg border border-teal-700 bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'inline-flex min-h-[34px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2'

function managementIp(device: NetworkDevice): string {
  return networkControllerAddresses(device)[0]?.ip ?? '—'
}

function deviceName(device: NetworkDevice): string {
  return device.name || device.config.hostname || device.model
}

function statusKey(device: NetworkDevice): string {
  switch (networkControllerDeviceStatus(device)) {
    case 'active': return 'Active'
    case 'idle': return 'Idle'
    case 'no-ip': return 'No IP'
    default: return 'Powered off'
  }
}

function modeKey(mode: NetworkControllerDiscoveryMode): string {
  return mode === 'cdp' ? 'Connected topology' : 'IP range'
}

function discoveryReasonKey(reason: NetworkControllerDiscovery['reason']): string {
  switch (reason) {
    case 'power-off': return 'The controller is powered off.'
    case 'no-ip': return 'The controller has no management IP address.'
    case 'no-active-link': return 'The controller has no active network link.'
    case 'invalid-range': return 'IP address range is invalid.'
    default: return 'Discovery failed.'
  }
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

function NavGlyph({ tab }: { tab: NcTab }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      {tab === 'dashboard' && <><rect x="2.5" y="2.5" width="6" height="6" rx="1" {...common} /><rect x="11.5" y="2.5" width="6" height="6" rx="1" {...common} /><rect x="2.5" y="11.5" width="6" height="6" rx="1" {...common} /><rect x="11.5" y="11.5" width="6" height="6" rx="1" {...common} /></>}
      {tab === 'discovery' && <><circle cx="9" cy="9" r="5.5" {...common} /><path d="m13 13 4 4" {...common} /><path d="M6.5 9h5M9 6.5v5" {...common} /></>}
      {tab === 'inventory' && <><path d="M4 3.5h9l3 3v10H4z" {...common} /><path d="M7 7h6M7 10h6M7 13h4" {...common} /></>}
      {tab === 'topology' && <><circle cx="10" cy="4" r="2" {...common} /><circle cx="4" cy="16" r="2" {...common} /><circle cx="16" cy="16" r="2" {...common} /><path d="m9 5.8-4 8.4M11 5.8l4 8.4M6 16h8" {...common} /></>}
    </svg>
  )
}

function StatGlyph({ kind }: { kind: 'devices' | 'active' | 'hosts' | 'links' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      {kind === 'devices' && <><rect x="3" y="4" width="8" height="7" rx="1.5" {...common} /><rect x="13" y="13" width="8" height="7" rx="1.5" {...common} /><path d="M11 7.5h2v9h-2M7 11v3h6" {...common} /></>}
      {kind === 'active' && <><path d="M3 12h4l2-5 4 10 2-5h6" {...common} /></>}
      {kind === 'hosts' && <><rect x="3" y="4" width="18" height="12" rx="2" {...common} /><path d="M8 20h8M12 16v4" {...common} /></>}
      {kind === 'links' && <><path d="M9.5 14.5 14.5 9.5M7.5 17.5l-1 1a3.2 3.2 0 0 1-4.5-4.5l3-3a3.2 3.2 0 0 1 4.5 0M16.5 6.5l1-1a3.2 3.2 0 0 1 4.5 4.5l-3 3a3.2 3.2 0 0 1-4.5 0" {...common} /></>}
    </svg>
  )
}

function DeviceDetails({ device, links }: { device: NetworkDevice | undefined; links: NetworkLink[] }) {
  const { t } = useI18n()
  if (!device) {
    return (
      <aside className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">
        {t('Select a device to see its details.')}
      </aside>
    )
  }
  const ip = managementIp(device)
  const linkCount = links.filter(link => link.status === 'up' && (link.fromDeviceId === device.id || link.toDeviceId === device.id)).length
  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="nc-device-details">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-teal-700">{t('Details')}</p>
          <h3 className="mt-1 truncate text-sm font-bold text-slate-900" dir="ltr">{deviceName(device)}</h3>
          <p className="mt-0.5 font-mono text-[10px] text-slate-500" dir="ltr">{device.model}</p>
        </div>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-600">{t(statusKey(device))}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3 text-[11px]">
        <div><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{t('Management IP')}</dt><dd className="mt-1 font-mono text-slate-800">{ip}</dd></div>
        <div><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{t('Type')}</dt><dd className="mt-1 uppercase text-slate-800">{device.type}</dd></div>
        <div><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{t('Links')}</dt><dd className="mt-1 text-slate-800">{linkCount}</dd></div>
        <div><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{t('Ports')}</dt><dd className="mt-1 text-slate-800">{device.ports.length}</dd></div>
      </dl>
      <div className="mt-3">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{t('Ports')}</p>
        <ul className="mt-1.5 space-y-1.5">
          {device.ports.slice(0, 8).map(port => {
            const up = port.adminStatus === 'up' && port.status !== 'down'
            return (
              <li key={port.id} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="min-w-0 truncate font-mono text-slate-700" dir="ltr">{port.name}</span>
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${up ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
                  {t(up ? 'Up' : 'Down')}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}

export function NetworkControllerApp({ deviceId }: { deviceId: string }) {
  const { t } = useI18n()
  const device = useNetworkStore(state => state.devices.find(item => item.id === deviceId))
  const devices = useNetworkStore(state => state.devices)
  const links = useNetworkStore(state => state.links)
  const updateDeviceConfig = useNetworkStore(state => state.updateDeviceConfig)

  const [sessionUser, setSessionUser] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [tab, setTab] = useState<NcTab>('dashboard')
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [mode, setMode] = useState<NetworkControllerDiscoveryMode>('cdp')
  const [discoveryName, setDiscoveryName] = useState('')
  const [rangeStart, setRangeStart] = useState(() => defaultNetworkControllerRange(device ? primaryNetworkControllerAddress(device)?.ip : undefined).start)
  const [rangeEnd, setRangeEnd] = useState(() => defaultNetworkControllerRange(device ? primaryNetworkControllerAddress(device)?.ip : undefined).end)
  const [notice, setNotice] = useState<Notice | null>(null)

  const state = device ? networkControllerState(device) : {}
  const accounts = state.accounts ?? []
  const authenticated = Boolean(sessionUser && accounts.some(account => account.username === sessionUser))
  const currentDiscovery = device ? currentNetworkControllerDiscovery(device) : undefined
  const inventory = useMemo(() => device ? networkControllerInventory(device, devices) : [], [device, devices])
  const address = device ? primaryNetworkControllerAddress(device) : undefined

  if (!device || !isNetworkController(device)) return null

  const selectedDevice = inventory.find(item => item.id === selectedDeviceId)
  const discoveredIds = new Set([device.id, ...inventory.map(item => item.id)])
  const activeLinks = links.filter(link => link.status === 'up' && discoveredIds.has(link.fromDeviceId) && discoveredIds.has(link.toDeviceId))
  const activeCount = inventory.filter(item => networkControllerDeviceStatus(item) === 'active').length
  const hostCount = inventory.filter(isNetworkControllerHost).length
  const networkCount = inventory.length - hostCount

  const setupAccount = () => {
    const cleanUsername = username.trim()
    if (!cleanUsername) { setAuthError('Enter a username.'); return }
    if (password.length < 4) { setAuthError('Password must be at least 4 characters.'); return }
    if (password !== confirmPassword) { setAuthError('Passwords do not match.'); return }
    const next = {
      ...state,
      accounts: [{ username: cleanUsername, passwordHash: hashNetworkControllerPassword(password), role: 'admin' as const }],
      discoveries: state.discoveries ?? [],
    }
    updateDeviceConfig(device.id, { networkController: next })
    setSessionUser(cleanUsername)
    setAuthError(null)
    setPassword('')
    setConfirmPassword('')
    setNotice({ tone: 'success', key: 'Administrator account created.' })
  }

  const signIn = () => {
    const cleanUsername = username.trim()
    const account = accounts.find(item => item.username === cleanUsername)
    if (!account || account.passwordHash !== hashNetworkControllerPassword(password)) {
      setAuthError('Incorrect username or password.')
      return
    }
    setSessionUser(account.username)
    setAuthError(null)
    setPassword('')
    setTab('dashboard')
  }

  const runDiscovery = () => {
    const result = discoverNetworkController(device, devices, links, {
      name: discoveryName.trim() || t(modeKey(mode)),
      mode,
      rangeStart,
      rangeEnd,
    })
    const next = {
      ...state,
      discoveries: [result.discovery, ...(state.discoveries ?? [])].slice(0, 20),
      lastDiscoveryId: result.ok ? result.discovery.id : state.lastDiscoveryId,
    }
    updateDeviceConfig(device.id, { networkController: next })
    if (result.ok) {
      setSelectedDeviceId(result.deviceIds[0] ?? null)
      setNotice({ tone: 'success', key: 'Discovery completed.' })
      setTab('inventory')
    } else {
      setNotice({ tone: 'error', key: discoveryReasonKey(result.discovery.reason) })
    }
  }

  const viewDiscovery = (discovery: NetworkControllerDiscovery) => {
    updateDeviceConfig(device.id, {
      networkController: { ...state, discoveries: state.discoveries ?? [], lastDiscoveryId: discovery.id },
    })
    setSelectedDeviceId(discovery.deviceIds[0] ?? null)
    setNotice(null)
    setTab('inventory')
  }

  const signOut = () => {
    setSessionUser(null)
    setPassword('')
    setAuthError(null)
    setNotice(null)
    setTab('dashboard')
  }

  const authCard = (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_20%_0%,#dff5f4_0,transparent_44%),linear-gradient(180deg,#f5f8fa,#edf3f5)] p-5">
      <div className="w-full max-w-[410px] rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.12)]" data-testid="nc-auth">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="7" height="6" rx="1.4" /><rect x="14" y="4" width="7" height="6" rx="1.4" /><rect x="8.5" y="15" width="7" height="6" rx="1.4" />
              <path d="M6.5 10v2.5h11V10M12 12.5V15" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-teal-700">{t('Network controller management')}</p>
            <h2 className="text-lg font-bold text-slate-900">{t('Network Controller')}</h2>
          </div>
        </div>
        <p className="mb-5 text-xs leading-5 text-slate-500">
          {accounts.length ? t('Sign in to manage the discovered network.') : t('Create the administrator account for this controller.')}
        </p>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (accounts.length) signIn(); else setupAccount() }}>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('Username')}</span>
            <input className={fieldClass} value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" data-testid="nc-username" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('Password')}</span>
            <input type="password" className={fieldClass} value={password} onChange={event => setPassword(event.target.value)} autoComplete={accounts.length ? 'current-password' : 'new-password'} data-testid="nc-password" />
          </label>
          {!accounts.length && (
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('Confirm Password')}</span>
              <input type="password" className={fieldClass} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" data-testid="nc-confirm-password" />
            </label>
          )}
          {authError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{t(authError)}</p>}
          <button type="submit" className={`${primaryButton} w-full`} data-testid="nc-auth-submit">{t(accounts.length ? 'Sign in' : 'Setup')}</button>
        </form>
        <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-400">{t('Classroom-only account. The workspace file is not encrypted.')}</p>
      </div>
    </div>
  )

  const tabButton = (id: NcTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => { setTab(id); setNotice(null) }}
      aria-current={tab === id ? 'page' : undefined}
      data-testid={`nc-tab-${id}`}
      className={`inline-flex min-h-[36px] items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold transition ${tab === id ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
    >
      <NavGlyph tab={id} />
      {t(label)}
    </button>
  )

  const emptyState = (message: string) => (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-teal-100 bg-teal-50 text-teal-700">
        <NavGlyph tab="discovery" />
      </div>
      <p className="max-w-[360px] text-xs leading-5 text-slate-500">{t(message)}</p>
      <button type="button" className={`${primaryButton} mt-4`} onClick={() => setTab('discovery')}>{t('Run Discovery')}</button>
    </div>
  )

  const dashboard = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t('Dashboard')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('Network controller management')}</p>
        </div>
        <button type="button" className={primaryButton} onClick={() => setTab('discovery')} data-testid="nc-run-discovery-shortcut">{t('Run Discovery')}</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ['devices', 'Discovered devices', inventory.length, 'nc-stat-devices'],
          ['active', 'Active', activeCount, 'nc-stat-active'],
          ['hosts', 'Hosts', hostCount, 'nc-stat-hosts'],
          ['links', 'Links', activeLinks.length, 'nc-stat-links'],
        ] as const).map(([kind, label, count, testId]) => (
          <button key={kind} type="button" onClick={() => setTab(kind === 'links' ? 'topology' : 'inventory')} className="group rounded-xl border border-slate-200 bg-white p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md" data-testid={testId}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-teal-100 bg-teal-50 text-teal-700"><StatGlyph kind={kind} /></span>
              <span className="text-2xl font-bold leading-none text-slate-900">{count}</span>
            </div>
            <span className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{t(label)}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.7fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-slate-900">{t('Last discovery')}</h3>
            {currentDiscovery && <span className={`rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${currentDiscovery.status === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{t(currentDiscovery.status === 'complete' ? 'Complete' : 'Failed')}</span>}
          </div>
          {currentDiscovery ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-bold text-slate-800" dir="ltr">{currentDiscovery.name}</p>
              <p className="text-[11px] text-slate-500">{t(modeKey(currentDiscovery.mode))} · {formatTime(currentDiscovery.createdAtMs)}</p>
              <p className="text-[11px] text-slate-600">{t('Devices found')}: <b>{currentDiscovery.deviceIds.length}</b></p>
              {currentDiscovery.status === 'failed' && <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{t(discoveryReasonKey(currentDiscovery.reason))}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className={secondaryButton} onClick={() => setTab('inventory')}>{t('Open Inventory')}</button>
                <button type="button" className={secondaryButton} onClick={() => setTab('topology')}>{t('Open Topology')}</button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs leading-5 text-slate-500">{t('Run a discovery to build the inventory.')}</p>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-900">{t('Controller')}</h3>
          <dl className="mt-3 space-y-2 text-[11px]">
            <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">{t('Management IP')}</dt><dd className="font-mono text-slate-800">{address?.ip ?? '—'}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">{t('Status')}</dt><dd className={`font-semibold ${networkControllerDeviceStatus(device) === 'active' ? 'text-emerald-700' : 'text-slate-600'}`}>{t(statusKey(device))}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">{t('Ports')}</dt><dd className="text-slate-800">{device.ports.length}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">{t('Network devices')}</dt><dd className="text-slate-800">{networkCount}</dd></div>
          </dl>
        </section>
      </div>
      {!currentDiscovery && emptyState('No discovery has run yet.')}
    </div>
  )

  const discovery = (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">{t('Discovery')}</h2>
        <p className="mt-1 max-w-[680px] text-xs leading-5 text-slate-500">{t('Discovery uses active links and configured management addresses. It does not send CDP frames.')}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('Discovery name')}</span>
              <input className={fieldClass} value={discoveryName} onChange={event => setDiscoveryName(event.target.value)} placeholder={t('Optional')} data-testid="nc-discovery-name" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('Discovery method')}</span>
              <select className={fieldClass} value={mode} onChange={event => setMode(event.target.value as NetworkControllerDiscoveryMode)} data-testid="nc-discovery-mode">
                <option value="cdp">{t('Connected topology')}</option>
                <option value="ip-range">{t('IP range')}</option>
              </select>
            </label>
            {mode === 'ip-range' && (
              <>
                <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('Start IP')}</span><input className={`${fieldClass} font-mono`} value={rangeStart} onChange={event => setRangeStart(event.target.value)} placeholder="192.168.1.1" dir="ltr" data-testid="nc-range-start" /></label>
                <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('End IP')}</span><input className={`${fieldClass} font-mono`} value={rangeEnd} onChange={event => setRangeEnd(event.target.value)} placeholder="192.168.1.254" dir="ltr" data-testid="nc-range-end" /></label>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <button type="button" className={primaryButton} onClick={runDiscovery} data-testid="nc-run-discovery">{t('Run Discovery')}</button>
            <span className="text-[10px] text-slate-400">{t('Active links are required.')}</span>
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-900">{t('Discovery history')}</h3>
          <div className="mt-3 space-y-2">
            {(state.discoveries ?? []).slice(0, 6).map(item => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-[11px] font-bold text-slate-800" dir="ltr">{item.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{t(modeKey(item.mode))} · {formatTime(item.createdAtMs)}</p></div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${item.status === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{t(item.status === 'complete' ? 'Complete' : 'Failed')}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500">{t('Devices found')}: <b>{item.deviceIds.length}</b></span>
                  {item.status === 'complete' && <button type="button" className="text-[10px] font-bold text-teal-700 underline-offset-2 hover:underline" onClick={() => viewDiscovery(item)}>{t('View results')}</button>}
                </div>
              </div>
            ))}
            {(state.discoveries ?? []).length === 0 && <p className="text-xs text-slate-500">{t('No discovery has run yet.')}</p>}
          </div>
        </section>
      </div>
    </div>
  )

  const inventoryView = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-base font-bold text-slate-900">{t('Inventory')}</h2><p className="mt-1 text-xs text-slate-500">{t('Devices found')}: {inventory.length}</p></div>
        {currentDiscovery && <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-500">{t('Last discovery')}: <b className="text-slate-700">{formatTime(currentDiscovery.createdAtMs)}</b></span>}
      </div>
      {inventory.length === 0 ? emptyState('Run a discovery to build the inventory.') : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-start text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500">
                  <tr>
                    {['Device', 'Model', 'Type', 'Management IP', 'Status', 'Links'].map(label => <th key={label} className="border-b border-slate-200 px-3 py-2.5 text-start font-bold">{t(label)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => {
                    const linkCount = links.filter(link => link.status === 'up' && (link.fromDeviceId === item.id || link.toDeviceId === item.id)).length
                    return (
                      <tr key={item.id} tabIndex={0} role="button" aria-pressed={selectedDeviceId === item.id} onClick={() => setSelectedDeviceId(item.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelectedDeviceId(item.id) }} className={`cursor-pointer border-b border-slate-100 outline-none transition hover:bg-teal-50/40 focus-visible:bg-teal-50 ${selectedDeviceId === item.id ? 'bg-teal-50/70' : ''}`} data-testid="nc-inventory-row">
                        <td className="px-3 py-2.5 font-semibold text-slate-800"><span dir="ltr">{deviceName(item)}</span></td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-slate-600"><span dir="ltr">{item.model}</span></td>
                        <td className="px-3 py-2.5 uppercase text-slate-500">{item.type}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-700">{managementIp(item)}</td>
                        <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1.5 ${networkControllerDeviceStatus(item) === 'active' ? 'text-emerald-700' : 'text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${networkControllerDeviceStatus(item) === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />{t(statusKey(item))}</span></td>
                        <td className="px-3 py-2.5 text-slate-600">{linkCount}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <DeviceDetails device={selectedDevice} links={links} />
        </div>
      )}
    </div>
  )

  const topologyView = (() => {
    const nodes = [device, ...inventory]
    const nodeIds = new Set(nodes.map(node => node.id))
    const width = 850
    const height = 410
    const pad = 70
    const minX = Math.min(...nodes.map(node => node.x))
    const maxX = Math.max(...nodes.map(node => node.x))
    const minY = Math.min(...nodes.map(node => node.y))
    const maxY = Math.max(...nodes.map(node => node.y))
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY, 1.5)
    const extraX = (width - pad * 2 - spanX * scale) / 2
    const extraY = (height - pad * 2 - spanY * scale) / 2
    const position = new Map(nodes.map(node => [node.id, { x: pad + extraX + (node.x - minX) * scale, y: pad + extraY + (node.y - minY) * scale }]))
    return (
      <div className="space-y-4">
        <div><h2 className="text-base font-bold text-slate-900">{t('Topology')}</h2><p className="mt-1 text-xs text-slate-500">{t('Discovered')}: {inventory.length} · {t('Links')}: {activeLinks.length}</p></div>
        {inventory.length === 0 ? emptyState('Run a discovery to build the inventory.') : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-4 px-2 pt-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-teal-600" />{t('Controller')}</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" />{t('Discovered')}</span>
              </div>
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="group" aria-label={t('Topology')} data-testid="nc-topology">
                <defs>
                  <pattern id="nc-grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M 26 0 L 0 0 0 26" fill="none" stroke="#e2e8f0" strokeWidth="1" /></pattern>
                </defs>
                <rect width={width} height={height} rx="10" fill="#f8fafc" />
                <rect width={width} height={height} rx="10" fill="url(#nc-grid)" opacity=".75" />
                {activeLinks.map(link => {
                  const from = position.get(link.fromDeviceId)
                  const to = position.get(link.toDeviceId)
                  if (!from || !to) return null
                  return <line key={link.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#b8c7d1" strokeWidth="2" strokeLinecap="round" />
                })}
                {nodes.filter(node => nodeIds.has(node.id)).map(node => {
                  const point = position.get(node.id)!
                  const isController = node.id === device.id
                  const selected = selectedDeviceId === node.id
                  const label = truncate(deviceName(node), 26)
                  return (
                    <g key={node.id} role="button" tabIndex={0} aria-label={deviceName(node)} onClick={() => setSelectedDeviceId(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelectedDeviceId(node.id) }} className="cursor-pointer focus:outline-none">
                      {selected && <circle cx={point.x} cy={point.y} r="23" fill="none" stroke="#f59e0b" strokeWidth="2.5" opacity=".9" />}
                      <circle cx={point.x} cy={point.y} r={isController ? 16 : 13} fill={isController ? '#0f766e' : '#64748b'} stroke="#fff" strokeWidth="3" />
                      {isController && <circle cx={point.x} cy={point.y} r="5" fill="#99f6e4" />}
                      <text x={point.x} y={point.y + 32} textAnchor="middle" fill="#334155" fontSize="10" fontWeight="700">{label}</text>
                      <text x={point.x} y={point.y + 44} textAnchor="middle" fill="#94a3b8" fontSize="8">{truncate(node.model, 20)}</text>
                    </g>
                  )
                })}
              </svg>
            </section>
            <DeviceDetails device={selectedDevice} links={links} />
          </div>
        )}
      </div>
    )
  })()

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f7fa] text-slate-800" data-testid="nc-app">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-900/20 bg-[#102b3a] px-5 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-teal-300/30 bg-teal-400/10 text-teal-200">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="6" rx="1.4" /><rect x="14" y="4" width="7" height="6" rx="1.4" /><rect x="8.5" y="15" width="7" height="6" rx="1.4" /><path d="M6.5 10v2.5h11V10M12 12.5V15" /></svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-teal-200/80">{t('Network controller management')}</p>
            <h1 className="truncate text-sm font-bold tracking-wide">{t('Network Controller')}</h1>
          </div>
        </div>
        {authenticated && (
          <div className="flex items-center gap-3">
            <span className="hidden text-[10px] text-slate-300 sm:inline">{t('Signed in as')} <b className="text-white">{sessionUser}</b></span>
            <button type="button" className="rounded-lg border border-white/20 px-3 py-1.5 text-[10px] font-bold text-slate-100 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300" onClick={signOut} data-testid="nc-sign-out">{t('Sign out')}</button>
          </div>
        )}
      </header>
      {!authenticated ? authCard : (
        <>
          <nav className="flex flex-shrink-0 flex-wrap items-center gap-1 border-b border-slate-200 bg-[#e8eef2] px-3 py-2" aria-label={t('Network controller management')}>
            {tabButton('dashboard', 'Dashboard')}
            {tabButton('discovery', 'Discovery')}
            {tabButton('inventory', 'Inventory')}
            {tabButton('topology', 'Topology')}
          </nav>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
            {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mb-4 rounded-lg border px-3 py-2 text-[11px] font-semibold ${notice.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{t(notice.key)}</p>}
            {tab === 'dashboard' && dashboard}
            {tab === 'discovery' && discovery}
            {tab === 'inventory' && inventoryView}
            {tab === 'topology' && topologyView}
          </div>
        </>
      )}
    </div>
  )
}
