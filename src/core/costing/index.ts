import { mulDiv, allocate } from '../money';

export interface CostState {
  stockMilli: bigint;
  avgCostMicros: bigint;
}

export interface OutboundResult {
  state: CostState;
  cogsCents: bigint;
}

export interface LandedCostLineInput {
  qtyMilli: bigint;
  unitCostCents: bigint;
}

export interface LandedCostLineResult {
  qtyMilli: bigint;
  unitCostCents: bigint;
  allocatedFreightCents: bigint;
  landedUnitCostMicros: bigint;
}

/**
 * Aplica una entrada de inventario recalculando el Costo Promedio Ponderado (CPP).
 * Fórmula: nuevo_cpp = (stock_previo * cpp_previo + qty * costo_unitario) / (stock_previo + qty)
 */
export function applyInbound(
  state: CostState,
  qtyMilli: bigint,
  unitCostMicros: bigint
): CostState {
  if (qtyMilli <= 0n) {
    return state;
  }

  const prevCostProduct = state.stockMilli * state.avgCostMicros;
  const inCostProduct = qtyMilli * unitCostMicros;
  const newStockMilli = state.stockMilli + qtyMilli;

  const newAvgCostMicros = mulDiv(prevCostProduct + inCostProduct, 1n, newStockMilli);

  return {
    stockMilli: newStockMilli,
    avgCostMicros: newAvgCostMicros
  };
}

/**
 * Aplica una salida de inventario.
 * Congela el costo unitario según el CPP actual y calcula el costo de venta (COGS).
 * NUNCA modifica el promedio ponderado.
 */
export function applyOutbound(
  state: CostState,
  qtyMilli: bigint
): OutboundResult {
  if (qtyMilli <= 0n) {
    return {
      state,
      cogsCents: 0n
    };
  }

  if (qtyMilli > state.stockMilli) {
    throw new Error('Stock insuficiente para salida');
  }

  // cogs_cents = (qty_milli * avg_cost_micros) / (1000 milli/unit * 10000 micros/cent = 10_000_000)
  // Wait: 1 unit = 1000 milli. 1 cent = 10000 micros.
  // 1 unit = 1_000_000 micros = 100 cents.
  // qty_units = qty_milli / 1000. unit_cost_cents = avg_cost_micros / 10000.
  // cogs_cents = (qty_milli / 1000) * (avg_cost_micros / 10000) = (qty_milli * avg_cost_micros) / 10_000_000.
  // Wait! Let's check with an example:
  // 15 units (15_000 milli) at C$120.00 (120_000_000 micros):
  // 15 * 120 = C$1800.00 = 180,000 cents.
  // 15_000 * 120_000_000 = 1,800,000,000,000.
  // 1,800,000,000,000 / 10_000_000 = 180,000 cents.
  // Divisor is exactly 10_000_000n.
  const cogsCents = mulDiv(qtyMilli, state.avgCostMicros, 10_000_000n);

  return {
    state: {
      stockMilli: state.stockMilli - qtyMilli,
      avgCostMicros: state.avgCostMicros
    },
    cogsCents
  };
}

/**
 * Prorratea flete entre las líneas de compra para producir landed_unit_cost_micros.
 */
export function prorateFreightToLandedCost(
  lines: readonly LandedCostLineInput[],
  freightCents: bigint
): LandedCostLineResult[] {
  if (lines.length === 0) return [];

  const lineValues = lines.map((l) => mulDiv(l.unitCostCents, l.qtyMilli, 1000n));
  const allocatedFreights = allocate(freightCents, lineValues);

  return lines.map((line, idx) => {
    const allocatedFreightCents = allocatedFreights[idx]!;
    const lineTotalCents = (lineValues[idx]!) + allocatedFreightCents;

    // Convertir total en centavos a micros y dividir por qty en milésimas:
    // (lineTotalCents * 10000 micros/cent * 1000 milli/unit) / qtyMilli
    const totalMicros = lineTotalCents * 10_000n;
    const landedUnitCostMicros = mulDiv(totalMicros, 1000n, line.qtyMilli);

    return {
      qtyMilli: line.qtyMilli,
      unitCostCents: line.unitCostCents,
      allocatedFreightCents,
      landedUnitCostMicros
    };
  });
}
