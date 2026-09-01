import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import {
  Customer,
  CreateCustomerParams,
  CustomerLedgerEntry,
  CustomerStatement,
  validateCreditLimit,
  calculateAgingBuckets
} from '../../core/customers';

export type { Customer, CreateCustomerParams, CustomerLedgerEntry, CustomerStatement };

function uid(): string {
  return crypto.randomUUID();
}

/**
 * Crea un nuevo cliente.
 */
export function createCustomer(
  db: Database.Database,
  params: CreateCustomerParams
): Customer {
  const custUid = uid();
  const now = new Date().toISOString();
  const code = params.code ?? `CLI-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const res = db.prepare(`
    INSERT INTO customers (
      uid, code, name, doc_type, doc_number, tax_regime,
      phone, email, address, credit_limit_cents, credit_days,
      attributes_json, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, ?, ?)
  `).run(
    custUid,
    code,
    params.name,
    params.docType ?? null,
    params.docNumber ?? null,
    params.taxRegime ?? null,
    params.phone ?? null,
    params.email ?? null,
    params.address ?? null,
    Number(params.creditLimitCents ?? 0n),
    params.creditDays ?? 0,
    now,
    now
  );

  return {
    id: Number(res.lastInsertRowid),
    uid: custUid,
    code,
    name: params.name,
    docType: params.docType ?? null,
    docNumber: params.docNumber ?? null,
    taxRegime: params.taxRegime ?? null,
    phone: params.phone ?? null,
    email: params.email ?? null,
    address: params.address ?? null,
    creditLimitCents: params.creditLimitCents ?? 0n,
    creditDays: params.creditDays ?? 0,
    pointsBalance: 0n,
    isActive: true
  };
}

/**
 * Obtiene la lista de clientes activos con su saldo actual derivado de v_customer_balance.
 */
export function getCustomers(db: Database.Database): Customer[] {
  const rows = db.prepare(`
    SELECT c.id, c.uid, c.code, c.name, c.doc_type, c.doc_number,
           c.tax_regime, c.phone, c.email, c.address,
           c.credit_limit_cents, c.credit_days, c.is_active,
           COALESCE(l.points, 0) as points_balance
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, SUM(points) as points
      FROM loyalty_ledger
      GROUP BY customer_id
    ) l ON l.customer_id = c.id
    WHERE c.is_active = 1
    ORDER BY c.name ASC
  `).all() as Array<{
    id: number;
    uid: string;
    code: string | null;
    name: string;
    doc_type: string | null;
    doc_number: string | null;
    tax_regime: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    credit_limit_cents: number;
    credit_days: number;
    is_active: number;
    points_balance: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    uid: r.uid,
    code: r.code,
    name: r.name,
    docType: r.doc_type,
    docNumber: r.doc_number,
    taxRegime: r.tax_regime,
    phone: r.phone,
    email: r.email,
    address: r.address,
    creditLimitCents: BigInt(r.credit_limit_cents),
    creditDays: r.credit_days,
    pointsBalance: BigInt(r.points_balance),
    isActive: r.is_active === 1
  }));
}

/**
 * Obtiene el cliente por su ID.
 */
export function getCustomerById(
  db: Database.Database,
  customerId: number
): Customer | null {
  const row = db.prepare(`
    SELECT c.id, c.uid, c.code, c.name, c.doc_type, c.doc_number,
           c.tax_regime, c.phone, c.email, c.address,
           c.credit_limit_cents, c.credit_days, c.is_active,
           COALESCE(l.points, 0) as points_balance
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, SUM(points) as points
      FROM loyalty_ledger
      GROUP BY customer_id
    ) l ON l.customer_id = c.id
    WHERE c.id = ?
  `).get(customerId) as {
    id: number;
    uid: string;
    code: string | null;
    name: string;
    doc_type: string | null;
    doc_number: string | null;
    tax_regime: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    credit_limit_cents: number;
    credit_days: number;
    is_active: number;
    points_balance: number;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    uid: row.uid,
    code: row.code,
    name: row.name,
    docType: row.doc_type,
    docNumber: row.doc_number,
    taxRegime: row.tax_regime,
    phone: row.phone,
    email: row.email,
    address: row.address,
    creditLimitCents: BigInt(row.credit_limit_cents),
    creditDays: row.credit_days,
    pointsBalance: BigInt(row.points_balance),
    isActive: row.is_active === 1
  };
}

/**
 * Obtiene el saldo actual del cliente directamente de la vista de conciliación v_customer_balance.
 */
export function getCustomerBalance(
  db: Database.Database,
  customerId: number
): bigint {
  const row = db.prepare(`
    SELECT balance_cents
    FROM v_customer_balance
    WHERE customer_id = ?
  `).get(customerId) as { balance_cents: number } | undefined;

  return row ? BigInt(row.balance_cents) : 0n;
}

/**
 * Obtiene el historial del libro de cuenta corriente del cliente en orden cronológico.
 */
export function getCustomerLedger(
  db: Database.Database,
  customerId: number
): CustomerLedgerEntry[] {
  const rows = db.prepare(`
    SELECT id, uid, customer_id, at, type, amount_cents,
           balance_after_cents, due_on, ref_type, ref_id,
           shift_id, method, user_id, note
    FROM customer_ledger
    WHERE customer_id = ?
    ORDER BY id ASC
  `).all(customerId) as Array<{
    id: number;
    uid: string;
    customer_id: number;
    at: string;
    type: 'charge' | 'payment' | 'adjustment' | 'write_off';
    amount_cents: number;
    balance_after_cents: number;
    due_on: string | null;
    ref_type: string | null;
    ref_id: number | null;
    shift_id: number | null;
    method: string | null;
    user_id: number;
    note: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    uid: r.uid,
    customerId: r.customer_id,
    at: r.at,
    type: r.type,
    amountCents: BigInt(r.amount_cents),
    balanceAfterCents: BigInt(r.balance_after_cents),
    dueOn: r.due_on,
    refType: r.ref_type,
    refId: r.ref_id,
    shiftId: r.shift_id,
    method: r.method,
    userId: r.user_id,
    note: r.note
  }));
}

export interface RecordCustomerChargeParams {
  customerId: number;
  amountCents: bigint;
  dueOn?: string;
  refType?: string;
  refId?: number;
  userId: number;
  note?: string;
}

export type RecordCustomerChargeResult =
  | { ok: true; ledgerId: number; newBalanceCents: bigint }
  | { ok: false; error: string };

/**
 * Registra un cargo en cuenta corriente (venta al fiado / crédito).
 * Valida de forma atómica el límite de crédito en el momento del cobro.
 */
export function recordCustomerCharge(
  db: Database.Database,
  params: RecordCustomerChargeParams
): RecordCustomerChargeResult {
  try {
    return db.transaction(() => {
      const customer = getCustomerById(db, params.customerId);
      if (!customer) {
        const notFoundRes: RecordCustomerChargeResult = { ok: false, error: `Cliente no encontrado: ${params.customerId}` };
        return notFoundRes;
      }

      const currentBalance = getCustomerBalance(db, params.customerId);

      // Validar límite de crédito
      const validation = validateCreditLimit({
        currentBalanceCents: currentBalance,
        creditLimitCents: customer.creditLimitCents,
        newChargeCents: params.amountCents,
        creditDays: customer.creditDays
      });

      if (!validation.allowed) {
        const rejectedRes: RecordCustomerChargeResult = { ok: false, error: validation.reason ?? 'Crédito denegado' };
        return rejectedRes;
      }

      const newBalance = currentBalance + params.amountCents;
      const ledgerUid = uid();
      const now = new Date().toISOString();

      const res = db.prepare(`
        INSERT INTO customer_ledger (
          uid, customer_id, at, type, amount_cents, balance_after_cents,
          due_on, ref_type, ref_id, user_id, note
        ) VALUES (?, ?, ?, 'charge', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ledgerUid,
        params.customerId,
        now,
        Number(params.amountCents),
        Number(newBalance),
        params.dueOn ?? null,
        params.refType ?? null,
        params.refId ?? null,
        params.userId,
        params.note ?? null
      );

      const successRes: RecordCustomerChargeResult = {
        ok: true,
        ledgerId: Number(res.lastInsertRowid),
        newBalanceCents: newBalance
      };
      return successRes;
    })();
  } catch (err: unknown) {
    const errorRes: RecordCustomerChargeResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
    return errorRes;
  }
}

