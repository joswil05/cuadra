import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { runMigrations } from '../../src/main/db/migrator';
import { createDbConnection } from '../../src/main/db/connection';
import { createIpcRouter, IpcRouter } from '../../src/main/ipc/router';
import { registerBusinessHandlers, registerSystemHandlers } from '../../src/main/ipc/handlers';
import * as contracts from '../../src/shared/ipc';
import type { IpcContract } from '../../src/shared/ipc';

/**
 * Estas pruebas cruzan la frontera que las demás no tocan.
 *
 * La suite prueba los servicios por un lado y los componentes por el otro.
 * El fallo que nadie vio fue que el cable entre los dos no existía: la
 * interfaz calculaba en memoria y nada se guardaba. Aquí se ejercita el
 * router igual que lo hace el renderer, por nombre de canal y con la carga
 * ya serializada.
 */
describe('Cableado IPC de extremo a extremo', () => {
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

  /** Llama como lo haría el renderer y devuelve el dato o lanza el error. */
  async function invoke<TIn, TOut>(contract: IpcContract<TIn, TOut>, payload: TIn): Promise<TOut> {
    const res = await router.handle(contract.channel, payload);
    if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
    return res.data as TOut;
  }

  it('Todo contrato exportado tiene un manejador registrado', async () => {
    const all: { channel: string }[] = [];
    for (const v of Object.values(contracts) as unknown[]) {
      if (typeof v === 'object' && v !== null && 'channel' in v && 'inputSchema' in v) {
        all.push(v as { channel: string });
      }
    }

    expect(all.length).toBeGreaterThan(20);

    const sinManejador: string[] = [];
    for (const c of all) {
      const res = await router.handle(c.channel, undefined);
      if (!res.ok && res.code === 'CHANNEL_NOT_FOUND') sinManejador.push(c.channel);
    }

    expect(sinManejador).toEqual([]);
  });

  it('Un negocio nuevo se declara sin configurar', async () => {
    const boot = await invoke(contracts.BootstrapContract, undefined);
    expect(boot.needsOnboarding).toBe(true);
    expect(boot.openShift).toBeNull();
  });

  it('El asistente configura la empresa, siembra catálogo y abre turno', async () => {
    const res = await invoke(contracts.OnboardingContract, {
      businessName: 'Comercial de Prueba, S.A.',
      ruc: 'J0310000000001',
      address: 'Managua',
      phone: '+505 0000-0000',
      taxRegime: 'general',
      industryProfile: 'minimarket',
      initialCashFundNio: 150000n,
      initialCashFundUsd: 5000n,
      adminFullName: 'Dueña de Prueba'
    });

    expect(res.success).toBe(true);
    expect(res.seededProductsCount).toBeGreaterThan(0);

    const boot = await invoke(contracts.BootstrapContract, undefined);
    expect(boot.needsOnboarding).toBe(false);
    expect(boot.company?.ruc).toBe('J0310000000001');
    expect(boot.openShift).not.toBeNull();
    expect(boot.currentUserId).not.toBeNull();
  });

  it('Una venta cobrada por IPC queda grabada y baja la existencia', async () => {
    await invoke(contracts.OnboardingContract, {
      businessName: 'Comercial de Prueba, S.A.',
      ruc: 'J0310000000001',
      address: 'Managua',
      phone: '+505 0000-0000',
      taxRegime: 'general',
      industryProfile: 'minimarket',
      initialCashFundNio: 150000n,
      initialCashFundUsd: 0n,
      adminFullName: 'Dueña de Prueba'
    });

    const boot = await invoke(contracts.BootstrapContract, undefined);
    const catalogo = await invoke(contracts.InventoryListContract, undefined);
    expect(catalogo.length).toBeGreaterThan(0);

    const conStock = catalogo.find((c) => c.stockMilli > 0n);
    expect(conStock).toBeDefined();

    const stockAntes = conStock!.stockMilli;
    const ventasAntes = (
      db.prepare('SELECT COUNT(*) AS n FROM sales').get() as { n: number }
    ).n;

    const resultado = await invoke(contracts.PosTenderContract, {
      cart: {
        id: 'carrito-prueba',
        orderDiscountCents: 0n,
        lines: [
          {
            lineNo: 1,
            variantId: conStock!.variantId,
            sku: conStock!.sku,
            description: conStock!.name,
            unitPriceCents: conStock!.priceCents,
            qtyMilli: 1000n,
            lineDiscountCents: 0n,
            taxKind: conStock!.taxStatus === 'IVA15' ? 'taxable' : 'exempt',
            taxRateBp: conStock!.taxStatus === 'IVA15' ? 1500n : 0n,
            stockMilli: stockAntes,
            tracksStock: true
          }
        ]
      },
      seriesId: boot.series.find((s) => s.docType === 'ticket')!.id,
      shiftId: boot.openShift!.id,
      userId: boot.currentUserId!,
      docType: 'ticket',
      payments: [
        {
          method: 'cash',
          currencyCode: 'NIO',
          amountFx: 100000n,
          fxRateMicros: 1_000_000n
        }
      ]
    });

    expect(resultado.ok).toBe(true);

    // La venta existe en la base, no solo en la respuesta.
    const ventasDespues = (
      db.prepare('SELECT COUNT(*) AS n FROM sales').get() as { n: number }
    ).n;
    expect(ventasDespues).toBe(ventasAntes + 1);

    // Y la existencia bajó, leída de nuevo por el mismo canal que usa la UI.
    const catalogoDespues = await invoke(contracts.InventoryListContract, undefined);
    const despues = catalogoDespues.find((c) => c.variantId === conStock!.variantId)!;
    expect(despues.stockMilli).toBe(stockAntes - 1000n);
  });

  it('El router rechaza una carga que no cumple el esquema', async () => {
    const res = await router.handle(contracts.PosSearchContract.channel, { query: 123 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('INVALID_INPUT');
  });

  it('Un producto creado por IPC nace sin estatus de IVA definido', async () => {
    await invoke(contracts.OnboardingContract, {
      businessName: 'Comercial de Prueba, S.A.',
      ruc: 'J0310000000001',
      address: 'Managua',
      phone: '+505 0000-0000',
      taxRegime: 'general',
      industryProfile: 'minimarket',
      initialCashFundNio: 0n,
      initialCashFundUsd: 0n,
      adminFullName: 'Dueña de Prueba'
    });

    await invoke(contracts.InventoryCreateContract, {
      name: 'Producto Sin Clasificar',
      sku: 'TEST-SIN-IVA',
      unitId: 1,
      priceCents: 5000n,
      taxRateId: null,
      userId: 1
    });

    const catalogo = await invoke(contracts.InventoryListContract, undefined);
    const nuevo = catalogo.find((c) => c.sku === 'TEST-SIN-IVA');
    expect(nuevo).toBeDefined();
    expect(nuevo!.taxStatus).toBe('SIN_DEFINIR');

    const pendientes = await invoke(contracts.InventoryUndefinedTaxContract, undefined);
    expect(pendientes.length).toBeGreaterThan(0);
  });
});
