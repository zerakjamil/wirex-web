export interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'code' | 'link'
  text: string
  href?: string
  children?: InlineToken[]
}

export interface MarkdownListItem {
  text: string
  children: MarkdownListItem[]
}

export type MarkdownBlock =
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: MarkdownListItem[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'code'; language: string; code: string }
  | { type: 'quote'; blocks: MarkdownBlock[] }
  | { type: 'hr' }

const superscripts: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', 'n': 'ⁿ', 'i': 'ⁱ',
}

const applySuperscripts = (value: string) => value
  .replace(/\^\{([^}]+)\}/g, (_m, exponent: string) => exponent.split('').map(char => superscripts[char] ?? char).join(''))
  .replace(/\^([0-9n+\-=i]+)/g, (_m, exponent: string) => exponent.split('').map(char => superscripts[char] ?? char).join(''))

export function formatLatex(value: string): string {
  let text = value
  text = text.replace(/\$([^$]+)\$/g, (_match, inner: string) => {
    let result = inner
    result = result.replace(/\\rightarrow/g, '→')
    result = result.replace(/\\leftarrow/g, '←')
    result = result.replace(/\\leftrightarrow/g, '↔')
    result = result.replace(/\\times/g, '×')
    return applySuperscripts(result)
  })
  text = text.replace(/\\rightarrow/g, '→')
  text = text.replace(/\\leftarrow/g, '←')
  text = text.replace(/\\leftrightarrow/g, '↔')
  text = text.replace(/\\times/g, '×')
  return text.split(/(`[^`]*`)/).map(part => part.startsWith('`') && part.endsWith('`') ? part : applySuperscripts(part)).join('')
}

const inlinePattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g

export function parseInline(value: string): InlineToken[] {
  const text = formatLatex(value)
  const tokens: InlineToken[] = []
  let lastIndex = 0
  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index ?? 0
    if (index > lastIndex) tokens.push({ type: 'text', text: text.slice(lastIndex, index) })
    const raw = match[0]
    if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push({ type: 'bold', text: raw.slice(2, -2), children: parseInline(raw.slice(2, -2)) })
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push({ type: 'code', text: raw.slice(1, -1) })
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push({ type: 'italic', text: raw.slice(1, -1), children: parseInline(raw.slice(1, -1)) })
    } else {
      const link = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (link) tokens.push({ type: 'link', text: link[1], href: link[2], children: parseInline(link[1]) })
      else tokens.push({ type: 'text', text: raw })
    }
    lastIndex = index + raw.length
  }
  if (lastIndex < text.length) tokens.push({ type: 'text', text: text.slice(lastIndex) })
  return tokens
}

const fencePattern = /^[ \t]*```/
const tableSeparatorPattern = /^:?-{3,}:?$/

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  const body = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return body.split('|').map(cell => cell.trim())
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(cell => tableSeparatorPattern.test(cell))
}

function isBlockStart(line: string): boolean {
  const trimmed = line.trim()
  return !trimmed
    || fencePattern.test(line)
    || /^#{2,4}\s/.test(trimmed)
    || /^\s*[-*]\s+/.test(line)
    || /^\s*\d+\.\s+/.test(line)
    || trimmed.startsWith('|')
    || trimmed.startsWith('>')
    || trimmed === '---'
    || trimmed === '***'
}

function parseList(lines: string[], start: number): { block: MarkdownBlock; next: number } | null {
  const first = lines[start].match(/^(\s*)([-*]|\d+\.)\s+(.+)$/)
  if (!first) return null
  const ordered = /^\d+\.$/.test(first[2])
  const items: MarkdownListItem[] = []
  const stack: { indent: number; item: MarkdownListItem }[] = []
  let index = start

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) break
    if (fencePattern.test(line)) break
    const match = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/)
    if (match) {
      const indent = match[1].replace(/\t/g, '    ').length
      const item: MarkdownListItem = { text: match[3].trim(), children: [] }
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
      if (stack.length) stack[stack.length - 1].item.children.push(item)
      else items.push(item)
      stack.push({ indent, item })
      index += 1
      continue
    }
    if (/^\s+/.test(line) && stack.length) {
      stack[stack.length - 1].item.text += ` ${line.trim()}`
      index += 1
      continue
    }
    break
  }

  return { block: { type: 'list', ordered, items }, next: index }
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (fencePattern.test(line)) {
      const indent = (line.match(/^[ \t]*/) ?? [''])[0].replace(/\t/g, '    ').length
      const language = trimmed.slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !fencePattern.test(lines[index])) {
        let codeLine = lines[index]
        let removed = 0
        while (removed < indent && codeLine.startsWith(' ')) {
          codeLine = codeLine.slice(1)
          removed += 1
        }
        code.push(codeLine)
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language, code: code.join('\n') })
      continue
    }

    const heading = line.match(/^(#{2,4})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length as 2 | 3 | 4, text: heading[2].trim() })
      index += 1
      continue
    }

    if (trimmed === '---' || trimmed === '***') {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index])
        index += 1
      }
      if (tableLines.length >= 2 && isTableSeparator(tableLines[1])) {
        const headers = splitTableRow(tableLines[0])
        const rows = tableLines.slice(2).map(splitTableRow)
        blocks.push({ type: 'table', headers, rows })
      } else {
        blocks.push({ type: 'paragraph', text: tableLines.map(item => item.trim()).join(' ') })
      }
      continue
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', blocks: parseMarkdown(quoteLines.join('\n')) })
      continue
    }

    const list = parseList(lines, index)
    if (list) {
      blocks.push(list.block)
      index = list.next
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    else index += 1
  }

  return blocks
}

function inlineToText(value: string): string {
  const walk = (tokens: InlineToken[]): string => tokens.map(token => token.children?.length ? walk(token.children) : token.text).join('')
  return walk(parseInline(value))
}

function listToText(items: MarkdownListItem[]): string {
  return items.map(item => [inlineToText(item.text), listToText(item.children)].filter(Boolean).join(' ')).join(' ')
}

function blocksToText(blocks: MarkdownBlock[]): string {
  return blocks.map(block => {
    if (block.type === 'paragraph' || block.type === 'heading') return inlineToText(block.text)
    if (block.type === 'code') return block.code
    if (block.type === 'list') return listToText(block.items)
    if (block.type === 'table') return [...block.headers, ...block.rows.flat()].map(inlineToText).join(' ')
    if (block.type === 'quote') return blocksToText(block.blocks)
    return ''
  }).join(' ')
}

export function markdownToText(source: string): string {
  return blocksToText(parseMarkdown(source)).replace(/\s+/g, ' ').trim()
}
