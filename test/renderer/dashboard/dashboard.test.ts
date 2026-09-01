import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../../src/main/db/migrator';
import { createDbConnection } from '../../../src/main/db/connection';
import { getOwnerDashboardData } from '../../../src/main/services/dashboard.service';

describe('Panel del Dueño en Renderer (renderer/dashboard)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations');
    runMigrations(db, migrationsDir);

    db.prepare(`
      INSERT INTO roles (id, code, name, permissions_json) VALUES
      (3, 'owner', 'Dueño', '["dashboard.view","reports.cost_and_margin"]')
    `).run();

    db.prepare("INSERT INTO users (id, uid, username, full_name, role_id, created_at) VALUES (3, 'u-owner', 'dueno', 'Don Propietario', 3, datetime('now'))").run();
    db.prepare("INSERT INTO warehouses (id, code, name, is_default) VALUES (1, 'CENTRAL', 'Almacén Central', 1)").run();
    db.prepare("INSERT INTO units (id, code, name, decimals) VALUES (1, 'PZA', 'Pieza', 0)").run();
  });

  afterEach(() => {
    db.close();
  });

  it('Genera las 3 bandas del tablero para el dueño', () => {
    const data = getOwnerDashboardData(db, 3);

    // Banda 1: Pulso de hoy
    expect(data.pulse).toBeDefined();
    expect(typeof data.pulse.todaySalesCents).toBe('bigint');
    expect(typeof data.pulse.todayTicketsCount).toBe('number');

    // Banda 2: Avisos que necesitan decisión
    expect(data.actions).toBeDefined();
    expect(Array.isArray(data.actions.lowStockItems)).toBe(true);
    expect(Array.isArray(data.actions.expiringLots)).toBe(true);
    expect(Array.isArray(data.actions.overdueCustomers)).toBe(true);

    // Banda 3: Tendencias
    expect(data.trends).toBeDefined();
    expect(Array.isArray(data.trends.topSellingProducts)).toBe(true);
  });
});
