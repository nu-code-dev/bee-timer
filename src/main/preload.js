'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bee', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (patch) => ipcRenderer.invoke('config:save', patch),
    defaults: () => ipcRenderer.invoke('config:defaults'),
  },
  window: {
    setMode: (mode) => ipcRenderer.invoke('window:set-mode', mode),
    setAlwaysOnTop: (value) => ipcRenderer.invoke('window:set-always-on-top', value),
    chaosMove: (marginPx) => ipcRenderer.invoke('window:chaos-move', marginPx),
  },
  notify: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
  integration: () => ipcRenderer.invoke('app:integration-info'),
  clipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  app: {
    quit: () => ipcRenderer.invoke('app:quit'),
    minimize: () => ipcRenderer.invoke('app:minimize'),
    version: () => ipcRenderer.invoke('app:version'),
  },
});
