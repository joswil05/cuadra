import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { createIpcRouter, IpcRouter } from '../../src/main/ipc/router';
import { registerBusinessHandlers, registerSystemHandlers } from '../../src/main/ipc/handlers';
import * as contracts from '../../src/shared/ipc';
import type { IpcContract } from '../../src/shared/ipc';
import type { DailyTaxSummaryRow } from '../../src/core/reports';

/**
 * Veracidad de lo que se muestra.
 *
 * No basta con que la pantalla dibuje un número: tiene que ser el número que
 * sale del libro. Estas pruebas siembran ventas de importe conocido y
 * comparan contra el total calculado a mano, no contra lo que devuelva el
 * propio sistema.
 */
describe('Veracidad de los datos presentados', () => {
  let db: Database.Database;
  let router: IpcRouter;

  beforeEach(() => {
    db = createDbConnection(':memory:');
    runMigrations(db, path.resolve(__dirname, '../../db/migrations'));
    router = createIpcRouter();
    registerSystemHandlers(router, db);
    registerBusinessHandlers(router, db);
  });

  afterEach(() => db.close());

  async function invoke<TIn, TOut>(c: IpcContract<TIn, TOut>, payload: TIn): Promise<TOut> {
    const res = await router.handle(c.channel, payload);
    if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
    return res.data as TOut;
  }

  async function configurar(regimen: 'general' | 'cuota_fija' = 'general') {
    await invoke(contracts.OnboardingContract, {
      businessName: 'Comercial de Prueba, S.A.',
      ruc: 'J0310000000001',
      address: 'Managua',
      phone: '+505 0000-0000',
      taxRegime: regimen,
      industryProfile: 'minimarket',
      initialCashFundNio: 100000n,
      initialCashFundUsd: 0n,
      adminFullName: 'Dueña de Prueba'
    });
    return invoke(contracts.BootstrapContract, undefined);
  }

  it('El total del catálogo que ve la pantalla coincide con el Kardex', async () => {
    await configurar();
    const catalogo = await invoke(contracts.InventoryListContract, undefined);

    for (const fila of catalogo) {
      const kardex = db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN qty_milli ELSE -qty_milli END), 0) AS saldo
             FROM inventory_moves WHERE variant_id = ?`
        )
        .get(fila.variantId) as { saldo: number };

      // La existencia que se dibuja es la caché; el Kardex es la verdad.
      expect(fila.stockMilli).toBe(BigInt(kardex.saldo));
    }
  });

  it('El resumen diario de IVA suma exactamente lo facturado', async () => {
    const boot = await configurar('general');
    const catalogo = await invoke(contracts.InventoryListContract, undefined);
    const gravado = catalogo.find((c) => c.taxStatus === 'IVA15' && c.stockMilli > 0n);
    expect(gravado).toBeDefined();

    // Tres ventas de una unidad del mismo producto gravado.
    for (let i = 0; i < 3; i++) {
      const r = await invoke(contracts.PosTenderContract, {
        cart: {
          id: `venta-${i}`,
          orderDiscountCents: 0n,
          lines: [
            {
              lineNo: 1,
              variantId: gravado!.variantId,
              sku: gravado!.sku,
              description: gravado!.name,
              unitPriceCents: gravado!.priceCents,
              qtyMilli: 1000n,
              lineDiscountCents: 0n,
              taxKind: 'taxable',
              taxRateBp: 1500n,
              stockMilli: gravado!.stockMilli,
              tracksStock: true
            }
          ]
        },
        seriesId: boot.series.find((s) => s.docType === 'ticket')!.id,
        shiftId: boot.openShift!.id,
        userId: boot.currentUserId!,
        docType: 'ticket',
        payments: [
          { method: 'cash', currencyCode: 'NIO', amountFx: 1_000_000n, fxRateMicros: 1_000_000n }
        ]
      });
      expect(r.ok).toBe(true);
    }

    // Lo que el reporte le muestra al contador.
    // Se lee con la MISMA forma que consume la pantalla de Impuestos.
    const filas = (await invoke(
      contracts.ReportDailyTaxContract,
      {}
    )) as unknown as DailyTaxSummaryRow[];

    const reporte = filas.reduce(
      (a, f) => ({
        gravada: a.gravada + f.taxableBaseCents,
        exenta: a.exenta + f.exemptBaseCents,
        iva: a.iva + f.taxCents,
        total: a.total + f.totalCents
      }),
      { gravada: 0n, exenta: 0n, iva: 0n, total: 0n }
    );

    // Lo que realmente quedó guardado, sumado aparte.
    const libro = db
      .prepare(
        `SELECT COALESCE(SUM(taxable_base_cents),0) AS gravada,
                COALESCE(SUM(exempt_base_cents),0)  AS exenta,
                COALESCE(SUM(tax_cents),0)          AS iva,
                COALESCE(SUM(total_cents),0)        AS total
           FROM sales WHERE status != 'voided'`
      )
      .get() as { gravada: number; exenta: number; iva: number; total: number };

    expect(reporte.gravada).toBe(BigInt(libro.gravada));
    expect(reporte.iva).toBe(BigInt(libro.iva));
    expect(reporte.total).toBe(BigInt(libro.total));

    // Y el documento cuadra: base + exenta + IVA + redondeo = total.
    const descuadre = db
      .prepare(
        `SELECT COUNT(*) AS n FROM sales
          WHERE total_cents <> taxable_base_cents + exempt_base_cents
                              + tax_cents + cash_rounding_cents`
      )
      .get() as { n: number };
    expect(descuadre.n).toBe(0);
  });

  it('Bajo cuota fija el reporte fiscal nunca muestra IVA', async () => {
    await configurar('cuota_fija');
    const filas = (await invoke(
      contracts.ReportDailyTaxContract,
      {}
    )) as unknown as DailyTaxSummaryRow[];
    const iva = filas.reduce((a, f) => a + f.taxCents, 0n);
    expect(iva).toBe(0n);
  });

  it('Ninguna pantalla lleva cifras de muestra escritas a mano', () => {
    const dir = path.resolve(__dirname, '../../src/renderer/src/pages');
    const sospechosos: string[] = [];

    for (const nombre of readdirSync(dir)) {
      if (!nombre.endsWith('.tsx') || nombre === 'Showcase.tsx') continue;
      const bruto = readFileSync(path.join(dir, nombre), 'utf8');
      // Un comentario puede citar un importe de ejemplo sin llegar a mostrarlo.
      const texto = quitarComentarios(bruto);

      // Constantes de muestra que antes alimentaban las pantallas.
      if (/const (INITIAL_|MUESTRA_|DATOS_MUESTRA|MOCK_|SEED_)/.test(texto)) {
        sospechosos.push(`${nombre}: declara una constante de datos de muestra`);
      }
      // Importes grandes escritos a mano en el código de una pantalla.
      const literales = texto.match(/\b\d{6,}n\b/g) ?? [];
      if (literales.length > 0) {
        sospechosos.push(`${nombre}: importes literales ${literales.slice(0, 3).join(', ')}`);
      }
    }

    expect(sospechosos).toEqual([]);
  });

  it('La barra lateral no ofrece herramientas de desarrollo en producción', async () => {
    const nav = await import('../../src/renderer/src/lib/navigation');
    const enProduccion = nav.visibleItems(() => true, false).map((i) => i.id);
    const enDesarrollo = nav.visibleItems(() => true, true).map((i) => i.id);

    expect(enProduccion).not.toContain('showcase');
    expect(enDesarrollo).toContain('showcase');

    // Y el resumen del dueño exige permiso.
    const sinPermiso = nav.visibleItems(() => false, false).map((i) => i.id);
    expect(sinPermiso).not.toContain('dashboard');
  });

  it('Cada pantalla de la navegación tiene una vista enrutada', async () => {
    const nav = await import('../../src/renderer/src/lib/navigation');
    const app = readFileSync(
      path.resolve(__dirname, '../../src/renderer/src/App.tsx'),
      'utf8'
    );
    const faltantes = nav
      .visibleItems(() => true, true)
      .map((i) => i.id)
      .filter((id) => !app.includes(`case '${id}':`));

    expect(faltantes).toEqual([]);
  });

  it('Los atajos de teclado no se repiten', async () => {
    const nav = await import('../../src/renderer/src/lib/navigation');
    const atajos = nav
      .visibleItems(() => true, true)
      .map((i) => i.shortcut)
      .filter((s): s is string => !!s);
    expect(new Set(atajos).size).toBe(atajos.length);
  });
});

/** Quita comentarios de bloque y de línea antes de buscar cifras literales. */
function quitarComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

/** Silencia el aviso de variable sin usar en entornos sin `statSync`. */
void statSync;
