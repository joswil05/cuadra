import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { SuspendedCartItem } from '../../../../core/pos';

export interface PosSuspendedModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: SuspendedCartItem[];
  onResume: (id: string) => void;
}

export function PosSuspendedModal({
  isOpen,
  onClose,
  items,
  onResume
}: PosSuspendedModalProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Tickets Suspendidos (F8)"
      description="Seleccione un ticket para reanudar su cobro en el punto de venta."
      maxWidth="md"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar (Esc)
        </Button>
      }
    >
      {items.length === 0 ? (
        <div className="py-8 text-center text-xs text-text-3">No hay tickets suspendidos</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                onResume(item.id);
                onClose();
              }}
              className="flex items-center justify-between p-3 bg-surface border border-border hover:border-accent hover:bg-surface-2 rounded-lg cursor-pointer transition-all"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-xs text-text-1">{item.note}</span>
                <span className="text-[11px] text-text-3 font-mono">
                  Suspendido a las {item.at} — {item.itemCount} artículos
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-text-1 font-mono tabular-nums">
                  C$ {(Number(item.totalCents) / 100).toFixed(2)}
                </span>
                <Button size="sm" variant="secondary">
                  Reanudar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
