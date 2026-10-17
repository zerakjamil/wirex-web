const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'electron', 'preload.js')
    }
  });

  win.webContents.on('console-message', (e, level, msg, line, src) => {
    console.log('[CONSOLE ' + level + ']: ' + msg + ' (' + src + ':' + line + ')');
  });

  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('FAILED TO LOAD:', code, desc);
  });

  await win.loadURL('http://127.0.0.1:3000');
  await new Promise(r => setTimeout(r, 4000));
  
  const info = await win.webContents.executeJavaScript(`(() => {
    const nodes = document.querySelectorAll('.react-flow__node');
    const viewport = document.querySelector('.react-flow__viewport');
    const transform = viewport ? viewport.style.transform : null;
    const canvasBounds = document.querySelector('.pt-topology-container')?.getBoundingClientRect();
    const reactFlowBounds = document.querySelector('.react-flow')?.getBoundingClientRect();
    const nodeDetails = Array.from(nodes).map(n => ({
      id: n.getAttribute('data-id'),
      transform: n.style.transform,
      rect: n.getBoundingClientRect()
    }));
    return {
      nodesCount: nodes.length,
      viewportTransform: transform,
      canvasWidth: canvasBounds?.width,
      canvasHeight: canvasBounds?.height,
      rfWidth: reactFlowBounds?.width,
      rfHeight: reactFlowBounds?.height,
      deviceWindows: document.querySelectorAll('.pt-device-window').length,
      nodeSample: nodeDetails.slice(0, 5)
    };
  })()`);
  console.log('ELECTRON DIAGNOSTIC INFO:\n' + JSON.stringify(info, null, 2));

  app.quit();
});
