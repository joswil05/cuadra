import type { IpcContract } from '../../../shared/ipc';

/**
 * Error de negocio devuelto por el proceso principal.
 * Lleva el código para que la interfaz decida cómo mostrarlo.
 */
export class IpcError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Llama un canal y devuelve el dato, o lanza IpcError.
 *
 * Fuera de Electron (por ejemplo en pruebas de componentes con jsdom)
 * `window.api` no existe: en ese caso lanza un error claro en vez de
 * fallar con "undefined no es una función".
 */
export async function call<TIn, TOut>(
  contract: IpcContract<TIn, TOut>,
  input: TIn
): Promise<TOut> {
  const bridge = typeof window !== 'undefined' ? (window.api as typeof window.api | undefined) : undefined;
  if (!bridge) {
    throw new IpcError(
      'NO_BRIDGE',
      'La aplicación no está corriendo dentro de Electron: no hay puente IPC disponible.'
    );
  }

  const res = await bridge.invoke<TOut>(contract.channel, input);
  if (!res.ok) {
    throw new IpcError(res.code, res.message, res.details);
  }
  return res.data;
}

/** Indica si hay puente IPC. Útil para degradar la interfaz en pruebas. */
export function hasBridge(): boolean {
  return typeof window !== 'undefined' && !!window.api;
}
