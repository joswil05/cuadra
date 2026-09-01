export interface DailyTaxSummaryRow {
  day: string;
  docType: string;
  documents: number;
  taxableBaseCents: bigint;
  exemptBaseCents: bigint;
  taxCents: bigint;
  roundingCents: bigint;
  totalCents: bigint;
}

export interface MonthlyGrossIncomeRow {
  period: string;
  grossCents: bigint;
}

export interface SalesBookEntry {
  id: number;
  series: string;
  number: number;
  folio: string;
  docType: string;
  at: string;
  customerName: string;
  customerDoc: string | null;
  taxableBaseCents: bigint;
  exemptBaseCents: bigint;
  taxCents: bigint;
  roundingCents: bigint;
  totalCents: bigint;
}

export interface SalesBookReport {
  entries: SalesBookEntry[];
  missingNumbers: Record<string, number[]>;
  totals: {
    taxableBaseCents: bigint;
    exemptBaseCents: bigint;
    taxCents: bigint;
    totalCents: bigint;
  };
}

export interface InventoryValuationRow {
  variantId: number;
  sku: string;
  name: string;
  categoryName: string;
  stockMilli: bigint;
  costAvgMicros: bigint;
  totalValuationCents: bigint;
}

export interface ProfitMarginRow {
  variantId: number;
  sku: string;
  name: string;
  categoryName: string;
  qtySoldMilli: bigint;
  revenueCents: bigint;
  costCents: bigint;
  profitCents: bigint;
  marginBp: bigint;
}

export interface CashDiscrepancyRow {
  shiftId: number;
  folio: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  diffCents: bigint;
  diffUsd: bigint;
  status: string;
}

export interface ReportsReconciliation {
  salesTotalCents: bigint;
  shiftCashTotalCents: bigint;
  salesVsShiftDriftCents: bigint;
  kardexSalesQtyMilli: bigint;
  kardexVsSalesDriftMilli: bigint;
  ivaDriftCents: bigint;
}

/**
 * Detecta si existen números faltantes (huecos) en una secuencia de folios correlativos fiscales.
 */
export function detectFolioGaps(numbers: number[]): number[] {
  if (!numbers || numbers.length <= 1) return [];

  const uniqueSorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
  const min = uniqueSorted[0]!;
  const max = uniqueSorted[uniqueSorted.length - 1]!;

  const numSet = new Set(uniqueSorted);
  const missing: number[] = [];

  for (let i = min; i <= max; i++) {
    if (!numSet.has(i)) {
      missing.push(i);
    }
  }

  return missing;
}

/**
 * Formatea una matriz de datos y encabezados a formato CSV estándar con escape seguro.
 */
export function formatReportCsv(
  columns: string[],
  rows: (string | number | bigint | null | undefined)[][]
): string {
  const escapeCell = (val: string | number | bigint | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = columns.map(escapeCell).join(',');
  const rowLines = rows.map((row) => row.map(escapeCell).join(','));

  return [headerLine, ...rowLines].join('\r\n');
}
