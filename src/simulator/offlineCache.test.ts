import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'

test('offline installation caches lazy application chunks and does not activate a partial download', async () => {
  const handlers: Record<string, (event: unknown) => void> = {}
  let pending: Promise<unknown> | undefined
  let assets: string[] = []
  let skipped = false
  const self = { addEventListener: (name: string, fn: (event: unknown) => void) => { handlers[name] = fn }, skipWaiting: () => { skipped = true }, location: { origin: 'https://wirex.test' } }
  const caches = { open: async () => ({ addAll: async (items: string[]) => { assets = items } }) }
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { self, caches, console, URL, Response, fetch: async () => Response.json({ assets: ['/_next/static/chunks/phone.js', '/_next/static/chunks/training.js'] }) })
  handlers.install({ waitUntil: (promise: Promise<unknown>) => { pending = promise } })
  await pending
  assert.ok(assets.includes('/_next/static/chunks/phone.js'))
  assert.ok(assets.includes('/_next/static/chunks/training.js'))
  assert.equal(skipped, false)
})
