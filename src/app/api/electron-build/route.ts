import { NextRequest, NextResponse } from 'next/server'
import { exec, spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { localApiError } from '@/simulator/localApiAccess'

let activeBuildState: {
  isBuilding: boolean
  progress: string
  logs: string[]
  error: string | null
  completedAt: number | null
  outputPath: string | null
  installedPath: string | null
} = {
  isBuilding: false,
  progress: 'idle',
  logs: [],
  error: null,
  completedAt: null,
  outputPath: null,
  installedPath: null,
}

function getBuiltAppBundle(): string | null {
  const distDir = path.join(process.cwd(), 'dist-electron')
  if (process.platform === 'darwin') {
    const candidates = [
      path.join(distDir, 'mac-arm64', 'wireX Network Simulator.app'),
      path.join(distDir, 'mac', 'wireX Network Simulator.app'),
    ]
    for (const cand of candidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ cand)) return cand
    }
  } else if (process.platform === 'win32') {
    const cand = path.join(distDir, 'win-unpacked', 'wireX Network Simulator.exe')
    if (fs.existsSync(/*turbopackIgnore: true*/ cand)) return cand
  } else {
    const cand = path.join(distDir, 'linux-unpacked', 'wirex-web')
    if (fs.existsSync(/*turbopackIgnore: true*/ cand)) return cand
  }
  return null
}

function getInstalledInfo(): { isInstalled: boolean; installedPath: string | null; installedAt: number | null } {
  if (process.platform === 'darwin') {
    const appName = 'wireX Network Simulator.app'
    const systemApp = path.join('/Applications', appName)
    const userApp = path.join(process.env.HOME || '', 'Applications', appName)

    for (const target of [systemApp, userApp]) {
      const execPath = path.join(target, 'Contents', 'MacOS', 'wireX Network Simulator')
      if (fs.existsSync(/*turbopackIgnore: true*/ target) && fs.existsSync(/*turbopackIgnore: true*/ execPath)) {
        try {
          const stat = fs.statSync(/*turbopackIgnore: true*/ target)
          return { isInstalled: true, installedPath: target, installedAt: stat.mtimeMs }
        } catch {
          return { isInstalled: true, installedPath: target, installedAt: null }
        }
      }
    }
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    const target = path.join(localAppData, 'Programs', 'wireX Network Simulator', 'wireX Network Simulator.exe')
    if (fs.existsSync(target)) {
      try {
        const stat = fs.statSync(target)
        return { isInstalled: true, installedPath: target, installedAt: stat.mtimeMs }
      } catch {
        return { isInstalled: true, installedPath: target, installedAt: null }
      }
    }
  } else if (process.platform === 'linux') {
    const localApp = path.join(process.env.HOME || '', '.local', 'bin', 'wireforge')
    if (fs.existsSync(localApp)) {
      try {
        const stat = fs.statSync(localApp)
        return { isInstalled: true, installedPath: localApp, installedAt: stat.mtimeMs }
      } catch {
        return { isInstalled: true, installedPath: localApp, installedAt: null }
      }
    }
  }

  return { isInstalled: false, installedPath: null, installedAt: null }
}

function getTargetInstallPath(): string {
  if (process.platform === 'darwin') {
    const systemApps = '/Applications'
    try {
      fs.accessSync(systemApps, fs.constants.W_OK)
      return path.join(systemApps, 'wireX Network Simulator.app')
    } catch {
      const userApps = path.join(process.env.HOME || '', 'Applications')
      if (!fs.existsSync(userApps)) {
        fs.mkdirSync(userApps, { recursive: true })
      }
      return path.join(userApps, 'wireX Network Simulator.app')
    }
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    return path.join(localAppData, 'Programs', 'wireX Network Simulator')
  } else {
    const localBin = path.join(process.env.HOME || '', '.local', 'bin')
    if (!fs.existsSync(localBin)) {
      fs.mkdirSync(localBin, { recursive: true })
    }
    return path.join(localBin, 'wireforge')
  }
}

function installMacAppToHardware(srcApp: string, destApp: string): Promise<{ ok: boolean; dest: string; error?: string }> {
  return new Promise((resolve) => {
    const userApp = path.join(process.env.HOME || '', 'Applications', 'wireX Network Simulator.app')
    const runInstall = (target: string, fallback?: () => void) => {
      const cmd = `rm -rf "${target}" && cp -R "${srcApp}" "${target}" && xattr -cr "${target}" && /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${target}"`
      exec(cmd, (err, _stdout, stderr) => {
        if (err && fallback) {
          fallback()
        } else if (err) {
          resolve({ ok: false, dest: target, error: stderr || err.message })
        } else {
          resolve({ ok: true, dest: target })
        }
      })
    }

    if (destApp !== userApp) {
      runInstall(destApp, () => {
        const userAppsDir = path.join(process.env.HOME || '', 'Applications')
        if (!fs.existsSync(userAppsDir)) {
          fs.mkdirSync(userAppsDir, { recursive: true })
        }
        runInstall(userApp)
      })
    } else {
      runInstall(destApp)
    }
  })
}

