export interface DaySalesPoint {
  day: string;
  salesCents: bigint;
}

export interface DashboardPulse {
  todaySalesCents: bigint;
  todayMarginCents?: bigint;
  todayMarginBp?: bigint;
  todayTicketsCount: number;
  avgTicketCents: bigint;
  cashInRegisterCents: bigint;
  cashInRegisterUsd: bigint;
  last14DaysSales: DaySalesPoint[];
  salesVariationBp: bigint;
}

export interface LowStockItem {
  variantId: number;
  sku: string;
  name: string;
  stockMilli: bigint;
  minStockMilli: bigint;
}

export interface ExpiringLot {
  lotId: number;
  sku: string;
  name: string;
  lotNumber: string;
  expiresAt: string;
  daysRemaining: number;
  stockMilli: bigint;
}

export interface OverdueCustomer {
  customerId: number;
  name: string;
  balanceCents: bigint;
  overdueDays: number;
}

export interface CashDiscrepancyAlert {
  shiftId: number;
  cashierName: string;
  diffCents: bigint;
  diffUsd: bigint;
  at: string;
}

export interface UndefinedTaxProduct {
  productId: number;
  name: string;
}

export interface DashboardActions {
  lowStockItems: LowStockItem[];
  expiringLots: ExpiringLot[];
  overdueCustomers: OverdueCustomer[];
  cashDiscrepancies: CashDiscrepancyAlert[];
  undefinedTaxProducts: UndefinedTaxProduct[];
}

export interface TopSellingProduct {
  variantId: number;
  sku: string;
  name: string;
  qtySoldMilli: bigint;
  revenueCents: bigint;
}

export interface TopMarginProduct {
  variantId: number;
  sku: string;
  name: string;
  profitCents: bigint;
  marginBp: bigint;
}

export interface DashboardTrends {
  last30DaysSales: DaySalesPoint[];
  topSellingProducts: TopSellingProduct[];
  topMarginProducts: TopMarginProduct[];
}

export interface OwnerDashboardData {
  pulse: DashboardPulse;
  actions: DashboardActions;
  trends: DashboardTrends;
}
