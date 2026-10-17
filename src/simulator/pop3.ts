import type { EmailMessage, EmailServiceConfig, EmailServiceUser } from '@/types/network'

export interface Pop3Credentials {
  username: string
  password: string
}

export interface Pop3FetchRequest extends Pop3Credentials {
  messageIds: string[]
}

export interface Pop3DeleteRequest extends Pop3Credentials {
  messageIds: string[]
  messageId: string
  reset?: boolean
}

export interface Pop3ListResult {
  ok: boolean
  messageIds?: string[]
  reason?: string
}

export interface Pop3FetchResult {
  ok: boolean
  messages?: EmailMessage[]
  reason?: string
}

export interface Pop3DeleteResult {
  ok: boolean
  deletedMessageId?: string
  reason?: string
}

export interface Pop3DeleteServerResult {
  response: string
  deletedMessageId?: string
}

export type Pop3SessionState =
  | { phase: 'authorization'; username?: string }
  | { phase: 'transaction'; username: string; deletedMessageIds: string[] }
  | { phase: 'closed' }

export interface Pop3SessionStart {
  greeting: string
  state: Pop3SessionState
}

export interface Pop3CommandResult {
  response: string
  state: Pop3SessionState
  committedDeletedMessageIds?: string[]
}

const MAX_POP3_REQUEST_BYTES = 4096
const MAX_POP3_RESPONSE_BYTES = 65_536
const MAX_MESSAGES = 250

function normalizeBody(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '\r\n')
}

function dotStuff(value: string): string[] {
  return normalizeBody(value).split('\r\n').map(line => line.startsWith('.') ? `.${line}` : line)
}

function validUidl(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,70}$/.test(value)
}

