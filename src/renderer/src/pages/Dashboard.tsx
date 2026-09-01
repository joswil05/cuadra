import { useState, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { KpiCard } from '../components/patterns/KpiCard';
import { DataState } from '../components/patterns/DataState';
import { Chart, ChartPoint } from '../components/patterns/Chart';
import { OwnerDashboardData } from '../../../core/dashboard';
import { DashboardContract } from '../../../shared/ipc';
import { useIpcQuery } from '../hooks/useIpc';
import { useSession } from '../lib/session';

interface DashboardProps {
  onNavigateToPurchases?: () => void;
  onNavigateToInventory?: () => void;
  onNavigateToCustomers?: () => void;
  onNavigateToReports?: () => void;
}

export function Dashboard({
  onNavigateToPurchases,
  onNavigateToInventory,
  onNavigateToCustomers,
  onNavigateToReports
}: DashboardProps) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const { userId } = useSession();

  
  // El tablero se pide al proceso principal, que ademas filtra por permiso:
  // un cajero no recibe costo ni margen, no es que la UI los oculte.
  const dashboardQuery = useIpcQuery(DashboardContract, { userId });

  return (
    <DataState
      loading={dashboardQuery.loading}
      error={dashboardQuery.error}
      data={dashboardQuery.data as OwnerDashboardData | null}
      onRetry={() => void dashboardQuery.reload()}
      emptyTitle="Todavía no hay actividad que resumir"
      emptyHint="El resumen aparece cuando se registre la primera venta del día."
    >
      {(datos) => (
        <DashboardContenido
          data={datos}
          period={period}
          setPeriod={setPeriod}
          onNavigateToPurchases={onNavigateToPurchases}
          onNavigateToInventory={onNavigateToInventory}
          onNavigateToCustomers={onNavigateToCustomers}
          onNavigateToReports={onNavigateToReports}
        />
      )}
    </DataState>
  );
}

interface ContenidoProps extends DashboardProps {
  data: OwnerDashboardData;
  period: 'today' | 'week' | 'month';
  setPeriod: (p: 'today' | 'week' | 'month') => void;
}

