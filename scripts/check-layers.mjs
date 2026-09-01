#!/usr/bin/env node
/**
 * Guardián de capas.
 *
 * Dos reglas que ninguna otra verificación cubría:
 *
 * 1. `src/renderer/` no importa de `src/main/`. El renderer corre en un
 *    proceso sin Node ni acceso a la base: cualquier import de main es, en el
 *    mejor caso, un tipo que se borra al compilar, y en el peor un módulo que
 *    revienta en tiempo de ejecución. Los tipos compartidos viven en
 *    `src/shared/`.
 *
 * 2. Toda pantalla de `src/renderer/src/pages/` habla por IPC. Una pantalla
 *    que solo usa `useState` se ve terminada y no guarda nada: ese fue
 *    exactamente el fallo que la suite no detectó durante once fases.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = process.cwd();
const rendererDir = join(raiz, 'src', 'renderer');
const pagesDir = join(raiz, 'src', 'renderer', 'src', 'pages');

/** Pantallas que legítimamente no tocan datos del negocio. */
const SIN_DATOS = new Set(['Showcase.tsx']);

function archivos(dir, ext = ['.ts', '.tsx']) {
  const salida = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, ext));
    else if (ext.some((e) => entrada.endsWith(e))) salida.push(ruta);
  }
  return salida;
}

const problemas = [];

// Regla 1: renderer no importa de main
for (const archivo of archivos(rendererDir)) {
  const texto = readFileSync(archivo, 'utf8');
  for (const linea of texto.split('\n')) {
    if (/from\s+['"][^'"]*\bmain\//.test(linea)) {
      problemas.push(
        `${relative(raiz, archivo)}: el renderer importa de main/ -> ${linea.trim()}`
      );
    }
  }
}

// Regla 2: cada pantalla usa IPC
for (const archivo of archivos(pagesDir, ['.tsx'])) {
  const nombre = archivo.split(/[\\/]/).pop();
  if (SIN_DATOS.has(nombre)) continue;
  const texto = readFileSync(archivo, 'utf8');
  // `useSession` cuenta: la sesión se llena con el canal `app:bootstrap`, así
  // que una pantalla que solo lee de ahí sigue mostrando datos reales.
  const usaIpc = /useIpcQuery|useSession|from '.*lib\/api'|shared\/ipc/.test(texto);
  if (!usaIpc) {
    problemas.push(
      `${relative(raiz, archivo)}: la pantalla no habla por IPC; sus datos no se guardan.`
    );
  }
}

if (problemas.length > 0) {
  console.error('\n❌ Verificación de capas fallida:\n');
  for (const p of problemas) console.error('  - ' + p);
  console.error(
    `\n${problemas.length} problema(s). Los tipos compartidos van en src/shared/; ` +
      'los datos se piden por canal IPC.\n'
  );
  process.exit(1);
}

console.log('✅ Verificación de capas superada (renderer aislado de main y toda pantalla usa IPC).');
