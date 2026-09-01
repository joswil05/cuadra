import { describe, it, expect } from 'vitest';
import {
  generateVariantMatrix,
  VariantAxisInput,
  parseProductCsvRow
} from '../../src/core/inventory';

describe('Lógica pura de Inventario y Catálogo (core/inventory)', () => {
  it('Prueba 1: Generar variantes de 4 tallas por 3 colores produce 12 SKU con códigos únicos', () => {
    const axes: VariantAxisInput[] = [
      { name: 'Talla', values: ['S', 'M', 'L', 'XL'] },
      { name: 'Color', values: ['Azul', 'Rojo', 'Negro'] }
    ];

    const variants = generateVariantMatrix('CAM-OXF', axes, 2500n);

    expect(variants.length).toBe(12);

    // Verificar que todos los SKU sean únicos
    const skus = new Set(variants.map((v) => v.sku));
    expect(skus.size).toBe(12);

    // Verificar estructura de opciones
    expect(variants[0]).toMatchObject({
      sku: 'CAM-OXF-S-AZUL',
      opt1Name: 'Talla',
      opt1Value: 'S',
      opt2Name: 'Color',
      opt2Value: 'Azul',
      priceCents: 2500n
    });

    expect(variants[11]).toMatchObject({
      sku: 'CAM-OXF-XL-NEGRO',
      opt1Name: 'Talla',
      opt1Value: 'XL',
      opt2Name: 'Color',
      opt2Value: 'Negro',
      priceCents: 2500n
    });
  });

  it('Valida y parsea filas de CSV de importación de productos correctamente', () => {
    const rawRow: Record<string, string> = {
      nombre: 'Arroz Faisán 1lb',
      sku: 'GRA-ARR-001',
      precio: '25.50',
      costo: '18.00',
      stock: '50',
      unidad: 'PZA',
      iva: 'EXENTO',
      codigo_barras: '7411002002'
    };

    const parsed = parseProductCsvRow(rawRow, 2);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.row.name).toBe('Arroz Faisán 1lb');
    expect(parsed.row.sku).toBe('GRA-ARR-001');
    expect(parsed.row.priceCents).toBe(2550n);
    expect(parsed.row.costMicros).toBe(18000000n);
    expect(parsed.row.stockMilli).toBe(50000n);
    expect(parsed.row.taxStatus).toBe('EXENTO');
    expect(parsed.row.barcode).toBe('7411002002');
  });

  it('Detecta errores de validación en fila CSV (precios negativos, formato inválido)', () => {
    const rawRowInvalid: Record<string, string> = {
      nombre: '',
      sku: '',
      precio: '-10.00',
      costo: 'abc',
      stock: '-5'
    };

    const parsed = parseProductCsvRow(rawRowInvalid, 5);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    expect(parsed.errors.length).toBeGreaterThanOrEqual(3);
    expect(parsed.errors.some((e) => e.includes('nombre'))).toBe(true);
    expect(parsed.errors.some((e) => e.includes('SKU'))).toBe(true);
    expect(parsed.errors.some((e) => e.includes('precio'))).toBe(true);
  });
});
