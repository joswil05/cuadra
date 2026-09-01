import { describe, it, expect } from 'vitest';
import { convertUsdToNio, convertNioToUsd } from '../../src/core/fx';

describe('Conversión de Divisas (core/fx)', () => {
  const officialRateMicros = 36624300n; // 36.6243

  it('convierte USD a Córdobas con redondeo físico a 5 centavos para vuelto', () => {
    const res = convertUsdToNio(1000n, officialRateMicros, true);
    expect(res.rawNioCents).toBe(36624n);
    expect(res.nioCents).toBe(36625n);
  });

  it('convierte USD a Córdobas exacto sin redondeo a 5 centavos', () => {
    const res = convertUsdToNio(1000n, officialRateMicros, false);
    expect(res.nioCents).toBe(36624n);
  });

  it('convierte NIO a USD con tipo de cambio', () => {
    const usd = convertNioToUsd(36624n, officialRateMicros);
    expect(usd).toBe(1000n);
  });

  it('lanza error si la tasa es menor o igual a cero en convertUsdToNio y convertNioToUsd', () => {
    expect(() => convertUsdToNio(1000n, 0n)).toThrow('Tipo de cambio inválido');
    expect(() => convertUsdToNio(1000n, -100n)).toThrow('Tipo de cambio inválido');
    expect(() => convertNioToUsd(1000n, 0n)).toThrow('Tipo de cambio inválido');
    expect(() => convertNioToUsd(1000n, -100n)).toThrow('Tipo de cambio inválido');
  });
});
