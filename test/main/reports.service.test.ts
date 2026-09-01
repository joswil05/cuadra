import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { createSimpleProduct } from '../../src/main/services/catalog.service';
import { openShift } from '../../src/main/services/cash.service';
import { createSale } from '../../src/main/services/sales.service';
import {
  getDailyTaxSummaryReport,
  getMonthlyGrossIncomeReport,
  getSalesBookReport,
  getInventoryValuationReport,
  getProfitMarginsReport,
  reconcileReports
} from '../../src/main/services/reports.service';

describe('Reportes Fiscales, Operativos y Conciliaciones (main/services/reports)', () => {
  let db: Database.Database;
  let shiftId: number;
  let variantAId: number;
  let variantBId: number;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();
    db.prepare("INSERT INTO document_series (id, code, doc_type, next_number, is_active) VALUES (1, 'A', 'ticket', 1, 1)").run();

    const prodA = createSimpleProduct(db, {
      name: 'Café Presto 150g',
      sku: 'CAF-PRE-150',
      unitId: 1,
      priceCents: 12000n, // C$ 120.00
      userId: 1
    });
    variantAId = prodA.variantId;

    const prodB = createSimpleProduct(db, {
      name: 'Arroz Faisán 5 Lbs',
      sku: 'ARR-FAI-005',
      unitId: 1,
      priceCents: 15000n, // C$ 150.00
      userId: 1
    });
    variantBId = prodB.variantId;

    // Stock inicial en Kardex
    db.prepare(`
      INSERT INTO inventory_moves (
        uid, warehouse_id, variant_id, direction, qty_milli, unit_cost_micros,
        total_cost_cents, balance_qty_milli, balance_avg_cost_micros,
        reason, user_id, at
      ) VALUES
      ('init-move-1', 1, ?, 'in', 500000, 80000000, 4000000, 500000, 80000000, 'initial', 1, datetime('now')),
      ('init-move-2', 1, ?, 'in', 500000, 100000000, 5000000, 500000, 100000000, 'initial', 1, datetime('now'))
    `).run(variantAId, variantBId);

    db.prepare('UPDATE product_variants SET stock_milli = 500000, cost_avg_micros = 80000000 WHERE id = ?').run(variantAId);
    db.prepare('UPDATE product_variants SET stock_milli = 500000, cost_avg_micros = 100000000 WHERE id = ?').run(variantBId);

    const shift = openShift(db, {
      openedBy: 1,
      openingFloatCents: 100000n,
      openingFloatUsd: 0n
    });
    shiftId = shift.id;
  });

  afterEach(() => {
    db.close();
  });

  it('Prueba 1: El total de ventas del reporte cuadra al centavo con la suma de los turnos y con las salidas del Kardex', () => {
    // Generar 5 ventas de prueba
    for (let i = 0; i < 5; i++) {
      createSale(db, {
        docType: 'ticket',
        seriesId: 1,
        shiftId,
        userId: 1,
        taxRegime: 'general',
        pricesIncludeTax: true,
        lines: [
          {
            variantId: variantAId,
            description: 'Café Presto 150g',
            qtyMilli: 2_000n, // 2 unidades a C$ 120.00 = C$ 240.00
            unitPriceCents: 12000n,
            taxKind: 'taxable',
            taxRateBp: 1500n
          }
        ],
        payments: [
          {
            method: 'cash',
            currencyCode: 'NIO',
            amountFx: 24000n,
            fxRateMicros: 1000000n
          }
        ]
      });
    }

    const rec = reconcileReports(db);

    expect(rec.salesTotalCents).toBe(120000n); // 5 * 240.00 = C$ 1,200.00
    expect(rec.shiftCashTotalCents).toBe(120000n);
    expect(rec.salesVsShiftDriftCents).toBe(0n);
    expect(rec.kardexSalesQtyMilli).toBe(10_000n); // 10 unidades vendidas
    expect(rec.kardexVsSalesDriftMilli).toBe(0n);
  });

  it('Prueba 2: El IVA del resumen diario cuadra con la suma de las líneas de todas las facturas del periodo', () => {
    createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'general',
      pricesIncludeTax: false,
      lines: [
        {
          variantId: variantAId,
          description: 'Café Presto',
          qtyMilli: 1_000n,
          unitPriceCents: 10000n,
          taxKind: 'taxable',
          taxRateBp: 1500n // C$ 15.00 IVA
        },
        {
          variantId: variantBId,
          description: 'Arroz Faisán',
          qtyMilli: 1_000n,
          unitPriceCents: 20000n,
          taxKind: 'taxable',
          taxRateBp: 1500n // C$ 30.00 IVA
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: 34500n,
          fxRateMicros: 1000000n
        }
      ]
    });

    const dailyTax = getDailyTaxSummaryReport(db);
    expect(dailyTax.length).toBeGreaterThan(0);

    const totalTaxReported = dailyTax.reduce((acc, r) => acc + r.taxCents, 0n);
    expect(totalTaxReported).toBe(4500n); // C$ 45.00 exactos de IVA

    const monthlyGross = getMonthlyGrossIncomeReport(db);
    expect(monthlyGross.length).toBeGreaterThan(0);

    const valuation = getInventoryValuationReport(db);
    expect(valuation.length).toBe(2);

    const margins = getProfitMarginsReport(db);
    expect(margins.length).toBe(2);
  });

  it('Prueba 3: El libro de ventas detecta y reporta cualquier hueco en el correlativo', () => {
    // Venta 1 (número 1)
    createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'cuota_fija',
      pricesIncludeTax: true,
      lines: [{ variantId: variantAId, description: 'Café', qtyMilli: 1_000n, unitPriceCents: 1000n, taxKind: 'exempt', taxRateBp: 0n }],
      payments: [{ method: 'cash', currencyCode: 'NIO', amountFx: 1000n, fxRateMicros: 1000000n }]
    });

    // Simular un salto en el correlativo actualizando next_number a 4
    db.prepare('UPDATE document_series SET next_number = 4 WHERE id = 1').run();

    // Venta 2 (número 4)
    createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'cuota_fija',
      pricesIncludeTax: true,
      lines: [{ variantId: variantAId, description: 'Café', qtyMilli: 1_000n, unitPriceCents: 1000n, taxKind: 'exempt', taxRateBp: 0n }],
      payments: [{ method: 'cash', currencyCode: 'NIO', amountFx: 1000n, fxRateMicros: 1000000n }]
    });

    const book = getSalesBookReport(db);
    expect(book.missingNumbers['A']).toEqual([2, 3]); // Faltan los folios 2 y 3
  });

  it('Prueba 4 (Criterio de cierre): Las tres conciliaciones dan exactamente cero diferencia sobre una base de 10,000 ventas generadas', () => {
    // Generar 10,000 ventas usando una transacción masiva en SQLite
    const insertSaleStmt = db.prepare(`
      INSERT INTO sales (
        uid, doc_type, series_id, number, folio, at, shift_id, user_id,
        status, payment_condition, is_contingency, tax_regime, prices_include_tax,
        gross_cents, line_discount_cents, order_discount_cents,
        taxable_base_cents, exempt_base_cents, tax_cents,
        cash_rounding_cents, total_cents, cogs_cents, paid_cents, change_cents, credit_cents
      ) VALUES (
        ?, 'ticket', 1, ?, ?, '2026-08-31 12:00:00', ?, 1,
        'completed', 'contado', 0, 'general', 1,
        11500, 0, 0,
        10000, 0, 1500,
        0, 11500, 8000, 11500, 0, 0
      )
    `);

    const insertSaleLineStmt = db.prepare(`
      INSERT INTO sale_lines (
        sale_id, line_no, variant_id, description, qty_milli, unit_price_cents,
        line_discount_cents, alloc_discount_cents, tax_kind, tax_rate_bp,
        taxable_base_cents, tax_cents, total_cents, unit_cost_micros, cogs_cents
      ) VALUES (
        ?, 1, ?, 'Café Presto 150g', 1000, 11500,
        0, 0, 'taxable', 1500,
        10000, 1500, 11500, 80000000, 8000
      )
    `);

    const insertCashStmt = db.prepare(`
      INSERT INTO cash_movements (
        uid, shift_id, at, type, currency_code, amount_fx,
        fx_rate_micros, amount_cents, ref_type, ref_id, user_id
      ) VALUES (?, ?, '2026-08-31 12:00:00', 'sale', 'NIO', 11500, 1000000, 11500, 'sale', ?, 1)
    `);

    const insertKardexStmt = db.prepare(`
      INSERT INTO inventory_moves (
        uid, warehouse_id, variant_id, direction, qty_milli, unit_cost_micros,
        total_cost_cents, balance_qty_milli, balance_avg_cost_micros,
        reason, ref_type, ref_id, user_id, at
      ) VALUES (?, 1, ?, 'out', 1000, 80000000, 8000, 400000, 80000000, 'sale', 'sale', ?, 1, '2026-08-31 12:00:00')
    `);

    db.transaction(() => {
      // 10 000 ventas
      for (let i = 1; i <= 10000; i++) {
        const uidStr = `sale-10k-${i}`;
        const folioStr = `A-${String(i).padStart(6, '0')}`;
        const sRes = insertSaleStmt.run(uidStr, i, folioStr, shiftId);
        const saleId = Number(sRes.lastInsertRowid);

        insertSaleLineStmt.run(saleId, variantAId);
        insertCashStmt.run(`cash-10k-${i}`, shiftId, saleId);
        insertKardexStmt.run(`kardex-10k-${i}`, variantAId, saleId);
      }
    })();

    const rec = reconcileReports(db);

    // 1. Total ventas vs Suma de turnos de caja
    expect(rec.salesVsShiftDriftCents).toBe(0n);
    expect(rec.salesTotalCents).toBe(115000000n); // 10,000 * 115.00 = C$ 1,150,000.00

    // 2. Total unidades vendidas vs Salidas de Kardex
    expect(rec.kardexVsSalesDriftMilli).toBe(0n);
    expect(rec.kardexSalesQtyMilli).toBe(10_000_000n); // 10,000 u

    // 3. Resumen diario de IVA vs Suma de líneas de facturas
    const dailyTax = getDailyTaxSummaryReport(db);
    const totalReportedIva = dailyTax.reduce((acc, r) => acc + r.taxCents, 0n);
    expect(totalReportedIva).toBe(15000000n); // C$ 150,000.00 IVA exacto
    expect(rec.ivaDriftCents).toBe(0n);

    // 4. Correlativo continuo sin huecos
    const book = getSalesBookReport(db);
    expect(book.missingNumbers['A']).toEqual([]);
  });
});
