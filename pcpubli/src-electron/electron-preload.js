import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('mediaAPI', {
  download: (fileId, type) => ipcRenderer.invoke('media:download', fileId, type),
  exists: (fileId, type) => ipcRenderer.invoke('media:exists', fileId, type),
  delete: (fileId, type) => ipcRenderer.invoke('media:delete', fileId, type),
  cleanup: (activeFileIds) => ipcRenderer.invoke('media:cleanup', activeFileIds)
})
