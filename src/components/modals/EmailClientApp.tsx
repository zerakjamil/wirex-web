'use client'

import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { EmailAccountConfig } from '@/types/network'
import { useNetworkStore } from '@/store/networkStore'
import { useI18n } from '@/i18n/useI18n'
import { isValidIpv4 } from '@/simulator/protocols/ip'

const emptyAccount = (): EmailAccountConfig => ({
  displayName: '', emailAddress: '', incomingServer: '', outgoingServer: '', username: '', password: '', inbox: [], sent: [],
})

export function EmailClientApp({ deviceId, onBack }: { deviceId: string; onBack: () => void }) {
  const { t } = useI18n()
  const { device, transactions, simulationWarning, updateDeviceConfig, sendEmail, checkEmail, deleteEmail } = useNetworkStore(useShallow(state => ({
    device: state.devices.find(item => item.id === deviceId),
    transactions: state.emailTransactions,
    simulationWarning: state.simulationWarning,
    updateDeviceConfig: state.updateDeviceConfig,
    sendEmail: state.sendEmail,
    checkEmail: state.checkEmail,
    deleteEmail: state.deleteEmail,
  })))
  const [draft, setDraft] = useState<EmailAccountConfig>(() => ({ ...emptyAccount(), ...(device?.config.emailAccount ?? {}) }))
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [activeFolder, setActiveFolder] = useState<'inbox' | 'sent'>('inbox')
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [confirmServerDeleteFor, setConfirmServerDeleteFor] = useState<string | null>(null)
  const [error, setError] = useState('')

  const transaction = transactions.find(item => item.requestId === requestId)
  const account = device?.config.emailAccount
  const visibleMessages = useMemo(() => activeFolder === 'inbox' ? (account?.inbox ?? []) : (account?.sent ?? []), [account?.inbox, account?.sent, activeFolder])
  const selectedMessage = visibleMessages.find(message => message.id === selectedMessageId) ?? visibleMessages[0]

  const saveAccount = () => {
    if (!device) return
    const emailAddress = draft.emailAddress.trim().toLowerCase()
    if (!draft.displayName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress) || !draft.username.trim() || !draft.password || !isValidIpv4(draft.incomingServer.trim()) || !isValidIpv4(draft.outgoingServer.trim())) {
      setError(t('Enter a display name, valid email address, username, password, and both mail server IPv4 addresses.'))
      return
    }
    updateDeviceConfig(device.id, { emailAccount: { ...draft, emailAddress, username: draft.username.trim(), inbox: account?.inbox ?? [], sent: account?.sent ?? [] } })
    setDraft(current => ({ ...current, emailAddress, username: current.username.trim() }))
    setError('')
  }

  const startSend = () => {
    if (!account) {
      setError(t('Save the email account before sending.'))
      return
    }
    const id = sendEmail(deviceId, to, subject, body)
    if (!id) {
      setError(simulationWarning || t('Email could not be sent. Check the mail server, route, ACL, and link status.'))
      return
    }
    setRequestId(id)
    setError('')
  }

  const startCheck = () => {
    if (!account) {
      setError(t('Save the email account before checking mail.'))
      return
    }
    const id = checkEmail(deviceId)
    if (!id) {
      setError(simulationWarning || t('Mail could not be retrieved. Check the incoming mail server, route, ACL, and link status.'))
      return
    }
    setRequestId(id)
    setActiveFolder('inbox')
    setError('')
  }

  const startDelete = () => {
    if (!account) {
      setError(t('Save the email account before deleting server mail.'))
      return
    }
    if (activeFolder !== 'inbox' || !selectedMessage) {
      setError(t('Select an inbox message to delete it from the server.'))
      return
    }
    const id = deleteEmail(deviceId, selectedMessage.id)
    if (!id) {
      setError(simulationWarning || t('Mail could not be deleted. Check the incoming mail server, route, ACL, and link status.'))
      return
    }
    setRequestId(id)
    setConfirmServerDeleteFor(null)
    setError('')
  }

  if (!device) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-slate-300 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3">
        <div><h3 className="text-sm font-bold text-slate-800">{t('Email')}</h3><p className="text-xs text-slate-500">{t('SMTP send and POP3 retrieval are simulated over the configured network.')}</p></div>
        <button type="button" onClick={onBack} className="min-h-[38px] rounded border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100">{t('Back to Desktop')}</button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(320px,1.2fr)]">
        <section className="space-y-3" aria-labelledby={`email-account-${deviceId}`}>
          <h4 id={`email-account-${deviceId}`} className="text-xs font-bold uppercase tracking-wide text-slate-700">{t('Email account')}</h4>
          <label className="block text-xs font-semibold text-slate-700">{t('Display name')}<input value={draft.displayName} maxLength={80} onChange={event => setDraft({ ...draft, displayName: event.target.value })} className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 text-xs" /></label>
          <label className="block text-xs font-semibold text-slate-700">{t('Email address')}<input type="email" value={draft.emailAddress} maxLength={254} onChange={event => setDraft({ ...draft, emailAddress: event.target.value })} placeholder="student@classroom.test" className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" /></label>
          <label className="block text-xs font-semibold text-slate-700">{t('Mailbox username')}<input value={draft.username} maxLength={32} autoComplete="off" onChange={event => setDraft({ ...draft, username: event.target.value })} className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" /></label>
          <label className="block text-xs font-semibold text-slate-700">{t('Mailbox password')}<input type="password" value={draft.password} maxLength={128} autoComplete="new-password" onChange={event => setDraft({ ...draft, password: event.target.value })} className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 text-xs" /></label>
          <label className="block text-xs font-semibold text-slate-700">{t('Incoming mail server')}<input value={draft.incomingServer} onChange={event => setDraft({ ...draft, incomingServer: event.target.value })} placeholder="192.168.1.10" className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" /></label>
          <label className="block text-xs font-semibold text-slate-700">{t('Outgoing mail server')}<input value={draft.outgoingServer} onChange={event => setDraft({ ...draft, outgoingServer: event.target.value })} placeholder="192.168.1.10" className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" /></label>
          <button type="button" onClick={saveAccount} className="min-h-[40px] w-full rounded border border-sky-800 bg-sky-800 px-4 text-xs font-bold text-white hover:bg-sky-900">{t('Save account')}</button>
          {account && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{t('Account saved')}: <span className="font-mono">{account.emailAddress}</span></p>}
        </section>

        <div className="space-y-4">
          <section className="space-y-3" aria-labelledby={`email-compose-${deviceId}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 id={`email-compose-${deviceId}`} className="text-xs font-bold uppercase tracking-wide text-slate-700">{t('Compose')}</h4><button type="button" onClick={startCheck} disabled={!account} className="min-h-[38px] rounded border border-slate-300 bg-slate-50 px-4 text-xs font-semibold text-slate-700 enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{t('Check mail')}</button></div>
            <label className="block text-xs font-semibold text-slate-700">{t('To')}<input value={to} maxLength={254} onChange={event => setTo(event.target.value)} placeholder="student@classroom.test" className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 font-mono text-xs" /></label>
            <label className="block text-xs font-semibold text-slate-700">{t('Subject')}<input value={subject} maxLength={255} onChange={event => setSubject(event.target.value)} className="mt-1 min-h-[38px] w-full rounded border border-slate-300 px-3 text-xs" /></label>
            <label className="block text-xs font-semibold text-slate-700">{t('Message')}<textarea value={body} maxLength={65_536} rows={4} onChange={event => setBody(event.target.value)} className="mt-1 min-h-[110px] w-full resize-y rounded border border-slate-300 px-3 py-2 text-xs" /></label>
            <button type="button" onClick={startSend} disabled={!account} className="min-h-[40px] rounded border border-sky-800 bg-sky-800 px-5 text-xs font-bold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50">{t('Send')}</button>
          </section>

          {error && <p role="alert" className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
          {transaction && <div role={transaction.status === 'failed' ? 'alert' : 'status'} aria-live="polite" className={`rounded border px-3 py-2 text-xs ${transaction.status === 'failed' ? 'border-rose-300 bg-rose-50 text-rose-800' : transaction.status === 'successful' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-sky-300 bg-sky-50 text-sky-800'}`}>
            <span className="font-semibold">{transaction.status === 'pending' ? t(transaction.action === 'send' ? 'Sending email' : transaction.action === 'delete' ? 'Deleting message from server' : 'Checking mail') : transaction.status === 'successful' ? t(transaction.action === 'send' ? 'Email sent' : transaction.action === 'delete' ? 'Message deleted from server' : 'Mail retrieved') : t(transaction.action === 'delete' ? 'Message deletion failed' : 'Email operation failed')}</span>
            {transaction.reason && <p className="mt-1">{transaction.reason}</p>}
          </div>}

          <section aria-labelledby={`email-folders-${deviceId}`}>
            <h4 id={`email-folders-${deviceId}`} className="text-xs font-bold uppercase tracking-wide text-slate-700">{t('Mailboxes')}</h4>
            <div className="mt-2 flex gap-2 border-b border-slate-200 pb-2">
              <button type="button" aria-pressed={activeFolder === 'inbox'} onClick={() => { setActiveFolder('inbox'); setSelectedMessageId(null); setConfirmServerDeleteFor(null) }} className={`min-h-[36px] rounded px-3 text-xs font-semibold ${activeFolder === 'inbox' ? 'bg-sky-800 text-white' : 'border border-slate-300 bg-slate-50 text-slate-700'}`}>{t('Inbox')} ({account?.inbox.length ?? 0})</button>
              <button type="button" aria-pressed={activeFolder === 'sent'} onClick={() => { setActiveFolder('sent'); setSelectedMessageId(null); setConfirmServerDeleteFor(null) }} className={`min-h-[36px] rounded px-3 text-xs font-semibold ${activeFolder === 'sent' ? 'bg-sky-800 text-white' : 'border border-slate-300 bg-slate-50 text-slate-700'}`}>{t('Sent')} ({account?.sent.length ?? 0})</button>
            </div>
            <div className="mt-2 grid min-h-[130px] grid-cols-1 gap-2 sm:grid-cols-[minmax(120px,0.75fr)_minmax(0,1.25fr)]">
              <div className="space-y-1">
                {visibleMessages.map(message => <button type="button" key={message.id} onClick={() => { setSelectedMessageId(message.id); setConfirmServerDeleteFor(null) }} className={`block min-h-[44px] w-full rounded border px-2 py-1 text-left text-xs ${selectedMessage?.id === message.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><span className="block truncate font-semibold">{message.subject}</span><span className="block truncate text-slate-500">{activeFolder === 'inbox' ? message.from : message.to}</span></button>)}
                {visibleMessages.length === 0 && <p className="py-3 text-xs text-slate-500">{t('No messages in this folder.')}</p>}
              </div>
              <article className="min-w-0 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
                {selectedMessage ? <><div className="font-semibold">{selectedMessage.subject}</div><div className="mt-1 break-all text-slate-500">{selectedMessage.from} → {selectedMessage.to}</div><p className="mt-3 whitespace-pre-wrap break-words text-slate-800">{selectedMessage.body}</p>{activeFolder === 'inbox' && <div className="mt-4 border-t border-slate-200 pt-3">{confirmServerDeleteFor === selectedMessage.id ? <div className="space-y-2"><p className="text-amber-900">{t('Delete this message from the server? Your downloaded inbox copy will remain.')}</p><div className="flex flex-wrap gap-2"><button type="button" onClick={startDelete} disabled={transaction?.status === 'pending'} className="min-h-[36px] rounded border border-rose-800 bg-rose-700 px-3 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50">{t('Confirm server deletion')}</button><button type="button" onClick={() => setConfirmServerDeleteFor(null)} className="min-h-[36px] rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">{t('Cancel')}</button></div></div> : <button type="button" onClick={() => setConfirmServerDeleteFor(selectedMessage.id)} className="min-h-[36px] rounded border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-800 hover:bg-rose-50">{t('Delete from server')}</button>}</div>}</> : <p className="text-slate-500">{t('Select a message to read it.')}</p>}
              </article>
            </div>
          </section>
          {!account && <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('Configure an email account and enable SMTP and POP3 on a connected mail server before sending or checking mail.')}</p>}
        </div>
      </div>
    </div>
  )
}
