import { PosCart, PosCartLine } from '../../../../core/pos';

export interface PosCartTableProps {
  cart: PosCart;
  onUpdateQty: (lineNo: number, newQtyMilli: bigint) => void;
  onRemoveLine: (lineNo: number) => void;
  onSelectLine?: (lineNo: number) => void;
  selectedLineNo?: number;
}

export function PosCartTable({
  cart,
  onUpdateQty,
  onRemoveLine,
  onSelectLine,
  selectedLineNo
}: PosCartTableProps) {
  if (cart.lines.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-surface border border-border rounded-xl border-dashed">
        <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-text-3 mb-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-text-1">El carrito está vacío</h3>
        <p className="text-xs text-text-3 mt-1 max-w-xs">
          Escanee un código de barras o escriba un código para agregar artículos (ej. <code className="font-mono bg-surface-2 px-1 rounded">3*BEB-001</code>).
        </p>
      </div>
    );
  }

  const formatPrice = (cents: bigint) => `C$ ${(Number(cents) / 100).toFixed(2)}`;
  const formatQty = (qtyMilli: bigint) => (Number(qtyMilli) / 1000).toFixed(0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface border border-border rounded-xl shadow-xs">
      <div className="overflow-x-auto overflow-y-auto flex-1">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-surface-2 border-b border-border text-xs text-text-2 sticky top-0 z-10 select-none">
            <tr>
              <th className="py-2.5 px-3 w-12 text-center font-medium">#</th>
              <th className="py-2.5 px-3 font-medium">Artículo</th>
              <th className="py-2.5 px-3 w-28 text-right font-medium">Precio</th>
              <th className="py-2.5 px-3 w-32 text-center font-medium">Cantidad</th>
              <th className="py-2.5 px-3 w-28 text-right font-medium">Total</th>
              <th className="py-2.5 px-2 w-10 text-center font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cart.lines.map((line: PosCartLine) => {
              const isSelected = selectedLineNo === line.lineNo;
              const isLastAdded = cart.lastAddedLineNo === line.lineNo;
              const lineTotal = (line.unitPriceCents * line.qtyMilli) / 1000n;

              return (
                <tr
                  key={line.lineNo}
                  onClick={() => onSelectLine?.(line.lineNo)}
                  className={`transition-colors duration-fast cursor-pointer ${
                    isLastAdded ? 'bg-accent-soft/70 transition-all duration-300' : isSelected ? 'bg-accent-soft' : 'hover:bg-surface-2'
                  }`}
                >
                  <td className="py-2.5 px-3 text-center text-xs text-text-3 font-mono">{line.lineNo}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-text-1">{line.description}</div>
                    <div className="text-[11px] font-mono text-text-3">{line.sku}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-text-2 font-mono text-xs">
                    {formatPrice(line.unitPriceCents)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="inline-flex items-center gap-1 border border-border rounded-md bg-surface p-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onUpdateQty(line.lineNo, line.qtyMilli - 1000n)}
                        className="w-6 h-6 flex items-center justify-center rounded text-text-2 hover:bg-surface-2 active:bg-surface-3 font-bold"
                        title="Disminuir (-)"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-semibold text-xs tabular-nums text-text-1">
                        {formatQty(line.qtyMilli)}
                      </span>
                      <button
                        onClick={() => onUpdateQty(line.lineNo, line.qtyMilli + 1000n)}
                        className="w-6 h-6 flex items-center justify-center rounded text-text-2 hover:bg-surface-2 active:bg-surface-3 font-bold"
                        title="Aumentar (+)"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-bold text-text-1 font-mono text-xs">
                    {formatPrice(lineTotal)}
                  </td>
                  <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onRemoveLine(line.lineNo)}
                      className="text-text-3 hover:text-danger p-1 rounded transition-colors"
                      title="Eliminar (F9)"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
