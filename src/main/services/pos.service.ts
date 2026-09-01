import Database from 'better-sqlite3';
import { TaxKind, TaxRegime } from '../../core/tax';
import {
  PosCart,
  PosProduct,
  PosCartLine,
  SuspendedCartItem,
  parseScanInput,
  addOrIncrementCartLine,
  updateCartLineQtyPure,
  calculatePosCartDocument
} from '../../core/pos';
import { createSale, CreateSaleResult, SalePaymentInput } from './sales.service';

const suspendedCartsStore = new Map<string, SuspendedCartItem>();

/**
 * Busca productos en la base de datos por código de barras, SKU o FTS5 por nombre.
 */
export function searchProductsPos(db: Database.Database, query: string): PosProduct[] {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  // 1. Coincidencia exacta por código de barras o SKU
  const exact = db.prepare(`
    SELECT
      p.id AS product_id,
      v.id AS variant_id,
      v.sku,
      b.code AS barcode,
      p.name,
      v.price_cents,
      p.tax_rate_id,
      v.stock_milli,
      p.tracks_stock,
      tr.rate_bp,
      tr.code as tax_code
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN barcodes b ON b.variant_id = v.id
    LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
    WHERE v.sku = ? OR b.code = ?
  `).all(cleanQuery, cleanQuery) as Array<{
    product_id: number;
    variant_id: number;
    sku: string;
    barcode: string | null;
    name: string;
    price_cents: number;
    tax_rate_id: number | null;
    stock_milli: number;
    tracks_stock: number;
    rate_bp: number | null;
    tax_code: string | null;
  }>;

  if (exact.length > 0) {
    return exact.map(mapProductRow);
  }

  // 2. Búsqueda por FTS5 en variant_search
  try {
    const ftsQuery = cleanQuery.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, ' ').trim();
    if (ftsQuery) {
      const ftsMatches = db.prepare(`
        SELECT
          p.id AS product_id,
          v.id AS variant_id,
          v.sku,
          b.code AS barcode,
          p.name,
          v.price_cents,
          p.tax_rate_id,
          v.stock_milli,
          p.tracks_stock,
          tr.rate_bp,
          tr.code as tax_code
        FROM variant_search fs
        JOIN product_variants v ON v.id = fs.variant_id
        JOIN products p ON p.id = v.product_id
        LEFT JOIN barcodes b ON b.variant_id = v.id AND b.is_primary = 1
        LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
        WHERE variant_search MATCH ? AND v.is_active = 1 AND p.is_active = 1
        LIMIT 20
      `).all(`${ftsQuery}*`) as Array<{
        product_id: number;
        variant_id: number;
        sku: string;
        barcode: string | null;
        name: string;
        price_cents: number;
        tax_rate_id: number | null;
        stock_milli: number;
        tracks_stock: number;
        rate_bp: number | null;
        tax_code: string | null;
      }>;

      if (ftsMatches.length > 0) {
        return ftsMatches.map(mapProductRow);
      }
    }
  } catch {
    // Si FTS5 falla por sintaxis, pasar a LIKE
  }

  // 3. Búsqueda por coincidencia parcial LIKE
  const partial = db.prepare(`
    SELECT
      p.id AS product_id,
      v.id AS variant_id,
      v.sku,
      b.code AS barcode,
      p.name,
      v.price_cents,
      p.tax_rate_id,
      v.stock_milli,
      p.tracks_stock,
      tr.rate_bp,
      tr.code as tax_code
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN barcodes b ON b.variant_id = v.id
    LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
    WHERE v.is_active = 1 AND p.is_active = 1
      AND (v.sku LIKE ? OR p.name LIKE ? OR b.code LIKE ?)
    LIMIT 20
  `).all(`%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`) as Array<{
    product_id: number;
    variant_id: number;
    sku: string;
    barcode: string | null;
    name: string;
    price_cents: number;
    tax_rate_id: number | null;
    stock_milli: number;
    tracks_stock: number;
    rate_bp: number | null;
    tax_code: string | null;
  }>;

  return partial.map(mapProductRow);
}

