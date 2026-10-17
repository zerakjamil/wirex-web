import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatIpv6,
  ipv6InterfaceIdFromMac,
  ipv6LinkLocalFromMac,
  ipv6NetworkAddress,
  ipv6PrefixMask,
  ipv6SolicitedNodeMulticastAddress,
  ipv6SolicitedNodeMulticastMac,
  isInSameIpv6Subnet,
  isIpv6LinkLocal,
  isIpv6Loopback,
  isIpv6Multicast,
  isIpv6Unspecified,
  isValidIpv6,
  isValidIpv6Prefix,
  macToBytes,
  parseIpv6,
  parseIpv6WithPrefix,
} from './protocols/ipv6'

test('accepts canonical and expanded IPv6 forms and rejects invalid ones', () => {
  const valid = [
    '::',
    '::1',
    '2001:db8::1',
    '2001:0db8:0000:0000:0000:0000:0000:0001',
    'fe80::260:2fff:feab:cdef',
    'ff02::1',
    '2001:db8:0:1:0:0:0:1',
    'ABCD:EF01::1234',
    '1:2:3:4:5:6:7:8',
    ' 2001:db8::1 ',
  ]
  for (const address of valid) {
    assert.ok(isValidIpv6(address), `${address} should be valid`)
  }
  const invalid = [
    '',
    ':',
    ':::',
    '1::2::3',
    '2001:db8:::1',
    '2001:db8::1::',
    '12345::1',
    '2001:db8::g',
    '1:2:3:4:5:6:7',
    '1:2:3:4:5:6:7:8:9',
    '1:2:3:4:5:6:7::8',
    '::1:2:3:4:5:6:7:8',
    ':1',
    '1:',
    '2001:db8::/64',
    '::ffff:192.168.1.1',
  ]
  for (const address of invalid) {
    assert.ok(!isValidIpv6(address), `${address} should be invalid`)
  }
})

test('formats addresses to RFC 5952 canonical form', () => {
  const cases: Array<[string, string]> = [
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
    ['2001:db8:0:1:0:0:0:1', '2001:db8:0:1::1'],
    ['0:0:0:0:0:0:0:0', '::'],
    ['ff02:0000:0000:0000:0000:0000:0000:0001', 'ff02::1'],
    ['2001:db8:0:0:0:0:0:0', '2001:db8::'],
    ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
  ]
  for (const [input, expected] of cases) {
    const parsed = parseIpv6(input)
    assert.ok(parsed !== null, `${input} should parse`)
    assert.equal(formatIpv6(parsed), expected)
  }
  assert.equal(formatIpv6(BigInt(0)), '::')
  assert.throws(() => formatIpv6(BigInt(-1)), RangeError)
  assert.throws(() => formatIpv6(BigInt(1) << BigInt(128)), RangeError)
})

test('round-trips every canonical form through parse and format', () => {
  const canonical = ['::', '::1', '2001:db8::1', 'fe80::260:2fff:feab:cdef', 'ff02::1:ff00:1', 'abcd:ef01::1234']
  for (const address of canonical) {
    const parsed = parseIpv6(address)
    assert.ok(parsed !== null)
    assert.equal(formatIpv6(parsed), address)
    assert.equal(parseIpv6(formatIpv6(parsed)), parsed)
  }
})

test('computes prefix masks, network addresses and subnet membership', () => {
  assert.ok(isValidIpv6Prefix(0))
  assert.ok(isValidIpv6Prefix(64))
  assert.ok(isValidIpv6Prefix(128))
  assert.ok(!isValidIpv6Prefix(129))
  assert.ok(!isValidIpv6Prefix(-1))
  assert.ok(!isValidIpv6Prefix(1.5))
  assert.equal(ipv6PrefixMask(0), BigInt(0))
  assert.equal(ipv6PrefixMask(128), (BigInt(1) << BigInt(128)) - BigInt(1))
  assert.throws(() => ipv6PrefixMask(129), RangeError)

  assert.equal(ipv6NetworkAddress('2001:db8:abcd:12::5', 64), '2001:db8:abcd:12::')
  assert.equal(ipv6NetworkAddress('2001:db8::1', 128), '2001:db8::1')
  assert.equal(ipv6NetworkAddress('2001:db8::1', 0), '::')
  assert.equal(ipv6NetworkAddress('2001:db8::1', 129), null)
  assert.equal(ipv6NetworkAddress('garbage', 64), null)

  assert.ok(isInSameIpv6Subnet('2001:db8:1::1', '2001:db8:1::abcd', 64))
  assert.ok(!isInSameIpv6Subnet('2001:db8:1::1', '2001:db8:2::1', 64))
  assert.ok(!isInSameIpv6Subnet('2001:db8::1', '2001:db8::2', 129))
})

