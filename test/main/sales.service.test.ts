import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { createProductWithVariant, insertKardexMove } from '../../src/main/repositories/inventory.repository';
import { openShift } from '../../src/main/services/cash.service';
import {
  createSale,
  createCreditNote,
  voidSale,
  CreateSaleInput,
  SalePaymentInput
} from '../../src/main/services/sales.service';

describe('Venta Atómica, Series y Notas de Crédito (main/services/sales)', () => {
  let db: Database.Database;
  let shiftId: number;
  let variantAId: number;
  let variantBExemptId: number;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();

    db.prepare(`
      INSERT INTO document_series (id, doc_type, code, prefix, next_number, is_active)
      VALUES
        (1, 'ticket', 'T', 'T-', 1, 1),
        (2, 'invoice', 'F', 'F-', 1, 1),
        (3, 'credit_note', 'NC', 'NC-', 1, 1)
    `).run();

    const prodA = createProductWithVariant(db, {
      name: 'Coca-Cola 600ml',
      sku: 'BEB-COC-600',
      unitId: 1,
      priceCents: 3000n,
      taxRateId: 1
    });
    variantAId = prodA.variantId;

    const prodB = createProductWithVariant(db, {
      name: 'Arroz 1lb',
      sku: 'GRA-ARR-001',
      unitId: 1,
      priceCents: 2000n,
      taxRateId: 2
    });
    variantBExemptId = prodB.variantId;

    insertKardexMove(db, {
      warehouseId: 1,
      variantId: variantAId,
      direction: 'in',
      qtyMilli: 100_000n,
      unitCostMicros: 20_000_000n,
      reason: 'initial',
      userId: 1
    });

    insertKardexMove(db, {
      warehouseId: 1,
      variantId: variantBExemptId,
      direction: 'in',
      qtyMilli: 100_000n,
      unitCostMicros: 15_000_000n,
      reason: 'initial',
      userId: 1
    });

    const shift = openShift(db, {
      openedBy: 1,
      openingFloatCents: 100000n,
      openingFloatUsd: 5000n
    });
    shiftId = shift.id;
  });

  afterEach(() => {
    db.close();
  });

  it('Prueba 1: Una falla inyectada en cualquier paso de la venta no deja rastro y NO consume el correlativo', () => {
    const seriesBefore = db.prepare('SELECT next_number FROM document_series WHERE id = 1').get() as { next_number: number };
    expect(seriesBefore.next_number).toBe(1);

    const invalidPayment: SalePaymentInput = {
      method: 'cash',
      currencyCode: 'NIO',
      amountFx: 6000n,
      fxRateMicros: 1000000n,
      amountCents: 6000n
    };

    const invalidSaleInput: CreateSaleInput = {
      docType: 'invalid_doc_type' as unknown as CreateSaleInput['docType'],
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variantAId,
          description: 'Coca-Cola 600ml',
          unitPriceCents: 3000n,
          qtyMilli: 2000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [invalidPayment]
    };

    expect(() => createSale(db, invalidSaleInput)).toThrow();

    const salesCount = (db.prepare('SELECT COUNT(*) as c FROM sales').get() as { c: number }).c;
    expect(salesCount).toBe(0);

    const movesCount = (db.prepare("SELECT COUNT(*) as c FROM inventory_moves WHERE reason = 'sale'").get() as { c: number }).c;
    expect(movesCount).toBe(0);

    const cashCount = (db.prepare("SELECT COUNT(*) as c FROM cash_movements WHERE type = 'sale'").get() as { c: number }).c;
    expect(cashCount).toBe(0);

    const seriesAfter = db.prepare('SELECT next_number FROM document_series WHERE id = 1').get() as { next_number: number };
    expect(seriesAfter.next_number).toBe(1);
  });

  it('Prueba 2: Venta con IVA incluido, línea exenta, redondeo de efectivo y pago en USD cumple sus tres CHECKs', () => {
    const sale = createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variantAId,
          description: 'Coca-Cola 600ml',
          unitPriceCents: 3000n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        },
        {
          variantId: variantBExemptId,
          description: 'Arroz 1lb',
          unitPriceCents: 2000n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'exempt',
          taxRateBp: 0n
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'USD',
          amountFx: 200n,
          fxRateMicros: 36624300n,
          amountCents: 7325n
        }
      ]
    });

    expect(sale.folio).toBe('T-000001');
    expect(sale.totalCents).toBe(5000n);
    expect(sale.paidCents).toBe(7325n);
    expect(sale.changeCents).toBe(2325n);

    interface SaleCheckRow {
      total_cents: number;
      taxable_base_cents: number;
      exempt_base_cents: number;
      tax_cents: number;
      cash_rounding_cents: number;
      paid_cents: number;
      credit_cents: number;
      change_cents: number;
    }

    const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(sale.id) as SaleCheckRow;
    expect(row.total_cents).toBe(5000);
    expect(row.taxable_base_cents + row.exempt_base_cents + row.tax_cents + row.cash_rounding_cents).toBe(5000);
    expect(row.paid_cents + row.credit_cents - row.change_cents).toBe(5000);
  });

  it('Prueba 3: Un total descuadrado por un solo centavo es rechazado por la restricción CHECK de SQLite', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO sales (
          uid, doc_type, series_id, number, folio, at, shift_id, user_id,
          tax_regime, prices_include_tax, taxable_base_cents, exempt_base_cents,
          tax_cents, cash_rounding_cents, total_cents, paid_cents, change_cents, credit_cents
        ) VALUES (
          's-descuadrada', 'ticket', 1, 999, 'T-999', datetime('now'), ?, 1,
          'general', 1, 2609, 2000, 391, 0, 5001, 5000, 0, 0
        )
      `).run(shiftId);
    }).toThrow(/CHECK constraint failed/);
  });

  it('Prueba 4: Cobrar IVA con tax_regime = "cuota_fija" es rechazado por restricción CHECK', () => {
    expect(() => {
      db.prepare(`
        INSERT INTO sales (
          uid, doc_type, series_id, number, folio, at, shift_id, user_id,
          tax_regime, prices_include_tax, taxable_base_cents, exempt_base_cents,
          tax_cents, cash_rounding_cents, total_cents, paid_cents, change_cents, credit_cents
        ) VALUES (
          's-cuotafija-iva', 'ticket', 1, 998, 'T-998', datetime('now'), ?, 1,
          'cuota_fija', 1, 2609, 0, 391, 0, 3000, 3000, 0, 0
        )
      `).run(shiftId);
    }).toThrow(/CHECK constraint failed/);
  });

  it('Prueba 5: Dos ventas consecutivas obtienen correlativos estrictamente correlativos y sin colisión', () => {
    const sale1 = createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variantAId,
          description: 'Coca-Cola 600ml',
          unitPriceCents: 3000n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: 3000n,
          fxRateMicros: 1000000n,
          amountCents: 3000n
        }
      ]
    });

    const sale2 = createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variantAId,
          description: 'Coca-Cola 600ml',
          unitPriceCents: 3000n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: 3000n,
          fxRateMicros: 1000000n,
          amountCents: 3000n
        }
      ]
    });

    expect(sale1.number).toBe(1);
    expect(sale1.folio).toBe('T-000001');

    expect(sale2.number).toBe(2);
    expect(sale2.folio).toBe('T-000002');
  });

  it('Nota de crédito consume su propia serie y revierte inventario y caja', () => {
    const sale = createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variantAId,
          description: 'Coca-Cola 600ml',
          unitPriceCents: 3000n,
          qtyMilli: 2000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: 6000n,
          fxRateMicros: 1000000n,
          amountCents: 6000n
        }
      ]
    });

    const varStockAfterSale = (db.prepare('SELECT stock_milli FROM product_variants WHERE id = ?').get(variantAId) as { stock_milli: number }).stock_milli;
    expect(varStockAfterSale).toBe(98000);

    const nc = createCreditNote(db, {
      parentSaleId: sale.id,
      seriesId: 3,
      shiftId,
      userId: 1,
      reason: 'Devolución de cliente',
      lines: [
        {
          lineNo: 1,
          qtyMilli: 1000n
        }
      ],
      refundMethod: 'cash'
    });

    expect(nc.docType).toBe('credit_note');
    expect(nc.folio).toBe('NC-000001');
    expect(nc.totalCents).toBe(3000n);

    const varStockAfterNC = (db.prepare('SELECT stock_milli FROM product_variants WHERE id = ?').get(variantAId) as { stock_milli: number }).stock_milli;
    expect(varStockAfterNC).toBe(99000);
  });

  // --- Deuda F3: 5 pruebas exigidas ---

  it('1. voidSale rechaza una venta más vieja que sales.void_window_minutes', () => {
    const sale = createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variantAId,
          description: 'Coca-Cola 600ml',
          unitPriceCents: 3000n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: 3000n,
          fxRateMicros: 1000000n,
          amountCents: 3000n
        }
      ]
    });

    // Simular que la venta ocurrió hace 20 minutos (superando la ventana de 15 min)
    db.prepare("UPDATE sales SET at = datetime('now', '-20 minutes') WHERE id = ?").run(sale.id);

    expect(() => {
      voidSale(db, {
        saleId: sale.id,
        userId: 1,
        reason: 'Anulación tardía'
      });
    }).toThrow(/Ventana de anulación expirada/);
  });

  it('2. voidSale revierte el Kardex y el movimiento de caja de la venta anulada', () => {
    const initialStock = (db.prepare('SELECT stock_milli FROM product_variants WHERE id = ?').get(variantAId) as { stock_milli: number }).stock_milli;

    const sale = createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variantAId,
          description: 'Coca-Cola 600ml',
          unitPriceCents: 3000n,
          qtyMilli: 2000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: 6000n,
          fxRateMicros: 1000000n,
          amountCents: 6000n
        }
      ]
    });

    expect((db.prepare('SELECT stock_milli FROM product_variants WHERE id = ?').get(variantAId) as { stock_milli: number }).stock_milli).toBe(initialStock - 2000);

    voidSale(db, {
      saleId: sale.id,
      userId: 1,
      reason: 'Cliente canceló antes de entregar ticket'
    });

    const finalStock = (db.prepare('SELECT stock_milli FROM product_variants WHERE id = ?').get(variantAId) as { stock_milli: number }).stock_milli;
    expect(finalStock).toBe(initialStock);

    const returnMove = db.prepare("SELECT * FROM inventory_moves WHERE ref_type = 'sale' AND ref_id = ? AND direction = 'in'").get(sale.id);
    expect(returnMove).toBeDefined();

    const cashReversal = db.prepare("SELECT * FROM cash_movements WHERE ref_type = 'sale' AND ref_id = ? AND type = 'sale_refund'").get(sale.id);
    expect(cashReversal).toBeDefined();
  });

  it("3. Un pago con method:'credit' produce creditCents > 0 y una fila en customer_ledger", () => {
    db.prepare(`
      INSERT INTO customers (id, uid, code, name, credit_limit_cents, created_at, updated_at)
      VALUES (1, 'c1', 'CLI-001', 'Juan Pérez', 500000, datetime('now'), datetime('now'))
    `).run();

    const sale = createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: 1,
      customerId: 1,
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variantAId,
          description: 'Coca-Cola 600ml',
          unitPriceCents: 3000n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [
        {
          method: 'credit',
          currencyCode: 'NIO',
          amountFx: 3000n,
          fxRateMicros: 1000000n,
          amountCents: 3000n
        }
      ]
    });

    expect(sale.creditCents).toBe(3000n);

    const ledger = db.prepare('SELECT amount_cents, type FROM customer_ledger WHERE customer_id = 1 AND ref_id = ?').get(sale.id) as { amount_cents: number; type: string };
    expect(ledger).toBeDefined();
    expect(ledger.type).toBe('charge');
    expect(ledger.amount_cents).toBe(3000);
  });

  it('4. Una venta con crédito y sin customerId es rechazada', () => {
    expect(() => {
      createSale(db, {
        docType: 'ticket',
        seriesId: 1,
        shiftId,
        userId: 1,
        // customerId ausente
        taxRegime: 'general',
        pricesIncludeTax: true,
        lines: [
          {
            variantId: variantAId,
            description: 'Coca-Cola 600ml',
            unitPriceCents: 3000n,
            qtyMilli: 1000n,
            lineDiscountCents: 0n,
            taxKind: 'taxable',
            taxRateBp: 1500n
          }
        ],
        payments: [
          {
            method: 'credit',
            currencyCode: 'NIO',
            amountFx: 3000n,
            fxRateMicros: 1000000n,
            amountCents: 3000n
          }
        ]
      });
    }).toThrow(/Cliente requerido para venta a crédito/);
  });

  it('5. El correlativo bajo dos transacciones concurrentes obtiene números consecutivos sin colisión', async () => {
    const tempDbPath = path.resolve(__dirname, `../../test-concurrent-${Date.now()}.db`);
    const db1 = createDbConnection(tempDbPath);
    const migrationsDir = path.resolve(__dirname, '../../db/migrations');
    runMigrations(db1, migrationsDir);

    db1.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db1.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db1.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db1.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();
    db1.prepare("INSERT INTO document_series (id, doc_type, code, prefix, next_number, is_active) VALUES (1, 'ticket', 'T', 'T-', 1, 1)").run();

    const prod = createProductWithVariant(db1, {
      name: 'Producto Concurrente',
      sku: 'PRD-CNC-001',
      unitId: 1,
      priceCents: 1000n
    });

    insertKardexMove(db1, {
      warehouseId: 1,
      variantId: prod.variantId,
      direction: 'in',
      qtyMilli: 100_000n,
      unitCostMicros: 5_000_000n,
      reason: 'initial',
      userId: 1
    });

    const s = openShift(db1, { openedBy: 1, openingFloatCents: 10000n });

    const db2 = createDbConnection(tempDbPath);

    const saleInput1: CreateSaleInput = {
      docType: 'ticket',
      seriesId: 1,
      shiftId: s.id,
      userId: 1,
      taxRegime: 'cuota_fija',
      pricesIncludeTax: true,
      lines: [{ variantId: prod.variantId, description: 'Prod', unitPriceCents: 1000n, qtyMilli: 1000n, lineDiscountCents: 0n, taxKind: 'exempt', taxRateBp: 0n }],
      payments: [{ method: 'cash', currencyCode: 'NIO', amountFx: 1000n, fxRateMicros: 1000000n, amountCents: 1000n }]
    };

    const saleInput2: CreateSaleInput = {
      ...saleInput1
    };

    const [res1, res2] = await Promise.all([
      new Promise<{ number: number; folio: string }>((resolve) => setTimeout(() => resolve(createSale(db1, saleInput1)), 0)),
      new Promise<{ number: number; folio: string }>((resolve) => setTimeout(() => resolve(createSale(db2, saleInput2)), 0))
    ]);

    const numbers = [res1.number, res2.number].sort();
    expect(numbers).toEqual([1, 2]);
    expect(res1.folio !== res2.folio).toBe(true);

    db1.close();
    db2.close();
    try {
      const fs = await import('fs');
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      if (fs.existsSync(`${tempDbPath}-wal`)) fs.unlinkSync(`${tempDbPath}-wal`);
      if (fs.existsSync(`${tempDbPath}-shm`)) fs.unlinkSync(`${tempDbPath}-shm`);
    } catch {
      // ignore
    }
  });
});
