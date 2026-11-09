import assert from 'node:assert/strict'
import test from 'node:test'
import { parseNslookupArguments } from './nslookup'

test('nslookup defaults to A and accepts explicit A and MX query types', () => {
  assert.deepEqual(parseNslookupArguments(['mail.classroom.test']), { ok: true, domain: 'mail.classroom.test', queryType: 'A' })
  assert.deepEqual(parseNslookupArguments(['-type=A', 'mail.classroom.test']), { ok: true, domain: 'mail.classroom.test', queryType: 'A' })
  assert.deepEqual(parseNslookupArguments(['-query=mx', 'classroom.test']), { ok: true, domain: 'classroom.test', queryType: 'MX' })
})

test('nslookup rejects unsupported record types and malformed argument counts', () => {
  assert.deepEqual(parseNslookupArguments(['-type=AAAA', 'classroom.test']), { ok: false, reason: 'unsupported-query-type', queryType: 'AAAA' })
  assert.deepEqual(parseNslookupArguments([]), { ok: false, reason: 'usage' })
  assert.deepEqual(parseNslookupArguments(['-type=MX']), { ok: false, reason: 'usage' })
  assert.deepEqual(parseNslookupArguments(['classroom.test', 'extra']), { ok: false, reason: 'usage' })
})
