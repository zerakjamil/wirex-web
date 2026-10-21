'use client'

import { useMemo, useState, type FormEvent } from 'react'
import type { CyberObserverDiscovery, CyberObserverDiscoveryMode, CyberObserverState, NetworkDevice } from '@/types/network'
import { useI18n } from '@/i18n/useI18n'
import { useNetworkStore } from '@/store/networkStore'
import {
  currentCyberObserverDiscovery,
  cyberObserverAddresses,
  cyberObserverDeviceStatus,
  cyberObserverFindings,
  cyberObserverInventory,
  cyberObserverState,
  defaultCyberObserverRange,
  discoverCyberObserver,
  hashCyberObserverPassword,
  isCyberObserver,
  primaryCyberObserverAddress,
  type CyberObserverFinding,
  type CyberObserverFindingCode,
  type CyberObserverFindingSeverity,
} from '@/simulator/cyberObserver'
import { activeTopologyLinks } from '@/simulator/topologyReachability'

type CoTab = 'dashboard' | 'discovery' | 'inventory' | 'findings' | 'topology'
type Notice = { tone: 'success' | 'error'; text: string }

const fieldClass = 'min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-700/15'
const primaryButton = 'inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg border border-amber-800 bg-amber-800 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'inline-flex min-h-[34px] items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-bold text-stone-700 transition hover:bg-stone-50'
const cardClass = 'rounded-xl border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]'

const SEVERITY_TONE: Record<CyberObserverFindingSeverity, string> = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  high: 'border-orange-200 bg-orange-50 text-orange-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-slate-200 bg-slate-50 text-slate-700',
}

const FINDING_TITLE: Record<CyberObserverFindingCode, string> = {
  'default-password': 'Default administrator password',
  'http-management': 'Management console uses HTTP',
  'open-wireless': 'Open wireless network',
  'wep-wireless': 'WEP wireless security',
  'default-snmp': 'Default SNMP community',
  'permit-any-inbound': 'Inbound ACL permits all traffic',
  'unreachable': 'Discovered device is unreachable',
  'management-address-missing': 'Management address is missing',
}

const FINDING_REMEDIATION: Record<CyberObserverFindingCode, string> = {
  'default-password': 'Change the administrator password.',
  'http-management': 'Restrict management access to trusted devices.',
  'open-wireless': 'Use WPA2-Personal on the wireless network.',
  'wep-wireless': 'Replace WEP with WPA2-Personal.',
  'default-snmp': 'Replace the default SNMP community.',
  'permit-any-inbound': 'Add a deny rule above the permit-all baseline.',
  'unreachable': 'Restore power or the management link.',
  'management-address-missing': 'Assign a management address to the device.',
}

const SEVERITY_LABEL: Record<CyberObserverFindingSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const DISCOVERY_REASON: Record<NonNullable<CyberObserverDiscovery['reason']>, string> = {
  'power-off': 'The appliance is powered off.',
  'no-ip': 'Configure a management IP address on the appliance first.',
  'no-active-link': 'Connect the appliance to an active link first.',
  'invalid-range': 'Enter a valid IPv4 range.',
}

function deviceLabel(device: NetworkDevice | undefined): string {
  return device?.name || device?.config.hostname || device?.model || '—'
}

function findingCount(findings: CyberObserverFinding[], deviceId: string): number {
  return findings.filter(finding => finding.deviceId === deviceId).length
}

function worstSeverity(findings: CyberObserverFinding[]): CyberObserverFindingSeverity | undefined {
  const rank: Record<CyberObserverFindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  return [...findings].sort((a, b) => rank[a.severity] - rank[b.severity])[0]?.severity
}

