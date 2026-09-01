import { describe, it, expect } from 'vitest';
import { resolveUnitPrice, calculateLineGross, calculateLineNet } from '../../src/core/pricing';

describe('Precios y Descuentos (core/pricing)', () => {
  it('resuelve precio escalonado por volumen', () => {
    const tierList = [
      { minQtyMilli: 5000n, priceCents: 9000n }, // C$90.00 de 5 a 9
      { minQtyMilli: 10000n, priceCents: 8000n }, // C$80.00 desde 10
      { minQtyMilli: 10000n, priceCents: 8000n } // empate
    ];

    const unsortedTiers = [
      { minQtyMilli: 10000n, priceCents: 8000n },
      { minQtyMilli: 5000n, priceCents: 9000n }
    ];

    expect(resolveUnitPrice(6000n, 10000n, unsortedTiers)).toBe(9000n);
    expect(resolveUnitPrice(1000n, 10000n, tierList)).toBe(10000n);
    expect(resolveUnitPrice(4000n, 10000n, tierList)).toBe(10000n);
    expect(resolveUnitPrice(5000n, 10000n, tierList)).toBe(9000n);
    expect(resolveUnitPrice(7500n, 10000n, tierList)).toBe(9000n);
    expect(resolveUnitPrice(10000n, 10000n, tierList)).toBe(8000n);
    expect(resolveUnitPrice(25000n, 10000n, tierList)).toBe(8000n);
  });

  it('devuelve precio base si tiers está vacío o indefinido', () => {
    expect(resolveUnitPrice(1000n, 10000n, [])).toBe(10000n);
    expect(resolveUnitPrice(1000n, 10000n, undefined)).toBe(10000n);
  });

  it('calcula bruto con mulDiv para cantidades enteras y a granel', () => {
    expect(calculateLineGross(5000n, 2000n)).toBe(10000n);
    expect(calculateLineGross(12000n, 500n)).toBe(6000n);
  });

  it('calcula neto restando descuento por línea o devolviendo cero si el descuento supera el bruto', () => {
    expect(calculateLineNet(10000n, 1500n)).toBe(8500n);
    expect(calculateLineNet(10000n, 15000n)).toBe(0n);
  });
});
