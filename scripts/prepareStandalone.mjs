import { access, cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function prepareStandalone(root = repositoryRoot) {
  const staticSource = path.join(root, '.next', 'static')
  const standaloneRoot = path.join(root, '.next', 'standalone')

  const copies = [
    [staticSource, path.join(standaloneRoot, '.next', 'static')],
    [path.join(root, 'public'), path.join(standaloneRoot, 'public')],
  ]

  for (const [source, destination] of copies) {
    try {
      await access(source)
    } catch {
      if (source === staticSource) {
        throw new Error('Production static assets are missing. Run `npm run build` before starting the standalone server.')
      }
      continue
    }
    await mkdir(path.dirname(destination), { recursive: true })
    await cp(source, destination, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareStandalone()
}
