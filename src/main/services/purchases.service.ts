import Database from 'better-sqlite3';
import {
  prorateFreightToLines,
  SupplierItem,
  CreateSupplierParams,
  CreatePurchaseParams,
  PurchaseSummary,
  PaySupplierParams,
  ReceivePurchaseResult,
  PaySupplierResult
} from '../../core/purchases';
import { insertKardexMove } from '../repositories/inventory.repository';

export type { SupplierItem, CreateSupplierParams, CreatePurchaseParams, PurchaseSummary, PaySupplierParams, ReceivePurchaseResult, PaySupplierResult };

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export interface CreateSupplierInput {
  name: string;
  docNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  creditDays?: number;
}

/**
 * Registra un nuevo proveedor en la base de datos.
 */
export function createSupplier(
  db: Database.Database,
  params: CreateSupplierInput
): SupplierItem {
  const supplierUid = uid();
  const now = new Date().toISOString();

  const res = db.prepare(`
    INSERT INTO suppliers (
      uid, name, doc_number, phone, email, address,
      credit_days, attributes_json, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 1, ?, ?)
  `).run(
    supplierUid,
    params.name,
    params.docNumber ?? null,
    params.phone ?? null,
    params.email ?? null,
    params.address ?? null,
    params.creditDays ?? 0,
    now,
    now
  );

  return {
    id: Number(res.lastInsertRowid),
    uid: supplierUid,
    name: params.name,
    docNumber: params.docNumber ?? null,
    phone: params.phone ?? null,
    email: params.email ?? null,
    address: params.address ?? null,
    creditDays: params.creditDays ?? 0
  };
}

/**
 * Obtiene la lista de proveedores activos.
 */
export function getSuppliers(db: Database.Database): SupplierItem[] {
  const rows = db.prepare(`
    SELECT id, uid, name, doc_number, phone, email, address, credit_days
    FROM suppliers
    WHERE is_active = 1
    ORDER BY name ASC
  `).all() as Array<{
    id: number;
    uid: string;
    name: string;
    doc_number: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    credit_days: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    uid: r.uid,
    name: r.name,
    docNumber: r.doc_number,
    phone: r.phone,
    email: r.email,
    address: r.address,
    creditDays: r.credit_days
  }));
}

/**
 * Crea una orden de compra con prorrateo de flete preparado.
 */
