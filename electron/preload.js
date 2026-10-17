const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('wireforgeDesktop', {
  isElectron: true,
  platform: process.platform,
  arch: process.arch,
  version: process.versions.electron,
})
