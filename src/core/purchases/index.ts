import { allocate, mulDiv } from '../money';

export interface PurchaseLineProrateInput {
  lineNo: number;
  variantId: number;
  qtyMilli: bigint;
  unitCostCents: bigint;
  taxRateBp?: bigint;
  lotCode?: string;
  expiresOn?: string;
}

export interface ProratedPurchaseLine {
  lineNo: number;
  variantId: number;
  qtyMilli: bigint;
  unitCostCents: bigint;
  baseTotalCents: bigint;
  allocatedFreightCents: bigint;
  landedUnitCostMicros: bigint;
  taxRateBp: bigint;
  taxCents: bigint;
  totalCents: bigint;
  lotCode?: string;
  expiresOn?: string;
}

export interface CreateSupplierParams {
  name: string;
  docNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  creditDays?: number;
}

export interface SupplierItem {
  id: number;
  uid: string;
  name: string;
  docNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditDays: number;
}

export interface CreatePurchaseParams {
  supplierId: number;
  warehouseId: number;
  supplierDoc?: string;
  freightCents?: bigint;
  lines: PurchaseLineProrateInput[];
  userId: number;
  note?: string;
}

export interface PurchaseSummary {
  id: number;
  uid: string;
  folio: string;
  supplierId: number;
  supplierName?: string;
  warehouseId: number;
  at: string;
  status: 'draft' | 'received' | 'cancelled';
  supplierDoc: string | null;
  subtotalCents: bigint;
  taxCents: bigint;
  freightCents: bigint;
  totalCents: bigint;
  paidCents: bigint;
  receivedAt: string | null;
  note: string | null;
  lines?: ProratedPurchaseLine[];
}

export interface PaySupplierParams {
  supplierId: number;
  purchaseId?: number;
  shiftId?: number;
  method: 'cash' | 'transfer' | 'card';
  currencyCode?: 'NIO' | 'USD';
  amountCents: bigint;
  userId: number;
  note?: string;
}

export type ReceivePurchaseResult =
  | { ok: true; purchaseId: number }
  | { ok: false; error: string };

export type PaySupplierResult =
  | { ok: true; paymentId: number }
  | { ok: false; error: string };

/**
 * Prorratea el flete y gastos de importación entre las líneas de compra en proporción
 * al importe base de cada línea, usando el algoritmo de reparto exacto sin pérdida de centavos.
 * Calcula el costo unitario final (Landed Cost en micros) que entrará al CPP del Kardex.
 */
export function prorateFreightToLines(
  lines: readonly PurchaseLineProrateInput[],
  freightCents = 0n
): ProratedPurchaseLine[] {
  if (lines.length === 0) return [];

  // 1. Calcular importe base de cada línea (peso para el prorrateo)
  const lineWeights = lines.map((l) => mulDiv(l.qtyMilli, l.unitCostCents, 1000n));

  // 2. Asignación exacta del flete al centavo usando allocate
  const allocatedFreight = allocate(freightCents, lineWeights);

  return lines.map((l, idx) => {
    const baseTotalCents = lineWeights[idx]!;
    const lineFreightCents = allocatedFreight[idx]!;

    // Flete unitario en micros = (flete_centavos * 10,000,000) / qtyMilli
    const freightPerUnitMicros = l.qtyMilli > 0n
      ? mulDiv(lineFreightCents, 10_000_000n, l.qtyMilli)
      : 0n;

    // Costo base en micros = unitCostCents * 10,000
    const baseCostMicros = l.unitCostCents * 10_000n;
    const landedUnitCostMicros = baseCostMicros + freightPerUnitMicros;

    const taxRateBp = l.taxRateBp ?? 0n;
    const taxCents = mulDiv(baseTotalCents, taxRateBp, 10000n);
    const totalCents = baseTotalCents + lineFreightCents + taxCents;

    return {
      lineNo: l.lineNo,
      variantId: l.variantId,
      qtyMilli: l.qtyMilli,
      unitCostCents: l.unitCostCents,
      baseTotalCents,
      allocatedFreightCents: lineFreightCents,
      landedUnitCostMicros,
      taxRateBp,
      taxCents,
      totalCents,
      lotCode: l.lotCode,
      expiresOn: l.expiresOn
    };
  });
}
