import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/db/migrator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Migrador de Base de Datos', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(() => {
    db = new Database(':memory:');
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuadra-test-migrations-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('aplica una migración y la registra en schema_migrations', () => {
    const migrationSql = `
      CREATE TABLE test_items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
    `;
    fs.writeFileSync(path.join(tempDir, '001_test.sql'), migrationSql);

    const result = runMigrations(db, tempDir);

    expect(result.appliedCount).toBe(1);
    expect(result.appliedFiles).toEqual(['001_test.sql']);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_items'").all();
    expect(tables.length).toBe(1);

    const applied = db.prepare('SELECT version, name FROM schema_migrations WHERE version = 1').get() as { version: number; name: string };
    expect(applied).toBeDefined();
    expect(applied.version).toBe(1);
    expect(applied.name).toBe('001_test.sql');
  });

  it('es idempotente: corrido dos veces no vuelve a aplicar nada', () => {
    const migrationSql = `
      CREATE TABLE test_idempotent (
        id INTEGER PRIMARY KEY
      );
    `;
    fs.writeFileSync(path.join(tempDir, '001_test.sql'), migrationSql);

    const firstRun = runMigrations(db, tempDir);
    expect(firstRun.appliedCount).toBe(1);

    const secondRun = runMigrations(db, tempDir);
    expect(secondRun.appliedCount).toBe(0);
    expect(secondRun.appliedFiles).toEqual([]);
  });

  it('aplica exitosamente la migración real del proyecto db/migrations/001_init.sql', () => {
    const realMigrationsDir = path.resolve(__dirname, '../../db/migrations');
    const result = runMigrations(db, realMigrationsDir);

    expect(result.appliedCount).toBeGreaterThanOrEqual(1);
    expect(result.appliedFiles).toContain('001_init.sql');

    // Verificar que existen tablas clave de 001_init.sql
    const settings = db.prepare("SELECT key, value_json FROM settings WHERE key = 'currency.code'").get() as { key: string; value_json: string };
    expect(settings).toBeDefined();
    expect(settings.value_json).toBe('"NIO"');

    const taxRates = db.prepare('SELECT code, rate_bp FROM tax_rates WHERE code = ?').get('IVA15') as { code: string; rate_bp: number };
    expect(taxRates).toBeDefined();
    expect(taxRates.rate_bp).toBe(1500);

    // Verificar que una segunda corrida no reaplica
    const rerun = runMigrations(db, realMigrationsDir);
    expect(rerun.appliedCount).toBe(0);
  });
});
