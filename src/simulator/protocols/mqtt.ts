/**
 * MQTT v3.1.1 Wire Protocol Simulation & Broker Model.
 * Supports CONNECT, CONNACK, PUBLISH (QoS 0/1), PUBACK, SUBSCRIBE, SUBACK, PINGREQ, PINGRESP, DISCONNECT.
 */

export type MqttPacketType =
  | 'CONNECT'
  | 'CONNACK'
  | 'PUBLISH'
  | 'PUBACK'
  | 'SUBSCRIBE'
  | 'SUBACK'
  | 'PINGREQ'
  | 'PINGRESP'
  | 'DISCONNECT'

const TYPE_CODES: Record<MqttPacketType, number> = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  SUBSCRIBE: 8,
  SUBACK: 9,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
}

const CODE_TO_TYPE: Record<number, MqttPacketType> = {
  1: 'CONNECT',
  2: 'CONNACK',
  3: 'PUBLISH',
  4: 'PUBACK',
  8: 'SUBSCRIBE',
  9: 'SUBACK',
  12: 'PINGREQ',
  13: 'PINGRESP',
  14: 'DISCONNECT',
}

export interface MqttPacket {
  type: MqttPacketType
  dup?: boolean
  qos?: 0 | 1 | 2
  retain?: boolean
  clientId?: string
  username?: string
  password?: string
  topic?: string
  payload?: string | Uint8Array
  packetId?: number
  returnCode?: number // For CONNACK: 0 = Connection Accepted
  topics?: Array<{ topic: string; qos: number }>
  grantedQos?: number[]
}

/**
 * Encodes variable-length integer according to MQTT specification.
 */
export function encodeRemainingLength(length: number): number[] {
  const bytes: number[] = []
  let x = length
  do {
    let encodedByte = x % 128
    x = Math.floor(x / 128)
    if (x > 0) {
      encodedByte |= 128
    }
    bytes.push(encodedByte)
  } while (x > 0)
  return bytes
}

/**
 * Decodes variable-length integer according to MQTT specification.
 */
export function decodeRemainingLength(bytes: Uint8Array, startOffset = 1): { length: number; bytesRead: number } {
  let multiplier = 1
  let value = 0
  let offset = startOffset
  let digit = 0
  do {
    if (offset >= bytes.length) throw new Error('Malformed Remaining Length in MQTT packet.')
    digit = bytes[offset++]
    value += (digit & 127) * multiplier
    multiplier *= 128
  } while ((digit & 128) !== 0)
  return { length: value, bytesRead: offset - startOffset }
}

/**
 * Encodes an MQTT packet into binary representation.
 */
export function encodeMqttPacket(packet: MqttPacket): Uint8Array {
  const typeCode = TYPE_CODES[packet.type]
  let flags = 0
  if (packet.dup) flags |= 0x08
  if (packet.qos) flags |= (packet.qos & 0x03) << 1
  if (packet.retain) flags |= 0x01

  const variableHeaderAndPayload: number[] = []

  switch (packet.type) {
    case 'CONNECT': {
      // Protocol Name: "MQTT"
      const name = 'MQTT'
      variableHeaderAndPayload.push(0, name.length, ...new TextEncoder().encode(name))
      // Protocol Level: 4 (v3.1.1)
      variableHeaderAndPayload.push(4)
      // Connect Flags
      let connectFlags = 0x02 // Clean Session
      if (packet.username) connectFlags |= 0x80
      if (packet.password) connectFlags |= 0x40
      variableHeaderAndPayload.push(connectFlags)
      // Keep Alive: 60s
      variableHeaderAndPayload.push(0, 60)
      // Client ID
      const cid = packet.clientId ?? 'wireX-client'
      variableHeaderAndPayload.push(0, cid.length, ...new TextEncoder().encode(cid))
      if (packet.username) {
        variableHeaderAndPayload.push(0, packet.username.length, ...new TextEncoder().encode(packet.username))
      }
      if (packet.password) {
        variableHeaderAndPayload.push(0, packet.password.length, ...new TextEncoder().encode(packet.password))
      }
      break
    }

    case 'CONNACK': {
      // Acknowledge Flags (0) and Return Code (0 = success)
      variableHeaderAndPayload.push(0, packet.returnCode ?? 0)
      break
    }

    case 'PUBLISH': {
      const topic = packet.topic ?? ''
      variableHeaderAndPayload.push(0, topic.length, ...new TextEncoder().encode(topic))
      if ((packet.qos ?? 0) > 0) {
        const pid = packet.packetId ?? 1
        variableHeaderAndPayload.push((pid >> 8) & 0xff, pid & 0xff)
      }
      if (packet.payload) {
        const payloadBytes = typeof packet.payload === 'string'
          ? new TextEncoder().encode(packet.payload)
          : packet.payload
        variableHeaderAndPayload.push(...payloadBytes)
      }
      break
    }

    case 'PUBACK': {
      const pid = packet.packetId ?? 1
      variableHeaderAndPayload.push((pid >> 8) & 0xff, pid & 0xff)
      break
    }

    case 'SUBSCRIBE': {
      flags = 0x02 // Bit 1 reserved must be 1 in SUBSCRIBE
      const pid = packet.packetId ?? 1
      variableHeaderAndPayload.push((pid >> 8) & 0xff, pid & 0xff)
      for (const t of packet.topics ?? []) {
        variableHeaderAndPayload.push(0, t.topic.length, ...new TextEncoder().encode(t.topic), t.qos & 0x03)
      }
      break
    }

    case 'SUBACK': {
      const pid = packet.packetId ?? 1
      variableHeaderAndPayload.push((pid >> 8) & 0xff, pid & 0xff)
      for (const q of packet.grantedQos ?? [0]) {
        variableHeaderAndPayload.push(q & 0x03)
      }
      break
    }

    case 'PINGREQ':
    case 'PINGRESP':
    case 'DISCONNECT':
      break
  }

  const remaining = encodeRemainingLength(variableHeaderAndPayload.length)
  const total = new Uint8Array(1 + remaining.length + variableHeaderAndPayload.length)
  total[0] = ((typeCode & 0x0f) << 4) | (flags & 0x0f)
  total.set(remaining, 1)
  total.set(variableHeaderAndPayload, 1 + remaining.length)
  return total
}

