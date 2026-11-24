/** Pont minimal et sûr entre la page et le logiciel de bureau (version, mises à jour). */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('app:info'),
  onUpdate: (cb) => {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on('update-state', listener);
    return () => ipcRenderer.removeListener('update-state', listener);
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  openDownloadPage: () => ipcRenderer.invoke('update:download-page'),
});
