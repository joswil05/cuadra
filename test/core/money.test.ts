import { describe, it, expect } from 'vitest';
import { mulDiv, allocate, roundToNearest, formatCurrency } from '../../src/core/money';

describe('Motor Monetario: Primitivas (core/money)', () => {
  describe('mulDiv', () => {
    it('multiplica y divide en enteros con redondeo comercial half-up exacto', () => {
      expect(mulDiv(100n, 15n, 100n)).toBe(15n);
      expect(mulDiv(10n, 25n, 100n)).toBe(3n);
      expect(mulDiv(10n, 24n, 100n)).toBe(2n);
      expect(mulDiv(10n, 26n, 100n)).toBe(3n);
    });

    it('maneja correctamente denominadores negativos', () => {
      expect(mulDiv(100n, 15n, -100n)).toBe(-15n);
      expect(mulDiv(-100n, 15n, -100n)).toBe(15n);
      expect(mulDiv(10n, 25n, -100n)).toBe(-3n);
    });

    it('maneja correctamente números negativos (half-up simétrico/lejos de cero)', () => {
      expect(mulDiv(-10n, 25n, 100n)).toBe(-3n);
      expect(mulDiv(-10n, 24n, 100n)).toBe(-2n);
      expect(mulDiv(10n, -25n, 100n)).toBe(-3n);
      expect(mulDiv(-10n, -25n, 100n)).toBe(3n);
    });

    it('maneja valores con cero en valor o multiplicador', () => {
      expect(mulDiv(0n, 50n, 100n)).toBe(0n);
      expect(mulDiv(100n, 0n, 100n)).toBe(0n);
    });

    it('lanza error al dividir por cero', () => {
      expect(() => mulDiv(100n, 10n, 0n)).toThrow('División por cero en mulDiv');
    });

    it('maneja números enteros gigantescos que superan Number.MAX_SAFE_INTEGER sin perder precisión', () => {
      const largeVal = 9_007_199_254_740_991n * 2n;
      const res = mulDiv(largeVal, 1500n, 10000n);
      expect(res).toBe((largeVal * 1500n + 5000n) / 10000n);
    });
  });

  describe('allocate', () => {
    it('reparte un total con residuo de 1 centavo dando prioridad al mayor residuo', () => {
      const shares = allocate(1000n, [1n, 1n, 1n]);
      expect(shares).toEqual([334n, 333n, 333n]);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(1000n);
    });

    it('reparte un total con residuo de 2 centavos entre 3 partes', () => {
      const shares = allocate(1001n, [1n, 1n, 1n]);
      expect(shares).toEqual([334n, 334n, 333n]);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(1001n);
    });

    it('reparte entre pesos desiguales ordenando por residuo', () => {
      // Total 100, pesos [3, 7] -> total weights 10. shares [30, 70]
      const s1 = allocate(100n, [3n, 7n]);
      expect(s1).toEqual([30n, 70n]);

      // Total 105, pesos [1, 2] -> 105 / 3 = 35 -> [35, 70]
      const s2 = allocate(105n, [1n, 2n]);
      expect(s2).toEqual([35n, 70n]);

      // Pesos donde b.rem < a.rem
      const s3 = allocate(100n, [7n, 3n]);
      expect(s3).toEqual([70n, 30n]);
    });

    it('reparte valores negativos correctamente', () => {
      const shares = allocate(-1000n, [1n, 1n, 1n]);
      expect(shares).toEqual([-334n, -333n, -333n]);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(-1000n);
    });

    it('maneja array vacío de pesos', () => {
      expect(allocate(1000n, [])).toEqual([]);
    });

    it('maneja vector de pesos con ceros', () => {
      const shares = allocate(100n, [0n, 50n, 50n]);
      expect(shares).toEqual([0n, 50n, 50n]);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(100n);
    });

    it('maneja un vector con un solo peso', () => {
      const shares = allocate(5432n, [100n]);
      expect(shares).toEqual([5432n]);
    });

    it('devuelve array de ceros si todos los pesos son cero', () => {
      const shares = allocate(100n, [0n, 0n, 0n]);
      expect(shares).toEqual([0n, 0n, 0n]);
    });

    it('maneja total cero', () => {
      const shares = allocate(0n, [10n, 20n, 30n]);
      expect(shares).toEqual([0n, 0n, 0n]);
    });
  });

  describe('roundToNearest', () => {
    it('redondea al múltiplo más cercano (ej. 5 centavos)', () => {
      expect(roundToNearest(14703n, 5n)).toBe(14705n);
      expect(roundToNearest(14702n, 5n)).toBe(14700n);
      expect(roundToNearest(14700n, 5n)).toBe(14700n);
      expect(roundToNearest(14705n, 5n)).toBe(14705n);
      expect(roundToNearest(14707n, 5n)).toBe(14705n);
      expect(roundToNearest(14708n, 5n)).toBe(14710n);
    });

    it('devuelve el mismo valor si step es menor o igual a 0', () => {
      expect(roundToNearest(123n, 0n)).toBe(123n);
      expect(roundToNearest(123n, -5n)).toBe(123n);
    });
  });

  describe('formatCurrency', () => {
    it('formatea centavos a córdobas con símbolo y dos decimales', () => {
      expect(formatCurrency(123450n)).toBe('C$1,234.50');
      expect(formatCurrency(123450)).toBe('C$1,234.50');
      expect(formatCurrency(5n)).toBe('C$0.05');
      expect(formatCurrency(0n)).toBe('C$0.00');
      expect(formatCurrency(-5000n)).toBe('-C$50.00');
      expect(formatCurrency(-5000)).toBe('-C$50.00');
    });
  });
});
