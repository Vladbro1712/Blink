const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('blink', {
  platform: process.platform,
  spotify: {
    status: () => ipcRenderer.invoke('spotify-status'),
    authenticate: (args) => ipcRenderer.invoke('spotify-auth-start', args),
    api: (path) => ipcRenderer.invoke('spotify-api', { path }),
    disconnect: () => ipcRenderer.invoke('spotify-disconnect'),
  },
})
