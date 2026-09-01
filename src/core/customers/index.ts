export interface Customer {
  id: number;
  uid: string;
  code: string | null;
  name: string;
  docType: string | null;
  docNumber: string | null;
  taxRegime: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimitCents: bigint;
  creditDays: number;
  pointsBalance: bigint;
  isActive: boolean;
}

export interface CreateCustomerParams {
  code?: string;
  name: string;
  docType?: string;
  docNumber?: string;
  taxRegime?: string;
  phone?: string;
  email?: string;
  address?: string;
  creditLimitCents?: bigint;
  creditDays?: number;
}

export interface LedgerAgingEntry {
  at: string;
  dueOn?: string;
  amountCents: bigint;
}

export interface AgingBuckets {
  currentCents: bigint;
  days1to30Cents: bigint;
  days31to60Cents: bigint;
  days61to90Cents: bigint;
  daysOver90Cents: bigint;
  totalCents: bigint;
}

export interface CustomerLedgerEntry {
  id: number;
  uid: string;
  customerId: number;
  at: string;
  type: 'charge' | 'payment' | 'adjustment' | 'write_off';
  amountCents: bigint;
  balanceAfterCents: bigint;
  dueOn: string | null;
  refType: string | null;
  refId: number | null;
  shiftId: number | null;
  method: string | null;
  userId: number;
  note: string | null;
}

export interface CustomerStatement {
  customer: Customer;
  balanceCents: bigint;
  creditLimitCents: bigint;
  availableCreditCents: bigint;
  aging: AgingBuckets;
  entries: CustomerLedgerEntry[];
}

export interface ValidateCreditLimitParams {
  currentBalanceCents: bigint;
  creditLimitCents: bigint;
  newChargeCents: bigint;
  creditDays?: number;
}

export interface ValidateCreditLimitResult {
  allowed: boolean;
  reason?: string;
  remainingCreditCents: bigint;
}

/**
 * Valida el límite de crédito en el momento del cobro.
 * Retorna si la operación es permitida y el crédito disponible restante.
 */
export function validateCreditLimit(
  params: ValidateCreditLimitParams
): ValidateCreditLimitResult {
  if (params.creditLimitCents <= 0n) {
    return {
      allowed: false,
      reason: 'El cliente está sin límite de crédito autorizado',
      remainingCreditCents: 0n
    };
  }

  const projectedBalance = params.currentBalanceCents + params.newChargeCents;

  if (projectedBalance > params.creditLimitCents) {
    const remaining = params.creditLimitCents > params.currentBalanceCents
      ? params.creditLimitCents - params.currentBalanceCents
      : 0n;

    return {
      allowed: false,
      reason: `Límite de crédito superado. Disponible: C$ ${(Number(remaining) / 100).toFixed(2)}, Requerido: C$ ${(Number(params.newChargeCents) / 100).toFixed(2)}`,
      remainingCreditCents: remaining
    };
  }

  return {
    allowed: true,
    remainingCreditCents: params.creditLimitCents - projectedBalance
  };
}

/**
 * Clasifica los saldos adeudados en rangos de vencimiento (Aging Buckets):
 * - Corriente (no vencido)
 * - 1 a 30 días
 * - 31 a 60 días
 * - 61 a 90 días
 * - Más de 90 días
 */
export function calculateAgingBuckets(
  entries: readonly LedgerAgingEntry[],
  asOfDate: Date | string = new Date()
): AgingBuckets {
  const asOf = typeof asOfDate === 'string' ? new Date(asOfDate) : asOfDate;
  const asOfMs = asOf.getTime();

  let currentCents = 0n;
  let days1to30Cents = 0n;
  let days31to60Cents = 0n;
  let days61to90Cents = 0n;
  let daysOver90Cents = 0n;
  let totalCents = 0n;

  for (const entry of entries) {
    // Solo clasificamos cargos (amountCents > 0)
    if (entry.amountCents <= 0n) {
      totalCents += entry.amountCents;
      continue;
    }

    totalCents += entry.amountCents;

    const dueDate = entry.dueOn ? new Date(entry.dueOn) : new Date(entry.at);
    const diffMs = asOfMs - dueDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      currentCents += entry.amountCents;
    } else if (diffDays <= 30) {
      days1to30Cents += entry.amountCents;
    } else if (diffDays <= 60) {
      days31to60Cents += entry.amountCents;
    } else if (diffDays <= 90) {
      days61to90Cents += entry.amountCents;
    } else {
      daysOver90Cents += entry.amountCents;
    }
  }

  return {
    currentCents,
    days1to30Cents,
    days31to60Cents,
    days61to90Cents,
    daysOver90Cents,
    totalCents
  };
}

/**
 * Calcula los puntos de fidelización ganados por una compra.
 * @param totalCents Total pagado en centavos
 * @param centsPerPoint Centavos necesarios para ganar 1 punto (default C$ 100.00 = 10000 cents)
 */
export function calculateLoyaltyPoints(
  totalCents: bigint,
  centsPerPoint = 10000n
): bigint {
  if (centsPerPoint <= 0n || totalCents <= 0n) return 0n;
  return totalCents / centsPerPoint;
}

/**
 * Calcula el descuento en dinero por canje de puntos de fidelización.
 * @param points Puntos a canjear
 * @param centsPerPoint Valor de cada punto en centavos (default C$ 1.00 = 100 cents)
 */
export function calculatePointsRedemption(
  points: bigint,
  centsPerPoint = 100n
): bigint {
  if (points <= 0n || centsPerPoint <= 0n) return 0n;
  return points * centsPerPoint;
}