function messageText(message: EmailMessage): string | undefined {
  if (!validUidl(message.id) || !message.from || !message.to || !message.subject.trim() ||
    /[\r\n\u0000-\u001f\u007f]/.test(message.from) || /[\r\n\u0000-\u001f\u007f]/.test(message.to) ||
    /[\r\n\u0000-\u001f\u007f]/.test(message.subject) || !Number.isSafeInteger(message.sentAtTick) || message.sentAtTick < 0) return undefined
  return [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Message-ID: <${message.id}@wirex.local>`,
    `X-WireX-Id: ${message.id}`,
    `X-WireX-Sent-At-Tick: ${message.sentAtTick}`,
    '',
    ...dotStuff(message.body),
    '.',
  ].join('\r\n')
}

function pop3RequestLines(requestText: string): string[] | undefined {
  if (!requestText.endsWith('\r\n') || requestText.includes('\0') || new TextEncoder().encode(requestText).byteLength > MAX_POP3_REQUEST_BYTES) return undefined
  const lines = requestText.split('\r\n')
  if (lines.pop() !== '') return undefined
  return lines
}

function parseCredentials(lines: string[], userIndex: number, service: EmailServiceConfig | undefined, replies: string[]): { user: EmailServiceUser; nextIndex: number } | { error: string } {
  const userMatch = /^USER ([^\s\u0000-\u001f\u007f]{1,32})$/i.exec(lines[userIndex] ?? '')
  if (!userMatch) return { error: '-ERR bad sequence of commands' }
  replies.push('+OK user accepted')
  const user = service?.users.find(candidate => candidate.username.toLowerCase() === userMatch[1]?.toLowerCase())
  const passMatch = /^PASS (.*)$/i.exec(lines[userIndex + 1] ?? '')
  if (!passMatch || !user || passMatch[1] !== user.password) return { error: '-ERR authentication failed: invalid mailbox credentials' }
  replies.push('+OK mailbox locked and ready')
  return { user, nextIndex: userIndex + 2 }
}

function statLine(mailbox: EmailMessage[]): string {
  const total = mailbox.reduce((sum, message) => sum + new TextEncoder().encode(messageText(message) ?? '').byteLength + 2, 0)
  return `+OK ${mailbox.length} ${total} messages`
}

function appendListingAndUidl(replies: string[], mailbox: EmailMessage[]): boolean {
  if (mailbox.length > MAX_MESSAGES || mailbox.some(message => !validUidl(message.id))) return false
  replies.push('+OK scan listing follows')
  mailbox.forEach((message, index) => replies.push(`${index + 1} ${new TextEncoder().encode(messageText(message) ?? '').byteLength}`))
  replies.push('.', '+OK unique-id listing follows')
  mailbox.forEach((message, index) => replies.push(`${index + 1} ${message.id}`))
  replies.push('.')
  return true
}

function endOfRequest(lines: string[], index: number): boolean {
  return lines[index]?.toUpperCase() === 'QUIT' && lines.slice(index + 1).every(line => line === '')
}

function formatFailure(replies: string[], reason: string): string {
  replies.push(reason)
  return `${replies.join('\r\n')}\r\n`
}

export function createPop3Session(): Pop3SessionStart {
  return { greeting: '+OK wireX POP3 service ready\r\n', state: { phase: 'authorization' } }
}

function pop3Reply(line: string): string {
  return `${line}\r\n`
}

function pop3CommandError(state: Pop3SessionState, message: string): Pop3CommandResult {
  return { response: pop3Reply(`-ERR ${message}`), state }
}

function mailboxMessageNumber(argument: string, mailbox: EmailMessage[], deletedIds: string[]): { message: EmailMessage; number: number } | undefined {
  if (!/^[1-9]\d{0,2}$/.test(argument)) return undefined
  const number = Number(argument)
  const message = mailbox[number - 1]
  return message && !deletedIds.includes(message.id) ? { message, number } : undefined
}

function activeMailbox(service: EmailServiceConfig | undefined, username: string): EmailServiceUser | undefined {
  return service?.users.find(candidate => candidate.username.toLowerCase() === username.toLowerCase())
}

/** Process one client command and return its single POP3 response turn. */
export function processPop3Command(commandText: string, service: EmailServiceConfig | undefined, state: Pop3SessionState): Pop3CommandResult {
  if (state.phase === 'closed') return pop3CommandError(state, 'POP3 session is closed')
  if (new TextEncoder().encode(commandText).byteLength > 512 || /[\r\n\u0000-\u001f\u007f]/.test(commandText)) {
    return pop3CommandError(state, 'malformed POP3 command')
  }
  const match = /^([A-Za-z]+)(?: (.*))?$/.exec(commandText)
  if (!match) return pop3CommandError(state, 'malformed POP3 command')
  const verb = (match[1] ?? '').toUpperCase()
  const argument = match[2] ?? ''

  if (state.phase === 'authorization') {
    if (verb === 'QUIT' && !argument) return { response: pop3Reply('+OK goodbye'), state: { phase: 'closed' } }
    if (verb === 'USER') {
      if (!/^[^\s\u0000-\u001f\u007f]{1,32}$/.test(argument)) return pop3CommandError(state, 'invalid mailbox name')
      const user = activeMailbox(service, argument)
      if (!user) return pop3CommandError({ phase: 'authorization' }, 'no such mailbox')
      return { response: pop3Reply('+OK user accepted'), state: { phase: 'authorization', username: user.username } }
    }
    if (verb === 'PASS') {
      if (!state.username) return pop3CommandError(state, 'USER is required before PASS')
      const user = activeMailbox(service, state.username)
      if (!user || argument !== user.password) return pop3CommandError(state, 'authentication failed: invalid mailbox credentials')
      return { response: pop3Reply('+OK mailbox locked and ready'), state: { phase: 'transaction', username: user.username, deletedMessageIds: [] } }
    }
    return pop3CommandError(state, 'USER and PASS are required before this command')
  }

  const user = activeMailbox(service, state.username)
  if (!user) return pop3CommandError(state, 'mailbox is no longer available')
  const visibleMessages = user.mailbox.filter(message => !state.deletedMessageIds.includes(message.id))

  if (verb === 'QUIT' && !argument) {
    const committedDeletedMessageIds = state.deletedMessageIds.filter(id => user.mailbox.some(message => message.id === id))
    return { response: pop3Reply('+OK goodbye'), state: { phase: 'closed' }, committedDeletedMessageIds }
  }
  if (verb === 'STAT' && !argument) return { response: pop3Reply(statLine(visibleMessages)), state }
  if (verb === 'LIST' && !argument) {
    const lines = ['+OK scan listing follows', ...visibleMessages.map(message => `${user.mailbox.indexOf(message) + 1} ${new TextEncoder().encode(messageText(message) ?? '').byteLength}`), '.']
    return { response: `${lines.join('\r\n')}\r\n`, state }
  }
  if (verb === 'UIDL' && !argument) {
    if (visibleMessages.some(message => !validUidl(message.id))) return pop3CommandError(state, 'mailbox contains an invalid UIDL')
    const lines = ['+OK unique-id listing follows', ...visibleMessages.map(message => `${user.mailbox.indexOf(message) + 1} ${message.id}`), '.']
    return { response: `${lines.join('\r\n')}\r\n`, state }
  }
  if (verb === 'LIST' || verb === 'UIDL') {
    const entry = mailboxMessageNumber(argument, user.mailbox, state.deletedMessageIds)
    if (!entry) return pop3CommandError(state, 'no such message')
    const value = verb === 'LIST' ? new TextEncoder().encode(messageText(entry.message) ?? '').byteLength : entry.message.id
    return { response: pop3Reply(`+OK ${entry.number} ${value}`), state }
  }
  if (verb === 'RETR') {
    const entry = mailboxMessageNumber(argument, user.mailbox, state.deletedMessageIds)
    if (!entry) return pop3CommandError(state, 'no such message')
    const block = messageText(entry.message)
    if (!block) return pop3CommandError(state, 'stored message has an invalid or unsafe header')
    const octets = new TextEncoder().encode(block.replace(/\r\n\.$/, '')).byteLength
    return { response: `+OK ${octets} octets\r\n${block}\r\n`, state }
  }
  if (verb === 'DELE') {
    const entry = mailboxMessageNumber(argument, user.mailbox, state.deletedMessageIds)
    if (!entry) return pop3CommandError(state, 'no such message')
    return {
      response: pop3Reply(`+OK message ${entry.number} marked for deletion`),
      state: { ...state, deletedMessageIds: [...state.deletedMessageIds, entry.message.id] },
    }
  }
  if (verb === 'RSET' && !argument) {
    return { response: pop3Reply(`+OK ${user.mailbox.length} messages`), state: { ...state, deletedMessageIds: [] } }
  }
  if (verb === 'NOOP' && !argument) return { response: pop3Reply('+OK'), state }
  return pop3CommandError(state, 'unsupported POP3 command or invalid arguments')
}

export function buildPop3ListTranscript(credentials: Pop3Credentials): string {
  return `USER ${credentials.username}\r\nPASS ${credentials.password}\r\nSTAT\r\nLIST\r\nUIDL\r\nQUIT\r\n`
}

export function buildPop3FetchTranscript(request: Pop3FetchRequest): string {
  const commands = ['USER ' + request.username, 'PASS ' + request.password, 'STAT', 'LIST', 'UIDL', ...request.messageIds.map((_, index) => `RETR ${index + 1}`), 'QUIT', '']
  return commands.join('\r\n')
}

export function buildPop3DeleteTranscript(request: Pop3DeleteRequest): string {
  const targetIndex = request.messageIds.indexOf(request.messageId)
  if (targetIndex < 0 || request.messageIds.length > MAX_MESSAGES || request.messageIds.some(id => !validUidl(id)) ||
    new Set(request.messageIds).size !== request.messageIds.length || !/^[a-z0-9._-]{1,32}$/i.test(request.username) ||
    !request.password || /[\u0000-\u001f\u007f]/.test(request.password)) return ''
  const commands = ['USER ' + request.username, 'PASS ' + request.password, 'STAT', 'LIST', 'UIDL', 'DELE ' + (targetIndex + 1)]
  if (request.reset) commands.push('RSET')
  commands.push('QUIT', '')
  const transcript = commands.join('\r\n')
  return new TextEncoder().encode(transcript).byteLength <= MAX_POP3_REQUEST_BYTES ? transcript : ''
}

export function processPop3ListTranscript(requestText: string, service: EmailServiceConfig | undefined): string {
  const replies = ['+OK wireX POP3 service ready']
  const lines = pop3RequestLines(requestText)
  if (!lines) return formatFailure(replies, '-ERR malformed or oversized POP3 request')
  const authentication = parseCredentials(lines, 0, service, replies)
  if ('error' in authentication) return formatFailure(replies, authentication.error)
  const { user, nextIndex } = authentication
  if (lines[nextIndex]?.toUpperCase() !== 'STAT' || lines[nextIndex + 1]?.toUpperCase() !== 'LIST' || lines[nextIndex + 2]?.toUpperCase() !== 'UIDL' || !endOfRequest(lines, nextIndex + 3)) {
    return formatFailure(replies, '-ERR bad sequence of commands')
  }
  replies.push(statLine(user.mailbox))
  if (!appendListingAndUidl(replies, user.mailbox)) return formatFailure(replies, '-ERR mailbox contains an invalid UIDL')
  replies.push('+OK goodbye')
  return `${replies.join('\r\n')}\r\n`
}

export function processPop3FetchTranscript(requestText: string, service: EmailServiceConfig | undefined, expectedMessageIds: string[]): string {
  const replies = ['+OK wireX POP3 service ready']
  const lines = pop3RequestLines(requestText)
  if (!lines) return formatFailure(replies, '-ERR malformed or oversized POP3 request')
  const authentication = parseCredentials(lines, 0, service, replies)
  if ('error' in authentication) return formatFailure(replies, authentication.error)
  const { user, nextIndex } = authentication
  const mailbox = user.mailbox
  if (expectedMessageIds.length !== mailbox.length || mailbox.some((message, index) => message.id !== expectedMessageIds[index])) {
    return formatFailure(replies, '-ERR mailbox changed; check mail again')
  }
  if (lines[nextIndex]?.toUpperCase() !== 'STAT' || lines[nextIndex + 1]?.toUpperCase() !== 'LIST' || lines[nextIndex + 2]?.toUpperCase() !== 'UIDL') {
    return formatFailure(replies, '-ERR bad sequence of commands')
  }
  const expectedCommands = expectedMessageIds.map((_, index) => `RETR ${index + 1}`)
  if (expectedCommands.some((command, index) => lines[nextIndex + 3 + index]?.toUpperCase() !== command) || !endOfRequest(lines, nextIndex + 3 + expectedCommands.length)) {
    return formatFailure(replies, '-ERR bad sequence of commands')
  }
  replies.push(statLine(mailbox))
  if (!appendListingAndUidl(replies, mailbox)) return formatFailure(replies, '-ERR mailbox contains an invalid UIDL')

  const messageBlocks = mailbox.map(messageText)
  if (messageBlocks.some(block => block === undefined)) return formatFailure(replies, '-ERR stored message has an invalid or unsafe header')
  const outputLines = [...replies]
  for (const block of messageBlocks) outputLines.push(`+OK ${new TextEncoder().encode(block!).byteLength} octets`, ...block!.split('\r\n'))
  outputLines.push('+OK goodbye')
  const output = `${outputLines.join('\r\n')}\r\n`
  if (new TextEncoder().encode(output).byteLength > MAX_POP3_RESPONSE_BYTES) return formatFailure(['+OK wireX POP3 service ready', '+OK user accepted', '+OK mailbox locked and ready'], '-ERR mailbox exceeds the 64 KiB retrieval limit; remove or archive messages')
  return output
}

export function processPop3DeleteTranscript(requestText: string, service: EmailServiceConfig | undefined, expectedMessageIds: string[], targetMessageId: string): Pop3DeleteServerResult {
  const replies = ['+OK wireX POP3 service ready']
  const lines = pop3RequestLines(requestText)
  if (!lines) return { response: formatFailure(replies, '-ERR malformed or oversized POP3 request') }
  const authentication = parseCredentials(lines, 0, service, replies)
  if ('error' in authentication) return { response: formatFailure(replies, authentication.error) }
  const { user, nextIndex } = authentication
  const mailboxIds = user.mailbox.map(message => message.id)
  if (!validUidl(targetMessageId) || expectedMessageIds.length !== mailboxIds.length ||
    expectedMessageIds.some((id, index) => id !== mailboxIds[index])) {
    return { response: formatFailure(replies, '-ERR mailbox changed; check mail again') }
  }
  if (lines[nextIndex]?.toUpperCase() !== 'STAT' || lines[nextIndex + 1]?.toUpperCase() !== 'LIST' || lines[nextIndex + 2]?.toUpperCase() !== 'UIDL') {
    return { response: formatFailure(replies, '-ERR bad sequence of commands') }
  }
  const targetIndex = expectedMessageIds.indexOf(targetMessageId)
  if (targetIndex < 0) return { response: formatFailure(replies, '-ERR requested UIDL was not in the listing') }
  const commandIndex = nextIndex + 3
  const deleteCommand = 'DELE ' + (targetIndex + 1)
  const reset = lines[commandIndex + 1]?.toUpperCase() === 'RSET'
  const expectedTail = reset ? [deleteCommand, 'RSET', 'QUIT'] : [deleteCommand, 'QUIT']
  if (expectedTail.some((command, index) => lines[commandIndex + index]?.toUpperCase() !== command) ||
    !endOfRequest(lines, commandIndex + expectedTail.length - 1)) {
    return { response: formatFailure(replies, '-ERR bad sequence of commands') }
  }
  replies.push(statLine(user.mailbox))
  if (!appendListingAndUidl(replies, user.mailbox)) return { response: formatFailure(replies, '-ERR mailbox contains an invalid UIDL') }
  replies.push('+OK message ' + (targetIndex + 1) + ' marked for deletion')
  if (reset) replies.push('+OK deletion marks cleared')
  replies.push('+OK goodbye')
  return {
    response: replies.join('\r\n') + '\r\n',
    deletedMessageId: reset ? undefined : targetMessageId,
  }
}

export function parsePop3DeleteTranscript(responseText: string, expectedMessageId: string): Pop3DeleteResult {
  const lines = responseLines(responseText)
  const reason = failureReason(lines)
  if (reason) return { ok: false, reason: 'POP3 ' + reason }
  if (lines[0] !== '+OK wireX POP3 service ready' || lines[1] !== '+OK user accepted' || lines[2] !== '+OK mailbox locked and ready') {
    return { ok: false, reason: 'POP3 server returned an invalid greeting or authentication response.' }
  }
  const listing = parseMailboxListings(lines, 3)
  if (!listing) return { ok: false, reason: 'POP3 server returned a malformed UIDL response for deletion.' }
  const marker = /^\+OK message (\d+) marked for deletion$/.exec(lines[listing.nextIndex] ?? '')
  const messageNumber = Number(marker?.[1])
  if (!marker || !Number.isInteger(messageNumber) || listing.messageIds[messageNumber - 1] !== expectedMessageId) {
    return { ok: false, reason: 'POP3 server did not confirm deletion of the selected UIDL.' }
  }
  if (lines[listing.nextIndex + 1] === '+OK deletion marks cleared' && lines[listing.nextIndex + 2] === '+OK goodbye' && listing.nextIndex + 3 === lines.length) {
    return { ok: false, reason: 'POP3 deletion was cancelled with RSET.' }
  }
  if (lines[listing.nextIndex + 1] !== '+OK goodbye' || listing.nextIndex + 2 !== lines.length) {
    return { ok: false, reason: 'POP3 server returned a malformed DELE or QUIT response.' }
  }
  return { ok: true, deletedMessageId: expectedMessageId }
}

function responseLines(responseText: string): string[] {
  const lines = responseText.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function failureReason(lines: string[]): string | undefined {
  const failure = lines.find(line => line.startsWith('-ERR '))
  return failure?.slice(5)
}

function parseMailboxListings(lines: string[], start: number): { messageIds: string[]; nextIndex: number } | undefined {
  if (!/^\+OK \d+ \d+ messages$/.test(lines[start] ?? '') || lines[start + 1] !== '+OK scan listing follows') return undefined
  const count = Number(/^\+OK (\d+)/.exec(lines[start] ?? '')?.[1])
  if (!Number.isInteger(count) || count < 0 || count > MAX_MESSAGES) return undefined
  let index = start + 2
  for (let messageIndex = 0; messageIndex < count; messageIndex++, index++) {
    if (!new RegExp(`^${messageIndex + 1} \\d+$`).test(lines[index] ?? '')) return undefined
  }
  if (lines[index++] !== '.' || lines[index++] !== '+OK unique-id listing follows') return undefined
  const messageIds: string[] = []
  for (let messageIndex = 0; messageIndex < count; messageIndex++, index++) {
    const match = new RegExp(`^${messageIndex + 1} ([A-Za-z0-9._-]{1,70})$`).exec(lines[index] ?? '')
    if (!match?.[1]) return undefined
    messageIds.push(match[1])
  }
  if (lines[index++] !== '.') return undefined
  return { messageIds, nextIndex: index }
}

export function parsePop3ListTranscript(responseText: string): Pop3ListResult {
  const lines = responseLines(responseText)
  const reason = failureReason(lines)
  if (reason) return { ok: false, reason: `POP3 ${reason}` }
  if (lines[0] !== '+OK wireX POP3 service ready' || lines[1] !== '+OK user accepted' || lines[2] !== '+OK mailbox locked and ready') {
    return { ok: false, reason: 'POP3 server returned an invalid greeting or authentication response.' }
  }
  const listing = parseMailboxListings(lines, 3)
  if (!listing || lines[listing.nextIndex] !== '+OK goodbye' || listing.nextIndex !== lines.length - 1) {
    return { ok: false, reason: 'POP3 server returned a malformed LIST or UIDL response.' }
  }
  return { ok: true, messageIds: listing.messageIds }
}

export function parsePop3UidlResponse(responseText: string): Pop3ListResult {
  const lines = responseLines(responseText)
  const reason = failureReason(lines)
  if (reason) return { ok: false, reason: `POP3 ${reason}` }
  if (lines[0] !== '+OK unique-id listing follows' || lines.at(-1) !== '.') {
    return { ok: false, reason: 'POP3 server returned a malformed UIDL response.' }
  }
  const messageIds: string[] = []
  for (const line of lines.slice(1, -1)) {
    const match = /^(\d+) ([A-Za-z0-9._-]{1,70})$/.exec(line)
    if (!match || Number(match[1]) !== messageIds.length + 1) return { ok: false, reason: 'POP3 server returned a malformed UIDL response.' }
    messageIds.push(match[2]!)
    if (messageIds.length > MAX_MESSAGES) return { ok: false, reason: 'POP3 mailbox exceeds the message limit.' }
  }
  return { ok: true, messageIds }
}

function parseMessageBlock(lines: string[], start: number): { message: EmailMessage; nextIndex: number } | undefined {
  if (!/^\+OK \d+ octets$/.test(lines[start] ?? '')) return undefined
  const headers = new Map<string, string>()
  let index = start + 1
  while (index < lines.length && lines[index] !== '') {
    const line = lines[index++] ?? ''
    const colon = line.indexOf(':')
    const name = colon > 0 ? line.slice(0, colon).toLowerCase() : ''
    const value = colon > 0 ? line.slice(colon + 1).trim() : ''
    if (!['from', 'to', 'subject', 'message-id', 'x-wirex-id', 'x-wirex-sent-at-tick'].includes(name) || headers.has(name) || /[\u0000-\u001f\u007f]/.test(value)) return undefined
    headers.set(name, value)
  }
  if (lines[index++] !== '') return undefined
  const body: string[] = []
  while (index < lines.length && lines[index] !== '.') {
    const line = lines[index++] ?? ''
    if (line.startsWith('.') && !line.startsWith('..')) return undefined
    body.push(line.startsWith('..') ? line.slice(1) : line)
  }
  if (lines[index++] !== '.') return undefined
  const id = headers.get('x-wirex-id') ?? ''
  const sentAtTick = Number(headers.get('x-wirex-sent-at-tick'))
  if (!validUidl(id) || !headers.get('from') || !headers.get('to') || !headers.get('subject') || !Number.isSafeInteger(sentAtTick) || sentAtTick < 0) return undefined
  return {
    message: { id, from: headers.get('from')!, to: headers.get('to')!, subject: headers.get('subject')!, body: body.join('\n'), sentAtTick },
    nextIndex: index,
  }
}

export function parsePop3FetchTranscript(responseText: string, expectedMessageIds: string[]): Pop3FetchResult {
  const lines = responseLines(responseText)
  const reason = failureReason(lines)
  if (reason) return { ok: false, reason: `POP3 ${reason}` }
  if (lines[0] !== '+OK wireX POP3 service ready' || lines[1] !== '+OK user accepted' || lines[2] !== '+OK mailbox locked and ready') {
    return { ok: false, reason: 'POP3 server returned an invalid greeting or authentication response.' }
  }
  const listing = parseMailboxListings(lines, 3)
  if (!listing || listing.messageIds.length !== expectedMessageIds.length || listing.messageIds.some((id, index) => id !== expectedMessageIds[index])) {
    return { ok: false, reason: 'POP3 mailbox changed between UIDL and RETR; check mail again.' }
  }
  let index = listing.nextIndex
  const messages: EmailMessage[] = []
  for (const expectedId of expectedMessageIds) {
    const block = parseMessageBlock(lines, index)
    if (!block || block.message.id !== expectedId) return { ok: false, reason: 'POP3 server returned a malformed or mismatched RETR response.' }
    messages.push(block.message)
    index = block.nextIndex
  }
  if (lines[index] !== '+OK goodbye' || index !== lines.length - 1) return { ok: false, reason: 'POP3 server returned a malformed QUIT response.' }
  return { ok: true, messages }
}

export function parsePop3RetrResponse(responseText: string, expectedMessageId: string): Pop3FetchResult {
  const lines = responseLines(responseText)
  const reason = failureReason(lines)
  if (reason) return { ok: false, reason: `POP3 ${reason}` }
  const block = parseMessageBlock(lines, 0)
  if (!block || block.nextIndex !== lines.length || block.message.id !== expectedMessageId) {
    return { ok: false, reason: 'POP3 server returned a malformed or unexpected RETR response.' }
  }
  return { ok: true, messages: [block.message] }
}
