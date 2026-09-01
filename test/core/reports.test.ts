import { describe, it, expect } from 'vitest';
import {
  detectFolioGaps,
  formatReportCsv
} from '../../src/core/reports';

describe('Lógica Pura de Reportes y Exportación (core/reports)', () => {
  describe('Detección de Huecos en el Correlativo Fiscal', () => {
    it('Prueba 3: Detecta y reporta cualquier hueco en el correlativo de facturas', () => {
      const numbers = [1, 2, 3, 5, 6, 9, 10]; // Faltan 4, 7, 8
      const gaps = detectFolioGaps(numbers);

      expect(gaps).toEqual([4, 7, 8]);
    });

    it('Retorna lista vacía si la secuencia de números está completa y sin huecos', () => {
      const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const gaps = detectFolioGaps(numbers);

      expect(gaps).toEqual([]);
    });

    it('Maneja secuencias con números desordenados o duplicados correctamente', () => {
      const numbers = [5, 1, 3, 2, 1]; // Falta 4
      const gaps = detectFolioGaps(numbers);

      expect(gaps).toEqual([4]);
    });
  });

  describe('Formateo de Reportes en CSV', () => {
    it('Formatea filas y columnas a CSV estándar con escape de comillas y comas', () => {
      const headers = ['Folio', 'Cliente', 'Total C$'];
      const rows = [
        ['FAC-001', 'Comercial "El Éxito", S.A.', 150000n],
        ['FAC-002', 'Juan Pérez', 4500n]
      ];

      const csv = formatReportCsv(headers, rows);

      expect(csv).toContain('"Folio","Cliente","Total C$"');
      expect(csv).toContain('"FAC-001","Comercial ""El Éxito"", S.A.","150000"');
      expect(csv).toContain('"FAC-002","Juan Pérez","4500"');
    });
  });
});
