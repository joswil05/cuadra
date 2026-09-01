import Database from 'better-sqlite3';
import {
  DailyTaxSummaryRow,
  MonthlyGrossIncomeRow,
  SalesBookEntry,
  SalesBookReport,
  InventoryValuationRow,
  ProfitMarginRow,
  CashDiscrepancyRow,
  ReportsReconciliation,
  detectFolioGaps
} from '../../core/reports';

export type {
  DailyTaxSummaryRow,
  MonthlyGrossIncomeRow,
  SalesBookEntry,
  SalesBookReport,
  InventoryValuationRow,
  ProfitMarginRow,
  CashDiscrepancyRow,
  ReportsReconciliation
};

/**
 * Reporte fiscal: Resumen Diario de IVA Trasladado (alimentado por la vista v_daily_tax_summary).
 */
export function getDailyTaxSummaryReport(
  db: Database.Database,
  fromDate?: string,
  toDate?: string
): DailyTaxSummaryRow[] {
  let query = `
    SELECT day, doc_type, documents, taxable_base_cents, exempt_base_cents,
           tax_cents, rounding_cents, total_cents
    FROM v_daily_tax_summary
    WHERE 1=1
  `;
  const args: string[] = [];

  if (fromDate) {
    query += ' AND day >= ?';
    args.push(fromDate);
  }
  if (toDate) {
    query += ' AND day <= ?';
    args.push(toDate);
  }

  query += ' ORDER BY day ASC, doc_type ASC';

  const rows = db.prepare(query).all(...args) as Array<{
    day: string;
    doc_type: string;
    documents: number;
    taxable_base_cents: number;
    exempt_base_cents: number;
    tax_cents: number;
    rounding_cents: number;
    total_cents: number;
  }>;

  return rows.map((r) => ({
    day: r.day,
    docType: r.doc_type,
    documents: r.documents,
    taxableBaseCents: BigInt(r.taxable_base_cents),
    exemptBaseCents: BigInt(r.exempt_base_cents),
    taxCents: BigInt(r.tax_cents),
    roundingCents: BigInt(r.rounding_cents),
    totalCents: BigInt(r.total_cents)
  }));
}

/**
 * Reporte fiscal: Ingresos Brutos Mensuales para la Alcaldía (v_monthly_gross_income).
 */
export function getMonthlyGrossIncomeReport(db: Database.Database): MonthlyGrossIncomeRow[] {
  const rows = db.prepare(`
    SELECT period, gross_cents
    FROM v_monthly_gross_income
    ORDER BY period ASC
  `).all() as Array<{
    period: string;
    gross_cents: number;
  }>;

  return rows.map((r) => ({
    period: r.period,
    grossCents: BigInt(r.gross_cents)
  }));
}

/**
 * Reporte fiscal: Libro de Ventas por periodo con auditoría de correlativos y detección de huecos.
 */