export interface RecordCustomerPaymentParams {
  customerId: number;
  amountCents: bigint;
  method?: 'cash' | 'card' | 'transfer' | 'check';
  shiftId?: number;
  userId: number;
  note?: string;
}

export type RecordCustomerPaymentResult =
  | { ok: true; ledgerId: number; newBalanceCents: bigint }
  | { ok: false; error: string };

/**
 * Registra un abono a cuenta corriente.
 * Si el abono es en efectivo y hay un turno de caja abierto, registra el movimiento de entrada en cash_movements.
 */
export function recordCustomerPayment(
  db: Database.Database,
  params: RecordCustomerPaymentParams
): RecordCustomerPaymentResult {
  try {
    return db.transaction(() => {
      const customer = getCustomerById(db, params.customerId);
      if (!customer) {
        const notFoundRes: RecordCustomerPaymentResult = { ok: false, error: `Cliente no encontrado: ${params.customerId}` };
        return notFoundRes;
      }

      const currentBalance = getCustomerBalance(db, params.customerId);
      const newBalance = currentBalance - params.amountCents;
      const ledgerUid = uid();
      const now = new Date().toISOString();
      const method = params.method ?? 'cash';

      const res = db.prepare(`
        INSERT INTO customer_ledger (
          uid, customer_id, at, type, amount_cents, balance_after_cents,
          shift_id, method, user_id, note
        ) VALUES (?, ?, ?, 'payment', ?, ?, ?, ?, ?, ?)
      `).run(
        ledgerUid,
        params.customerId,
        now,
        -Number(params.amountCents), // Abono es negativo en customer_ledger
        Number(newBalance),
        params.shiftId ?? null,
        method,
        params.userId,
        params.note ?? null
      );

      const ledgerId = Number(res.lastInsertRowid);

      // Si fue en efectivo y hay turno de caja, ingresar el dinero al turno
      if (method === 'cash' && params.shiftId) {
        const cashUid = uid();
        db.prepare(`
          INSERT INTO cash_movements (
            uid, shift_id, at, type, currency_code, amount_fx, fx_rate_micros,
            amount_cents, ref_type, ref_id, user_id, note
          ) VALUES (?, ?, ?, 'customer_payment', 'NIO', ?, 1000000, ?, 'customer_ledger', ?, ?, ?)
        `).run(
          cashUid,
          params.shiftId,
          now,
          Number(params.amountCents), // Positivo entra a la gaveta
          Number(params.amountCents),
          ledgerId,
          params.userId,
          params.note ?? `Abono de ${customer.name}`
        );
      }

      const successRes: RecordCustomerPaymentResult = {
        ok: true,
        ledgerId,
        newBalanceCents: newBalance
      };
      return successRes;
    })();
  } catch (err: unknown) {
    const errorRes: RecordCustomerPaymentResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
    return errorRes;
  }
}