export async function GET(request: NextRequest) {
  const denied=localApiError(request)
  if(denied)return NextResponse.json({ok:false,error:denied},{status:403})
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'status') {
    const installed = getInstalledInfo()
    return NextResponse.json({
      ok: true,
      state: activeBuildState,
      isInstalled: installed.isInstalled,
      installedPath: installed.installedPath,
      installedAt: installed.installedAt,
    })
  }

  const platform = process.platform
  const arch = process.arch
  const distDir = path.join(process.cwd(), 'dist-electron')
  let existingBuild: string[] | null = null

  if (fs.existsSync(distDir)) {
    try {
      const files = fs.readdirSync(distDir)
      existingBuild = files.filter(f => !f.startsWith('.'))
    } catch {
      // ignore
    }
  }

  const installed = getInstalledInfo()
  const targetPath = getTargetInstallPath()

  return NextResponse.json({
    ok: true,
    platform,
    arch,
    isMac: platform === 'darwin',
    isWindows: platform === 'win32',
    isLinux: platform === 'linux',
    existingBuild,
    builtApp: getBuiltAppBundle(),
    isInstalled: installed.isInstalled,
    installedPath: installed.installedPath,
    installedAt: installed.installedAt,
    targetPath,
    buildState: activeBuildState,
  })
}

