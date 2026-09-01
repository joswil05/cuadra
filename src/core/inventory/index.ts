export interface VariantAxisInput {
  name: string;
  values: string[];
}

export interface GeneratedVariant {
  sku: string;
  opt1Name?: string;
  opt1Value?: string;
  opt2Name?: string;
  opt2Value?: string;
  opt3Name?: string;
  opt3Value?: string;
  priceCents: bigint;
}

export interface UndefinedTaxProduct {
  id: number;
  name: string;
  sku: string;
  priceCents: bigint;
  createdAt: string;
}

export interface InventoryAdjustmentParams {
  warehouseId: number;
  variantId: number;
  direction: 'in' | 'out';
  qtyMilli: bigint;
  unitCostMicros?: bigint;
  reason: 'adjustment_in' | 'adjustment_out' | 'count' | 'waste' | 'initial';
  userId: number;
  note: string;
}

export interface KardexEntry {
  id: number;
  at: string;
  warehouseId: number;
  variantId: number;
  direction: 'in' | 'out';
  qtyMilli: bigint;
  unitCostMicros: bigint;
  totalCostCents: bigint;
  balanceQtyMilli: bigint;
  balanceAvgCostMicros: bigint;
  reason: string;
  userId: number | null;
  note: string | null;
}

function sanitizeSkuPart(str: string): string {
  return str
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9_-]/g, '');
}

/**
 * Genera la matriz de combinaciones cartesianas de variantes a partir de hasta 3 ejes (ej. Talla, Color, Presentación).
 */
export function generateVariantMatrix(
  baseSku: string,
  axes: VariantAxisInput[],
  defaultPriceCents = 0n
): GeneratedVariant[] {
  const cleanBaseSku = sanitizeSkuPart(baseSku);
  const activeAxes = axes.filter((a) => a.values.length > 0).slice(0, 3);

  if (activeAxes.length === 0) {
    return [
      {
        sku: cleanBaseSku,
        priceCents: defaultPriceCents
      }
    ];
  }

  // Producto cartesiano recursivo
  let combinations: Array<Array<{ axisName: string; value: string }>> = [[]];

  for (const axis of activeAxes) {
    const nextCombos: Array<Array<{ axisName: string; value: string }>> = [];
    for (const combo of combinations) {
      for (const val of axis.values) {
        if (val.trim()) {
          nextCombos.push([...combo, { axisName: axis.name, value: val.trim() }]);
        }
      }
    }
    combinations = nextCombos;
  }

  return combinations.map((combo) => {
    const skuParts = [cleanBaseSku, ...combo.map((c) => sanitizeSkuPart(c.value))];
    const generatedSku = skuParts.join('-');

    const variant: GeneratedVariant = {
      sku: generatedSku,
      priceCents: defaultPriceCents
    };

    if (combo[0]) {
      variant.opt1Name = combo[0].axisName;
      variant.opt1Value = combo[0].value;
    }
    if (combo[1]) {
      variant.opt2Name = combo[1].axisName;
      variant.opt2Value = combo[1].value;
    }
    if (combo[2]) {
      variant.opt3Name = combo[2].axisName;
      variant.opt3Value = combo[2].value;
    }

    return variant;
  });
}

export interface CsvProductImportRow {
  rowNumber: number;
  name: string;
  sku: string;
  priceCents: bigint;
  costMicros: bigint;
  stockMilli: bigint;
  unitCode: string;
  taxStatus?: string;
  barcode?: string;
}

export type ParseCsvRowResult =
  | { ok: true; row: CsvProductImportRow }
  | { ok: false; rowNumber: number; errors: string[] };

/**
 * Valida y parsea una fila individual de importación de catálogo CSV.
 */
export function parseProductCsvRow(
  raw: Record<string, string>,
  rowNumber: number
): ParseCsvRowResult {
  const errors: string[] = [];

  // Buscar claves con tolerancia a mayúsculas/minúsculas y acentos
  const getVal = (possibleKeys: string[]): string => {
    for (const key of Object.keys(raw)) {
      const normalized = key.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (possibleKeys.includes(normalized)) {
        return raw[key]?.trim() ?? '';
      }
    }
    return '';
  };

  const name = getVal(['nombre', 'name', 'descripcion', 'producto']);
  const sku = getVal(['sku', 'codigo', 'cod']);
  const priceStr = getVal(['precio', 'price', 'precio_venta', 'precio_cents']);
  const costStr = getVal(['costo', 'cost', 'costo_unitario']);
  const stockStr = getVal(['stock', 'cantidad', 'existencia', 'qty']);
  const unitCode = getVal(['unidad', 'unit', 'uom']) || 'PZA';
  const taxStatus = getVal(['iva', 'impuesto', 'tax', 'tax_status']);
  const barcode = getVal(['codigo_barras', 'barcode', 'codigo_barra']);

  if (!name) {
    errors.push(`Fila ${rowNumber}: El nombre del producto es obligatorio`);
  }

  if (!sku) {
    errors.push(`Fila ${rowNumber}: El SKU del producto es obligatorio`);
  }

  let priceCents = 0n;
  if (!priceStr) {
    errors.push(`Fila ${rowNumber}: El precio es obligatorio`);
  } else {
    const num = parseFloat(priceStr);
    if (isNaN(num) || num < 0) {
      errors.push(`Fila ${rowNumber}: El precio '${priceStr}' es inválido o negativo`);
    } else {
      priceCents = BigInt(Math.round(num * 100));
    }
  }

  let costMicros = 0n;
  if (costStr) {
    const num = parseFloat(costStr);
    if (isNaN(num) || num < 0) {
      errors.push(`Fila ${rowNumber}: El costo '${costStr}' es inválido o negativo`);
    } else {
      costMicros = BigInt(Math.round(num * 1_000_000));
    }
  }

  let stockMilli = 0n;
  if (stockStr) {
    const num = parseFloat(stockStr);
    if (isNaN(num) || num < 0) {
      errors.push(`Fila ${rowNumber}: El stock '${stockStr}' es inválido o negativo`);
    } else {
      stockMilli = BigInt(Math.round(num * 1000));
    }
  }

  if (errors.length > 0) {
    return { ok: false, rowNumber, errors };
  }

  return {
    ok: true,
    row: {
      rowNumber,
      name,
      sku,
      priceCents,
      costMicros,
      stockMilli,
      unitCode,
      taxStatus: taxStatus || undefined,
      barcode: barcode || undefined
    }
  };
}

/**
 * Parsea un contenido CSV de texto plano a lista de objetos por encabezado.
 */
export function parseCsvString(csvContent: string): Array<{ rowNumber: number; data: Record<string, string> }> {
  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0]!;
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));

  const rows: Array<{ rowNumber: number; data: Record<string, string> }> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const values = line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const data: Record<string, string> = {};

    headers.forEach((h, idx) => {
      data[h] = values[idx] ?? '';
    });

    rows.push({
      rowNumber: i + 1, // 1-indexed línea física del archivo
      data
    });
  }

  return rows;
}
