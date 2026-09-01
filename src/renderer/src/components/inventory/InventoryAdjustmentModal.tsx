import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { InventoryAdjustmentParams } from '../../../../core/inventory';

export interface InventoryAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  variantId?: number;
  productName?: string;
  onSave: (params: InventoryAdjustmentParams) => void;
}

export function InventoryAdjustmentModal({
  isOpen,
  onClose,
  variantId = 1,
  productName = 'Artículo Seleccionado',
  onSave
}: InventoryAdjustmentModalProps) {
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [qtyStr, setQtyStr] = useState('1');
  const [reason, setReason] = useState<'adjustment_in' | 'adjustment_out' | 'count' | 'waste'>('adjustment_in');
  const [note, setNote] = useState('');
  const [costStr, setCostStr] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qtyStr || !note.trim()) return;

    const qtyMilli = BigInt(Math.round(parseFloat(qtyStr) * 1000));
    const unitCostMicros = costStr ? BigInt(Math.round(parseFloat(costStr) * 1_000_000)) : 0n;

    onSave({
      warehouseId: 1,
      variantId,
      direction,
      qtyMilli,
      unitCostMicros,
      reason,
      userId: 1,
      note: note.trim()
    });

    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Ajuste Manual de Inventario (Kardex)"
      description={`Artículo: ${productName}. Todo ajuste genera un movimiento inmutable en Kardex con auditoría de usuario.`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo de Movimiento"
            value={direction}
            onChange={(e) => {
              const dir = e.target.value as 'in' | 'out';
              setDirection(dir);
              setReason(dir === 'in' ? 'adjustment_in' : 'adjustment_out');
            }}
            options={[
              { value: 'in', label: 'Entrada (+) — Aumento de stock' },
              { value: 'out', label: 'Salida (-) — Disminución de stock' }
            ]}
          />

          <Select
            label="Motivo Fiscal / Operativo"
            value={reason}
            onChange={(e) => setReason(e.target.value as 'adjustment_in' | 'adjustment_out' | 'count' | 'waste')}
            options={
              direction === 'in'
                ? [
                    { value: 'adjustment_in', label: 'Ajuste de entrada' },
                    { value: 'count', label: 'Conteo físico favorable' }
                  ]
                : [
                    { value: 'adjustment_out', label: 'Ajuste de salida' },
                    { value: 'waste', label: 'Merma / Daño' },
                    { value: 'count', label: 'Conteo físico faltante' }
                  ]
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Cantidad a Ajustar (Unidades)"
            type="number"
            step="0.001"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            placeholder="1.000"
            required
          />

          {direction === 'in' ? (
            <Input
              label="Costo Unitario (C$)"
              type="number"
              step="0.01"
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              placeholder="Costo vigente"
            />
          ) : (
            <div className="flex flex-col justify-end text-xs text-text-3 pb-2">
              <span>* Las salidas consumen el CPP vigente automáticamente.</span>
            </div>
          )}
        </div>

        <Input
          label="Motivo / Justificación Obligatoria"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ej. Ajuste por rotura durante descarga de tarima"
          required
        />

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Registrar Ajuste en Kardex
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