export async function POST(request: NextRequest) {
  const denied=localApiError(request)
  if(denied)return NextResponse.json({ok:false,error:denied},{status:403})
  try {
    const body = await request.json()
    const action = body.action || 'compile'

    if (action === 'launch') {
      const installed = getInstalledInfo()
      if (installed.isInstalled && installed.installedPath) {
        exec(`open "${installed.installedPath}"`)
        return NextResponse.json({
          ok: true,
          message: `Launched permanently installed app from ${installed.installedPath}`,
        })
      }

      const builtApp = getBuiltAppBundle()
      if (builtApp) {
        exec(`open "${builtApp}"`)
        return NextResponse.json({
          ok: true,
          message: `Launched built app from ${builtApp}`,
        })
      }

      // Development runner fallback
      exec('npm run electron:dev', { cwd: process.cwd() })
      return NextResponse.json({
        ok: true,
        message: 'Launched desktop window via Electron runner',
      })
    }

    if (action === 'show-in-folder') {
      const installed = getInstalledInfo()
      if (installed.isInstalled && installed.installedPath) {
        exec(`open -R "${installed.installedPath}"`)
        return NextResponse.json({ ok: true, message: `Revealed ${installed.installedPath} in Finder` })
      }

      const builtApp = getBuiltAppBundle()
      if (builtApp) {
        exec(`open -R "${builtApp}"`)
        return NextResponse.json({ ok: true, message: `Revealed ${builtApp} in Finder` })
      }

      const distDir = path.join(process.cwd(), 'dist-electron')
      if (fs.existsSync(distDir)) {
        exec(`open "${distDir}"`)
        return NextResponse.json({ ok: true, message: 'Opened dist-electron directory' })
      }

      return NextResponse.json({ ok: false, error: 'No build or installed app found to reveal' }, { status: 404 })
    }

    if (action === 'uninstall') {
      const installed = getInstalledInfo()
      if (installed.isInstalled && installed.installedPath) {
        try {
          exec(`rm -rf "${installed.installedPath}"`)
          return NextResponse.json({
            ok: true,
            message: `Removed ${installed.installedPath} from hardware.`,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to remove'
          return NextResponse.json({ ok: false, error: msg }, { status: 500 })
        }
      }
      return NextResponse.json({ ok: false, error: 'Application is not currently installed on hardware' }, { status: 404 })
    }

    if (action === 'install') {
      const builtApp = getBuiltAppBundle()
      const targetPath = getTargetInstallPath()

      if (builtApp) {
        // App is already built: install directly to hardware
        activeBuildState.progress = `Installing to ${targetPath}...`
        activeBuildState.logs.push(`Copying native bundle to ${targetPath}...`)
        const result = await installMacAppToHardware(builtApp, targetPath)
        if (result.ok) {
          activeBuildState.progress = 'Permanently installed to hardware'
          activeBuildState.installedPath = targetPath
          activeBuildState.completedAt = Date.now()
          activeBuildState.logs.push(`Success: Permanently registered in Launchpad and Spotlight at ${targetPath}`)
          return NextResponse.json({
            ok: true,
            message: `Installed permanently to ${targetPath}. You can now launch it anytime from Spotlight (Cmd+Space) or Applications folder!`,
            installedPath: targetPath,
          })
        } else {
          activeBuildState.error = result.error || 'Copy failed'
          return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
        }
      }

      // If not built yet, run the compilation and auto-install afterwards
      if (activeBuildState.isBuilding) {
        return NextResponse.json({ ok: true, message: 'Build and installation already in progress', state: activeBuildState })
      }

      activeBuildState = {
        isBuilding: true,
        progress: 'Building standalone desktop bundle...',
        logs: ['Starting offline bundle compilation for permanent hardware install...'],
        error: null,
        completedAt: null,
        outputPath: null,
        installedPath: null,
      }

      const proc = spawn('npm', ['run', 'electron:pack'], {
        cwd: process.cwd(),
        shell: true,
      })

      proc.stdout.on('data', (chunk) => {
        const line = chunk.toString().trim()
        if (line) {
          activeBuildState.logs.push(line)
          if (activeBuildState.logs.length > 50) activeBuildState.logs.shift()
          if (line.includes('packaging')) activeBuildState.progress = 'Packaging native binaries...'
          if (line.includes('building')) activeBuildState.progress = 'Bundling distribution...'
        }
      })

      proc.stderr.on('data', (chunk) => {
        const line = chunk.toString().trim()
        if (line) {
          activeBuildState.logs.push(`[info] ${line}`)
          if (activeBuildState.logs.length > 50) activeBuildState.logs.shift()
        }
      })

      proc.on('close', async (code) => {
        if (code === 0) {
          activeBuildState.progress = `Copying bundle to ${targetPath}...`
          activeBuildState.logs.push(`Compilation complete. Installing to ${targetPath}...`)
          const newBuilt = getBuiltAppBundle()
          if (newBuilt) {
            const installRes = await installMacAppToHardware(newBuilt, targetPath)
            if (installRes.ok) {
              activeBuildState.isBuilding = false
              activeBuildState.progress = 'Permanently installed to hardware'
              activeBuildState.completedAt = Date.now()
              activeBuildState.installedPath = targetPath
              activeBuildState.outputPath = path.join(process.cwd(), 'dist-electron')
              activeBuildState.logs.push(`Successfully installed to ${targetPath}! Available in Spotlight, Launchpad, and Finder.`)
              return
            }
          }
          activeBuildState.isBuilding = false
          activeBuildState.progress = 'Build succeeded but installation copy failed'
        } else {
          activeBuildState.isBuilding = false
          activeBuildState.progress = 'Failed'
          activeBuildState.error = `electron-builder exited with code ${code}`
          activeBuildState.logs.push(`Build failed with exit code ${code}`)
        }
      })

      return NextResponse.json({
        ok: true,
        message: 'Compilation and installation pipeline started',
        state: activeBuildState,
      })
    }

    if (action === 'compile') {
      if (activeBuildState.isBuilding) {
        return NextResponse.json({ ok: true, message: 'Build already in progress', state: activeBuildState })
      }

      activeBuildState = {
        isBuilding: true,
        progress: 'Building desktop bundle...',
        logs: ['Starting electron-builder compilation...'],
        error: null,
        completedAt: null,
        outputPath: null,
        installedPath: null,
      }

      const proc = spawn('npm', ['run', 'electron:pack'], {
        cwd: process.cwd(),
        shell: true,
      })

      proc.stdout.on('data', (chunk) => {
        const line = chunk.toString().trim()
        if (line) {
          activeBuildState.logs.push(line)
          if (activeBuildState.logs.length > 50) activeBuildState.logs.shift()
          if (line.includes('packaging')) activeBuildState.progress = 'Packaging native binaries...'
          if (line.includes('building')) activeBuildState.progress = 'Bundling distribution...'
        }
      })

      proc.stderr.on('data', (chunk) => {
        const line = chunk.toString().trim()
        if (line) {
          activeBuildState.logs.push(`[info] ${line}`)
          if (activeBuildState.logs.length > 50) activeBuildState.logs.shift()
        }
      })

      proc.on('close', (code) => {
        activeBuildState.isBuilding = false
        if (code === 0) {
          activeBuildState.progress = 'Completed successfully'
          activeBuildState.completedAt = Date.now()
          activeBuildState.outputPath = path.join(process.cwd(), 'dist-electron')
          activeBuildState.logs.push('Build finished successfully! Desktop app ready for offline use or hardware installation.')
        } else {
          activeBuildState.progress = 'Failed'
          activeBuildState.error = `electron-builder exited with code ${code}`
          activeBuildState.logs.push(`Build failed with exit code ${code}`)
        }
      })

      return NextResponse.json({ ok: true, message: 'Build started', state: activeBuildState })
    }

    return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
