const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('blink', {
  platform: process.platform,
  spotify: {
    status: () => ipcRenderer.invoke('spotify-status'),
    authenticate: (args) => ipcRenderer.invoke('spotify-auth-start', args),
    token: () => ipcRenderer.invoke('spotify-token'),
    api: (path, options) => ipcRenderer.invoke('spotify-api', { path, ...options }),
    disconnect: () => ipcRenderer.invoke('spotify-disconnect'),
  },
})
