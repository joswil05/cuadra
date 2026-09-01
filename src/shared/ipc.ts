import { z } from 'zod';

import type { CashShift, CloseShiftResult, BlindShiftSummary } from '../main/services/cash.service';
import type { CreateSaleResult, SalePaymentInput } from '../main/services/sales.service';
import type { TenderResult } from '../main/services/pos.service';
import type { PosProduct } from '../core/pos';
import type { OnboardingResult } from '../main/services/onboarding.service';
import type { ImportCsvError } from '../main/services/catalog.service';

export type IpcResponse<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };

export interface IpcContract<TIn, TOut> {
  channel: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema: z.ZodType<TOut>;
}

/**
 * Salida tipada sin costo en tiempo de ejecución.
 * La entrada sí se valida de verdad: es la frontera de confianza, porque llega
 * del renderer. La salida la produce el proceso principal, que ya está probado.
 */
const out = <T>() => z.custom<T>(() => true);

const nothing = z.union([z.undefined(), z.object({})]).transform(() => undefined);

function define<TIn, TOut>(
  channel: string,
  inputSchema: z.ZodType<TIn>,
  outputSchema: z.ZodType<TOut>
): IpcContract<TIn, TOut> {
  return { channel, inputSchema, outputSchema };
}

// ----------------------------------------------------------------- Primitivas
const money = z.bigint();
const id = z.number().int().positive();
const qtyMilli = z.bigint();

const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'transfer', 'mobile', 'credit', 'voucher', 'points']),
  currencyCode: z.enum(['NIO', 'USD']),
  amountFx: money,
  fxRateMicros: z.bigint(),
  // Opcional a propósito: si no viene, el servicio lo deriva con la tasa
  // congelada del pago. Así el renderer nunca decide la conversión.
  amountCents: money.optional(),
  reference: z.string().optional()
});

const cartLineSchema = z.object({
  lineNo: z.number().int(),
  variantId: z.number().int(),
  sku: z.string(),
  description: z.string(),
  unitPriceCents: money,
  qtyMilli,
  lineDiscountCents: money,
  taxKind: z.enum(['taxable', 'exempt', 'not_subject']),
  taxRateBp: z.bigint(),
  stockMilli: qtyMilli,
  tracksStock: z.boolean()
});

const cartSchema = z.object({
  id: z.string(),
  lines: z.array(cartLineSchema),
  orderDiscountCents: money,
  customerId: z.number().int().optional(),
  note: z.string().optional(),
  createdAt: z.string().optional()
});

const denominationLines = z
  .array(z.object({ denominationCents: z.number().int(), quantity: z.number().int().nonnegative() }))
  .optional();

// ------------------------------------------------------------------- Arranque
export interface BootstrapData {
  needsOnboarding: boolean;
  company: {
    legalName: string;
    tradeName: string | null;
    ruc: string;
    address: string;
    phone: string;
    dgiAuthNumber: string | null;
    taxRegime: string;
  } | null;
  openShift: CashShift | null;
  currentUserId: number | null;
  permissions: string[];
  series: { id: number; docType: string; code: string; prefix: string }[];
}

export const BootstrapContract = define('app:bootstrap', nothing, out<BootstrapData>());

// ----------------------------------------------------------------- Onboarding
export const OnboardingContract = define(
  'onboarding:complete',
  z.object({
    businessName: z.string().min(1),
    tradeName: z.string().optional(),
    ruc: z.string().min(1),
    address: z.string().min(1),
    phone: z.string().min(1),
    municipality: z.string().optional(),
    dgiAuthNumber: z.string().optional(),
    taxRegime: z.enum(['general', 'cuota_fija']),
    industryProfile: z.enum(['minimarket', 'apparel', 'general']),
    initialCashFundNio: money,
    initialCashFundUsd: money,
    adminFullName: z.string().min(1),
    adminPin: z.string().optional(),
    adminPassword: z.string().optional()
  }),
  out<OnboardingResult>()
);

// ------------------------------------------------------------------------ POS
export const PosSearchContract = define(
  'pos:search',
  z.object({ query: z.string() }),
  out<PosProduct[]>()
);

export const PosTenderContract = define(
  'pos:tender',
  z.object({
    cart: cartSchema,
    seriesId: id,
    shiftId: id,
    userId: id,
    docType: z.enum(['ticket', 'invoice']).optional(),
    payments: z.array(paymentSchema),
    isContingency: z.boolean().optional()
  }),
  out<TenderResult>()
);

// ------------------------------------------------------------------ Inventario
export interface CatalogRow {
  id: number;
  variantId: number;
  name: string;
  sku: string;
  barcode: string | null;
  priceCents: bigint;
  costMicros: bigint;
  stockMilli: bigint;
  minStockMilli: bigint;
  taxStatus: 'IVA15' | 'EXENTO' | 'SIN_DEFINIR';
}

export const InventoryListContract = define('inventory:list', nothing, out<CatalogRow[]>());

export const InventoryCreateContract = define(
  'inventory:create',
  z.object({
    name: z.string().min(1),
    sku: z.string().min(1),
    unitId: id,
    barcode: z.string().optional(),
    priceCents: money.optional(),
    costMicros: z.bigint().optional(),
    taxRateId: z.number().int().nullable().optional(),
    tracksStock: z.boolean().optional(),
    userId: id
  }),
  out<{ productId: number; variantId: number }>()
);

export const InventoryAdjustContract = define(
  'inventory:adjust',
  z.object({
    variantId: id,
    warehouseId: id,
    direction: z.enum(['in', 'out']),
    qtyMilli,
    unitCostMicros: z.bigint().optional(),
    reason: z.enum(['adjustment_in', 'adjustment_out', 'count', 'waste', 'initial']),
    note: z.string().min(1),
    userId: id
  }),
  out<{ moveId: number }>()
);

