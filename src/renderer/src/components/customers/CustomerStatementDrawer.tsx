import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { CustomerStatement } from '../../../../core/customers';

export interface CustomerStatementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  statement: CustomerStatement | null;
  onOpenPayment?: (customerId: number, currentBalanceCents: bigint) => void;
  onRedeemPoints?: (customerId: number) => void;
}

export function CustomerStatementDrawer({
  isOpen,
  onClose,
  statement,
  onOpenPayment,
  onRedeemPoints
}: CustomerStatementDrawerProps) {
  if (!statement) return null;

  const { customer, balanceCents, creditLimitCents, availableCreditCents, aging, entries } = statement;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Estado de Cuenta: ${customer.name}`}
      width="w-[560px]"
      footer={
        <div className="flex justify-between items-center w-full">
          <div className="flex gap-2">
            {balanceCents > 0n && onOpenPayment && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onOpenPayment(customer.id, balanceCents);
                  onClose();
                }}
              >
                + Registrar Abono
              </Button>
            )}
            {customer.pointsBalance > 0n && onRedeemPoints && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onRedeemPoints(customer.id);
                }}
              >
                Canjear Puntos ({customer.pointsBalance.toString()})
              </Button>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-xs font-mono">
        {/* Cabecera del Cliente */}
        <div className="p-3 bg-surface-2 rounded-lg border border-border flex flex-col gap-1.5 font-sans">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-text-1 text-sm">{customer.name}</span>
            <Badge variant={balanceCents > 0n ? 'warning' : 'success'}>
              {balanceCents > 0n ? 'CON SALDO DEUDOR' : 'AL DÍA'}
            </Badge>
          </div>
          <div className="text-xs text-text-3">
            {customer.code && `Código: ${customer.code} • `}
            {customer.docNumber && `Doc: ${customer.docNumber} • `}
            {`Límite: C$ ${(Number(creditLimitCents) / 100).toFixed(2)}`}
          </div>
        </div>

        {/* Resumen de Crédito y Puntos */}
        <div className="grid grid-cols-3 gap-2 text-center font-sans">
          <div className="p-2.5 bg-surface-2 rounded border border-border">
            <div className="text-[11px] text-text-3">Saldo Deudor</div>
            <div className={`font-bold mt-0.5 font-mono ${balanceCents > 0n ? 'text-danger' : 'text-text-1'}`}>
              C$ {(Number(balanceCents) / 100).toFixed(2)}
            </div>
          </div>
          <div className="p-2.5 bg-surface-2 rounded border border-border">
            <div className="text-[11px] text-text-3">Crédito Disponible</div>
            <div className="font-bold text-accent mt-0.5 font-mono">
              C$ {(Number(availableCreditCents) / 100).toFixed(2)}
            </div>
          </div>
          <div className="p-2.5 bg-surface-2 rounded border border-border">
            <div className="text-[11px] text-text-3">Puntos Acumulados</div>
            <div className="font-bold text-success mt-0.5 font-mono">
              {customer.pointsBalance.toString()} pts
            </div>
          </div>
        </div>

        {/* Tabla de Antigüedad de Saldos */}
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          <div className="p-2 bg-surface-2 border-b border-border text-[11px] font-semibold text-text-2 font-sans">
            Antigüedad de Saldos
          </div>
          <div className="grid grid-cols-5 divide-x divide-border text-center py-2 text-[11px]">
            <div>
              <div className="text-text-3">Corriente</div>
              <div className="font-bold text-text-1 mt-0.5 font-mono">
                C$ {(Number(aging.currentCents) / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-text-3">1-30 Días</div>
              <div className="font-bold text-warning mt-0.5 font-mono">
                C$ {(Number(aging.days1to30Cents) / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-text-3">31-60 Días</div>
              <div className="font-bold text-warning mt-0.5 font-mono">
                C$ {(Number(aging.days31to60Cents) / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-text-3">61-90 Días</div>
              <div className="font-bold text-danger mt-0.5 font-mono">
                C$ {(Number(aging.days61to90Cents) / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-text-3">+90 Días</div>
              <div className="font-bold text-danger mt-0.5 font-mono">
                C$ {(Number(aging.daysOver90Cents) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Libro de Cuenta Corriente (customer_ledger inmutable) */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="p-2 bg-surface-2 border-b border-border text-[11px] font-semibold text-text-2 font-sans">
            Movimientos de Cuenta Corriente (Inmutable)
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-2 border-b border-border text-text-3">
                <tr>
                  <th className="py-2 px-2">Fecha</th>
                  <th className="py-2 px-2">Tipo</th>
                  <th className="py-2 px-2 text-right">Monto</th>
                  <th className="py-2 px-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2 px-2 text-text-3">
                      {entry.at.substring(0, 10)}
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className={
                          entry.type === 'charge'
                            ? 'text-danger font-medium'
                            : 'text-success font-medium'
                        }
                      >
                        {entry.type === 'charge' ? 'CARGO' : 'ABONO'}
                      </span>
                      {entry.note && (
                        <div className="text-[10px] text-text-3 truncate max-w-[180px]">
                          {entry.note}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold">
                      {entry.amountCents > 0n ? '+' : ''}
                      C$ {(Number(entry.amountCents) / 100).toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-text-1">
                      C$ {(Number(entry.balanceAfterCents) / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
