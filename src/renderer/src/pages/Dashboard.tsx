import { useState, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { KpiCard } from '../components/patterns/KpiCard';
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

  const DATOS_MUESTRA: OwnerDashboardData = ({
    pulse: {
      todaySalesCents: 3845000n, // C$ 38,450.00
      todayMarginCents: 1280000n, // C$ 12,800.00 (33.29%)
      todayMarginBp: 3329n,
      todayTicketsCount: 84,
      avgTicketCents: 45773n, // C$ 457.73
      cashInRegisterCents: 2450000n, // C$ 24,500.00
      cashInRegisterUsd: 15000n, // $ 150.00
      last14DaysSales: [
        { day: '18/08', salesCents: 2800000n },
        { day: '19/08', salesCents: 3100000n },
        { day: '20/08', salesCents: 2950000n },
        { day: '21/08', salesCents: 3400000n },
        { day: '22/08', salesCents: 4100000n },
        { day: '23/08', salesCents: 4600000n },
        { day: '24/08', salesCents: 3200000n },
        { day: '25/08', salesCents: 2900000n },
        { day: '26/08', salesCents: 3300000n },
        { day: '27/08', salesCents: 3150000n },
        { day: '28/08', salesCents: 3600000n },
        { day: '29/08', salesCents: 4300000n },
        { day: '30/08', salesCents: 4750000n },
        { day: '31/08', salesCents: 3845000n }
      ],
      salesVariationBp: 1250n // +12.50% vs semana pasada
    },
    actions: {
      lowStockItems: [
        { variantId: 1, sku: 'CAF-PRE-150', name: 'Café Presto 150g', stockMilli: 3000n, minStockMilli: 10000n },
        { variantId: 2, sku: 'ARR-FAI-005', name: 'Arroz Faisán 5 Lbs', stockMilli: 4000n, minStockMilli: 15000n }
      ],
      expiringLots: [
        { lotId: 1, sku: 'LAC-LECH-1L', name: 'Leche Entera La Perfecta 1L', lotNumber: 'LOT-2026-08', expiresAt: '2026-09-08', daysRemaining: 8, stockMilli: 24000n },
        { lotId: 2, sku: 'PAN-MOL-450', name: 'Pan Molde Bimbo 450g', lotNumber: 'LOT-BIM-09', expiresAt: '2026-09-15', daysRemaining: 15, stockMilli: 12000n }
      ],
      overdueCustomers: [
        { customerId: 1, name: 'Distribuidora del Norte', balanceCents: 850000n, overdueDays: 45 },
        { customerId: 2, name: 'Comercial La Bendición', balanceCents: 420000n, overdueDays: 32 }
      ],
      cashDiscrepancies: [
        { shiftId: 10, cashierName: 'Juan Cajero', diffCents: -5000n, diffUsd: 0n, at: '2026-08-30 16:00:00' }
      ],
      undefinedTaxProducts: [
        { productId: 8, name: 'Mochila Escolar Juvenil' }
      ]
    },
    trends: {
      last30DaysSales: [
        { day: '01/08', salesCents: 3200000n },
        { day: '15/08', salesCents: 4500000n },
        { day: '31/08', salesCents: 3845000n }
      ],
      topSellingProducts: [
        { variantId: 1, sku: 'ARR-FAI-005', name: 'Arroz Faisán 5 Lbs', qtySoldMilli: 450000n, revenueCents: 6750000n },
        { variantId: 2, sku: 'ACE-TRE-800', name: 'Aceite El Trébol 800ml', qtySoldMilli: 320000n, revenueCents: 4800000n },
        { variantId: 3, sku: 'CAF-PRE-150', name: 'Café Presto 150g', qtySoldMilli: 280000n, revenueCents: 3360000n }
      ],
      topMarginProducts: [
        { variantId: 3, sku: 'CAF-PRE-150', name: 'Café Presto 150g', profitCents: 1400000n, marginBp: 4166n },
        { variantId: 4, sku: 'GAL-ORE-012', name: 'Galletas Oreo Paquete 12u', profitCents: 980000n, marginBp: 4500n },
        { variantId: 1, sku: 'ARR-FAI-005', name: 'Arroz Faisán 5 Lbs', profitCents: 850000n, marginBp: 1259n }
      ]
    }
  } as OwnerDashboardData);

  // El tablero se pide al proceso principal, que ademas filtra por permiso:
  // un cajero no recibe costo ni margen, no es que la UI los oculte.
  const dashboardQuery = useIpcQuery(
    DashboardContract,
    { userId },
    DATOS_MUESTRA as unknown as never
  );
  const dashboardData = (dashboardQuery.data ?? DATOS_MUESTRA) as unknown as OwnerDashboardData;

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
          BANDA 3: LA TENDENCIA (Top 10 Venta vs Top 10 Margen)
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
