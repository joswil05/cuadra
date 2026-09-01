import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fc from 'fast-check';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { openShift } from '../../src/main/services/cash.service';
import {
  createCustomer,
  recordCustomerCharge,
  recordCustomerPayment,
  getCustomerBalance,
  getCustomerLedger,
  redeemCustomerPoints
} from '../../src/main/services/customers.service';

describe('Crédito, Cuenta Corriente y Fidelización (main/services/customers)', () => {
  let db: Database.Database;
  let customerId: number;
  let shiftId: number;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();

    const cust = createCustomer(db, {
      name: 'Comercial El Ahorro',
      docType: 'RUC',
      docNumber: 'J0310000333333',
      phone: '+505 8888-9999',
      creditLimitCents: 100000n, // C$ 1,000.00
      creditDays: 30
    });
    customerId = cust.id;

    const shift = openShift(db, {
      openedBy: 1,
      openingFloatCents: 100000n,
      openingFloatUsd: 0n
    });
    shiftId = shift.id;
  });

  afterEach(() => {
    db.close();
  });

  it('Propiedad, 100 escenarios: el saldo de v_customer_balance es igual a Σ customer_ledger', () => {
    // Generador de secuencias de cargos y abonos
    const moveGen = fc.record({
      type: fc.constantFrom<'charge' | 'payment'>('charge', 'payment'),
      amountCents: fc.bigInt({ min: 100n, max: 20000n })
    });

    fc.assert(
      fc.property(fc.array(moveGen, { minLength: 1, maxLength: 20 }), (moves) => {
        // Nuevo cliente por cada iteración del test de propiedad
        const propCust = createCustomer(db, {
          name: `Cliente Propiedad ${Date.now()}`,
          creditLimitCents: 5000000n, // Límite amplio para permitir la secuencia
          creditDays: 30
        });

        for (const m of moves) {
          if (m.type === 'charge') {
            recordCustomerCharge(db, {
              customerId: propCust.id,
              amountCents: m.amountCents,
              userId: 1,
              note: 'Cargo simulado'
            });
          } else {
            recordCustomerPayment(db, {
              customerId: propCust.id,
              amountCents: m.amountCents,
              method: 'transfer',
              userId: 1,
              note: 'Abono simulado'
            });
          }
        }

        // 1. Obtener saldo desde el servicio
        const serviceBalance = getCustomerBalance(db, propCust.id);

        // 2. Obtener saldo desde la vista SQL v_customer_balance
        const viewRow = db.prepare('SELECT balance_cents FROM v_customer_balance WHERE customer_id = ?').get(propCust.id) as { balance_cents: number };
        const viewBalance = BigInt(viewRow.balance_cents);

        // 3. Obtener saldo sumando directamente todas las filas de customer_ledger
        const sumRow = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) as total FROM customer_ledger WHERE customer_id = ?').get(propCust.id) as { total: number };
        const directSum = BigInt(sumRow.total);

        // Los tres deben coincidir de forma idéntica
        return serviceBalance === viewBalance && viewBalance === directSum;
      }),
      { numRuns: 100 }
    );
  });

  it('Vender a crédito por encima del límite se bloquea con mensaje claro', () => {
    // Intentar cargar C$ 1,200.00 cuando el límite es C$ 1,000.00
    const res = recordCustomerCharge(db, {
      customerId,
      amountCents: 120000n,
      userId: 1,
      note: 'Venta a crédito superior al límite'
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/límite de crédito/i);
    }

    // Verificar que no se insertó ninguna fila en customer_ledger
    const ledger = getCustomerLedger(db, customerId);
    expect(ledger.length).toBe(0);
  });

  it('El libro del cliente rechaza UPDATE y DELETE (inmutabilidad estricta)', () => {
    // 1. Insertar un movimiento válido
    recordCustomerCharge(db, {
      customerId,
      amountCents: 50000n,
      userId: 1,
      note: 'Cargo inicial'
    });

    const row = db.prepare('SELECT id FROM customer_ledger WHERE customer_id = ?').get(customerId) as { id: number };
    expect(row).toBeDefined();

    // 2. Intentar UPDATE -> debe lanzar error abortado por trigger
    expect(() => {
      db.prepare('UPDATE customer_ledger SET amount_cents = 0 WHERE id = ?').run(row.id);
    }).toThrow(/Cuenta corriente inmutable/i);

    // 3. Intentar DELETE -> debe lanzar error abortado por trigger
    expect(() => {
      db.prepare('DELETE FROM customer_ledger WHERE id = ?').run(row.id);
    }).toThrow(/Cuenta corriente inmutable/i);
  });

  it('Abono en efectivo con turno activo ingresa dinero a caja (cash_movements positivo)', () => {
    // 1. Realizar un cargo de C$ 500.00
    recordCustomerCharge(db, {
      customerId,
      amountCents: 50000n,
      userId: 1,
      note: 'Venta a crédito'
    });

    // 2. Realizar un abono de C$ 300.00 en efectivo
    const payRes = recordCustomerPayment(db, {
      customerId,
      amountCents: 30000n,
      method: 'cash',
      shiftId,
      userId: 1,
      note: 'Abono en efectivo en caja'
    });

    expect(payRes.ok).toBe(true);

    // 3. Saldo remanente debe ser C$ 200.00
    expect(getCustomerBalance(db, customerId)).toBe(20000n);

    // 4. Debe existir un movimiento positivo en cash_movements
    const cashMove = db.prepare("SELECT type, amount_cents FROM cash_movements WHERE type = 'customer_payment'").get() as { type: string; amount_cents: number };
    expect(cashMove).toBeDefined();
    expect(cashMove.amount_cents).toBe(30000); // Positivo (ingreso a caja)
  });

  it('Acumulación y canje de puntos de fidelización', () => {
    // Canjear 50 puntos
    db.prepare("INSERT INTO loyalty_ledger (customer_id, at, points, balance_after, reason, user_id) VALUES (?, datetime('now'), 100, 100, 'earn', 1)").run(customerId);

    const redeemRes = redeemCustomerPoints(db, {
      customerId,
      pointsToRedeem: 40n,
      userId: 1
    });

    expect(redeemRes.ok).toBe(true);
    if (redeemRes.ok) {
      expect(redeemRes.newBalance).toBe(60n);
    }
  });
});
