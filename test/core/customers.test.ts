import { describe, it, expect } from 'vitest';
import {
  validateCreditLimit,
  calculateAgingBuckets,
  calculateLoyaltyPoints,
  calculatePointsRedemption,
  LedgerAgingEntry
} from '../../src/core/customers';

describe('Lógica Pura de Clientes, Crédito y Fidelización (core/customers)', () => {
  describe('Validación de Límite de Crédito', () => {
    it('Permite venta a crédito si el nuevo saldo no supera el límite de crédito', () => {
      const res = validateCreditLimit({
        currentBalanceCents: 20000n, // Saldo actual: C$ 200.00
        creditLimitCents: 100000n,   // Límite: C$ 1,000.00
        newChargeCents: 50000n,      // Cargo: C$ 500.00
        creditDays: 30
      });

      expect(res.allowed).toBe(true);
      expect(res.remainingCreditCents).toBe(30000n); // Quedan C$ 300.00 disponibles
    });

    it('Bloquea la venta a crédito si el límite es cero o crédito no habilitado', () => {
      const res = validateCreditLimit({
        currentBalanceCents: 0n,
        creditLimitCents: 0n,
        newChargeCents: 1000n,
        creditDays: 0
      });

      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/sin límite de crédito/i);
    });

    it('Bloquea la venta a crédito si supera el límite con mensaje claro', () => {
      const res = validateCreditLimit({
        currentBalanceCents: 80000n, // C$ 800.00
        creditLimitCents: 100000n,   // C$ 1,000.00
        newChargeCents: 30000n,      // C$ 300.00 (Excedería por C$ 100.00)
        creditDays: 30
      });

      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/límite de crédito superado/i);
      expect(res.remainingCreditCents).toBe(20000n);
    });
  });

  describe('Antigüedad de Saldos (Aging Buckets)', () => {
    it('Clasifica deudas por rangos de antigüedad (corriente, 1-30, 31-60, 61-90, +90)', () => {
      const asOf = new Date('2026-09-01T00:00:00.000Z');

      const entries: LedgerAgingEntry[] = [
        // Corriente / Vence en el futuro o hoy (0 días)
        { at: '2026-08-30T00:00:00.000Z', dueOn: '2026-09-05', amountCents: 10000n }, // C$ 100.00
        // Vencido 1 a 30 días (venció el 15 de agosto)
        { at: '2026-08-01T00:00:00.000Z', dueOn: '2026-08-15', amountCents: 20000n }, // C$ 200.00
        // Vencido 31 a 60 días (venció el 15 de julio)
        { at: '2026-07-01T00:00:00.000Z', dueOn: '2026-07-15', amountCents: 30000n }, // C$ 300.00
        // Vencido 61 a 90 días (venció el 15 de junio)
        { at: '2026-06-01T00:00:00.000Z', dueOn: '2026-06-15', amountCents: 40000n }, // C$ 400.00
        // Vencido +90 días (venció el 15 de abril)
        { at: '2026-04-01T00:00:00.000Z', dueOn: '2026-04-15', amountCents: 50000n }  // C$ 500.00
      ];

      const aging = calculateAgingBuckets(entries, asOf);

      expect(aging.currentCents).toBe(10000n);
      expect(aging.days1to30Cents).toBe(20000n);
      expect(aging.days31to60Cents).toBe(30000n);
      expect(aging.days61to90Cents).toBe(40000n);
      expect(aging.daysOver90Cents).toBe(50000n);
      expect(aging.totalCents).toBe(150000n);
    });
  });

  describe('Fidelización y Puntos', () => {
    it('Calcula puntos ganados según configuración de centavos por punto', () => {
      // 1 punto por cada C$ 100.00 (10,000 centavos)
      const points = calculateLoyaltyPoints(35000n, 10000n);
      expect(points).toBe(3n);
    });

    it('Calcula valor en córdobas del canje de puntos', () => {
      // Cada punto vale C$ 1.00 (100 centavos)
      const discountCents = calculatePointsRedemption(50n, 100n);
      expect(discountCents).toBe(5000n); // C$ 50.00
    });
  });
});
