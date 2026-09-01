import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface MigrationResult {
  appliedCount: number;
  appliedFiles: string[];
}

export function runMigrations(db: Database.Database, migrationsDir: string): MigrationResult {
  if (!fs.existsSync(migrationsDir)) {
    return { appliedCount: 0, appliedFiles: [] };
  }

  // Verificar si ya existe la tabla schema_migrations
  const hasMigrationsTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
  ).get();

  const appliedSet = new Set<number>();
  if (hasMigrationsTable) {
    const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
    appliedRows.forEach((r) => appliedSet.add(r.version));
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedFiles: string[] = [];

  for (const file of files) {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match || !match[1]) continue;

    const version = parseInt(match[1], 10);
    if (appliedSet.has(version)) {
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf-8');

    const applyMigration = db.transaction(() => {
      db.exec(sql);

      // Asegurar que schema_migrations existe si la migración no la creó
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version     INTEGER PRIMARY KEY,
          name        TEXT NOT NULL,
          applied_at  TEXT NOT NULL
        );
      `);

      db.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (?, ?, datetime('now'))
      `).run(version, file);
    });

    applyMigration();
    appliedFiles.push(file);
    appliedSet.add(version);
  }

  return {
    appliedCount: appliedFiles.length,
    appliedFiles
  };
}
