import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeCoapPacket, encodeCoapPacket, type CoapMessage } from './coap'
import { decodeMqttPacket, encodeMqttPacket, MqttBroker, type MqttPacket } from './mqtt'

test('CoAP: binary encoding and decoding round-trip', () => {
  const original: CoapMessage = {
    version: 1,
    type: 'CON',
    code: '0.01', // GET
    codeValue: 1,
    messageId: 0x1234,
    token: new Uint8Array([0xaa, 0xbb]),
    options: [
      { number: 11, value: 'sensors' }, // Uri-Path
      { number: 11, value: 'temp' },
    ],
    payload: '{"status":"ok"}',
  }

  const encoded = encodeCoapPacket(original)
  assert.ok(encoded.length > 4, 'encoded CoAP packet has data')

  const decoded = decodeCoapPacket(encoded)
  assert.equal(decoded.version, 1)
  assert.equal(decoded.type, 'CON')
  assert.equal(decoded.code, '0.01')
  assert.equal(decoded.messageId, 0x1234)
  assert.deepEqual(decoded.token, new Uint8Array([0xaa, 0xbb]))
  assert.equal(decoded.options.length, 2)
  assert.equal(new TextDecoder().decode(decoded.options[0].value as Uint8Array), 'sensors')
  assert.equal(new TextDecoder().decode(decoded.options[1].value as Uint8Array), 'temp')
  assert.equal(new TextDecoder().decode(decoded.payload as Uint8Array), '{"status":"ok"}')
})

test('CoAP: handles ACK and Non-confirmable types without payload', () => {
  const ack: CoapMessage = {
    version: 1,
    type: 'ACK',
    code: '2.05', // Content
    codeValue: (2 << 5) | 5,
    messageId: 0xabcd,
    options: [],
  }

  const encoded = encodeCoapPacket(ack)
  const decoded = decodeCoapPacket(encoded)
  assert.equal(decoded.type, 'ACK')
  assert.equal(decoded.code, '2.05')
  assert.equal(decoded.messageId, 0xabcd)
  assert.equal(decoded.payload, undefined)
})

test('MQTT: CONNECT and CONNACK packet encoding and decoding', () => {
  const connect: MqttPacket = {
    type: 'CONNECT',
    clientId: 'sensor-node-01',
    username: 'admin',
    password: 'secretpassword',
  }

  const encoded = encodeMqttPacket(connect)
  const decoded = decodeMqttPacket(encoded)

  assert.equal(decoded.type, 'CONNECT')
  assert.equal(decoded.clientId, 'sensor-node-01')
  assert.equal(decoded.username, 'admin')
  assert.equal(decoded.password, 'secretpassword')
})

test('MQTT: PUBLISH QoS 1 and PUBACK round-trip', () => {
  const pub: MqttPacket = {
    type: 'PUBLISH',
    topic: 'home/kitchen/temp',
    qos: 1,
    packetId: 42,
    payload: '24.5',
  }

  const encoded = encodeMqttPacket(pub)
  const decoded = decodeMqttPacket(encoded)

  assert.equal(decoded.type, 'PUBLISH')
  assert.equal(decoded.topic, 'home/kitchen/temp')
  assert.equal(decoded.qos, 1)
  assert.equal(decoded.packetId, 42)
  assert.equal(decoded.payload, '24.5')
})

test('MQTT: Broker subscription and message routing simulation', () => {
  const broker = new MqttBroker()

  // Client 1 connects
  const connResp = broker.handlePacket('client-1', { type: 'CONNECT' })
  assert.equal(connResp[0].type, 'CONNACK')
  assert.equal(connResp[0].returnCode, 0)

  // Client 1 subscribes to topic
  const subResp = broker.handlePacket('client-1', {
    type: 'SUBSCRIBE',
    packetId: 10,
    topics: [{ topic: 'sensors/temperature', qos: 0 }],
  })
  assert.equal(subResp[0].type, 'SUBACK')
  assert.deepEqual(subResp[0].grantedQos, [0])

  // Verify subscriber registration
  const subs = broker.getSubscribers('sensors/temperature')
  assert.deepEqual(subs, ['client-1'])

  // Publish from client 2
  const pubResp = broker.handlePacket('client-2', {
    type: 'PUBLISH',
    topic: 'sensors/temperature',
    qos: 1,
    packetId: 99,
    payload: '100',
  })
  assert.equal(pubResp[0].type, 'PUBACK')
  assert.equal(pubResp[0].packetId, 99)

  // Ping test
  const pingResp = broker.handlePacket('client-1', { type: 'PINGREQ' })
  assert.equal(pingResp[0].type, 'PINGRESP')
})
