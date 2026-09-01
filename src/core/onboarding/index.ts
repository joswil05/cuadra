export type IndustryProfile = 'minimarket' | 'apparel' | 'general';
export type TaxRegime = 'general' | 'cuota_fija';

export interface SeedProductVariant {
  sku: string;
  name: string;
  categoryName: string;
  priceCents: bigint;
  costCents: bigint;
  initialStockMilli: bigint;
  minStockMilli: bigint;
  taxKind: 'taxable' | 'exempt';
  taxRateBp: bigint;
}

export interface IndustrySeedCatalog {
  profile: IndustryProfile;
  profileName: string;
  defaultPosColumns: string[];
  products: SeedProductVariant[];
}

export const MINIMARKET_SEED_CATALOG: IndustrySeedCatalog = {
  profile: 'minimarket',
  profileName: 'Minisúper / Pulpería / Abarrotes',
  defaultPosColumns: ['code', 'name', 'qty', 'price', 'total'],
  products: [
    {
      sku: 'ARR-FAI-1LB',
      name: 'Arroz Faisán 1 Lb',
      categoryName: 'Granos Básicos',
      priceCents: 2200n, // C$ 22.00
      costCents: 1800n, // C$ 18.00
      initialStockMilli: 50000n, // 50 u
      minStockMilli: 10000n,
      taxKind: 'exempt',
      taxRateBp: 0n
    },
    {
      sku: 'FRI-ROJ-1LB',
      name: 'Frijol Rojo Nacional 1 Lb',
      categoryName: 'Granos Básicos',
      priceCents: 3500n, // C$ 35.00
      costCents: 2800n,
      initialStockMilli: 40000n,
      minStockMilli: 10000n,
      taxKind: 'exempt',
      taxRateBp: 0n
    },
    {
      sku: 'ACE-TRE-800',
      name: 'Aceite El Trébol 800ml',
      categoryName: 'Abarrotes',
      priceCents: 6500n, // C$ 65.00
      costCents: 5200n,
      initialStockMilli: 25000n,
      minStockMilli: 5000n,
      taxKind: 'exempt',
      taxRateBp: 0n
    },
    {
      sku: 'BEB-COC-600',
      name: 'Coca-Cola 600ml Descartable',
      categoryName: 'Bebidas',
      priceCents: 2500n, // C$ 25.00
      costCents: 1900n,
      initialStockMilli: 48000n,
      minStockMilli: 12000n,
      taxKind: 'taxable',
      taxRateBp: 1500n
    },
    {
      sku: 'CAF-PRE-150',
      name: 'Café Presto 150g',
      categoryName: 'Abarrotes',
      priceCents: 8500n, // C$ 85.00
      costCents: 6800n,
      initialStockMilli: 20000n,
      minStockMilli: 5000n,
      taxKind: 'taxable',
      taxRateBp: 1500n
    }
  ]
};

export const APPAREL_SEED_CATALOG: IndustrySeedCatalog = {
  profile: 'apparel',
  profileName: 'Tienda de Ropa / Calzado / Boutiques',
  defaultPosColumns: ['code', 'name', 'size', 'color', 'price', 'total'],
  products: [
    {
      sku: 'CAM-POL-S-BLA',
      name: 'Camiseta Polo Básica Blanca (Talla S)',
      categoryName: 'Camisas',
      priceCents: 35000n, // C$ 350.00
      costCents: 20000n,
      initialStockMilli: 10000n,
      minStockMilli: 3000n,
      taxKind: 'taxable',
      taxRateBp: 1500n
    },
    {
      sku: 'CAM-POL-M-AZU',
      name: 'Camiseta Polo Básica Azul (Talla M)',
      categoryName: 'Camisas',
      priceCents: 35000n, // C$ 350.00
      costCents: 20000n,
      initialStockMilli: 15000n,
      minStockMilli: 3000n,
      taxKind: 'taxable',
      taxRateBp: 1500n
    },
    {
      sku: 'PAN-JEA-32-AZU',
      name: 'Pantalón Jeans Clásico Talla 32',
      categoryName: 'Pantalones',
      priceCents: 85000n, // C$ 850.00
      costCents: 50000n,
      initialStockMilli: 8000n,
      minStockMilli: 2000n,
      taxKind: 'taxable',
      taxRateBp: 1500n
    },
    {
      sku: 'CAL-DEP-40-NEG',
      name: 'Zapatos Deportivos Talla 40 Negro',
      categoryName: 'Calzado',
      priceCents: 120000n, // C$ 1,200.00
      costCents: 75000n,
      initialStockMilli: 6000n,
      minStockMilli: 2000n,
      taxKind: 'taxable',
      taxRateBp: 1500n
    }
  ]
};

export function getIndustrySeedCatalog(profile: IndustryProfile): IndustrySeedCatalog {
  switch (profile) {
    case 'apparel':
      return APPAREL_SEED_CATALOG;
    case 'minimarket':
    case 'general':
    default:
      return MINIMARKET_SEED_CATALOG;
  }
}
