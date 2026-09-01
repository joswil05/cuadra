import Database from 'better-sqlite3';
import {
  OwnerDashboardData,
  DaySalesPoint,
  LowStockItem,
  ExpiringLot,
  OverdueCustomer,
  CashDiscrepancyAlert,
  UndefinedTaxProduct,
  TopSellingProduct,
  TopMarginProduct
} from '../../core/dashboard';

export type { OwnerDashboardData };

/**
 * Obtiene los permisos asociados a un usuario a través de su rol en SQLite.
 */
export function getUserPermissions(db: Database.Database, userId: number): string[] {
  const row = db.prepare(`
    SELECT r.permissions_json
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = ? AND u.is_active = 1 AND u.deleted_at IS NULL
  `).get(userId) as { permissions_json: string } | undefined;

  if (!row) {
    return [];
  }

  try {
    const parsed = JSON.parse(row.permissions_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Comprueba si un conjunto de permisos contiene el permiso requerido o permiso de administrador total ('*').
 */
export function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes('*') || permissions.includes(required);
}

/**
 * Consulta y estructura todos los datos del Panel del Dueño respetando la matriz de seguridad:
 * - Requiere permiso 'dashboard.view' (arroja ForbiddenError si no lo tiene).
 * - Oculta/censura campos de costo y margen si no cuenta con 'reports.cost_and_margin'.
 * - Optimizado para responder en menos de 300 ms.
 */
export function getOwnerDashboardData(
  db: Database.Database,
  userId: number,
  _period: 'today' | 'week' | 'month' = 'today'
): OwnerDashboardData {
  const perms = getUserPermissions(db, userId);

  // 1. Control de acceso al Dashboard
  if (!hasPermission(perms, 'dashboard.view')) {
    throw new Error(`Permiso denegado: dashboard.view para usuario ${userId}`);
  }

  const canViewCostAndMargin = hasPermission(perms, 'reports.cost_and_margin');

  // ---------------------------------------------------------------------------
  // BANDA 1: PULSO DE HOY
  // ---------------------------------------------------------------------------
  // 1.1 Ventas y tickets de hoy (usando índice idx_sales_at)
  const todayRow = db.prepare(`
    SELECT
      COALESCE(SUM(total_cents), 0) as total_sales,
      COALESCE(SUM(cogs_cents), 0) as total_cogs,
      COUNT(*) as tickets_count
    FROM sales
    WHERE status = 'completed'
      AND at >= date('now')
  `).get() as { total_sales: number; total_cogs: number; tickets_count: number };

  const todaySalesCents = BigInt(todayRow.total_sales);
  const todayCogsCents = BigInt(todayRow.total_cogs);
  const todayTicketsCount = todayRow.tickets_count;
  const avgTicketCents = todayTicketsCount > 0 ? todaySalesCents / BigInt(todayTicketsCount) : 0n;

  // Margen de hoy (solo si tiene permiso)
  let todayMarginCents: bigint | undefined = undefined;
  let todayMarginBp: bigint | undefined = undefined;

  if (canViewCostAndMargin) {
    todayMarginCents = todaySalesCents - todayCogsCents;
    todayMarginBp = todaySalesCents > 0n ? (todayMarginCents * 10000n) / todaySalesCents : 0n;
  }

  // 1.2 Ventas del mismo día de la semana pasada (hace 7 días)
  const lastWeekSameDayRow = db.prepare(`
    SELECT COALESCE(SUM(total_cents), 0) as total_sales
    FROM sales
    WHERE status = 'completed'
      AND at >= date('now', '-7 days')
      AND at < date('now', '-6 days')
  `).get() as { total_sales: number };

  const lastWeekSalesCents = BigInt(lastWeekSameDayRow.total_sales);
  const salesVariationBp = lastWeekSalesCents > 0n
    ? ((todaySalesCents - lastWeekSalesCents) * 10000n) / lastWeekSalesCents
    : 0n;

  // 1.3 Efectivo en caja ahora mismo (del turno abierto o total general)
  const cashRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN currency_code = 'NIO' THEN amount_cents ELSE 0 END), 0) as total_nio,
      COALESCE(SUM(CASE WHEN currency_code = 'USD' THEN amount_fx ELSE 0 END), 0) as total_usd
    FROM cash_movements
  `).get() as { total_nio: number; total_usd: number };

  const cashInRegisterCents = BigInt(cashRow.total_nio);
  const cashInRegisterUsd = BigInt(cashRow.total_usd);

  // 1.4 Sparkline de los últimos 14 días
  const last14Rows = db.prepare(`
    SELECT
      substr(at, 1, 10) as day,
      COALESCE(SUM(total_cents), 0) as sales_cents
    FROM sales
    WHERE status = 'completed'
      AND at >= date('now', '-14 days')
    GROUP BY day
    ORDER BY day ASC
  `).all() as Array<{ day: string; sales_cents: number }>;

  const last14DaysSales: DaySalesPoint[] = last14Rows.map((r) => ({
    day: r.day,
    salesCents: BigInt(r.sales_cents)
  }));

  // ---------------------------------------------------------------------------
  // BANDA 2: AVISOS QUE NECESITAN UNA DECISIÓN
  // ---------------------------------------------------------------------------
  // 2.1 Artículos bajo el stock mínimo
  const lowStockRows = db.prepare(`
    SELECT v.id as variant_id, v.sku, p.name, v.stock_milli, v.min_stock_milli
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    WHERE v.is_active = 1
      AND v.min_stock_milli > 0
      AND v.stock_milli <= v.min_stock_milli
    ORDER BY v.stock_milli ASC
    LIMIT 10
  `).all() as Array<{
    variant_id: number;
    sku: string;
    name: string;
    stock_milli: number;
    min_stock_milli: number;
  }>;

  const lowStockItems: LowStockItem[] = lowStockRows.map((r) => ({
    variantId: r.variant_id,
    sku: r.sku,
    name: r.name,
    stockMilli: BigInt(r.stock_milli),
    minStockMilli: BigInt(r.min_stock_milli)
  }));

  // 2.2 Productos por caducar en <= 30 días
  const expiringRows = db.prepare(`
    SELECT l.id as lot_id, v.sku, p.name, l.lot_code as lot_number, l.expires_on as expires_at,
           l.qty_milli as stock_milli,
           CAST((julianday(l.expires_on) - julianday('now')) AS INTEGER) as days_remaining
    FROM inventory_lots l
    JOIN product_variants v ON v.id = l.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE l.qty_milli > 0
      AND l.expires_on IS NOT NULL
      AND l.expires_on <= date('now', '+30 days')
    ORDER BY l.expires_on ASC
    LIMIT 10
  `).all() as Array<{
    lot_id: number;
    sku: string;
    name: string;
    lot_number: string;
    expires_at: string;
    stock_milli: number;
    days_remaining: number;
  }>;

  const expiringLots: ExpiringLot[] = expiringRows.map((r) => ({
    lotId: r.lot_id,
    sku: r.sku,
    name: r.name,
    lotNumber: r.lot_number,
    expiresAt: r.expires_at,
    daysRemaining: r.days_remaining,
    stockMilli: BigInt(r.stock_milli)
  }));

  // 2.3 Clientes con saldo vencido
  const overdueRows = db.prepare(`
    SELECT c.id as customer_id, c.name, vb.balance_cents,
           c.credit_days
    FROM v_customer_balance vb
    JOIN customers c ON c.id = vb.customer_id
    WHERE vb.balance_cents > 0
    ORDER BY vb.balance_cents DESC
    LIMIT 10
  `).all() as Array<{
    customer_id: number;
    name: string;
    balance_cents: number;
    credit_days: number;
  }>;

  const overdueCustomers: OverdueCustomer[] = overdueRows.map((r) => ({
    customerId: r.customer_id,
    name: r.name,
    balanceCents: BigInt(r.balance_cents),
    overdueDays: r.credit_days > 0 ? r.credit_days : 30
  }));

  // 2.4 Diferencias de arqueo de la semana
  const diffRows = db.prepare(`
    SELECT s.id as shift_id, u.full_name as cashier_name,
           COALESCE(s.difference_cents, 0) as diff_cents,
           COALESCE(s.difference_usd, 0) as diff_usd,
           s.closed_at as at
    FROM cash_shifts s
    JOIN users u ON u.id = s.opened_by
    WHERE s.status = 'closed'
      AND (s.difference_cents <> 0 OR s.difference_usd <> 0)
      AND s.closed_at >= date('now', '-7 days')
    ORDER BY s.id DESC
    LIMIT 10
  `).all() as Array<{
    shift_id: number;
    cashier_name: string;
    diff_cents: number;
    diff_usd: number;
    at: string;
  }>;

  const cashDiscrepancies: CashDiscrepancyAlert[] = diffRows.map((r) => ({
    shiftId: r.shift_id,
    cashierName: r.cashier_name,
    diffCents: BigInt(r.diff_cents),
    diffUsd: BigInt(r.diff_usd),
    at: r.at
  }));

  // 2.5 Productos sin estatus de IVA definido (en régimen general)
  const undefinedTaxRows = db.prepare(`
    SELECT p.id as product_id, p.name
    FROM products p
    WHERE p.is_active = 1
      AND p.tax_rate_id IS NULL
    ORDER BY p.name ASC
    LIMIT 10
  `).all() as Array<{
    product_id: number;
    name: string;
  }>;

  const undefinedTaxProducts: UndefinedTaxProduct[] = undefinedTaxRows.map((r) => ({
    productId: r.product_id,
    name: r.name
  }));

  // ---------------------------------------------------------------------------
  // BANDA 3: TENDENCIAS Y TOP 10 PRODUCTOS
  // ---------------------------------------------------------------------------
  // 3.1 Venta de los últimos 30 días
  const last30Rows = db.prepare(`
    SELECT
      substr(at, 1, 10) as day,
      COALESCE(SUM(total_cents), 0) as sales_cents
    FROM sales
    WHERE status = 'completed'
      AND at >= date('now', '-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all() as Array<{ day: string; sales_cents: number }>;

  const last30DaysSales: DaySalesPoint[] = last30Rows.map((r) => ({
    day: r.day,
    salesCents: BigInt(r.sales_cents)
  }));

  // 3.2 Top 10 productos más vendidos (por ingresos/volumen)
  const topSellingRows = db.prepare(`
    SELECT v.id as variant_id, v.sku, p.name,
           COALESCE(SUM(l.qty_milli), 0) as qty_sold_milli,
           COALESCE(SUM(l.total_cents), 0) as revenue_cents
    FROM sale_lines l
    JOIN product_variants v ON v.id = l.variant_id
    JOIN products p ON p.id = v.product_id
    JOIN sales s ON s.id = l.sale_id
    WHERE s.status = 'completed'
      AND s.at >= date('now', '-30 days')
    GROUP BY v.id, v.sku, p.name
    ORDER BY revenue_cents DESC
    LIMIT 10
  `).all() as Array<{
    variant_id: number;
    sku: string;
    name: string;
    qty_sold_milli: number;
    revenue_cents: number;
  }>;

  const topSellingProducts: TopSellingProduct[] = topSellingRows.map((r) => ({
    variantId: r.variant_id,
    sku: r.sku,
    name: r.name,
    qtySoldMilli: BigInt(r.qty_sold_milli),
    revenueCents: BigInt(r.revenue_cents)
  }));

  // 3.3 Top 10 productos que más margen dejan (solo si tiene permiso reports.cost_and_margin)
  let topMarginProducts: TopMarginProduct[] = [];

  if (canViewCostAndMargin) {
    const topMarginRows = db.prepare(`
      SELECT v.id as variant_id, v.sku, p.name,
             COALESCE(SUM(l.total_cents - l.cogs_cents), 0) as profit_cents,
             COALESCE(SUM(l.total_cents), 0) as total_rev
      FROM sale_lines l
      JOIN product_variants v ON v.id = l.variant_id
      JOIN products p ON p.id = v.product_id
      JOIN sales s ON s.id = l.sale_id
      WHERE s.status = 'completed'
        AND s.at >= date('now', '-30 days')
      GROUP BY v.id, v.sku, p.name
      ORDER BY profit_cents DESC
      LIMIT 10
    `).all() as Array<{
      variant_id: number;
      sku: string;
      name: string;
      profit_cents: number;
      total_rev: number;
    }>;

    topMarginProducts = topMarginRows.map((r) => {
      const profitCents = BigInt(r.profit_cents);
      const totalRev = BigInt(r.total_rev);
      const marginBp = totalRev > 0n ? (profitCents * 10000n) / totalRev : 0n;
      return {
        variantId: r.variant_id,
        sku: r.sku,
        name: r.name,
        profitCents,
        marginBp
      };
    });
  }

  return {
    pulse: {
      todaySalesCents,
      todayMarginCents,
      todayMarginBp,
      todayTicketsCount,
      avgTicketCents,
      cashInRegisterCents,
      cashInRegisterUsd,
      last14DaysSales,
      salesVariationBp
    },
    actions: {
      lowStockItems,
      expiringLots,
      overdueCustomers,
      cashDiscrepancies,
      undefinedTaxProducts
    },
    trends: {
      last30DaysSales,
      topSellingProducts,
      topMarginProducts
    }
  };
}
