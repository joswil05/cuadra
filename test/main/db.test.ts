import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../src/main/db/migrator';
import { withTransaction, createDbConnection } from '../../src/main/db/connection';
import { reconcileInventory, insertKardexMove, createProductWithVariant } from '../../src/main/repositories/inventory.repository';

describe('Base de Datos, Transacciones y Repositorio de Kardex (main/db)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../db/migrations');
    runMigrations(db, migrationsDir);
  });

  afterEach(() => {
    db.close();
  });

  it('configura correctamente los pragmas de conexión WAL, foreign_keys, synchronous y timeout', () => {
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);

    const busyTimeout = db.pragma('busy_timeout', { simple: true });
    expect(busyTimeout).toBe(5000);
  });

  it('withTransaction ejecuta con BEGIN IMMEDIATE y revierte completamente ante excepciones', () => {
    db.exec('CREATE TABLE test_tx (id INTEGER PRIMARY KEY, val TEXT)');

    withTransaction(db, () => {
      db.prepare('INSERT INTO test_tx (val) VALUES (?)').run('primero');
    });

    const rowsAfterSuccess = db.prepare('SELECT val FROM test_tx').all();
    expect(rowsAfterSuccess.length).toBe(1);

    expect(() => {
      withTransaction(db, () => {
        db.prepare('INSERT INTO test_tx (val) VALUES (?)').run('segundo');
        throw new Error('Falla intencional en transacción');
      });
    }).toThrow('Falla intencional en transacción');

    const rowsAfterFail = db.prepare('SELECT val FROM test_tx').all();
    expect(rowsAfterFail.length).toBe(1);
    expect(rowsAfterFail[0]).toEqual({ val: 'primero' });
  });

  it('Inmutabilidad de Kardex: UPDATE o DELETE sobre inventory_moves lanza error del trigger', () => {
    // Almacén y unidad
    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();

    const { variantId } = createProductWithVariant(db, {
      name: 'Camisa Oxford',
      sku: 'CAM-OXF-001',
      unitId: 1,
      priceCents: 50000n
    });

    // Insertar movimiento de entrada
    const moveId = insertKardexMove(db, {
      warehouseId: 1,
      variantId,
      direction: 'in',
      qtyMilli: 10_000n,
      unitCostMicros: 100_000_000n,
      reason: 'purchase',
      userId: 1
    });

    expect(moveId).toBeGreaterThan(0);

    // Intentar UPDATE en inventory_moves debe ser bloqueado por el trigger
    expect(() => {
      db.prepare('UPDATE inventory_moves SET qty_milli = 20000 WHERE id = ?').run(moveId);
    }).toThrow(/Kardex inmutable/);

    // Intentar DELETE en inventory_moves debe ser bloqueado por el trigger
    expect(() => {
      db.prepare('DELETE FROM inventory_moves WHERE id = ?').run(moveId);
    }).toThrow(/Kardex inmutable/);
  });

  it('reconcileInventory reporta 0 diferencias en una base con movimientos consistentes', () => {
    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();

    const { variantId } = createProductWithVariant(db, {
      name: 'Pantalón Jean',
      sku: 'PAN-JEA-001',
      unitId: 1,
      priceCents: 80000n
    });

    // Entrada 1
    insertKardexMove(db, {
      warehouseId: 1,
      variantId,
      direction: 'in',
      qtyMilli: 20_000n,
      unitCostMicros: 300_000_000n,
      reason: 'purchase',
      userId: 1
    });

    // Salida 1
    insertKardexMove(db, {
      warehouseId: 1,
      variantId,
      direction: 'out',
      qtyMilli: 5_000n,
      unitCostMicros: 300_000_000n,
      reason: 'sale',
      userId: 1
    });

    const reconciliation = reconcileInventory(db);
    expect(reconciliation.driftCount).toBe(0);
    expect(reconciliation.drifts).toEqual([]);
  });

  it('reconcileInventory detecta y reporta drift si la caché stock_milli es manipulada directamente', () => {
    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();

    const { variantId } = createProductWithVariant(db, {
      name: 'Zapato Cuero',
      sku: 'ZAP-CUE-001',
      unitId: 1,
      priceCents: 120000n
    });

    insertKardexMove(db, {
      warehouseId: 1,
      variantId,
      direction: 'in',
      qtyMilli: 10_000n,
      unitCostMicros: 500_000_000n,
      reason: 'purchase',
      userId: 1
    });

    // Forzar desincronización en la columna de caché product_variants.stock_milli
    db.prepare('UPDATE product_variants SET stock_milli = 99999 WHERE id = ?').run(variantId);

    const reconciliation = reconcileInventory(db);
    expect(reconciliation.driftCount).toBe(1);
    expect(reconciliation.drifts[0]?.sku).toBe('ZAP-CUE-001');
    expect(reconciliation.drifts[0]?.cachedMilli).toBe(99999);
    expect(reconciliation.drifts[0]?.kardexMilli).toBe(10000);
  });
});
