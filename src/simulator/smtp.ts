import type { EmailMessage, EmailServiceConfig } from '@/types/network'

export interface SmtpSubmission {
  requestId: string
  username: string
  password: string
  from: string
  to: string
  subject: string
  body: string
}

export interface SmtpServerResult {
  transcript: string
  message?: EmailMessage
}

export interface SmtpClientResult {
  ok: boolean
  message?: EmailMessage
  reason?: string
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(value: string): string | undefined {
  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '\r\n')
}

export function buildSmtpSubmissionTranscript(submission: SmtpSubmission): string {
  const messageId = `mail-${submission.requestId}`
  const bodyLines = normalizeLineEndings(submission.body).split('\r\n').map(line => line.startsWith('.') ? `.${line}` : line)
  return [
    'EHLO wirex.student',
    `AUTH PLAIN ${encodeBase64(`\0${submission.username}\0${submission.password}`)}`,
    `MAIL FROM:<${submission.from}>`,
    `RCPT TO:<${submission.to}>`,
    'DATA',
    `From: ${submission.from}`,
    `To: ${submission.to}`,
    `Subject: ${submission.subject}`,
    `Message-ID: <${messageId}@wirex.local>`,
    '',
    ...bodyLines,
    '.',
    'QUIT',
    '',
  ].join('\r\n')
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase()
}

function isAddressForDomain(value: string, domain: string): boolean {
  const parts = value.split('@')
  return parts.length === 2 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(parts[0] ?? '') &&
    parts[1]?.toLowerCase() === domain.toLowerCase() && !/[\r\n\s<>]/.test(value)
}

function smtpFailure(transcript: string[], code: number, detail: string): SmtpServerResult {
  transcript.push(`${code} ${detail}`)
  return { transcript: `${transcript.join('\r\n')}\r\n` }
}

