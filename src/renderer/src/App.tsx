import { useState } from 'react';
import { ToastProvider, useToast } from './components/ui/Toast';
import { Shell } from './components/layout/Shell';
import { CommandPalette, CommandItem } from './components/patterns/CommandPalette';
import { Showcase } from './pages/Showcase';
import { Pos } from './pages/Pos';
import { Inventory } from './pages/Inventory';
import { Purchases } from './pages/Purchases';
import { Customers } from './pages/Customers';
import { Reports } from './pages/Reports';
import { Dashboard } from './pages/Dashboard';
import { useShortcuts } from './hooks/useShortcuts';

function AppContent() {
  const [activeNavId, setActiveNavId] = useState('showcase');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const { info } = useToast();

  const commands: CommandItem[] = [
    {
      id: 'nav-pos',
      title: 'Ir al Punto de Venta',
      category: 'Navegación',
      shortcut: 'Ctrl+1',
      onSelect: () => setActiveNavId('pos')
    },
    {
      id: 'nav-inventory',
      title: 'Ir a Inventario y Kardex',
      category: 'Navegación',
      shortcut: 'Ctrl+2',
      onSelect: () => setActiveNavId('inventory')
    },
    {
      id: 'nav-purchases',
      title: 'Ir a Compras y Proveedores',
      category: 'Navegación',
      shortcut: 'Ctrl+3',
      onSelect: () => setActiveNavId('purchases')
    },
    {
      id: 'nav-customers',
      title: 'Ir a Clientes y Cuentas por Cobrar',
      category: 'Navegación',
      shortcut: 'Ctrl+4',
      onSelect: () => setActiveNavId('customers')
    },
    {
      id: 'nav-reports',
      title: 'Ir a Reportes',
      category: 'Navegación',
      shortcut: 'Ctrl+5',
      onSelect: () => setActiveNavId('reports')
    },
    {
      id: 'nav-dashboard',
      title: 'Ir al Panel del Dueño',
      category: 'Navegación',
      shortcut: 'Ctrl+6',
      onSelect: () => setActiveNavId('dashboard')
    },
    {
      id: 'nav-showcase',
      title: 'Ver Sistema de Diseño',
      category: 'Navegación',
      shortcut: 'Ctrl+7',
      onSelect: () => setActiveNavId('showcase')
    },
    {
      id: 'action-shift-close',
      title: 'Arqueo y Cierre de Turno',
      category: 'Caja',
      shortcut: 'F10',
      onSelect: () => info('Abriendo arqueo de turno...')
    }
  ];

  useShortcuts({
    'Ctrl+K': () => setIsCommandPaletteOpen(true),
    'Ctrl+1': () => setActiveNavId('pos'),
    'Ctrl+2': () => setActiveNavId('inventory'),
    'Ctrl+3': () => setActiveNavId('purchases'),
    'Ctrl+4': () => setActiveNavId('customers'),
    'Ctrl+5': () => setActiveNavId('reports'),
    'Ctrl+6': () => setActiveNavId('dashboard'),
    'Ctrl+7': () => setActiveNavId('showcase')
  });

  const renderActiveView = () => {
    switch (activeNavId) {
      case 'pos':
        return <Pos />;
      case 'inventory':
        return <Inventory />;
      case 'purchases':
        return <Purchases />;
      case 'customers':
        return <Customers />;
      case 'reports':
        return <Reports />;
      case 'dashboard':
        return (
          <Dashboard
            onNavigateToPurchases={() => setActiveNavId('purchases')}
            onNavigateToInventory={() => setActiveNavId('inventory')}
            onNavigateToCustomers={() => setActiveNavId('customers')}
            onNavigateToReports={() => setActiveNavId('reports')}
          />
        );
      case 'showcase':
        return <Showcase />;
      default:
        return (
          <div className="flex flex-col gap-4">
            <div className="p-6 bg-surface border border-border rounded-xl">
              <h2 className="text-base font-semibold text-text-1 mb-2">Módulo: {activeNavId.toUpperCase()}</h2>
              <p className="text-xs text-text-2">
                Este módulo se implementará en su fase correspondiente del Plan Maestro.
              </p>
            </div>
            <Showcase />
          </div>
        );
    }
  };

  return (
    <Shell
      activeNavId={activeNavId}
      onNavigate={setActiveNavId}
      onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
    >
      {renderActiveView()}

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commands}
      />
    </Shell>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
