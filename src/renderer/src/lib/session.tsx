import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { BootstrapContract, BootstrapData } from '../../../shared/ipc';
import { call, hasBridge } from './api';

interface SessionValue {
  boot: BootstrapData | null;
  loading: boolean;
  error: string | null;
  /** Sin puente IPC la aplicación funciona en modo demostración. */
  connected: boolean;
  reload: () => Promise<void>;
  userId: number;
  shiftId: number | null;
  ticketSeriesId: number | null;
  invoiceSeriesId: number | null;
  can: (permission: string) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(hasBridge());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!hasBridge()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setBoot(await call(BootstrapContract, undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const seriesOf = (docType: string): number | null =>
    boot?.series.find((s) => s.docType === docType)?.id ?? null;

  const value: SessionValue = {
    boot,
    loading,
    error,
    connected: hasBridge(),
    reload,
    userId: boot?.currentUserId ?? 1,
    shiftId: boot?.openShift?.id ?? null,
    ticketSeriesId: seriesOf('ticket'),
    invoiceSeriesId: seriesOf('invoice'),
    can: (permission: string) => {
      // Sin puente no hay backend que filtrar: la demostración muestra todo.
      if (!hasBridge()) return true;
      return boot?.permissions.includes(permission) ?? false;
    }
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession debe usarse dentro de <SessionProvider>');
  }
  return ctx;
}
