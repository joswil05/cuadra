import { useState, useMemo } from 'react';
import { DataView } from '../components/patterns/DataView';
import { KpiCard } from '../components/patterns/KpiCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { CustomerModal } from '../components/customers/CustomerModal';
import { CustomerPaymentModal } from '../components/customers/CustomerPaymentModal';
import { CustomerStatementDrawer } from '../components/customers/CustomerStatementDrawer';
import {
  Customer,
  CreateCustomerParams,
  CustomerStatement,
  calculateAgingBuckets
} from '../../../core/customers';

const INITIAL_CUSTOMERS: (Customer & { balanceCents: bigint })[] = [
  {
    id: 1,
    uid: 'cust-1',
    code: 'CLI-00101',
    name: 'Comercial El Ahorro',
    docType: 'RUC',
    docNumber: 'J0310000333333',
    taxRegime: 'general',
    phone: '+505 8888-9999',
    email: 'contacto@elahorro.com.ni',
    address: 'Mercado Oriental, Managua',
    creditLimitCents: 500000n, // C$ 5,000.00
    creditDays: 30,
    pointsBalance: 120n,
    isActive: true,
    balanceCents: 150000n // C$ 1,500.00 deudor
  },
  {
    id: 2,
    uid: 'cust-2',
    code: 'CLI-00102',
    name: 'Supermercado Familiar',
    docType: 'RUC',
    docNumber: 'J0310000444444',
    taxRegime: 'general',
    phone: '+505 2255-8888',
    email: 'compras@familiar.com.ni',
    address: 'Bello Horizonte, Managua',
    creditLimitCents: 1000000n, // C$ 10,000.00
    creditDays: 15,
    pointsBalance: 350n,
    isActive: true,
    balanceCents: 0n // Al día
  }
];