export interface KardexRow {
  id: number;
  at: string;
  direction: string;
  reason: string;
  qtyMilli: bigint;
  balanceQtyMilli: bigint;
  unitCostMicros: bigint;
  note: string | null;
}

export const InventoryKardexContract = define(
  'inventory:kardex',
  z.object({ variantId: id, limit: z.number().int().positive().max(500).optional() }),
  out<KardexRow[]>()
);

export interface UndefinedTaxRow {
  productId: number;
  name: string;
  sku: string;
}

export const InventoryUndefinedTaxContract = define(
  'inventory:undefinedTax',
  nothing,
  out<UndefinedTaxRow[]>()
);

export const InventoryBulkTaxContract = define(
  'inventory:bulkTax',
  z.object({ productIds: z.array(id), taxRateId: id, userId: id }),
  out<{ updated: number }>()
);

// ------------------------------------------------------------------- Clientes
export interface CustomerRow {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  creditLimitCents: bigint;
  balanceCents: bigint;
}

export const CustomersListContract = define('customers:list', nothing, out<CustomerRow[]>());

export const CustomersCreateContract = define(
  'customers:create',
  z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    docNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    creditLimitCents: money.optional()
  }),
  out<{ id: number }>()
);

export interface LedgerRow {
  at: string;
  type: string;
  amountCents: bigint;
  balanceAfterCents: bigint;
  note: string | null;
}

export const CustomersStatementContract = define(
  'customers:statement',
  z.object({ customerId: id }),
  out<{ balanceCents: bigint; entries: LedgerRow[] }>()
);

export const CustomersPaymentContract = define(
  'customers:payment',
  z.object({
    customerId: id,
    amountCents: money,
    method: z.enum(['cash', 'card', 'transfer', 'check']),
    shiftId: id,
    userId: id,
    note: z.string().optional()
  }),
  out<{ balanceCents: bigint }>()
);

// -------------------------------------------------------------------- Compras
export interface SupplierRow {
  id: number;
  name: string;
  docNumber: string | null;
  phone: string | null;
  creditDays: number;
}

export const SuppliersListContract = define('purchases:suppliers', nothing, out<SupplierRow[]>());

export const SupplierCreateContract = define(
  'purchases:createSupplier',
  z.object({
    name: z.string().min(1),
    docNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    creditDays: z.number().int().nonnegative().optional()
  }),
  out<{ id: number }>()
);

export interface PurchaseRow {
  id: number;
  folio: string;
  supplierName: string;
  status: string;
  totalCents: bigint;
  at: string;
}

export const PurchasesListContract = define('purchases:list', nothing, out<PurchaseRow[]>());

// ------------------------------------------------------------------- Reportes
const dateRange = z.object({ fromDate: z.string().optional(), toDate: z.string().optional() });

export const ReportDailyTaxContract = define('reports:dailyTax', dateRange, out<unknown>());
export const ReportMonthlyIncomeContract = define('reports:monthlyIncome', dateRange, out<unknown>());
export const ReportSalesBookContract = define('reports:salesBook', dateRange, out<unknown>());
export const ReportInventoryContract = define('reports:inventory', nothing, out<unknown>());
export const ReportMarginsContract = define('reports:margins', dateRange, out<unknown>());
export const ReportReconciliationContract = define('reports:reconciliation', nothing, out<unknown>());
export const ReportCashDiscrepanciesContract = define(
  'reports:cashDiscrepancies',
  nothing,
  out<unknown>()
);

// -------------------------------------------------------------------- Tablero
export const DashboardContract = define('dashboard:data', z.object({ userId: id }), out<unknown>());

// ----------------------------------------------------------------------- Caja
export const ShiftOpenContract = define(
  'cash:openShift',
  z.object({
    openedBy: id,
    openingFloatCents: money,
    openingFloatUsd: money.optional(),
    countedLinesNio: denominationLines,
    countedLinesUsd: denominationLines,
    note: z.string().optional()
  }),
  out<CashShift>()
);

export const ShiftBlindContract = define(
  'cash:blind',
  z.object({ shiftId: id }),
  out<BlindShiftSummary>()
);

const denominationLinesRequired = z.array(
  z.object({ denominationCents: z.number().int(), quantity: z.number().int().nonnegative() })
);

export const ShiftCloseContract = define(
  'cash:closeShift',
  z.object({
    shiftId: id,
    closedBy: id,
    countedLinesNio: denominationLinesRequired,
    countedLinesUsd: denominationLinesRequired,
    note: z.string().optional()
  }),
  out<CloseShiftResult>()
);

// -------------------------------------------------------------------- Ventas
export const SaleVoidContract = define(
  'sales:void',
  z.object({ saleId: id, userId: id, reason: z.string().min(1) }),
  out<{ voided: true }>()
);

export type {
  CreateSaleResult,
  PosProduct,
  CashShift,
  TenderResult,
  SalePaymentInput,
  ImportCsvError
};

// --------------------------------------------- Canales de fontanería (fase 0)
export const PingContract: IpcContract<{ message: string }, { reply: string; timestamp: number }> = {
  channel: 'system:ping',
  inputSchema: z.object({ message: z.string().min(1) }),
  outputSchema: z.object({ reply: z.string(), timestamp: z.number() })
};

export const DbTestContract: IpcContract<
  { key: string; value: string },
  { key: string; value: string; updatedAt: string }
> = {
  channel: 'db:test-entry',
  inputSchema: z.object({ key: z.string().min(1), value: z.string() }),
  outputSchema: z.object({ key: z.string(), value: z.string(), updatedAt: z.string() })
};
