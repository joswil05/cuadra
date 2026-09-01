import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../../src/main/db/migrator';
import { createDbConnection } from '../../../src/main/db/connection';
import { createSimpleProduct } from '../../../src/main/services/catalog.service';
import {
  getInventoryValuationReport,
  getMonthlyGrossIncomeReport
} from '../../../src/main/services/reports.service';

describe('Reportes en Renderer (renderer/reports)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();

    const p = createSimpleProduct(db, {
      name: 'Queso Crema 500g',
      sku: 'LAC-QUE-500',
      unitId: 1,
      priceCents: 9500n,
      userId: 1
    });

    db.prepare(`
      INSERT INTO inventory_moves (
        uid, warehouse_id, variant_id, direction, qty_milli, unit_cost_micros,
        total_cost_cents, balance_qty_milli, balance_avg_cost_micros,
        reason, user_id, at
      ) VALUES ('init-move-1', 1, ?, 'in', 20000, 70000000, 140000, 20000, 70000000, 'initial', 1, datetime('now'))
    `).run(p.variantId);

    db.prepare('UPDATE product_variants SET stock_milli = 20000, cost_avg_micros = 70000000 WHERE id = ?').run(p.variantId);
  });

  afterEach(() => {
    db.close();
  });

  it('Genera reporte de valorización de inventario con stock y costo promedio', () => {
    const valuation = getInventoryValuationReport(db);
    expect(valuation.length).toBe(1);
    expect(valuation[0]?.stockMilli).toBe(20000n); // 20 u
    expect(valuation[0]?.costAvgMicros).toBe(70_000_000n); // C$ 70.00
    expect(valuation[0]?.totalValuationCents).toBe(140000n); // C$ 1,400.00
  });

  it('Genera reporte de ingresos brutos mensuales', () => {
    const monthly = getMonthlyGrossIncomeReport(db);
    expect(Array.isArray(monthly)).toBe(true);
  });
});
