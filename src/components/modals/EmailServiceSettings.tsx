'use client'

import { useState } from 'react'
import type { EmailServiceConfig, NetworkDevice } from '@/types/network'
import { useNetworkStore } from '@/store/networkStore'
import { useI18n } from '@/i18n/useI18n'

const emptyService = (): EmailServiceConfig => ({ domain: 'classroom.test', smtpEnabled: false, pop3Enabled: false, users: [] })

export function EmailServiceSettings({ device }: { device: NetworkDevice }) {
  const { t } = useI18n()
  const updateDeviceConfig = useNetworkStore(state => state.updateDeviceConfig)
  const service = device.config.emailService ?? emptyService()
  const [domainDraft, setDomainDraft] = useState(service.domain)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const update = (patch: Partial<EmailServiceConfig>) => updateDeviceConfig(device.id, { emailService: { ...service, ...patch } })

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4" aria-labelledby={`email-service-${device.id}`}>
      <div>
        <h4 id={`email-service-${device.id}`} className="text-xs font-bold uppercase tracking-wider text-slate-800">{t('Email Service')}</h4>
        <p className="mt-1 text-xs text-slate-500">{t('SMTP sends mail over TCP 25. POP3 retrieves the configured mailbox over TCP 110.')}</p>
      </div>
      <form className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2" onSubmit={event => {
        event.preventDefault()
        const domain = domainDraft.trim().toLowerCase().replace(/\.$/, '')
        const labels = domain.split('.')
        if (!domain || domain.length > 253 || labels.some(label => label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
          setError(t('Enter a valid mail domain.'))
          return
        }
        update({ domain })
        setDomainDraft(domain)
        setError('')
      }}>
        <label className="block text-xs font-semibold text-slate-700">
          {t('Mail domain')}
          <input value={domainDraft} maxLength={253} onChange={event => setDomainDraft(event.target.value)} placeholder="classroom.test" className="mt-1 min-h-[40px] w-full rounded border border-slate-300 bg-white px-3 font-mono text-xs" />
        </label>
        <button type="submit" className="min-h-[40px] rounded border border-slate-300 bg-slate-50 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100">{t('Save domain')}</button>
      </form>
      <div className="flex flex-wrap gap-3">
        <label className="inline-flex min-h-[40px] items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={service.smtpEnabled} onChange={event => update({ smtpEnabled: event.target.checked })} className="h-4 w-4 accent-sky-700" />
          {t('Enable SMTP (TCP 25)')}
        </label>
        <label className="inline-flex min-h-[40px] items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={service.pop3Enabled} onChange={event => update({ pop3Enabled: event.target.checked })} className="h-4 w-4 accent-sky-700" />
          {t('Enable POP3 (TCP 110)')}
        </label>
      </div>
      <form className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={event => {
        event.preventDefault()
        const normalized = username.trim().toLowerCase()
        if (!/^[a-z0-9._-]{1,32}$/.test(normalized) || password.length < 1 || password.length > 128) {
          setError(t('Use a 1–32 character mailbox name and a password up to 128 characters.'))
          return
        }
        if (service.users.some(user => user.username.toLowerCase() === normalized)) {
          setError(t('That mailbox already exists.'))
          return
        }
        if (service.users.length >= 100) {
          setError(t('The mail server supports up to 100 mailboxes.'))
          return
        }
        update({ users: [...service.users, { username: normalized, password, mailbox: [] }] })
        setUsername('')
        setPassword('')
        setError('')
      }}>
        <label className="block text-xs font-semibold text-slate-700">{t('Mailbox username')}<input value={username} onChange={event => setUsername(event.target.value)} maxLength={32} autoComplete="off" className="mt-1 min-h-[40px] w-full rounded border border-slate-300 bg-white px-3 font-mono text-xs" /></label>
        <label className="block text-xs font-semibold text-slate-700">{t('Mailbox password')}<input type="password" value={password} onChange={event => setPassword(event.target.value)} maxLength={128} autoComplete="new-password" className="mt-1 min-h-[40px] w-full rounded border border-slate-300 bg-white px-3 text-xs" /></label>
        <button type="submit" className="min-h-[40px] rounded border border-sky-800 bg-sky-800 px-4 text-xs font-bold text-white hover:bg-sky-900">{t('Add mailbox')}</button>
      </form>
      {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
      <div className="space-y-2">
        {service.users.map(user => <div key={user.username} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs">
          <div><span className="font-mono font-semibold">{user.username}@{service.domain}</span><span data-testid={`mailbox-count-${user.username}`} className="ml-2 text-slate-500">{user.mailbox.length} {t('messages')}</span></div>
          <button type="button" onClick={() => update({ users: service.users.filter(candidate => candidate.username !== user.username) })} className="min-h-[34px] rounded border border-slate-300 px-3 font-semibold text-rose-700 hover:bg-rose-50">{t('Remove mailbox')}</button>
        </div>)}
        {service.users.length === 0 && <p className="text-xs text-slate-500">{t('No mailboxes configured.')}</p>}
      </div>
    </section>
  )
}
