import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { ReceiptData, formatReceipt80mm } from '../../../../core/receipt';

export interface PosPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptData: ReceiptData | null;
  onPrint?: () => void;
}

export function PosPrintModal({
  isOpen,
  onClose,
  receiptData,
  onPrint
}: PosPrintModalProps) {
  if (!receiptData) return null;

  const formattedText = formatReceipt80mm(receiptData);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Ticket / Factura Emitida"
      description={`Folio: ${receiptData.folio} — Impresión en rollo térmico de 80 mm`}
      maxWidth="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar (Esc)
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onPrint?.();
              onClose();
            }}
          >
            Imprimir Ticket y Abrir Cajón
          </Button>
        </>
      }
    >
      <div className="bg-surface-2 p-4 rounded-lg border border-border max-h-96 overflow-y-auto font-mono text-[11px] leading-relaxed whitespace-pre select-all text-text-1">
        {formattedText}
      </div>
    </Dialog>
  );
}
