const { contextBridge } = require('electron')
contextBridge.exposeInMainWorld('blink', { platform: process.platform })
