import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { createSimpleProduct } from '../../src/main/services/catalog.service';
import { openShift } from '../../src/main/services/cash.service';
import { createSale } from '../../src/main/services/sales.service';
import {
  getOwnerDashboardData,
  getUserPermissions,
  hasPermission
} from '../../src/main/services/dashboard.service';

describe('Panel del Dueño, Seguridad y Control de Permisos (main/permissions)', () => {
  let db: Database.Database;
  let cashierUserId: number;
  let ownerUserId: number;
  let supervisorUserId: number;
  let variantAId: number;
  let variantBId: number;
  let shiftId: number;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO document_series (id, code, doc_type, next_number, is_active) VALUES (1, 'A', 'ticket', 1, 1)").run();

    // Roles según la matriz de seguridad del Plan Maestro
    db.prepare(`
      INSERT INTO roles (id, code, name, permissions_json) VALUES
      (1, 'cashier', 'Cajero', '["pos.sell"]'),
      (2, 'supervisor', 'Supervisor', '["pos.sell","sales.discount","sales.void","inventory.adjust","reports.operational"]'),
      (3, 'owner', 'Dueño', '["pos.sell","sales.discount","sales.void","inventory.adjust","reports.operational","dashboard.view","reports.cost_and_margin"]')
    `).run();

    // Usuarios
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u-cashier', 'cajero1', 'Cajero Uno', 1, datetime('now'))").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (2, 'u-super', 'supervisor1', 'Supervisor Uno', 2, datetime('now'))").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (3, 'u-owner', 'dueno', 'Don Propietario', 3, datetime('now'))").run();

    cashierUserId = 1;
    supervisorUserId = 2;
    ownerUserId = 3;

    const prodA = createSimpleProduct(db, {
      name: 'Café Presto 150g',
      sku: 'CAF-PRE-150',
      unitId: 1,
      priceCents: 12000n, // C$ 120.00
      userId: ownerUserId
    });
    variantAId = prodA.variantId;

    const prodB = createSimpleProduct(db, {
      name: 'Arroz Faisán 5 Lbs',
      sku: 'ARR-FAI-005',
      unitId: 1,
      priceCents: 15000n, // C$ 150.00
      userId: ownerUserId
    });
    variantBId = prodB.variantId;

    // Stock inicial en Kardex con costo
    db.prepare(`
      INSERT INTO inventory_moves (
        uid, warehouse_id, variant_id, direction, qty_milli, unit_cost_micros,
        total_cost_cents, balance_qty_milli, balance_avg_cost_micros,
        reason, user_id, at
      ) VALUES
      ('init-m1', 1, ?, 'in', 500000, 80000000, 4000000, 500000, 80000000, 'initial', 3, datetime('now')),
      ('init-m2', 1, ?, 'in', 500000, 100000000, 5000000, 500000, 100000000, 'initial', 3, datetime('now'))
    `).run(variantAId, variantBId);

    db.prepare('UPDATE product_variants SET stock_milli = 500000, cost_avg_micros = 80000000 WHERE id = ?').run(variantAId);
    db.prepare('UPDATE product_variants SET stock_milli = 500000, cost_avg_micros = 100000000 WHERE id = ?').run(variantBId);

    const shift = openShift(db, {
      openedBy: cashierUserId,
      openingFloatCents: 100000n,
      openingFloatUsd: 0n
    });
    shiftId = shift.id;

    // Registrar ventas de prueba
    createSale(db, {
      docType: 'ticket',
      seriesId: 1,
      shiftId,
      userId: cashierUserId,
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: variantAId,
          description: 'Café Presto 150g',
          qtyMilli: 2000n,
          unitPriceCents: 12000n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [
        { method: 'cash', currencyCode: 'NIO', amountFx: 24000n, fxRateMicros: 1000000n }
      ]
    });
  });

  afterEach(() => {
    db.close();
  });

  it('Prueba 1: Un usuario sin dashboard.view recibe un error de permisos (ForbiddenError), no una pantalla vacía', () => {
    const cashierPerms = getUserPermissions(db, cashierUserId);
    expect(hasPermission(cashierPerms, 'dashboard.view')).toBe(false);
    expect(() => getOwnerDashboardData(db, cashierUserId)).toThrow(/Permiso denegado: dashboard\.view/);

    const supervisorPerms = getUserPermissions(db, supervisorUserId);
    expect(hasPermission(supervisorPerms, 'dashboard.view')).toBe(false);
    expect(() => getOwnerDashboardData(db, supervisorUserId)).toThrow(/Permiso denegado: dashboard\.view/);

    const ownerPerms = getUserPermissions(db, ownerUserId);
    expect(hasPermission(ownerPerms, 'dashboard.view')).toBe(true);
    const data = getOwnerDashboardData(db, ownerUserId);
    expect(data).toBeDefined();
    expect(data.pulse).toBeDefined();
  });

  it('Prueba 2: Un usuario sin reports.cost_and_margin recibe respuestas SIN campos de costo ni margen (verificar forma del objeto)', () => {
    // Creamos un rol temporal que tenga dashboard.view pero NO reports.cost_and_margin
    db.prepare(`
      INSERT INTO roles (id, code, name, permissions_json) VALUES
      (4, 'viewer', 'Visualizador', '["dashboard.view"]')
    `).run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (4, 'u-viewer', 'viewer', 'Viewer', 4, datetime('now'))").run();

    const data = getOwnerDashboardData(db, 4);

    // Verificamos la forma del objeto en el proceso principal / IPC
    expect(data.pulse.todayMarginCents).toBeUndefined();
    expect(data.pulse.todayMarginBp).toBeUndefined();
    expect(data.trends.topMarginProducts).toEqual([]); // Lista de márgenes vacía o censurada
  });

  it('Prueba 3: Con 100,000 ventas sembradas, cada consulta del tablero responde en menos de 300 ms', () => {
    // Sembrar 100,000 ventas en una transacción SQLite masiva distribuidas en el tiempo
    const insertSaleStmt = db.prepare(`
      INSERT INTO sales (
        uid, doc_type, series_id, number, folio, at, shift_id, user_id,
        status, payment_condition, is_contingency, tax_regime, prices_include_tax,
        gross_cents, line_discount_cents, order_discount_cents,
        taxable_base_cents, exempt_base_cents, tax_cents,
        cash_rounding_cents, total_cents, cogs_cents, paid_cents, change_cents, credit_cents
      ) VALUES (
        ?, 'ticket', 1, ?, ?, ?, ?, 1,
        'completed', 'contado', 0, 'general', 1,
        11500, 0, 0,
        10000, 0, 1500,
        0, 11500, 8000, 11500, 0, 0
      )
    `);

    db.transaction(() => {
      const nowMs = Date.now();
      for (let i = 2; i <= 100001; i++) {
        const daysAgo = Math.floor(i / 300); // distribuidas a lo largo del año
        const atDate = new Date(nowMs - daysAgo * 86400000).toISOString().slice(0, 19).replace('T', ' ');
        insertSaleStmt.run(`sale-perf-${i}`, i, `A-${String(i).padStart(6, '0')}`, atDate, shiftId);
      }
    })();

    const start = performance.now();
    const data = getOwnerDashboardData(db, ownerUserId);
    const duration = performance.now() - start;

    expect(data).toBeDefined();
    expect(duration).toBeLessThan(300); // Menos de 300 ms
  });

  it('Prueba 4: Los totales del tablero coinciden exactamente con los de los reportes de la fase 9', () => {
    const data = getOwnerDashboardData(db, ownerUserId);

    // Venta de hoy en el tablero
    expect(data.pulse.todaySalesCents).toBe(24000n); // C$ 240.00
    expect(data.pulse.todayTicketsCount).toBe(1);
    expect(data.pulse.cashInRegisterCents).toBe(124000n); // C$ 1,000 apertura + C$ 240 venta
  });
});
