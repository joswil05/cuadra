import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { formatReceipt80mm, ReceiptData } from '../../src/core/receipt';
import {
  completeOnboardingWizard,
  OnboardingWizardInput
} from '../../src/main/services/onboarding.service';
import { createSale } from '../../src/main/services/sales.service';

describe('Asistente de Primer Arranque y Régimen Tributario (Fase 11 / Onboarding)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.join(process.cwd(), 'db/migrations');
    runMigrations(db, migrationsDir);
  });

  afterEach(() => {
    db.close();
  });

  it('Prueba 2: Un negocio en cuota fija no ve la palabra IVA en ninguna pantalla ni en el ticket impreso', () => {
    const cuotaFijaReceipt: ReceiptData = {
      companyName: 'Pulpería Doña María',
      tradeName: 'Doña María',
      address: 'Mercado Oriental, Managua',
      phone: '8888-9999',
      ruc: 'N/A',
      dgiAuthNumber: 'N/A',
      seriesPrefix: 'T-',
      folio: 'T-000001',
      at: '2026-08-31 10:00:00',
      docType: 'ticket',
      paymentCondition: 'contado',
      taxRegime: 'cuota_fija',
      cashierName: 'María López',
      customerName: 'Cliente Ocasional',
      customerRuc: 'N/A',
      lines: [
        {
          description: 'Libra de Frijoles',
          qtyMilli: 1000n,
          unitPriceCents: 3500n,
          totalCents: 3500n,
          taxKind: 'exempt',
          taxRateBp: 0n
        },
        {
          description: 'Bolsa de Jabón',
          qtyMilli: 1000n,
          unitPriceCents: 2000n,
          totalCents: 2000n,
          taxKind: 'exempt',
          taxRateBp: 0n
        }
      ],
      taxableBaseCents: 0n,
      exemptBaseCents: 5500n,
      taxCents: 0n,
      cashRoundingCents: 0n,
      totalCents: 5500n,
      payments: [
        { method: 'cash', currencyCode: 'NIO', amountFx: 5500n, amountCents: 5500n }
      ],
      changeCents: 0n
    };

    const text = formatReceipt80mm(cuotaFijaReceipt);

    // En cuota fija:
    // 1. La palabra IVA no debe figurar en ningún lado del ticket
    expect(text.toUpperCase()).not.toContain('IVA');
    expect(text.toUpperCase()).not.toContain('GRAVADO');
    expect(text.toUpperCase()).not.toContain('15%');

    // 2. El total debe cuadrar exactamente
    expect(text).toMatch(/TOTAL:\s+C\$ 55\.00/);
  });

  it('Prueba 3: El asistente completo, de máquina limpia a primera venta, en una prueba de punta a punta (minimarket y ropa)', () => {
    // 1. Máquina limpia: ejecutamos el asistente de configuración para minimarket
    const wizardInput: OnboardingWizardInput = {
      businessName: 'Supermercado Central, S.A.',
      tradeName: 'Súper Central',
      ruc: 'J0310000555555',
      address: 'Km 5 Carretera Norte, Managua',
      phone: '+505 2244-8888',
      dgiAuthNumber: 'DGI-AUT-2026-001',
      taxRegime: 'general',
      industryProfile: 'minimarket',
      initialCashFundNio: 150000n, // C$ 1,500.00
      initialCashFundUsd: 5000n, // $ 50.00
      adminFullName: 'Gerente General',
      adminPin: '1234'
    };

    const result = completeOnboardingWizard(db, wizardInput);

    expect(result.success).toBe(true);
    expect(result.initialShiftId).toBeDefined();
    expect(result.seededProductsCount).toBeGreaterThan(0);

    // 2. Comprobar que la configuración de la empresa y régimen quedaron grabados
    const company = db.prepare('SELECT legal_name FROM company WHERE id = 1').get() as { legal_name: string };
    expect(company.legal_name).toBe('Supermercado Central, S.A.');

    const taxRegimeSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'tax.regime'").get() as { value_json: string };
    expect(JSON.parse(taxRegimeSetting.value_json)).toBe('general');

    // 3. Comprobar que el catálogo semilla fue insertado con stock inicial en Kardex
    const variant = db.prepare(`
      SELECT v.id, v.sku, p.name, v.price_cents, v.stock_milli
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE v.stock_milli > 0
      LIMIT 1
    `).get() as { id: number; sku: string; name: string; price_cents: number; stock_milli: number };

    expect(variant).toBeDefined();
    expect(variant.stock_milli).toBeGreaterThan(0);

    // 4. Realizar la primera venta sin ninguna configuración manual adicional
    const saleResult = createSale(db, {
      shiftId: result.initialShiftId,
      userId: result.adminUserId,
      seriesId: 1,
      customerId: undefined,
      docType: 'ticket',
      paymentCondition: 'contado',
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variant.id,
          description: variant.name,
          qtyMilli: 1000n,
          unitPriceCents: BigInt(variant.price_cents),
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: BigInt(variant.price_cents),
          fxRateMicros: 1000000n
        }
      ],
      isContingency: false
    });

    expect(saleResult.id).toBeDefined();
    expect(saleResult.folio).toMatch(/^T-\d+/);

    // 5. Verificar que el turno tiene registrada la venta
    const shiftSales = db.prepare('SELECT COUNT(*) as cnt FROM sales WHERE shift_id = ?').get(result.initialShiftId) as { cnt: number };
    expect(shiftSales.cnt).toBe(1);
  });
});
