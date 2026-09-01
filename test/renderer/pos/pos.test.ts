import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../../src/main/db/migrator';
import { createDbConnection } from '../../../src/main/db/connection';
import { createProductWithVariant, insertKardexMove } from '../../../src/main/repositories/inventory.repository';
import { openShift } from '../../../src/main/services/cash.service';
import {
  createPosCart,
  calculatePosCartDocument
} from '../../../src/core/pos';
import {
  searchProductsPos,
  scanProductToCart,
  updateCartLineQty,
  suspendCart,
  resumeCart,
  getSuspendedCarts,
  tenderPosCart
} from '../../../src/main/services/pos.service';

describe('Punto de Venta (POS) — Flujo de Teclado, Carrito, Búsqueda y Cobro', () => {
  let db: Database.Database;
  let variantAId: number;
  let variantBExemptId: number;
  let shiftId: number;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();

    db.prepare(`
      INSERT INTO document_series (id, doc_type, code, prefix, next_number, is_active)
      VALUES
        (1, 'ticket', 'T', 'T-', 1, 1),
        (2, 'invoice', 'F', 'F-', 1, 1)
    `).run();

    const prodA = createProductWithVariant(db, {
      name: 'Coca-Cola 600ml',
      sku: 'BEB-COC-600',
      barcode: '7411001001',
      unitId: 1,
      priceCents: 3000n,
      taxRateId: 1
    });
    variantAId = prodA.variantId;

    const prodB = createProductWithVariant(db, {
      name: 'Arroz 1lb',
      sku: 'GRA-ARR-001',
      barcode: '7411002002',
      unitId: 1,
      priceCents: 2000n,
      taxRateId: 2
    });
    variantBExemptId = prodB.variantId;

    // Cargar inventario inicial
    insertKardexMove(db, {
      warehouseId: 1,
      variantId: variantAId,
      direction: 'in',
      qtyMilli: 10_000n, // 10 unidades
      unitCostMicros: 20_000_000n,
      reason: 'initial',
      userId: 1
    });

    insertKardexMove(db, {
      warehouseId: 1,
      variantId: variantBExemptId,
      direction: 'in',
      qtyMilli: 5_000n, // 5 unidades
      unitCostMicros: 15_000_000n,
      reason: 'initial',
      userId: 1
    });

    const shift = openShift(db, {
      openedBy: 1,
      openingFloatCents: 50000n,
      openingFloatUsd: 1000n
    });
    shiftId = shift.id;
  });

  afterEach(() => {
    db.close();
  });

  it('Búsqueda instantánea FTS5 encuentra productos por SKU, código de barras o nombre con tolerancia', () => {
    const res1 = searchProductsPos(db, 'coca');
    expect(res1.length).toBe(1);
    expect(res1[0]?.sku).toBe('BEB-COC-600');

    const res2 = searchProductsPos(db, '7411002002');
    expect(res2.length).toBe(1);
    expect(res2[0]?.sku).toBe('GRA-ARR-001');
  });

  it('Prueba 1: Venta completa por teclado simulada de principio a fin (con 3*código, cobro bimoneda)', () => {
    let cart = createPosCart();

    // 1. Escanear 1 Coca-Cola por código de barras
    const scan1 = scanProductToCart(db, cart, '7411001001');
    expect(scan1.ok).toBe(true);
    if (!scan1.ok) return;
    cart = scan1.cart;

    // 2. Escanear con multiplicador: 3 * GRA-ARR-001
    const scan2 = scanProductToCart(db, cart, '3*GRA-ARR-001');
    expect(scan2.ok).toBe(true);
    if (!scan2.ok) return;
    cart = scan2.cart;

    expect(cart.lines.length).toBe(2);
    expect(cart.lines[0]?.qtyMilli).toBe(1000n);
    expect(cart.lines[1]?.qtyMilli).toBe(3000n);

    // Calcular totales
    const doc = calculatePosCartDocument(cart, 'general', true, true);
    expect(doc.grossCents).toBe(9000n); // 3000 + 3*2000
    expect(doc.totalCents).toBe(9000n);

    // 3. Cobro bimoneda (F12)
    const tenderRes = tenderPosCart(db, {
      cart,
      seriesId: 1,
      shiftId,
      userId: 1,
      taxRegime: 'general',
      pricesIncludeTax: true,
      payments: [
        { method: 'cash', currencyCode: 'USD', amountFx: 200n, fxRateMicros: 36600000n, amountCents: 7320n },
        { method: 'cash', currencyCode: 'NIO', amountFx: 2000n, fxRateMicros: 1000000n, amountCents: 2000n }
      ]
    });

    expect(tenderRes.ok).toBe(true);
    if (!tenderRes.ok) return;

    expect(tenderRes.sale.folio).toBe('T-000001');
    expect(tenderRes.sale.totalCents).toBe(9000n);
    expect(tenderRes.sale.paidCents).toBe(9320n);
    expect(tenderRes.sale.changeCents).toBe(320n);
  });

  it('Prueba 3: Escanear un código inexistente muestra un error sin perder el carrito', () => {
    let cart = createPosCart();
    const scan1 = scanProductToCart(db, cart, 'BEB-COC-600');
    expect(scan1.ok).toBe(true);
    if (!scan1.ok) return;
    cart = scan1.cart;
    expect(cart.lines.length).toBe(1);

    // Escanear código que no existe
    const scanInvalid = scanProductToCart(db, cart, 'CODIGO_NO_EXISTE_999');
    expect(scanInvalid.ok).toBe(false);
    if (scanInvalid.ok) return;

    expect(scanInvalid.error).toContain('no encontrado');
    // El carrito no se perdió y mantiene la línea previa
    expect(cart.lines.length).toBe(1);
    expect(cart.lines[0]?.sku).toBe('BEB-COC-600');
  });

  it('Prueba 4: Vender sin existencia se bloquea con mensaje claro y el carrito sobrevive', () => {
    let cart = createPosCart();

    // Intentar agregar 15 unidades de Coca-Cola cuando solo hay 10 en stock
    const scanTooMuch = scanProductToCart(db, cart, '15*BEB-COC-600');
    expect(scanTooMuch.ok).toBe(false);
    if (scanTooMuch.ok) return;

    expect(scanTooMuch.error).toContain('Stock insuficiente');
    expect(cart.lines.length).toBe(0);

    // Agregar cantidad válida (2)
    const scanValid = scanProductToCart(db, cart, '2*BEB-COC-600');
    expect(scanValid.ok).toBe(true);
    if (!scanValid.ok) return;
    cart = scanValid.cart;

    // Ahora intentar subir la cantidad en la línea existente a 20 con F4 (+)
    const updateTooMuch = updateCartLineQty(db, cart, 1, 20000n);
    expect(updateTooMuch.ok).toBe(false);
    if (updateTooMuch.ok) return;

    expect(updateTooMuch.error).toContain('Stock insuficiente');
    // La línea sobrevive con su cantidad previa (2)
    expect(cart.lines[0]?.qtyMilli).toBe(2000n);
  });

  it('Suspender ticket (F7) y recuperarlo (F8) mantiene intactas las líneas', () => {
    let cart = createPosCart();
    const scan1 = scanProductToCart(db, cart, 'BEB-COC-600');
    if (!scan1.ok) return;
    cart = scan1.cart;

    const suspendedId = suspendCart(cart, 'Cliente fue al cajero');
    expect(suspendedId).toBeDefined();

    const suspendedList = getSuspendedCarts();
    expect(suspendedList.length).toBe(1);
    expect(suspendedList[0]?.note).toBe('Cliente fue al cajero');

    // Recuperar
    const recovered = resumeCart(suspendedId);
    expect(recovered).toBeDefined();
    expect(recovered?.lines.length).toBe(1);
    expect(recovered?.lines[0]?.sku).toBe('BEB-COC-600');

    // Tras recuperar, la lista de suspendidos queda vacía
    expect(getSuspendedCarts().length).toBe(0);
  });
});
