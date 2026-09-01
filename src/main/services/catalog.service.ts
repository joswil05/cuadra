import Database from 'better-sqlite3';
import {
  generateVariantMatrix,
  VariantAxisInput,
  parseCsvString,
  parseProductCsvRow,
  CsvProductImportRow,
  UndefinedTaxProduct,
  InventoryAdjustmentParams,
  KardexEntry
} from '../../core/inventory';
import { insertKardexMove } from '../repositories/inventory.repository';

export interface CreateSimpleProductParams {
  name: string;
  sku: string;
  unitId: number;
  categoryId?: number;
  barcode?: string;
  priceCents?: bigint;
  costMicros?: bigint;
  taxRateId?: number | null;
  tracksStock?: boolean;
  tracksLots?: boolean;
  description?: string;
  attributesJson?: string;
  userId: number;
}

export interface CreateSimpleProductResult {
  productId: number;
  variantId: number;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Crea un producto simple y su única variante automáticamente asociada.
 */
export function createSimpleProduct(
  db: Database.Database,
  params: CreateSimpleProductParams
): CreateSimpleProductResult {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const productUid = uid();
    const variantUid = uid();

    const prodInsert = db.prepare(`
      INSERT INTO products (
        uid, name, kind, category_id, unit_id, tax_rate_id,
        tracks_stock, tracks_lots, description, attributes_json,
        is_active, created_at, updated_at
      ) VALUES (?, ?, 'product', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      productUid,
      params.name,
      params.categoryId ?? null,
      params.unitId,
      params.taxRateId ?? null,
      params.tracksStock === false ? 0 : 1,
      params.tracksLots ? 1 : 0,
      params.description ?? null,
      params.attributesJson ?? '{}',
      now,
      now
    );

    const productId = Number(prodInsert.lastInsertRowid);

    const variantInsert = db.prepare(`
      INSERT INTO product_variants (
        uid, product_id, sku, price_cents, cost_avg_micros,
        stock_milli, min_stock_milli, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?, ?)
    `).run(
      variantUid,
      productId,
      params.sku,
      Number(params.priceCents ?? 0n),
      Number(params.costMicros ?? 0n),
      now,
      now
    );

    const variantId = Number(variantInsert.lastInsertRowid);

    if (params.barcode) {
      addVariantBarcode(db, variantId, params.barcode, true);
    }

    return { productId, variantId };
  })();
}

export interface CreateProductWithVariantsParams {
  name: string;
  baseSku: string;
  unitId: number;
  categoryId?: number;
  axes: VariantAxisInput[];
  priceCents?: bigint;
  taxRateId?: number | null;
  description?: string;
  userId: number;
}

export interface CreateProductWithVariantsResult {
  productId: number;
  variants: Array<{ variantId: number; sku: string }>;
}

/**
 * Crea un producto con matriz de variantes generadas automáticamente por sus ejes.
 */
export function createProductWithGeneratedVariants(
  db: Database.Database,
  params: CreateProductWithVariantsParams
): CreateProductWithVariantsResult {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const productUid = uid();

    const prodInsert = db.prepare(`
      INSERT INTO products (
        uid, name, kind, category_id, unit_id, tax_rate_id,
        tracks_stock, tracks_lots, description, attributes_json,
        is_active, created_at, updated_at
      ) VALUES (?, ?, 'product', ?, ?, ?, 1, 0, ?, '{}', 1, ?, ?)
    `).run(
      productUid,
      params.name,
      params.categoryId ?? null,
      params.unitId,
      params.taxRateId ?? null,
      params.description ?? null,
      now,
      now
    );

    const productId = Number(prodInsert.lastInsertRowid);
    const generated = generateVariantMatrix(params.baseSku, params.axes, params.priceCents ?? 0n);
    const createdVariants: Array<{ variantId: number; sku: string }> = [];

    for (const v of generated) {
      const vUid = uid();
      const insert = db.prepare(`
        INSERT INTO product_variants (
          uid, product_id, sku, opt1_name, opt1_value, opt2_name, opt2_value,
          opt3_name, opt3_value, price_cents, cost_avg_micros, stock_milli,
          min_stock_milli, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, ?, ?)
      `).run(
        vUid,
        productId,
        v.sku,
        v.opt1Name ?? null,
        v.opt1Value ?? null,
        v.opt2Name ?? null,
        v.opt2Value ?? null,
        v.opt3Name ?? null,
        v.opt3Value ?? null,
        Number(v.priceCents),
        now,
        now
      );

      createdVariants.push({
        variantId: Number(insert.lastInsertRowid),
        sku: v.sku
      });
    }

    return { productId, variants: createdVariants };
  })();
}

export interface BarcodeItem {
  id: number;
  variantId: number;
  code: string;
  isPrimary: boolean;
}

/**
 * Agrega un código de barras a una variante, marcándolo opcionalmente como primario.
 */
export function addVariantBarcode(
  db: Database.Database,
  variantId: number,
  code: string,
  isPrimary = false
): void {
  db.transaction(() => {
    if (isPrimary) {
      db.prepare('UPDATE barcodes SET is_primary = 0 WHERE variant_id = ?').run(variantId);
    }

    db.prepare(`
      INSERT INTO barcodes (variant_id, code, is_primary)
      VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET is_primary = excluded.is_primary
    `).run(variantId, code, isPrimary ? 1 : 0);
  })();
}

/**
 * Obtiene los códigos de barras asociados a una variante.
 */
export function getVariantBarcodes(db: Database.Database, variantId: number): BarcodeItem[] {
  const rows = db.prepare(`
    SELECT id, variant_id, code, is_primary
    FROM barcodes
    WHERE variant_id = ?
    ORDER BY is_primary DESC, id ASC
  `).all(variantId) as Array<{ id: number; variant_id: number; code: string; is_primary: number }>;

  return rows.map((r) => ({
    id: r.id,
    variantId: r.variant_id,
    code: r.code,
    isPrimary: r.is_primary === 1
  }));
}

export interface InventoryAdjustmentResult {
  moveId: number;
}

/**
 * Realiza un ajuste de inventario con auditoría obligatoria de usuario y motivo en Kardex.
 */
export function createInventoryAdjustment(
  db: Database.Database,
  params: InventoryAdjustmentParams
): InventoryAdjustmentResult {
  const moveId = insertKardexMove(db, {
    warehouseId: params.warehouseId,
    variantId: params.variantId,
    direction: params.direction,
    qtyMilli: params.qtyMilli,
    unitCostMicros: params.unitCostMicros ?? 0n,
    reason: params.reason,
    userId: params.userId,
    note: params.note
  });

  return { moveId };
}

/**
 * Obtiene el Kardex inmutable completo de una variante ordenado cronológicamente.
 */
export function getVariantKardex(
  db: Database.Database,
  variantId: number,
  warehouseId?: number
): KardexEntry[] {
  let query = `
    SELECT
      id, at, warehouse_id, variant_id, direction, qty_milli,
      unit_cost_micros, total_cost_cents, balance_qty_milli,
      balance_avg_cost_micros, reason, user_id, note
    FROM inventory_moves
    WHERE variant_id = ?
  `;
  const args: (string | number)[] = [variantId];

  if (warehouseId) {
    query += ' AND warehouse_id = ?';
    args.push(warehouseId);
  }

  query += ' ORDER BY id ASC';

  const rows = db.prepare(query).all(...args) as Array<{
    id: number;
    at: string;
    warehouse_id: number;
    variant_id: number;
    direction: string;
    qty_milli: number;
    unit_cost_micros: number;
    total_cost_cents: number;
    balance_qty_milli: number;
    balance_avg_cost_micros: number;
    reason: string;
    user_id: number | null;
    note: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    warehouseId: r.warehouse_id,
    variantId: r.variant_id,
    direction: r.direction as 'in' | 'out',
    qtyMilli: BigInt(r.qty_milli),
    unitCostMicros: BigInt(r.unit_cost_micros),
    totalCostCents: BigInt(r.total_cost_cents),
    balanceQtyMilli: BigInt(r.balance_qty_milli),
    balanceAvgCostMicros: BigInt(r.balance_avg_cost_micros),
    reason: r.reason,
    userId: r.user_id,
    note: r.note
  }));
}

/**
 * Reporte de productos sin estatus de IVA definido (tax_rate_id = NULL).
 */
export function getUndefinedTaxProducts(db: Database.Database): UndefinedTaxProduct[] {
  const rows = db.prepare(`
    SELECT p.id, p.name, v.sku, v.price_cents, p.created_at
    FROM products p
    JOIN product_variants v ON v.product_id = p.id
    WHERE p.tax_rate_id IS NULL AND p.is_active = 1
    ORDER BY p.id ASC
  `).all() as Array<{
    id: number;
    name: string;
    sku: string;
    price_cents: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    priceCents: BigInt(r.price_cents),
    createdAt: r.created_at
  }));
}

/**
 * Actualiza masivamente el estatus de IVA de múltiples productos seleccionados.
 */
export function bulkUpdateProductsTaxRate(
  db: Database.Database,
  productIds: number[],
  taxRateId: number
): void {
  if (productIds.length === 0) return;
  const placeholders = productIds.map(() => '?').join(',');
  db.prepare(`
    UPDATE products
    SET tax_rate_id = ?, updated_at = datetime('now')
    WHERE id IN (${placeholders})
  `).run(taxRateId, ...productIds);
}

export interface ImportCsvError {
  rowNumber: number;
  message: string;
}

export type ImportProductsResult =
  | { ok: true; importedCount: number }
  | { ok: false; errors: ImportCsvError[] };

/**
 * Importación atómica de catálogo desde archivo CSV.
 * Si alguna fila falla, no se aplica NINGÚN cambio en la base de datos y se reportan todos los errores.
 */
export function importProductsCsv(
  db: Database.Database,
  csvContent: string,
  warehouseId = 1,
  userId = 1
): ImportProductsResult {
  const parsedRows = parseCsvString(csvContent);
  if (parsedRows.length === 0) {
    return { ok: false, errors: [{ rowNumber: 1, message: 'El archivo CSV está vacío o no contiene filas' }] };
  }

  const validRows: CsvProductImportRow[] = [];
  const errors: ImportCsvError[] = [];

  // 1. Fase de validación completa en memoria
  for (const { rowNumber, data } of parsedRows) {
    const parseResult = parseProductCsvRow(data, rowNumber);
    if (!parseResult.ok) {
      for (const err of parseResult.errors) {
        errors.push({ rowNumber, message: err });
      }
    } else {
      validRows.push(parseResult.row);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // 2. Fase de inserción atómica en SQLite
  try {
    return db.transaction(() => {
      // Buscar unidades y tasas de IVA
      const unitsMap = new Map<string, number>();
      const dbUnits = db.prepare('SELECT id, code FROM units').all() as Array<{ id: number; code: string }>;
      dbUnits.forEach((u) => unitsMap.set(u.code.toUpperCase(), u.id));

      const taxRatesMap = new Map<string, number>();
      const dbTax = db.prepare('SELECT id, code FROM tax_rates').all() as Array<{ id: number; code: string }>;
      dbTax.forEach((t) => taxRatesMap.set(t.code.toUpperCase(), t.id));

      const defaultUnitId = dbUnits[0]?.id ?? 1;

      for (const row of validRows) {
        const unitId = unitsMap.get(row.unitCode.toUpperCase()) ?? defaultUnitId;
        const taxRateId = row.taxStatus ? taxRatesMap.get(row.taxStatus.toUpperCase()) ?? null : null;

        const prod = createSimpleProduct(db, {
          name: row.name,
          sku: row.sku,
          barcode: row.barcode,
          unitId,
          priceCents: row.priceCents,
          costMicros: row.costMicros,
          taxRateId,
          tracksStock: true,
          userId
        });

        // Si trae stock inicial > 0, registrar entrada en Kardex
        if (row.stockMilli > 0n) {
          insertKardexMove(db, {
            warehouseId,
            variantId: prod.variantId,
            direction: 'in',
            qtyMilli: row.stockMilli,
            unitCostMicros: row.costMicros,
            reason: 'initial',
            userId,
            note: 'Carga inicial desde CSV'
          });
        }
      }

      const res: ImportProductsResult = { ok: true, importedCount: validRows.length };
      return res;
    })();
  } catch (err: unknown) {
    return {
      ok: false,
      errors: [{ rowNumber: 0, message: err instanceof Error ? err.message : String(err) }]
    };
  }
}
