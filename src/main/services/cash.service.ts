import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { withTransaction } from '../db/connection';
import { mulDiv } from '../../core/money';

export interface CountedLineInput {
  denominationCents: number;
  quantity: number;
}

export interface OpenShiftParams {
  openedBy: number;
  openingFloatCents: bigint;
  openingFloatUsd?: bigint;
  countedLinesNio?: CountedLineInput[];
  countedLinesUsd?: CountedLineInput[];
  note?: string;
}

export interface CashShift {
  id: number;
  uid: string;
  folio: string;
  openedAt: string;
  openedBy: number;
  openingFloatCents: bigint;
  openingFloatUsd: bigint;
  status: 'open' | 'closed';
}

export interface CloseShiftParams {
  shiftId: number;
  closedBy: number;
  countedLinesNio: CountedLineInput[];
  countedLinesUsd: CountedLineInput[];
  note?: string;
}

export interface CloseShiftResult {
  shiftId: number;
  status: 'closed';
  closedAt: string;
  closedBy: number;
  countedCents: bigint;
  expectedCents: bigint;
  differenceCents: bigint;
  countedUsd: bigint;
  expectedUsd: bigint;
  differenceUsd: bigint;
  note?: string;
}

export interface BlindShiftSummary {
  id: number;
  uid: string;
  folio: string;
  openedAt: string;
  openedBy: number;
  openingFloatCents: bigint;
  openingFloatUsd: bigint;
  status: 'open' | 'closed';
}

export interface RecordCashMovementParams {
  shiftId: number;
  type: 'pay_in' | 'pay_out' | 'withdrawal' | 'adjustment';
  currencyCode: 'NIO' | 'USD';
  amountFx: bigint;
  userId: number;
  note?: string;
}

interface CashShiftRow {
  id: number;
  uid: string;
  folio: string;
  opened_at: string;
  opened_by: number;
  opening_float_cents: number;
  opening_float_usd: number;
  status: 'open' | 'closed';
  closed_at: string | null;
}

/**
 * Abre un turno de caja y registra el fondo inicial.
 */
export function openShift(db: Database.Database, params: OpenShiftParams): CashShift {
  return withTransaction(db, () => {
    const existing = db.prepare("SELECT id FROM cash_shifts WHERE status = 'open'").get();
    if (existing) {
      throw new Error('Ya existe un turno de caja abierto');
    }

    const shiftUid = crypto.randomUUID();
    const countRow = db.prepare('SELECT COUNT(*) as c FROM cash_shifts').get() as { c: number };
    const folio = `TURNO-${String(countRow.c + 1).padStart(5, '0')}`;

    const openingFloatCents = params.openingFloatCents;
    const openingFloatUsd = params.openingFloatUsd ?? 0n;

    const insertShift = db.prepare(`
      INSERT INTO cash_shifts (
        uid, folio, opened_at, opened_by, opening_float_cents, opening_float_usd, status, note
      ) VALUES (?, ?, datetime('now'), ?, ?, ?, 'open', ?)
    `);

    const res = insertShift.run(
      shiftUid,
      folio,
      params.openedBy,
      Number(openingFloatCents),
      Number(openingFloatUsd),
      params.note ?? null
    );

    const shiftId = Number(res.lastInsertRowid);

    // Movimientos de fondo inicial
    if (openingFloatCents > 0n) {
      db.prepare(`
        INSERT INTO cash_movements (
          uid, shift_id, at, type, currency_code, amount_fx, fx_rate_micros, amount_cents, user_id, note
        ) VALUES (?, ?, datetime('now'), 'opening_float', 'NIO', ?, 1000000, ?, ?, 'Fondo inicial NIO')
      `).run(crypto.randomUUID(), shiftId, Number(openingFloatCents), Number(openingFloatCents), params.openedBy);
    }

    if (openingFloatUsd > 0n) {
      let usdRate = 36624300n;
      const rateSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'currency.usd_rate_micros'").get() as { value_json: string } | undefined;
      if (rateSetting) {
        try {
          usdRate = BigInt(JSON.parse(rateSetting.value_json) as number);
        } catch {
          usdRate = 36624300n;
        }
      }

      const amountCents = mulDiv(openingFloatUsd, usdRate, 1_000_000n);
      db.prepare(`
        INSERT INTO cash_movements (
          uid, shift_id, at, type, currency_code, amount_fx, fx_rate_micros, amount_cents, user_id, note
        ) VALUES (?, ?, datetime('now'), 'opening_float', 'USD', ?, ?, ?, ?, 'Fondo inicial USD')
      `).run(crypto.randomUUID(), shiftId, Number(openingFloatUsd), Number(usdRate), Number(amountCents), params.openedBy);
    }

    // Registrar conteo inicial si fue provisto
    if (params.countedLinesNio) {
      for (const line of params.countedLinesNio) {
        db.prepare(`
          INSERT INTO cash_count_lines (shift_id, moment, currency_code, denomination_cents, quantity)
          VALUES (?, 'open', 'NIO', ?, ?)
        `).run(shiftId, line.denominationCents, line.quantity);
      }
    }

    if (params.countedLinesUsd) {
      for (const line of params.countedLinesUsd) {
        db.prepare(`
          INSERT INTO cash_count_lines (shift_id, moment, currency_code, denomination_cents, quantity)
          VALUES (?, 'open', 'USD', ?, ?)
        `).run(shiftId, line.denominationCents, line.quantity);
      }
    }

    const row = db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(shiftId) as CashShiftRow;

    return {
      id: shiftId,
      uid: row.uid,
      folio: row.folio,
      openedAt: row.opened_at,
      openedBy: row.opened_by,
      openingFloatCents: BigInt(row.opening_float_cents),
      openingFloatUsd: BigInt(row.opening_float_usd),
      status: row.status
    };
  });
}

