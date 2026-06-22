import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels } from '@shared/ipc-types'

const electronAPI = {
  invoke: <C extends keyof IpcChannels>(
    channel: C,
    ...args: IpcChannels[C]['request'] extends void
      ? []
      : [IpcChannels[C]['request']]
  ): Promise<IpcChannels[C]['response']> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  on: <C extends keyof IpcChannels>(
    channel: C,
    callback: (data: IpcChannels[C]['response']) => void
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: IpcChannels[C]['response']) =>
      callback(data)
    ipcRenderer.on(channel as string, handler)
    return () => ipcRenderer.removeListener(channel as string, handler)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
