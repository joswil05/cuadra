import Database from 'better-sqlite3';
import { IpcRouter } from './router';
import {
  BootstrapContract,
  BootstrapData,
  OnboardingContract,
  PosSearchContract,
  PosTenderContract,
  InventoryListContract,
  InventoryCreateContract,
  InventoryAdjustContract,
  InventoryKardexContract,
  InventoryUndefinedTaxContract,
  InventoryBulkTaxContract,
  CustomersListContract,
  CustomersCreateContract,
  CustomersStatementContract,
  CustomersPaymentContract,
  SuppliersListContract,
  SupplierCreateContract,
  PurchasesListContract,
  ReportDailyTaxContract,
  ReportMonthlyIncomeContract,
  ReportSalesBookContract,
  ReportInventoryContract,
  ReportMarginsContract,
  ReportCashDiscrepanciesContract,
  DashboardContract,
  ShiftOpenContract,
  ShiftBlindContract,
  ShiftCloseContract,
  SaleVoidContract,
  CatalogRow,
  CustomerRow,
  SupplierRow,
  PurchaseRow,
  KardexRow,
  UndefinedTaxRow,
  PingContract,
  DbTestContract
} from '../../shared/ipc';

import { openShift, closeShift, getShiftBlind, getOpenShift } from '../services/cash.service';
import { voidSale } from '../services/sales.service';
import { searchProductsPos, tenderPosCart } from '../services/pos.service';
import { completeOnboardingWizard } from '../services/onboarding.service';
import {
  createSimpleProduct,
  createInventoryAdjustment,
  getVariantKardex,
  getUndefinedTaxProducts,
  bulkUpdateProductsTaxRate
} from '../services/catalog.service';
import {
  createCustomer,
  getCustomers,
  getCustomerStatement,
  recordCustomerPayment
} from '../services/customers.service';
import { createSupplier, getSuppliers } from '../services/purchases.service';
import {
  getDailyTaxSummaryReport,
  getMonthlyGrossIncomeReport,
  getSalesBookReport,
  getInventoryValuationReport,
  getProfitMarginsReport,
  getCashDiscrepanciesReport
} from '../services/reports.service';
import { getOwnerDashboardData, getUserPermissions } from '../services/dashboard.service';

/**
 * Canales de fontanería de la fase 0. Viven aquí, junto a los de negocio,
 * para que exista un solo lugar donde se registran canales y la prueba de
 * cableado pueda comprobar que ninguno quedó sin manejador.
 */
export function registerSystemHandlers(router: IpcRouter, db: Database.Database): void {
  router.register(PingContract, (input) => ({
    reply: `Pong desde proceso principal: ${input.message}`,
    timestamp: Date.now()
  }));

  router.register(DbTestContract, (input) => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO settings (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    ).run(input.key, JSON.stringify(input.value), now);

    const row = db
      .prepare(`SELECT key, value_json, updated_at FROM settings WHERE key = ?`)
      .get(input.key) as { key: string; value_json: string; updated_at: string } | undefined;

    if (!row) {
      throw new Error(`No se pudo recuperar la fila para la clave '${input.key}'`);
    }

    let parsed = '';
    try {
      parsed = JSON.parse(row.value_json);
    } catch {
      parsed = row.value_json;
    }

    return { key: row.key, value: String(parsed), updatedAt: row.updated_at };
  });
}

/**
 * Registra todos los canales de negocio.
 *
 * Regla de capas: el renderer nunca ve SQL ni la conexión. Pide por canal, el
 * proceso principal valida la entrada con Zod y ejecuta el servicio probado.
 */