export function CyberObserverApp({ deviceId }: { deviceId: string }) {
  const { t } = useI18n()
  const devices = useNetworkStore(state => state.devices)
  const links = useNetworkStore(state => state.links)
  const updateDeviceConfig = useNetworkStore(state => state.updateDeviceConfig)
  const device = devices.find(candidate => candidate.id === deviceId)
  const state: CyberObserverState = device ? cyberObserverState(device) : { accounts: [], discoveries: [] }
  const accounts = state.accounts ?? []

  const [tab, setTab] = useState<CoTab>('dashboard')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [activeUsername, setActiveUsername] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [discoveryName, setDiscoveryName] = useState('')
  const [discoveryMode, setDiscoveryMode] = useState<CyberObserverDiscoveryMode>('connected')
  const defaultRange = defaultCyberObserverRange(device ? primaryCyberObserverAddress(device)?.ip : undefined)
  const [rangeStart, setRangeStart] = useState(defaultRange.start)
  const [rangeEnd, setRangeEnd] = useState(defaultRange.end)
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'all' | CyberObserverFindingSeverity>('all')

  const inventory = useMemo(() => {
    const controller = devices.find(candidate => candidate.id === deviceId)
    return controller ? cyberObserverInventory(controller, devices) : []
  }, [devices, deviceId])
  const findings = useMemo(() => {
    const controller = devices.find(candidate => candidate.id === deviceId)
    return controller ? cyberObserverFindings(controller, devices) : []
  }, [devices, deviceId])
  const currentDiscovery = device ? currentCyberObserverDiscovery(device) : undefined
  const activeLinks = useMemo(() => activeTopologyLinks(devices, links), [devices, links])
  const selectedDevice = inventory.find(candidate => candidate.id === selectedDeviceId) ?? inventory[0]
  const selectedFindings = selectedDevice ? findings.filter(finding => finding.deviceId === selectedDevice.id) : []
  const filteredFindings = severityFilter === 'all' ? findings : findings.filter(finding => finding.severity === severityFilter)
  const severityCount = (severity: CyberObserverFindingSeverity) => findings.filter(finding => finding.severity === severity).length
  const deviceName = (id: string) => deviceLabel(devices.find(candidate => candidate.id === id))
  const deviceFindings = (id: string) => findings.filter(finding => finding.deviceId === id)

  if (!device || !isCyberObserver(device)) return null

  const submitAuth = (event: FormEvent) => {
    event.preventDefault()
    setAuthError('')
    const cleanUsername = username.trim()
    if (!cleanUsername) {
      setAuthError(t('Enter a username.'))
      return
    }
    if (cleanUsername.length > 64) {
      setAuthError(t('Username must be 64 characters or fewer.'))
      return
    }
    if (password.length < 4) {
      setAuthError(t('Password must be at least 4 characters.'))
      return
    }
    if (!accounts.length) {
      if (password !== confirmPassword) {
        setAuthError(t('Passwords do not match.'))
        return
      }
      updateDeviceConfig(device.id, {
        cyberObserver: {
          ...state,
          accounts: [{ username: cleanUsername, passwordHash: hashCyberObserverPassword(password), role: 'admin' }],
        },
      })
      setSignedIn(true)
      setActiveUsername(cleanUsername)
      setTab('dashboard')
      setPassword('')
      setConfirmPassword('')
      setNotice({ tone: 'success', text: t('Account created. You are signed in.') })
      return
    }
    const account = accounts.find(item => item.username.toLowerCase() === cleanUsername.toLowerCase())
    if (!account || account.passwordHash !== hashCyberObserverPassword(password)) {
      setAuthError(t('Incorrect username or password.'))
      return
    }
    setSignedIn(true)
    setActiveUsername(account.username)
    setTab('dashboard')
    setPassword('')
    setNotice({ tone: 'success', text: t('Signed in.') })
  }

  if (!signedIn) {
    const setup = accounts.length === 0
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_18%_0%,#fef3c7_0,transparent_42%),linear-gradient(180deg,#f7f4ed,#eee9de)] p-5" data-testid="co-auth">
        <div className="w-full max-w-[430px] rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_18px_50px_rgba(41,32,18,0.14)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-800">
              <svg viewBox="0 0 24 28" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1.5 22 4.8v8.4c0 6-4 10.8-10 14.3C6 24 2 19.2 2 13.2V4.8Z" />
                <path d="M7.2 13.6 10.7 17l6.3-6.7" />
              </svg>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-amber-800">{t('Cyber Observer')}</p>
              <h2 className="text-lg font-bold leading-tight text-stone-900">{setup ? t('Create the administrator account for this appliance.') : t('Sign in to monitor the discovered network.')}</h2>
            </div>
          </div>
          <form onSubmit={submitAuth} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Username')}</span>
              <input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" maxLength={64} className={fieldClass} data-testid="co-username" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Password')}</span>
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} className={fieldClass} data-testid="co-password" />
            </label>
            {setup && (
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Confirm Password')}</span>
                <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" className={fieldClass} data-testid="co-confirm-password" />
              </label>
            )}
            {authError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">{authError}</p>}
            <button type="submit" className={`${primaryButton} w-full`} data-testid="co-auth-submit">{setup ? t('Setup') : t('Sign in')}</button>
          </form>
          <p className="mt-4 text-[10px] leading-4 text-stone-500">{t('Classroom-only account. The workspace file is not encrypted.')}</p>
        </div>
      </div>
    )
  }

  const tabs: Array<{ id: CoTab; label: string }> = [
    { id: 'dashboard', label: t('Dashboard') },
    { id: 'discovery', label: t('Discovery') },
    { id: 'inventory', label: t('Network devices') },
    { id: 'findings', label: t('Findings') },
    { id: 'topology', label: t('Assurance') },
  ]

  const runDiscovery = () => {
    const defaultName = discoveryMode === 'connected' ? t('Connected discovery') : t('IP range discovery')
    const result = discoverCyberObserver(device, devices, links, {
      name: discoveryName.trim() || defaultName,
      mode: discoveryMode,
      rangeStart,
      rangeEnd,
    })
    const existing = cyberObserverState(device).discoveries ?? []
    const discoveries = [result.discovery, ...existing].slice(0, 20)
    updateDeviceConfig(device.id, {
      cyberObserver: {
        ...cyberObserverState(device),
        discoveries,
        lastDiscoveryId: result.discovery.id,
      },
    })
    if (result.ok) {
      setNotice({ tone: 'success', text: t('Discovery completed.') })
    } else {
      setNotice({ tone: 'error', text: t(DISCOVERY_REASON[result.discovery.reason ?? 'invalid-range']) })
    }
  }

  const removeDiscovery = (id: string) => {
    const activeId = currentCyberObserverDiscovery(device)?.id
    const remaining = (cyberObserverState(device).discoveries ?? []).filter(item => item.id !== id)
    updateDeviceConfig(device.id, {
      cyberObserver: {
        ...cyberObserverState(device),
        discoveries: remaining,
        lastDiscoveryId: id === activeId ? remaining[0]?.id : activeId,
      },
    })
  }

  const viewDiscovery = (id: string) => {
    updateDeviceConfig(device.id, {
      cyberObserver: { ...cyberObserverState(device), lastDiscoveryId: id },
    })
    setNotice(null)
  }

  const emptyState = (text: string) => (
    <div className={cardClass}>
      <p className="text-xs text-stone-600">{text}</p>
    </div>
  )

  const findingPill = (finding: CyberObserverFinding) => (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${SEVERITY_TONE[finding.severity]}`}>
      {t(SEVERITY_LABEL[finding.severity])}
    </span>
  )

  const findingsTable = (rows: CyberObserverFinding[]) => (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <table className="w-full border-collapse text-left text-[11px]">
        <thead className="bg-stone-50 text-[9px] uppercase tracking-[0.1em] text-stone-500">
          <tr>
            <th className="px-3 py-2 font-semibold">{t('Severity')}</th>
            <th className="px-3 py-2 font-semibold">{t('Findings')}</th>
            <th className="px-3 py-2 font-semibold">{t('Device')}</th>
            <th className="px-3 py-2 font-semibold">{t('Evidence')}</th>
            <th className="px-3 py-2 font-semibold">{t('Recommended action')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(finding => (
            <tr key={finding.id} className="border-t border-stone-100 align-top" data-testid="co-finding-row">
              <td className="px-3 py-2">{findingPill(finding)}</td>
              <td className="px-3 py-2 font-bold text-stone-800">{t(FINDING_TITLE[finding.code])}</td>
              <td className="px-3 py-2 text-stone-600">{deviceName(finding.deviceId)}</td>
              <td className="px-3 py-2 font-mono text-[10px] text-stone-500">{finding.evidence}</td>
              <td className="px-3 py-2 text-stone-500">{t(FINDING_REMEDIATION[finding.code])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="flex h-full min-h-[440px] flex-col bg-[#f7f4ed]" data-testid="co-app">
      <header className="border-b border-stone-800 bg-[#241f18] px-4 pb-0 pt-3 text-stone-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-700/40 bg-amber-500/10 text-amber-300">
              <svg viewBox="0 0 24 28" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1.5 22 4.8v8.4c0 6-4 10.8-10 14.3C6 24 2 19.2 2 13.2V4.8Z" />
                <path d="M7.2 13.6 10.7 17l6.3-6.7" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight tracking-tight">{t('Cyber Observer')}</h1>
              <p className="text-[10px] text-stone-400">{t('Configuration exposure monitoring')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-stone-400">
            <span>{t('Signed in as')} <strong className="text-stone-200">{activeUsername}</strong></span>
            <button type="button" className="rounded-md border border-stone-700 px-2.5 py-1.5 font-bold text-stone-200 transition hover:bg-stone-800" onClick={() => { setSignedIn(false); setActiveUsername(''); setTab('dashboard'); setUsername(''); setPassword(''); setAuthError(''); setNotice(null) }} data-testid="co-sign-out">
              {t('Sign out')}
            </button>
          </div>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label={t('Cyber Observer')}>
          {tabs.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setTab(item.id); setNotice(null) }}
              className={`min-h-[34px] shrink-0 rounded-t-md border-b-2 px-3 py-2 text-[11px] font-bold transition ${tab === item.id ? 'border-amber-400 bg-stone-800/70 text-amber-200' : 'border-transparent text-stone-400 hover:text-stone-200'}`}
              data-testid={`co-tab-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {notice && (
        <div className={`border-b px-4 py-2 text-[11px] font-semibold ${notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`} role="status" data-testid="co-notice">
          {notice.text}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-auto p-4">
        {tab === 'dashboard' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-stone-900">{t('Dashboard')}</h2>
                <p className="mt-1 text-xs text-stone-500">{t('Configuration checks from the live discovered inventory.')}</p>
              </div>
              {currentDiscovery && <span className="text-[10px] text-stone-500">{t('Last discovery')}: {currentDiscovery.name} · {new Date(currentDiscovery.createdAtMs).toLocaleString()}</span>}
            </div>

            {currentDiscovery?.status === 'failed' && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800" role="status">
                <strong>{t('Discovery failed.')}</strong> {t(DISCOVERY_REASON[currentDiscovery.reason ?? 'invalid-range'])}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={cardClass} data-testid="co-stat-devices">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">{t('Discovered devices')}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-stone-900">{inventory.length}</p>
              </div>
              <div className={cardClass} data-testid="co-stat-findings">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">{t('Open findings')}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-stone-900">{findings.length}</p>
              </div>
              <div className={cardClass} data-testid="co-stat-critical">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">{t('Critical')}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-red-700">{severityCount('critical')}</p>
              </div>
              <div className={cardClass}>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">{t('High')}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-orange-700">{severityCount('high')}</p>
              </div>
            </div>

            {!currentDiscovery ? (
              <div className={cardClass}>
                <h3 className="text-sm font-bold text-stone-900">{t('No discovery yet.')}</h3>
                <p className="mt-1 max-w-[620px] text-xs leading-5 text-stone-500">{t('Run a discovery to inventory managed devices and evaluate their live configuration.')}</p>
                <button type="button" className={`${primaryButton} mt-3`} onClick={() => setTab('discovery')}>{t('Go to discovery')}</button>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.55fr)]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">{t('Top findings')}</h3>
                    <button type="button" className={secondaryButton} onClick={() => setTab('findings')}>{t('Findings')}</button>
                  </div>
                  {findings.length === 0 ? emptyState(t('No findings in the current inventory.')) : findingsTable(findings.slice(0, 5))}
                </div>
                <div className={`${cardClass} space-y-2`}>
                  <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">{t('Device health')}</h3>
                  {(['active', 'idle', 'no-ip', 'off'] as const).map(status => (
                    <div key={status} className="flex items-center justify-between border-t border-stone-100 pt-2 text-[11px]">
                      <span className="text-stone-600">{t(status === 'active' ? 'Active' : status === 'idle' ? 'Idle' : status === 'no-ip' ? 'No IP' : 'Powered off')}</span>
                      <strong className="tabular-nums text-stone-900">{inventory.filter(item => cyberObserverDeviceStatus(item) === status).length}</strong>
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] leading-4 text-stone-500">{t('Findings are derived from live device configuration. No external CVE feed or firmware matching is modeled.')}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'discovery' && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className={`${cardClass} space-y-3`}>
              <div>
                <h2 className="text-base font-bold text-stone-900">{t('Run discovery')}</h2>
                <p className="mt-1 text-xs leading-5 text-stone-500">{t('The appliance discovers powered devices with a management IP. An unmanaged switch can fragment the topology.')}</p>
              </div>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Discovery name')}</span>
                <input value={discoveryName} onChange={event => setDiscoveryName(event.target.value)} maxLength={80} placeholder={t('Optional name')} className={fieldClass} data-testid="co-discovery-name" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Discovery mode')}</span>
                <select value={discoveryMode} onChange={event => setDiscoveryMode(event.target.value as CyberObserverDiscoveryMode)} className={fieldClass} data-testid="co-discovery-mode">
                  <option value="connected">{t('Connected topology')}</option>
                  <option value="range">{t('IP range')}</option>
                </select>
              </label>
              {discoveryMode === 'range' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Start IP')}</span>
                    <input value={rangeStart} onChange={event => setRangeStart(event.target.value)} maxLength={15} className={`${fieldClass} font-mono`} data-testid="co-range-start" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('End IP')}</span>
                    <input value={rangeEnd} onChange={event => setRangeEnd(event.target.value)} maxLength={15} className={`${fieldClass} font-mono`} data-testid="co-range-end" />
                  </label>
                </div>
              )}
              <button type="button" onClick={runDiscovery} className={`${primaryButton} w-full`} data-testid="co-run-discovery">{t('Run discovery')}</button>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-stone-900">{t('Discovery history')}</h2>
              {(state.discoveries ?? []).length === 0 ? emptyState(t('No discoveries yet.')) : (
                <div className="space-y-2">
                  {(state.discoveries ?? []).map(item => {
                    const active = currentDiscovery?.id === item.id
                    return (
                      <div key={item.id} className={`${cardClass} ${active ? 'border-amber-300 ring-1 ring-amber-200' : ''}`} data-testid="co-discovery-row">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-stone-900">{item.name}</p>
                            <p className="mt-1 text-[10px] text-stone-500">
                              {item.mode === 'connected' ? t('Connected topology') : `${t('IP range')} ${item.rangeStart ?? ''}–${item.rangeEnd ?? ''}`} · {new Date(item.createdAtMs).toLocaleString()}
                            </p>
                            {item.status === 'failed' && item.reason && (
                              <p className="mt-1 text-[10px] font-semibold text-red-700">{t(DISCOVERY_REASON[item.reason])}</p>
                            )}
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${item.status === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                            {item.status === 'complete' ? t('Completed') : t('Failed')}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-stone-500">{item.deviceIds.length} {t('devices')}</span>
                          <span className="flex-1" />
                          {active ? <span className="text-[10px] font-bold text-amber-800">{t('Current')}</span> : <button type="button" className={secondaryButton} onClick={() => viewDiscovery(item.id)}>{t('View')}</button>}
                          <button type="button" className={`${secondaryButton} text-red-700`} onClick={() => removeDiscovery(item.id)}>{t('Delete')}</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'inventory' && (
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">{t('Network devices')}</h2>
              <p className="mt-1 text-xs text-stone-500">{t('Devices are read from the current discovery snapshot.')}</p>
            </div>
            {!currentDiscovery || inventory.length === 0 ? emptyState(t('Run a discovery to build the inventory.')) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
                <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                  <table className="w-full border-collapse text-left text-[11px]">
                    <thead className="bg-stone-50 text-[9px] uppercase tracking-[0.1em] text-stone-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t('Device')}</th>
                        <th className="px-3 py-2 font-semibold">{t('Model')}</th>
                        <th className="px-3 py-2 font-semibold">{t('Management IP')}</th>
                        <th className="px-3 py-2 font-semibold">{t('Findings')}</th>
                        <th className="px-3 py-2 font-semibold">{t('Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map(item => {
                        const address = cyberObserverAddresses(item)[0]?.ip
                        const status = cyberObserverDeviceStatus(item)
                        const count = findingCount(findings, item.id)
                        return (
                          <tr
                            key={item.id}
                            className={`cursor-pointer border-t border-stone-100 transition hover:bg-amber-50/40 ${selectedDevice?.id === item.id ? 'bg-amber-50/60' : ''}`}
                            onClick={() => setSelectedDeviceId(item.id)}
                            data-testid="co-inventory-row"
                          >
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setSelectedDeviceId(item.id)}
                                aria-current={selectedDevice?.id === item.id ? 'true' : undefined}
                                className="font-bold text-stone-800 outline-offset-2 transition hover:text-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600"
                              >
                                {deviceLabel(item)}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-stone-600">{item.model}</td>
                            <td className="px-3 py-2 font-mono text-[10px] text-stone-600">{address ?? t('No IP')}</td>
                            <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${count ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-stone-200 bg-stone-50 text-stone-500'}`}>{count}</span></td>
                            <td className="px-3 py-2 text-stone-600">{t(status === 'active' ? 'Active' : status === 'idle' ? 'Idle' : status === 'no-ip' ? 'No IP' : 'Powered off')}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <aside className={`${cardClass} space-y-3`} data-testid="co-device-details">
                  {selectedDevice ? (
                    <>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-800">{t('Selected device')}</p>
                        <h3 className="mt-1 text-sm font-bold text-stone-900">{deviceLabel(selectedDevice)}</h3>
                        <p className="text-[10px] text-stone-500">{selectedDevice.model} · {selectedDevice.type}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Management addresses')}</p>
                        {cyberObserverAddresses(selectedDevice).length === 0 ? <p className="mt-1 text-[11px] text-stone-500">{t('No management IP')}</p> : (
                          <ul className="mt-1 space-y-1">
                            {cyberObserverAddresses(selectedDevice).map(address => (
                              <li key={address.portId} className="flex items-center justify-between gap-2 text-[10px]">
                                <span className="text-stone-500">{address.portName}</span>
                                <span className="font-mono text-stone-700">{address.ip}/{address.mask}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex items-center justify-between border-t border-stone-100 pt-2 text-[10px]">
                        <span className="text-stone-500">{t('Active links')}</span>
                        <strong className="text-stone-800">{activeLinks.filter(link => link.fromDeviceId === selectedDevice.id || link.toDeviceId === selectedDevice.id).length}</strong>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Findings')}</p>
                        {selectedFindings.length === 0 ? <p className="mt-1 text-[11px] text-stone-500">{t('No findings for this device.')}</p> : (
                          <ul className="mt-1 space-y-1.5">
                            {selectedFindings.map(finding => (
                              <li key={finding.id} className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5">
                                <div className="flex items-center gap-2">{findingPill(finding)}<span className="text-[10px] font-bold text-stone-800">{t(FINDING_TITLE[finding.code])}</span></div>
                                <p className="mt-1 font-mono text-[9px] text-stone-500">{finding.evidence}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  ) : <p className="text-xs text-stone-500">{t('Select a device to inspect it.')}</p>}
                </aside>
              </div>
            )}
          </div>
        )}

        {tab === 'findings' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-stone-900">{t('Findings')}</h2>
                <p className="mt-1 max-w-[680px] text-xs leading-5 text-stone-500">{t('Findings are derived from live device configuration. No external CVE feed or firmware matching is modeled.')}</p>
              </div>
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">
                {t('Severity')}
                <select value={severityFilter} onChange={event => setSeverityFilter(event.target.value as 'all' | CyberObserverFindingSeverity)} className={`${fieldClass} ml-2 inline-block w-auto min-w-[130px]`}>
                  <option value="all">{t('All severities')}</option>
                  <option value="critical">{t('Critical')}</option>
                  <option value="high">{t('High')}</option>
                  <option value="medium">{t('Medium')}</option>
                  <option value="low">{t('Low')}</option>
                </select>
              </label>
            </div>
            {!currentDiscovery ? emptyState(t('Run a discovery to evaluate the network.')) : filteredFindings.length === 0 ? emptyState(t('No findings in the current inventory.')) : findingsTable(filteredFindings)}
          </div>
        )}

        {tab === 'topology' && (
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">{t('Assurance')}</h2>
              <p className="mt-1 text-xs text-stone-500">{t('Discovered')}: {inventory.length} · {t('Links')}: {activeLinks.filter(link => inventory.some(item => item.id === link.fromDeviceId) && inventory.some(item => item.id === link.toDeviceId)).length}</p>
            </div>
            {inventory.length === 0 ? emptyState(t('Run a discovery to build the topology.')) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.55fr)]">
                <div className={`${cardClass} overflow-hidden`}>
                  <svg viewBox="0 0 850 320" className="h-auto w-full" role="group" aria-label={t('Topology')} data-testid="co-topology">
                    {(() => {
                      const nodes = inventory
                      const width = 850
                      const height = 320
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
                      const nodeIds = new Set(nodes.map(node => node.id))
                      const nodeFindings = (id: string) => deviceFindings(id)
                      return (
                        <>
                          {activeLinks.filter(link => nodeIds.has(link.fromDeviceId) && nodeIds.has(link.toDeviceId)).map(link => {
                            const from = position.get(link.fromDeviceId)!
                            const to = position.get(link.toDeviceId)!
                            return <line key={link.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#c7bda9" strokeWidth="2.2" />
                          })}
                          {nodes.map(node => {
                            const point = position.get(node.id)!
                            const worst = worstSeverity(nodeFindings(node.id))
                            const fill = worst === 'critical' ? '#b91c1c'
                              : worst === 'high' ? '#c2410c'
                              : worst === 'medium' ? '#b45309'
                              : worst === 'low' ? '#64748b'
                              : '#3f6212'
                            return (
                              <g
                                key={node.id}
                                role="group"
                                tabIndex={0}
                                aria-label={`${deviceLabel(node)}${worst ? ` · ${t(SEVERITY_LABEL[worst])}` : ''}`}
                                transform={`translate(${point.x} ${point.y})`}
                                className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                                onClick={() => setSelectedDeviceId(node.id)}
                                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedDeviceId(node.id) } }}
                              >
                                <circle r="24" fill={fill} stroke={selectedDevice?.id === node.id ? '#1c1917' : '#fff'} strokeWidth={selectedDevice?.id === node.id ? 4 : 3} />
                                <circle r="33" fill="none" stroke={fill} strokeWidth="1" opacity=".2" />
                                <text y="41" textAnchor="middle" fontSize="11" fontWeight="700" fill="#292524">{deviceLabel(node).slice(0, 26)}</text>
                                <text y="54" textAnchor="middle" fontSize="9" fill="#78716c">{node.model.slice(0, 20)}</text>
                              </g>
                            )
                          })}
                        </>
                      )
                    })()}
                  </svg>
                </div>
                <aside className={`${cardClass} space-y-3`}>
                  <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">{t('Selected device')}</h3>
                  {selectedDevice ? (
                    <>
                      <div>
                        <p className="text-sm font-bold text-stone-900">{deviceLabel(selectedDevice)}</p>
                        <p className="text-[10px] text-stone-500">{selectedDevice.model}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Management IP')}</p>
                        <p className="font-mono text-[11px] text-stone-700">{cyberObserverAddresses(selectedDevice)[0]?.ip ?? t('No IP')}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Findings')}</p>
                        {selectedFindings.length === 0 ? <p className="mt-1 text-[11px] text-stone-500">{t('No findings for this device.')}</p> : (
                          <ul className="mt-1 space-y-1">
                            {selectedFindings.map(finding => <li key={finding.id} className="text-[10px] text-stone-600">{t(FINDING_TITLE[finding.code])}</li>)}
                          </ul>
                        )}
                      </div>
                    </>
                  ) : <p className="text-xs text-stone-500">{t('Select a device to inspect it.')}</p>}
                  <div className="border-t border-stone-100 pt-2">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-stone-500">{t('Legend')}</p>
                    <div className="mt-1 grid grid-cols-2 gap-1 text-[9px] text-stone-600" data-testid="co-topology-legend">
                      {(['critical', 'high', 'medium', 'low'] as const).map(severity => (
                        <span key={severity} className="flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${severity === 'critical' ? 'bg-red-700' : severity === 'high' ? 'bg-orange-700' : severity === 'medium' ? 'bg-amber-700' : 'bg-slate-500'}`} />{t(SEVERITY_LABEL[severity])}</span>
                      ))}
                      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-lime-800" />{t('No findings')}</span>
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
