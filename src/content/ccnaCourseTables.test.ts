import assert from 'node:assert/strict'
import test from 'node:test'
import { getSection } from '../content/ccnaCourse'

const CONVERTED = [
  ['1.3', 'Original TCP/IP Model'],
  ['1.4', 'OSI layer (7–1)'],
  ['2.9', 'Ethernet fields appear on the wire'],
  ['3.4', 'Access-Request'],
  ['4.3', '802.1Q tag fields'],
] as const

for (const [id, marker] of CONVERTED) {
  test(`section ${id} uses a real table instead of an ASCII table`, () => {
    const section = getSection(id)
    assert.ok(section, `missing section ${id}`)
    assert.ok(section.markdown.includes(marker), `missing marker ${marker}`)
    assert.match(section.markdown, /\n\|[\s:|-]+\|/, `missing markdown table separator in ${id}`)
    assert.ok(!section.markdown.includes('+---'), `ASCII table fence remains in ${id}`)
  })
}
