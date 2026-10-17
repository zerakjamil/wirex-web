'use client'

import React, { useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useI18n } from '@/i18n/useI18n'
import { CAPWAP_MAX_WLANS, CAPWAP_WLAN_ID_MIN, apAdvertisedWlans, wlcClientEntries, wlcRegisteredAps, wlcWlans } from '@/simulator/capwap'
import { isValidIpv4 } from '@/simulator/protocols/ip'
import type { WlanProfile } from '@/types/network'

const SECURITY_OPTIONS: { value: WlanProfile['security']; label: string }[] = [
  { value: 'none', label: 'Open' },
  { value: 'wep', label: 'WEP' },
  { value: 'wpa2-psk', label: 'WPA2 Personal' },
]

const securityLabel = (security: WlanProfile['security']) => SECURITY_OPTIONS.find(option => option.value === security)?.label ?? 'Open'

const emptyDraft = (): WlanProfile => ({ id: CAPWAP_WLAN_ID_MIN, name: '', ssid: '', enabled: true, vlan: 0, security: 'none' })

export function WlcConfigTab({ deviceId }: { deviceId: string }) {
  const { t } = useI18n()
  const device = useNetworkStore(state => state.devices.find(candidate => candidate.id === deviceId))
  const devices = useNetworkStore(state => state.devices)
  const updateDeviceConfig = useNetworkStore(state => state.updateDeviceConfig)
  const [draft, setDraft] = useState<WlanProfile | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)

  if (!device || device.type !== 'wlc') {
    return <div className="p-4 text-xs text-slate-500">{t('This tab is only available on wireless LAN controllers.')}</div>
  }

  const wlans = wlcWlans(device)
  const registered = wlcRegisteredAps(device)
  const freeIds: number[] = []
  for (let id = CAPWAP_WLAN_ID_MIN; id <= CAPWAP_MAX_WLANS; id++) if (!wlans.some(wlan => wlan.id === id)) freeIds.push(id)

  const startNew = () => {
    setEditingId(null)
    setDraft({ ...emptyDraft(), id: freeIds[0] ?? CAPWAP_WLAN_ID_MIN })
    setMessage(null)
  }
  const startEdit = (wlan: WlanProfile) => {
    setEditingId(wlan.id)
    setDraft({ ...wlan })
    setMessage(null)
  }
  const closeDraft = () => { setDraft(null); setEditingId(null) }

  const saveDraft = () => {
    if (!draft) return
    const name = draft.name.trim()
    const ssid = (draft.ssid.trim() || draft.name.trim())
    if (!name) return setMessage({ text: t('Enter a profile name for the wireless LAN.'), tone: 'error' })
    if (!ssid) return setMessage({ text: t('Enter an SSID for the wireless LAN.'), tone: 'error' })
    const idTaken = wlans.some(wlan => wlan.id === draft.id && wlan.id !== editingId)
    if (idTaken) return setMessage({ text: t('Another wireless LAN already uses that identifier.'), tone: 'error' })
    const ssidTaken = wlans.some(wlan => wlan.id !== editingId && wlan.ssid.toLowerCase() === ssid.toLowerCase())
    if (ssidTaken) return setMessage({ text: t('Another wireless LAN already broadcasts that SSID.'), tone: 'error' })
    if (!Number.isInteger(draft.vlan) || draft.vlan < 0 || draft.vlan > 4094) return setMessage({ text: t('The interface/VLAN value must be between 0 and 4094.'), tone: 'error' })
    if (draft.security === 'wpa2-psk' && (draft.passphrase ?? '').length > 0 && ((draft.passphrase ?? '').length < 8 || (draft.passphrase ?? '').length > 63)) {
      return setMessage({ text: t('A WPA2 personal passphrase must contain between 8 and 63 characters.'), tone: 'error' })
    }
    if (draft.security === 'wep' && (draft.wepKey ?? '').length > 0 && !/^(?:[0-9a-fA-F]{10}|[0-9a-fA-F]{26})$/.test(draft.wepKey ?? '')) {
      return setMessage({ text: t('A WEP key must contain 10 or 26 hexadecimal characters.'), tone: 'error' })
    }
    const entry: WlanProfile = {
      id: draft.id,
      name,
      ssid,
      enabled: draft.enabled,
      vlan: draft.vlan,
      security: draft.security,
      ...(draft.security === 'wpa2-psk' && draft.passphrase ? { passphrase: draft.passphrase } : {}),
      ...(draft.security === 'wep' && draft.wepKey ? { wepKey: draft.wepKey } : {}),
    }
    const next = editingId === null
      ? [...wlans, entry].sort((a, b) => a.id - b.id)
      : wlans.map(wlan => wlan.id === editingId ? entry : wlan).sort((a, b) => a.id - b.id)
    updateDeviceConfig(device.id, { wlans: next })
    setMessage({ text: `${editingId === null ? t('Created wireless LAN') : t('Updated wireless LAN')} ${entry.id} (${entry.ssid}). ${t('Registered access points receive the change through a CAPWAP configuration update.')}`, tone: 'ok' })
    closeDraft()
  }

  const removeWlan = (wlan: WlanProfile) => {
    updateDeviceConfig(device.id, { wlans: wlans.filter(candidate => candidate.id !== wlan.id) })
    setMessage({ text: `${t('Removed wireless LAN')} ${wlan.id} (${wlan.ssid}). ${t('Registered access points receive the change through a CAPWAP configuration update.')}`, tone: 'ok' })
    if (editingId === wlan.id) closeDraft()
  }

  const toggleWlan = (wlan: WlanProfile) => {
    updateDeviceConfig(device.id, { wlans: wlans.map(candidate => candidate.id === wlan.id ? { ...candidate, enabled: !candidate.enabled } : candidate) })
    setMessage({ text: `${wlan.ssid} ${wlan.enabled ? t('is now disabled') : t('is now enabled')}.`, tone: 'ok' })
  }

  const field = 'mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#5b9fb3] focus:outline-none'
  const label = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500'

  return (
    <div className="flex-1 min-h-0 overflow-auto pr-1 space-y-4">
      {message && (
        <div className={`rounded-sm border px-3 py-2 text-xs ${message.tone === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <section className="rounded-sm border border-slate-300 bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 bg-[#e8eef4] px-3 py-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800">{t('Wireless LANs')}</h3>
            <p className="text-[11px] text-slate-500">{t('Wireless LANs are pushed to every registered access point through CAPWAP.')}</p>
          </div>
          <button type="button" onClick={startNew} disabled={freeIds.length === 0} className="rounded-sm border border-[#2f7d94] bg-[#5b9fb3] px-3 py-1 text-xs font-bold text-white transition hover:bg-[#4d8fa3] disabled:cursor-not-allowed disabled:opacity-50">
            {t('New')}
          </button>
        </header>
        {wlans.length === 0 ? (
          <p className="px-3 py-4 text-xs text-slate-500">{t('No wireless LANs are configured. Create one to broadcast an SSID through the access points.')}</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-[#f4f7fa] text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">{t('WLAN ID')}</th>
                <th className="px-3 py-2">{t('Profile Name')}</th>
                <th className="px-3 py-2">{t('SSID')}</th>
                <th className="px-3 py-2">{t('Interface/VLAN')}</th>
                <th className="px-3 py-2">{t('Security')}</th>
                <th className="px-3 py-2">{t('Status')}</th>
                <th className="px-3 py-2 text-right">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {wlans.map(wlan => (
                <tr key={wlan.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-slate-700">{wlan.id}</td>
                  <td className="px-3 py-2 text-slate-800">{wlan.name}</td>
                  <td className="px-3 py-2 text-slate-800">{wlan.ssid}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{wlan.vlan}</td>
                  <td className="px-3 py-2 text-slate-600">{securityLabel(wlan.security)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-sm px-2 py-0.5 text-[11px] font-bold ${wlan.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {wlan.enabled ? t('Enabled') : t('Disabled')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => toggleWlan(wlan)} className="rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
                        {wlan.enabled ? t('Disable') : t('Enable')}
                      </button>
                      <button type="button" onClick={() => startEdit(wlan)} className="rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
                        {t('Edit')}
                      </button>
                      <button type="button" onClick={() => removeWlan(wlan)} className="rounded-sm border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-50">
                        {t('Delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {draft && (
          <div className="border-t border-slate-200 bg-[#f8fafc] px-3 py-3">
            <h4 className="mb-2 text-xs font-bold text-slate-700">{editingId === null ? t('New wireless LAN') : `${t('Editing wireless LAN')} ${editingId}`}</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={label}>{t('WLAN ID')}</span>
                <select className={field} value={draft.id} onChange={event => setDraft({ ...draft, id: Number(event.target.value) })}>
                  {(editingId === null ? freeIds : [draft.id, ...freeIds]).map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={label}>{t('Profile Name')}</span>
                <input className={field} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="CORP" />
              </label>
              <label className="block">
                <span className={label}>{t('SSID')}</span>
                <input className={field} value={draft.ssid} onChange={event => setDraft({ ...draft, ssid: event.target.value })} placeholder="CORP-NET" />
              </label>
              <label className="block">
                <span className={label}>{t('Interface/VLAN')}</span>
                <input className={field} type="number" min={0} max={4094} value={draft.vlan} onChange={event => setDraft({ ...draft, vlan: Number(event.target.value) })} />
              </label>
              <label className="block">
                <span className={label}>{t('Security')}</span>
                <select className={field} value={draft.security} onChange={event => setDraft({ ...draft, security: event.target.value as WlanProfile['security'], passphrase: undefined, wepKey: undefined })}>
                  {SECURITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {draft.security === 'wpa2-psk' && (
                <label className="block">
                  <span className={label}>{t('Passphrase')}</span>
                  <input className={field} value={draft.passphrase ?? ''} onChange={event => setDraft({ ...draft, passphrase: event.target.value })} placeholder="8-63 characters" />
                </label>
              )}
              {draft.security === 'wep' && (
                <label className="block">
                  <span className={label}>{t('WEP Key')}</span>
                  <input className={field} value={draft.wepKey ?? ''} onChange={event => setDraft({ ...draft, wepKey: event.target.value })} placeholder="10 or 26 hex characters" />
                </label>
              )}
              <label className="flex items-center gap-2 pt-4 text-xs text-slate-700">
                <input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />
                {t('Broadcast this SSID')}
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={saveDraft} className="rounded-sm border border-[#2f7d94] bg-[#5b9fb3] px-3 py-1 text-xs font-bold text-white hover:bg-[#4d8fa3]">{t('Save')}</button>
              <button type="button" onClick={closeDraft} className="rounded-sm border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">{t('Cancel')}</button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-sm border border-slate-300 bg-white">
        <header className="border-b border-slate-200 bg-[#e8eef4] px-3 py-2">
          <h3 className="text-xs font-bold text-slate-800">{t('AP Groups')}</h3>
          <p className="text-[11px] text-slate-500">{t('This simulator uses a single default AP group, matching how the controller groups access points out of the box.')}</p>
        </header>
        <div className="px-3 py-2 text-xs text-slate-700">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-bold">{t('default')}</span>
            <span className="rounded-sm bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{registered.length} {t('access points')}</span>
          </div>
          {registered.length === 0 ? (
            <p className="text-slate-500">{t('No access points have joined yet. A lightweight access point joins when it can reach this controller over the wired LAN.')}</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#f4f7fa] text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5">{t('Access Point')}</th>
                  <th className="px-2 py-1.5">{t('Ethernet MAC')}</th>
                  <th className="px-2 py-1.5">{t('State')}</th>
                  <th className="px-2 py-1.5">{t('Joined at tick')}</th>
                </tr>
              </thead>
              <tbody>
                {registered.map(entry => {
                  const ap = devices.find(candidate => candidate.id === entry.apId)
                  return (
                    <tr key={entry.apId} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-1.5 text-slate-800">{ap?.name ?? entry.apId}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-600">{entry.apMac}</td>
                      <td className="px-2 py-1.5 text-slate-600">Run</td>
                      <td className="px-2 py-1.5 font-mono text-slate-500">{entry.joinedAtTick}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <p className="text-[11px] text-slate-500">
        {t('Access points receive wireless settings through CAPWAP control messages. In this simulator the control and data frames travel over the wired broadcast domain, and client traffic is tunnelled to the controller for central switching.')}
      </p>
    </div>
  )
}

type WlcWebView = 'monitor' | 'clients' | 'management'

export function WlcWebTab({ deviceId }: { deviceId: string }) {
  const { t } = useI18n()
  const device = useNetworkStore(state => state.devices.find(candidate => candidate.id === deviceId))
  const devices = useNetworkStore(state => state.devices)
  const links = useNetworkStore(state => state.links)
  const updateDeviceConfig = useNetworkStore(state => state.updateDeviceConfig)
  const updatePortConfig = useNetworkStore(state => state.updatePortConfig)
  const [signedIn, setSignedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<WlcWebView>('monitor')
  const [mgmtIp, setMgmtIp] = useState('')
  const [mgmtMask, setMgmtMask] = useState('')
  const [mgmtGateway, setMgmtGateway] = useState('')
  const [editMgmt, setEditMgmt] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (!device || device.type !== 'wlc') {
    return <div className="p-4 text-xs text-slate-500">{t('This web interface is only available on wireless LAN controllers.')}</div>
  }

  const mgmtPort = device.ports[0]
  const wlans = wlcWlans(device)
  const registered = wlcRegisteredAps(device)
  const clients = wlcClientEntries(devices, links, device)
  const advertised = registered.flatMap(entry => {
    const ap = devices.find(candidate => candidate.id === entry.apId)
    return ap ? apAdvertisedWlans(ap).map(wlan => ({ ssid: wlan.ssid, apName: ap.name })) : []
  })

  const startMgmtEdit = () => {
    setMgmtIp(mgmtPort.ipAddress ?? '')
    setMgmtMask(mgmtPort.subnetMask ?? '255.255.255.0')
    setMgmtGateway(device.config.defaultGateway ?? '')
    setEditMgmt(true)
    setNotice(null)
  }
  const saveMgmt = () => {
    if (!isValidIpv4(mgmtIp) || !isValidIpv4(mgmtMask)) {
      setNotice(t('Enter a valid management IP address and subnet mask.'))
      return
    }
    if (mgmtGateway && !isValidIpv4(mgmtGateway)) {
      setNotice(t('Enter a valid default gateway or leave it empty.'))
      return
    }
    updatePortConfig(device.id, mgmtPort.id, { ipAddress: mgmtIp, subnetMask: mgmtMask })
    updateDeviceConfig(device.id, { defaultGateway: mgmtGateway || undefined })
    setEditMgmt(false)
    setNotice(t('Management address saved. Access points reach the controller through this address.') )
  }

  const chrome = (children: React.ReactNode) => (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-sm border border-slate-300 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-[#e8eef4] px-3 py-1.5">
        <span className="text-[11px] font-bold text-slate-500">{t('Browser')}</span>
        <span className="flex-1 truncate rounded-sm border border-slate-300 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600">
          https://{mgmtPort.ipAddress || 'management-address'}/admin
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3">{children}</div>
    </div>
  )

  if (!signedIn) {
    return chrome(
      <div className="mx-auto mt-6 max-w-sm rounded-sm border border-slate-300 bg-[#f8fafc] p-4">
        <h3 className="text-sm font-bold text-slate-800">{device.name} {t('Wireless LAN Controller')}</h3>
        <p className="mt-1 text-[11px] text-slate-500">{t('Sign in to monitor the controller and its access points. The default credentials are admin / admin.')}</p>
        {error && <p className="mt-2 rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700">{error}</p>}
        <label className="mt-3 block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('Username')}</span>
          <input className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs" value={username} onChange={event => setUsername(event.target.value)} />
        </label>
        <label className="mt-3 block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('Password')}</span>
          <input type="password" className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs" value={password} onChange={event => setPassword(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => {
            if (username === 'admin' && password === 'admin') { setSignedIn(true); setError(null) }
            else setError(t('Incorrect username or password.'))
          }}
          className="mt-4 w-full rounded-sm border border-[#2f7d94] bg-[#5b9fb3] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4d8fa3]"
        >
          {t('Sign in')}
        </button>
      </div>
    )
  }

  return chrome(
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-slate-300 bg-[#f8fafc] px-3 py-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{device.name} {t('Wireless LAN Controller')}</h3>
          <p className="text-[11px] text-slate-500">{registered.length} {t('access points registered')} · {clients.length} {t('clients')} · {wlans.filter(wlan => wlan.enabled).length} {t('enabled WLANs')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['monitor', 'clients', 'management'] as const).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={`rounded-sm border px-2.5 py-1 text-[11px] font-semibold capitalize ${view === value ? 'border-[#2f7d94] bg-[#5b9fb3] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
            >
              {value === 'monitor' ? t('Monitor') : value === 'clients' ? t('Clients') : t('Management')}
            </button>
          ))}
          <button type="button" onClick={() => { setSignedIn(false); setUsername(''); setPassword('') }} className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
            {t('Sign out')}
          </button>
        </div>
      </div>

      {notice && <p className="rounded-sm border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p>}

      {view === 'monitor' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-sm border border-slate-300 bg-white">
            <header className="border-b border-slate-200 bg-[#e8eef4] px-3 py-2 text-xs font-bold text-slate-800">{t('Access Point Summary')}</header>
            <div className="px-3 py-2 text-xs text-slate-700">
              {registered.length === 0 ? (
                <p className="text-slate-500">{t('No access points have joined yet.')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {registered.map(entry => {
                    const ap = devices.find(candidate => candidate.id === entry.apId)
                    return (
                      <li key={entry.apId} className="flex items-center justify-between gap-2">
                        <span className="truncate">{ap?.name ?? entry.apId}</span>
                        <span className="font-mono text-[11px] text-slate-500">{entry.apMac}</span>
                        <span className="rounded-sm bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Run</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-sm border border-slate-300 bg-white">
            <header className="border-b border-slate-200 bg-[#e8eef4] px-3 py-2 text-xs font-bold text-slate-800">{t('Wireless LANs')}</header>
            <div className="px-3 py-2 text-xs text-slate-700">
              {wlans.length === 0 ? (
                <p className="text-slate-500">{t('No wireless LANs are configured.')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {wlans.map(wlan => (
                    <li key={wlan.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{wlan.ssid} <span className="text-slate-400">({wlan.name})</span></span>
                      <span className="text-[11px] text-slate-500">{securityLabel(wlan.security)}</span>
                      <button
                        type="button"
                        onClick={() => updateDeviceConfig(device.id, { wlans: wlans.map(candidate => candidate.id === wlan.id ? { ...candidate, enabled: !candidate.enabled } : candidate) })}
                        className={`rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${wlan.enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}
                      >
                        {wlan.enabled ? t('Enabled') : t('Disabled')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

      {view === 'clients' && (
        <section className="rounded-sm border border-slate-300 bg-white">
          <header className="border-b border-slate-200 bg-[#e8eef4] px-3 py-2 text-xs font-bold text-slate-800">{t('Wireless Clients')}</header>
          {clients.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">{t('No wireless clients are associated through the registered access points.')}</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#f4f7fa] text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">{t('Client')}</th>
                  <th className="px-3 py-2">{t('MAC Address')}</th>
                  <th className="px-3 py-2">{t('Access Point')}</th>
                  <th className="px-3 py-2">{t('SSID')}</th>
                  <th className="px-3 py-2">{t('State')}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={`${client.apId}-${client.deviceId}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-800">{client.name}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{client.macAddress}</td>
                    <td className="px-3 py-2 text-slate-600">{client.apName}</td>
                    <td className="px-3 py-2 text-slate-600">{client.ssid || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{client.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {view === 'management' && (
        <section className="rounded-sm border border-slate-300 bg-white">
          <header className="flex items-center justify-between border-b border-slate-200 bg-[#e8eef4] px-3 py-2">
            <h3 className="text-xs font-bold text-slate-800">{t('Management')}</h3>
            {!editMgmt && <button type="button" onClick={startMgmtEdit} className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">{t('Edit')}</button>}
          </header>
          <div className="space-y-3 px-3 py-3 text-xs text-slate-700">
            {editMgmt ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('IP Address')}</span>
                    <input className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs" value={mgmtIp} onChange={event => setMgmtIp(event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('Subnet Mask')}</span>
                    <input className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs" value={mgmtMask} onChange={event => setMgmtMask(event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('Default Gateway')}</span>
                    <input className="mt-1 w-full rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs" value={mgmtGateway} onChange={event => setMgmtGateway(event.target.value)} />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={saveMgmt} className="rounded-sm border border-[#2f7d94] bg-[#5b9fb3] px-3 py-1 text-xs font-bold text-white hover:bg-[#4d8fa3]">{t('Save')}</button>
                  <button type="button" onClick={() => setEditMgmt(false)} className="rounded-sm border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">{t('Cancel')}</button>
                </div>
              </>
            ) : (
              <dl className="grid gap-2 sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">{t('Management IP Address')}</dt>
                  <dd className="font-mono text-slate-800">{mgmtPort.ipAddress || t('Not configured')}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">{t('Subnet Mask')}</dt>
                  <dd className="font-mono text-slate-800">{mgmtPort.subnetMask || t('Not configured')}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">{t('Default Gateway')}</dt>
                  <dd className="font-mono text-slate-800">{device.config.defaultGateway || t('Not configured')}</dd>
                </div>
              </dl>
            )}
            <p className="text-[11px] text-slate-500">
              {t('The management address lives on the first gigabit port (usually GigabitEthernet0/0). Access points and wireless clients reach the controller over the wired LAN in this simulator.')}
            </p>
          </div>
        </section>
      )}

      {advertised.length > 0 && (
        <section className="rounded-sm border border-slate-300 bg-white">
          <header className="border-b border-slate-200 bg-[#e8eef4] px-3 py-2 text-xs font-bold text-slate-800">{t('SSIDs advertised by the access points')}</header>
          <ul className="flex flex-wrap gap-2 px-3 py-2 text-[11px] text-slate-600">
            {advertised.map(item => (
              <li key={`${item.apName}-${item.ssid}`} className="rounded-sm border border-slate-300 bg-[#f8fafc] px-2 py-0.5">
                {item.ssid} <span className="text-slate-400">on {item.apName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
