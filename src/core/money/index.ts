/**
 * Motor Monetario — Primitivas de Aritmética Entera
 * Cuadra ERP / POS (Nicaragua)
 */

/**
 * Multiplica y divide en enteros con redondeo comercial (half-up),
 * correcto también para negativos.
 * Es la ÚNICA función del sistema autorizada a redondear importes.
 */
export function mulDiv(value: bigint, mul: bigint, div: bigint): bigint {
  if (div === 0n) {
    throw new Error('División por cero en mulDiv');
  }

  let num = value * mul;
  let d = div;

  if (d < 0n) {
    num = -num;
    d = -d;
  }

  if (num >= 0n) {
    const q = num / d;
    const r = num % d;
    if (2n * r >= d) {
      return q + 1n;
    }
    return q;
  } else {
    const absNum = -num;
    const absQ = absNum / d;
    const absR = absNum % d;
    if (2n * absR >= d) {
      return -(absQ + 1n);
    }
    return -absQ;
  }
}

/**
 * Reparte `total` entre `weights` de modo que la suma de las partes sea
 * EXACTAMENTE `total`.
 * Método de mayores residuos (Hamilton-Hare):
 * Asigna la cuota base y reparte los centavos sobrantes, uno a uno,
 * a las partes con mayor residuo fraccionario. En caso de empate gana el índice menor.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  const n = weights.length;
  if (n === 0) return [];

  const sumWeights = weights.reduce((acc, w) => acc + w, 0n);
  if (sumWeights === 0n) {
    // Si todos los pesos son cero, devolver array de ceros
    return new Array<bigint>(n).fill(0n);
  }

  if (total === 0n) {
    return new Array<bigint>(n).fill(0n);
  }

  const shares: bigint[] = new Array<bigint>(n);
  const remainders: { index: number; rem: bigint }[] = [];

  let allocatedSum = 0n;

  for (let i = 0; i < n; i++) {
    const w = weights[i]!;
    const prod = total * w;
    const share = prod / sumWeights;
    const rem = prod % sumWeights;

    shares[i] = share;
    allocatedSum += share;
    remainders.push({ index: i, rem: rem >= 0n ? rem : -rem });
  }

  let leftover = total - allocatedSum;

  if (leftover !== 0n) {
    // Ordenar por residuo fraccionario descendente; en empate gana el índice menor
    remainders.sort((a, b) => {
      if (b.rem > a.rem) return 1;
      if (b.rem < a.rem) return -1;
      return a.index - b.index;
    });

    const step = leftover > 0n ? 1n : -1n;
    let idx = 0;
    while (leftover !== 0n) {
      const target = remainders[idx % n]!;
      shares[target.index] = shares[target.index]! + step;
      leftover -= step;
      idx++;
    }
  }

  return shares;
}

/**
 * Redondea un valor entero al múltiplo más cercano de `step` (ej. 5 centavos)
 * usando redondeo comercial half-up.
 */
export function roundToNearest(value: bigint, step: bigint): bigint {
  if (step <= 0n) return value;
  return mulDiv(value, 1n, step) * step;
}

/**
 * Formatea centavos a texto de presentación con formato córdobas (C$1,234.50).
 */
export function formatCurrency(cents: bigint | number, symbol: string = 'C$'): string {
  const c = typeof cents === 'bigint' ? cents : BigInt(cents);
  const isNegative = c < 0n;
  const absCents = isNegative ? -c : c;

  const intPart = absCents / 100n;
  const decPart = absCents % 100n;

  const intFormatted = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decFormatted = decPart.toString().padStart(2, '0');

  const formatted = `${symbol}${intFormatted}.${decFormatted}`;
  return isNegative ? `-${formatted}` : formatted;
}
