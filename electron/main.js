const { app, BrowserWindow, shell, Menu } = require('electron')
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
const { spawn, fork } = require('node:child_process')

// Rebranding must keep the existing Electron browser saves accessible.
const legacyUserData = ['WireForge Network Simulator','wireforge-web']
  .map(name=>path.join(app.getPath('appData'),name)).find(dir=>fs.existsSync(dir))
if(legacyUserData)app.setPath('userData',legacyUserData)

let mainWindow = null
let serverProcess = null
let currentAppUrl = 'http://127.0.0.1:3000'

function isServerReady(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function iswireXRunning(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/sqlite?action=list-cram-cards`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1200, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function getAvailablePort(preferredPort = 38888) {
  return new Promise((resolve) => {
    const net = require('node:net')
    const checkPort = (port) => {
      const srv = net.createServer()
      srv.listen(port, '127.0.0.1', () => {
        srv.close(() => resolve(port))
      })
      srv.on('error', () => {
        checkPort(port + 1)
      })
    }
    checkPort(preferredPort || 38888)
  })
}

async function waitForServer(url, timeoutMs = 30000) {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    if (await isServerReady(url)) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

function startLocalServer(targetPort = 3000) {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const appPath = app.getAppPath()

  // 1. In packaged app, locate standalone server.js
  const candidates = [
    path.join(appPath, '.next', 'standalone', 'server.js'),
    path.join(appPath, 'server.js'),
    path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js'),
    path.join(process.resourcesPath, 'app', 'server.js'),
  ]

  const standaloneServer = candidates.find(p => fs.existsSync(p))

  if (standaloneServer) {
    try {
      serverProcess = fork(standaloneServer, [], {
        cwd: path.dirname(standaloneServer),
        execPath: process.execPath,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          PORT: String(targetPort),
          HOSTNAME: '127.0.0.1',
          NODE_ENV: 'production',
          WIREX_LOCAL_API: '1',
          WIREFORGE_DB_PATH: process.env.WIREFORGE_DB_PATH || path.join(app.getPath('home'), '.wireforge', 'study_vault.db'),
        },
        stdio: 'inherit',
      })

      serverProcess.on('error', (err) => {
        console.error('Failed to run standalone server:', err)
      })
      return
    } catch (err) {
      console.error('Error forking standalone server:', err)
    }
  }

  // 2. Development mode fallback
  const cmd = 'npm'
  const args = isDev ? ['run', 'dev'] : ['start']

  try {
    serverProcess = spawn(cmd, args, {
      cwd: appPath,
      env: {
        ...process.env,
        PORT: String(targetPort),
        HOSTNAME: '127.0.0.1',
        WIREX_LOCAL_API: '1',
        WIREFORGE_DB_PATH: process.env.WIREFORGE_DB_PATH || path.join(app.getPath('home'), '.wireforge', 'study_vault.db'),
      },
      shell: true,
      stdio: 'ignore',
    })

    serverProcess.on('error', (err) => {
      console.error('Failed to launch offline server process:', err)
    })
  } catch (err) {
    console.error('Error starting server:', err)
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'wireX Network Simulator -- Offline Desktop Edition',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  let targetPort = 38888
  if (!app.isPackaged && process.env.PORT) {
    targetPort = parseInt(process.env.PORT, 10)
  }

  if (app.isPackaged) {
    targetPort = await getAvailablePort(38888)
    const appUrl = `http://127.0.0.1:${targetPort}`
    currentAppUrl = appUrl
    startLocalServer(targetPort)
    await waitForServer(appUrl, 30000)
    await mainWindow.loadURL(appUrl)
  } else {
    let appUrl = `http://127.0.0.1:${targetPort}`
    const alreadyRunning = await iswireXRunning(appUrl)
    if (!alreadyRunning) {
      targetPort = await getAvailablePort(targetPort)
      appUrl = `http://127.0.0.1:${targetPort}`
      startLocalServer(targetPort)
      await waitForServer(appUrl, 30000)
    }
    currentAppUrl = appUrl
    await mainWindow.loadURL(appUrl)
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load page in window:', errorCode, errorDescription)
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(currentAppUrl).catch(() => {})
      }
    }, 1500)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createMenu() {
  const template = [
    {
      label: 'wireX',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload Lab',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload(),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+CmdOrCtrl+I',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation & Study Vault',
          click: () => mainWindow && mainWindow.loadURL(`${currentAppUrl}/#study`),
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  createMenu()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (serverProcess) {
    try {
      serverProcess.kill()
    } catch {
      // ignore
    }
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill()
    } catch {
      // ignore
    }
  }
})
