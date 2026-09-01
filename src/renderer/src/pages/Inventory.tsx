import { useState, useMemo } from 'react';
import { DataView } from '../components/patterns/DataView';
import { KpiCard } from '../components/patterns/KpiCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { ProductFormModal, ProductFormData } from '../components/inventory/ProductFormModal';
import { VatReviewModal } from '../components/inventory/VatReviewModal';
import { InventoryAdjustmentModal } from '../components/inventory/InventoryAdjustmentModal';
import { KardexDrawer } from '../components/inventory/KardexDrawer';
import { CsvImportModal } from '../components/inventory/CsvImportModal';
import {
  UndefinedTaxProduct,
  InventoryAdjustmentParams,
  KardexEntry
} from '../../../core/inventory';

interface CatalogItem {
  id: number;
  variantId: number;
  name: string;
  sku: string;
  barcode: string | null;
  priceCents: bigint;
  costMicros: bigint;
  stockMilli: bigint;
  minStockMilli: bigint;
  taxStatus: 'IVA15' | 'EXENTO' | 'SIN_DEFINIR';
}

const INITIAL_CATALOG: CatalogItem[] = [
  {
    id: 1,
    variantId: 1,
    name: 'Coca-Cola 600ml',
    sku: 'BEB-COC-600',
    barcode: '7411001001',
    priceCents: 3000n,
    costMicros: 20_000_000n,
    stockMilli: 50_000n,
    minStockMilli: 10_000n,
    taxStatus: 'IVA15'
  },
  {
    id: 2,
    variantId: 2,
    name: 'Arroz Faisán 1lb',
    sku: 'GRA-ARR-001',
    barcode: '7411002002',
    priceCents: 2000n,
    costMicros: 15_000_000n,
    stockMilli: 100_000n,
    minStockMilli: 20_000n,
    taxStatus: 'EXENTO'
  },
  {
    id: 3,
    variantId: 3,
    name: 'Aceite Corona 1L',
    sku: 'ACE-COR-001',
    barcode: '7411003003',
    priceCents: 6500n,
    costMicros: 45_000_000n,
    stockMilli: 5_000n,
    minStockMilli: 10_000n,
    taxStatus: 'SIN_DEFINIR'
  },
  {
    id: 4,
    variantId: 4,
    name: 'Camisa Oxford Blanca (M)',
    sku: 'CAM-OXF-M-BLANCO',
    barcode: '7411004004',
    priceCents: 45000n,
    costMicros: 280_000_000n,
    stockMilli: 12_000n,
    minStockMilli: 5_000n,
    taxStatus: 'IVA15'
  }
];

