/**
 * RFC 7252 Constrained Application Protocol (CoAP) binary packet encoding and decoding.
 * Used for standard IoT communications over UDP 5683.
 */

export type CoapType = 'CON' | 'NON' | 'ACK' | 'RST'

export interface CoapOption {
  number: number
  value: Uint8Array | string
}

export interface CoapMessage {
  version: number
  type: CoapType
  code: string // e.g. "0.01" (GET), "0.02" (POST), "2.05" (Content)
  codeValue: number
  messageId: number
  token?: Uint8Array
  options: CoapOption[]
  payload?: Uint8Array | string
}

const TYPE_MAP: Record<number, CoapType> = {
  0: 'CON',
  1: 'NON',
  2: 'ACK',
  3: 'RST',
}

const TYPE_REV: Record<CoapType, number> = {
  CON: 0,
  NON: 1,
  ACK: 2,
  RST: 3,
}

export function parseCoapCode(byte: number): string {
  const codeClass = (byte >> 5) & 0x07
  const codeDetail = byte & 0x1f
  return `${codeClass}.${codeDetail.toString().padStart(2, '0')}`
}

export function formatCoapCode(code: string): number {
  const [cls, det] = code.split('.').map(Number)
  return ((cls & 0x07) << 5) | (det & 0x1f)
}

/**
 * Decodes an RFC 7252 CoAP binary packet from a Uint8Array or Buffer.
 */
export function decodeCoapPacket(bytes: Uint8Array): CoapMessage {
  if (bytes.length < 4) {
    throw new Error('Invalid CoAP packet: buffer too short (< 4 bytes).')
  }

  const byte0 = bytes[0]
  const version = (byte0 >> 6) & 0x03
  if (version !== 1) {
    throw new Error(`Unsupported CoAP version ${version}, expected 1.`)
  }

  const typeNum = (byte0 >> 4) & 0x03
  const type = TYPE_MAP[typeNum] ?? 'CON'
  const tokenLength = byte0 & 0x0f

  const codeValue = bytes[1]
  const code = parseCoapCode(codeValue)
  const messageId = (bytes[2] << 8) | bytes[3]

  let offset = 4
  if (bytes.length < offset + tokenLength) {
    throw new Error('Invalid CoAP packet: truncated token.')
  }

  const token = tokenLength > 0 ? bytes.slice(offset, offset + tokenLength) : undefined
  offset += tokenLength

  const options: CoapOption[] = []
  let currentOptionNumber = 0
  let payload: Uint8Array | undefined

  while (offset < bytes.length) {
    if (bytes[offset] === 0xff) {
      // Payload marker
      offset += 1
      payload = bytes.slice(offset)
      break
    }

    const optHeader = bytes[offset++]
    let optDelta = (optHeader >> 4) & 0x0f
    let optLength = optHeader & 0x0f

    if (optDelta === 13) {
      optDelta = bytes[offset++] + 13
    } else if (optDelta === 14) {
      optDelta = ((bytes[offset] << 8) | bytes[offset + 1]) + 269
      offset += 2
    }

    if (optLength === 13) {
      optLength = bytes[offset++] + 13
    } else if (optLength === 14) {
      optLength = ((bytes[offset] << 8) | bytes[offset + 1]) + 269
      offset += 2
    }

    currentOptionNumber += optDelta
    const optValue = bytes.slice(offset, offset + optLength)
    offset += optLength

    options.push({
      number: currentOptionNumber,
      value: optValue,
    })
  }

  return {
    version,
    type,
    code,
    codeValue,
    messageId,
    token,
    options,
    payload,
  }
}

/**
 * Encodes a CoapMessage into an RFC 7252 binary buffer.
 */
export function encodeCoapPacket(msg: CoapMessage): Uint8Array {
  const token = msg.token ?? new Uint8Array(0)
  const tokenLen = Math.min(token.length, 8)

  const header = new Uint8Array(4)
  header[0] = (1 << 6) | ((TYPE_REV[msg.type] & 0x03) << 4) | (tokenLen & 0x0f)
  header[1] = msg.codeValue ?? formatCoapCode(msg.code)
  header[2] = (msg.messageId >> 8) & 0xff
  header[3] = msg.messageId & 0xff

  const parts: Uint8Array[] = [header, token.slice(0, tokenLen)]

  // Sort options by option number
  const sorted = [...msg.options].sort((a, b) => a.number - b.number)
  let lastOpt = 0

  for (const opt of sorted) {
    const delta = opt.number - lastOpt
    lastOpt = opt.number
    const val = typeof opt.value === 'string' ? new TextEncoder().encode(opt.value) : opt.value
    const len = val.length

    let deltaNibble = delta
    const extraDelta: number[] = []
    if (delta >= 269) {
      deltaNibble = 14
      const d = delta - 269
      extraDelta.push((d >> 8) & 0xff, d & 0xff)
    } else if (delta >= 13) {
      deltaNibble = 13
      extraDelta.push(delta - 13)
    }

    let lenNibble = len
    const extraLen: number[] = []
    if (len >= 269) {
      lenNibble = 14
      const l = len - 269
      extraLen.push((l >> 8) & 0xff, l & 0xff)
    } else if (len >= 13) {
      lenNibble = 13
      extraLen.push(len - 13)
    }

    const optHeader = new Uint8Array([((deltaNibble & 0x0f) << 4) | (lenNibble & 0x0f), ...extraDelta, ...extraLen])
    parts.push(optHeader, val)
  }

  if (msg.payload && msg.payload.length > 0) {
    const payloadBytes = typeof msg.payload === 'string' ? new TextEncoder().encode(msg.payload) : msg.payload
    parts.push(new Uint8Array([0xff]), payloadBytes)
  }

  const totalLength = parts.reduce((acc, p) => acc + p.length, 0)
  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const p of parts) {
    result.set(p, pos)
    pos += p.length
  }

  return result
}