export function processSmtpSubmissionTranscript(
  requestText: string,
  service: EmailServiceConfig | undefined,
  requestId: string,
  sentAtTick: number,
): SmtpServerResult {
  const replies = ['220 wireX ESMTP service ready']
  if (!/^[A-Za-z0-9-]{1,128}$/.test(requestId)) return smtpFailure(replies, 500, '5.5.2 Invalid SMTP transaction identifier.')
  if (!requestText.endsWith('\r\n') || requestText.includes('\0')) return smtpFailure(replies, 500, '5.5.2 Malformed SMTP session.')
  const lines = requestText.split('\r\n')
  let index = 0
  const next = () => lines[index++] ?? ''

  if (!/^EHLO [A-Za-z0-9.-]{1,255}$/i.test(next())) return smtpFailure(replies, 503, '5.5.1 Bad sequence of commands.')
  replies.push('250-wireX greets wirex.student', '250-AUTH PLAIN', '250 SIZE 65536')

  const auth = /^AUTH PLAIN ([A-Za-z0-9+/]+={0,2})$/i.exec(next())
  const decoded = auth?.[1] ? decodeBase64(auth[1]) : undefined
  const credentials = decoded?.split('\0')
  const username = credentials?.length === 3 && credentials[0] === '' ? credentials[1] ?? '' : ''
  const password = credentials?.length === 3 && credentials[0] === '' ? credentials[2] ?? '' : ''
  const user = service?.users.find(candidate => candidate.username.toLowerCase() === username.toLowerCase() && candidate.password === password)
  if (!user) return smtpFailure(replies, 535, '5.7.8 Authentication credentials invalid.')
  replies.push('235 2.7.0 Authentication successful')

  const senderCommand = next()
  if (!/^MAIL FROM:/i.test(senderCommand)) return smtpFailure(replies, 503, '5.5.1 Bad sequence of commands.')
  const senderMatch = /^MAIL FROM:<([^<>\s]+)>$/i.exec(senderCommand)
  const sender = senderMatch?.[1]
  const expectedSender = `${user.username}@${service?.domain ?? ''}`
  if (!sender || !isAddressForDomain(sender, service?.domain ?? '') || normalizeAddress(sender) !== normalizeAddress(expectedSender)) {
    return smtpFailure(replies, 553, `5.7.1 Sender must match the authenticated account ${normalizeAddress(expectedSender)}.`)
  }
  replies.push('250 2.1.0 Sender accepted')

  const recipientCommand = next()
  if (!/^RCPT TO:/i.test(recipientCommand)) return smtpFailure(replies, 503, '5.5.1 Bad sequence of commands.')
  const recipientMatch = /^RCPT TO:<([^<>\s]+)>$/i.exec(recipientCommand)
  const recipientAddress = recipientMatch?.[1]
  if (!recipientAddress || !isAddressForDomain(recipientAddress, service?.domain ?? '')) {
    return smtpFailure(replies, 550, '5.1.1 Recipient is not a local mailbox.')
  }
  const recipientParts = normalizeAddress(recipientAddress).split('@')
  const recipient = service?.users.find(candidate => candidate.username.toLowerCase() === recipientParts[0])
  if (!recipient) return smtpFailure(replies, 550, '5.1.1 Recipient is not a local mailbox.')
  if (recipient.mailbox.length >= 250) return smtpFailure(replies, 452, '4.2.2 Recipient mailbox is full.')
  replies.push('250 2.1.5 Recipient accepted')

  if (next().toUpperCase() !== 'DATA') return smtpFailure(replies, 503, '5.5.1 Bad sequence of commands.')
  replies.push('354 End data with <CRLF>.<CRLF>')

  const headers = new Map<string, string>()
  while (index < lines.length && lines[index] !== '') {
    const line = next()
    const colon = line.indexOf(':')
    const name = colon > 0 ? line.slice(0, colon).toLowerCase() : ''
    const value = colon > 0 ? line.slice(colon + 1).trim() : ''
    if (!['from', 'to', 'subject', 'message-id'].includes(name) || headers.has(name) || /[\u0000-\u001f\u007f]/.test(value)) {
      return smtpFailure(replies, 554, '5.6.0 Unsupported or malformed message header.')
    }
    headers.set(name, value)
  }
  if (next() !== '') return smtpFailure(replies, 554, '5.6.0 Message headers are malformed.')

  const bodyLines: string[] = []
  let endedData = false
  while (index < lines.length) {
    const line = next()
    if (line === '.') {
      endedData = true
      break
    }
    if (line.startsWith('.') && !line.startsWith('..')) return smtpFailure(replies, 554, '5.6.0 DATA line uses invalid dot transparency.')
    bodyLines.push(line.startsWith('..') ? line.slice(1) : line)
  }
  const messageBody = bodyLines.join('\n')
  const expectedMessageId = `<mail-${requestId}@wirex.local>`
  if (!endedData || next().toUpperCase() !== 'QUIT' || lines.slice(index).some(line => line !== '') ||
    !headers.has('from') || !headers.has('to') || !headers.has('subject') || headers.get('message-id') !== expectedMessageId ||
    normalizeAddress(headers.get('from') ?? '') !== normalizeAddress(sender) ||
    normalizeAddress(headers.get('to') ?? '') !== normalizeAddress(recipientAddress) ||
    !headers.get('subject')?.trim() || (headers.get('subject')?.length ?? 0) > 255 || !messageBody ||
    new TextEncoder().encode(messageBody).byteLength > 65_536) {
    return smtpFailure(replies, 554, '5.6.0 Message content or headers are invalid.')
  }

  const message: EmailMessage = {
    id: `mail-${requestId}`,
    from: normalizeAddress(sender),
    to: normalizeAddress(recipientAddress),
    subject: headers.get('subject')!,
    body: messageBody,
    sentAtTick,
  }
  replies.push(`250 2.0.0 queued as ${message.id}`, '221 2.0.0 closing connection')
  return { transcript: `${replies.join('\r\n')}\r\n`, message }
}

export function parseSmtpServerTranscript(
  responseText: string,
  submission: SmtpSubmission,
  sentAtTick: number,
): SmtpClientResult {
  const replies = responseText.split(/\r?\n/).filter(Boolean).map(line => {
    const match = /^(\d{3})[ -](.*)$/.exec(line)
    return match ? { code: Number(match[1]), text: match[2] ?? '' } : undefined
  }).filter((reply): reply is { code: number; text: string } => reply !== undefined)
  const queued = replies.find(reply => reply.code === 250 && /^2\.0\.0 queued as (mail-[A-Za-z0-9-]+)$/.test(reply.text))
  const queueId = queued && /^2\.0\.0 queued as (mail-[A-Za-z0-9-]+)$/.exec(queued.text)?.[1]
  const closed = replies.some(reply => reply.code === 221 && reply.text.startsWith('2.0.0 closing connection'))
  if (queueId !== `mail-${submission.requestId}` || !closed) {
    const lastReply = replies.at(-1)
    return { ok: false, reason: lastReply ? `SMTP ${lastReply.code} ${lastReply.text}` : 'SMTP server returned no valid reply.' }
  }
  return {
    ok: true,
    message: {
      id: queueId,
      from: normalizeAddress(submission.from),
      to: normalizeAddress(submission.to),
      subject: submission.subject,
      body: submission.body.replace(/\r\n|\r/g, '\n'),
      sentAtTick,
    },
  }
}
