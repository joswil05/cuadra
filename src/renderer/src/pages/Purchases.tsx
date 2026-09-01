import { useState, useMemo } from 'react';
import { DataView } from '../components/patterns/DataView';
import { KpiCard } from '../components/patterns/KpiCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { PurchaseOrderModal } from '../components/purchases/PurchaseOrderModal';
import { SupplierModal, SupplierFormData } from '../components/purchases/SupplierModal';
import { SupplierPaymentModal } from '../components/purchases/SupplierPaymentModal';
import { PurchaseDetailDrawer } from '../components/purchases/PurchaseDetailDrawer';
import {
  SupplierItem,
  PurchaseSummary,
  CreatePurchaseParams,
  PaySupplierParams
} from '../../../core/purchases';

const INITIAL_SUPPLIERS: SupplierItem[] = [
  {
    id: 1,
    uid: 'supp-1',
    name: 'Distribuidora La Famosa, S.A.',
    docNumber: 'J0310000111111',
    phone: '+505 2270-1111',
    email: 'ventas@lafamosa.com.ni',
    address: 'Carretera Norte Km 5.5, Managua',
    creditDays: 30
  },
  {
    id: 2,
    uid: 'supp-2',
    name: 'Compañía Cervecera de Nicaragua',
    docNumber: 'J0310000222222',
    phone: '+505 2249-0000',
    email: 'pedidos@ccn.com.ni',
    address: 'Carretera Norte Km 6.5, Managua',
    creditDays: 15
  }
];

const INITIAL_PURCHASES: PurchaseSummary[] = [
  {
    id: 1,
    uid: 'purch-1',
    folio: 'OC-000101',
    supplierId: 1,
    supplierName: 'Distribuidora La Famosa, S.A.',
    warehouseId: 1,
    at: '2026-08-31T14:00:00.000Z',
    status: 'received',
    supplierDoc: 'FAC-88991',
    subtotalCents: 450000n,
    taxCents: 67500n,
    freightCents: 35000n,
    totalCents: 552500n,
    paidCents: 552500n,
    receivedAt: '2026-08-31T14:30:00.000Z',
    note: 'Recepción completa con flete prorrateado'
  },
  {
    id: 2,
    uid: 'purch-2',
    folio: 'OC-000102',
    supplierId: 2,
    supplierName: 'Compañía Cervecera de Nicaragua',
    warehouseId: 1,
    at: '2026-08-31T16:00:00.000Z',
    status: 'draft',
    supplierDoc: 'FAC-99221',
    subtotalCents: 120000n,
    taxCents: 18000n,
    freightCents: 10000n,
    totalCents: 148000n,
    paidCents: 0n,
    receivedAt: null,
    note: 'Pendiente de descarga en bodega'
  }
];

