import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyInbound, applyOutbound, CostState } from '../../src/core/costing';
import { mulDiv } from '../../src/core/money';

describe('Pruebas de Propiedad de Costeo y Kardex (fast-check: 10,000 casos)', () => {
  const arbitraryMove = fc.oneof(
    fc.record({
      type: fc.constant<'in'>('in'),
      qtyMilli: fc.bigInt({ min: 1000n, max: 100_000n }),
      unitCostMicros: fc.bigInt({ min: 10_000_000n, max: 500_000_000n })
    }),
    fc.record({
      type: fc.constant<'out'>('out'),
      qtyFractionPercent: fc.integer({ min: 10, max: 90 }) // sacar entre 10% y 90% del stock actual
    })
  );

  it('Propiedad de Conciliación: tras una secuencia aleatoria de entradas y salidas, Σ Kardex === stock_milli y valor_inventario === Σ(stock × costo_promedio)', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryMove, { minLength: 1, maxLength: 30 }),
        (moves) => {
          let state: CostState = { stockMilli: 0n, avgCostMicros: 0n };
          let totalKardexMilli = 0n;

          for (const move of moves) {
            if (move.type === 'in') {
              state = applyInbound(state, move.qtyMilli, move.unitCostMicros);
              totalKardexMilli += move.qtyMilli;
            } else {
              if (state.stockMilli > 0n) {
                // Calcular cantidad a sacar basada en el porcentaje disponible
                const outQty = mulDiv(state.stockMilli, BigInt(move.qtyFractionPercent), 100n);
                if (outQty > 0n && outQty <= state.stockMilli) {
                  const outRes = applyOutbound(state, outQty);
                  state = outRes.state;
                  totalKardexMilli -= outQty;
                }
              }
            }

            // Invariante en cada paso: la suma de existencias del Kardex coincide exactamente con el stock_milli
            expect(state.stockMilli).toBe(totalKardexMilli);

            // Invariante de valorización: valor inventario en centavos
            const inventoryValueCents = mulDiv(state.stockMilli, state.avgCostMicros, 1_000_000_000n);
            const calculatedValue = mulDiv(totalKardexMilli, state.avgCostMicros, 1_000_000_000n);
            expect(inventoryValueCents).toBe(calculatedValue);
          }
        }
      ),
      { numRuns: 10_000 }
    );
  });
});
