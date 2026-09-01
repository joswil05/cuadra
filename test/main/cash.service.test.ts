import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { createProductWithVariant, insertKardexMove } from '../../src/main/repositories/inventory.repository';
import {
  openShift,
  closeShift,
  getShiftBlind
} from '../../src/main/services/cash.service';
import { createSale } from '../../src/main/services/sales.service';

describe('Turnos de Caja, Arqueo y Cierre Ciego (main/services/cash)', () => {
  let db: Database.Database;
  let variantId: number;

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
      VALUES (1, 'ticket', 'T', 'T-', 1, 1)
    `).run();

    const prod = createProductWithVariant(db, {
      name: 'Galletas Chiky',
      sku: 'GAL-CHI-001',
      unitId: 1,
      priceCents: 1500n,
      taxRateId: 2
    });
    variantId = prod.variantId;

    insertKardexMove(db, {
      warehouseId: 1,
      variantId,
      direction: 'in',
      qtyMilli: 1_000_000n,
      unitCostMicros: 10_000_000n,
      reason: 'initial',
      userId: 1
    });
  });

  afterEach(() => {
    db.close();
  });

  it('Abre turno de caja y registra fondo inicial en ambas monedas', () => {
    const shift = openShift(db, {
      openedBy: 1,
      openingFloatCents: 50000n,
      openingFloatUsd: 2000n
    });

    expect(shift.status).toBe('open');
    expect(shift.openingFloatCents).toBe(50000n);
    expect(shift.openingFloatUsd).toBe(2000n);

    expect(() => {
      openShift(db, {
        openedBy: 1,
        openingFloatCents: 10000n,
        openingFloatUsd: 0n
      });
    }).toThrow();
  });

  it('Prueba 7: Cierre Ciego — el importe esperado NO se revela antes de confirmar el conteo', () => {
    const shift = openShift(db, {
      openedBy: 1,
      openingFloatCents: 20000n,
      openingFloatUsd: 1000n
    });

    createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId: shift.id,
      userId: 1,
      taxRegime: 'cuota_fija',
      pricesIncludeTax: true,
      lines: [
        {
          variantId,
          description: 'Galletas Chiky',
          unitPriceCents: 1500n,
          qtyMilli: 1000n,
          lineDiscountCents: 0n,
          taxKind: 'exempt',
          taxRateBp: 0n
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: 1500n,
          fxRateMicros: 1000000n,
          amountCents: 1500n
        }
      ]
    });

    const blindSummary = getShiftBlind(db, shift.id);
    expect(blindSummary.status).toBe('open');
    expect('expectedCents' in blindSummary).toBe(false);
    expect('expectedUsd' in blindSummary).toBe(false);
    expect('differenceCents' in blindSummary).toBe(false);
  });

  it('Prueba 6: Turno simulado de 300 ventas mixtas cierra con diferencia cero en las dos monedas', () => {
    const shift = openShift(db, {
      openedBy: 1,
      openingFloatCents: 50000n,
      openingFloatUsd: 10000n
    });

    let totalNioCashIn = 50000n;
    let totalUsdCashIn = 10000n;
    const fxRateMicros = 36600000n;

    for (let i = 0; i < 150; i++) {
      createSale(db, {
        docType: 'ticket',
        seriesId: 1,
        shiftId: shift.id,
        userId: 1,
        taxRegime: 'cuota_fija',
        pricesIncludeTax: true,
        lines: [
          {
            variantId,
            description: 'Galletas Chiky',
            unitPriceCents: 1500n,
            qtyMilli: 1000n,
            lineDiscountCents: 0n,
            taxKind: 'exempt',
            taxRateBp: 0n
          }
        ],
        payments: [
          {
            method: 'cash',
            currencyCode: 'NIO',
            amountFx: 1500n,
            fxRateMicros: 1000000n,
            amountCents: 1500n
          }
        ]
      });
      totalNioCashIn += 1500n;
    }

    for (let i = 0; i < 150; i++) {
      createSale(db, {
        docType: 'ticket',
        seriesId: 1,
        shiftId: shift.id,
        userId: 1,
        taxRegime: 'cuota_fija',
        pricesIncludeTax: true,
        lines: [
          {
            variantId,
            description: 'Galletas Chiky',
            unitPriceCents: 1500n,
            qtyMilli: 2000n,
            lineDiscountCents: 0n,
            taxKind: 'exempt',
            taxRateBp: 0n
          }
        ],
        payments: [
          {
            method: 'cash',
            currencyCode: 'USD',
            amountFx: 100n,
            fxRateMicros,
            amountCents: 3660n
          }
        ]
      });
      totalUsdCashIn += 100n;
      totalNioCashIn -= 660n;
    }

    const closeRes = closeShift(db, {
      shiftId: shift.id,
      closedBy: 1,
      countedLinesNio: [
        { denominationCents: 100, quantity: Number(totalNioCashIn / 100n) }
      ],
      countedLinesUsd: [
        { denominationCents: 100, quantity: Number(totalUsdCashIn / 100n) }
      ]
    });

    expect(closeRes.differenceCents).toBe(0n);
    expect(closeRes.differenceUsd).toBe(0n);
    expect(closeRes.countedCents).toBe(totalNioCashIn);
    expect(closeRes.countedUsd).toBe(totalUsdCashIn);
    expect(closeRes.status).toBe('closed');
  });
});
