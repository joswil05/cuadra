import { TaxKind, TaxRegime } from '../tax';
import { calculateSaleDocument, CalculatedSaleDocument } from '../sales';

export interface PosProduct {
  productId: number;
  variantId: number;
  sku: string;
  barcode?: string | null;
  name: string;
  unitPriceCents: bigint;
  taxKind: TaxKind;
  taxRateBp: bigint;
  stockMilli: bigint;
  tracksStock: boolean;
}

export interface PosCartLine {
  lineNo: number;
  variantId: number;
  sku: string;
  description: string;
  unitPriceCents: bigint;
  qtyMilli: bigint;
  lineDiscountCents: bigint;
  taxKind: TaxKind;
  taxRateBp: bigint;
  stockMilli: bigint;
  tracksStock: boolean;
}

export interface PosCart {
  id: string;
  lines: PosCartLine[];
  orderDiscountCents: bigint;
  customerId?: number;
  customerName?: string;
  note?: string;
  lastAddedLineNo?: number;
}

export interface SuspendedCartItem {
  id: string;
  at: string;
  note: string;
  totalCents: bigint;
  itemCount: number;
  cart: PosCart;
}

export function createPosCart(cartId = 'cart-default'): PosCart {
  return {
    id: cartId,
    lines: [],
    orderDiscountCents: 0n
  };
}

export interface ParseScanResultSuccess {
  ok: true;
  multiplier: bigint;
  code: string;
}

export interface ParseScanResultError {
  ok: false;
  error: string;
}

export type ParseScanResult = ParseScanResultSuccess | ParseScanResultError;

/**
 * Parsea la entrada del escáner soportando multiplicadores como `3*CODIGO` o `3 * CODIGO`.
 */
export function parseScanInput(input: string): ParseScanResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: 'Entrada vacía' };
  }

  let multiplier = 1n;
  let code = trimmed;

  const starIndex = trimmed.indexOf('*');
  if (starIndex !== -1) {
    const multStr = trimmed.substring(0, starIndex).trim();
    code = trimmed.substring(starIndex + 1).trim();

    try {
      const parsed = BigInt(multStr);
      if (parsed <= 0n) {
        return { ok: false, error: `Multiplicador inválido: ${multStr}` };
      }
      multiplier = parsed;
    } catch {
      return { ok: false, error: `Multiplicador inválido: ${multStr}` };
    }
  }

  if (!code) {
    return { ok: false, error: 'Código de producto vacío' };
  }

  return {
    ok: true,
    multiplier,
    code
  };
}

export type AddToCartResult =
  | { ok: true; cart: PosCart; addedLine: PosCartLine }
  | { ok: false; error: string };

/**
 * Agrega o incrementa una línea de producto en el carrito de forma pura.
 */
export function addOrIncrementCartLine(
  cart: PosCart,
  product: PosProduct,
  multiplier = 1n,
  allowNegative = false
): AddToCartResult {
  const qtyToAddMilli = multiplier * 1000n;
  const existingLineIndex = cart.lines.findIndex((l) => l.variantId === product.variantId);
  const currentQtyMilli = existingLineIndex >= 0 ? cart.lines[existingLineIndex]!.qtyMilli : 0n;
  const totalTargetQtyMilli = currentQtyMilli + qtyToAddMilli;

  if (!allowNegative && product.tracksStock && totalTargetQtyMilli > product.stockMilli) {
    return {
      ok: false,
      error: `Stock insuficiente para ${product.name}. Disponible: ${Number(product.stockMilli) / 1000} unidades`
    };
  }

  let updatedLines: PosCartLine[];
  let targetLine: PosCartLine;

  if (existingLineIndex >= 0) {
    const existing = cart.lines[existingLineIndex]!;
    targetLine = {
      ...existing,
      qtyMilli: totalTargetQtyMilli
    };
    updatedLines = [...cart.lines];
    updatedLines[existingLineIndex] = targetLine;
  } else {
    targetLine = {
      lineNo: cart.lines.length + 1,
      variantId: product.variantId,
      sku: product.sku,
      description: product.name,
      unitPriceCents: product.unitPriceCents,
      qtyMilli: qtyToAddMilli,
      lineDiscountCents: 0n,
      taxKind: product.taxKind,
      taxRateBp: product.taxRateBp,
      stockMilli: product.stockMilli,
      tracksStock: product.tracksStock
    };
    updatedLines = [...cart.lines, targetLine];
  }

  return {
    ok: true,
    cart: {
      ...cart,
      lines: updatedLines,
      lastAddedLineNo: targetLine.lineNo
    },
    addedLine: targetLine
  };
}

export type UpdateCartLineResult =
  | { ok: true; cart: PosCart; updatedLine: PosCartLine }
  | { ok: false; error: string };

/**
 * Actualiza la cantidad de una línea específica en el carrito de forma pura.
 */
export function updateCartLineQtyPure(
  cart: PosCart,
  lineNo: number,
  newQtyMilli: bigint,
  allowNegative = false
): UpdateCartLineResult {
  const lineIndex = cart.lines.findIndex((l) => l.lineNo === lineNo);
  if (lineIndex === -1) {
    return { ok: false, error: `Línea ${lineNo} no encontrada` };
  }

  const line = cart.lines[lineIndex]!;

  if (newQtyMilli <= 0n) {
    const remaining = cart.lines.filter((l) => l.lineNo !== lineNo).map((l, idx) => ({ ...l, lineNo: idx + 1 }));
    return {
      ok: true,
      cart: { ...cart, lines: remaining },
      updatedLine: line
    };
  }

  if (!allowNegative && line.tracksStock && newQtyMilli > line.stockMilli) {
    return {
      ok: false,
      error: `Stock insuficiente para ${line.description}. Disponible: ${Number(line.stockMilli) / 1000} unidades`
    };
  }

  const updatedLine: PosCartLine = {
    ...line,
    qtyMilli: newQtyMilli
  };

  const updatedLines = [...cart.lines];
  updatedLines[lineIndex] = updatedLine;

  return {
    ok: true,
    cart: { ...cart, lines: updatedLines },
    updatedLine
  };
}

/**
 * Remueve una línea del carrito y renumera las restantes.
 */
export function removeCartLinePure(cart: PosCart, lineNo: number): PosCart {
  const remaining = cart.lines.filter((l) => l.lineNo !== lineNo).map((l, idx) => ({ ...l, lineNo: idx + 1 }));
  return {
    ...cart,
    lines: remaining
  };
}

/**
 * Calcula el documento de venta completo del carrito activo de forma pura.
 */
export function calculatePosCartDocument(
  cart: PosCart,
  taxRegime: TaxRegime = 'general',
  pricesIncludeTax = true,
  cashRounding = true
): CalculatedSaleDocument {
  return calculateSaleDocument({
    lines: cart.lines.map((l) => ({
      lineNo: l.lineNo,
      description: l.description,
      unitPriceCents: l.unitPriceCents,
      qtyMilli: l.qtyMilli,
      lineDiscountCents: l.lineDiscountCents,
      taxKind: l.taxKind,
      taxRateBp: l.taxRateBp
    })),
    orderDiscountCents: cart.orderDiscountCents,
    taxRegime,
    pricesIncludeTax,
    cashRounding
  });
}
