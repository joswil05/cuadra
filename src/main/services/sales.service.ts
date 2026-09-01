import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { withTransaction } from '../db/connection';
import { calculateSaleDocument } from '../../core/sales';
import { TaxKind, TaxRegime } from '../../core/tax';
import { mulDiv } from '../../core/money';
import { insertKardexMove } from '../repositories/inventory.repository';

export interface CreateSaleLineInput {
  variantId?: number;
  description: string;
  unitPriceCents: bigint;
  qtyMilli: bigint;
  lineDiscountCents: bigint;
  taxKind: TaxKind;
  taxRateBp: bigint;
  lotId?: number;
}

export interface SalePaymentInput {
  method: 'cash' | 'card' | 'transfer' | 'mobile' | 'credit' | 'voucher' | 'points';
  currencyCode: 'NIO' | 'USD';
  amountFx: bigint;
  fxRateMicros: bigint;
  amountCents: bigint;
  reference?: string;
}

export interface CreateSaleInput {
  docType: 'ticket' | 'invoice' | 'credit_note' | 'proforma';
  seriesId: number;
  shiftId: number;
  userId: number;
  customerId?: number;
  priceListId?: number;
  paymentCondition?: 'contado' | 'credito';
  isContingency?: boolean;
  taxRegime: TaxRegime;
  pricesIncludeTax: boolean;
  lines: CreateSaleLineInput[];
  payments: SalePaymentInput[];
  orderDiscountCents?: bigint;
  discountAuthBy?: number;
  note?: string;
}

export interface CreateSaleResult {
  id: number;
  uid: string;
  docType: string;
  seriesId: number;
  number: number;
  folio: string;
  totalCents: bigint;
  paidCents: bigint;
  changeCents: bigint;
  creditCents: bigint;
  at: string;
}

export interface CreateCreditNoteParams {
  parentSaleId: number;
  seriesId: number;
  shiftId: number;
  userId: number;
  reason: string;
  lines: { lineNo: number; qtyMilli: bigint }[];
  refundMethod?: 'cash' | 'credit' | 'transfer';
}

export interface VoidSaleParams {
  saleId: number;
  userId: number;
  reason: string;
}

interface SaleRow {
  id: number;
  uid: string;
  folio: string;
  tax_regime: TaxRegime;
  prices_include_tax: number;
  customer_id: number | null;
  price_list_id: number | null;
  status: string;
  at: string;
}

interface SaleLineRow {
  sale_id: number;
  line_no: number;
  variant_id: number | null;
  description: string;
  unit_price_cents: number;
  tax_kind: TaxKind;
  tax_rate_bp: number;
  taxable_base_cents: number;
  tax_cents: number;
  total_cents: number;
  unit_cost_micros: number;
  qty_milli: number;
}

interface CashMovementRow {
  id: number;
  shift_id: number;
  currency_code: 'NIO' | 'USD';
  amount_fx: number;
  fx_rate_micros: number;
  amount_cents: number;
}

interface CustomerLedgerRow {
  id: number;
  customer_id: number;
  amount_cents: number;
  shift_id: number | null;
}

/**
 * Registra una venta completa y atómica dentro de una sola transacción de base de datos.
 */
