// Narrow bridge between the web UI and the Electron main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbitDesktop', {
  isDesktop: true,
  googleAuth: (cfg) => ipcRenderer.invoke('google-auth', cfg),
  googleRefresh: (cfg) => ipcRenderer.invoke('google-refresh', cfg),
  setLaunchAtLogin: (on) => ipcRenderer.invoke('launch-at-login', on),
  getLaunchAtLogin: () => ipcRenderer.invoke('get-launch-at-login'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setBadge: (n) => ipcRenderer.invoke('set-badge', n),
  installUpdate: (url) => ipcRenderer.invoke('update-install', url),
  writeBackup: (name, json) => ipcRenderer.invoke('backup-write', name, json),
  httpPost: (url, headers, body) => ipcRenderer.invoke('http-post', url, headers, body),
  openBackupFolder: () => ipcRenderer.invoke('backup-open-folder'),
  onUpdateProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('update-progress', h);
    return () => ipcRenderer.removeListener('update-progress', h);
  },
});
