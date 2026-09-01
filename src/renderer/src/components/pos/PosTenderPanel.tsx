import { useState, useEffect } from 'react';
import { SaleDocument } from '../../../../core/sales';
import { SalePaymentInput } from '../../../../shared/ipc';
import { mulDiv } from '../../../../core/money';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';

export interface PosTenderPanelProps {
  saleDoc: SaleDocument;
  usdRateMicros?: bigint;
  onConfirmTender: (payments: SalePaymentInput[]) => void;
  onCancel: () => void;
}

export function PosTenderPanel({
  saleDoc,
  usdRateMicros = 36624300n,
  onConfirmTender,
  onCancel
}: PosTenderPanelProps) {
  const [activeMethod, setActiveMethod] = useState<'cash_nio' | 'cash_usd' | 'card' | 'transfer' | 'credit'>('cash_nio');
  const [cashNioReceived, setCashNioReceived] = useState<string>('');
  const [cashUsdReceived, setCashUsdReceived] = useState<string>('');

  const totalCents = saleDoc.totalCents;
  const formatPrice = (cents: bigint) => `C$ ${(Number(cents) / 100).toFixed(2)}`;

  // Cálculos de pagos
  let paidCents = 0n;
  const payments: SalePaymentInput[] = [];

  if (activeMethod === 'cash_nio') {
    const enteredCents = cashNioReceived ? BigInt(Math.round(parseFloat(cashNioReceived) * 100)) : totalCents;
    paidCents = enteredCents;
    payments.push({
      method: 'cash',
      currencyCode: 'NIO',
      amountFx: enteredCents,
      fxRateMicros: 1000000n,
      amountCents: enteredCents
    });
  } else if (activeMethod === 'cash_usd') {
    const enteredUsdCents = cashUsdReceived ? BigInt(Math.round(parseFloat(cashUsdReceived) * 100)) : 0n;
    if (enteredUsdCents > 0n) {
      // Redondear a 5 centavos antes del vuelto
      const convertedCents = mulDiv(enteredUsdCents, usdRateMicros, 1_000_000n);
      paidCents = convertedCents;
      payments.push({
        method: 'cash',
        currencyCode: 'USD',
        amountFx: enteredUsdCents,
        fxRateMicros: usdRateMicros,
        amountCents: convertedCents
      });
    }
  } else if (activeMethod === 'card' || activeMethod === 'transfer') {
    paidCents = totalCents;
    payments.push({
      method: activeMethod === 'card' ? 'card' : 'transfer',
      currencyCode: 'NIO',
      amountFx: totalCents,
      fxRateMicros: 1000000n,
      amountCents: totalCents
    });
  } else if (activeMethod === 'credit') {
    paidCents = 0n;
    payments.push({
      method: 'credit',
      currencyCode: 'NIO',
      amountFx: totalCents,
      fxRateMicros: 1000000n,
      amountCents: totalCents
    });
  }

  const changeCents = paidCents > totalCents ? paidCents - totalCents : 0n;

  // Atajo Enter para confirmar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        onConfirmTender(payments);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [payments, onConfirmTender]);

  const quickBills = [
    { label: 'Exacto', value: (Number(totalCents) / 100).toFixed(2) },
    { label: 'C$ 50', value: '50.00' },
    { label: 'C$ 100', value: '100.00' },
    { label: 'C$ 200', value: '200.00' },
    { label: 'C$ 500', value: '500.00' },
    { label: 'C$ 1,000', value: '1000.00' }
  ];

  return (
    <div className="w-[450px] flex-shrink-0 bg-surface border-l border-border flex flex-col justify-between p-6 shadow-xl z-20">
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-base font-semibold text-text-1">Cajón de Cobro</h2>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar (Esc)
          </Button>
        </div>

        {/* Total Display (42px) */}
        <div className="p-4 bg-surface-2 rounded-xl border border-border flex flex-col items-center justify-center text-center">
          <span className="text-xs font-medium text-text-2 uppercase tracking-wider">Total a Cobrar</span>
          <div className="text-[40px] leading-tight font-black text-text-1 tabular-nums mt-1 font-mono">
            {formatPrice(totalCents)}
          </div>
          <div className="text-xs text-text-3 mt-1">
            TC: C$ {(Number(usdRateMicros) / 1_000_000).toFixed(4)} por USD
          </div>
        </div>

        {/* Payment Methods */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-text-2">Método de Pago:</label>
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              variant={activeMethod === 'cash_nio' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setActiveMethod('cash_nio')}
            >
              Efectivo C$
            </Button>
            <Button
              variant={activeMethod === 'cash_usd' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setActiveMethod('cash_usd')}
            >
              Dólares US$
            </Button>
            <Button
              variant={activeMethod === 'card' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setActiveMethod('card')}
            >
              Tarjeta
            </Button>
            <Button
              variant={activeMethod === 'transfer' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setActiveMethod('transfer')}
            >
              Transferencia
            </Button>
            <Button
              variant={activeMethod === 'credit' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setActiveMethod('credit')}
            >
              Crédito
            </Button>
          </div>
        </div>

        {/* Cash Tender Input & Quick Bills */}
        {activeMethod === 'cash_nio' && (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium text-text-2">Importe Entregado (C$):</label>
            <input
              type="number"
              step="0.01"
              value={cashNioReceived}
              onChange={(e) => setCashNioReceived(e.target.value)}
              placeholder={(Number(totalCents) / 100).toFixed(2)}
              className="w-full bg-surface border-2 border-border-strong rounded-lg p-2.5 text-xl font-bold font-mono text-text-1 focus:border-accent focus:outline-none"
              autoFocus
            />

            <div className="grid grid-cols-3 gap-1.5">
              {quickBills.map((b) => (
                <Button
                  key={b.label}
                  variant="secondary"
                  size="sm"
                  onClick={() => setCashNioReceived(b.value)}
                >
                  {b.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* USD Tender Input */}
        {activeMethod === 'cash_usd' && (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium text-text-2">Dólares Entregados (US$):</label>
            <input
              type="number"
              step="0.01"
              value={cashUsdReceived}
              onChange={(e) => setCashUsdReceived(e.target.value)}
              placeholder="0.00"
              className="w-full bg-surface border-2 border-border-strong rounded-lg p-2.5 text-xl font-bold font-mono text-text-1 focus:border-accent focus:outline-none"
              autoFocus
            />
            <div className="p-2.5 bg-surface-2 rounded-md text-xs text-text-2 font-mono flex justify-between">
              <span>Equivalente en córdobas:</span>
              <span className="font-bold text-text-1">{formatPrice(paidCents)}</span>
            </div>
          </div>
        )}

        {/* Change Display */}
        {(activeMethod === 'cash_nio' || activeMethod === 'cash_usd') && (
          <div className="p-3 bg-surface-2/60 border border-border rounded-lg flex items-center justify-between">
            <span className="text-xs font-semibold text-text-2">Vuelto al Cliente:</span>
            <span className="text-2xl font-black text-text-1 font-mono tabular-nums">
              {formatPrice(changeCents)}
            </span>
          </div>
        )}
      </div>

      {/* Action: Confirm Tender */}
      <div className="flex flex-col gap-2 pt-4 border-t border-border">
        <Button
          variant="primary"
          size="lg"
          className="w-full py-4 text-base font-bold shadow-lg"
          onClick={() => onConfirmTender(payments)}
          rightIcon={<Kbd className="bg-white/20 text-white border-transparent">F12</Kbd>}
        >
          Confirmar Cobro e Imprimir
        </Button>
      </div>
    </div>
  );
}
