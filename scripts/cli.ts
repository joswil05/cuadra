import * as path from 'path';
import { createDbConnection } from '../src/main/db/connection';
import { runMigrations } from '../src/main/db/migrator';
import { reconcileInventory } from '../src/main/repositories/inventory.repository';

const command = process.argv[2];

function main(): void {
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'cuadra.db');
  const migrationsDir = path.resolve(process.cwd(), 'db/migrations');

  const db = createDbConnection(dbPath);
  runMigrations(db, migrationsDir);

  try {
    switch (command) {
      case 'inventory:reconcile': {
        const result = reconcileInventory(db);
        if (result.driftCount === 0) {
          console.log('✅ Inventario conciliado: 0 diferencias entre caché y Kardex.');
          process.exit(0);
        } else {
          console.error(`❌ Se detectaron ${result.driftCount} diferencias de inventario (drift):`);
          console.table(result.drifts);
          process.exit(1);
        }
        break;
      }
      default:
        console.error(`Comando desconocido: ${command}`);
        console.log('Comandos disponibles: inventory:reconcile');
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

main();
