import test from 'node:test'
import assert from 'node:assert/strict'
import { formatLatex, markdownToText, parseInline, parseMarkdown } from './markdown'

test('parses headings, paragraphs, and horizontal rules', () => {
  const blocks = parseMarkdown('## Title\n\nA paragraph.\n\n---\n\n### Subheading')
  assert.deepEqual(blocks[0], { type: 'heading', level: 2, text: 'Title' })
  assert.deepEqual(blocks[1], { type: 'paragraph', text: 'A paragraph.' })
  assert.deepEqual(blocks[2], { type: 'hr' })
  assert.deepEqual(blocks[3], { type: 'heading', level: 3, text: 'Subheading' })
})

test('parses nested unordered and ordered lists without losing text', () => {
  const blocks = parseMarkdown('- one\n  - nested\n- two\n\n1. first\n2. second')
  assert.equal(blocks[0].type, 'list')
  if (blocks[0].type !== 'list') return
  assert.equal(blocks[0].ordered, false)
  assert.equal(blocks[0].items.length, 2)
  assert.equal(blocks[0].items[0].text, 'one')
  assert.equal(blocks[0].items[0].children[0].text, 'nested')
  assert.equal(blocks[1].type, 'list')
  if (blocks[1].type !== 'list') return
  assert.equal(blocks[1].ordered, true)
  assert.deepEqual(blocks[1].items.map(item => item.text), ['first', 'second'])
})

test('parses GFM tables and ignores a separator without a header', () => {
  const blocks = parseMarkdown('| Command | Purpose |\n| --- | :---: |\n| `switchport` | Sets the mode |\n')
  assert.equal(blocks[0].type, 'table')
  if (blocks[0].type !== 'table') return
  assert.deepEqual(blocks[0].headers, ['Command', 'Purpose'])
  assert.deepEqual(blocks[0].rows, [['`switchport`', 'Sets the mode']])
  assert.equal(parseMarkdown('---')[0].type, 'hr')
})

test('parses fenced code even when the fence is indented inside a list', () => {
  const blocks = parseMarkdown('- Configure the port:\n  ```cisco\n  interface fa0/1\n   switchport mode access\n  ```\n- Next step')
  const code = blocks.find(block => block.type === 'code')
  assert.ok(code && code.type === 'code')
  if (!code || code.type !== 'code') return
  assert.equal(code.language, 'cisco')
  assert.match(code.code, /interface fa0\/1/)
  assert.match(code.code, /switchport mode access/)
})

test('parses blockquotes recursively and keeps inline formatting', () => {
  const blocks = parseMarkdown('> **Exam trap**\n>\n> Do not guess the native VLAN.')
  assert.equal(blocks[0].type, 'quote')
  if (blocks[0].type !== 'quote') return
  assert.equal(blocks[0].blocks[0].type, 'paragraph')
  const inline = parseInline('Use **bold**, `code`, *italic*, and [a link](https://example.com).')
  assert.deepEqual(inline.map(token => token.type), ['text', 'bold', 'text', 'code', 'text', 'italic', 'text', 'link', 'text'])
  const link = inline.find(token => token.type === 'link')
  assert.equal(link?.href, 'https://example.com')
})

test('formats LaTeX arrows and superscripts without leaving source syntax', () => {
  assert.equal(formatLatex('10^6 hosts \\rightarrow 1000 packets'), '10⁶ hosts → 1000 packets')
  assert.equal(formatLatex('A \\leftrightarrow B'), 'A ↔ B')
  assert.equal(formatLatex('2 \\times 3'), '2 × 3')
})

test('plain-text conversion removes markup and code fences', () => {
  const text = markdownToText('# Title\n\nA **bold** sentence with `code`.\n\n```cisco\nswitchport mode access\n```')
  assert.match(text, /Title/)
  assert.match(text, /A bold sentence with code\./)
  assert.doesNotMatch(text, /```/)
})

test('malformed markdown does not throw or produce raw HTML blocks', () => {
  assert.doesNotThrow(() => parseMarkdown('```cisco\ninterface fa0/1'))
  const blocks = parseMarkdown('<script>alert(1)</script>')
  assert.equal(blocks[0].type, 'paragraph')
  if (blocks[0].type === 'paragraph') assert.match(blocks[0].text, /<script>/)
})
