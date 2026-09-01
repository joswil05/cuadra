import { useMemo } from 'react';
import { Badge } from '../components/ui/Badge';
import { KpiCard } from '../components/patterns/KpiCard';
import { DataState } from '../components/patterns/DataState';
import { Chart, ChartPoint } from '../components/patterns/Chart';
import {
  ReportDailyTaxContract,
  ReportMonthlyIncomeContract,
  InventoryUndefinedTaxContract
} from '../../../shared/ipc';
import { useIpcQuery } from '../hooks/useIpc';
import { useSession } from '../lib/session';
import type { DailyTaxSummaryRow, MonthlyGrossIncomeRow } from '../../../core/reports';

function money(v: bigint): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const ent = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}C$ ${ent}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/**
 * Pantalla fiscal, separada de Reportes a propósito.
 *
 * La usa otra persona (el contador) con otro ritmo (mensual), y mezclarla con
 * los reportes de gestión obligaba al dueño a filtrar mentalmente lo que le
 * sirve para decidir de lo que debe declarar.
 */
export function Taxes() {
  const { boot } = useSession();
  const regimen = boot?.company?.taxRegime ?? 'cuota_fija';

  const qIva = useIpcQuery(ReportDailyTaxContract, {});
  const qMes = useIpcQuery(ReportMonthlyIncomeContract, {});
  const qSinClasificar = useIpcQuery(InventoryUndefinedTaxContract, undefined);

  const filas = (qIva.data ?? []) as unknown as DailyTaxSummaryRow[];
  const meses = (qMes.data ?? []) as unknown as MonthlyGrossIncomeRow[];
  const sinClasificar = (qSinClasificar.data ?? []) as unknown[];

  const totales = useMemo(
    () =>
      filas.reduce(
        (acc, f) => ({
          gravada: acc.gravada + f.taxableBaseCents,
          exenta: acc.exenta + f.exemptBaseCents,
          iva: acc.iva + f.taxCents,
          total: acc.total + f.totalCents
        }),
        { gravada: 0n, exenta: 0n, iva: 0n, total: 0n }
      ),
    [filas]
  );

  const serieMensual: ChartPoint[] = meses
    .slice(-12)
    .map((m) => ({ label: m.period, valueCents: m.grossCents }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-1">Impuestos</h1>
          <p className="mt-0.5 text-xs text-text-2">
            Lo que hay que declarar ante la DGI y la alcaldía. Los números salen del libro de
            ventas, no de un cálculo aparte.
          </p>
        </div>
        <Badge variant={regimen === 'general' ? 'info' : 'neutral'}>
          {regimen === 'general' ? 'Régimen general' : 'Cuota fija'}
        </Badge>
      </div>

      {sinClasificar.length > 0 && (
        <div className="rounded-xl border border-danger bg-surface-2 px-4 py-3">
          <p className="text-sm font-semibold text-danger">
            {sinClasificar.length} producto(s) sin estatus de IVA definido
          </p>
          <p className="mt-1 text-xs text-text-2">
            Cuadra no trae ninguna lista de exentos precargada: la clasificación la define una
            persona que conoce la norma. Andá a Productos y resolvelos antes de declarar.
          </p>
        </div>
      )}

      {regimen === 'cuota_fija' ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-text-1">
            Bajo <strong>cuota fija</strong> el negocio no traslada IVA.
          </p>
          <p className="mt-1 text-xs text-text-2">
            El impuesto está conglobado en la cuota mensual, así que estas ventas no llevan
            desglose de IVA y el sistema lo impide por diseño. Lo que sí importa acá es el
            ingreso bruto mensual.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <KpiCard title="Base gravada" value={money(totales.gravada)} subValue="Ventas con IVA 15%" />
          <KpiCard title="Base exenta" value={money(totales.exenta)} subValue="Exentas y no sujetas" />
          <KpiCard title="IVA trasladado" value={money(totales.iva)} subValue="A declarar" />
          <KpiCard title="Total facturado" value={money(totales.total)} subValue="Gravada + exenta + IVA" />
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-text-1">Ingreso bruto mensual</h2>
        <p className="mb-3 text-xs text-text-3">
          Base del IMI de la alcaldía y de la declaración mensual.
        </p>
        <DataState
          loading={qMes.loading}
          error={qMes.error}
          data={serieMensual}
          isEmpty={(d) => d.length === 0}
          onRetry={() => void qMes.reload()}
          emptyTitle="Sin meses cerrados todavía"
          emptyHint="Aparece cuando haya ventas registradas."
        >
          {(serie) => <Chart points={serie} variant="bar" seriesName="Ingreso bruto mensual" />}
        </DataState>
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-1">Resumen diario de IVA</h2>
          <p className="text-xs text-text-3">Un renglón por día y tipo de documento.</p>
        </div>
        <DataState
          loading={qIva.loading}
          error={qIva.error}
          data={filas}
          isEmpty={(d) => d.length === 0}
          onRetry={() => void qIva.reload()}
          emptyTitle="Sin ventas en el período"
        >
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-2 text-xs text-text-2">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Día</th>
                    <th className="px-4 py-2.5 text-right font-medium">Docs</th>
                    <th className="px-4 py-2.5 text-right font-medium">Base gravada</th>
                    <th className="px-4 py-2.5 text-right font-medium">Base exenta</th>
                    <th className="px-4 py-2.5 text-right font-medium">IVA</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((f, i) => (
                    <tr key={`${f.day}-${f.docType}-${i}`} className="hover:bg-surface-2">
                      <td className="px-4 py-2.5 font-mono text-xs text-text-2">{f.day}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-2">
                        {f.documents}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-1">
                        {money(f.taxableBaseCents)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-2">
                        {money(f.exemptBaseCents)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-text-1">
                        {money(f.taxCents)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-1">
                        {money(f.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataState>
      </section>
    </div>
  );
}
