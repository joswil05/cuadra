import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface BackupResult {
  success: boolean;
  bytesWritten: number;
  integrityCheck: string;
  backupPath: string;
}

export interface RestoreResult {
  success: boolean;
  integrityCheck: string;
  restoredPath: string;
}

/**
 * Crea un respaldo automático de la base de datos SQLite activa utilizando
 * el método nativo de backup de SQLite (consistente en línea sin bloqueos)
 * y ejecuta la verificación PRAGMA integrity_check sobre el archivo generado.
 */
export async function createDatabaseBackup(
  db: Database.Database,
  targetFilePath: string
): Promise<BackupResult> {
  const dir = path.dirname(targetFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 1. Ejecutar backup online de SQLite
  await db.backup(targetFilePath);

  // 2. Abrir el archivo de respaldo para verificar integridad matemática
  const backupDb = new Database(targetFilePath, { readonly: true });
  let integrity = 'unknown';
  try {
    integrity = backupDb.pragma('integrity_check', { simple: true }) as string;
  } finally {
    backupDb.close();
  }

  if (integrity !== 'ok') {
    throw new Error(`Fallo de integridad en el archivo de respaldo: ${integrity}`);
  }

  const stat = fs.statSync(targetFilePath);

  return {
    success: true,
    bytesWritten: stat.size,
    integrityCheck: integrity,
    backupPath: targetFilePath
  };
}

/**
 * Restaura una base de datos a partir de un archivo de respaldo verificado,
 * asegurando integridad con PRAGMA integrity_check.
 */
export function restoreDatabaseBackup(
  backupFilePath: string,
  targetDbPath: string
): RestoreResult {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`El archivo de respaldo no existe: ${backupFilePath}`);
  }

  // 1. Verificar integridad del archivo origen antes de restaurar
  const sourceDb = new Database(backupFilePath, { readonly: true });
  let sourceIntegrity = 'unknown';
  try {
    sourceIntegrity = sourceDb.pragma('integrity_check', { simple: true }) as string;
  } finally {
    sourceDb.close();
  }

  if (sourceIntegrity !== 'ok') {
    throw new Error(`El archivo de respaldo está corrupto: ${sourceIntegrity}`);
  }

  const dir = path.dirname(targetDbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 2. Copiar archivo de respaldo al destino de la base activa
  fs.copyFileSync(backupFilePath, targetDbPath);

  // 3. Verificar la base restaurada
  const targetDb = new Database(targetDbPath);
  let targetIntegrity = 'unknown';
  try {
    targetIntegrity = targetDb.pragma('integrity_check', { simple: true }) as string;
  } finally {
    targetDb.close();
  }

  return {
    success: targetIntegrity === 'ok',
    integrityCheck: targetIntegrity,
    restoredPath: targetDbPath
  };
}
