import { describe, it, expect } from 'vitest';
import {
  prorateFreightToLines,
  PurchaseLineProrateInput
} from '../../src/core/purchases';

describe('Lógica pura de Compras y Prorrateo de Flete (core/purchases)', () => {
  it('Prueba 3: La suma del flete prorrateado entre las líneas es exactamente el flete, al centavo', () => {
    const lines: PurchaseLineProrateInput[] = [
      { lineNo: 1, variantId: 101, qtyMilli: 10_000n, unitCostCents: 10000n }, // Subtotal: C$ 1,000.00
      { lineNo: 2, variantId: 102, qtyMilli: 5_000n, unitCostCents: 20000n },  // Subtotal: C$ 1,000.00
      { lineNo: 3, variantId: 103, qtyMilli: 20_000n, unitCostCents: 5000n }   // Subtotal: C$ 1,000.00
    ];

    const freightCents = 10000n; // C$ 100.00 de flete

    const prorated = prorateFreightToLines(lines, freightCents);
    expect(prorated.length).toBe(3);

    // Suma exacta del flete asignado
    const totalAllocatedFreight = prorated.reduce((acc, l) => acc + l.allocatedFreightCents, 0n);
    expect(totalAllocatedFreight).toBe(10000n);

    // Cada línea recibe exactamente 3334, 3333, 3333 centavos
    expect(prorated[0]?.allocatedFreightCents).toBe(3334n);
    expect(prorated[1]?.allocatedFreightCents).toBe(3333n);
    expect(prorated[2]?.allocatedFreightCents).toBe(3333n);
  });

  it('Calcula el costo unitario con flete (landed cost) en micros exactos', () => {
    const lines: PurchaseLineProrateInput[] = [
      { lineNo: 1, variantId: 201, qtyMilli: 100_000n, unitCostCents: 5000n } // 100 unidades a C$ 50.00 = C$ 5,000.00
    ];

    const freightCents = 25000n; // C$ 250.00 de flete

    const prorated = prorateFreightToLines(lines, freightCents);
    expect(prorated.length).toBe(1);

    // Costo base = 50.00 = 50,000,000 micros
    // Flete por unidad = 250.00 / 100 = C$ 2.50 = 2,500,000 micros
    // Landed cost unitario = 52,500,000 micros = C$ 52.50
    expect(prorated[0]?.landedUnitCostMicros).toBe(52_500_000n);
    expect(prorated[0]?.allocatedFreightCents).toBe(25000n);
  });
});
