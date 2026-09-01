import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { PaySupplierParams } from '../../../../core/purchases';

export interface SupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: number;
  supplierName: string;
  purchaseId?: number;
  totalPendingCents?: bigint;
  onSave: (params: PaySupplierParams) => void;
}

export function SupplierPaymentModal({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  purchaseId,
  totalPendingCents = 0n,
  onSave
}: SupplierPaymentModalProps) {
  const [amountStr, setAmountStr] = useState(
    totalPendingCents > 0n ? (Number(totalPendingCents) / 100).toFixed(2) : ''
  );
  const [method, setMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountStr) return;

    const amountCents = BigInt(Math.round(parseFloat(amountStr) * 100));

    onSave({
      supplierId,
      purchaseId,
      shiftId: 1, // Turno activo
      method,
      currencyCode: 'NIO',
      amountCents,
      userId: 1,
      note: note.trim() || undefined
    });

    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Pago a Proveedor"
      description={`Proveedor: ${supplierName}. Si el pago es en efectivo, se registrará la salida automática de caja.`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Monto a Pagar (C$)"
          type="number"
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="0.00"
          required
        />

        <Select
          label="Método de Pago"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer' | 'card')}
          options={[
            { value: 'cash', label: 'Efectivo (Salida de Turno de Caja)' },
            { value: 'transfer', label: 'Transferencia Bancaria' },
            { value: 'card', label: 'Tarjeta de Débito / Crédito' }
          ]}
        />

        <Input
          label="Referencia / No. de Transferencia o Recibo"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ej. Transf. BAC No. 987654"
        />

        <div className="flex justify-end gap-2 pt-3 border-t border-border mt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Registrar Pago
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