/**
 * Cierra un turno de caja tras realizar el arqueo por denominaciones en cada moneda.
 */
export function closeShift(db: Database.Database, params: CloseShiftParams): CloseShiftResult {
  return withTransaction(db, () => {
    const shift = db.prepare('SELECT * FROM cash_shifts WHERE id = ?').get(params.shiftId) as CashShiftRow | undefined;
    if (!shift) {
      throw new Error(`Turno no encontrado: ${params.shiftId}`);
    }
    if (shift.status === 'closed') {
      throw new Error('El turno ya está cerrado');
    }

    // 1. Guardar líneas de conteo físico
    let countedCents = 0n;
    for (const line of params.countedLinesNio) {
      db.prepare(`
        INSERT OR REPLACE INTO cash_count_lines (shift_id, moment, currency_code, denomination_cents, quantity)
        VALUES (?, 'close', 'NIO', ?, ?)
      `).run(params.shiftId, line.denominationCents, line.quantity);
      countedCents += BigInt(line.denominationCents) * BigInt(line.quantity);
    }

    let countedUsd = 0n;
    for (const line of params.countedLinesUsd) {
      db.prepare(`
        INSERT OR REPLACE INTO cash_count_lines (shift_id, moment, currency_code, denomination_cents, quantity)
        VALUES (?, 'close', 'USD', ?, ?)
      `).run(params.shiftId, line.denominationCents, line.quantity);
      countedUsd += BigInt(line.denominationCents) * BigInt(line.quantity);
    }

    // 2. Calcular importes esperados sumando cash_movements
    const nioMovements = db.prepare(`
      SELECT COALESCE(SUM(amount_fx), 0) as total
      FROM cash_movements
      WHERE shift_id = ? AND currency_code = 'NIO' AND type <> 'opening_float'
    `).get(params.shiftId) as { total: number };

    const expectedCents = BigInt(shift.opening_float_cents) + BigInt(nioMovements.total);

    const usdMovements = db.prepare(`
      SELECT COALESCE(SUM(amount_fx), 0) as total
      FROM cash_movements
      WHERE shift_id = ? AND currency_code = 'USD' AND type <> 'opening_float'
    `).get(params.shiftId) as { total: number };

    const expectedUsd = BigInt(shift.opening_float_usd) + BigInt(usdMovements.total);

    // 3. Diferencias
    const differenceCents = countedCents - expectedCents;
    const differenceUsd = countedUsd - expectedUsd;

    // 4. Actualizar registro del turno
    db.prepare(`
      UPDATE cash_shifts
      SET status = 'closed',
          closed_at = datetime('now'),
          closed_by = ?,
          counted_cents = ?,
          expected_cents = ?,
          difference_cents = ?,
          counted_usd = ?,
          expected_usd = ?,
          difference_usd = ?,
          note = ?
      WHERE id = ?
    `).run(
      params.closedBy,
      Number(countedCents),
      Number(expectedCents),
      Number(differenceCents),
      Number(countedUsd),
      Number(expectedUsd),
      Number(differenceUsd),
      params.note ?? null,
      params.shiftId
    );

    const updated = db.prepare('SELECT closed_at FROM cash_shifts WHERE id = ?').get(params.shiftId) as { closed_at: string };

    return {
      shiftId: params.shiftId,
      status: 'closed',
      closedAt: updated.closed_at,
      closedBy: params.closedBy,
      countedCents,
      expectedCents,
      differenceCents,
      countedUsd,
      expectedUsd,
      differenceUsd,
      note: params.note
    };
  });
}