export function registerBusinessHandlers(router: IpcRouter, db: Database.Database): void {
  // ------------------------------------------------------------- Arranque
  router.register(BootstrapContract, (): BootstrapData => {
    const company = db
      .prepare(
        `SELECT legal_name, trade_name, ruc, address, phone, dgi_auth_number
           FROM company WHERE id = 1`
      )
      .get() as
      | {
          legal_name: string;
          trade_name: string | null;
          ruc: string;
          address: string;
          phone: string;
          dgi_auth_number: string | null;
        }
      | undefined;

    // El régimen es una política del negocio y vive en settings, no en la
    // ficha de la empresa: cambiarlo cambia cómo se calcula cada documento.
    const regimeRow = db
      .prepare(`SELECT value_json FROM settings WHERE key = 'tax.regime'`)
      .get() as { value_json: string } | undefined;
    let taxRegime = 'cuota_fija';
    if (regimeRow) {
      try {
        taxRegime = String(JSON.parse(regimeRow.value_json));
      } catch {
        taxRegime = 'cuota_fija';
      }
    }

    const user = db
      .prepare(`SELECT id FROM users WHERE is_active = 1 ORDER BY id LIMIT 1`)
      .get() as { id: number } | undefined;

    const series = db
      .prepare(
        `SELECT id, doc_type, code, prefix FROM document_series WHERE is_active = 1 ORDER BY id`
      )
      .all() as { id: number; doc_type: string; code: string; prefix: string }[];

    return {
      needsOnboarding: !company,
      company: company
        ? {
            legalName: company.legal_name,
            tradeName: company.trade_name,
            ruc: company.ruc,
            address: company.address,
            phone: company.phone,
            dgiAuthNumber: company.dgi_auth_number,
            taxRegime
          }
        : null,
      openShift: getOpenShift(db),
      currentUserId: user?.id ?? null,
      permissions: user ? getUserPermissions(db, user.id) : [],
      series: series.map((s) => ({
        id: s.id,
        docType: s.doc_type,
        code: s.code,
        prefix: s.prefix
      }))
    };
  });

  // ----------------------------------------------------------- Onboarding
  router.register(OnboardingContract, (input) => completeOnboardingWizard(db, input));

  // ------------------------------------------------------------------ POS
  router.register(PosSearchContract, (input) => searchProductsPos(db, input.query));

  router.register(PosTenderContract, (input) =>
    tenderPosCart(db, {
      cart: input.cart,
      seriesId: input.seriesId,
      shiftId: input.shiftId,
      userId: input.userId,
      docType: input.docType,
      payments: input.payments,
      isContingency: input.isContingency
    })
  );

  // ----------------------------------------------------------- Inventario
  router.register(InventoryListContract, (): CatalogRow[] => {
    const rows = db
      .prepare(
        `SELECT p.id            AS product_id,
                v.id            AS variant_id,
                p.name          AS name,
                v.sku           AS sku,
                (SELECT b.code FROM barcodes b
                  WHERE b.variant_id = v.id
                  ORDER BY b.is_primary DESC, b.id LIMIT 1) AS barcode,
                v.price_cents     AS price_cents,
                v.cost_avg_micros AS cost_micros,
                v.stock_milli     AS stock_milli,
                COALESCE(v.min_stock_milli, 0) AS min_stock_milli,
                t.kind          AS tax_kind,
                p.tax_rate_id   AS tax_rate_id
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           LEFT JOIN tax_rates t ON t.id = p.tax_rate_id
          WHERE v.is_active = 1 AND p.is_active = 1
          ORDER BY p.name, v.sku`
      )
      .all() as {
      product_id: number;
      variant_id: number;
      name: string;
      sku: string;
      barcode: string | null;
      price_cents: number;
      cost_micros: number;
      stock_milli: number;
      min_stock_milli: number;
      tax_kind: string | null;
      tax_rate_id: number | null;
    }[];

    return rows.map((r) => ({
      id: r.product_id,
      variantId: r.variant_id,
      name: r.name,
      sku: r.sku,
      barcode: r.barcode,
      priceCents: BigInt(r.price_cents),
      costMicros: BigInt(r.cost_micros),
      stockMilli: BigInt(r.stock_milli),
      minStockMilli: BigInt(r.min_stock_milli),
      taxStatus:
        r.tax_rate_id === null
          ? 'SIN_DEFINIR'
          : r.tax_kind === 'taxable'
            ? 'IVA15'
            : 'EXENTO'
    }));
  });

  router.register(InventoryCreateContract, (input) =>
    createSimpleProduct(db, {
      name: input.name,
      sku: input.sku,
      unitId: input.unitId,
      barcode: input.barcode,
      priceCents: input.priceCents,
      costMicros: input.costMicros,
      taxRateId: input.taxRateId,
      tracksStock: input.tracksStock,
      userId: input.userId
    })
  );

  router.register(InventoryAdjustContract, (input) => {
    const res = createInventoryAdjustment(db, {
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      direction: input.direction,
      qtyMilli: input.qtyMilli,
      unitCostMicros: input.unitCostMicros,
      reason: input.reason,
      note: input.note,
      userId: input.userId
    });
    return { moveId: res.moveId };
  });

  router.register(InventoryKardexContract, (input): KardexRow[] => {
    const entries = getVariantKardex(db, input.variantId) as unknown as {
      id: number;
      at: string;
      direction: string;
      reason: string;
      qtyMilli: bigint;
      balanceQtyMilli: bigint;
      unitCostMicros: bigint;
      note: string | null;
    }[];
    const limit = input.limit ?? 100;
    return entries.slice(0, limit);
  });

  router.register(
    InventoryUndefinedTaxContract,
    (): UndefinedTaxRow[] => getUndefinedTaxProducts(db) as unknown as UndefinedTaxRow[]
  );

  router.register(InventoryBulkTaxContract, (input) => {
    bulkUpdateProductsTaxRate(db, input.productIds, input.taxRateId);
    return { updated: input.productIds.length };
  });

  // ------------------------------------------------------------- Clientes
  router.register(CustomersListContract, (): CustomerRow[] => {
    const list = getCustomers(db) as unknown as {
      id: number;
      code: string;
      name: string;
      phone: string | null;
      creditLimitCents: bigint;
    }[];
    return list.map((c) => {
      const bal = db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents), 0) AS b FROM customer_ledger WHERE customer_id = ?`
        )
        .get(c.id) as { b: number };
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        phone: c.phone,
        creditLimitCents: c.creditLimitCents,
        balanceCents: BigInt(bal.b)
      };
    });
  });

  router.register(CustomersCreateContract, (input) => {
    const c = createCustomer(db, input) as unknown as { id: number };
    return { id: c.id };
  });

  router.register(CustomersStatementContract, (input) => {
    const st = getCustomerStatement(db, input.customerId);
    if (!st) throw new Error(`Cliente no encontrado: ${input.customerId}`);
    return st as unknown as { balanceCents: bigint; entries: [] };
  });

  router.register(CustomersPaymentContract, (input) => {
    const res = recordCustomerPayment(db, {
      customerId: input.customerId,
      amountCents: input.amountCents,
      method: input.method,
      shiftId: input.shiftId,
      userId: input.userId,
      note: input.note
    });
    return res as unknown as { balanceCents: bigint };
  });

  // -------------------------------------------------------------- Compras
  router.register(
    SuppliersListContract,
    (): SupplierRow[] => getSuppliers(db) as unknown as SupplierRow[]
  );

  router.register(SupplierCreateContract, (input) => {
    const s = createSupplier(db, input) as unknown as { id: number };
    return { id: s.id };
  });

  router.register(PurchasesListContract, (): PurchaseRow[] => {
    const rows = db
      .prepare(
        `SELECT p.id, p.folio, COALESCE(s.name, '-') AS supplier_name,
                p.status, p.total_cents, p.at
           FROM purchases p
           LEFT JOIN suppliers s ON s.id = p.supplier_id
          ORDER BY p.id DESC LIMIT 200`
      )
      .all() as {
      id: number;
      folio: string;
      supplier_name: string;
      status: string;
      total_cents: number;
      at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      folio: r.folio,
      supplierName: r.supplier_name,
      status: r.status,
      totalCents: BigInt(r.total_cents),
      at: r.at
    }));
  });

  // ------------------------------------------------------------- Reportes
  router.register(ReportDailyTaxContract, (i) =>
    getDailyTaxSummaryReport(db, i.fromDate, i.toDate)
  );
  router.register(ReportMonthlyIncomeContract, () => getMonthlyGrossIncomeReport(db));
  router.register(ReportSalesBookContract, (i) =>
    getSalesBookReport(db, undefined, i.fromDate, i.toDate)
  );
  router.register(ReportInventoryContract, () => getInventoryValuationReport(db));
  router.register(ReportMarginsContract, (i) => getProfitMarginsReport(db, i.fromDate, i.toDate));
  router.register(ReportCashDiscrepanciesContract, () => getCashDiscrepanciesReport(db));

  // -------------------------------------------------------------- Tablero
  router.register(DashboardContract, (input) => getOwnerDashboardData(db, input.userId));

  // ----------------------------------------------------------------- Caja
  router.register(ShiftOpenContract, (input) => openShift(db, input));
  router.register(ShiftBlindContract, (input) => getShiftBlind(db, input.shiftId));
  router.register(ShiftCloseContract, (input) => closeShift(db, input));

  // --------------------------------------------------------------- Ventas
  router.register(SaleVoidContract, (input) => {
    voidSale(db, { saleId: input.saleId, userId: input.userId, reason: input.reason });
    return { voided: true as const };
  });
}
