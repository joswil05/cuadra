import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { PurchaseSummary } from '../../../../core/purchases';

export interface PurchaseDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: PurchaseSummary | null;
  onReceive?: (purchaseId: number) => void;
  onCancelReception?: (purchaseId: number) => void;
  onOpenPayment?: (purchase: PurchaseSummary) => void;
}

export function PurchaseDetailDrawer({
  isOpen,
  onClose,
  purchase,
  onReceive,
  onCancelReception,
  onOpenPayment
}: PurchaseDetailDrawerProps) {
  if (!purchase) return null;

  const isDraft = purchase.status === 'draft';
  const isReceived = purchase.status === 'received';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Orden de Compra: ${purchase.folio}`}
      width="w-[520px]"
      footer={
        <div className="flex justify-between items-center w-full">
          <div>
            {isDraft && onReceive && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onReceive(purchase.id);
                  onClose();
                }}
              >
                Recibir Mercancía en Kardex
              </Button>
            )}
            {isReceived && onCancelReception && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  onCancelReception(purchase.id);
                  onClose();
                }}
              >
                Cancelar Recepción
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {purchase.paidCents < purchase.totalCents && onOpenPayment && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onOpenPayment(purchase);
                  onClose();
                }}
              >
                Registrar Pago
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-xs font-mono">
        {/* Encabezado */}
        <div className="p-3 bg-surface-2 rounded-lg border border-border flex flex-col gap-1.5 font-sans">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-text-1 text-sm">{purchase.supplierName}</span>
            <Badge
              variant={
                purchase.status === 'received'
                  ? 'success'
                  : purchase.status === 'cancelled'
                  ? 'danger'
                  : 'warning'
              }
            >
              {purchase.status.toUpperCase()}
            </Badge>
          </div>
          <div className="text-xs text-text-3">
            Fecha: {purchase.at.substring(0, 16).replace('T', ' ')}
            {purchase.supplierDoc && ` — Factura Prov: ${purchase.supplierDoc}`}
          </div>
        </div>

        {/* Totales */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 bg-surface-2 rounded border border-border">
            <div className="text-[11px] text-text-3 font-sans">Subtotal</div>
            <div className="font-bold text-text-1 mt-0.5">
              C$ {(Number(purchase.subtotalCents) / 100).toFixed(2)}
            </div>
          </div>
          <div className="p-2.5 bg-surface-2 rounded border border-border">
            <div className="text-[11px] text-text-3 font-sans">Flete Asignado</div>
            <div className="font-bold text-accent mt-0.5">
              C$ {(Number(purchase.freightCents) / 100).toFixed(2)}
            </div>
          </div>
          <div className="p-2.5 bg-surface-2 rounded border border-border">
            <div className="text-[11px] text-text-3 font-sans">Total Compra</div>
            <div className="font-bold text-text-1 mt-0.5">
              C$ {(Number(purchase.totalCents) / 100).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Estado de Pagos */}
        <div className="p-2.5 bg-surface border border-border rounded flex justify-between items-center font-sans">
          <span>Pagado a Proveedor:</span>
          <span className="font-mono font-bold text-text-1">
            C$ {(Number(purchase.paidCents) / 100).toFixed(2)} de C$ {(Number(purchase.totalCents) / 100).toFixed(2)}
          </span>
        </div>

        {/* Líneas de Compra */}
        {purchase.lines && purchase.lines.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-2 border-b border-border text-text-3">
                <tr>
                  <th className="py-2 px-2">#</th>
                  <th className="py-2 px-2 text-right">Cant.</th>
                  <th className="py-2 px-2 text-right">Costo Base</th>
                  <th className="py-2 px-2 text-right">Landed Cost</th>
                  <th className="py-2 px-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {purchase.lines.map((l) => (
                  <tr key={l.lineNo}>
                    <td className="py-2 px-2">{l.lineNo}</td>
                    <td className="py-2 px-2 text-right">{(Number(l.qtyMilli) / 1000).toFixed(0)}</td>
                    <td className="py-2 px-2 text-right">
                      C$ {(Number(l.unitCostCents) / 100).toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right text-accent font-bold">
                      C$ {(Number(l.landedUnitCostMicros) / 1_000_000).toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right font-bold">
                      C$ {(Number(l.totalCents) / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Drawer>
  );
}