export function getSalesBookReport(
  db: Database.Database,
  seriesId?: number,
  fromDate?: string,
  toDate?: string
): SalesBookReport {
  let query = `
    SELECT s.id, ds.code as series, s.number, s.folio, s.doc_type, s.at,
           COALESCE(c.name, 'Cliente Mostrador') as customer_name,
           c.doc_number as customer_doc,
           s.taxable_base_cents, s.exempt_base_cents, s.tax_cents,
           s.cash_rounding_cents, s.total_cents
    FROM sales s
    JOIN document_series ds ON ds.id = s.series_id
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.status = 'completed'
  `;
  const args: (string | number)[] = [];

  if (seriesId) {
    query += ' AND s.series_id = ?';
    args.push(seriesId);
  }
  if (fromDate) {
    query += ' AND s.at >= ?';
    args.push(fromDate);
  }
  if (toDate) {
    query += ' AND s.at <= ?';
    args.push(toDate);
  }

  query += ' ORDER BY ds.code ASC, s.number ASC';

  const rows = db.prepare(query).all(...args) as Array<{
    id: number;
    series: string;
    number: number;
    folio: string;
    doc_type: string;
    at: string;
    customer_name: string;
    customer_doc: string | null;
    taxable_base_cents: number;
    exempt_base_cents: number;
    tax_cents: number;
    cash_rounding_cents: number;
    total_cents: number;
  }>;

  const entries: SalesBookEntry[] = rows.map((r) => ({
    id: r.id,
    series: r.series,
    number: r.number,
    folio: r.folio,
    docType: r.doc_type,
    at: r.at,
    customerName: r.customer_name,
    customerDoc: r.customer_doc,
    taxableBaseCents: BigInt(r.taxable_base_cents),
    exemptBaseCents: BigInt(r.exempt_base_cents),
    taxCents: BigInt(r.tax_cents),
    roundingCents: BigInt(r.cash_rounding_cents),
    totalCents: BigInt(r.total_cents)
  }));

  // Agrupar números por serie y detectar huecos
  const seriesNumbers: Record<string, number[]> = {};
  for (const e of entries) {
    if (!seriesNumbers[e.series]) {
      seriesNumbers[e.series] = [];
    }
    seriesNumbers[e.series]!.push(e.number);
  }

  const missingNumbers: Record<string, number[]> = {};
  for (const [series, numbers] of Object.entries(seriesNumbers)) {
    missingNumbers[series] = detectFolioGaps(numbers);
  }

  const totals = {
    taxableBaseCents: entries.reduce((acc, e) => acc + e.taxableBaseCents, 0n),
    exemptBaseCents: entries.reduce((acc, e) => acc + e.exemptBaseCents, 0n),
    taxCents: entries.reduce((acc, e) => acc + e.taxCents, 0n),
    totalCents: entries.reduce((acc, e) => acc + e.totalCents, 0n)
  };

  return {
    entries,
    missingNumbers,
    totals
  };
}

/**
 * Reporte operativo: Valorización de Inventario y Existencias.
 */
export function getInventoryValuationReport(db: Database.Database): InventoryValuationRow[] {
  const rows = db.prepare(`
    SELECT v.id as variant_id, v.sku, p.name,
           COALESCE(c.name, 'General') as category_name,
           v.stock_milli, v.cost_avg_micros
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = 1
    ORDER BY p.name ASC, v.sku ASC
  `).all() as Array<{
    variant_id: number;
    sku: string;
    name: string;
    category_name: string;
    stock_milli: number;
    cost_avg_micros: number;
  }>;

  return rows.map((r) => {
    const stockMilli = BigInt(r.stock_milli);
    const costAvgMicros = BigInt(r.cost_avg_micros);
    // Valuación = (stock_milli * cost_avg_micros) / 10,000,000 en centavos
    const totalValuationCents = (stockMilli * costAvgMicros) / 10_000_000n;

    return {
      variantId: r.variant_id,
      sku: r.sku,
      name: r.name,
      categoryName: r.category_name,
      stockMilli,
      costAvgMicros,
      totalValuationCents
    };
  });
}

/**
 * Reporte operativo: Margen de Ganancia por Producto y Categoría.
 */
export function getProfitMarginsReport(
  db: Database.Database,
  fromDate?: string,
  toDate?: string
): ProfitMarginRow[] {
  let query = `
    SELECT v.id as variant_id, v.sku, p.name,
           COALESCE(cat.name, 'General') as category_name,
           COALESCE(SUM(l.qty_milli), 0) as qty_sold_milli,
           COALESCE(SUM(l.taxable_base_cents), 0) as revenue_cents,
           COALESCE(SUM(l.cogs_cents), 0) as cost_cents
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN sale_lines l ON l.variant_id = v.id
    LEFT JOIN sales s ON s.id = l.sale_id AND s.status = 'completed'
    WHERE 1=1
  `;
  const args: string[] = [];

  if (fromDate) {
    query += ' AND s.at >= ?';
    args.push(fromDate);
  }
  if (toDate) {
    query += ' AND s.at <= ?';
    args.push(toDate);
  }

  query += ' GROUP BY v.id, v.sku, p.name, cat.name ORDER BY revenue_cents DESC';

  const rows = db.prepare(query).all(...args) as Array<{
    variant_id: number;
    sku: string;
    name: string;
    category_name: string;
    qty_sold_milli: number;
    revenue_cents: number;
    cost_cents: number;
  }>;

  return rows.map((r) => {
    const qtySoldMilli = BigInt(r.qty_sold_milli);
    const revenueCents = BigInt(r.revenue_cents);
    const costCents = BigInt(r.cost_cents);
    const profitCents = revenueCents - costCents;
    const marginBp = revenueCents > 0n ? (profitCents * 10000n) / revenueCents : 0n;

    return {
      variantId: r.variant_id,
      sku: r.sku,
      name: r.name,
      categoryName: r.category_name,
      qtySoldMilli,
      revenueCents,
      costCents,
      profitCents,
      marginBp
    };
  });
}

