import assert from 'node:assert/strict'
import test from 'node:test'
import type { EmailServiceConfig } from '@/types/network'
import { buildSmtpSubmissionTranscript, parseSmtpServerTranscript, processSmtpSubmissionTranscript } from './smtp'

const service: EmailServiceConfig = {
  domain: 'classroom.test',
  smtpEnabled: true,
  pop3Enabled: true,
  users: [
    { username: 'alice', password: 'mail-secret', mailbox: [] },
    { username: 'bob', password: 'mail-secret', mailbox: [] },
  ],
}

const submission = {
  requestId: 'request-123',
  username: 'alice',
  password: 'mail-secret',
  from: 'alice@classroom.test',
  to: 'bob@classroom.test',
  subject: 'Lab results',
  body: 'First line\n.leading dot\nLast line',
}

test('SMTP submission serializes commands, headers, dot-stuffing, and CRLF line endings', () => {
  const transcript = buildSmtpSubmissionTranscript(submission)

  assert.match(transcript, /^EHLO wirex\.student\r\nAUTH PLAIN /)
  assert.match(transcript, /MAIL FROM:<alice@classroom\.test>\r\nRCPT TO:<bob@classroom\.test>\r\nDATA\r\n/)
  assert.match(transcript, /Subject: Lab results\r\nMessage-ID: <mail-request-123@wirex\.local>\r\n\r\nFirst line\r\n\.\.leading dot\r\nLast line\r\n\.\r\nQUIT\r\n$/)
  assert.equal(transcript.includes('\n') && !transcript.includes('\r\n'), false)
})

test('SMTP server validates the command sequence and delivers the unstuffed message', () => {
  const transcript = buildSmtpSubmissionTranscript(submission)
  const result = processSmtpSubmissionTranscript(transcript, service, submission.requestId, 42)

  assert.equal(result.message?.id, 'mail-request-123')
  assert.deepEqual(
    [result.message?.from, result.message?.to, result.message?.subject, result.message?.body, result.message?.sentAtTick],
    ['alice@classroom.test', 'bob@classroom.test', 'Lab results', submission.body, 42],
  )
  assert.match(result.transcript, /235 2\.7\.0 Authentication successful/)
  assert.match(result.transcript, /250 2\.0\.0 queued as mail-request-123/)
  assert.match(result.transcript, /221 2\.0\.0 closing connection/)

  const clientResult = parseSmtpServerTranscript(result.transcript, submission, 42)
  assert.equal(clientResult.ok, true)
  assert.deepEqual(clientResult.message, result.message)
})

test('SMTP rejects bad credentials before accepting an envelope', () => {
  const result = processSmtpSubmissionTranscript(
    buildSmtpSubmissionTranscript({ ...submission, password: 'wrong-secret' }),
    service,
    submission.requestId,
    42,
  )

  assert.equal(result.message, undefined)
  assert.match(result.transcript, /535 5\.7\.8 Authentication credentials invalid/)
  assert.equal(parseSmtpServerTranscript(result.transcript, submission, 42).ok, false)
})

test('SMTP rejects commands sent out of order and does not deliver', () => {
  const transcript = buildSmtpSubmissionTranscript(submission).replace('MAIL FROM:<alice@classroom.test>', 'RCPT TO:<bob@classroom.test>')
  const result = processSmtpSubmissionTranscript(transcript, service, submission.requestId, 42)

  assert.equal(result.message, undefined)
  assert.match(result.transcript, /503 5\.5\.1 Bad sequence of commands/)
})

test('SMTP rejects a malformed transaction identifier before reflecting it in a response', () => {
  const result = processSmtpSubmissionTranscript(
    buildSmtpSubmissionTranscript(submission),
    service,
    'request-123\r\n250 forged',
    42,
  )

  assert.equal(result.message, undefined)
  assert.match(result.transcript, /500 5\.5\.2 Invalid SMTP transaction identifier/)
  assert.doesNotMatch(result.transcript, /250 forged/)
})

test('SMTP rejects injected headers and preserves the mailbox', () => {
  const injected = { ...submission, subject: 'Lab results\r\nBcc: outside@example.test' }
  const result = processSmtpSubmissionTranscript(buildSmtpSubmissionTranscript(injected), service, submission.requestId, 42)

  assert.equal(result.message, undefined)
  assert.match(result.transcript, /554 5\.6\.0 Unsupported or malformed message header/)
})

test('SMTP replies without a successful queue response are reported as failures', () => {
  const result = parseSmtpServerTranscript('220 ready\r\n535 5.7.8 Authentication credentials invalid\r\n', submission, 42)

  assert.equal(result.ok, false)
  assert.match(result.reason ?? '', /SMTP 535.*credentials invalid/i)
})
