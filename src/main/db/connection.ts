import Database from 'better-sqlite3';

/**
 * Crea una conexión SQLite configurada con los pragmas de robustez exigidos por Cuadra:
 * - WAL (Write-Ahead Logging)
 * - foreign_keys = ON
 * - synchronous = FULL
 * - busy_timeout = 5000ms
 */
export function createDbConnection(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // WAL mode
  db.pragma('journal_mode = WAL');
  // Claves foráneas activas
  db.pragma('foreign_keys = ON');
  // Sincronización completa para resiliencia ante cortes de luz
  db.pragma('synchronous = FULL');
  // Esperar hasta 5 segundos si la base está ocupada
  db.pragma('busy_timeout = 5000');

  return db;
}

/**
 * Ejecuta una función dentro de una transacción BEGIN IMMEDIATE.
 * Si ocurre cualquier error, revierte (ROLLBACK) y propaga la excepción.
 */
export function withTransaction<T>(db: Database.Database, fn: () => T): T {
  const tx = db.transaction(fn);
  return tx.immediate();
}
