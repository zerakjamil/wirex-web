'use client'

import React, { useMemo, useState } from 'react'
import { parseInline, parseMarkdown, type InlineToken, type MarkdownBlock, type MarkdownListItem } from './markdown'

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return <>{tokens.map((token, index) => {
    if (token.type === 'bold') return <strong key={index}><Inline tokens={token.children ?? [{ type: 'text', text: token.text }]} /></strong>
    if (token.type === 'italic') return <em key={index}><Inline tokens={token.children ?? [{ type: 'text', text: token.text }]} /></em>
    if (token.type === 'code') return <code key={index} dir="ltr">{token.text}</code>
    if (token.type === 'link') return <a key={index} href={token.href} target={token.href?.startsWith('#') ? undefined : '_blank'} rel="noreferrer">{token.text}</a>
    return <React.Fragment key={index}>{token.text}</React.Fragment>
  })}</>
}

function RichText({ text }: { text: string }) {
  const tokens = useMemo(() => parseInline(text), [text])
  return <Inline tokens={tokens} />
}

function ListItems({ items, ordered }: { items: MarkdownListItem[]; ordered: boolean }) {
  const List = ordered ? 'ol' : 'ul'
  return <List>{items.map((item, index) => <li key={index}><RichText text={item.text} />{item.children.length > 0 && <ListItems items={item.children} ordered={ordered} />}</li>)}</List>
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const label = language === 'cisco' ? 'Cisco IOS' : language === 'text' ? 'Text' : language || 'Diagram'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return <div className="ccna-code">
    <div className="ccna-code-head">
      <span>{label}</span>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy code'}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
    <pre dir="ltr"><code>{code}</code></pre>
  </div>
}

function Block({ block }: { block: MarkdownBlock }) {
  if (block.type === 'heading') {
    if (block.level === 2) return <h2><RichText text={block.text} /></h2>
    if (block.level === 3) return <h3><RichText text={block.text} /></h3>
    return <h4><RichText text={block.text} /></h4>
  }
  if (block.type === 'paragraph') return <p><RichText text={block.text} /></p>
  if (block.type === 'list') return <ListItems items={block.items} ordered={block.ordered} />
  if (block.type === 'table') return <div className="ccna-table-wrap" dir="ltr">
    <table>
      <thead><tr>{block.headers.map((header, index) => <th key={index}><RichText text={header} /></th>)}</tr></thead>
      <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><RichText text={cell} /></td>)}</tr>)}</tbody>
    </table>
  </div>
  if (block.type === 'code') return <CodeBlock language={block.language} code={block.code} />
  if (block.type === 'quote') return <aside className="ccna-quote">{block.blocks.map((item, index) => <Block key={index} block={item} />)}</aside>
  return <hr />
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown])
  return <div className="ccna-markdown" dir="ltr">{blocks.map((block, index) => <Block key={index} block={block} />)}</div>
}
