const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false });
  
  win.webContents.on('console-message', (e, level, msg, line, src) => {
    console.log(`[RENDERER L${level}]: ${msg} (${src}:${line})`);
  });

  await win.loadURL('http://127.0.0.1:3000');
  await new Promise(r => setTimeout(r, 4000));
  
  const res = await win.webContents.executeJavaScript(`
    (() => {
      return {
        errors: window.__errors || [],
        reactFlowPro: Boolean(document.querySelector('.react-flow__panel')),
        nodesInDom: document.querySelectorAll('.react-flow__node').length,
        nodesContainerChildren: document.querySelector('.react-flow__nodes')?.children.length,
        edgesContainerChildren: document.querySelector('.react-flow__edges')?.children.length
      };
    })()
  `);
  console.log('RESULT:', JSON.stringify(res, null, 2));
  app.quit();
});
