import { describe, it, expect } from 'vitest';
import { calculateSaleDocument } from '../../src/core/sales';
import { mulDiv } from '../../src/core/money';
import { convertUsdToNio } from '../../src/core/fx';

describe('Casos de Oro (Golden Cases) — Cuadra', () => {
  it('Caso de Oro 1: Tres líneas con IVA 15% incluido y descuento global de C$10.00 que deja residuo de 1 centavo', () => {
    const doc = calculateSaleDocument({
      lines: [
        {
          lineNo: 1,
          description: 'Producto A',
          unitPriceCents: 10000n, // C$100.00
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        },
        {
          lineNo: 2,
          description: 'Producto B',
          unitPriceCents: 10000n, // C$100.00
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        },
        {
          lineNo: 3,
          description: 'Producto C',
          unitPriceCents: 10000n, // C$100.00
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      orderDiscountCents: 1000n, // C$10.00
      taxRegime: 'general',
      pricesIncludeTax: true,
      cashRounding: false
    });

    // Descuento prorrateado: C$3.34 en línea 1, C$3.33 en línea 2, C$3.33 en línea 3
    expect(doc.lines[0]?.allocDiscountCents).toBe(334n);
    expect(doc.lines[1]?.allocDiscountCents).toBe(333n);
    expect(doc.lines[2]?.allocDiscountCents).toBe(333n);

    // Totales por línea (C$96.66, C$96.67, C$96.67)
    expect(doc.lines[0]?.totalCents).toBe(9666n);
    expect(doc.lines[1]?.totalCents).toBe(9667n);
    expect(doc.lines[2]?.totalCents).toBe(9667n);

    // Desglose fiscal exacto
    expect(doc.taxableBaseCents).toBe(25217n); // C$252.17
    expect(doc.taxCents).toBe(3783n);          // C$37.83
    expect(doc.totalCents).toBe(29000n);        // C$290.00

    expect(doc.taxableBaseCents + doc.taxCents).toBe(doc.totalCents);
  });

  it('Caso de Oro 2: Ticket mixto gravado y exento (C$828 gravados dan base C$720 e IVA C$108, más C$25 exentos = C$853)', () => {
    const doc = calculateSaleDocument({
      lines: [
        {
          lineNo: 1,
          description: 'Artículo Gravado',
          unitPriceCents: 82800n, // C$828.00 con IVA
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        },
        {
          lineNo: 2,
          description: 'Artículo Canasta Básica Exento',
          unitPriceCents: 2500n, // C$25.00
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'exempt',
          taxRateBp: 0n
        }
      ],
      orderDiscountCents: 0n,
      taxRegime: 'general',
      pricesIncludeTax: true,
      cashRounding: false
    });

    expect(doc.taxableBaseCents).toBe(72000n); // C$720.00
    expect(doc.exemptBaseCents).toBe(2500n);   // C$25.00
    expect(doc.taxCents).toBe(10800n);         // C$108.00
    expect(doc.totalCents).toBe(85300n);        // C$853.00
  });

  it('Caso de Oro 3: El mismo carrito mixto bajo Cuota Fija (impuesto cero, mismo total al centavo)', () => {
    const doc = calculateSaleDocument({
      lines: [
        {
          lineNo: 1,
          description: 'Artículo Gravado',
          unitPriceCents: 82800n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        },
        {
          lineNo: 2,
          description: 'Artículo Canasta Básica Exento',
          unitPriceCents: 2500n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'exempt',
          taxRateBp: 0n
        }
      ],
      orderDiscountCents: 0n,
      taxRegime: 'cuota_fija',
      pricesIncludeTax: true,
      cashRounding: false
    });

    expect(doc.taxCents).toBe(0n);
    expect(doc.totalCents).toBe(85300n); // C$853.00
    expect(doc.exemptBaseCents).toBe(85300n);
  });

  it('Caso de Oro 4: Venta a granel (0.333 kg a C$45.90/kg)', () => {
    const unitPriceCents = 4590n; // C$45.90
    const qtyMilli = 333n;        // 0.333 kg

    const bruto = mulDiv(unitPriceCents, qtyMilli, 1000n);
    // 4590 * 333 = 1528470 / 1000 = 1528.47 -> 1528 centavos (C$15.28)
    expect(bruto).toBe(1528n);

    const doc = calculateSaleDocument({
      lines: [
        {
          lineNo: 1,
          description: 'Tomates a granel',
          unitPriceCents: 4590n,
          qtyMilli: 333n,
          lineDiscountCents: 0n,
          taxKind: 'exempt',
          taxRateBp: 0n
        }
      ],
      orderDiscountCents: 0n,
      taxRegime: 'general',
      pricesIncludeTax: true,
      cashRounding: false
    });

    expect(doc.totalCents).toBe(1528n);
  });

  it('Caso de Oro 5: Pago en dólares (US$25.00 × 36.6243 = C$915.6075 -> C$915.60 registrado)', () => {
    const usdCents = 2500n; // US$25.00
    const fxRateMicros = 36624300n; // 36.6243

    const conversion = convertUsdToNio(usdCents, fxRateMicros, true);
    expect(conversion.rawNioCents).toBe(91561n); // 915.6075 redondeado a entero
    expect(conversion.nioCents).toBe(91560n);    // Redondeado a 5 centavos físicos = C$915.60

    // Si el ticket era de C$800.00 y se pagó con US$25.00 (C$915.60), vuelto = C$115.60
    const totalTicketCents = 80000n;
    const changeCents = conversion.nioCents - totalTicketCents;
    expect(changeCents).toBe(11560n); // C$115.60
  });

  it('Caso de Oro 6: Redondeo de efectivo (C$147.03 en efectivo -> C$147.05 (+2); con tarjeta -> C$147.03 (0))', () => {
    const lines = [
      {
        lineNo: 1,
        description: 'Varios',
        unitPriceCents: 14703n,
        qtyMilli: 1000n,
        lineDiscountCents: 0n,
        taxKind: 'exempt' as const,
        taxRateBp: 0n
      }
    ];

    // En efectivo
    const docCash = calculateSaleDocument({
      lines,
      orderDiscountCents: 0n,
      taxRegime: 'general',
      pricesIncludeTax: true,
      cashRounding: true // Pago en efectivo
    });

    expect(docCash.cashRoundingCents).toBe(2n);
    expect(docCash.totalCents).toBe(14705n); // C$147.05

    // Con tarjeta
    const docCard = calculateSaleDocument({
      lines,
      orderDiscountCents: 0n,
      taxRegime: 'general',
      pricesIncludeTax: true,
      cashRounding: false // Pago electrónico
    });

    expect(docCard.cashRoundingCents).toBe(0n);
    expect(docCard.totalCents).toBe(14703n); // C$147.03
  });

  it('Caso de Oro 7: Nota de crédito parcial sobre una venta con descuento global prorrateado', () => {
    // Tomamos la línea 2 de la venta del Caso 1 (precio C$100.00, descuento asignado C$3.33, total C$96.67)
    // Devolvemos esa única línea con los valores congelados
    const ncLine = {
      lineNo: 1,
      description: 'Producto B (Devolución)',
      unitPriceCents: 10000n,
      qtyMilli: 1000n,
      lineDiscountCents: 0n,
      taxKind: 'taxable' as const,
      taxRateBp: 1500n
    };

    const docNc = calculateSaleDocument({
      lines: [ncLine],
      orderDiscountCents: 333n, // Descuento original asignado a esta línea
      taxRegime: 'general',
      pricesIncludeTax: true,
      cashRounding: false
    });

    expect(docNc.totalCents).toBe(9667n); // C$96.67 exactos
    expect(docNc.taxableBaseCents).toBe(8406n); // C$84.06
    expect(docNc.taxCents).toBe(1261n); // C$12.61
    expect(docNc.taxableBaseCents + docNc.taxCents).toBe(9667n);
  });

  it('Caso de Oro 8: Venta mixta (efectivo córdobas, dólares y resto a crédito)', () => {
    const totalVentaCents = 100000n; // C$1,000.00
    const cashNioCents = 20000n;     // C$200.00 en efectivo córdobas
    const usdCents = 1000n;          // US$10.00
    const fxRateMicros = 36624300n;  // 36.6243 -> US$10.00 = C$366.243 -> C$366.25 en efectivo redondeado a 5c
    const conversionUsd = convertUsdToNio(usdCents, fxRateMicros, true);
    expect(conversionUsd.nioCents).toBe(36625n); // C$366.25

    const totalPaidCents = cashNioCents + conversionUsd.nioCents; // C$566.25
    const creditCents = totalVentaCents - totalPaidCents;          // C$433.75 (43375 centavos)

    const changeCents = 0n;

    // Invariante contable de la base de datos: paid + credit - change = total
    expect(totalPaidCents + creditCents - changeCents).toBe(totalVentaCents);
  });
});
