import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { KardexEntry } from '../../../../core/inventory';

export interface KardexDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  sku: string;
  entries: KardexEntry[];
}

export function KardexDrawer({
  isOpen,
  onClose,
  productName,
  sku,
  entries
}: KardexDrawerProps) {
  const formatPrice = (micros: bigint) => `C$ ${(Number(micros) / 1_000_000).toFixed(2)}`;
  const formatQty = (milli: bigint) => (Number(milli) / 1000).toFixed(2);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Libro Kardex: ${productName} (${sku})`}
      width="w-[500px]"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar (Esc)
        </Button>
      }
    >
      {entries.length === 0 ? (
        <div className="py-12 text-center text-xs text-text-3">
          No hay movimientos registrados para este artículo en el Kardex.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-surface-2 border-b border-border text-text-2 sticky top-0">
                <tr>
                  <th className="py-2 px-2.5">Fecha</th>
                  <th className="py-2 px-2.5">Motivo</th>
                  <th className="py-2 px-2.5 text-right">Cantidad</th>
                  <th className="py-2 px-2.5 text-right">Costo Unit.</th>
                  <th className="py-2 px-2.5 text-right">Saldo Cant.</th>
                  <th className="py-2 px-2.5 text-right">Saldo CPP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-2 transition-colors">
                    <td className="py-2 px-2.5 text-text-3 whitespace-nowrap text-[11px]">
                      {m.at.substring(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-2 px-2.5 font-sans">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={m.direction === 'in' ? 'success' : 'neutral'}>
                          {m.direction === 'in' ? '+' : '-'} {m.reason}
                        </Badge>
                      </div>
                      {m.note && <div className="text-[10px] text-text-3 mt-0.5">{m.note}</div>}
                    </td>
                    <td className="py-2 px-2.5 text-right tabular-nums font-semibold text-text-1">
                      {m.direction === 'in' ? '+' : '-'}{formatQty(m.qtyMilli)}
                    </td>
                    <td className="py-2 px-2.5 text-right tabular-nums text-text-2">
                      {formatPrice(m.unitCostMicros)}
                    </td>
                    <td className="py-2 px-2.5 text-right tabular-nums font-bold text-text-1">
                      {formatQty(m.balanceQtyMilli)}
                    </td>
                    <td className="py-2 px-2.5 text-right tabular-nums font-bold text-accent">
                      {formatPrice(m.balanceAvgCostMicros)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Drawer>
  );
}
