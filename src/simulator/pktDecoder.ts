import { inflateSync } from 'node:zlib'
import { timingSafeEqual } from 'node:crypto'
import { twofish } from 'twofish'

// Format reference: MIT-licensed jeamxn/cisco-pka-to-xml (see THIRD_PARTY_NOTICES.md).
const MAX_XML_BYTES = 32 * 1024 * 1024
export const MAX_PKT_BYTES = 8 * 1024 * 1024
const xor = (a: Uint8Array, b: Uint8Array) => Uint8Array.from(a, (value, index) => value ^ b[index])
const double = (block: Uint8Array) => {
  const out = new Uint8Array(16)
  let carry = 0
  for (let i = 15; i >= 0; i--) { out[i] = (block[i] << 1) | carry; carry = block[i] >>> 7 }
  if (carry) out[15] ^= 0x87
  return out
}

export function decodePkt(bytes: Uint8Array): string {
  if (bytes.length < 32 || bytes.length > MAX_PKT_BYTES) throw new Error('Invalid PKT file size. Maximum size is 8 MB.')
  const n = bytes.length
  const encrypted = Uint8Array.from(bytes, (_, i) => bytes[n - 1 - i] ^ ((n - i * n) & 255))
  const cipher = twofish()
  const key = Array<number>(16).fill(0x89)
  const encrypt = (block: Uint8Array) => Uint8Array.from(cipher.encrypt(key, Array.from(block)))
  const k1 = double(encrypt(new Uint8Array(16)))
  const k2 = double(k1)
  const omac = (tag: number, message: Uint8Array) => {
    const data = new Uint8Array(16 + message.length)
    data[15] = tag; data.set(message, 16)
    const complete = data.length % 16 === 0
    const padded = new Uint8Array(Math.ceil(data.length / 16) * 16)
    padded.set(data)
    if (!complete) padded[data.length] = 0x80
    let state = new Uint8Array(16)
    for (let offset = 0; offset < padded.length - 16; offset += 16) state = encrypt(xor(state, padded.subarray(offset, offset + 16)))
    return encrypt(xor(state, xor(padded.subarray(-16), complete ? k1 : k2)))
  }
  const ciphertext = encrypted.subarray(0, -16)
  const nonce = omac(0, new Uint8Array(16).fill(0x10))
  const expectedTag = xor(xor(nonce, omac(1, new Uint8Array())), omac(2, ciphertext))
  if (!timingSafeEqual(expectedTag, encrypted.subarray(-16))) throw new Error('PKT authentication failed. The file is damaged or uses an unsupported format.')
  const counter = nonce.slice()
  const decrypted = new Uint8Array(ciphertext.length)
  for (let offset = 0; offset < ciphertext.length; offset += 16) {
    const stream = encrypt(counter)
    for (let index = 0; index < Math.min(16, ciphertext.length - offset); index++) decrypted[offset + index] = ciphertext[offset + index] ^ stream[index]
    for (let index = 15; index >= 0; index--) { counter[index]++; if (counter[index]) break }
  }
  const m = decrypted.length
  const compressed = Uint8Array.from(decrypted, (value, i) => value ^ ((m - i) & 255))
  if (compressed.length < 4) throw new Error('PKT payload is incomplete.')
  const expectedLength = new DataView(compressed.buffer).getUint32(0, false)
  if (expectedLength > MAX_XML_BYTES) throw new Error('Decoded network exceeds the 32 MB limit.')
  const xml = inflateSync(compressed.subarray(4), { maxOutputLength: MAX_XML_BYTES })
  if (xml.length !== expectedLength) throw new Error('PKT decoded length does not match its header.')
  return xml.toString('utf8')
}
