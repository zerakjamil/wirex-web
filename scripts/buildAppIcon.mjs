#!/usr/bin/env node
// Renders public/icon.svg into build/icon.icns for the macOS app bundle.
// Requires macOS tools (rsvg-convert, sips, iconutil). Re-run when the SVG changes.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

const SOURCE = 'public/icon.svg'
const ICONSET = 'build/icon.iconset'
const OUTPUT = 'build/icon.icns'

const entries = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
]

rmSync(ICONSET, { recursive: true, force: true })
mkdirSync(ICONSET, { recursive: true })

const master = path.join(ICONSET, 'master.png')
execFileSync('rsvg-convert', ['-w', '1024', '-h', '1024', SOURCE, '-o', master], { stdio: 'inherit' })

for (const [size, name] of entries) {
  execFileSync('sips', ['-z', String(size), String(size), master, '--out', path.join(ICONSET, name)], { stdio: ['ignore', 'ignore', 'ignore'] })
}

rmSync(master)
execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', OUTPUT], { stdio: 'inherit' })
rmSync(ICONSET, { recursive: true, force: true })
console.log(`Wrote ${OUTPUT} (${Math.round(statSync(OUTPUT).size / 1024)} KB) from ${SOURCE}`)