/**
 * Decodes binary data into an MQTT packet.
 */
export function decodeMqttPacket(bytes: Uint8Array): MqttPacket {
  if (bytes.length < 2) throw new Error('Packet too short.')
  const first = bytes[0]
  const typeCode = (first >> 4) & 0x0f
  const flags = first & 0x0f
  const type = CODE_TO_TYPE[typeCode]
  if (!type) throw new Error(`Unknown MQTT packet type: ${typeCode}`)

  const { length, bytesRead } = decodeRemainingLength(bytes, 1)
  let offset = 1 + bytesRead
  const end = offset + length

  const packet: MqttPacket = {
    type,
    dup: Boolean(flags & 0x08),
    qos: ((flags >> 1) & 0x03) as 0 | 1 | 2,
    retain: Boolean(flags & 0x01),
  }

  const readString = (): string => {
    const len = (bytes[offset] << 8) | bytes[offset + 1]
    offset += 2
    const str = new TextDecoder().decode(bytes.slice(offset, offset + len))
    offset += len
    return str
  }

  switch (type) {
    case 'CONNECT': {
      const proto = readString()
      if (proto !== 'MQTT') throw new Error(`Invalid protocol ${proto}`)
      offset += 1 // level
      const connFlags = bytes[offset++]
      offset += 2 // keepalive
      packet.clientId = readString()
      if (connFlags & 0x80) packet.username = readString()
      if (connFlags & 0x40) packet.password = readString()
      break
    }

    case 'CONNACK': {
      offset += 1 // ack flags
      packet.returnCode = bytes[offset++]
      break
    }

    case 'PUBLISH': {
      packet.topic = readString()
      if ((packet.qos ?? 0) > 0) {
        packet.packetId = (bytes[offset] << 8) | bytes[offset + 1]
        offset += 2
      }
      packet.payload = new TextDecoder().decode(bytes.slice(offset, end))
      break
    }

    case 'PUBACK': {
      packet.packetId = (bytes[offset] << 8) | bytes[offset + 1]
      break
    }

    case 'SUBSCRIBE': {
      packet.packetId = (bytes[offset] << 8) | bytes[offset + 1]
      offset += 2
      packet.topics = []
      while (offset < end) {
        const topic = readString()
        const qos = bytes[offset++]
        packet.topics.push({ topic, qos })
      }
      break
    }

    case 'SUBACK': {
      packet.packetId = (bytes[offset] << 8) | bytes[offset + 1]
      offset += 2
      packet.grantedQos = []
      while (offset < end) {
        packet.grantedQos.push(bytes[offset++])
      }
      break
    }

    case 'PINGREQ':
    case 'PINGRESP':
    case 'DISCONNECT':
      break
  }

  return packet
}

/**
 * Simulated In-Memory MQTT Broker.
 */
export class MqttBroker {
  private subscriptions = new Map<string, Set<string>>() // topic -> Set<clientId>
  private clientSessions = new Map<string, { lastSeen: number }>()

  public handlePacket(clientId: string, packet: MqttPacket): MqttPacket[] {
    const responses: MqttPacket[] = []
    this.clientSessions.set(clientId, { lastSeen: Date.now() })

    switch (packet.type) {
      case 'CONNECT':
        responses.push({ type: 'CONNACK', returnCode: 0 })
        break

      case 'SUBSCRIBE': {
        const granted: number[] = []
        for (const t of packet.topics ?? []) {
          if (!this.subscriptions.has(t.topic)) {
            this.subscriptions.set(t.topic, new Set())
          }
          this.subscriptions.get(t.topic)!.add(clientId)
          granted.push(t.qos)
        }
        responses.push({ type: 'SUBACK', packetId: packet.packetId ?? 1, grantedQos: granted })
        break
      }

      case 'PUBLISH': {
        if ((packet.qos ?? 0) === 1) {
          responses.push({ type: 'PUBACK', packetId: packet.packetId ?? 1 })
        }
        break
      }

      case 'PINGREQ':
        responses.push({ type: 'PINGRESP' })
        break

      case 'DISCONNECT':
        this.clientSessions.delete(clientId)
        for (const set of this.subscriptions.values()) {
          set.delete(clientId)
        }
        break
    }

    return responses
  }

  public getSubscribers(topic: string): string[] {
    const subs: string[] = []
    for (const [pattern, set] of this.subscriptions.entries()) {
      if (pattern === topic || pattern === '#' || pattern === '+') {
        subs.push(...Array.from(set))
      }
    }
    return subs
  }
}
