import { useState, useMemo } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { prorateFreightToLines, CreatePurchaseParams, SupplierItem } from '../../../../core/purchases';

export interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: SupplierItem[];
  onSave: (params: CreatePurchaseParams) => void;
}

interface TempLine {
  lineNo: number;
  variantId: number;
  description: string;
  sku: string;
  qtyStr: string;
  costStr: string;
  taxRateBp: bigint;
  lotCode?: string;
  expiresOn?: string;
}

export function PurchaseOrderModal({
  isOpen,
  onClose,
  suppliers,
  onSave
}: PurchaseOrderModalProps) {
  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id.toString() || '1');
  const [supplierDoc, setSupplierDoc] = useState('');
  const [freightStr, setFreightStr] = useState('');
  const [note, setNote] = useState('');

  const [lines, setLines] = useState<TempLine[]>([
    {
      lineNo: 1,
      variantId: 1,
      description: 'Coca-Cola 600ml',
      sku: 'BEB-COC-600',
      qtyStr: '100',
      costStr: '22.00',
      taxRateBp: 1500n,
      lotCode: 'LOTE-2026-01',
      expiresOn: '2027-12-31'
    }
  ]);

  const freightCents = freightStr ? BigInt(Math.round(parseFloat(freightStr) * 100)) : 0n;

  // Prorrateo en tiempo real
  const prorated = useMemo(() => {
    const inputLines = lines.map((l) => ({
      lineNo: l.lineNo,
      variantId: l.variantId,
      qtyMilli: BigInt(Math.round(parseFloat(l.qtyStr || '0') * 1000)),
      unitCostCents: BigInt(Math.round(parseFloat(l.costStr || '0') * 100)),
      taxRateBp: l.taxRateBp,
      lotCode: l.lotCode,
      expiresOn: l.expiresOn
    }));
    return prorateFreightToLines(inputLines, freightCents);
  }, [lines, freightCents]);

  const subtotalCents = prorated.reduce((acc, l) => acc + l.baseTotalCents, 0n);
  const taxCents = prorated.reduce((acc, l) => acc + l.taxCents, 0n);
  const totalCents = subtotalCents + taxCents + freightCents;

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        lineNo: prev.length + 1,
        variantId: Date.now(),
        description: 'Nuevo Artículo',
        sku: `SKU-${prev.length + 1}`,
        qtyStr: '10',
        costStr: '15.00',
        taxRateBp: 1500n
      }
    ]);
  };

  const handleRemoveLine = (lineNo: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.lineNo !== lineNo).map((l, idx) => ({ ...l, lineNo: idx + 1 })));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) return;

    onSave({
      supplierId: parseInt(supplierId, 10),
      warehouseId: 1,
      supplierDoc: supplierDoc.trim() || undefined,
      freightCents,
      lines: lines.map((l) => ({
        lineNo: l.lineNo,
        variantId: l.variantId,
        qtyMilli: BigInt(Math.round(parseFloat(l.qtyStr) * 1000)),
        unitCostCents: BigInt(Math.round(parseFloat(l.costStr) * 100)),
        taxRateBp: l.taxRateBp,
        lotCode: l.lotCode || undefined,
        expiresOn: l.expiresOn || undefined
      })),
      userId: 1,
      note: note.trim() || undefined
    });

    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Nueva Orden de Compra y Recepción"
      description="El flete y gastos se prorratean automáticamente al costo unitario (Landed Cost) antes de tocar el Kardex."
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Cabecera */}
        <div className="grid grid-cols-3 gap-3">
          <Select
            label="Proveedor"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            options={suppliers.map((s) => ({ value: s.id.toString(), label: s.name }))}
            required
          />
          <Input
            label="No. Factura Proveedor"
            value={supplierDoc}
            onChange={(e) => setSupplierDoc(e.target.value)}
            placeholder="ej. FAC-12345"
          />
          <Input
            label="Flete / Gastos de Envío (C$)"
            type="number"
            step="0.01"
            value={freightStr}
            onChange={(e) => setFreightStr(e.target.value)}
            placeholder="0.00"
          />
        </div>

        {/* Tabla de Líneas */}
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          <div className="flex items-center justify-between p-2.5 bg-surface-2 border-b border-border text-xs font-semibold text-text-2">
            <span>Artículos a Comprar</span>
            <Button type="button" size="sm" variant="secondary" onClick={handleAddLine}>
              + Agregar Línea
            </Button>
          </div>

          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-surface-2 border-b border-border text-text-3">
                <tr>
                  <th className="py-2 px-2">#</th>
                  <th className="py-2 px-2">Artículo</th>
                  <th className="py-2 px-2 w-20 text-right">Cant.</th>
                  <th className="py-2 px-2 w-24 text-right">Costo Unit.</th>
                  <th className="py-2 px-2 w-28 text-right">Costo Final (Landed)</th>
                  <th className="py-2 px-2 w-24 text-right">Total C$</th>
                  <th className="py-2 px-1 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line, idx) => {
                  const pLine = prorated[idx];
                  return (
                    <tr key={line.lineNo}>
                      <td className="py-2 px-2 text-text-3">{line.lineNo}</td>
                      <td className="py-2 px-2">
                        <div className="font-sans font-medium text-text-1">{line.description}</div>
                        <div className="text-[10px] text-text-3">{line.sku}</div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          value={line.qtyStr}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLines((prev) => prev.map((l) => (l.lineNo === line.lineNo ? { ...l, qtyStr: val } : l)));
                          }}
                          className="w-16 bg-surface border border-border rounded p-1 text-right tabular-nums text-text-1"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={line.costStr}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLines((prev) => prev.map((l) => (l.lineNo === line.lineNo ? { ...l, costStr: val } : l)));
                          }}
                          className="w-20 bg-surface border border-border rounded p-1 text-right tabular-nums text-text-1"
                        />
                      </td>
                      <td className="py-2 px-2 text-right text-accent font-bold tabular-nums">
                        C$ {(Number(pLine?.landedUnitCostMicros ?? 0n) / 1_000_000).toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-text-1 tabular-nums">
                        C$ {(Number(pLine?.totalCents ?? 0n) / 100).toFixed(2)}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.lineNo)}
                          className="text-text-3 hover:text-danger p-1"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resumen de Totales */}
        <div className="p-3 bg-surface-2 rounded-lg border border-border flex justify-between items-center text-xs font-mono">
          <div className="flex gap-4 text-text-2">
            <span>Subtotal: C$ {(Number(subtotalCents) / 100).toFixed(2)}</span>
            <span>IVA: C$ {(Number(taxCents) / 100).toFixed(2)}</span>
            <span>Flete: C$ {(Number(freightCents) / 100).toFixed(2)}</span>
          </div>
          <div className="text-base font-bold text-text-1">
            Total Orden: C$ {(Number(totalCents) / 100).toFixed(2)}
          </div>
        </div>

        <Input
          label="Notas u Observaciones"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ej. Mercancía recibida por transporte de carga"
        />

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Guardar Orden de Compra
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