export function Purchases() {
  const { success } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierItem[]>(INITIAL_SUPPLIERS);
  const [purchases, setPurchases] = useState<PurchaseSummary[]>(INITIAL_PURCHASES);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseSummary | null>(null);

  // Filtrado de compras
  const filteredPurchases = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return purchases;
    return purchases.filter(
      (p) =>
        p.folio.toLowerCase().includes(q) ||
        (p.supplierName && p.supplierName.toLowerCase().includes(q)) ||
        (p.supplierDoc && p.supplierDoc.toLowerCase().includes(q))
    );
  }, [purchases, searchQuery]);

  // KPIs
  const totalPurchasesCents = purchases.reduce((acc, p) => acc + p.totalCents, 0n);
  const totalPendingPayCents = purchases.reduce((acc, p) => acc + (p.totalCents - p.paidCents), 0n);
  const pendingOrdersCount = purchases.filter((p) => p.status === 'draft').length;

  const handleSaveSupplier = (data: SupplierFormData) => {
    const newSupp: SupplierItem = {
      id: Date.now(),
      uid: `supp-${Date.now()}`,
      name: data.name,
      docNumber: data.docNumber || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      creditDays: data.creditDays
    };
    setSuppliers((prev) => [...prev, newSupp]);
    success('Proveedor registrado', newSupp.name);
  };

  const handleSavePurchase = (params: CreatePurchaseParams) => {
    const supp = suppliers.find((s) => s.id === params.supplierId);
    const subtotal = params.lines.reduce((acc: bigint, l) => acc + (l.qtyMilli * l.unitCostCents) / 1000n, 0n);
    const freight = params.freightCents ?? 0n;
    const tax = params.lines.reduce((acc: bigint, l) => {
      const lineBase = (l.qtyMilli * l.unitCostCents) / 1000n;
      const rate = l.taxRateBp ?? 0n;
      return acc + (lineBase * rate) / 10000n;
    }, 0n);
    const total = subtotal + tax + freight;

    const newPurch: PurchaseSummary = {
      id: Date.now(),
      uid: `purch-${Date.now()}`,
      folio: `OC-${String(Date.now()).slice(-6)}`,
      supplierId: params.supplierId,
      supplierName: supp?.name ?? 'Proveedor',
      warehouseId: params.warehouseId,
      at: new Date().toISOString(),
      status: 'draft',
      supplierDoc: params.supplierDoc || null,
      subtotalCents: subtotal,
      taxCents: tax,
      freightCents: freight,
      totalCents: total,
      paidCents: 0n,
      receivedAt: null,
      note: params.note || null
    };

    setPurchases((prev) => [newPurch, ...prev]);
    success('Orden de compra creada', newPurch.folio);
  };

  const handleReceivePurchase = (purchaseId: number) => {
    setPurchases((prev) =>
      prev.map((p) => (p.id === purchaseId ? { ...p, status: 'received', receivedAt: new Date().toISOString() } : p))
    );
    success('Mercancía recibida en Kardex y CPP actualizado');
  };

  const handleCancelReception = (purchaseId: number) => {
    setPurchases((prev) =>
      prev.map((p) => (p.id === purchaseId ? { ...p, status: 'cancelled' } : p))
    );
    success('Recepción cancelada con movimiento inverso de Kardex');
  };

  const handleSavePayment = (params: PaySupplierParams) => {
    setPurchases((prev) =>
      prev.map((p) => {
        if (p.id === params.purchaseId) {
          return { ...p, paidCents: p.paidCents + params.amountCents };
        }
        return p;
      })
    );
    success('Pago a proveedor registrado');
  };

  const tableViewNode = (
    <div className="overflow-x-auto border border-border rounded-xl bg-surface shadow-xs">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-surface-2 border-b border-border text-xs text-text-2">
          <tr>
            <th className="py-3 px-4 font-medium">Folio OC</th>
            <th className="py-3 px-4 font-medium">Proveedor</th>
            <th className="py-3 px-4 font-medium">No. Factura Prov.</th>
            <th className="py-3 px-4 font-medium text-right">Flete (C$)</th>
            <th className="py-3 px-4 font-medium text-right">Total (C$)</th>
            <th className="py-3 px-4 font-medium text-center">Estado</th>
            <th className="py-3 px-4 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filteredPurchases.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2 transition-colors">
              <td className="py-3 px-4 font-mono font-bold text-text-1">{p.folio}</td>
              <td className="py-3 px-4 font-medium text-text-1">{p.supplierName}</td>
              <td className="py-3 px-4 font-mono text-xs text-text-3">{p.supplierDoc || '—'}</td>
              <td className="py-3 px-4 text-right font-mono text-accent">
                C$ {(Number(p.freightCents) / 100).toFixed(2)}
              </td>
              <td className="py-3 px-4 text-right font-mono font-bold text-text-1">
                C$ {(Number(p.totalCents) / 100).toFixed(2)}
              </td>
              <td className="py-3 px-4 text-center">
                <Badge
                  variant={
                    p.status === 'received'
                      ? 'success'
                      : p.status === 'cancelled'
                      ? 'danger'
                      : 'warning'
                  }
                >
                  {p.status.toUpperCase()}
                </Badge>
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedPurchase(p);
                    }}
                  >
                    Ver Detalle
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const gridViewNode = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {filteredPurchases.map((p) => (
        <div
          key={p.id}
          className="p-4 bg-surface border border-border rounded-xl flex flex-col justify-between hover:border-accent transition-all shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-bold text-text-1">{p.folio}</span>
              <Badge
                variant={
                  p.status === 'received'
                    ? 'success'
                    : p.status === 'cancelled'
                    ? 'danger'
                    : 'warning'
                }
              >
                {p.status.toUpperCase()}
              </Badge>
            </div>
            <h4 className="font-semibold text-sm text-text-1 mt-1.5">{p.supplierName}</h4>
            <div className="text-xs text-text-3 mt-1">
              Doc: {p.supplierDoc || 'Sin factura'}
            </div>
          </div>

          <div className="pt-3 border-t border-border mt-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-text-3">Total:</div>
              <div className="text-base font-bold font-mono tabular-nums text-text-1">
                C$ {(Number(p.totalCents) / 100).toFixed(2)}
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedPurchase(p)}
            >
              Detalle
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          title="Compras Registradas"
          value={purchases.length.toString()}
          subValue={`${purchases.filter((p) => p.status === 'received').length} recibidas`}
        />
        <KpiCard
          title="Total Compras"
          value={`C$ ${(Number(totalPurchasesCents) / 100).toFixed(2)}`}
          subValue="Monto acumulado"
        />
        <KpiCard
          title="Cuentas por Pagar"
          value={`C$ ${(Number(totalPendingPayCents) / 100).toFixed(2)}`}
          subValue={totalPendingPayCents > 0n ? 'Saldo pendiente a proveedores' : 'Al día'}
        />
        <KpiCard
          title="Órdenes Pendientes"
          value={pendingOrdersCount.toString()}
          subValue={pendingOrdersCount > 0 ? 'Por recibir en almacén' : 'Sin órdenes pendientes'}
        />
      </div>

      {/* Barra de Herramientas */}
      <div className="flex items-center justify-between bg-surface p-3 border border-border rounded-xl shadow-xs">
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setIsPurchaseModalOpen(true)}>
            + Nueva Orden de Compra
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsSupplierModalOpen(true)}>
            + Registrar Proveedor
          </Button>
        </div>

        <div className="text-xs text-text-3">
          Proveedores activos: <span className="font-semibold text-text-1">{suppliers.length}</span>
        </div>
      </div>

      {/* DataView */}
      <DataView
        searchPlaceholder="Buscar por folio, proveedor o factura..."
        onSearch={setSearchQuery}
        tableView={tableViewNode}
        gridView={gridViewNode}
      />

      {/* Modales */}
      <PurchaseOrderModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        suppliers={suppliers}
        onSave={handleSavePurchase}
      />

      <SupplierModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        onSave={handleSaveSupplier}
      />

      <SupplierPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        supplierId={selectedPurchase?.supplierId ?? 1}
        supplierName={selectedPurchase?.supplierName ?? 'Proveedor'}
        purchaseId={selectedPurchase?.id}
        totalPendingCents={selectedPurchase ? selectedPurchase.totalCents - selectedPurchase.paidCents : 0n}
        onSave={handleSavePayment}
      />

      <PurchaseDetailDrawer
        isOpen={Boolean(selectedPurchase)}
        onClose={() => setSelectedPurchase(null)}
        purchase={selectedPurchase}
        onReceive={handleReceivePurchase}
        onCancelReception={handleCancelReception}
        onOpenPayment={(p) => {
          setSelectedPurchase(p);
          setIsPaymentModalOpen(true);
        }}
      />
    </div>
  );
}
