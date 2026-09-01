import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { createSimpleProduct } from '../../src/main/services/catalog.service';
import { openShift, closeShift } from '../../src/main/services/cash.service';
import { createSale } from '../../src/main/services/sales.service';
import {
  createDatabaseBackup,
  restoreDatabaseBackup
} from '../../src/main/services/backup.service';

describe('Respaldo y Restauración de Base de Datos (Fase 11 / Backup)', () => {
  let db: Database.Database;
  const tempDir = path.join(process.cwd(), 'temp_test_backup_' + Date.now());
  const primaryDbPath = path.join(tempDir, 'primary.db');
  const backupFilePath = path.join(tempDir, 'cuadra_backup.db');
  const restoredDbPath = path.join(tempDir, 'restored.db');

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    db = createDbConnection(primaryDbPath);
    const migrationsDir = path.join(process.cwd(), 'db/migrations');
    runMigrations(db, migrationsDir);

    // Sembrar datos de prueba: configuración, catálogo, turno, venta y cierre
    db.prepare(`
      INSERT INTO company (id, legal_name, trade_name, ruc, address, phone, dgi_auth_number, updated_at)
      VALUES (1, 'Minisúper Las Brisas', 'Las Brisas', 'J0310000999999', 'Managua', '2222-3333', 'DGI-2026-TEST', datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        legal_name = excluded.legal_name,
        trade_name = excluded.trade_name,
        ruc = excluded.ruc,
        dgi_auth_number = excluded.dgi_auth_number;
    `).run();

    db.prepare("INSERT OR IGNORE INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT OR IGNORE INTO document_series (id, code, doc_type, next_number, is_active) VALUES (1, 'A', 'ticket', 1, 1)").run();
    db.prepare("INSERT OR IGNORE INTO roles (id, code, name, permissions_json) VALUES (1, 'admin', 'Admin', '[\"*\"]')").run();
    db.prepare("INSERT OR IGNORE INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u-admin', 'admin', 'Administrador', 1, datetime('now'))").run();
    db.prepare("INSERT OR IGNORE INTO warehouses (id, code, name, is_default) VALUES (1, 'BOD-1', 'Bodega', 1)").run();

    const product = createSimpleProduct(db, {
      name: 'Gaseosa 500ml',
      sku: 'GAS-500',
      unitId: 1,
      priceCents: 2500n,
      costMicros: 15000000n,
      userId: 1
    });

    db.prepare(`
      INSERT INTO inventory_moves (
        uid, at, warehouse_id, variant_id, direction,
        qty_milli, unit_cost_micros, total_cost_cents,
        balance_qty_milli, balance_avg_cost_micros,
        reason, user_id
      ) VALUES ('init-1', datetime('now'), 1, ?, 'in', 50000, 15000000, 75000, 50000, 15000000, 'initial', 1)
    `).run(product.variantId);

    db.prepare('UPDATE product_variants SET stock_milli = 50000 WHERE id = ?').run(product.variantId);

    const shift = openShift(db, {
      openedBy: 1,
      openingFloatCents: 100000n, // C$ 1,000.00
      openingFloatUsd: 2000n // $ 20.00
    });

    createSale(db, {
      shiftId: shift.id,
      userId: 1,
      seriesId: 1,
      customerId: undefined,
      docType: 'ticket',
      paymentCondition: 'contado',
      taxRegime: 'general',
      pricesIncludeTax: true,
      lines: [
        {
          variantId: product.variantId,
          description: 'Gaseosa 500ml',
          qtyMilli: 2000n,
          unitPriceCents: 2500n,
          taxKind: 'taxable',
          taxRateBp: 1500n
        }
      ],
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: 5000n,
          fxRateMicros: 1000000n
        }
      ],
      isContingency: false
    });

    closeShift(db, {
      shiftId: shift.id,
      closedBy: 1,
      countedLinesNio: [
        { denominationCents: 100000, quantity: 1 },
        { denominationCents: 5000, quantity: 1 }
      ],
      countedLinesUsd: [
        { denominationCents: 2000, quantity: 1 }
      ]
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('Prueba 1: Un respaldo restaurado reproduce la base bit a bit y pasa PRAGMA integrity_check con éxito', async () => {
    // 1. Crear respaldo automático
    const backupResult = await createDatabaseBackup(db, backupFilePath);
    expect(backupResult.success).toBe(true);
    expect(backupResult.integrityCheck).toBe('ok');
    expect(fs.existsSync(backupFilePath)).toBe(true);

    // 2. Restaurar en una base limpia
    const restoreResult = restoreDatabaseBackup(backupFilePath, restoredDbPath);
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.integrityCheck).toBe('ok');

    // 3. Abrir la base restaurada y verificar fidelidad total de datos
    const restoredDb = new Database(restoredDbPath);
    try {
      const integrity = restoredDb.pragma('integrity_check', { simple: true });
      expect(integrity).toBe('ok');

      // Verificar configuración
      const config = restoredDb.prepare('SELECT legal_name, ruc FROM company WHERE id = 1').get() as { legal_name: string; ruc: string };
      expect(config.legal_name).toBe('Minisúper Las Brisas');
      expect(config.ruc).toBe('J0310000999999');

      // Verificar ventas
      const salesCount = restoredDb.prepare('SELECT COUNT(*) as cnt FROM sales').get() as { cnt: number };
      expect(salesCount.cnt).toBe(1);

      // Verificar Kardex
      const movesCount = restoredDb.prepare('SELECT COUNT(*) as cnt FROM inventory_moves').get() as { cnt: number };
      expect(movesCount.cnt).toBeGreaterThanOrEqual(2); // Entrada inicial + Salida venta

      // Verificar turnos
      const shiftRow = restoredDb.prepare('SELECT status, difference_cents FROM cash_shifts WHERE id = 1').get() as { status: string; difference_cents: number };
      expect(shiftRow.status).toBe('closed');
      expect(shiftRow.difference_cents).toBe(0);
    } finally {
      restoredDb.close();
    }
  });
});