export function Inventory() {
  const { success, info } = useToast();
  const [catalog, setCatalog] = useState<CatalogItem[]>(INITIAL_CATALOG);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isVatModalOpen, setIsVatModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isKardexOpen, setIsKardexOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);

  // Lista de productos sin IVA definido
  const undefinedVatProducts: UndefinedTaxProduct[] = useMemo(() => {
    return catalog
      .filter((c) => c.taxStatus === 'SIN_DEFINIR')
      .map((c) => ({
        id: c.id,
        name: c.name,
        sku: c.sku,
        priceCents: c.priceCents,
        createdAt: new Date().toISOString()
      }));
  }, [catalog]);

  // Filtrado de catálogo
  const filteredCatalog = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return catalog;
    return catalog.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.barcode && item.barcode.includes(q))
    );
  }, [catalog, searchQuery]);

  // KPIs
  const totalItems = catalog.length;
  const totalStockUnits = catalog.reduce((acc, c) => acc + Number(c.stockMilli) / 1000, 0);
  const totalInventoryValueCents = catalog.reduce((acc, c) => {
    const costCents = (c.costMicros * c.stockMilli) / 10_000_000n;
    return acc + costCents;
  }, 0n);
  const lowStockCount = catalog.filter((c) => c.stockMilli <= c.minStockMilli).length;

  const handleSaveProduct = (data: ProductFormData) => {
    const newItem: CatalogItem = {
      id: Date.now(),
      variantId: Date.now() + 1,
      name: data.name,
      sku: data.sku,
      barcode: data.barcode || null,
      priceCents: data.priceCents,
      costMicros: data.costMicros,
      stockMilli: 0n,
      minStockMilli: 5_000n,
      taxStatus: 'SIN_DEFINIR'
    };

    setCatalog((prev) => [newItem, ...prev]);
    success('Producto registrado', newItem.sku);
  };

  const handleApplyVat = (productIds: number[], taxRateId: number) => {
    const newStatus: 'IVA15' | 'EXENTO' = taxRateId === 1 ? 'IVA15' : 'EXENTO';
    setCatalog((prev) =>
      prev.map((item) => (productIds.includes(item.id) ? { ...item, taxStatus: newStatus } : item))
    );
    success(`Estatus de IVA actualizado para ${productIds.length} productos`);
  };

  const handleSaveAdjustment = (params: InventoryAdjustmentParams) => {
    setCatalog((prev) =>
      prev.map((item) => {
        if (item.variantId === params.variantId) {
          const delta = params.direction === 'in' ? params.qtyMilli : -params.qtyMilli;
          const nextStock = item.stockMilli + delta;
          return { ...item, stockMilli: nextStock > 0n ? nextStock : 0n };
        }
        return item;
      })
    );
    success('Ajuste registrado en Kardex');
  };

  const mockKardexEntries: KardexEntry[] = selectedItem
    ? [
        {
          id: 1,
          at: new Date().toISOString(),
          warehouseId: 1,
          variantId: selectedItem.variantId,
          direction: 'in',
          qtyMilli: selectedItem.stockMilli,
          unitCostMicros: selectedItem.costMicros,
          totalCostCents: (selectedItem.costMicros * selectedItem.stockMilli) / 10_000_000n,
          balanceQtyMilli: selectedItem.stockMilli,
          balanceAvgCostMicros: selectedItem.costMicros,
          reason: 'initial',
          userId: 1,
          note: 'Inventario inicial'
        }
      ]
    : [];

  const tableViewNode = (
    <div className="overflow-x-auto border border-border rounded-xl bg-surface shadow-xs">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-surface-2 border-b border-border text-xs text-text-2">
          <tr>
            <th className="py-3 px-4 font-medium">Producto</th>
            <th className="py-3 px-4 font-medium">Código de Barras</th>
            <th className="py-3 px-4 font-medium text-right">Precio (C$)</th>
            <th className="py-3 px-4 font-medium text-right">Existencia</th>
            <th className="py-3 px-4 font-medium text-center">Estatus IVA</th>
            <th className="py-3 px-4 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filteredCatalog.map((item) => {
            const isLow = item.stockMilli <= item.minStockMilli;
            return (
              <tr key={item.id} className="hover:bg-surface-2 transition-colors">
                <td className="py-3 px-4">
                  <div className="font-semibold text-text-1">{item.name}</div>
                  <div className="text-[11px] font-mono text-text-3">{item.sku}</div>
                </td>
                <td className="py-3 px-4 font-mono text-xs text-text-3">{item.barcode || '—'}</td>
                <td className="py-3 px-4 font-mono tabular-nums text-right font-semibold text-text-1">
                  C$ {(Number(item.priceCents) / 100).toFixed(2)}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className={isLow ? 'text-danger font-bold' : 'text-text-1'}>
                      {(Number(item.stockMilli) / 1000).toFixed(0)}
                    </span>
                    {isLow && <Badge variant="danger">Bajo</Badge>}
                  </div>
                </td>
                <td className="py-3 px-4 text-center">
                  {item.taxStatus === 'IVA15' ? (
                    <Badge variant="info">IVA 15%</Badge>
                  ) : item.taxStatus === 'EXENTO' ? (
                    <Badge variant="success">Exento</Badge>
                  ) : (
                    <Badge variant="warning">Sin Definir</Badge>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedItem(item);
                        setIsAdjustmentModalOpen(true);
                      }}
                    >
                      Ajustar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedItem(item);
                        setIsKardexOpen(true);
                      }}
                    >
                      Kardex
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const gridViewNode = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {filteredCatalog.map((item) => (
        <div
          key={item.id}
          className="p-4 bg-surface border border-border rounded-xl flex flex-col justify-between hover:border-accent transition-all shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-text-3">{item.sku}</span>
              {item.taxStatus === 'SIN_DEFINIR' ? (
                <Badge variant="warning">Sin IVA</Badge>
              ) : (
                <Badge variant="neutral">{item.taxStatus}</Badge>
              )}
            </div>
            <h4 className="font-semibold text-sm text-text-1 mt-1.5">{item.name}</h4>
          </div>

          <div className="pt-3 border-t border-border mt-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-text-3">Precio:</div>
              <div className="text-base font-bold font-mono tabular-nums text-text-1">
                C$ {(Number(item.priceCents) / 100).toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-text-3">Stock:</div>
              <div
                className={`text-base font-bold font-mono tabular-nums ${
                  item.stockMilli <= item.minStockMilli ? 'text-danger' : 'text-text-1'
                }`}
              >
                {(Number(item.stockMilli) / 1000).toFixed(0)} u
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Acciones y KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          title="Total Artículos"
          value={totalItems.toString()}
          subValue={`${totalStockUnits} unidades físicas`}
        />
        <KpiCard
          title="Valor del Inventario"
          value={`C$ ${(Number(totalInventoryValueCents) / 100).toFixed(2)}`}
          subValue="A costo promedio ponderado"
        />
        <KpiCard
          title="Bajo Mínimo"
          value={lowStockCount.toString()}
          subValue={lowStockCount > 0 ? 'Requiere reabastecimiento' : 'Existencias saludables'}
        />
        <KpiCard
          title="Sin IVA Definido"
          value={undefinedVatProducts.length.toString()}
          subValue={undefinedVatProducts.length > 0 ? 'Bloquea ventas generales' : 'Catálogo 100% validado'}
        />
      </div>

      {/* Barra de Herramientas */}
      <div className="flex items-center justify-between bg-surface p-3 border border-border rounded-xl shadow-xs">
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setIsProductModalOpen(true)}>
            + Nuevo Producto
          </Button>
          <Button
            variant={undefinedVatProducts.length > 0 ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setIsVatModalOpen(true)}
            rightIcon={
              undefinedVatProducts.length > 0 ? (
                <Badge variant="warning">{undefinedVatProducts.length}</Badge>
              ) : undefined
            }
          >
            Revisión de IVA
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsCsvModalOpen(true)}>
            Importar CSV
          </Button>
        </div>

        <div className="text-xs text-text-3">
          Catálogo activo: <span className="font-semibold text-text-1">Almacén Central</span>
        </div>
      </div>

      {/* Vista Híbrida de Catálogo (Tabla / Retícula) */}
      <DataView
        searchPlaceholder="Buscar por nombre, SKU o código de barras..."
        onSearch={setSearchQuery}
        tableView={tableViewNode}
        gridView={gridViewNode}
      />

      {/* Modales */}
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSave={handleSaveProduct}
      />

      <VatReviewModal
        isOpen={isVatModalOpen}
        onClose={() => setIsVatModalOpen(false)}
        products={undefinedVatProducts}
        onApplyVat={handleApplyVat}
      />

      <InventoryAdjustmentModal
        isOpen={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
        variantId={selectedItem?.variantId}
        productName={selectedItem?.name}
        onSave={handleSaveAdjustment}
      />

      <KardexDrawer
        isOpen={isKardexOpen}
        onClose={() => setIsKardexOpen(false)}
        productName={selectedItem?.name ?? ''}
        sku={selectedItem?.sku ?? ''}
        entries={mockKardexEntries}
      />

      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImport={(_content) => {
          info('Archivo CSV importado');
          return { ok: true, count: 1 };
        }}
      />
    </div>
  );
}
