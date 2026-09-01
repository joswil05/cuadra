import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../../src/main/db/migrator';
import { createDbConnection } from '../../../src/main/db/connection';
import {
  createCustomer,
  recordCustomerCharge,
  getCustomerStatement
} from '../../../src/main/services/customers.service';

describe('Clientes, Crédito y Estado de Cuenta (renderer/customers)', () => {
  let db: Database.Database;
  let customerId: number;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare("INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrador')").run();
    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (1, 'u1', 'admin', 'Admin', 1, datetime('now'))").run();

    const cust = createCustomer(db, {
      name: 'Supermercado Familiar',
      docType: 'RUC',
      docNumber: 'J0310000444444',
      phone: '+505 2255-8888',
      creditLimitCents: 200000n, // C$ 2,000.00
      creditDays: 15
    });
    customerId = cust.id;
  });

  afterEach(() => {
    db.close();
  });

  it('Genera estado de cuenta con saldo y tabla de antigüedad para la UI', () => {
    recordCustomerCharge(db, {
      customerId,
      amountCents: 50000n,
      userId: 1,
      dueOn: '2026-09-15',
      note: 'Factura F-001'
    });

    const statement = getCustomerStatement(db, customerId);
    expect(statement).toBeDefined();
    expect(statement?.balanceCents).toBe(50000n);
    expect(statement?.creditLimitCents).toBe(200000n);
    expect(statement?.availableCreditCents).toBe(150000n);
    expect(statement?.entries.length).toBe(1);
    expect(statement?.aging.totalCents).toBe(50000n);
  });
});
