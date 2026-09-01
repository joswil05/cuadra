import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { runMigrations } from './db/migrator';
import { createIpcRouter } from './ipc/router';
import { registerBusinessHandlers, registerSystemHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;

function getDatabasePath(): string {
  if (app.isPackaged) {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    return path.join(userDataPath, 'cuadra.db');
  } else {
    const devDbDir = path.resolve(app.getAppPath(), '.data');
    if (!fs.existsSync(devDbDir)) {
      fs.mkdirSync(devDbDir, { recursive: true });
    }
    return path.join(devDbDir, 'cuadra_dev.db');
  }
}

function initializeDatabase(): Database.Database {
  const dbPath = getDatabasePath();
  const database = new Database(dbPath);

  // Configuración de rendimiento y seguridad de SQLite según AGENT-GUIDE.md
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('synchronous = FULL');
  database.pragma('busy_timeout = 5000');

  // Ejecutar migraciones
  const migrationsDir = path.resolve(app.getAppPath(), 'db/migrations');
  runMigrations(database, migrationsDir);

  return database;
}

function setupIpc(database: Database.Database) {
  const router = createIpcRouter();

  // Fontaneria de la fase 0
  registerSystemHandlers(router, database);

  // Canales de negocio (todas las fases)
  registerBusinessHandlers(router, database);

  // Escuchar invocaciones IPC desde el renderer
  ipcMain.handle('ipc:invoke', async (_event, channel: string, payload: unknown) => {
    return await router.handle(channel, payload);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'Cuadra',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  db = initializeDatabase();
  setupIpc(db);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (db) {
    db.close();
    db = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
