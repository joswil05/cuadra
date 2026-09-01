import { describe, it, expect } from 'vitest';
import { calculateLineTax } from '../../src/core/tax';

describe('Motor Impositivo (core/tax)', () => {
  it('calcula impuesto incluido (pricesIncludeTax = true) para régimen general gravado 15%', () => {
    // base_total = C$115.00 (11500 centavos)
    // base = 11500 * 10000 / 11500 = 10000 (C$100.00)
    // tax = 11500 - 10000 = 1500 (C$15.00)
    const result = calculateLineTax({
      baseTotalCents: 11500n,
      taxKind: 'taxable',
      taxRateBp: 1500n,
      taxRegime: 'general',
      pricesIncludeTax: true
    });

    expect(result.baseCents).toBe(10000n);
    expect(result.taxCents).toBe(1500n);
    expect(result.totalCents).toBe(11500n);
  });

  it('calcula impuesto agregado (pricesIncludeTax = false) para régimen general gravado 15%', () => {
    // base_total = C$100.00 (10000 centavos)
    // base = 10000
    // tax = 10000 * 1500 / 10000 = 1500
    // total = 11500
    const result = calculateLineTax({
      baseTotalCents: 10000n,
      taxKind: 'taxable',
      taxRateBp: 1500n,
      taxRegime: 'general',
      pricesIncludeTax: false
    });

    expect(result.baseCents).toBe(10000n);
    expect(result.taxCents).toBe(1500n);
    expect(result.totalCents).toBe(11500n);
  });

  it('trata productos exempt (exentos) con impuesto 0 y base igual a baseTotal', () => {
    const result = calculateLineTax({
      baseTotalCents: 5000n,
      taxKind: 'exempt',
      taxRateBp: 0n,
      taxRegime: 'general',
      pricesIncludeTax: true
    });

    expect(result.baseCents).toBe(5000n);
    expect(result.taxCents).toBe(0n);
    expect(result.totalCents).toBe(5000n);
  });

  it('trata productos not_subject (no sujetos) con impuesto 0', () => {
    const result = calculateLineTax({
      baseTotalCents: 7500n,
      taxKind: 'not_subject',
      taxRateBp: 0n,
      taxRegime: 'general',
      pricesIncludeTax: true
    });

    expect(result.baseCents).toBe(7500n);
    expect(result.taxCents).toBe(0n);
    expect(result.totalCents).toBe(7500n);
  });

  it('en régimen cuota_fija el impuesto es SIEMPRE cero independientemente del producto', () => {
    const result = calculateLineTax({
      baseTotalCents: 11500n,
      taxKind: 'taxable',
      taxRateBp: 1500n,
      taxRegime: 'cuota_fija',
      pricesIncludeTax: true
    });

    expect(result.baseCents).toBe(11500n);
    expect(result.taxCents).toBe(0n);
    expect(result.totalCents).toBe(11500n);
  });
});
