const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('probe', {
  run: () => ipcRenderer.invoke('probe'),
  report: (m) => ipcRenderer.send('result', m)
});
