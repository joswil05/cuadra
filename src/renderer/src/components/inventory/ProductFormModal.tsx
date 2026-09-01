import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { VariantAxisInput } from '../../../../core/inventory';

export interface ProductFormData {
  name: string;
  sku: string;
  unitId: number;
  priceCents: bigint;
  costMicros: bigint;
  barcode?: string;
  hasVariants: boolean;
  axes: VariantAxisInput[];
}

export interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ProductFormData) => void;
}

export function ProductFormModal({ isOpen, onClose, onSave }: ProductFormModalProps) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unitId] = useState(1);
  const [priceStr, setPriceStr] = useState('');
  const [costStr, setCostStr] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hasVariants, setHasVariants] = useState(false);
  const [axis1Name, setAxis1Name] = useState('Talla');
  const [axis1Values, setAxis1Values] = useState('S, M, L, XL');
  const [axis2Name, setAxis2Name] = useState('Color');
  const [axis2Values, setAxis2Values] = useState('Azul, Negro');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !sku) return;

    const priceCents = priceStr ? BigInt(Math.round(parseFloat(priceStr) * 100)) : 0n;
    const costMicros = costStr ? BigInt(Math.round(parseFloat(costStr) * 1_000_000)) : 0n;

    const axes: VariantAxisInput[] = [];
    if (hasVariants) {
      if (axis1Name && axis1Values) {
        axes.push({ name: axis1Name, values: axis1Values.split(',').map((v) => v.trim()).filter(Boolean) });
      }
      if (axis2Name && axis2Values) {
        axes.push({ name: axis2Name, values: axis2Values.split(',').map((v) => v.trim()).filter(Boolean) });
      }
    }

    onSave({
      name,
      sku: sku.toUpperCase(),
      unitId,
      priceCents,
      costMicros,
      barcode: barcode || undefined,
      hasVariants,
      axes
    });

    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Producto / Artículo"
      description="Complete la información base del producto. Puede generar variantes por tallas o colores."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Nombre del Producto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej. Camisa Oxford Manga Larga"
            required
          />
          <Input
            label="SKU Base"
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            placeholder="ej. CAM-OXF"
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Precio de Venta (C$)"
            type="number"
            step="0.01"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            placeholder="0.00"
            required
          />
          <Input
            label="Costo Estimado (C$)"
            type="number"
            step="0.01"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            placeholder="0.00"
          />
          <Select
            label="Unidad de Medida"
            options={[
              { value: '1', label: 'PZA — Pieza' },
              { value: '2', label: 'LB — Libra' },
              { value: '3', label: 'KG — Kilogramo' }
            ]}
          />
        </div>

        {!hasVariants && (
          <Input
            label="Código de Barras Principal"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Escanear o escribir código de barras"
          />
        )}

        {/* Variantes por Ejes */}
        <div className="p-3 bg-surface-2 rounded-lg border border-border flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-text-1 select-none">
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => setHasVariants(e.target.checked)}
              className="rounded border-border"
            />
            <span>Generar múltiples variantes por ejes (Ropa, Calzado, Presentaciones)</span>
          </label>

          {hasVariants && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
              <div className="flex flex-col gap-1.5">
                <Input
                  label="Eje 1 (Nombre)"
                  value={axis1Name}
                  onChange={(e) => setAxis1Name(e.target.value)}
                  placeholder="ej. Talla"
                />
                <Input
                  label="Valores (separados por coma)"
                  value={axis1Values}
                  onChange={(e) => setAxis1Values(e.target.value)}
                  placeholder="S, M, L, XL"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Input
                  label="Eje 2 (Nombre)"
                  value={axis2Name}
                  onChange={(e) => setAxis2Name(e.target.value)}
                  placeholder="ej. Color"
                />
                <Input
                  label="Valores (separados por coma)"
                  value={axis2Values}
                  onChange={(e) => setAxis2Values(e.target.value)}
                  placeholder="Azul, Blanco, Negro"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Guardar Producto
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
