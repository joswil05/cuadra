import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { createSimpleProduct } from '../../src/main/services/catalog.service';
import { openShift } from '../../src/main/services/cash.service';
import {
  createSupplier,
  createPurchase,
  receivePurchase,
  cancelPurchaseReception,
  paySupplier
} from '../../src/main/services/purchases.service';

describe('Compras, Proveedores y Costeo con Flete (main/services/purchases)', () => {
  let db: Database.Database;
  let supplierId: number;
  let variantAId: number;
  let shiftId: number;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();

    const supp = createSupplier(db, {
      name: 'Distribuidora La Famosa, S.A.',
      docNumber: 'J0310000999999',
      phone: '+505 2270-1111',
      creditDays: 30
    });
    supplierId = supp.id;

    const prodA = createSimpleProduct(db, {
      name: 'Aceite Corona 1L',
      sku: 'ACE-COR-001',
      unitId: 1,
      priceCents: 6500n,
      userId: 1
    });
    variantAId = prodA.variantId;

    const shift = openShift(db, {
      openedBy: 1,
      openingFloatCents: 50000n,
      openingFloatUsd: 0n
    });
    shiftId = shift.id;
  });

  afterEach(() => {
    db.close();
  });

  it('Prueba 1: Recibir una compra con flete mueve el costo promedio al valor calculado a mano, al micro', () => {
    // 1. Crear compra borrador: 100 unidades a C$ 40.00 (4,000.00) + C$ 500.00 de flete
    // Costo landed = (4,000 + 500) / 100 = C$ 45.00 = 45,000,000 micros
    const purchase = createPurchase(db, {
      supplierId,
      warehouseId: 1,
      supplierDoc: 'FAC-PROV-1234',
      freightCents: 50000n, // C$ 500.00
      lines: [
        {
          lineNo: 1,
          variantId: variantAId,
          qtyMilli: 100_000n, // 100 unidades
          unitCostCents: 4000n, // C$ 40.00
          taxRateBp: 1500n,
          lotCode: 'LOTE-2026-A',
          expiresOn: '2027-12-31'
        }
      ],
      userId: 1
    });

    expect(purchase.id).toBeGreaterThan(0);
    expect(purchase.totalCents).toBe(510000n); // 4000*100 + IVA (600) + Flete (500) = C$ 5,100.00

    // 2. Recibir la compra
    const receiveRes = receivePurchase(db, purchase.id, 1);
    expect(receiveRes.ok).toBe(true);

    // 3. Verificar que el CPP en product_variants sea exactamente 45,000,000 micros
    const variantRow = db.prepare('SELECT stock_milli, cost_avg_micros FROM product_variants WHERE id = ?').get(variantAId) as { stock_milli: number; cost_avg_micros: number };
    expect(variantRow.stock_milli).toBe(100000);
    expect(variantRow.cost_avg_micros).toBe(45_000_000); // 45.00 Córdobas exactos

    // 4. Verificar lote registrado en inventory_lots
    const lotRow = db.prepare('SELECT lot_code, qty_milli, expires_on FROM inventory_lots WHERE variant_id = ?').get(variantAId) as { lot_code: string; qty_milli: number; expires_on: string };
    expect(lotRow.lot_code).toBe('LOTE-2026-A');
    expect(lotRow.qty_milli).toBe(100000);
    expect(lotRow.expires_on).toBe('2027-12-31');
  });

  it('Prueba 2: Cancelar una recepción revierte con movimientos inversos, sin editar el Kardex', () => {
    const purchase = createPurchase(db, {
      supplierId,
      warehouseId: 1,
      freightCents: 0n,
      lines: [
        {
          lineNo: 1,
          variantId: variantAId,
          qtyMilli: 50_000n,
          unitCostCents: 3000n,
          taxRateBp: 0n
        }
      ],
      userId: 1
    });

    receivePurchase(db, purchase.id, 1);

    // Stock = 50 u
    let vRow = db.prepare('SELECT stock_milli FROM product_variants WHERE id = ?').get(variantAId) as { stock_milli: number };
    expect(vRow.stock_milli).toBe(50000);

    // Cancelar la recepción
    const cancelRes = cancelPurchaseReception(db, purchase.id, 1, 'Error en orden de compra');
    expect(cancelRes.ok).toBe(true);

    // Stock vuelve a 0
    vRow = db.prepare('SELECT stock_milli FROM product_variants WHERE id = ?').get(variantAId) as { stock_milli: number };
    expect(vRow.stock_milli).toBe(0);

    // Kardex tiene 2 movimientos inmutables: entrada 'purchase' y salida 'purchase_return'
    const moves = db.prepare('SELECT direction, reason, qty_milli FROM inventory_moves WHERE variant_id = ? ORDER BY id ASC').all(variantAId) as Array<{ direction: string; reason: string; qty_milli: number }>;
    expect(moves.length).toBe(2);
    expect(moves[0]?.direction).toBe('in');
    expect(moves[0]?.reason).toBe('purchase');
    expect(moves[1]?.direction).toBe('out');
    expect(moves[1]?.reason).toBe('purchase_return');
  });

  it('Pago a proveedor en efectivo descuenta la deuda y registra salida en cash_movements', () => {
    const purchase = createPurchase(db, {
      supplierId,
      warehouseId: 1,
      freightCents: 0n,
      lines: [
        {
          lineNo: 1,
          variantId: variantAId,
          qtyMilli: 10_000n,
          unitCostCents: 2000n,
          taxRateBp: 0n
        }
      ],
      userId: 1
    });
    receivePurchase(db, purchase.id, 1);

    // Pagar C$ 200.00 en efectivo desde la caja abierta
    const payRes = paySupplier(db, {
      supplierId,
      purchaseId: purchase.id,
      shiftId,
      method: 'cash',
      currencyCode: 'NIO',
      amountCents: 20000n,
      userId: 1,
      note: 'Pago de factura contado'
    });

    expect(payRes.ok).toBe(true);

    // Verificar movimiento de caja negativo (salida)
    const cashMove = db.prepare("SELECT type, amount_cents FROM cash_movements WHERE type = 'supplier_payment'").get() as { type: string; amount_cents: number };
    expect(cashMove).toBeDefined();
    expect(cashMove.amount_cents).toBe(-20000); // Salida con signo negativo
  });
});
