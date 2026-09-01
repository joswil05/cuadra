import { describe, it, expect } from 'vitest';
import { calculateSaleDocument } from '../../src/core/sales';
import * as core from '../../src/core';

describe('Ventas y Armado de Documentos (core/sales)', () => {
  it('maneja carrito vacío retornando documento en ceros', () => {
    const doc = calculateSaleDocument({
      lines: [],
      taxRegime: 'general'
    });

    expect(doc.lines).toEqual([]);
    expect(doc.totalCents).toBe(0n);
    expect(doc.taxCents).toBe(0n);
  });

  it('maneja descuento global que excede el valor neto de las líneas asignando hasta el valor neto', () => {
    const doc = calculateSaleDocument({
      lines: [
        {
          lineNo: 1,
          description: 'Item Barato',
          unitPriceCents: 100n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'exempt',
          taxRateBp: 0n
        }
      ],
      orderDiscountCents: 5000n, // Mayor al total de la línea
      taxRegime: 'general'
    });

    expect(doc.lines[0]?.baseTotalCents).toBe(0n);
    expect(doc.totalCents).toBe(0n);
  });

  it('verifica que src/core exporta todas las funciones del motor', () => {
    expect(core.mulDiv).toBeDefined();
    expect(core.allocate).toBeDefined();
    expect(core.calculateLineTax).toBeDefined();
    expect(core.convertUsdToNio).toBeDefined();
    expect(core.calculateSaleDocument).toBeDefined();
  });
});
