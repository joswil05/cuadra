import { describe, it, expect } from 'vitest';
import {
  applyInbound,
  applyOutbound,
  prorateFreightToLandedCost,
  CostState
} from '../../src/core/costing';

describe('Costeo Promedio Ponderado y Kardex (core/costing)', () => {
  it('Entrada, entrada, salida: el promedio ponderado se recalcula en entradas y la salida no lo mueve', () => {
    let state: CostState = {
      stockMilli: 0n,
      avgCostMicros: 0n
    };

    // Entrada 1: 10 unidades (10_000 milli) a C$100.00 (100_000_000 micros)
    state = applyInbound(state, 10_000n, 100_000_000n);
    expect(state.stockMilli).toBe(10_000n);
    expect(state.avgCostMicros).toBe(100_000_000n);

    // Entrada 2: 20 unidades (20_000 milli) a C$130.00 (130_000_000 micros)
    state = applyInbound(state, 20_000n, 130_000_000n);
    expect(state.stockMilli).toBe(30_000n);
    expect(state.avgCostMicros).toBe(120_000_000n);

    // Salida: 15 unidades (15_000 milli)
    const outboundResult = applyOutbound(state, 15_000n);
    expect(outboundResult.cogsCents).toBe(180000n);

    // La salida NO mueve el promedio ponderado
    expect(outboundResult.state.stockMilli).toBe(15_000n);
    expect(outboundResult.state.avgCostMicros).toBe(120_000_000n);
  });

  it('Una salida congela su costo y una entrada posterior más cara no cambia el costo de esa salida', () => {
    let state: CostState = {
      stockMilli: 10_000n,
      avgCostMicros: 50_000_000n // C$50.00
    };

    const out1 = applyOutbound(state, 4_000n);
    expect(out1.cogsCents).toBe(20000n);
    state = out1.state;
    expect(state.stockMilli).toBe(6_000n);
    expect(state.avgCostMicros).toBe(50_000_000n);

    // Entrada posterior más cara: 10 unidades a C$200.00
    state = applyInbound(state, 10_000n, 200_000_000n);
    expect(state.stockMilli).toBe(16_000n);
    expect(state.avgCostMicros).toBe(143_750_000n);

    // El costo de la salida anterior sigue congelado
    expect(out1.cogsCents).toBe(20000n);
  });

  it('Prorratea flete entre las líneas de compra para producir landed_unit_cost_micros', () => {
    const lines = [
      { qtyMilli: 10_000n, unitCostCents: 10000n },
      { qtyMilli: 20_000n, unitCostCents: 10000n }
    ];
    const freightCents = 30000n;

    const landedLines = prorateFreightToLandedCost(lines, freightCents);

    expect(landedLines[0]?.allocatedFreightCents).toBe(10000n);
    expect(landedLines[0]?.landedUnitCostMicros).toBe(110_000_000n);

    expect(landedLines[1]?.allocatedFreightCents).toBe(20000n);
    expect(landedLines[1]?.landedUnitCostMicros).toBe(110_000_000n);

    const totalAllocatedFreight = landedLines.reduce((acc, l) => acc + l.allocatedFreightCents, 0n);
    expect(totalAllocatedFreight).toBe(freightCents);
  });

  it('Maneja entradas y salidas de cantidad cero o vacías', () => {
    const state: CostState = {
      stockMilli: 5_000n,
      avgCostMicros: 100_000_000n
    };

    expect(applyInbound(state, 0n, 100_000_000n)).toEqual(state);
    expect(applyInbound(state, -100n, 100_000_000n)).toEqual(state);

    const outZero = applyOutbound(state, 0n);
    expect(outZero.cogsCents).toBe(0n);
    expect(outZero.state).toEqual(state);

    const outNeg = applyOutbound(state, -50n);
    expect(outNeg.cogsCents).toBe(0n);

    expect(prorateFreightToLandedCost([], 1000n)).toEqual([]);
  });

  it('Lanza error de dominio al intentar salida mayor al stock disponible (stock negativo no permitido)', () => {
    const state: CostState = {
      stockMilli: 5_000n,
      avgCostMicros: 100_000_000n
    };

    expect(() => applyOutbound(state, 6_000n)).toThrow('Stock insuficiente para salida');
  });
});
