'use client'

import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useI18n } from '@/i18n/useI18n'
import { parseIpv6WithPrefix } from '@/simulator/protocols/ipv6'
import { hashGuiPassword, MAX_GUI_HTML_BYTES } from '@/simulator/endDevice'
import { TrafficGeneratorApp } from './TrafficGeneratorApp'

type Tool = 'ip' | 'traffic'

/**
 * Packet Tracer's generic wired/wireless end device has no Desktop tab. Its GUI
 * tab carries the IP configuration and the Traffic Generator, and an HTML tab
 * can replace that built-in page with authored HTML and optionally lock it.
 */
export function EndDeviceGui({ deviceId }: { deviceId: string }) {
  const { t, dir } = useI18n()
  const {
    device,
    updateDeviceConfig,
    updatePortConfig,
    requestDhcp,
    setIpv6HostMode,
    dhcpTransactions,
  } = useNetworkStore(useShallow(state => ({
    device: state.devices.find(candidate => candidate.id === deviceId),
    updateDeviceConfig: state.updateDeviceConfig,
    updatePortConfig: state.updatePortConfig,
    requestDhcp: state.requestDhcp,
    setIpv6HostMode: state.setIpv6HostMode,
    dhcpTransactions: state.dhcpTransactions,
  })))
  const [tool, setTool] = useState<Tool>('ip')
  const [showCustom, setShowCustom] = useState(() => Boolean(device?.config.guiHtml?.trim()))
  const [ipv6Draft, setIpv6Draft] = useState<{ portId: string; text: string } | null>(null)

  if (!device) return null
  const port = device.ports[0]
  if (!port) return null
  const customHtml = device.config.guiHtml?.trim() ? device.config.guiHtml : ''
  const showingCustom = showCustom && Boolean(customHtml)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#94a3b8] bg-white" dir={dir}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cbd5e1] bg-[#e2e8f0] px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-800">{device.name}</div>
          <div className="truncate text-xs text-slate-500">{device.model} · {port.name}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {customHtml && (
            <button type="button" onClick={() => setShowCustom(current => !current)} className="min-h-[38px] rounded border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              {t(showingCustom ? 'Built-in GUI' : 'Custom HTML')}
            </button>
          )}
          {!showingCustom && (
            <div className="flex items-center" role="tablist" aria-label={t('GUI')}>
              {(['ip', 'traffic'] as const).map(id => (
                <button key={id} type="button" role="tab" aria-selected={tool === id} onClick={() => setTool(id)} className={`min-h-[38px] border px-4 text-xs font-semibold ${tool === id ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'} ${id === 'ip' ? 'rounded-l' : 'rounded-r border-l-0'}`}>
                  {t(id === 'ip' ? 'IP Configuration' : 'Traffic Generator')}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {showingCustom ? (
        <div className="min-h-0 flex-1 overflow-auto bg-white p-4">
          <iframe title={`${device.name} custom GUI`} sandbox="" referrerPolicy="no-referrer" srcDoc={customHtml} className="h-full min-h-[360px] w-full border border-slate-200 bg-white" />
        </div>
      ) : tool === 'traffic' ? (
        <TrafficGeneratorApp deviceId={device.id} onBack={() => setTool('ip')} backLabel="Back to GUI" />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-3xl space-y-5">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{t('IP Configuration')}</h3>
                  <p className="mt-1 text-xs text-slate-500">{port.name} · {port.macAddress}</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold text-slate-700">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name={`end-device-ip-mode-${device.id}`} checked={!device.config.dhcpEnabled} onChange={() => updateDeviceConfig(device.id, { dhcpEnabled: false, dhcpLease: undefined })} className="h-4 w-4 cursor-pointer text-sky-600" />
                    <span>{t('Static')}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-slate-500">
                    <input type="radio" name={`end-device-ip-mode-${device.id}`} checked={device.config.dhcpEnabled === true} onChange={() => useWorkspaceStore.getState().setStatus(requestDhcp(device.id))} className="h-4 w-4 cursor-pointer text-sky-600" />
                    <span>{t('DHCP (Auto Request)')}</span>
                  </label>
                </div>
              </div>
              {dhcpTransactions.filter(transaction => transaction.sourceDeviceId === device.id).slice(-1).map(transaction => (
                <p key={transaction.requestId} role="status" className={`mt-3 rounded border px-3 py-2 text-xs ${transaction.status === 'failed' ? 'border-red-300 bg-red-50 text-red-800' : transaction.status === 'successful' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-sky-300 bg-sky-50 text-sky-800'}`}>
                  {transaction.status === 'successful' ? `${t('DHCP lease assigned')}${transaction.assignedIp ? `: ${transaction.assignedIp}` : ''}` : transaction.status === 'failed' ? `${t('DHCP exchange failed')}${transaction.reason ? `: ${transaction.reason}` : ''}` : t('DHCP Discover sent')}
                </p>
              ))}
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">{t('IPv4 Address')}
                <input value={port.ipAddress ?? ''} onChange={event => updatePortConfig(device.id, port.id, { ipAddress: event.target.value.trim() })} disabled={device.config.dhcpEnabled === true} placeholder="192.168.1.10" className="mt-1 min-h-[42px] w-full rounded-lg border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs text-slate-800 outline-none focus:border-[#0284c7] disabled:opacity-70" />
              </label>
              <label className="block text-xs font-bold text-slate-700">{t('Subnet Mask')}
                <input value={port.subnetMask ?? ''} onChange={event => updatePortConfig(device.id, port.id, { subnetMask: event.target.value.trim() })} disabled={device.config.dhcpEnabled === true} placeholder="255.255.255.0" className="mt-1 min-h-[42px] w-full rounded-lg border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs text-slate-800 outline-none focus:border-[#0284c7] disabled:opacity-70" />
              </label>
              <label className="block text-xs font-bold text-slate-700">{t('Default Gateway')}
                <input value={device.config.defaultGateway ?? ''} onChange={event => updateDeviceConfig(device.id, { defaultGateway: event.target.value.trim() })} disabled={device.config.dhcpEnabled === true} placeholder="192.168.1.1" className="mt-1 min-h-[42px] w-full rounded-lg border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs text-slate-800 outline-none focus:border-[#0284c7] disabled:opacity-70" />
              </label>
              <label className="block text-xs font-bold text-slate-700">{t('DNS Server')}
                <input value={device.config.dnsServer ?? ''} onChange={event => updateDeviceConfig(device.id, { dnsServer: event.target.value.trim() })} disabled={device.config.dhcpEnabled === true} placeholder="192.168.1.2" className="mt-1 min-h-[42px] w-full rounded-lg border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs text-slate-800 outline-none focus:border-[#0284c7] disabled:opacity-70" />
              </label>
            </section>

            <section className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700">{t('IPv6 Configuration')}
                <select value={port.ipv6Dhcp ? 'dhcpv6' : port.ipv6Autoconfig ? 'auto' : 'static'} onChange={event => setIpv6HostMode(device.id, port.id, event.target.value as 'static' | 'auto' | 'dhcpv6')} className="mt-1 min-h-[42px] w-full rounded-lg border border-[#94a3b8] bg-[#f8fafc] px-3 text-xs text-slate-800 outline-none focus:border-[#0284c7]">
                  <option value="static">{t('Static')}</option>
                  <option value="auto">{t('Auto Config')}</option>
                  <option value="dhcpv6">{t('DHCPv6')}</option>
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-700">{t('IPv6 Address/Prefix')}
                <input
                  disabled={port.ipv6Dhcp === true || port.ipv6Autoconfig === true}
                  value={port.ipv6Dhcp === true || port.ipv6Autoconfig === true ? (port.ipv6Addresses ?? []).map(address => `${address.address}/${address.prefixLength}`).join(', ') : ipv6Draft?.portId === port.id ? ipv6Draft.text : port.ipv6Addresses?.[0] ? `${port.ipv6Addresses[0].address}/${port.ipv6Addresses[0].prefixLength}` : ''}
                  onChange={event => {
                    const raw = event.target.value
                    setIpv6Draft({ portId: port.id, text: raw })
                    const trimmed = raw.trim()
                    if (!trimmed) { updatePortConfig(device.id, port.id, { ipv6Addresses: undefined }); return }
                    const parsed = parseIpv6WithPrefix(trimmed)
                    if (parsed) updatePortConfig(device.id, port.id, { ipv6Addresses: [{ address: parsed.address, prefixLength: parsed.prefixLength, source: 'static' }] })
                  }}
                  onBlur={() => setIpv6Draft(current => current?.portId === port.id ? null : current)}
                  placeholder="2001:db8:1::10/64"
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs text-slate-800 outline-none focus:border-[#0284c7] disabled:opacity-70"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700 sm:col-span-2">{t('IPv6 Default Gateway')}
                <input value={device.config.ipv6DefaultGateway ?? ''} onChange={event => updateDeviceConfig(device.id, { ipv6DefaultGateway: event.target.value.trim() })} placeholder="2001:db8:1::1" className="mt-1 min-h-[42px] w-full rounded-lg border border-[#94a3b8] bg-[#f8fafc] px-3 font-mono text-xs text-slate-800 outline-none focus:border-[#0284c7]" />
              </label>
            </section>

            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {t('This end device uses its built-in interface. The Traffic Generator sends real packets through the simulated network.')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * HTML editing surface for a generic end device. The password lock is a local
 * classroom lock: it prevents casual edits in the UI, not tampering with a
 * workspace file the owner can already read.
 */
export function EndDeviceHtmlTab({ deviceId }: { deviceId: string }) {
  const { t, dir } = useI18n()
  const { device, updateDeviceConfig } = useNetworkStore(useShallow(state => ({
    device: state.devices.find(candidate => candidate.id === deviceId),
    updateDeviceConfig: state.updateDeviceConfig,
  })))
  const [draft, setDraft] = useState(device?.config.guiHtml ?? '')
  const [password, setPassword] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [status, setStatus] = useState('')

  if (!device) return null
  const lockHash = device.config.guiHtmlPasswordHash
  const locked = Boolean(lockHash) && !unlocked

  const unlock = () => {
    if (!lockHash) return
    if (!password) { setStatus(t('Enter the HTML password.')); return }
    if (hashGuiPassword(password) !== lockHash) { setStatus(t('Incorrect password.')); return }
    setUnlocked(true)
    setPassword('')
    setStatus('')
  }
  const lock = () => {
    if (!password) { setStatus(t('Enter the HTML password.')); return }
    updateDeviceConfig(device.id, { guiHtmlPasswordHash: hashGuiPassword(password) })
    setPassword('')
    setUnlocked(false)
    setStatus(t('HTML locked.'))
  }
  const removeLock = () => {
    if (locked) {
      if (!password) { setStatus(t('Enter the HTML password.')); return }
      if (hashGuiPassword(password) !== lockHash!) { setStatus(t('Incorrect password.')); return }
    }
    updateDeviceConfig(device.id, { guiHtmlPasswordHash: undefined })
    setPassword('')
    setUnlocked(true)
    setStatus(t('HTML lock removed.'))
  }
  const apply = () => {
    if (new TextEncoder().encode(draft).byteLength > MAX_GUI_HTML_BYTES) { setStatus(t('HTML is too large.')); return }
    updateDeviceConfig(device.id, { guiHtml: draft.trim() ? draft : undefined })
    setStatus(t('HTML applied.'))
  }
  const statusIsError = status === t('Incorrect password.') || status === t('Enter the HTML password.') || status === t('HTML is too large.')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#94a3b8] bg-white" dir={dir}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cbd5e1] bg-[#e2e8f0] px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{t('HTML')}</h3>
          <p className="mt-1 text-xs text-slate-500">{locked ? t('HTML is locked.') : t('Custom HTML replaces the built-in GUI.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {locked ? (
            <>
              <input type="password" aria-label={t('Password')} value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') unlock() }} placeholder={t('Password')} className="min-h-[38px] w-44 rounded border border-slate-300 px-3 text-xs" />
              <button type="button" onClick={unlock} className="min-h-[38px] rounded border border-sky-700 bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">{t('Unlock HTML')}</button>
            </>
          ) : (
            <>
              <input type="password" aria-label={t('Password')} value={password} onChange={event => setPassword(event.target.value)} placeholder={t('Password')} className="min-h-[38px] w-44 rounded border border-slate-300 px-3 text-xs" />
              <button type="button" onClick={lock} className="min-h-[38px] rounded border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100">{t('Lock HTML')}</button>
              {lockHash && <button type="button" onClick={removeLock} className="min-h-[38px] rounded border border-rose-300 bg-white px-4 text-xs font-semibold text-rose-700 hover:bg-rose-50">{t('Remove lock')}</button>}
            </>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <textarea
          aria-label={t('HTML')}
          value={draft}
          readOnly={locked}
          onChange={event => setDraft(event.target.value)}
          spellCheck={false}
          dir="ltr"
          placeholder={`<!doctype html>
<html>
  <body>
    <h1>End device</h1>
  </body>
</html>`}
          className="min-h-[320px] flex-1 resize-none rounded-lg border border-[#94a3b8] bg-[#f8fafc] p-3 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:border-[#0284c7] read-only:bg-slate-100"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{t('The HTML is rendered without scripts. Use the GUI tab to preview it.')}</p>
          <div className="flex items-center gap-2">
            {status && <span role="status" className={`text-xs font-semibold ${statusIsError ? 'text-red-700' : 'text-emerald-700'}`}>{status}</span>}
            <button type="button" disabled={locked} onClick={apply} className="min-h-[38px] rounded border border-sky-700 bg-sky-700 px-5 text-xs font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">{t('Apply')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
