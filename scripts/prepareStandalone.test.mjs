import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { prepareStandalone } from './prepareStandalone.mjs'

test('copies build static assets and public files into the standalone server', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wirex-standalone-'))
  try {
    await mkdir(path.join(root, '.next', 'static', 'chunks'), { recursive: true })
    await mkdir(path.join(root, 'public'), { recursive: true })
    await writeFile(path.join(root, '.next', 'static', 'chunks', 'app.js'), 'app bundle')
    await writeFile(path.join(root, 'public', 'icon.svg'), '<svg/>')

    await prepareStandalone(root)

    assert.equal(await readFile(path.join(root, '.next', 'standalone', '.next', 'static', 'chunks', 'app.js'), 'utf8'), 'app bundle')
    assert.equal(await readFile(path.join(root, '.next', 'standalone', 'public', 'icon.svg'), 'utf8'), '<svg/>')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails with a build hint when production static assets are absent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wirex-standalone-missing-'))
  try {
    await assert.rejects(prepareStandalone(root), /Run `npm run build`/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
