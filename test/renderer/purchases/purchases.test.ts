import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../../src/main/db/migrator';
import { createDbConnection } from '../../../src/main/db/connection';
import { createSimpleProduct } from '../../../src/main/services/catalog.service';
import {
  createSupplier,
  createPurchase,
  receivePurchase,
  getPurchaseSummary
} from '../../../src/main/services/purchases.service';

describe('Compras y Proveedores en Renderer (renderer/purchases)', () => {
  let db: Database.Database;
  let supplierId: number;
  let variantId: number;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();

    const supp = createSupplier(db, {
      name: 'Compañía Cervecera de Nicaragua',
      docNumber: 'J0310000222222',
      phone: '+505 2249-0000',
      creditDays: 15
    });
    supplierId = supp.id;

    const prod = createSimpleProduct(db, {
      name: 'Toña 12oz Lata',
      sku: 'CER-TON-012',
      unitId: 1,
      priceCents: 4000n,
      userId: 1
    });
    variantId = prod.variantId;
  });

  afterEach(() => {
    db.close();
  });

  it('Calcula resumen de compra con flete, subtotales e impuestos para la vista de usuario', () => {
    const purchase = createPurchase(db, {
      supplierId,
      warehouseId: 1,
      freightCents: 10000n, // C$ 100.00
      lines: [
        {
          lineNo: 1,
          variantId,
          qtyMilli: 24_000n, // 24 unidades
          unitCostCents: 2500n, // C$ 25.00
          taxRateBp: 1500n
        }
      ],
      userId: 1
    });

    const summary = getPurchaseSummary(db, purchase.id);
    expect(summary).toBeDefined();
    expect(summary?.subtotalCents).toBe(60000n); // 24 * 25 = C$ 600.00
    expect(summary?.taxCents).toBe(9000n);       // 15% IVA = C$ 90.00
    expect(summary?.freightCents).toBe(10000n);  // C$ 100.00
    expect(summary?.totalCents).toBe(79000n);    // C$ 790.00
    expect(summary?.status).toBe('draft');

    receivePurchase(db, purchase.id, 1);
    const summaryAfter = getPurchaseSummary(db, purchase.id);
    expect(summaryAfter?.status).toBe('received');
  });
});
