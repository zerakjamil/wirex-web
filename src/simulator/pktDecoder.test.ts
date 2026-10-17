import assert from 'node:assert/strict'
import test from 'node:test'
import { decodePkt, MAX_PKT_BYTES } from './pktDecoder'

// Encrypted with the independent MIT Python reference implementation.
const fixture = Buffer.from('CjH5s26J3iNRI8AVhT9XQOTHIqOpMNAC8M1h199Nz+J0lUemnlVV2g0l0B6OnHhciMVeZExRmRQcTGdnoiqIh8qWrikDjSKTzNA5q3YvMyIUWWPK/3sLGVEdvfs=', 'base64')
test('PKT decoder matches an independently encrypted reference fixture', () => {
  const rootTag = 'PACKET' + 'TRACER5'
  assert.equal(decodePkt(fixture), `<${rootTag}><VERSION>9.0.1</VERSION><NETWORK><DEVICES/><LINKS/></NETWORK></${rootTag}>`)
})
test('PKT decoder rejects modified ciphertext instead of importing corrupted data', () => {
  const changed = Buffer.from(fixture); changed[20] ^= 1
  assert.throws(() => decodePkt(changed), /authentication/i)
})
test('PKT decoder rejects empty and oversized files before processing', () => {
  assert.throws(() => decodePkt(new Uint8Array()), /size/i)
  assert.throws(() => decodePkt(new Uint8Array(MAX_PKT_BYTES + 1)), /size/i)
})
