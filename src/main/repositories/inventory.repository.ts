import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { withTransaction } from '../db/connection';
import { applyInbound, applyOutbound, CostState } from '../../core/costing';
import { mulDiv } from '../../core/money';

export type KardexDirection = 'in' | 'out';

export type KardexReason =
  | 'purchase'
  | 'sale'
  | 'sale_return'
  | 'purchase_return'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'count'
  | 'transfer_in'
  | 'transfer_out'
  | 'initial'
  | 'waste';

export interface CreateProductParams {
  name: string;
  sku: string;
  unitId: number;
  priceCents: bigint;
  taxRateId?: number;
  barcode?: string;
}

export interface InsertKardexMoveParams {
  warehouseId: number;
  variantId: number;
  direction: KardexDirection;
  qtyMilli: bigint;
  unitCostMicros: bigint;
  reason: KardexReason;
  userId?: number;
  note?: string;
  refType?: string;
  refId?: number;
  lotId?: number;
}

export interface DriftRecord {
  variantId: number;
  sku: string;
  cachedMilli: number;
  kardexMilli: number;
  driftMilli: number;
}

export interface ReconciliationResult {
  driftCount: number;
  drifts: DriftRecord[];
}

/**
 * Crea un producto y su variante predeterminada.
 */
export function createProductWithVariant(
  db: Database.Database,
  params: CreateProductParams
): { productId: number; variantId: number } {
  return withTransaction(db, () => {
    const productUid = crypto.randomUUID();
    const variantUid = crypto.randomUUID();

    const insertProd = db.prepare(`
      INSERT INTO products (uid, name, unit_id, tax_rate_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `);
    const prodRes = insertProd.run(
      productUid,
      params.name,
      params.unitId,
      params.taxRateId ?? null
    );
    const productId = Number(prodRes.lastInsertRowid);

    const insertVar = db.prepare(`
      INSERT INTO product_variants (uid, product_id, sku, price_cents, cost_avg_micros, stock_milli, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, 0, 1, datetime('now'), datetime('now'))
    `);
    const varRes = insertVar.run(
      variantUid,
      productId,
      params.sku,
      Number(params.priceCents)
    );
    const variantId = Number(varRes.lastInsertRowid);

    if (params.barcode) {
      db.prepare(`
        INSERT INTO barcodes (variant_id, code, is_primary)
        VALUES (?, ?, 1)
      `).run(variantId, params.barcode);
    }

    return { productId, variantId };
  });
}

/**
 * Inserta un movimiento atómico en el Kardex y actualiza la caché del producto.
 */
export function insertKardexMove(
  db: Database.Database,
  params: InsertKardexMoveParams
): number {
  return withTransaction(db, () => {
    // 1. Obtener estado actual de la variante
    const variant = db.prepare(`
      SELECT stock_milli, cost_avg_micros FROM product_variants WHERE id = ?
    `).get(params.variantId) as { stock_milli: number; cost_avg_micros: number } | undefined;

    if (!variant) {
      throw new Error(`Variante no encontrada: ${params.variantId}`);
    }

    const currentState: CostState = {
      stockMilli: BigInt(variant.stock_milli),
      avgCostMicros: BigInt(variant.cost_avg_micros)
    };

    let nextState: CostState;
    let effectiveUnitCostMicros = params.unitCostMicros;

    if (params.direction === 'in') {
      nextState = applyInbound(currentState, params.qtyMilli, params.unitCostMicros);
    } else {
      const outResult = applyOutbound(currentState, params.qtyMilli);
      nextState = outResult.state;
      effectiveUnitCostMicros = currentState.avgCostMicros;
    }

    const totalCostCents = mulDiv(params.qtyMilli, effectiveUnitCostMicros, 10_000_000n);
    const moveUid = crypto.randomUUID();

    // 2. Registrar movimiento inmutable en inventory_moves
    const insertMove = db.prepare(`
      INSERT INTO inventory_moves (
        uid, at, warehouse_id, variant_id, direction, reason, qty_milli,
        unit_cost_micros, total_cost_cents, balance_qty_milli, balance_avg_cost_micros,
        ref_type, ref_id, lot_id, user_id, note
      ) VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const moveRes = insertMove.run(
      moveUid,
      params.warehouseId,
      params.variantId,
      params.direction,
      params.reason,
      Number(params.qtyMilli),
      Number(effectiveUnitCostMicros),
      Number(totalCostCents),
      Number(nextState.stockMilli),
      Number(nextState.avgCostMicros),
      params.refType ?? null,
      params.refId ?? null,
      params.lotId ?? null,
      params.userId ?? null,
      params.note ?? null
    );

    // 3. Actualizar la caché de product_variants
    db.prepare(`
      UPDATE product_variants
      SET stock_milli = ?, cost_avg_micros = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      Number(nextState.stockMilli),
      Number(nextState.avgCostMicros),
      params.variantId
    );

    return Number(moveRes.lastInsertRowid);
  });
}

/**
 * Reconcilia la caché de existencias contra la suma del Kardex usando la vista v_stock_drift.
 */
export function reconcileInventory(db: Database.Database): ReconciliationResult {
  const rows = db.prepare(`
    SELECT
      variant_id AS variantId,
      sku,
      cached_milli AS cachedMilli,
      kardex_milli AS kardexMilli,
      drift_milli AS driftMilli
    FROM v_stock_drift
  `).all() as DriftRecord[];

  return {
    driftCount: rows.length,
    drifts: rows
  };
}
