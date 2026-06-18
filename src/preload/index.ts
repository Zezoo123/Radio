import { contextBridge, ipcRenderer } from 'electron'

/**
 * Bridge exposed to the renderer. IPC channels are added as the main-process
 * domain services (parse, compose, export) are wired up in later milestones.
 */
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping')
}

contextBridge.exposeInMainWorld('api', api)

export type RadioApi = typeof api
