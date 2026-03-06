const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('presenterApi', {
  pickMedia: () => ipcRenderer.invoke('media:pick'),
  loadMediaSources: (sources) => ipcRenderer.invoke('media:load-sources', sources),
  pickDefaultImage: () => ipcRenderer.invoke('default-image:pick'),
  showMedia: (mediaPath) => ipcRenderer.invoke('presenter:show', mediaPath),
  sendVideoControl: (payload) => ipcRenderer.send('presenter:video-control', payload),
  setPresenterBackground: (payload) => ipcRenderer.invoke('presenter:set-background', payload),
  reopenPresenter: () => ipcRenderer.invoke('presenter:reopen'),
  getPresenterState: () => ipcRenderer.invoke('presenter:get-state'),
  enterFullscreen: () => ipcRenderer.invoke('presenter:enter-fullscreen'),
  blackout: () => ipcRenderer.invoke('presenter:blackout'),
  onPresenterMedia: (callback) => ipcRenderer.on('presenter:media', (_event, payload) => callback(payload)),
  onPresenterBlackout: (callback) => ipcRenderer.on('presenter:blackout', () => callback()),
  onPresenterVideoControl: (callback) => ipcRenderer.on('presenter:video-control', (_event, payload) => callback(payload)),
  onPresenterBackground: (callback) => ipcRenderer.on('presenter:background-mode', (_event, payload) => callback(payload)),
  onPresenterState: (callback) => ipcRenderer.on('presenter:state', (_event, payload) => callback(payload))
});