export function createPurchase(
  db: Database.Database,
  params: CreatePurchaseParams
): PurchaseSummary {
  return db.transaction(() => {
    const purchaseUid = uid();
    const folio = `OC-${String(Date.now()).slice(-6)}`;
    const now = new Date().toISOString();
    const freightCents = params.freightCents ?? 0n;

    // Prorratear flete a las líneas
    const proratedLines = prorateFreightToLines(params.lines, freightCents);

    const subtotalCents = proratedLines.reduce((acc, l) => acc + l.baseTotalCents, 0n);
    const taxCents = proratedLines.reduce((acc, l) => acc + l.taxCents, 0n);
    const totalCents = subtotalCents + taxCents + freightCents;

    const res = db.prepare(`
      INSERT INTO purchases (
        uid, folio, supplier_id, warehouse_id, at, status,
        supplier_doc, subtotal_cents, tax_cents, freight_cents,
        total_cents, paid_cents, user_id, note
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      purchaseUid,
      folio,
      params.supplierId,
      params.warehouseId,
      now,
      params.supplierDoc ?? null,
      Number(subtotalCents),
      Number(taxCents),
      Number(freightCents),
      Number(totalCents),
      params.userId,
      params.note ?? null
    );

    const purchaseId = Number(res.lastInsertRowid);

    // Insertar purchase_lines
    const insertLineStmt = db.prepare(`
      INSERT INTO purchase_lines (
        purchase_id, line_no, variant_id, qty_milli, unit_cost_cents,
        landed_unit_cost_micros, tax_rate_bp, tax_cents, total_cents,
        lot_code, expires_on
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const l of proratedLines) {
      insertLineStmt.run(
        purchaseId,
        l.lineNo,
        l.variantId,
        Number(l.qtyMilli),
        Number(l.unitCostCents),
        Number(l.landedUnitCostMicros),
        Number(l.taxRateBp),
        Number(l.taxCents),
        Number(l.totalCents),
        l.lotCode ?? null,
        l.expiresOn ?? null
      );
    }

    const summary: PurchaseSummary = {
      id: purchaseId,
      uid: purchaseUid,
      folio,
      supplierId: params.supplierId,
      warehouseId: params.warehouseId,
      at: now,
      status: 'draft',
      supplierDoc: params.supplierDoc ?? null,
      subtotalCents,
      taxCents,
      freightCents,
      totalCents,
      paidCents: 0n,
      receivedAt: null,
      note: params.note ?? null,
      lines: proratedLines
    };

    return summary;
  })();
}

/**
 * Recibe una compra de mercancía:
 * 1. Genera entradas inmutables en Kardex con el costo unitario con flete (landedUnitCostMicros).
 * 2. Recalcula el costo promedio ponderado (CPP) de las variantes.
 * 3. Registra lotes y caducidades en inventory_lots.
 * 4. Pasa el estado de la compra a 'received'.
 */
export function receivePurchase(
  db: Database.Database,
  purchaseId: number,
  userId: number
): ReceivePurchaseResult {
  try {
    return db.transaction(() => {
      const purchase = db.prepare(`
        SELECT id, warehouse_id, status, freight_cents, folio
        FROM purchases
        WHERE id = ?
      `).get(purchaseId) as {
        id: number;
        warehouse_id: number;
        status: string;
        freightCents: number;
        folio: string;
      } | undefined;

      if (!purchase) {
        const errRes: ReceivePurchaseResult = { ok: false, error: `Compra no encontrada: ${purchaseId}` };
        return errRes;
      }

      if (purchase.status !== 'draft') {
        const errRes: ReceivePurchaseResult = { ok: false, error: `La compra ya fue recibida o cancelada (${purchase.status})` };
        return errRes;
      }

      const lines = db.prepare(`
        SELECT id, line_no, variant_id, qty_milli, unit_cost_cents,
               landed_unit_cost_micros, lot_code, expires_on
        FROM purchase_lines
        WHERE purchase_id = ?
        ORDER BY line_no ASC
      `).all(purchaseId) as Array<{
        id: number;
        line_no: number;
        variant_id: number;
        qty_milli: number;
        unit_cost_cents: number;
        landed_unit_cost_micros: number;
        lot_code: string | null;
        expires_on: string | null;
      }>;

      const now = new Date().toISOString();

      for (const line of lines) {
        const qtyMilli = BigInt(line.qty_milli);
        const unitCostMicros = BigInt(line.landed_unit_cost_micros);

        // 1. Entrada de Kardex
        insertKardexMove(db, {
          warehouseId: purchase.warehouse_id,
          variantId: line.variant_id,
          direction: 'in',
          qtyMilli,
          unitCostMicros,
          reason: 'purchase',
          userId,
          note: `Recepción de compra ${purchase.folio}`
        });

        // 2. Registro de lote si fue provisto
        if (line.lot_code) {
          db.prepare(`
            INSERT INTO inventory_lots (
              variant_id, warehouse_id, lot_code, expires_on, qty_milli, received_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(variant_id, warehouse_id, lot_code) DO UPDATE SET
              qty_milli = qty_milli + excluded.qty_milli
          `).run(
            line.variant_id,
            purchase.warehouse_id,
            line.lot_code,
            line.expires_on ?? null,
            Number(qtyMilli),
            now
          );
        }
      }

      // 3. Actualizar estado de la compra
      db.prepare(`
        UPDATE purchases
        SET status = 'received', received_at = ?
        WHERE id = ?
      `).run(now, purchaseId);

      const successRes: ReceivePurchaseResult = { ok: true, purchaseId };
      return successRes;
    })();
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cancela una recepción de compra emitiendo movimientos inversos en el Kardex (sin borrar filas históricas).
 */
export function cancelPurchaseReception(
  db: Database.Database,
  purchaseId: number,
  userId: number,
  note = 'Cancelación de compra'
): ReceivePurchaseResult {
  try {
    return db.transaction(() => {
      const purchase = db.prepare(`
        SELECT id, warehouse_id, status, folio
        FROM purchases
        WHERE id = ?
      `).get(purchaseId) as { id: number; warehouse_id: number; status: string; folio: string } | undefined;

      if (!purchase) {
        const errRes: ReceivePurchaseResult = { ok: false, error: `Compra no encontrada: ${purchaseId}` };
        return errRes;
      }

      if (purchase.status !== 'received') {
        const errRes: ReceivePurchaseResult = { ok: false, error: `Solo se puede cancelar una compra recibida` };
        return errRes;
      }

      const lines = db.prepare(`
        SELECT variant_id, qty_milli, landed_unit_cost_micros
        FROM purchase_lines
        WHERE purchase_id = ?
      `).all(purchaseId) as Array<{ variant_id: number; qty_milli: number; landed_unit_cost_micros: number }>;

      for (const line of lines) {
        insertKardexMove(db, {
          warehouseId: purchase.warehouse_id,
          variantId: line.variant_id,
          direction: 'out',
          qtyMilli: BigInt(line.qty_milli),
          unitCostMicros: BigInt(line.landed_unit_cost_micros),
          reason: 'purchase_return',
          userId,
          note: `Cancelación recepción ${purchase.folio}: ${note}`
        });
      }

      db.prepare(`
        UPDATE purchases
        SET status = 'cancelled', note = COALESCE(note || ' | ', '') || ?
        WHERE id = ?
      `).run(note, purchaseId);

      const successRes: ReceivePurchaseResult = { ok: true, purchaseId };
      return successRes;
    })();
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Registra un pago a proveedor con salida de dinero de caja si es en efectivo.
 */
export function paySupplier(
  db: Database.Database,
  params: PaySupplierParams
): PaySupplierResult {
  try {
    return db.transaction(() => {
      const now = new Date().toISOString();
      const paymentUid = uid();

      const res = db.prepare(`
        INSERT INTO supplier_payments (
          uid, supplier_id, purchase_id, at, method,
          amount_cents, shift_id, user_id, reference, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        paymentUid,
        params.supplierId,
        params.purchaseId ?? null,
        now,
        params.method,
        Number(params.amountCents),
        params.shiftId ?? null,
        params.userId,
        params.note ?? null,
        params.note ?? null
      );

      const paymentId = Number(res.lastInsertRowid);

      // Si fue en efectivo y hay turno activo, registrar salida de caja
      if (params.method === 'cash' && params.shiftId) {
        const cashUid = uid();
        db.prepare(`
          INSERT INTO cash_movements (
            uid, shift_id, at, type, currency_code,
            amount_fx, fx_rate_micros, amount_cents, ref_type, ref_id, user_id, note
          ) VALUES (?, ?, ?, 'supplier_payment', ?, ?, 1000000, ?, 'supplier_payment', ?, ?, ?)
        `).run(
          cashUid,
          params.shiftId,
          now,
          params.currencyCode ?? 'NIO',
          -Number(params.amountCents),
          -Number(params.amountCents),
          paymentId,
          params.userId,
          params.note ?? 'Pago a proveedor'
        );
      }

      // Si se pagó contra una compra específica, actualizar paid_cents
      if (params.purchaseId) {
        db.prepare(`
          UPDATE purchases
          SET paid_cents = paid_cents + ?
          WHERE id = ?
        `).run(Number(params.amountCents), params.purchaseId);
      }

      const successRes: PaySupplierResult = { ok: true, paymentId };
      return successRes;
    })();
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Obtiene el resumen detallado de una compra.
 */
export function getPurchaseSummary(
  db: Database.Database,
  purchaseId: number
): PurchaseSummary | null {
  const row = db.prepare(`
    SELECT p.id, p.uid, p.folio, p.supplier_id, s.name as supplier_name,
           p.warehouse_id, p.at, p.status, p.supplier_doc, p.subtotal_cents,
           p.tax_cents, p.freight_cents, p.total_cents, p.paid_cents,
           p.received_at, p.note
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = ?
  `).get(purchaseId) as {
    id: number;
    uid: string;
    folio: string;
    supplier_id: number;
    supplier_name: string;
    warehouse_id: number;
    at: string;
    status: 'draft' | 'received' | 'cancelled';
    supplier_doc: string | null;
    subtotal_cents: number;
    tax_cents: number;
    freight_cents: number;
    total_cents: number;
    paid_cents: number;
    received_at: string | null;
    note: string | null;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    uid: row.uid,
    folio: row.folio,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    warehouseId: row.warehouse_id,
    at: row.at,
    status: row.status,
    supplierDoc: row.supplier_doc,
    subtotalCents: BigInt(row.subtotal_cents),
    taxCents: BigInt(row.tax_cents),
    freightCents: BigInt(row.freight_cents),
    totalCents: BigInt(row.total_cents),
    paidCents: BigInt(row.paid_cents),
    receivedAt: row.received_at,
    note: row.note
  };
}
