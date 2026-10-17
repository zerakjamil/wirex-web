import { readdir, readFile, writeFile, cp, rm } from 'node:fs/promises'
import path from 'node:path'

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))
  return nested.flat()
}

const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim()
const assets = (await files('.next/static')).filter(file => /\.(js|css|woff2?|ttf|svg|png)$/.test(file)).map(file => `/_next/static/${path.relative('.next/static', file).split(path.sep).join('/')}`)
await writeFile('public/offline-assets.json', JSON.stringify({ buildId, assets }))
const worker = await readFile('public/sw.js', 'utf8')
await writeFile('public/sw.js', worker.replace(/const CACHE_NAME = '[^']*'/, `const CACHE_NAME = 'wirex-cache-${buildId}'`))
await rm('.next/standalone/.next/static', { recursive: true, force: true })
await cp('.next/static', '.next/standalone/.next/static', { recursive: true })
await cp('public', '.next/standalone/public', { recursive: true })
console.log(`Offline manifest: ${assets.length} application assets for ${buildId}`)
