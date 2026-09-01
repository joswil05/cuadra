import { useState, useMemo } from 'react';
import {
  PosCart,
  createPosCart,
  parseScanInput,
  addOrIncrementCartLine,
  calculatePosCartDocument,
  SuspendedCartItem
} from '../../../core/pos';
import { ReceiptData } from '../../../core/receipt';
import type { SalePaymentInput } from '../../../main/services/sales.service';
import { PosScannerInput } from '../components/pos/PosScannerInput';
import { PosCartTable } from '../components/pos/PosCartTable';
import { PosTenderPanel } from '../components/pos/PosTenderPanel';
import { PosPrintModal } from '../components/pos/PosPrintModal';
import { PosSuspendedModal } from '../components/pos/PosSuspendedModal';
import { useShortcuts } from '../hooks/useShortcuts';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Kbd } from '../components/ui/Kbd';
import { Badge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';

export function Pos() {
  const { success, error, info } = useToast();
  const [cart, setCart] = useState<PosCart>(() => createPosCart('pos-active'));
  const [selectedLineNo, setSelectedLineNo] = useState<number>(1);
  const [isTenderOpen, setIsTenderOpen] = useState(false);
  const [isSuspendedModalOpen, setIsSuspendedModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [printReceipt, setPrintReceipt] = useState<ReceiptData | null>(null);
  const [suspendedCarts, setSuspendedCarts] = useState<SuspendedCartItem[]>([]);

  // Documento calculado reactivamente de forma pura
  const saleDoc = useMemo(() => {
    return calculatePosCartDocument(cart, 'general', true, true);
  }, [cart]);

  // Manejo de escaneo
  const handleScan = (input: string) => {
    const parsed = parseScanInput(input);
    if (!parsed.ok) {
      error(parsed.error);
      return;
    }

    const mockProduct = {
      productId: 1,
      variantId: Date.now(),
      sku: parsed.code.toUpperCase(),
      name: `Artículo ${parsed.code.toUpperCase()}`,
      unitPriceCents: 3500n,
      taxKind: 'taxable' as const,
      taxRateBp: 1500n,
      stockMilli: 100_000n,
      tracksStock: true
    };

    const res = addOrIncrementCartLine(cart, mockProduct, parsed.multiplier, false);
    if (res.ok) {
      setCart(res.cart);
      setSelectedLineNo(res.addedLine.lineNo);
    } else {
      error(res.error);
    }
  };

  const handleUpdateQty = (lineNo: number, newQtyMilli: bigint) => {
    if (newQtyMilli <= 0n) {
      handleRemoveLine(lineNo);
      return;
    }

    setCart((prev) => {
      const line = prev.lines.find((l) => l.lineNo === lineNo);
      if (!line) return prev;
      const updatedLines = prev.lines.map((l) => (l.lineNo === lineNo ? { ...l, qtyMilli: newQtyMilli } : l));
      return { ...prev, lines: updatedLines };
    });
  };

  const handleRemoveLine = (lineNo: number) => {
    setCart((prev) => {
      const remaining = prev.lines.filter((l) => l.lineNo !== lineNo).map((l, idx) => ({ ...l, lineNo: idx + 1 }));
      return { ...prev, lines: remaining };
    });
  };

  // Atajos F1..F12
  useShortcuts({
    F1: () => setIsHelpOpen(true),
    F7: () => {
      if (cart.lines.length === 0) {
        error('No hay artículos para suspender');
        return;
      }
      const suspendedItem: SuspendedCartItem = {
        id: `susp-${Date.now()}`,
        at: new Date().toLocaleTimeString(),
        note: `Ticket con ${cart.lines.length} artículos`,
        totalCents: saleDoc.totalCents,
        itemCount: cart.lines.length,
        cart
      };
      setSuspendedCarts((prev) => [suspendedItem, ...prev]);
      setCart(createPosCart(`pos-${Date.now()}`));
      info('Ticket suspendido correctamente');
    },
    F8: () => setIsSuspendedModalOpen(true),
    F9: () => {
      if (selectedLineNo) {
        handleRemoveLine(selectedLineNo);
      }
    },
    F10: () => {
      info('Comando de apertura de cajón enviado');
    },
    F12: () => {
      if (cart.lines.length === 0) {
        error('Agregue artículos al carrito antes de cobrar');
        return;
      }
      setIsTenderOpen(true);
    },
    '+': () => {
      const line = cart.lines.find((l) => l.lineNo === selectedLineNo);
      if (line) handleUpdateQty(line.lineNo, line.qtyMilli + 1000n);
    },
    '-': () => {
      const line = cart.lines.find((l) => l.lineNo === selectedLineNo);
      if (line) handleUpdateQty(line.lineNo, line.qtyMilli - 1000n);
    },
    Escape: () => {
      if (isTenderOpen) setIsTenderOpen(false);
      else if (isSuspendedModalOpen) setIsSuspendedModalOpen(false);
      else if (isHelpOpen) setIsHelpOpen(false);
    }
  });

  const handleConfirmTender = (payments: SalePaymentInput[]) => {
    // Generar datos de factura DGI
    const receipt: ReceiptData = {
      companyName: 'Comercial La Bendición, S.A.',
      tradeName: 'Minisúper La Bendición',
      address: 'Costado Este de la Iglesia El Calvario, Managua',
      phone: '+505 2222-3333',
      ruc: 'J0310000123456',
      dgiAuthNumber: 'DGI-AUT-2026-987654',
      seriesPrefix: 'T-',
      folio: `T-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      at: new Date().toLocaleString(),
      docType: 'ticket',
      paymentCondition: 'contado',
      taxRegime: 'general',
      cashierName: 'Juan Pérez',
      customerName: cart.customerName ?? 'Cliente Mostrador',
      customerRuc: 'N/A',
      lines: cart.lines.map((l) => ({
        description: l.description,
        qtyMilli: l.qtyMilli,
        unitPriceCents: l.unitPriceCents,
        totalCents: (l.unitPriceCents * l.qtyMilli) / 1000n,
        taxKind: l.taxKind,
        taxRateBp: l.taxRateBp
      })),
      taxableBaseCents: saleDoc.taxableBaseCents,
      exemptBaseCents: saleDoc.exemptBaseCents,
      taxCents: saleDoc.taxCents,
      cashRoundingCents: saleDoc.cashRoundingCents,
      totalCents: saleDoc.totalCents,
      payments: payments.map((p) => {
        const pCents = p.amountCents ?? (p.currencyCode === 'USD' ? (p.amountFx * 36624300n) / 1000000n : p.amountFx);
        return {
          method: p.method,
          currencyCode: p.currencyCode,
          amountFx: p.amountFx,
          amountCents: pCents
        };
      }),
      changeCents: payments.reduce((acc, p) => acc + (p.amountCents ?? (p.currencyCode === 'USD' ? (p.amountFx * 36624300n) / 1000000n : p.amountFx)), 0n) > saleDoc.totalCents
        ? payments.reduce((acc, p) => acc + (p.amountCents ?? (p.currencyCode === 'USD' ? (p.amountFx * 36624300n) / 1000000n : p.amountFx)), 0n) - saleDoc.totalCents
        : 0n
    };

    setPrintReceipt(receipt);
    setIsTenderOpen(false);
    setCart(createPosCart(`pos-${Date.now()}`));
    success('Venta cobrada con éxito', receipt.folio);
  };

  const isAnyModalOpen = isTenderOpen || isSuspendedModalOpen || isHelpOpen || Boolean(printReceipt);

  return (
    <div className="flex h-[calc(100vh-80px)] w-full gap-4 overflow-hidden">
      {/* Columna Principal: Carrito y Escáner */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Barra superior de estado de venta */}
        <div className="flex items-center justify-between p-3 bg-surface border border-border rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-1">Serie Activa:</span>
            <Badge variant="neutral">T- (Ticket Mostrador)</Badge>
            <span className="text-xs text-text-3 ml-2">Cliente:</span>
            <span className="text-xs font-medium text-text-1">{cart.customerName || 'Cliente Contado (F3)'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setIsHelpOpen(true)}>
              Atajos <Kbd className="ml-1 text-[10px]">F1</Kbd>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setIsSuspendedModalOpen(true)}>
              Suspendidos <Kbd className="ml-1 text-[10px]">F8</Kbd>
            </Button>
          </div>
        </div>

        {/* Input Escáner */}
        <PosScannerInput onScan={handleScan} isModalOpen={isAnyModalOpen} />

        {/* Tabla del Carrito */}
        <PosCartTable
          cart={cart}
          onUpdateQty={handleUpdateQty}
          onRemoveLine={handleRemoveLine}
          onSelectLine={setSelectedLineNo}
          selectedLineNo={selectedLineNo}
        />

        {/* Barra inferior de atajos rápidos */}
        <div className="flex items-center justify-between p-2.5 bg-surface border border-border rounded-lg text-xs text-text-3 select-none">
          <div className="flex items-center gap-3">
            <span><Kbd>F7</Kbd> Suspender</span>
            <span><Kbd>F9</Kbd> Eliminar línea</span>
            <span><Kbd>+/-</Kbd> Cantidad</span>
            <span><Kbd>F10</Kbd> Cajón</span>
          </div>
          <div>
            <span className="font-semibold text-text-1 tabular-nums font-mono">
              {cart.lines.length} artículos en ticket
            </span>
          </div>
        </div>
      </div>

      {/* Cajón de Cobro Lateral Derecho */}
      <PosTenderPanel
        saleDoc={saleDoc}
        onConfirmTender={handleConfirmTender}
        onCancel={() => setIsTenderOpen(false)}
      />

      {/* Modal de Impresión */}
      <PosPrintModal
        isOpen={Boolean(printReceipt)}
        onClose={() => setPrintReceipt(null)}
        receiptData={printReceipt}
      />

      {/* Modal de Suspendidos */}
      <PosSuspendedModal
        isOpen={isSuspendedModalOpen}
        onClose={() => setIsSuspendedModalOpen(false)}
        items={suspendedCarts}
        onResume={(id) => {
          const item = suspendedCarts.find((c) => c.id === id);
          if (item) {
            setCart(item.cart);
            setSuspendedCarts((prev) => prev.filter((c) => c.id !== id));
            success('Ticket recuperado al carrito');
          }
        }}
      />

      {/* Modal de Ayuda y Atajos F1 */}
      <Dialog
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="Atajos de Teclado del Punto de Venta"
        description="Controles rápidos para operar sin ratón."
        maxWidth="md"
        footer={<Button size="sm" onClick={() => setIsHelpOpen(false)}>Entendido (Esc)</Button>}
      >
        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>F1</Kbd> <span>Ayuda y atajos</span></div>
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>F2</Kbd> <span>Buscar producto</span></div>
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>F3</Kbd> <span>Asignar cliente</span></div>
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>F4</Kbd> <span>Cambiar cantidad</span></div>
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>F7</Kbd> <span>Suspender ticket</span></div>
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>F8</Kbd> <span>Recuperar suspendido</span></div>
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>F9</Kbd> <span>Eliminar línea activa</span></div>
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>F10</Kbd> <span>Abrir cajón</span></div>
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>F12</Kbd> <span>Cobrar ticket</span></div>
          <div className="p-2 bg-surface-2 rounded flex justify-between items-center"><Kbd>3*CODIGO</Kbd> <span>Multiplicador</span></div>
        </div>
      </Dialog>
    </div>
  );
}