function DashboardContenido({
  data: dashboardData,
  period,
  setPeriod,
  onNavigateToPurchases,
  onNavigateToInventory,
  onNavigateToCustomers,
  onNavigateToReports
}: ContenidoProps) {
  const { pulse, actions, trends } = dashboardData;

  const totalActionsCount = useMemo(() => {
    return (
      actions.lowStockItems.length +
      actions.expiringLots.length +
      actions.overdueCustomers.length +
      actions.cashDiscrepancies.length +
      actions.undefinedTaxProducts.length
    );
  }, [actions]);

  return (
    <div className="flex flex-col gap-5 p-5 h-full overflow-y-auto font-sans">
      {/* Cabecera y Filtro Global de Periodo */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-text-1">Panel del Dueño</h1>
            <Badge variant="info">Modo Propietario</Badge>
            {totalActionsCount > 0 && (
              <Badge variant="warning">{totalActionsCount} Avisos pendientes</Badge>
            )}
          </div>
          <p className="text-xs text-text-2">
            El pulso del negocio, decisiones operativas críticas y análisis de rentabilidad real
          </p>
        </div>

        <div className="flex gap-1.5 bg-surface-2 p-1 rounded-lg border border-border">
          <Button
            variant={period === 'today' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setPeriod('today')}
          >
            Hoy
          </Button>
          <Button
            variant={period === 'week' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setPeriod('week')}
          >
            Esta Semana
          </Button>
          <Button
            variant={period === 'month' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setPeriod('month')}
          >
            Este Mes
          </Button>
        </div>
      </div>

      {/* =======================================================================
          BANDA 1: EL PULSO DE HOY (4 Tarjetas KPI con variación y sparkline)
          ======================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 1. Venta del Día */}
        <div className="flex flex-col">
          <KpiCard
            title="Venta del Día"
            value={`C$ ${(Number(pulse.todaySalesCents) / 100).toLocaleString('es-NI', { minimumFractionDigits: 2 })}`}
            subValue="vs. mismo día semana pasada"
            badgeText={pulse.salesVariationBp >= 0n ? `+${(Number(pulse.salesVariationBp) / 100).toFixed(1)}%` : `${(Number(pulse.salesVariationBp) / 100).toFixed(1)}%`}
            badgeVariant={pulse.salesVariationBp >= 0n ? 'success' : 'danger'}
          />
        </div>

        {/* 2. Margen del Día */}
        <div className="flex flex-col">
          <KpiCard
            title="Margen Bruto"
            value={pulse.todayMarginCents !== undefined ? `C$ ${(Number(pulse.todayMarginCents) / 100).toLocaleString('es-NI', { minimumFractionDigits: 2 })}` : 'Censurado'}
            subValue={pulse.todayMarginBp !== undefined ? `Rentabilidad: ${(Number(pulse.todayMarginBp) / 100).toFixed(1)}%` : 'Sin permisos'}
            badgeText={pulse.todayMarginBp !== undefined ? `${(Number(pulse.todayMarginBp) / 100).toFixed(1)}%` : 'PRIVADO'}
            badgeVariant={pulse.todayMarginBp !== undefined ? 'success' : 'neutral'}
          />
        </div>

        {/* 3. Tickets y Ticket Promedio */}
        <div className="flex flex-col">
          <KpiCard
            title="Tickets Emitidos"
            value={`${pulse.todayTicketsCount} ventas`}
            subValue={`Ticket promedio: C$ ${(Number(pulse.avgTicketCents) / 100).toFixed(2)}`}
            badgeText="En curso"
            badgeVariant="neutral"
          />
        </div>

        {/* 4. Efectivo en Caja Ahora Mismo */}
        <div className="flex flex-col">
          <KpiCard
            title="Efectivo en Caja"
            value={`C$ ${(Number(pulse.cashInRegisterCents) / 100).toLocaleString('es-NI', { minimumFractionDigits: 2 })}`}
            subValue={`Dólares en cajón: $ ${(Number(pulse.cashInRegisterUsd) / 100).toFixed(2)}`}
            badgeText="Arqueado"
            badgeVariant="success"
          />
        </div>
      </div>

      {/* =======================================================================
          BANDA 2: LO QUE NECESITA UNA DECISIÓN (Avisos y Acciones Directas)
          ======================================================================= */}
      <div className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-text-1">Alertas y Acciones Prioritarias</h2>
            <p className="text-xs text-text-3">Situaciones operativas que requieren decisión inmediata del dueño</p>
          </div>
          <Badge variant={totalActionsCount === 0 ? 'success' : 'warning'}>
            {totalActionsCount === 0 ? 'TODO AL DÍA' : `${totalActionsCount} PENDIENTES`}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {/* 1. Stock Bajo */}
          {actions.lowStockItems.length > 0 && (
            <div className="p-3 bg-surface-2 border border-border rounded-lg flex flex-col justify-between gap-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold text-danger">Stock Bajo el Mínimo</span>
                  <div className="text-text-2 mt-0.5">{actions.lowStockItems.length} artículos en riesgo de agotarse</div>
                </div>
                <Badge variant="danger">Crítico</Badge>
              </div>
              <div className="text-text-3 font-mono">
                {actions.lowStockItems.slice(0, 2).map((item) => (
                  <div key={item.variantId} className="truncate">
                    • {item.name} ({Number(item.stockMilli) / 1000} / {Number(item.minStockMilli) / 1000} u)
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-1"
                onClick={onNavigateToPurchases}
              >
                Crear Orden de Compra
              </Button>
            </div>
          )}

          {/* 2. Lotes por Vencer */}
          {actions.expiringLots.length > 0 && (
            <div className="p-3 bg-surface-2 border border-border rounded-lg flex flex-col justify-between gap-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold text-warning">Caducidades Próximas</span>
                  <div className="text-text-2 mt-0.5">{actions.expiringLots.length} lotes por vencer en ≤ 30 días</div>
                </div>
                <Badge variant="warning">FEFO</Badge>
              </div>
              <div className="text-text-3 font-mono">
                {actions.expiringLots.slice(0, 2).map((lot) => (
                  <div key={lot.lotId} className="truncate">
                    • {lot.name} ({lot.daysRemaining} días restantes)
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-1"
                onClick={onNavigateToInventory}
              >
                Ver Lotes en Inventario
              </Button>
            </div>
          )}

          {/* 3. Cartera Vencida */}
          {actions.overdueCustomers.length > 0 && (
            <div className="p-3 bg-surface-2 border border-border rounded-lg flex flex-col justify-between gap-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold text-text-1">Cuentas por Cobrar Vencidas</span>
                  <div className="text-text-2 mt-0.5">{actions.overdueCustomers.length} clientes en mora</div>
                </div>
                <Badge variant="warning">Cobranza</Badge>
              </div>
              <div className="text-text-3 font-mono">
                {actions.overdueCustomers.slice(0, 2).map((c) => (
                  <div key={c.customerId} className="truncate">
                    • {c.name} (C$ {(Number(c.balanceCents) / 100).toFixed(2)})
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-1"
                onClick={onNavigateToCustomers}
              >
                Ver Estados de Cuenta
              </Button>
            </div>
          )}

          {/* 4. Descuadres de Caja */}
          {actions.cashDiscrepancies.length > 0 && (
            <div className="p-3 bg-surface-2 border border-border rounded-lg flex flex-col justify-between gap-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold text-danger">Diferencia de Arqueo</span>
                  <div className="text-text-2 mt-0.5">{actions.cashDiscrepancies.length} turnos cerrados con faltante</div>
                </div>
                <Badge variant="danger">Auditoría</Badge>
              </div>
              <div className="text-text-3 font-mono">
                {actions.cashDiscrepancies.map((d, i) => (
                  <div key={i} className="truncate">
                    • {d.cashierName}: C$ {(Number(d.diffCents) / 100).toFixed(2)}
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-1"
                onClick={onNavigateToReports}
              >
                Auditar Turnos
              </Button>
            </div>
          )}

          {/* 5. Productos sin IVA en Régimen General */}
          {actions.undefinedTaxProducts.length > 0 && (
            <div className="p-3 bg-surface-2 border border-border rounded-lg flex flex-col justify-between gap-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold text-text-1">Revisión de IVA DGI</span>
                  <div className="text-text-2 mt-0.5">{actions.undefinedTaxProducts.length} productos sin estatus fiscal</div>
                </div>
                <Badge variant="neutral">Fiscal</Badge>
              </div>
              <div className="text-text-3 font-mono">
                {actions.undefinedTaxProducts.map((p) => (
                  <div key={p.productId} className="truncate">
                    • {p.name}
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-1"
                onClick={onNavigateToInventory}
              >
                Asignar Tasa de IVA
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* =======================================================================
          BANDA 3: LA TENDENCIA
          ======================================================================= */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-1">Ventas de los últimos 30 días</h3>
            <p className="text-xs text-text-3">
              Señalá un día para ver su importe exacto. El eje arranca en cero.
            </p>
          </div>
          <Badge variant="neutral">30 días</Badge>
        </div>
        <Chart
          points={
            (trends.last30DaysSales ?? []).map((d) => ({
              label: d.day,
              valueCents: d.salesCents
            })) as ChartPoint[]
          }
          height={200}
          seriesName="Ventas diarias"
        />
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-1">Pulso de los últimos 14 días</h3>
            <p className="text-xs text-text-3">Comparación corta, para ver la semana en curso.</p>
          </div>
          <Badge variant="neutral">14 días</Badge>
        </div>
        <Chart
          points={
            (pulse.last14DaysSales ?? []).map((d) => ({
              label: d.day,
              valueCents: d.salesCents
            })) as ChartPoint[]
          }
          height={140}
          variant="bar"
          seriesName="Ventas diarias"
        />
      </section>

      {/* =======================================================================
          BANDA 4: TOP 10 VENTA VS TOP 10 MARGEN
          ======================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top 10 más vendidos por volumen */}
        <div className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-text-1">Top Productos Más Vendidos</h3>
              <p className="text-xs text-text-3">Mayor rotación e ingresos brutos generados</p>
            </div>
            <Badge variant="neutral">Volumen</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-text-2 font-sans font-medium">
                  <th className="py-2 px-2.5">Producto</th>
                  <th className="py-2 px-2.5 text-right">Cant. Vendida</th>
                  <th className="py-2 px-2.5 text-right">Ingresos (C$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trends.topSellingProducts.map((item, idx) => (
                  <tr key={item.variantId} className="hover:bg-surface-2 transition-colors">
                    <td className="py-2 px-2.5 text-text-1 font-sans truncate max-w-[200px]">
                      <span className="font-semibold text-text-3 mr-1.5">{idx + 1}.</span>
                      {item.name}
                    </td>
                    <td className="py-2 px-2.5 text-right text-text-2">
                      {(Number(item.qtySoldMilli) / 1000).toFixed(0)} u
                    </td>
                    <td className="py-2 px-2.5 text-right text-text-1 font-semibold">
                      {(Number(item.revenueCents) / 100).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top 10 mayor margen de ganancia */}
        <div className="p-4 bg-surface border border-border rounded-xl flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-text-1">Top Productos con Mayor Ganancia</h3>
              <p className="text-xs text-text-3">Artículos que más córdobas de margen neto aportan</p>
            </div>
            <Badge variant="success">Rentabilidad</Badge>
          </div>

          {trends.topMarginProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-text-2 font-sans font-medium">
                    <th className="py-2 px-2.5">Producto</th>
                    <th className="py-2 px-2.5 text-right">Ganancia (C$)</th>
                    <th className="py-2 px-2.5 text-right">Margen (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {trends.topMarginProducts.map((item, idx) => (
                    <tr key={item.variantId} className="hover:bg-surface-2 transition-colors">
                      <td className="py-2 px-2.5 text-text-1 font-sans truncate max-w-[200px]">
                        <span className="font-semibold text-text-3 mr-1.5">{idx + 1}.</span>
                        {item.name}
                      </td>
                      <td className="py-2 px-2.5 text-right text-success font-semibold">
                        {(Number(item.profitCents) / 100).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        <Badge variant="success">{(Number(item.marginBp) / 100).toFixed(1)}%</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-text-3 bg-surface-2 rounded-lg border border-border">
              Información confidencial de costos protegida por permisos de seguridad.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
