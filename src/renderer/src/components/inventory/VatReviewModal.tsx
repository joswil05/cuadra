import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { UndefinedTaxProduct } from '../../../../core/inventory';

export interface VatReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: UndefinedTaxProduct[];
  onApplyVat: (productIds: number[], taxRateId: number) => void;
}

export function VatReviewModal({
  isOpen,
  onClose,
  products,
  onApplyVat
}: VatReviewModalProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  const handleToggle = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleApply = (taxRateId: number) => {
    if (selectedIds.length === 0) return;
    onApplyVat(selectedIds, taxRateId);
    setSelectedIds([]);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Revisión Masiva de Estatus de IVA"
      description="Los productos nuevos nacen sin estatus fiscal definido. Valide el catálogo antes de la primera venta."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-text-3">
            {products.length === 0 ? (
              <Badge variant="success">Todo el catálogo tiene estatus de IVA validado</Badge>
            ) : (
              <span className="font-semibold text-warning">{products.length} productos pendientes de definición</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() => handleApply(2)}
            >
              Marcar como Exento ({selectedIds.length})
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() => handleApply(1)}
            >
              Marcar como IVA 15% ({selectedIds.length})
            </Button>
          </div>
        </div>
      }
    >
      {products.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-success/20 text-success flex items-center justify-center mb-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-text-1">Catálogo 100% Validado</h3>
          <p className="text-xs text-text-3 mt-1 max-w-sm">
            No hay productos sin estatus fiscal definido. Todas las ventas en régimen general están autorizadas.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-text-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === products.length && products.length > 0}
                onChange={handleToggleSelectAll}
                className="rounded border-border"
              />
              <span>Seleccionar todos ({products.length})</span>
            </label>
            <span className="text-xs text-text-3 font-mono">{selectedIds.length} seleccionados</span>
          </div>

          <div className="border border-border rounded-lg max-h-72 overflow-y-auto divide-y divide-border">
            {products.map((p) => {
              const isChecked = selectedIds.includes(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => handleToggle(p.id)}
                  className={`flex items-center justify-between p-2.5 text-xs cursor-pointer transition-colors ${
                    isChecked ? 'bg-accent-soft' : 'hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="rounded border-border"
                    />
                    <div>
                      <span className="font-semibold text-text-1">{p.name}</span>
                      <span className="ml-2 text-text-3 font-mono text-[11px]">{p.sku}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums text-text-1">
                      C$ {(Number(p.priceCents) / 100).toFixed(2)}
                    </span>
                    <Badge variant="warning">Sin definir</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Dialog>
  );
}
