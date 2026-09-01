import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ImportCsvError } from '../../../../shared/ipc';

export interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (content: string) => { ok: boolean; count?: number; errors?: ImportCsvError[] };
}

export function CsvImportModal({ isOpen, onClose, onImport }: CsvImportModalProps) {
  const [csvContent, setCsvContent] = useState('');
  const [errors, setErrors] = useState<ImportCsvError[]>([]);

  const handleImport = () => {
    if (!csvContent.trim()) return;
    const res = onImport(csvContent);
    if (res.ok) {
      setErrors([]);
      onClose();
    } else if (res.errors) {
      setErrors(res.errors);
    }
  };

  const sampleCsv = `nombre,sku,precio,costo,stock,unidad,iva,codigo_barras\nCoca-Cola 600ml,BEB-COC-600,30.00,20.00,50,PZA,IVA15,7411001001\nArroz Faisan 1lb,GRA-ARR-001,20.00,15.00,100,PZA,EXENTO,7411002002`;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Importar Catálogo desde CSV"
      description="Cargue masivamente productos, precios, códigos de barra y existencias iniciales."
      maxWidth="lg"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={!csvContent.trim()}>
            Validar e Importar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-text-2">Contenido CSV (pegue aquí):</span>
          <button
            type="button"
            onClick={() => setCsvContent(sampleCsv)}
            className="text-accent hover:underline text-[11px]"
          >
            Cargar plantilla de ejemplo
          </button>
        </div>

        <textarea
          rows={7}
          value={csvContent}
          onChange={(e) => setCsvContent(e.target.value)}
          placeholder="nombre,sku,precio,costo,stock,unidad,iva,codigo_barras..."
          className="w-full bg-surface border border-border rounded-lg p-2.5 font-mono text-xs text-text-1 focus:border-accent focus:outline-none"
        />

        {errors.length > 0 && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-danger text-xs font-bold">
              <Badge variant="danger">{errors.length} errores encontrados</Badge>
              <span>No se aplicó ningún cambio a la base de datos</span>
            </div>
            <div className="max-h-36 overflow-y-auto divide-y divide-danger/10 text-xs text-danger font-mono">
              {errors.map((e, idx) => (
                <div key={idx} className="py-1">
                  Fila {e.rowNumber}: {e.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
