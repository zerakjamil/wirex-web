import assert from 'node:assert/strict'
import test from 'node:test'
import type { EmailServiceConfig } from '@/types/network'
import {
  buildPop3FetchTranscript,
  buildPop3DeleteTranscript,
  buildPop3ListTranscript,
  parsePop3DeleteTranscript,
  parsePop3FetchTranscript,
  parsePop3ListTranscript,
  processPop3FetchTranscript,
  processPop3DeleteTranscript,
  processPop3ListTranscript,
  createPop3Session,
  processPop3Command,
  parsePop3RetrResponse,
  parsePop3UidlResponse,
} from './pop3'

const service: EmailServiceConfig = {
  domain: 'classroom.test',
  smtpEnabled: true,
  pop3Enabled: true,
  users: [
    { username: 'alice', password: 'mail-secret', mailbox: [] },
    { username: 'bob', password: 'mail-secret', mailbox: [
      { id: 'mail-1', from: 'alice@classroom.test', to: 'bob@classroom.test', subject: 'First', body: 'line one\n.leading dot', sentAtTick: 20 },
      { id: 'mail-2', from: 'alice@classroom.test', to: 'bob@classroom.test', subject: 'Second', body: 'line two', sentAtTick: 40 },
    ] },
  ],
}

test('POP3 listing serializes USER, PASS, STAT, LIST, UIDL, QUIT and returns stable message IDs', () => {
  const request = buildPop3ListTranscript({ username: 'bob', password: 'mail-secret' })
  assert.equal(request, 'USER bob\r\nPASS mail-secret\r\nSTAT\r\nLIST\r\nUIDL\r\nQUIT\r\n')

  const response = processPop3ListTranscript(request, service)
  assert.match(response, /\+OK 2 \d+ messages\r\n/)
  assert.match(response, /1 \d+\r\n2 \d+\r\n\.\r\n\+OK unique-id listing follows\r\n1 mail-1\r\n2 mail-2\r\n\.\r\n\+OK goodbye/)
  assert.deepEqual(parsePop3ListTranscript(response), { ok: true, messageIds: ['mail-1', 'mail-2'] })
})

test('POP3 RETR returns each message with multiline dot transparency and original IDs', () => {
  const messageIds = ['mail-1', 'mail-2']
  const request = buildPop3FetchTranscript({ username: 'bob', password: 'mail-secret', messageIds })
  assert.match(request, /USER bob\r\nPASS mail-secret\r\nSTAT\r\nLIST\r\nUIDL\r\nRETR 1\r\nRETR 2\r\nQUIT\r\n/)

  const serverResult = processPop3FetchTranscript(request, service, messageIds)
  assert.match(serverResult, /\r\n\.\.leading dot\r\n\.\r\n\+OK \d+ octets\r\nFrom:/)
  const clientResult = parsePop3FetchTranscript(serverResult, messageIds)
  assert.equal(clientResult.ok, true)
  assert.deepEqual(clientResult.messages?.map(message => [message.id, message.subject, message.body, message.sentAtTick]), [
    ['mail-1', 'First', 'line one\n.leading dot', 20],
    ['mail-2', 'Second', 'line two', 40],
  ])
})

test('POP3 rejects a bad password and does not return mailbox contents', () => {
  const request = buildPop3ListTranscript({ username: 'bob', password: 'wrong' })
  const response = processPop3ListTranscript(request, service)
  assert.match(response, /-ERR authentication failed: invalid mailbox credentials/)
  assert.equal(parsePop3ListTranscript(response).ok, false)
  assert.doesNotMatch(response, /mail-1|mail-2/)
})

test('POP3 rejects commands in the wrong order', () => {
  const request = buildPop3ListTranscript({ username: 'bob', password: 'mail-secret' }).replace('STAT\r\n', 'UIDL\r\n')
  const response = processPop3ListTranscript(request, service)
  assert.match(response, /-ERR bad sequence of commands/)
  assert.equal(parsePop3ListTranscript(response).ok, false)
})

test('POP3 fetch fails if the mailbox changed between UIDL and RETR', () => {
  const staleIds = ['mail-1', 'mail-missing']
  const request = buildPop3FetchTranscript({ username: 'bob', password: 'mail-secret', messageIds: staleIds })
  const response = processPop3FetchTranscript(request, service, staleIds)
  assert.match(response, /-ERR mailbox changed; check mail again/)
  assert.equal(parsePop3FetchTranscript(response, staleIds).ok, false)
})

test('POP3 deletion marks the UIDL-selected message and commits only at QUIT', () => {
  const messageIds = ['mail-1', 'mail-2']
  const request = buildPop3DeleteTranscript({ username: 'bob', password: 'mail-secret', messageIds, messageId: 'mail-2' })
  assert.match(request, /USER bob\r\nPASS mail-secret\r\nSTAT\r\nLIST\r\nUIDL\r\nDELE 2\r\nQUIT\r\n$/)

  const result = processPop3DeleteTranscript(request, service, messageIds, 'mail-2')
  assert.equal(result.deletedMessageId, 'mail-2')
  assert.match(result.response, /\+OK message 2 marked for deletion\r\n\+OK goodbye/)
  assert.deepEqual(parsePop3DeleteTranscript(result.response, 'mail-2'), { ok: true, deletedMessageId: 'mail-2' })
  const withoutQuit = processPop3DeleteTranscript(request.replace('QUIT\r\n', ''), service, messageIds, 'mail-2')
  assert.equal(withoutQuit.deletedMessageId, undefined)
  assert.match(withoutQuit.response, /-ERR bad sequence of commands/)
})

