import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

export interface CustomerPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: number;
  customerName: string;
  currentBalanceCents: bigint;
  onSave: (params: {
    customerId: number;
    amountCents: bigint;
    method: 'cash' | 'card' | 'transfer' | 'check';
    note?: string;
  }) => void;
}

export function CustomerPaymentModal({
  isOpen,
  onClose,
  customerId,
  customerName,
  currentBalanceCents,
  onSave
}: CustomerPaymentModalProps) {
  const [amountStr, setAmountStr] = useState(
    currentBalanceCents > 0n ? (Number(currentBalanceCents) / 100).toFixed(2) : ''
  );
  const [method, setMethod] = useState<'cash' | 'transfer' | 'card' | 'check'>('cash');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountStr) return;

    const amountCents = BigInt(Math.round(parseFloat(amountStr) * 100));

    onSave({
      customerId,
      amountCents,
      method,
      note: note.trim() || undefined
    });

    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Abono a Cuenta Corriente"
      description={`Cliente: ${customerName}. Saldo pendiente actual: C$ ${(Number(currentBalanceCents) / 100).toFixed(2)}.`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Monto del Abono (C$)"
          type="number"
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="0.00"
          required
        />

        <Select
          label="Forma de Pago"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer' | 'card' | 'check')}
          options={[
            { value: 'cash', label: 'Efectivo (Ingreso directo a caja de turno)' },
            { value: 'transfer', label: 'Transferencia Bancaria' },
            { value: 'card', label: 'Tarjeta de Débito / Crédito' },
            { value: 'check', label: 'Cheque' }
          ]}
        />

        <Input
          label="Referencia / No. de Recibo / Nota"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ej. Recibo No. 04512 / Transferencia BAC"
        />

        <div className="flex justify-end gap-2 pt-3 border-t border-border mt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Registrar Abono
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
