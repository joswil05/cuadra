import { mulDiv } from '../money';

export type TaxKind = 'taxable' | 'exempt' | 'not_subject';
export type TaxRegime = 'general' | 'cuota_fija';

export interface CalculateLineTaxParams {
  baseTotalCents: bigint;
  taxKind: TaxKind;
  taxRateBp: bigint;
  taxRegime: TaxRegime;
  pricesIncludeTax: boolean;
}

export interface LineTaxResult {
  baseCents: bigint;
  taxCents: bigint;
  totalCents: bigint;
}

/**
 * Calcula el desglose impositivo de una línea de venta siguiendo el orden estricto de AGENT-GUIDE.md.
 */
export function calculateLineTax(params: CalculateLineTaxParams): LineTaxResult {
  const { baseTotalCents, taxKind, taxRateBp, taxRegime, pricesIncludeTax } = params;

  if (taxRegime === 'cuota_fija' || taxKind !== 'taxable' || taxRateBp === 0n) {
    return {
      baseCents: baseTotalCents,
      taxCents: 0n,
      totalCents: baseTotalCents
    };
  }

  if (pricesIncludeTax) {
    const baseCents = mulDiv(baseTotalCents, 10000n, 10000n + taxRateBp);
    const taxCents = baseTotalCents - baseCents;
    return {
      baseCents,
      taxCents,
      totalCents: baseCents + taxCents
    };
  } else {
    const baseCents = baseTotalCents;
    const taxCents = mulDiv(baseCents, taxRateBp, 10000n);
    return {
      baseCents,
      taxCents,
      totalCents: baseCents + taxCents
    };
  }
}
