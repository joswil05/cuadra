import { useCallback, useEffect, useRef, useState } from 'react';
import type { IpcContract } from '../../../shared/ipc';
import { call, hasBridge } from '../lib/api';

export interface IpcQuery<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Vuelve a pedir el dato al proceso principal. */
  reload: () => Promise<void>;
}

/**
 * Carga un canal al montar y expone `reload` para refrescar tras una mutación.
 *
 * Sin puente IPC (pruebas de componentes, navegador suelto) devuelve
 * `fallback` en vez de romper la pantalla.
 *
 * `input` y `fallback` se leen por referencia y la única dependencia real es
 * `inputKey`: si se pusieran como dependencias directas, cada render crearía
 * un objeto nuevo y el efecto se dispararía en bucle.
 */
export function useIpcQuery<TIn, TOut>(
  contract: IpcContract<TIn, TOut>,
  input: TIn,
  fallback: TOut | null = null
): IpcQuery<TOut> {
  const [data, setData] = useState<TOut | null>(fallback);
  const [loading, setLoading] = useState(hasBridge());
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef(input);
  inputRef.current = input;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const contractRef = useRef(contract);
  contractRef.current = contract;

  const channel = contract.channel;
  const inputKey = serialize(input);

  const reload = useCallback(async () => {
    if (!hasBridge()) {
      setData(fallbackRef.current);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await call(contractRef.current, inputRef.current));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [channel, inputKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

/** JSON.stringify no sabe de BigInt; esto lo hace estable como clave. */
function serialize(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)) ?? '';
  } catch {
    return '';
  }
}
