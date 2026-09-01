const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
ipcMain.handle('probe', () => ({ big: 12345678901234567890n, neg: -50n, nested: { arr: [1n, 2n] } }));
app.whenReady().then(() => {
  const w = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  w.loadFile(path.join(__dirname, 'index.html'));
  ipcMain.on('result', (_e, msg) => { console.log('RESULTADO::' + msg); app.exit(0); });
  setTimeout(() => { console.log('RESULTADO::TIMEOUT'); app.exit(1); }, 8000);
});
