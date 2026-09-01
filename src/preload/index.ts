import { contextBridge, ipcRenderer } from 'electron';
import { IpcResponse } from '../shared/ipc';

export interface CuadraApi {
  invoke<T>(channel: string, payload: unknown): Promise<IpcResponse<T>>;
}

const api: CuadraApi = {
  invoke<T>(channel: string, payload: unknown): Promise<IpcResponse<T>> {
    return ipcRenderer.invoke('ipc:invoke', channel, payload);
  }
};

contextBridge.exposeInMainWorld('api', api);