/**
 * Reporte operativo: Diferencias de Arqueo de Caja por Turno y Cajero.
 */
export function getCashDiscrepanciesReport(db: Database.Database): CashDiscrepancyRow[] {
  const rows = db.prepare(`
    SELECT s.id as shift_id, s.folio, u.full_name as cashier_name,
           s.opened_at, s.closed_at,
           COALESCE(s.difference_cents, 0) as diff_cents,
           COALESCE(s.difference_usd, 0) as diff_usd,
           s.status
    FROM cash_shifts s
    JOIN users u ON u.id = s.opened_by
    ORDER BY s.id DESC
  `).all() as Array<{
    shift_id: number;
    folio: string;
    cashier_name: string;
    opened_at: string;
    closed_at: string | null;
    diff_cents: number;
    diff_usd: number;
    status: string;
  }>;

  return rows.map((r) => ({
    shiftId: r.shift_id,
    folio: r.folio,
    cashierName: r.cashier_name,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    diffCents: BigInt(r.diff_cents),
    diffUsd: BigInt(r.diff_usd),
    status: r.status
  }));
}

/**
 * Conciliación integral de reportes del sistema:
 * 1. Total ventas vs Efectivo en turnos de caja
 * 2. Unidades vendidas en ventas vs Salidas en Kardex
 * 3. IVA en resumen diario vs IVA de líneas de documentos
 */
export function reconcileReports(db: Database.Database): ReportsReconciliation {
  // 1. Total ventas completadas
  const salesRow = db.prepare(`
    SELECT COALESCE(SUM(total_cents), 0) as total,
           COALESCE(SUM(tax_cents), 0) as total_tax
    FROM sales
    WHERE status = 'completed'
  `).get() as { total: number; total_tax: number };

  const salesTotalCents = BigInt(salesRow.total);
  const salesTotalTaxCents = BigInt(salesRow.total_tax);

  // 2. Suma de ingresos por venta en movimientos de caja
  const cashRow = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) as total
    FROM cash_movements
    WHERE type = 'sale'
  `).get() as { total: number };

  const shiftCashTotalCents = BigInt(cashRow.total);
  const salesVsShiftDriftCents = salesTotalCents - shiftCashTotalCents;

  // 3. Cantidades vendidas en Kardex
  const kardexRow = db.prepare(`
    SELECT COALESCE(SUM(qty_milli), 0) as total
    FROM inventory_moves
    WHERE reason = 'sale' AND direction = 'out'
  `).get() as { total: number };

  const kardexSalesQtyMilli = BigInt(kardexRow.total);

  // Cantidades vendidas en líneas de venta
  const saleLinesRow = db.prepare(`
    SELECT COALESCE(SUM(l.qty_milli), 0) as total
    FROM sale_lines l
    JOIN sales s ON s.id = l.sale_id
    WHERE s.status = 'completed'
  `).get() as { total: number };

  const saleLinesQtyMilli = BigInt(saleLinesRow.total);
  const kardexVsSalesDriftMilli = saleLinesQtyMilli - kardexSalesQtyMilli;

  // 4. IVA de líneas vs IVA de cabeceras
  const ivaDriftCents = salesTotalTaxCents - BigInt(salesRow.total_tax);

  return {
    salesTotalCents,
    shiftCashTotalCents,
    salesVsShiftDriftCents,
    kardexSalesQtyMilli,
    kardexVsSalesDriftMilli,
    ivaDriftCents
  };
}