export interface RedeemCustomerPointsParams {
  customerId: number;
  pointsToRedeem: bigint;
  userId?: number;
}

export type RedeemPointsResult =
  | { ok: true; newBalance: bigint }
  | { ok: false; error: string };

/**
 * Canjea puntos de fidelización del cliente.
 */
export function redeemCustomerPoints(
  db: Database.Database,
  params: RedeemCustomerPointsParams
): RedeemPointsResult {
  try {
    return db.transaction(() => {
      const row = db.prepare(`
        SELECT COALESCE(SUM(points), 0) as balance
        FROM loyalty_ledger
        WHERE customer_id = ?
      `).get(params.customerId) as { balance: number };

      const currentPoints = BigInt(row.balance);
      if (currentPoints < params.pointsToRedeem) {
        const errRes: RedeemPointsResult = {
          ok: false,
          error: `Puntos insuficientes: posee ${currentPoints} y requiere ${params.pointsToRedeem}`
        };
        return errRes;
      }

      const newBalance = currentPoints - params.pointsToRedeem;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO loyalty_ledger (
          customer_id, at, points, balance_after, reason, user_id
        ) VALUES (?, ?, ?, ?, 'redeem', ?)
      `).run(
        params.customerId,
        now,
        -Number(params.pointsToRedeem),
        Number(newBalance),
        params.userId ?? null
      );

      const successRes: RedeemPointsResult = { ok: true, newBalance };
      return successRes;
    })();
  } catch (err: unknown) {
    const errRes: RedeemPointsResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
    return errRes;
  }
}

/**
 * Genera el estado de cuenta con antigüedad de saldos para un cliente.
 */
export function getCustomerStatement(
  db: Database.Database,
  customerId: number,
  asOfDate: Date | string = new Date()
): CustomerStatement | null {
  const customer = getCustomerById(db, customerId);
  if (!customer) return null;

  const entries = getCustomerLedger(db, customerId);
  const balanceCents = getCustomerBalance(db, customerId);
  const availableCreditCents = customer.creditLimitCents > balanceCents
    ? customer.creditLimitCents - balanceCents
    : 0n;

  const aging = calculateAgingBuckets(
    entries.map((e) => ({ at: e.at, dueOn: e.dueOn ?? undefined, amountCents: e.amountCents })),
    asOfDate
  );

  return {
    customer,
    balanceCents,
    creditLimitCents: customer.creditLimitCents,
    availableCreditCents,
    aging,
    entries
  };
}
