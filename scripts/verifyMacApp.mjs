#!/usr/bin/env node
// Verifies the packaged macOS app end to end: bundle signature integrity, hardened
// runtime and entitlements, then a cold launch that must serve the embedded server.
// Usage: node scripts/verifyMacApp.mjs [path/to/App.app]
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const APP_NAME = 'wireX Network Simulator.app'
const PORT_RANGE = Array.from({ length: 12 }, (_, index) => 38888 + index)
const failures = []

function pass(message) { console.log(`  ok   ${message}`) }
function fail(message) { failures.push(message); console.log(`  FAIL ${message}`) }
function note(message) { console.log(`  note ${message}`) }

function findApp() {
  const explicit = process.argv[2]
  if (explicit) return explicit
  const base = 'dist-electron'
  const dirs = existsSync(base) ? readdirSync(base) : []
  for (const dir of dirs) {
    const candidate = path.join(base, dir, APP_NAME)
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`No packaged app found under ${base} — run npm run electron:pack first.`)
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function killPortListeners() {
  const result = run('lsof', ['-ti', `tcp:${PORT_RANGE[0]}-${PORT_RANGE[PORT_RANGE.length - 1]}`])
  const pids = result.stdout.split('\n').map(line => line.trim()).filter(Boolean)
  for (const pid of pids) {
    note(`killing stale listener pid ${pid} in the app port range`)
    try { process.kill(Number(pid), 'SIGKILL') } catch { /* already gone */ }
  }
  return pids.length
}

async function probe(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/sqlite?action=list-cram-cards`, { signal: AbortSignal.timeout(900) })
    return response.status === 200
  } catch {
    return false
  }
}

async function coldLaunch(appPath) {
  const binary = path.resolve(appPath, 'Contents', 'MacOS', path.basename(appPath, '.app'))
  if (!existsSync(binary)) { fail(`executable not found at ${binary}`); return null }
  killPortListeners()
  console.log(`\n[4] cold launch: ${path.basename(binary)}`)
  const child = spawn(binary, [], {
    cwd: path.dirname(binary),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  let launchError = null
  child.on('error', error => { launchError = error })

  const deadline = Date.now() + 45000
  let servedPort = null
  while (Date.now() < deadline && !servedPort) {
    if (launchError || child.exitCode !== null) break
    for (const port of PORT_RANGE) {
      if (await probe(port)) { servedPort = port; break }
    }
    if (!servedPort) await new Promise(resolve => setTimeout(resolve, 700))
  }

  if (servedPort) pass(`embedded server answered on http://127.0.0.1:${servedPort}/api/sqlite`)
  else if (launchError) fail(`launch failed: ${launchError.message}`)
  else fail(`no port in ${PORT_RANGE[0]}-${PORT_RANGE[PORT_RANGE.length - 1]} answered within 45 s (exitCode ${child.exitCode})`)

  const crash = output.match(/FATAL|Uncaught|Unhandled|cannot be opened|is damaged/gi)
  if (crash) {
    fail(`crash markers in app output: ${[...new Set(crash)].join(', ')}`)
    console.log(output.split('\n').slice(0, 12).join('\n'))
  }

  try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
  await new Promise(resolve => setTimeout(resolve, 1500))
  try { process.kill(-child.pid, 'SIGKILL') } catch { /* expected once exited */ }
  killPortListeners()
  return servedPort
}

async function main() {
  const appPath = findApp()
  console.log(`Verifying ${appPath}\n`)

  console.log('[1] signature integrity')
  const verify = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
  if (verify.status === 0) pass('codesign --verify --deep --strict')
  else fail(`codesign verify failed: ${(verify.stderr || verify.stdout).trim().split('\n').slice(-3).join(' | ')}`)

  console.log('\n[2] signature details')
  const details = run('codesign', ['-dv', '--verbose=4', appPath])
  const info = `${details.stdout}\n${details.stderr}`
  const flags = info.match(/flags=0x[0-9a-f]+\(([^)]*)\)/)?.[1] ?? ''
  const authority = info.match(/Authority=([^\n]+)/)?.[1] ?? (flags.includes('adhoc') ? 'ad-hoc' : 'none')
  note(`signature: ${authority}`)
  note(`flags: ${flags || 'unknown'}`)
  if (flags.includes('runtime')) pass('hardened runtime flag present')
  else fail('hardened runtime flag missing')
  if (authority === 'ad-hoc') note('ad-hoc signature — no Developer ID certificate is installed on this machine')

  console.log('\n[3] entitlements')
  const entitlements = run('codesign', ['-d', '--entitlements', ':-', appPath])
  const plist = `${entitlements.stdout}${entitlements.stderr}`
  for (const key of ['com.apple.security.cs.allow-jit', 'com.apple.security.cs.disable-library-validation']) {
    if (plist.includes(key)) pass(key)
    else fail(`entitlement missing: ${key}`)
  }

  await coldLaunch(appPath)

  console.log('\n' + (failures.length ? `FAILED (${failures.length}):\n- ${failures.join('\n- ')}` : 'All macOS packaging checks passed.'))
  process.exit(failures.length ? 1 : 0)
}

main().catch(error => { console.error(error); process.exit(1) })