export function createSale(db: Database.Database, input: CreateSaleInput): CreateSaleResult {
  return withTransaction(db, () => {
    // 0. Validar existencia del turno abierto
    const shift = db.prepare("SELECT id, status FROM cash_shifts WHERE id = ?").get(input.shiftId) as { id: number; status: string } | undefined;
    if (!shift || shift.status !== 'open') {
      throw new Error('El turno de caja especificado no está abierto');
    }

    // Validar stock si allow_negative es false
    const allowNegSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'inventory.allow_negative'").get() as { value_json: string } | undefined;
    const allowNegative = allowNegSetting ? (JSON.parse(allowNegSetting.value_json) as boolean) === true : false;

    if (!allowNegative) {
      for (const line of input.lines) {
        if (line.variantId) {
          const v = db.prepare(`
            SELECT v.stock_milli, p.tracks_stock
            FROM product_variants v
            JOIN products p ON p.id = v.product_id
            WHERE v.id = ?
          `).get(line.variantId) as { stock_milli: number; tracks_stock: number } | undefined;

          if (v && v.tracks_stock === 1 && BigInt(v.stock_milli) < line.qtyMilli) {
            throw new Error(`Stock insuficiente para variante ${line.variantId}`);
          }
        }
      }
    }

    // 1. Obtener y consumir correlativo de la serie atómicamente
    const series = db.prepare(`
      UPDATE document_series
      SET next_number = next_number + 1
      WHERE id = ?
      RETURNING prefix, (next_number - 1) AS num
    `).get(input.seriesId) as { prefix: string; num: number } | undefined;

    if (!series) {
      throw new Error(`Serie no encontrada: ${input.seriesId}`);
    }

    const saleNumber = series.num;
    const folio = `${series.prefix}${String(saleNumber).padStart(6, '0')}`;
    const saleUid = crypto.randomUUID();

    // 2. Calcular documento mediante el motor puro de dominio
    const hasCash = input.payments.some((p) => p.method === 'cash');
    const calc = calculateSaleDocument({
      lines: input.lines.map((l, idx) => ({
        lineNo: idx + 1,
        description: l.description,
        unitPriceCents: l.unitPriceCents,
        qtyMilli: l.qtyMilli,
        lineDiscountCents: l.lineDiscountCents,
        taxKind: l.taxKind,
        taxRateBp: l.taxRateBp
      })),
      orderDiscountCents: input.orderDiscountCents ?? 0n,
      taxRegime: input.taxRegime,
      pricesIncludeTax: input.pricesIncludeTax,
      cashRounding: hasCash
    });

    // 3. Totales de pago, crédito y vuelto
    let nonCreditPaidCents = 0n;
    let creditPaymentsCents = 0n;

    for (const p of input.payments) {
      if (p.method === 'credit') {
        creditPaymentsCents += p.amountCents;
      } else {
        nonCreditPaidCents += p.amountCents;
      }
    }

    let paidCents = nonCreditPaidCents;
    let creditCents = 0n;

    if (creditPaymentsCents > 0n) {
      creditCents = creditPaymentsCents;
    } else if (calc.totalCents > nonCreditPaidCents) {
      creditCents = calc.totalCents - nonCreditPaidCents;
    }

    const changeCents = paidCents > calc.totalCents ? paidCents - calc.totalCents : 0n;

    if (creditCents > 0n && !input.customerId) {
      throw new Error('Cliente requerido para venta a crédito');
    }

    const paymentCondition = input.paymentCondition ?? (creditCents > 0n ? 'credito' : 'contado');

    // 4. Calcular costo de lo vendido (COGS) de las líneas
    let totalCogsCents = 0n;
    const linesWithCost = calc.lines.map((l, idx) => {
      const origInput = input.lines[idx]!;
      let unitCostMicros = 0n;
      let cogsCents = 0n;

      if (origInput.variantId) {
        const v = db.prepare('SELECT cost_avg_micros FROM product_variants WHERE id = ?').get(origInput.variantId) as { cost_avg_micros: number } | undefined;
        if (v) {
          unitCostMicros = BigInt(v.cost_avg_micros);
          cogsCents = mulDiv(l.qtyMilli, unitCostMicros, 10_000_000n);
          totalCogsCents += cogsCents;
        }
      }

      return {
        ...l,
        variantId: origInput.variantId,
        lotId: origInput.lotId,
        unitCostMicros,
        cogsCents
      };
    });

    // 5. Insertar encabezado de venta
    const insertSale = db.prepare(`
      INSERT INTO sales (
        uid, doc_type, series_id, number, folio, parent_sale_id, at, shift_id, user_id,
        customer_id, price_list_id, status, payment_condition, is_contingency,
        tax_regime, prices_include_tax, gross_cents, line_discount_cents, order_discount_cents,
        taxable_base_cents, exempt_base_cents, tax_cents, cash_rounding_cents, total_cents,
        cogs_cents, paid_cents, change_cents, credit_cents, discount_auth_by, note
      ) VALUES (
        ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?,
        ?, ?, 'completed', ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    const saleRes = insertSale.run(
      saleUid,
      input.docType,
      input.seriesId,
      saleNumber,
      folio,
      null,
      input.shiftId,
      input.userId,
      input.customerId ?? null,
      input.priceListId ?? null,
      paymentCondition,
      input.isContingency ? 1 : 0,
      input.taxRegime,
      input.pricesIncludeTax ? 1 : 0,
      Number(calc.grossCents),
      Number(calc.lineDiscountCents),
      Number(calc.orderDiscountCents),
      Number(calc.taxableBaseCents),
      Number(calc.exemptBaseCents),
      Number(calc.taxCents),
      Number(calc.cashRoundingCents),
      Number(calc.totalCents),
      Number(totalCogsCents),
      Number(paidCents),
      Number(changeCents),
      Number(creditCents),
      input.discountAuthBy ?? null,
      input.note ?? null
    );

    const saleId = Number(saleRes.lastInsertRowid);

    // 6. Insertar líneas de venta y registrar salida en Kardex
    const insertLine = db.prepare(`
      INSERT INTO sale_lines (
        sale_id, line_no, variant_id, description, qty_milli, unit_price_cents,
        line_discount_cents, alloc_discount_cents, tax_kind, tax_rate_bp,
        taxable_base_cents, tax_cents, total_cents, unit_cost_micros, cogs_cents, lot_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    for (const l of linesWithCost) {
      insertLine.run(
        saleId,
        l.lineNo,
        l.variantId ?? null,
        l.description,
        Number(l.qtyMilli),
        Number(l.unitPriceCents),
        Number(l.lineDiscountCents),
        Number(l.allocDiscountCents),
        l.taxKind,
        Number(l.taxRateBp),
        Number(l.taxableBaseCents),
        Number(l.taxCents),
        Number(l.totalCents),
        Number(l.unitCostMicros),
        Number(l.cogsCents),
        l.lotId ?? null
      );

      // Movimiento en Kardex
      if (l.variantId) {
        insertKardexMove(db, {
          warehouseId: 1,
          variantId: l.variantId,
          direction: 'out',
          qtyMilli: l.qtyMilli,
          unitCostMicros: l.unitCostMicros,
          reason: 'sale',
          refType: 'sale',
          refId: saleId,
          userId: input.userId,
          note: `Venta ${folio}`
        });
      }
    }

    // 7. Insertar pagos y movimientos de caja
    const insertPayment = db.prepare(`
      INSERT INTO sale_payments (
        sale_id, method, currency_code, amount_fx, fx_rate_micros, amount_cents, reference, at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const p of input.payments) {
      insertPayment.run(
        saleId,
        p.method,
        p.currencyCode,
        Number(p.amountFx),
        Number(p.fxRateMicros),
        Number(p.amountCents),
        p.reference ?? null
      );

      // Si el pago es en efectivo, entra al cajón
      if (p.method === 'cash') {
        db.prepare(`
          INSERT INTO cash_movements (
            uid, shift_id, at, type, currency_code, amount_fx, fx_rate_micros, amount_cents, ref_type, ref_id, user_id, note
          ) VALUES (?, ?, datetime('now'), 'sale', ?, ?, ?, ?, 'sale', ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          input.shiftId,
          p.currencyCode,
          Number(p.amountFx),
          Number(p.fxRateMicros),
          Number(p.amountCents),
          saleId,
          input.userId,
          `Pago de venta ${folio}`
        );
      }
    }

    // Si hubo vuelto, sale efectivo en córdobas del cajón
    if (changeCents > 0n) {
      db.prepare(`
        INSERT INTO cash_movements (
          uid, shift_id, at, type, currency_code, amount_fx, fx_rate_micros, amount_cents, ref_type, ref_id, user_id, note
        ) VALUES (?, ?, datetime('now'), 'sale', 'NIO', ?, 1000000, ?, 'sale', ?, ?, 'Vuelto de venta')
      `).run(
        crypto.randomUUID(),
        input.shiftId,
        -Number(changeCents),
        -Number(changeCents),
        saleId,
        input.userId
      );
    }

    // 8. Cuenta corriente si hubo crédito
    if (creditCents > 0n && input.customerId) {
      const currentBalance = (db.prepare(`
        SELECT COALESCE(SUM(amount_cents), 0) as balance
        FROM customer_ledger WHERE customer_id = ?
      `).get(input.customerId) as { balance: number }).balance;

      const balanceAfter = BigInt(currentBalance) + creditCents;

      db.prepare(`
        INSERT INTO customer_ledger (
          uid, customer_id, at, type, amount_cents, balance_after_cents, ref_type, ref_id, shift_id, method, user_id, note
        ) VALUES (?, ?, datetime('now'), 'charge', ?, ?, 'sale', ?, ?, null, ?, ?)
      `).run(
        crypto.randomUUID(),
        input.customerId,
        Number(creditCents),
        Number(balanceAfter),
        saleId,
        input.shiftId,
        input.userId,
        `Crédito venta ${folio}`
      );
    }

    const createdSale = db.prepare('SELECT at FROM sales WHERE id = ?').get(saleId) as { at: string };

    return {
      id: saleId,
      uid: saleUid,
      docType: input.docType,
      seriesId: input.seriesId,
      number: saleNumber,
      folio,
      totalCents: calc.totalCents,
      paidCents,
      changeCents,
      creditCents,
      at: createdSale.at
    };
  });
}

/**
 * Emite una nota de crédito parcial o total contra un documento de venta padre.
 */
export function createCreditNote(db: Database.Database, params: CreateCreditNoteParams): CreateSaleResult {
  return withTransaction(db, () => {
    const parentSale = db.prepare('SELECT * FROM sales WHERE id = ?').get(params.parentSaleId) as SaleRow | undefined;
    if (!parentSale) {
      throw new Error(`Venta padre no encontrada: ${params.parentSaleId}`);
    }

    const series = db.prepare(`
      UPDATE document_series
      SET next_number = next_number + 1
      WHERE id = ?
      RETURNING prefix, (next_number - 1) AS num
    `).get(params.seriesId) as { prefix: string; num: number } | undefined;

    if (!series) {
      throw new Error(`Serie de NC no encontrada: ${params.seriesId}`);
    }

    const ncNumber = series.num;
    const folio = `${series.prefix}${String(ncNumber).padStart(6, '0')}`;
    const ncUid = crypto.randomUUID();

    // Obtener líneas de la venta original a devolver
    const parentLines = db.prepare('SELECT * FROM sale_lines WHERE sale_id = ?').all(params.parentSaleId) as SaleLineRow[];

    const linesToProcess = params.lines.map((reqLine) => {
      const parentLine = parentLines.find((pl) => pl.line_no === reqLine.lineNo);
      if (!parentLine) {
        throw new Error(`Línea ${reqLine.lineNo} no encontrada en venta original`);
      }
      return {
        parentLine,
        qtyMilli: reqLine.qtyMilli
      };
    });

    const calc = calculateSaleDocument({
      lines: linesToProcess.map((item, idx) => ({
        lineNo: idx + 1,
        description: `${item.parentLine.description} (Devolución)`,
        unitPriceCents: BigInt(item.parentLine.unit_price_cents),
        qtyMilli: item.qtyMilli,
        lineDiscountCents: 0n,
        taxKind: item.parentLine.tax_kind,
        taxRateBp: BigInt(item.parentLine.tax_rate_bp)
      })),
      orderDiscountCents: 0n,
      taxRegime: parentSale.tax_regime,
      pricesIncludeTax: parentSale.prices_include_tax === 1,
      cashRounding: false
    });

    const insertSale = db.prepare(`
      INSERT INTO sales (
        uid, doc_type, series_id, number, folio, parent_sale_id, at, shift_id, user_id,
        customer_id, price_list_id, status, payment_condition, is_contingency,
        tax_regime, prices_include_tax, gross_cents, line_discount_cents, order_discount_cents,
        taxable_base_cents, exempt_base_cents, tax_cents, cash_rounding_cents, total_cents,
        cogs_cents, paid_cents, change_cents, credit_cents, note
      ) VALUES (
        ?, 'credit_note', ?, ?, ?, ?, datetime('now'), ?, ?,
        ?, ?, 'completed', 'contado', 0,
        ?, ?, ?, 0, 0,
        ?, ?, ?, 0, ?,
        0, ?, 0, 0, ?
      )
    `);

    const ncRes = insertSale.run(
      ncUid,
      params.seriesId,
      ncNumber,
      folio,
      params.parentSaleId,
      params.shiftId,
      params.userId,
      parentSale.customer_id,
      parentSale.price_list_id,
      parentSale.tax_regime,
      parentSale.prices_include_tax,
      Number(calc.grossCents),
      Number(calc.taxableBaseCents),
      Number(calc.exemptBaseCents),
      Number(calc.taxCents),
      Number(calc.totalCents),
      Number(calc.totalCents),
      params.reason
    );

    const ncId = Number(ncRes.lastInsertRowid);

    // Insertar líneas de NC y reingresar inventario al Kardex
    for (const item of linesToProcess) {
      db.prepare(`
        INSERT INTO sale_lines (
          sale_id, line_no, variant_id, description, qty_milli, unit_price_cents,
          line_discount_cents, alloc_discount_cents, tax_kind, tax_rate_bp,
          taxable_base_cents, tax_cents, total_cents, unit_cost_micros, cogs_cents
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        ncId,
        item.parentLine.line_no,
        item.parentLine.variant_id,
        `${item.parentLine.description} (Devolución)`,
        Number(item.qtyMilli),
        item.parentLine.unit_price_cents,
        item.parentLine.tax_kind,
        item.parentLine.tax_rate_bp,
        item.parentLine.taxable_base_cents,
        item.parentLine.tax_cents,
        item.parentLine.total_cents,
        item.parentLine.unit_cost_micros
      );

      if (item.parentLine.variant_id) {
        insertKardexMove(db, {
          warehouseId: 1,
          variantId: item.parentLine.variant_id,
          direction: 'in',
          qtyMilli: item.qtyMilli,
          unitCostMicros: BigInt(item.parentLine.unit_cost_micros),
          reason: 'sale_return',
          refType: 'sale',
          refId: ncId,
          userId: params.userId,
          note: `Nota de Crédito ${folio}`
        });
      }
    }

    // Reembolso de dinero si es en efectivo
    if (params.refundMethod === 'cash') {
      db.prepare(`
        INSERT INTO cash_movements (
          uid, shift_id, at, type, currency_code, amount_fx, fx_rate_micros, amount_cents, ref_type, ref_id, user_id, note
        ) VALUES (?, ?, datetime('now'), 'sale_refund', 'NIO', ?, 1000000, ?, 'sale', ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        params.shiftId,
        -Number(calc.totalCents),
        -Number(calc.totalCents),
        ncId,
        params.userId,
        `Reembolso NC ${folio}`
      );
    }

    const createdNC = db.prepare('SELECT at FROM sales WHERE id = ?').get(ncId) as { at: string };

    return {
      id: ncId,
      uid: ncUid,
      docType: 'credit_note',
      seriesId: params.seriesId,
      number: ncNumber,
      folio,
      totalCents: calc.totalCents,
      paidCents: calc.totalCents,
      changeCents: 0n,
      creditCents: 0n,
      at: createdNC.at
    };
  });
}

/**
 * Anula una venta dentro de la ventana permitida (sales.void_window_minutes),
 * revirtiendo inventario en Kardex, movimientos de caja y cuentas por cobrar.
 */
export function voidSale(db: Database.Database, params: VoidSaleParams): void {
  return withTransaction(db, () => {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(params.saleId) as SaleRow | undefined;
    if (!sale) {
      throw new Error(`Venta no encontrada: ${params.saleId}`);
    }
    if (sale.status === 'voided') {
      throw new Error('La venta ya está anulada');
    }

    // 1. Validar ventana de anulación
    let voidWindowMinutes = 15;
    const windowSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'sales.void_window_minutes'").get() as { value_json: string } | undefined;
    if (windowSetting) {
      try {
        voidWindowMinutes = Number(JSON.parse(windowSetting.value_json));
      } catch {
        voidWindowMinutes = 15;
      }
    }

    const diffMinutes = (db.prepare(`
      SELECT (strftime('%s', 'now') - strftime('%s', at)) / 60.0 AS elapsed
      FROM sales WHERE id = ?
    `).get(params.saleId) as { elapsed: number }).elapsed;

    if (diffMinutes > voidWindowMinutes) {
      throw new Error(`Ventana de anulación expirada (${voidWindowMinutes} minutos permitidos)`);
    }

    // 2. Revertir movimientos de Kardex
    const lines = db.prepare('SELECT * FROM sale_lines WHERE sale_id = ?').all(params.saleId) as SaleLineRow[];
    for (const l of lines) {
      if (l.variant_id) {
        insertKardexMove(db, {
          warehouseId: 1,
          variantId: l.variant_id,
          direction: 'in',
          qtyMilli: BigInt(l.qty_milli),
          unitCostMicros: BigInt(l.unit_cost_micros),
          reason: 'sale_return',
          refType: 'sale',
          refId: params.saleId,
          userId: params.userId,
          note: `Reversión por anulación de venta ${sale.folio}`
        });
      }
    }

    // 3. Revertir movimientos de caja
    const cashMoves = db.prepare("SELECT * FROM cash_movements WHERE ref_type = 'sale' AND ref_id = ?").all(params.saleId) as CashMovementRow[];
    for (const cm of cashMoves) {
      db.prepare(`
        INSERT INTO cash_movements (
          uid, shift_id, at, type, currency_code, amount_fx, fx_rate_micros, amount_cents, ref_type, ref_id, user_id, note
        ) VALUES (?, ?, datetime('now'), 'sale_refund', ?, ?, ?, ?, 'sale', ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        cm.shift_id,
        cm.currency_code,
        -cm.amount_fx,
        cm.fx_rate_micros,
        -cm.amount_cents,
        params.saleId,
        params.userId,
        `Reversión por anulación de venta ${sale.folio}`
      );
    }

    // 4. Revertir cargos de cuenta corriente en customer_ledger
    const ledgerCharges = db.prepare("SELECT * FROM customer_ledger WHERE ref_type = 'sale' AND ref_id = ? AND type = 'charge'").all(params.saleId) as CustomerLedgerRow[];
    for (const lc of ledgerCharges) {
      const currentBalance = (db.prepare(`
        SELECT COALESCE(SUM(amount_cents), 0) as balance
        FROM customer_ledger WHERE customer_id = ?
      `).get(lc.customer_id) as { balance: number }).balance;

      const balanceAfter = currentBalance - lc.amount_cents;

      db.prepare(`
        INSERT INTO customer_ledger (
          uid, customer_id, at, type, amount_cents, balance_after_cents, ref_type, ref_id, shift_id, method, user_id, note
        ) VALUES (?, ?, datetime('now'), 'adjustment', ?, ?, 'sale', ?, ?, null, ?, ?)
      `).run(
        crypto.randomUUID(),
        lc.customer_id,
        -lc.amount_cents,
        balanceAfter,
        params.saleId,
        lc.shift_id,
        params.userId,
        `Reversión por anulación de venta ${sale.folio}`
      );
    }

    // 5. Marcar venta como anulada
    db.prepare(`
      UPDATE sales
      SET status = 'voided', voided_at = datetime('now'), voided_by = ?, void_reason = ?
      WHERE id = ?
    `).run(params.userId, params.reason, params.saleId);
  });
}