test('classifies link-local, multicast, unspecified and loopback addresses', () => {
  assert.ok(isIpv6LinkLocal('fe80::1'))
  assert.ok(isIpv6LinkLocal('fe80::260:2fff:feab:cdef'))
  assert.ok(!isIpv6LinkLocal('2001:db8::1'))
  assert.ok(!isIpv6LinkLocal('fec0::1'))
  assert.ok(isIpv6Multicast('ff02::1'))
  assert.ok(isIpv6Multicast('ff02::1:ff00:1'))
  assert.ok(!isIpv6Multicast('2001:db8::1'))
  assert.ok(isIpv6Unspecified('::'))
  assert.ok(!isIpv6Unspecified('::1'))
  assert.ok(isIpv6Loopback('::1'))
  assert.ok(!isIpv6Loopback('::'))
  assert.ok(!isIpv6LinkLocal('not-an-address'))
})

test('derives EUI-64 interface identifiers and link-local addresses from MACs', () => {
  assert.equal(ipv6InterfaceIdFromMac('00:60:2f:ab:cd:ef'), '260:2fff:feab:cdef')
  assert.equal(ipv6LinkLocalFromMac('00:60:2f:ab:cd:ef'), 'fe80::260:2fff:feab:cdef')
  assert.equal(ipv6LinkLocalFromMac('00:60:2F:AB:CD:EF'), 'fe80::260:2fff:feab:cdef')
  assert.deepEqual(macToBytes('00:60:2f:ab:cd:ef'), [0x00, 0x60, 0x2f, 0xab, 0xcd, 0xef])
  assert.equal(macToBytes('00:60:2f:ab:cd'), null)
  assert.equal(macToBytes('00:60:2f:ab:cd:zz'), null)
  assert.equal(ipv6InterfaceIdFromMac('not-a-mac'), null)
})

test('maps solicited-node multicast addresses and MACs', () => {
  assert.equal(ipv6SolicitedNodeMulticastAddress('2001:db8::1'), 'ff02::1:ff00:1')
  assert.equal(ipv6SolicitedNodeMulticastMac('2001:db8::1'), '33:33:ff:00:00:01')
  assert.equal(ipv6SolicitedNodeMulticastAddress('fe80::260:2fff:feab:cdef'), 'ff02::1:ffab:cdef')
  assert.equal(ipv6SolicitedNodeMulticastMac('fe80::260:2fff:feab:cdef'), '33:33:ff:ab:cd:ef')
  assert.equal(ipv6SolicitedNodeMulticastAddress('garbage'), null)
  assert.equal(ipv6SolicitedNodeMulticastMac('garbage'), null)
})

test('parses address/prefix pairs for CLI-style input', () => {
  assert.deepEqual(parseIpv6WithPrefix('2001:db8::1/64'), { address: '2001:db8::1', prefixLength: 64 })
  assert.deepEqual(parseIpv6WithPrefix('2001:DB8:0:0:0:0:0:1/64'), { address: '2001:db8::1', prefixLength: 64 })
  assert.deepEqual(parseIpv6WithPrefix('fe80::1', 64), { address: 'fe80::1', prefixLength: 64 })
  assert.equal(parseIpv6WithPrefix('fe80::1'), null)
  assert.equal(parseIpv6WithPrefix('2001:db8::1'), null)
  assert.equal(parseIpv6WithPrefix('2001:db8::1/129'), null)
  assert.equal(parseIpv6WithPrefix('2001:db8::1/64x'), null)
  assert.equal(parseIpv6WithPrefix('2001:db8::1/'), null)
  assert.equal(parseIpv6WithPrefix('garbage/64'), null)
})