/**
 * Retorna el resumen ciego del turno (sin importes esperados ni diferencias).
 */
export function getShiftBlind(db: Database.Database, shiftId: number): BlindShiftSummary {
  const row = db.prepare(`
    SELECT id, uid, folio, opened_at, opened_by, opening_float_cents, opening_float_usd, status
    FROM cash_shifts
    WHERE id = ?
  `).get(shiftId) as CashShiftRow | undefined;

  if (!row) {
    throw new Error(`Turno no encontrado: ${shiftId}`);
  }

  return {
    id: row.id,
    uid: row.uid,
    folio: row.folio,
    openedAt: row.opened_at,
    openedBy: row.opened_by,
    openingFloatCents: BigInt(row.opening_float_cents),
    openingFloatUsd: BigInt(row.opening_float_usd),
    status: row.status
  };
}

/**
 * Obtiene el turno de caja actualmente abierto, si existe.
 */
export function getOpenShift(db: Database.Database): CashShift | null {
  const row = db.prepare("SELECT * FROM cash_shifts WHERE status = 'open'").get() as CashShiftRow | undefined;
  if (!row) return null;

  return {
    id: row.id,
    uid: row.uid,
    folio: row.folio,
    openedAt: row.opened_at,
    openedBy: row.opened_by,
    openingFloatCents: BigInt(row.opening_float_cents),
    openingFloatUsd: BigInt(row.opening_float_usd),
    status: row.status
  };
}

/**
 * Registra un movimiento manual de efectivo en la caja.
 */
export function recordCashMovement(
  db: Database.Database,
  params: RecordCashMovementParams
): number {
  return withTransaction(db, () => {
    const shift = getOpenShift(db);
    if (!shift || shift.id !== params.shiftId) {
      throw new Error('El turno de caja especificado no está abierto');
    }

    let fxRateMicros = 1000000n;
    let amountCents = params.amountFx;

    if (params.currencyCode === 'USD') {
      const rateSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'currency.usd_rate_micros'").get() as { value_json: string } | undefined;
      fxRateMicros = BigInt(JSON.parse(rateSetting?.value_json ?? '36624300') as number);
      amountCents = mulDiv(params.amountFx, fxRateMicros, 1_000_000n);
    }

    const moveUid = crypto.randomUUID();
    const res = db.prepare(`
      INSERT INTO cash_movements (
        uid, shift_id, at, type, currency_code, amount_fx, fx_rate_micros, amount_cents, user_id, note
      ) VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
    `).run(
      moveUid,
      params.shiftId,
      params.type,
      params.currencyCode,
      Number(params.amountFx),
      Number(fxRateMicros),
      Number(amountCents),
      params.userId,
      params.note ?? null
    );

    return Number(res.lastInsertRowid);
  });
}