function mapProductRow(r: {
  product_id: number;
  variant_id: number;
  sku: string;
  barcode: string | null;
  name: string;
  price_cents: number;
  tax_rate_id: number | null;
  stock_milli: number;
  tracks_stock: number;
  rate_bp: number | null;
  tax_code: string | null;
}): PosProduct {
  const taxKind: TaxKind = r.tax_code === 'IVA15' ? 'taxable' : 'exempt';
  const taxRateBp = BigInt(r.rate_bp ?? (r.tax_code === 'IVA15' ? 1500 : 0));

  return {
    productId: r.product_id,
    variantId: r.variant_id,
    sku: r.sku,
    barcode: r.barcode,
    name: r.name,
    unitPriceCents: BigInt(r.price_cents),
    taxKind,
    taxRateBp,
    stockMilli: BigInt(r.stock_milli),
    tracksStock: r.tracks_stock === 1
  };
}

export type ScanResult =
  | { ok: true; cart: PosCart; addedLine: PosCartLine }
  | { ok: false; error: string };

/**
 * Escanea un producto contra la base de datos y lo agrega al carrito.
 */
export function scanProductToCart(
  db: Database.Database,
  cart: PosCart,
  scanInput: string
): ScanResult {
  const parsed = parseScanInput(scanInput);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const matches = searchProductsPos(db, parsed.code);
  if (matches.length === 0) {
    return { ok: false, error: `Producto no encontrado: "${parsed.code}"` };
  }

  const product = matches[0]!;

  const allowNegSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'inventory.allow_negative'").get() as { value_json: string } | undefined;
  const allowNegative = allowNegSetting ? (JSON.parse(allowNegSetting.value_json) as boolean) === true : false;

  return addOrIncrementCartLine(cart, product, parsed.multiplier, allowNegative);
}

/**
 * Actualiza la cantidad de una línea validando contra el stock de base de datos.
 */
export function updateCartLineQty(
  db: Database.Database,
  cart: PosCart,
  lineNo: number,
  newQtyMilli: bigint
): ScanResult {
  const allowNegSetting = db.prepare("SELECT value_json FROM settings WHERE key = 'inventory.allow_negative'").get() as { value_json: string } | undefined;
  const allowNegative = allowNegSetting ? (JSON.parse(allowNegSetting.value_json) as boolean) === true : false;

  const res = updateCartLineQtyPure(cart, lineNo, newQtyMilli, allowNegative);
  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  return { ok: true, cart: res.cart, addedLine: res.updatedLine };
}

export interface TenderParams {
  cart: PosCart;
  seriesId: number;
  shiftId: number;
  userId: number;
  taxRegime?: TaxRegime;
  pricesIncludeTax?: boolean;
  docType?: 'ticket' | 'invoice';
  payments: SalePaymentInput[];
  isContingency?: boolean;
}

export type TenderResult =
  | { ok: true; sale: CreateSaleResult }
  | { ok: false; error: string };

/**
 * Realiza el cobro y emisión atómica de la venta en el POS.
 */
export function tenderPosCart(db: Database.Database, params: TenderParams): TenderResult {
  try {
    const sale = createSale(db, {
      docType: params.docType ?? 'ticket',
      seriesId: params.seriesId,
      shiftId: params.shiftId,
      userId: params.userId,
      customerId: params.cart.customerId,
      taxRegime: params.taxRegime ?? 'general',
      pricesIncludeTax: params.pricesIncludeTax ?? true,
      lines: params.cart.lines.map((l) => ({
        variantId: l.variantId,
        description: l.description,
        unitPriceCents: l.unitPriceCents,
        qtyMilli: l.qtyMilli,
        lineDiscountCents: l.lineDiscountCents,
        taxKind: l.taxKind,
        taxRateBp: l.taxRateBp
      })),
      payments: params.payments,
      orderDiscountCents: params.cart.orderDiscountCents,
      note: params.cart.note,
      isContingency: params.isContingency
    });

    return { ok: true, sale };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Suspende un carrito activo (F7).
 */
export function suspendCart(cart: PosCart, note = 'Ticket suspendido'): string {
  const id = `susp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const calc = calculatePosCartDocument(cart);

  const item: SuspendedCartItem = {
    id,
    at: new Date().toLocaleTimeString(),
    note,
    totalCents: calc.totalCents,
    itemCount: cart.lines.length,
    cart
  };

  suspendedCartsStore.set(id, item);
  return id;
}

/**
 * Recupera un carrito suspendido (F8).
 */
export function resumeCart(id: string): PosCart | null {
  const item = suspendedCartsStore.get(id);
  if (!item) return null;
  suspendedCartsStore.delete(id);
  return item.cart;
}

/**
 * Lista todos los carritos suspendidos.
 */
export function getSuspendedCarts(): SuspendedCartItem[] {
  return Array.from(suspendedCartsStore.values());
}
