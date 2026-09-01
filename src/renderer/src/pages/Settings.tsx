import { Badge } from '../components/ui/Badge';
import { useSession } from '../lib/session';

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="text-xs text-text-2">{etiqueta}</span>
      <span className="text-right text-xs font-medium text-text-1">{valor || '—'}</span>
    </div>
  );
}

/**
 * Configuración: identidad fiscal, política tributaria y respaldo.
 *
 * Va al pie de la barra y fuera del flujo diario porque se toca una vez al
 * instalar y casi nunca más. Los datos se muestran en solo lectura: cambiar el
 * RUC o el régimen a mitad de un período altera cómo se calculó lo ya
 * facturado, así que no es una edición de formulario.
 */
export function Settings() {
  const { boot } = useSession();
  const empresa = boot?.company;
  const regimen = empresa?.taxRegime ?? 'cuota_fija';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-text-1">Configuración</h1>
        <p className="mt-0.5 text-xs text-text-2">
          Identidad del negocio y políticas que afectan cómo se calcula cada documento.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-1">Identidad fiscal</h2>
          <Badge variant="neutral">Solo lectura</Badge>
        </div>
        <p className="mb-3 text-xs text-text-3">
          Estos datos se imprimen en cada factura. Se fijaron en el primer arranque.
        </p>
        <Campo etiqueta="Razón social" valor={empresa?.legalName ?? ''} />
        <Campo etiqueta="Nombre comercial" valor={empresa?.tradeName ?? ''} />
        <Campo etiqueta="RUC" valor={empresa?.ruc ?? ''} />
        <Campo etiqueta="Dirección" valor={empresa?.address ?? ''} />
        <Campo etiqueta="Teléfono" valor={empresa?.phone ?? ''} />
        <Campo etiqueta="Autorización DGI" valor={empresa?.dgiAuthNumber ?? ''} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-1">Régimen tributario</h2>
        <div className="flex items-center gap-2">
          <Badge variant={regimen === 'general' ? 'info' : 'neutral'}>
            {regimen === 'general' ? 'Régimen general' : 'Cuota fija'}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-text-2">
          {regimen === 'general'
            ? 'Las ventas se desglosan con IVA del 15% y separan base gravada de exenta.'
            : 'El IVA está conglobado en la cuota mensual, así que ninguna venta lo traslada. La base de datos rechaza un documento con IVA bajo este régimen.'}
        </p>
        <p className="mt-2 text-[11px] text-text-3">
          Cambiar el régimen afecta cómo se calculan los documentos nuevos, nunca los ya
          emitidos: cada venta guarda congelado el régimen con el que se hizo.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-1">Respaldo</h2>
        <p className="text-xs text-text-2">
          La base vive en un solo archivo en esta computadora. Un respaldo verificado es la única
          defensa contra un disco que falla.
        </p>
        <p className="mt-2 text-[11px] text-text-3">
          El servicio de respaldo está construido y probado (copia en caliente más
          <span className="font-mono"> PRAGMA integrity_check</span>), pero todavía no tiene canal
          IPC ni selector de archivo. Hasta que lo tenga, copiá manualmente la carpeta
          <span className="font-mono"> %APPDATA%\Cuadra</span> con la aplicación cerrada.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-1">Permisos de esta sesión</h2>
        {boot?.permissions.length ? (
          <div className="flex flex-wrap gap-1.5">
            {boot.permissions.map((p) => (
              <span
                key={p}
                className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-2"
              >
                {p}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-3">Sin permisos declarados.</p>
        )}
      </section>
    </div>
  );
}
