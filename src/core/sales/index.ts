import { allocate, roundToNearest } from '../money';
import { calculateLineGross, calculateLineNet } from '../pricing';
import { calculateLineTax, TaxKind, TaxRegime } from '../tax';

export interface CartLineInput {
  lineNo: number;
  description: string;
  unitPriceCents: bigint;
  qtyMilli: bigint;
  lineDiscountCents: bigint;
  taxKind: TaxKind;
  taxRateBp: bigint;
}

export interface CalculatedSaleLine {
  lineNo: number;
  description: string;
  qtyMilli: bigint;
  unitPriceCents: bigint;
  grossCents: bigint;
  lineDiscountCents: bigint;
  allocDiscountCents: bigint;
  baseTotalCents: bigint;
  taxKind: TaxKind;
  taxRateBp: bigint;
  taxableBaseCents: bigint;
  exemptBaseCents: bigint;
  taxCents: bigint;
  totalCents: bigint;
}

export interface CalculateSaleDocumentParams {
  lines: readonly CartLineInput[];
  orderDiscountCents?: bigint;
  taxRegime: TaxRegime;
  pricesIncludeTax?: boolean;
  cashRounding?: boolean;
}

export interface CalculatedSaleDocument {
  lines: CalculatedSaleLine[];
  grossCents: bigint;
  lineDiscountCents: bigint;
  orderDiscountCents: bigint;
  taxableBaseCents: bigint;
  exemptBaseCents: bigint;
  taxCents: bigint;
  cashRoundingCents: bigint;
  totalCents: bigint;
}

/**
 * Calcula un documento de venta completo cuadrado al centavo.
 * Aplica el orden de operaciones estricto de AGENT-GUIDE.md.
 */
export function calculateSaleDocument(params: CalculateSaleDocumentParams): CalculatedSaleDocument {
  const {
    lines,
    orderDiscountCents = 0n,
    taxRegime,
    pricesIncludeTax = true,
    cashRounding = false
  } = params;

  if (lines.length === 0) {
    return {
      lines: [],
      grossCents: 0n,
      lineDiscountCents: 0n,
      orderDiscountCents: 0n,
      taxableBaseCents: 0n,
      exemptBaseCents: 0n,
      taxCents: 0n,
      cashRoundingCents: 0n,
      totalCents: 0n
    };
  }

  // 1 y 2. Calcular bruto y neto por línea
  const linePreps = lines.map((line) => {
    const grossCents = calculateLineGross(line.unitPriceCents, line.qtyMilli);
    const netLineCents = calculateLineNet(grossCents, line.lineDiscountCents);
    return {
      ...line,
      grossCents,
      netLineCents
    };
  });

  // 3. Prorratear descuento global sobre el neto de cada línea
  const netWeights = linePreps.map((l) => l.netLineCents);
  const allocatedDiscounts = allocate(orderDiscountCents, netWeights);

  // 4, 5 y 6. Calcular base total, desglose impositivo y total por línea
  const calculatedLines: CalculatedSaleLine[] = linePreps.map((line, idx) => {
    const allocDiscountCents = allocatedDiscounts[idx]!;
    const baseTotalCents = line.netLineCents >= allocDiscountCents
      ? line.netLineCents - allocDiscountCents
      : 0n;

    const taxResult = calculateLineTax({
      baseTotalCents,
      taxKind: line.taxKind,
      taxRateBp: line.taxRateBp,
      taxRegime,
      pricesIncludeTax
    });

    const isTaxable = taxRegime === 'general' && line.taxKind === 'taxable' && line.taxRateBp > 0n;

    const taxableBaseCents = isTaxable ? taxResult.baseCents : 0n;
    const exemptBaseCents = isTaxable ? 0n : taxResult.baseCents;
    const taxCents = taxResult.taxCents;

    return {
      lineNo: line.lineNo,
      description: line.description,
      qtyMilli: line.qtyMilli,
      unitPriceCents: line.unitPriceCents,
      grossCents: line.grossCents,
      lineDiscountCents: line.lineDiscountCents,
      allocDiscountCents,
      baseTotalCents,
      taxKind: line.taxKind,
      taxRateBp: line.taxRateBp,
      taxableBaseCents,
      exemptBaseCents,
      taxCents,
      totalCents: taxResult.totalCents
    };
  });

  // Sumar totales del documento
  let grossCents = 0n;
  let lineDiscountCents = 0n;
  let taxableBaseCents = 0n;
  let exemptBaseCents = 0n;
  let taxCents = 0n;

  for (const l of calculatedLines) {
    grossCents += l.grossCents;
    lineDiscountCents += l.lineDiscountCents;
    taxableBaseCents += l.taxableBaseCents;
    exemptBaseCents += l.exemptBaseCents;
    taxCents += l.taxCents;
  }

  const unroundedTotal = taxableBaseCents + exemptBaseCents + taxCents;

  let cashRoundingCents = 0n;
  let totalCents = unroundedTotal;

  if (cashRounding) {
    const roundedTotal = roundToNearest(unroundedTotal, 5n);
    cashRoundingCents = roundedTotal - unroundedTotal;
    totalCents = roundedTotal;
  }

  return {
    lines: calculatedLines,
    grossCents,
    lineDiscountCents,
    orderDiscountCents,
    taxableBaseCents,
    exemptBaseCents,
    taxCents,
    cashRoundingCents,
    totalCents
  };
}
