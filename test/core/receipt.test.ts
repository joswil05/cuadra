import { describe, it, expect } from 'vitest';
import {
  formatReceipt80mm,
  ReceiptData,
  getEscPosDrawerKick
} from '../../src/core/receipt';

describe('Formato de Factura / Ticket e Impresión DGI (core/receipt)', () => {
  const sampleReceipt: ReceiptData = {
    companyName: 'Comercial La Bendición, S.A.',
    tradeName: 'Minisúper La Bendición',
    address: 'Costado Este de la Iglesia El Calvario, Managua',
    phone: '+505 2222-3333',
    ruc: 'J0310000123456',
    dgiAuthNumber: 'DGI-AUT-2026-987654',
    seriesPrefix: 'F-',
    folio: 'F-000124',
    at: '2026-08-31 14:30:00',
    docType: 'invoice',
    paymentCondition: 'contado',
    taxRegime: 'general',
    cashierName: 'Juan Pérez',
    customerName: 'Cliente Contado',
    customerRuc: 'N/A',
    lines: [
      {
        description: 'Coca-Cola 600ml',
        qtyMilli: 2000n,
        unitPriceCents: 3000n,
        totalCents: 6000n,
        taxKind: 'taxable',
        taxRateBp: 1500n
      },
      {
        description: 'Arroz Faisán 1lb',
        qtyMilli: 1000n,
        unitPriceCents: 2000n,
        totalCents: 2000n,
        taxKind: 'exempt',
        taxRateBp: 0n
      }
    ],
    taxableBaseCents: 5217n,
    exemptBaseCents: 2000n,
    taxCents: 783n,
    cashRoundingCents: 0n,
    totalCents: 8000n,
    payments: [
      { method: 'cash', currencyCode: 'USD', amountFx: 100n, amountCents: 3662n },
      { method: 'cash', currencyCode: 'NIO', amountFx: 5000n, amountCents: 5000n }
    ],
    changeCents: 662n
  };

  it('Prueba 5: El ticket impreso contiene los ocho campos obligatorios exigidos por la DGI', () => {
    const text = formatReceipt80mm(sampleReceipt);

    // 1. Nombre completo del emisor
    expect(text).toContain('Comercial La Bendición, S.A.');

    // 2. Nombre comercial
    expect(text).toContain('Minisúper La Bendición');

    // 3. Dirección y teléfono
    expect(text).toContain('Costado Este de la Iglesia El Calvario, Managua');
    expect(text).toContain('+505 2222-3333');

    // 4. RUC del emisor
    expect(text).toContain('J0310000123456');

    // 5. Indicación expresa de CONTADO o CRÉDITO
    expect(text).toContain('CONDICION: CONTADO');

    // 6. Desglose del IVA separado del total
    expect(text).toContain('Gravado:');
    expect(text).toContain('C$ 52.17');
    expect(text).toContain('Exento:');
    expect(text).toContain('C$ 20.00');
    expect(text).toContain('IVA (15%):');
    expect(text).toContain('C$ 7.83');
    expect(text).toContain('TOTAL:');
    expect(text).toContain('C$ 80.00');

    // 7. Número de autorización de la DGI (abajo a la derecha / sección final)
    expect(text).toContain('DGI-AUT-2026-987654');

    // 8. Numeración correlativa e inalterable
    expect(text).toContain('F-000124');
  });

  it('Genera comando ESC/POS estándar para apertura de cajón de dinero', () => {
    const drawerCmd = getEscPosDrawerKick();
    expect(drawerCmd).toBeInstanceOf(Uint8Array);
    expect(drawerCmd.length).toBe(5);
    expect(drawerCmd[0]).toBe(0x1b); // ESC
    expect(drawerCmd[1]).toBe(0x70); // 'p'
  });
});
