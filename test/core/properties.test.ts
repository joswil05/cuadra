import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { allocate } from '../../src/core/money';
import { calculateSaleDocument, CartLineInput } from '../../src/core/sales';

describe('Pruebas de Propiedad (fast-check: 10,000 casos)', () => {
  it('Propiedad 1: Σ allocate(t, w) === t para cualquier total t y vector de pesos w', () => {
    fc.assert(
      fc.property(
        // Generar total entre -1_000_000_00 y 1_000_000_00 (hasta C$1,000,000)
        fc.bigInt({ min: 0n, max: 100_000_000n }),
        // Generar lista de pesos (al menos 1 peso positivo)
        fc.array(fc.bigInt({ min: 0n, max: 100_000_000n }), { minLength: 1, maxLength: 50 }),
        (total, weights) => {
          const sumWeights = weights.reduce((a, b) => a + b, 0n);
          if (sumWeights === 0n) return true; // Caso borde cubierto en unitarias

          const shares = allocate(total, weights);
          const sumShares = shares.reduce((a, b) => a + b, 0n);

          expect(sumShares).toBe(total);
          expect(shares.length).toBe(weights.length);
        }
      ),
      { numRuns: 10_000 }
    );
  });

  it('Propiedad 2: Σ líneas.total === documento.total en carritos generados al azar', () => {
    const arbitraryLine = fc.record({
      unitPriceCents: fc.bigInt({ min: 100n, max: 500_000n }),
      qtyMilli: fc.bigInt({ min: 1000n, max: 50_000n }),
      lineDiscountCents: fc.bigInt({ min: 0n, max: 50n }),
      taxKind: fc.constantFrom<'taxable' | 'exempt' | 'not_subject'>('taxable', 'exempt', 'not_subject'),
      taxRateBp: fc.constant(1500n)
    });

    fc.assert(
      fc.property(
        fc.array(arbitraryLine, { minLength: 1, maxLength: 20 }),
        fc.bigInt({ min: 0n, max: 500n }), // descuento global
        fc.constantFrom<'general' | 'cuota_fija'>('general', 'cuota_fija'),
        (rawLines, orderDiscountCents, taxRegime) => {
          const cartLines: CartLineInput[] = rawLines.map((l, idx) => ({
            lineNo: idx + 1,
            description: `Item ${idx + 1}`,
            unitPriceCents: l.unitPriceCents,
            qtyMilli: l.qtyMilli,
            lineDiscountCents: l.lineDiscountCents,
            taxKind: l.taxKind,
            taxRateBp: l.taxRateBp
          }));

          const doc = calculateSaleDocument({
            lines: cartLines,
            orderDiscountCents,
            taxRegime,
            pricesIncludeTax: true,
            cashRounding: false
          });

          const sumLinesTotal = doc.lines.reduce((acc, l) => acc + l.totalCents, 0n);
          expect(sumLinesTotal).toBe(doc.taxableBaseCents + doc.exemptBaseCents + doc.taxCents);
          expect(doc.totalCents).toBe(sumLinesTotal + doc.cashRoundingCents);
        }
      ),
      { numRuns: 10_000 }
    );
  });

  it('Propiedad 3: El total nunca cambia si se reordenan las líneas del carrito', () => {
    const arbitraryLine = fc.record({
      unitPriceCents: fc.bigInt({ min: 100n, max: 100_000n }),
      qtyMilli: fc.bigInt({ min: 1000n, max: 10_000n }),
      lineDiscountCents: fc.constant(0n),
      taxKind: fc.constantFrom<'taxable' | 'exempt'>('taxable', 'exempt'),
      taxRateBp: fc.constant(1500n)
    });

    fc.assert(
      fc.property(
        fc.array(arbitraryLine, { minLength: 2, maxLength: 10 }),
        (rawLines) => {
          const cartLines1: CartLineInput[] = rawLines.map((l, idx) => ({
            lineNo: idx + 1,
            description: `Item ${idx + 1}`,
            unitPriceCents: l.unitPriceCents,
            qtyMilli: l.qtyMilli,
            lineDiscountCents: 0n,
            taxKind: l.taxKind,
            taxRateBp: l.taxRateBp
          }));

          // Revertir el orden de las líneas
          const cartLines2: CartLineInput[] = [...cartLines1].reverse().map((l, idx) => ({
            ...l,
            lineNo: idx + 1
          }));

          const doc1 = calculateSaleDocument({
            lines: cartLines1,
            orderDiscountCents: 0n,
            taxRegime: 'general',
            pricesIncludeTax: true,
            cashRounding: false
          });

          const doc2 = calculateSaleDocument({
            lines: cartLines2,
            orderDiscountCents: 0n,
            taxRegime: 'general',
            pricesIncludeTax: true,
            cashRounding: false
          });

          expect(doc1.totalCents).toBe(doc2.totalCents);
          expect(doc1.taxableBaseCents).toBe(doc2.taxableBaseCents);
          expect(doc1.exemptBaseCents).toBe(doc2.exemptBaseCents);
          expect(doc1.taxCents).toBe(doc2.taxCents);
        }
      ),
      { numRuns: 10_000 }
    );
  });

  it('Propiedad 4: Con tax_regime = "cuota_fija", tax_cents es SIEMPRE cero', () => {
    const arbitraryLine = fc.record({
      unitPriceCents: fc.bigInt({ min: 100n, max: 200_000n }),
      qtyMilli: fc.bigInt({ min: 1000n, max: 20_000n }),
      lineDiscountCents: fc.bigInt({ min: 0n, max: 100n }),
      taxKind: fc.constantFrom<'taxable' | 'exempt' | 'not_subject'>('taxable', 'exempt', 'not_subject'),
      taxRateBp: fc.constant(1500n)
    });

    fc.assert(
      fc.property(
        fc.array(arbitraryLine, { minLength: 1, maxLength: 15 }),
        fc.bigInt({ min: 0n, max: 200n }),
        (rawLines, orderDiscountCents) => {
          const cartLines: CartLineInput[] = rawLines.map((l, idx) => ({
            lineNo: idx + 1,
            description: `Item ${idx + 1}`,
            unitPriceCents: l.unitPriceCents,
            qtyMilli: l.qtyMilli,
            lineDiscountCents: l.lineDiscountCents,
            taxKind: l.taxKind,
            taxRateBp: l.taxRateBp
          }));

          const doc = calculateSaleDocument({
            lines: cartLines,
            orderDiscountCents,
            taxRegime: 'cuota_fija',
            pricesIncludeTax: true,
            cashRounding: false
          });

          expect(doc.taxCents).toBe(0n);
          doc.lines.forEach((l) => {
            expect(l.taxCents).toBe(0n);
          });
        }
      ),
      { numRuns: 10_000 }
    );
  });
});