export function Customers() {
  const { success } = useToast();
  const [customers, setCustomers] = useState<(Customer & { balanceCents: bigint })[]>(INITIAL_CUSTOMERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedStatement, setSelectedStatement] = useState<CustomerStatement | null>(null);

  // Filtrado
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.docNumber && c.docNumber.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  // KPIs
  const totalReceivablesCents = customers.reduce((acc, c) => acc + c.balanceCents, 0n);
  const debtorsCount = customers.filter((c) => c.balanceCents > 0n).length;
  const totalLoyaltyPoints = customers.reduce((acc, c) => acc + c.pointsBalance, 0n);

  const handleSaveCustomer = (params: CreateCustomerParams) => {
    const newCust: Customer & { balanceCents: bigint } = {
      id: Date.now(),
      uid: `cust-${Date.now()}`,
      code: params.code ?? `CLI-${String(Date.now()).slice(-5)}`,
      name: params.name,
      docType: params.docType || null,
      docNumber: params.docNumber || null,
      taxRegime: params.taxRegime || null,
      phone: params.phone || null,
      email: params.email || null,
      address: params.address || null,
      creditLimitCents: params.creditLimitCents ?? 0n,
      creditDays: params.creditDays ?? 0,
      pointsBalance: 0n,
      isActive: true,
      balanceCents: 0n
    };

    setCustomers((prev) => [...prev, newCust]);
    success('Cliente registrado exitosamente', newCust.name);
  };

  const handleSavePayment = (params: {
    customerId: number;
    amountCents: bigint;
    method: 'cash' | 'card' | 'transfer' | 'check';
    note?: string;
  }) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id === params.customerId) {
          const newBal = c.balanceCents > params.amountCents ? c.balanceCents - params.amountCents : 0n;
          return { ...c, balanceCents: newBal };
        }
        return c;
      })
    );
    success('Abono a cuenta corriente registrado', `C$ ${(Number(params.amountCents) / 100).toFixed(2)}`);
  };

  const handleOpenStatement = (cust: Customer & { balanceCents: bigint }) => {
    const aging = calculateAgingBuckets([
      {
        at: new Date().toISOString(),
        dueOn: new Date().toISOString().substring(0, 10),
        amountCents: cust.balanceCents
      }
    ]);

    const statement: CustomerStatement = {
      customer: cust,
      balanceCents: cust.balanceCents,
      creditLimitCents: cust.creditLimitCents,
      availableCreditCents: cust.creditLimitCents > cust.balanceCents ? cust.creditLimitCents - cust.balanceCents : 0n,
      aging,
      entries: [
        {
          id: 1,
          uid: 'entry-1',
          customerId: cust.id,
          at: new Date().toISOString(),
          type: 'charge',
          amountCents: cust.balanceCents,
          balanceAfterCents: cust.balanceCents,
          dueOn: new Date().toISOString().substring(0, 10),
          refType: 'sale',
          refId: 101,
          shiftId: null,
          method: null,
          userId: 1,
          note: 'Saldo inicial / Venta a crédito'
        }
      ]
    };

    setSelectedStatement(statement);
  };

  const handleRedeemPoints = (customerId: number) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, pointsBalance: 0n } : c))
    );
    if (selectedStatement && selectedStatement.customer.id === customerId) {
      setSelectedStatement({
        ...selectedStatement,
        customer: { ...selectedStatement.customer, pointsBalance: 0n }
      });
    }
    success('Puntos de fidelización canjeados');
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  const tableViewNode = (
    <div className="overflow-x-auto border border-border rounded-xl bg-surface shadow-xs">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-surface-2 border-b border-border text-xs text-text-2">
          <tr>
            <th className="py-3 px-4 font-medium">Código</th>
            <th className="py-3 px-4 font-medium">Cliente</th>
            <th className="py-3 px-4 font-medium">RUC / Cédula</th>
            <th className="py-3 px-4 font-medium text-right">Límite Crédito</th>
            <th className="py-3 px-4 font-medium text-right">Saldo Deudor</th>
            <th className="py-3 px-4 font-medium text-center">Puntos</th>
            <th className="py-3 px-4 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filteredCustomers.map((c) => (
            <tr key={c.id} className="hover:bg-surface-2 transition-colors">
              <td className="py-3 px-4 font-mono text-xs text-text-3">{c.code || '—'}</td>
              <td className="py-3 px-4 font-medium text-text-1">
                <div>{c.name}</div>
                {c.phone && <div className="text-xs text-text-3 font-normal">{c.phone}</div>}
              </td>
              <td className="py-3 px-4 font-mono text-xs text-text-3">{c.docNumber || '—'}</td>
              <td className="py-3 px-4 text-right font-mono text-text-1">
                C$ {(Number(c.creditLimitCents) / 100).toFixed(2)}
              </td>
              <td className="py-3 px-4 text-right font-mono font-bold">
                <span className={c.balanceCents > 0n ? 'text-danger' : 'text-text-3'}>
                  C$ {(Number(c.balanceCents) / 100).toFixed(2)}
                </span>
              </td>
              <td className="py-3 px-4 text-center">
                <Badge variant={c.pointsBalance > 0n ? 'success' : 'neutral'}>
                  {c.pointsBalance.toString()} pts
                </Badge>
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenStatement(c)}
                  >
                    Estado de Cuenta
                  </Button>
                  {c.balanceCents > 0n && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        setIsPaymentModalOpen(true);
                      }}
                    >
                      Abonar
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const gridViewNode = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {filteredCustomers.map((c) => (
        <div
          key={c.id}
          className="p-4 bg-surface border border-border rounded-xl flex flex-col justify-between hover:border-accent transition-all shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-text-3">{c.code || 'CLI'}</span>
              <Badge variant={c.balanceCents > 0n ? 'warning' : 'success'}>
                {c.balanceCents > 0n ? 'DEUDOR' : 'AL DÍA'}
              </Badge>
            </div>
            <h4 className="font-semibold text-sm text-text-1 mt-1.5">{c.name}</h4>
            <div className="text-xs text-text-3 mt-1">
              Doc: {c.docNumber || 'Sin documento'} • Tel: {c.phone || 'Sin teléfono'}
            </div>
          </div>

          <div className="pt-3 border-t border-border mt-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-text-3">Saldo Deudor:</div>
              <div className={`text-base font-bold font-mono tabular-nums ${c.balanceCents > 0n ? 'text-danger' : 'text-text-1'}`}>
                C$ {(Number(c.balanceCents) / 100).toFixed(2)}
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleOpenStatement(c)}
            >
              Ver Cuenta
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          title="Clientes Registrados"
          value={customers.length.toString()}
          subValue={`${debtorsCount} con saldo pendiente`}
        />
        <KpiCard
          title="Cartera por Cobrar"
          value={`C$ ${(Number(totalReceivablesCents) / 100).toFixed(2)}`}
          subValue="Total cuentas por cobrar"
        />
        <KpiCard
          title="Clientes al Día"
          value={(customers.length - debtorsCount).toString()}
          subValue="Sin saldo adeudado"
        />
        <KpiCard
          title="Puntos de Fidelización"
          value={`${totalLoyaltyPoints.toString()} pts`}
          subValue="Acumulados en programa"
        />
      </div>

      {/* Barra de Herramientas */}
      <div className="flex items-center justify-between bg-surface p-3 border border-border rounded-xl shadow-xs">
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setIsCustomerModalOpen(true)}>
            + Nuevo Cliente
          </Button>
        </div>

        <div className="text-xs text-text-3">
          Total clientes: <span className="font-semibold text-text-1">{customers.length}</span>
        </div>
      </div>

      {/* DataView */}
      <DataView
        searchPlaceholder="Buscar por nombre, código o RUC/cédula..."
        onSearch={setSearchQuery}
        tableView={tableViewNode}
        gridView={gridViewNode}
      />

      {/* Modales */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSave={handleSaveCustomer}
      />

      <CustomerPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedCustomerId(null);
        }}
        customerId={selectedCustomerId ?? 1}
        customerName={selectedCustomer?.name ?? 'Cliente'}
        currentBalanceCents={selectedCustomer?.balanceCents ?? 0n}
        onSave={handleSavePayment}
      />

      <CustomerStatementDrawer
        isOpen={Boolean(selectedStatement)}
        onClose={() => setSelectedStatement(null)}
        statement={selectedStatement}
        onOpenPayment={(customerId, _currentBalanceCents) => {
          setSelectedCustomerId(customerId);
          setIsPaymentModalOpen(true);
        }}
        onRedeemPoints={handleRedeemPoints}
      />
    </div>
  );
}
