import { mulDiv } from '../money';

export interface PriceTier {
  minQtyMilli: bigint;
  priceCents: bigint;
}

/**
 * Resuelve el precio unitario aplicable según el volumen comprado.
 */
export function resolveUnitPrice(
  qtyMilli: bigint,
  basePriceCents: bigint,
  tiers?: readonly PriceTier[]
): bigint {
  if (!tiers || tiers.length === 0) {
    return basePriceCents;
  }

  // Ordenar escalas de mayor a menor cantidad mínima
  const sortedTiers = [...tiers].sort((a, b) => {
    if (b.minQtyMilli > a.minQtyMilli) return 1;
    if (b.minQtyMilli < a.minQtyMilli) return -1;
    return 0;
  });

  for (const tier of sortedTiers) {
    if (qtyMilli >= tier.minQtyMilli) {
      return tier.priceCents;
    }
  }

  return basePriceCents;
}

/**
 * Calcula el importe bruto de una línea (precio x cantidad en milésimas con redondeo comercial).
 */
export function calculateLineGross(unitPriceCents: bigint, qtyMilli: bigint): bigint {
  return mulDiv(unitPriceCents, qtyMilli, 1000n);
}

/**
 * Calcula el importe neto de una línea restando el descuento directo de línea.
 */
export function calculateLineNet(grossCents: bigint, lineDiscountCents: bigint): bigint {
  const net = grossCents - lineDiscountCents;
  return net >= 0n ? net : 0n;
}
