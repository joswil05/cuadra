import { mulDiv, roundToNearest } from '../money';

export interface UsdConversionResult {
  rawNioCents: bigint;
  nioCents: bigint;
}

/**
 * Convierte un importe en USD a Córdobas (NIO).
 * @param usdCents Centavos de dólar (US$25.00 = 2500n).
 * @param fxRateMicros Tipo de cambio en micros (36.6243 = 36624300n).
 * @param roundCashTo5Cents Si es true, redondea a 5 centavos físicos para entrega de vuelto.
 */
export function convertUsdToNio(
  usdCents: bigint,
  fxRateMicros: bigint,
  roundCashTo5Cents: boolean = true
): UsdConversionResult {
  if (fxRateMicros <= 0n) {
    throw new Error('Tipo de cambio inválido');
  }

  const rawNioCents = mulDiv(usdCents, fxRateMicros, 1_000_000n);
  const nioCents = roundCashTo5Cents ? roundToNearest(rawNioCents, 5n) : rawNioCents;

  return {
    rawNioCents,
    nioCents
  };
}

/**
 * Convierte Córdobas (NIO) a USD.
 */
export function convertNioToUsd(nioCents: bigint, fxRateMicros: bigint): bigint {
  if (fxRateMicros <= 0n) {
    throw new Error('Tipo de cambio inválido');
  }

  return mulDiv(nioCents, 1_000_000n, fxRateMicros);
}
