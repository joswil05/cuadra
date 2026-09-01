import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../../src/main/db/migrator';
import { createDbConnection } from '../../../src/main/db/connection';
import {
  createSimpleProduct,
  createProductWithGeneratedVariants,
  createInventoryAdjustment,
  getVariantKardex,
  getUndefinedTaxProducts,
  bulkUpdateProductsTaxRate,
  importProductsCsv,
  addVariantBarcode,
  getVariantBarcodes
} from '../../../src/main/services/catalog.service';

describe('Inventario y Catálogo (main/services/catalog)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();
  });

  afterEach(() => {
    db.close();
  });

  it('Prueba 2: Un producto simple recibe exactamente una variante, automáticamente', () => {
    const res = createSimpleProduct(db, {
      name: 'Aceite Corona 1L',
      sku: 'ACE-COR-001',
      barcode: '7411009999',
      unitId: 1,
      priceCents: 6500n,
      costMicros: 45_000_000n,
      tracksStock: true,
      userId: 1
    });

    expect(res.productId).toBeGreaterThan(0);
    expect(res.variantId).toBeGreaterThan(0);

    const variants = db.prepare('SELECT sku FROM product_variants WHERE product_id = ?').all(res.productId) as Array<{ sku: string }>;
    expect(variants.length).toBe(1);
    expect(variants[0]?.sku).toBe('ACE-COR-001');

    // Código de barras asociado automáticamente como primario
    const barcodes = getVariantBarcodes(db, res.variantId);
    expect(barcodes.length).toBe(1);
    expect(barcodes[0]?.code).toBe('7411009999');
    expect(barcodes[0]?.isPrimary).toBe(true);
  });

  it('Prueba 1: Generar variantes de 4 tallas por 3 colores produce 12 SKU con códigos únicos en la base de datos', () => {
    const res = createProductWithGeneratedVariants(db, {
      name: 'Camisa Oxford Manga Larga',
      baseSku: 'CAM-OXF',
      unitId: 1,
      axes: [
        { name: 'Talla', values: ['S', 'M', 'L', 'XL'] },
        { name: 'Color', values: ['Azul', 'Blanco', 'Negro'] }
      ],
      priceCents: 45000n,
      userId: 1
    });

    expect(res.productId).toBeGreaterThan(0);
    expect(res.variants.length).toBe(12);

    const skus = new Set(res.variants.map((v) => v.sku));
    expect(skus.size).toBe(12);

    const dbVariants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(res.productId);
    expect(dbVariants.length).toBe(12);
  });

  it('Prueba 3: Un ajuste queda en auditoría con su motivo y su usuario en el Kardex', () => {
    const prod = createSimpleProduct(db, {
      name: 'Galleta Oreo',
      sku: 'GAL-ORE-001',
      unitId: 1,
      priceCents: 1500n,
      costMicros: 10_000_000n,
      userId: 1
    });

    // Realizar ajuste manual de entrada
    const adj = createInventoryAdjustment(db, {
      warehouseId: 1,
      variantId: prod.variantId,
      direction: 'in',
      qtyMilli: 25_000n, // 25 unidades
      unitCostMicros: 10_000_000n,
      reason: 'adjustment_in',
      userId: 1,
      note: 'Conteo inicial por apertura'
    });

    expect(adj.moveId).toBeGreaterThan(0);

    const kardex = getVariantKardex(db, prod.variantId);
    expect(kardex.length).toBe(1);
    expect(kardex[0]?.reason).toBe('adjustment_in');
    expect(kardex[0]?.userId).toBe(1);
    expect(kardex[0]?.note).toBe('Conteo inicial por apertura');
    expect(kardex[0]?.balanceQtyMilli).toBe(25_000n);

    // Stock derivado actualizado
    const variantRow = db.prepare('SELECT stock_milli FROM product_variants WHERE id = ?').get(prod.variantId) as { stock_milli: number };
    expect(variantRow.stock_milli).toBe(25000);
  });

  it('Prueba 5: El reporte de «sin estatus de IVA definido» funciona y llega a cero tras la revisión masiva', () => {
    // Crear 3 productos simples que nacen sin estatus de IVA (tax_rate_id = NULL)
    const p1 = createSimpleProduct(db, { name: 'Prod A', sku: 'SKU-A', unitId: 1, priceCents: 1000n, userId: 1 });
    const p2 = createSimpleProduct(db, { name: 'Prod B', sku: 'SKU-B', unitId: 1, priceCents: 2000n, userId: 1 });
    const p3 = createSimpleProduct(db, { name: 'Prod C', sku: 'SKU-C', unitId: 1, priceCents: 3000n, userId: 1 });

    const undefinedList1 = getUndefinedTaxProducts(db);
    expect(undefinedList1.length).toBe(3);

    // Revisión masiva: asignar p1 y p2 a IVA 15% (tax_rate_id = 1)
    bulkUpdateProductsTaxRate(db, [p1.productId, p2.productId], 1);
    const undefinedList2 = getUndefinedTaxProducts(db);
    expect(undefinedList2.length).toBe(1);
    expect(undefinedList2[0]?.id).toBe(p3.productId);

    // Asignar p3 a Exento (tax_rate_id = 2)
    bulkUpdateProductsTaxRate(db, [p3.productId], 2);
    const undefinedList3 = getUndefinedTaxProducts(db);
    expect(undefinedList3.length).toBe(0);
  });

  it('Prueba 4: La importación de un CSV con 5 000 filas y 3 errores reporta los 3 y no aplica nada (0 cambios en DB)', () => {
    // Generar un CSV simulado con 5 000 filas válidas y 3 filas inválidas (líneas 100, 2500, 4999)
    const lines = ['nombre,sku,precio,costo,stock,unidad,iva'];

    for (let i = 1; i <= 5000; i++) {
      if (i === 100) {
        lines.push('Producto Invalido 100,,25.00,15.00,10,PZA,IVA15'); // SKU vacío
      } else if (i === 2500) {
        lines.push('Producto Invalido 2500,SKU-2500,-50.00,15.00,10,PZA,IVA15'); // Precio negativo
      } else if (i === 4999) {
        lines.push(',SKU-4999,10.00,5.00,10,PZA,EXENTO'); // Nombre vacío
      } else {
        lines.push(`Producto Regular ${i},SKU-${i},25.00,15.00,10,PZA,IVA15`);
      }
    }

    const csvContent = lines.join('\n');
    const importRes = importProductsCsv(db, csvContent, 1, 1);

    expect(importRes.ok).toBe(false);
    if (importRes.ok) return;

    expect(importRes.errors.length).toBe(3);
    expect(importRes.errors.some((e) => e.rowNumber === 101)).toBe(true); // header is line 1
    expect(importRes.errors.some((e) => e.rowNumber === 2501)).toBe(true);
    expect(importRes.errors.some((e) => e.rowNumber === 5000)).toBe(true);

    // Atomicidad: ningún producto fue insertado en la base de datos
    const totalProducts = db.prepare('SELECT COUNT(*) as total FROM products').get() as { total: number };
    expect(totalProducts.total).toBe(0);
  });

  it('Múltiples códigos de barras por variante con marcado de primario', () => {
    const prod = createSimpleProduct(db, {
      name: 'Jugo de Naranja 1L',
      sku: 'JUG-NAR-001',
      unitId: 1,
      priceCents: 4000n,
      userId: 1
    });

    addVariantBarcode(db, prod.variantId, '7411003001', true);
    addVariantBarcode(db, prod.variantId, '7411003002', false);
    addVariantBarcode(db, prod.variantId, '7411003003', false);

    const barcodes = getVariantBarcodes(db, prod.variantId);
    expect(barcodes.length).toBe(3);
    expect(barcodes.find((b) => b.code === '7411003001')?.isPrimary).toBe(true);
    expect(barcodes.find((b) => b.code === '7411003002')?.isPrimary).toBe(false);
  });
});