test('POP3 RSET rolls back a marked deletion and does not commit at QUIT', () => {
  const messageIds = ['mail-1', 'mail-2']
  const request = buildPop3DeleteTranscript({ username: 'bob', password: 'mail-secret', messageIds, messageId: 'mail-2', reset: true })
  const result = processPop3DeleteTranscript(request, service, messageIds, 'mail-2')
  assert.equal(result.deletedMessageId, undefined)
  assert.match(result.response, /\+OK deletion marks cleared/)
  assert.deepEqual(parsePop3DeleteTranscript(result.response, 'mail-2'), { ok: false, reason: 'POP3 deletion was cancelled with RSET.' })
  assert.equal(service.users[1]?.mailbox.length, 2)
})

test('POP3 deletion rejects stale UIDLs, bad credentials, and malformed command order', () => {
  const staleIds = ['mail-1', 'mail-old']
  const staleRequest = buildPop3DeleteTranscript({ username: 'bob', password: 'mail-secret', messageIds: staleIds, messageId: 'mail-1' })
  assert.match(processPop3DeleteTranscript(staleRequest, service, staleIds, 'mail-1').response, /-ERR mailbox changed/)

  const wrongPassword = buildPop3DeleteTranscript({ username: 'bob', password: 'wrong', messageIds: ['mail-1', 'mail-2'], messageId: 'mail-1' })
  assert.equal(processPop3DeleteTranscript(wrongPassword, service, ['mail-1', 'mail-2'], 'mail-1').deletedMessageId, undefined)

  const badOrder = buildPop3DeleteTranscript({ username: 'bob', password: 'mail-secret', messageIds: ['mail-1', 'mail-2'], messageId: 'mail-1' }).replace('UIDL\r\n', 'DELE 1\r\n')
  assert.match(processPop3DeleteTranscript(badOrder, service, ['mail-1', 'mail-2'], 'mail-1').response, /-ERR bad sequence/)
})

test('POP3 session answers commands individually and commits DELE only when QUIT closes the session', () => {
  let session = createPop3Session()
  assert.equal(session.greeting, '+OK wireX POP3 service ready\r\n')

  const command = (text: string) => {
    const result = processPop3Command(text, service, session.state)
    session = { ...session, state: result.state }
    return result
  }

  assert.equal(command('USER bob').response, '+OK user accepted\r\n')
  assert.equal(command('PASS mail-secret').response, '+OK mailbox locked and ready\r\n')
  assert.match(command('STAT').response, /^\+OK 2 \d+ messages\r\n$/)
  assert.equal(command('UIDL').response, '+OK unique-id listing follows\r\n1 mail-1\r\n2 mail-2\r\n.\r\n')
  const retrieved = command('RETR 1')
  assert.match(retrieved.response, /^\+OK \d+ octets\r\nFrom: alice@classroom\.test\r\n/)
  assert.match(retrieved.response, /\.\.leading dot\r\n\.\r\n$/)
  assert.equal(command('DELE 2').response, '+OK message 2 marked for deletion\r\n')
  assert.match(command('STAT').response, /^\+OK 1 \d+ messages\r\n$/)
  assert.deepEqual(command('QUIT').committedDeletedMessageIds, ['mail-2'])
  assert.equal(command('STAT').response, '-ERR POP3 session is closed\r\n')
})

test('POP3 session rejects invalid commands and authentication without exposing mailbox data', () => {
  const session = createPop3Session()
  const noUser = processPop3Command('PASS mail-secret', service, session.state)
  assert.equal(noUser.response, '-ERR USER is required before PASS\r\n')
  const unknownUser = processPop3Command('USER nobody', service, session.state)
  assert.equal(unknownUser.response, '-ERR no such mailbox\r\n')
  const unsafe = processPop3Command('USER bob\r\nUIDL', service, session.state)
  assert.equal(unsafe.response, '-ERR malformed POP3 command\r\n')
  assert.equal(processPop3Command('QUIT', service, session.state).committedDeletedMessageIds, undefined)
})

test('POP3 RSET clears per-session deletion marks before QUIT', () => {
  let state = createPop3Session().state
  for (const commandText of ['USER bob', 'PASS mail-secret', 'DELE 1', 'RSET']) {
    state = processPop3Command(commandText, service, state).state
  }
  const quit = processPop3Command('QUIT', service, state)
  assert.equal(quit.response, '+OK goodbye\r\n')
  assert.deepEqual(quit.committedDeletedMessageIds, [])
})

test('POP3 client validates one UIDL and RETR response turn before accepting messages', () => {
  let state = createPop3Session().state
  for (const commandText of ['USER bob', 'PASS mail-secret']) state = processPop3Command(commandText, service, state).state
  const uidls = processPop3Command('UIDL', service, state).response
  assert.deepEqual(parsePop3UidlResponse(uidls), { ok: true, messageIds: ['mail-1', 'mail-2'] })
  const retr = processPop3Command('RETR 1', service, state).response
  assert.equal(parsePop3RetrResponse(retr, 'mail-1').messages?.[0]?.body, 'line one\n.leading dot')
  assert.equal(parsePop3RetrResponse(retr, 'mail-2').ok, false)
  assert.equal(parsePop3UidlResponse('+OK unique-id listing follows\r\n2 mail-2\r\n.\r\n').ok, false)
})
