import { ReactNode } from 'react';
import { Button } from '../ui/Button';

interface DataStateProps<T> {
  loading: boolean;
  error: string | null;
  data: T | null | undefined;
  /** Qué contar cuando el dato es una lista, para decidir si está vacía. */
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}

/**
 * Los cuatro estados de cualquier pantalla con datos: cargando, error, vacío
 * y con contenido. Existe para que ninguna pantalla los invente por su cuenta,
 * y sobre todo para que **ninguna muestre cifras cuando no las tiene**.
 */
export function DataState<T>({
  loading,
  error,
  data,
  isEmpty,
  emptyTitle = 'Todavía no hay datos',
  emptyHint,
  emptyAction,
  onRetry,
  children
}: DataStateProps<T>) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-xs text-text-3">Consultando…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-danger bg-surface-2 px-6 py-10 text-center">
        <p className="text-sm font-semibold text-danger">No se pudo leer la información</p>
        <p className="max-w-md text-xs text-text-2">{error}</p>
        <p className="max-w-md text-[11px] text-text-3">
          No se muestran cifras porque no se pudieron confirmar contra la base de datos.
        </p>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (data === null || data === undefined || (isEmpty && isEmpty(data))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm font-medium text-text-1">{emptyTitle}</p>
        {emptyHint && <p className="max-w-sm text-xs text-text-3">{emptyHint}</p>}
        {emptyAction && <div className="mt-2">{emptyAction}</div>}
      </div>
    );
  }

  return <>{children(data)}</>;
}
