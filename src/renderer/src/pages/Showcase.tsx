import { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Drawer,
  Dialog,
  useToast,
  Skeleton,
  EmptyState,
  Badge,
  Kbd
} from '../components/ui';
import { KpiCard, DataView, AuthPrompt } from '../components/patterns';
import { useTheme } from '../hooks/useTheme';

export function Showcase() {
  const { theme, setTheme, density, setDensity } = useTheme();
  const { success, error, warning, info } = useToast();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authSuccessMessage, setAuthSuccessMessage] = useState('');

  const sampleProducts = [
    { id: 1, sku: 'BEB-COC-600', name: 'Coca-Cola 600ml', stock: '98.000', cost: 'C$20.00', price: 'C$30.00', status: 'normal' },
    { id: 2, sku: 'GRA-ARR-001', name: 'Arroz Faisán 1lb', stock: '100.000', cost: 'C$15.00', price: 'C$20.00', status: 'normal' },
    { id: 3, sku: 'LAC-LEC-001', name: 'Leche Eskimo 1L', stock: '4.000', cost: 'C$32.00', price: 'C$42.00', status: 'low' },
    { id: 4, sku: 'ACE-COC-001', name: 'Aceite Corona 800ml', stock: '0.000', cost: 'C$45.00', price: 'C$58.00', status: 'out' }
  ];

  const handleAuthorize = async (pin: string) => {
    if (pin === '1234') {
      setAuthSuccessMessage('Autorización concedida con éxito');
      success('Acción autorizada por supervisor', 'Autorizado');
      return true;
    }
    return false;
  };

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Introduction */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-text-1">Sistema de Diseño Cuadra</h2>
        <p className="text-xs text-text-2 max-w-2xl">
          Vocabulario visual y componentes de alta densidad para ERP y Punto de Venta de escritorio.
          Paleta basada en Zinc, tipografía con cifras tabulares y tres modos de densidad ergonómica.
        </p>

        {/* Live Switchers */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <div className="flex items-center gap-2 border border-border rounded-md bg-surface p-1 text-xs">
            <span className="text-text-3 font-medium px-1">Tema:</span>
            <Button
              variant={theme === 'light' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('light')}
            >
              Claro
            </Button>
            <Button
              variant={theme === 'dark' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('dark')}
            >
              Oscuro
            </Button>
            <Button
              variant={theme === 'system' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('system')}
            >
              Sistema
            </Button>
          </div>

          <div className="flex items-center gap-2 border border-border rounded-md bg-surface p-1 text-xs">
            <span className="text-text-3 font-medium px-1">Densidad:</span>
            <Button
              variant={density === 'compact' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setDensity('compact')}
            >
              Compacta (28px)
            </Button>
            <Button
              variant={density === 'comfortable' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setDensity('comfortable')}
            >
              Cómoda (34px)
            </Button>
            <Button
              variant={density === 'spacious' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setDensity('spacious')}
            >
              Amplia (42px)
            </Button>
          </div>
        </div>
      </div>

      {/* 1. KPIs */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-1 border-b border-border pb-1">1. Tarjetas de Métricas (KPIs)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            title="Ventas del Día"
            value="C$ 48,250.00"
            subValue="38 tickets emitidos"
            badgeText="+12.4%"
            badgeVariant="success"
          />
          <KpiCard
            title="Efectivo en Caja"
            value="C$ 12,380.00"
            subValue="USD en caja: $ 150.00"
            badgeText="Cuadrada"
            badgeVariant="info"
          />
          <KpiCard
            title="Cuentas por Cobrar"
            value="C$ 145,800.00"
            subValue="4 clientes vencidos"
            badgeText="Alerta"
            badgeVariant="warning"
          />
          <KpiCard
            title="Margen Bruto Promedio"
            value="34.8 %"
            subValue="Costo total: C$ 31,450.00"
            badgeText="Sano"
            badgeVariant="neutral"
          />
        </div>
      </section>

      {/* 2. Primitivos de Botones e Insignias */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-1 border-b border-border pb-1">2. Botones, Insignias y Teclas (Kbd)</h3>
        <div className="p-4 bg-surface border border-border rounded-lg flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primario (F12)</Button>
            <Button variant="secondary">Secundario</Button>
            <Button variant="outline">Contorno</Button>
            <Button variant="ghost">Fantasma</Button>
            <Button variant="danger">Peligro / Anular</Button>
            <Button variant="primary" isLoading>Cargando</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
            <span className="text-xs text-text-3 font-medium">Tamaños:</span>
            <Button size="sm" variant="secondary">Pequeño (28px)</Button>
            <Button size="md" variant="secondary">Mediano (34px)</Button>
            <Button size="lg" variant="secondary">Grande (42px)</Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            <span className="text-xs text-text-3 font-medium">Insignias:</span>
            <Badge variant="success">Stock Sano</Badge>
            <Badge variant="warning">Stock Bajo</Badge>
            <Badge variant="danger">Faltante de Caja</Badge>
            <Badge variant="info">Cuota Fija</Badge>
            <Badge variant="neutral">Ticket Normal</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            <span className="text-xs text-text-3 font-medium">Atajos de Teclado:</span>
            <Kbd>F1</Kbd>
            <Kbd>F12 Cobrar</Kbd>
            <Kbd>Ctrl+K</Kbd>
            <Kbd>Esc</Kbd>
          </div>
        </div>
      </section>

      {/* 3. Formulario y Entradas */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-1 border-b border-border pb-1">3. Campos de Entrada (Input / Select)</h3>
        <div className="p-4 bg-surface border border-border rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Código o Nombre de Producto" placeholder="Escanee código de barras..." />
          <Input label="Cantidad (milli)" defaultValue="1.000" className="tabular-nums" />
          <Select label="Régimen Fiscal" options={[{ value: 'general', label: 'Régimen General (IVA 15%)' }, { value: 'cuota_fija', label: 'Cuota Fija (Exento)' }]} />
          <Input label="Campo con Error" error="El importe excede el límite permitido" defaultValue="999999" />
          <Input label="Descuento Autorizado" helperText="Requiere autorización si supera el 10%" placeholder="C$ 0.00" />
          <Input label="Campo Deshabilitado" disabled defaultValue="Solo lectura" />
        </div>
      </section>

      {/* 4. Tablas con Densidad Dinámica */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-border pb-1">
          <h3 className="text-sm font-semibold text-text-1">4. Tabla de Datos (Alineación monetaria y densidad actual: {density})</h3>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead align="right">Stock</TableHead>
              <TableHead align="right">Costo CPP</TableHead>
              <TableHead align="right">Precio Unit.</TableHead>
              <TableHead align="center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleProducts.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs text-text-2">{p.sku}</TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell isNumeric>{p.stock}</TableCell>
                <TableCell isNumeric className="text-text-2">{p.cost}</TableCell>
                <TableCell isNumeric className="font-semibold">{p.price}</TableCell>
                <TableCell align="center">
                  <Badge variant={p.status === 'out' ? 'danger' : p.status === 'low' ? 'warning' : 'success'}>
                    {p.status === 'out' ? 'Agotado' : p.status === 'low' ? 'Bajo' : 'Disponible'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* 5. Patrón DataView */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-1 border-b border-border pb-1">5. Patrón DataView (Alternador Tabla / Cuadrícula)</h3>
        <DataView
          title="Catálogo de Productos"
          tableView={
            <div className="p-4 bg-surface border border-border rounded-lg text-xs text-text-2">
              (Vista tabular de catálogo con 4 productos)
            </div>
          }
          gridView={
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {sampleProducts.map((p) => (
                <div key={p.id} className="p-3 bg-surface border border-border rounded-lg flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-semibold text-text-1">{p.name}</div>
                    <div className="text-[11px] font-mono text-text-3">{p.sku}</div>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-xs font-bold text-text-1 tabular-nums">{p.price}</span>
                    <span className="text-[10px] text-text-3 tabular-nums">Stock: {p.stock}</span>
                  </div>
                </div>
              ))}
            </div>
          }
        />
      </section>

      {/* 6. Capas Flotantes (Modales, Cajones, Toasts, Autorización) */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-1 border-b border-border pb-1">6. Capas Flotantes, Modales y Notificaciones</h3>
        <div className="p-4 bg-surface border border-border rounded-lg flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>Abrir Cajón Lateral (Drawer)</Button>
          <Button variant="secondary" onClick={() => setIsDialogOpen(true)}>Abrir Diálogo (Dialog)</Button>
          <Button variant="secondary" onClick={() => setIsAuthOpen(true)}>Pedir Autorización de Supervisor</Button>

          <div className="flex items-center gap-2 border-l border-border pl-3">
            <Button variant="ghost" size="sm" onClick={() => success('Venta #T-00014 registrada con éxito')}>Toast Éxito</Button>
            <Button variant="ghost" size="sm" onClick={() => error('No hay suficiente efectivo en córdobas')}>Toast Error</Button>
            <Button variant="ghost" size="sm" onClick={() => warning('Arqueo de caja con diferencia detectada')}>Toast Aviso</Button>
            <Button variant="ghost" size="sm" onClick={() => info('Turno de caja iniciado')}>Toast Info</Button>
          </div>
        </div>

        {authSuccessMessage && (
          <div className="p-3 bg-success/10 text-success border border-success/30 rounded-md text-xs font-medium">
            {authSuccessMessage}
          </div>
        )}
      </section>

      {/* 7. Estados de Carga y Vacío */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-1 border-b border-border pb-1">7. Placeholders (Skeleton) y Estados Vacíos (EmptyState)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-surface border border-border rounded-lg flex flex-col gap-2.5">
            <span className="text-xs font-medium text-text-2">Esqueleto de Carga:</span>
            <Skeleton height={20} className="w-1/3" />
            <Skeleton height={14} className="w-full" />
            <Skeleton height={14} className="w-4/5" />
            <Skeleton height={32} className="w-full mt-2" />
          </div>

          <EmptyState
            title="Sin movimientos registrados"
            description="No se han registrado operaciones en el período seleccionado. Inicie una venta en el POS."
            action={<Button size="sm">Ir al Punto de Venta (Ctrl+1)</Button>}
          />
        </div>
      </section>

      {/* Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Detalles del Producto"
        footer={<Button size="sm" onClick={() => setIsDrawerOpen(false)}>Cerrar</Button>}
      >
        <div className="flex flex-col gap-3 text-xs text-text-2">
          <p>Información detallada del producto seleccionado, historial de compras y lotes vigentes.</p>
          <div className="p-3 bg-surface-2 rounded-md font-mono text-xs">
            SKU: BEB-COC-600<br />
            Costo Promedio: C$ 20.000000<br />
            Stock Actual: 98.000 unidades
          </div>
        </div>
      </Drawer>

      {/* Dialog */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Confirmar Cierre de Turno"
        description="Esta acción cerrará el turno actual y calculará las diferencias de arqueo."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={() => { setIsDialogOpen(false); success('Turno cerrado correctamente'); }}>Confirmar</Button>
          </>
        }
      >
        <div className="text-xs text-text-2">
          Asegúrese de haber completado el conteo de billetes y monedas en córdobas y dólares antes de proceder.
        </div>
      </Dialog>

      {/* Auth Prompt */}
      <AuthPrompt
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthorize={handleAuthorize}
        reason="Autorizar descuento de cortesía del 15%."
      />
    </div>
  );
}
