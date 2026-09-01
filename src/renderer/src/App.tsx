import { useState } from 'react';
import { ToastProvider } from './components/ui/Toast';
import { Shell } from './components/layout/Shell';
import { CommandPalette, CommandItem } from './components/patterns/CommandPalette';
import { Showcase } from './pages/Showcase';
import { Pos } from './pages/Pos';
import { Inventory } from './pages/Inventory';
import { Purchases } from './pages/Purchases';
import { Customers } from './pages/Customers';
import { Reports } from './pages/Reports';
import { Dashboard } from './pages/Dashboard';
import { Onboarding } from './pages/Onboarding';
import { Cash } from './pages/Cash';
import { Taxes } from './pages/Taxes';
import { Settings } from './pages/Settings';
import { useShortcuts } from './hooks/useShortcuts';
import { SessionProvider, useSession } from './lib/session';
import { visibleItems } from './lib/navigation';

function AppContent() {
  const [activeNavId, setActiveNavId] = useState('pos');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const { can } = useSession();

  // La paleta y los atajos se derivan de la misma navegación que dibuja la
  // barra lateral: una sola fuente de verdad, imposible que se desincronicen.
  const items = visibleItems(can, import.meta.env.DEV);

  const commands: CommandItem[] = items.map((item) => ({
    id: `nav-${item.id}`,
    title: `Ir a ${item.label}`,
    category: 'Navegación',
    shortcut: item.shortcut,
    onSelect: () => setActiveNavId(item.id)
  }));

  const shortcuts: Record<string, () => void> = { 'Ctrl+K': () => setIsCommandPaletteOpen(true) };
  for (const item of items) {
    if (item.shortcut) shortcuts[item.shortcut] = () => setActiveNavId(item.id);
  }
  useShortcuts(shortcuts);

  const renderActiveView = () => {
    switch (activeNavId) {
      case 'pos':
        return <Pos />;
      case 'cash':
        return <Cash />;
      case 'inventory':
        return <Inventory />;
      case 'customers':
        return <Customers />;
      case 'purchases':
        return <Purchases />;
      case 'reports':
        return <Reports />;
      case 'taxes':
        return <Taxes />;
      case 'settings':
        return <Settings />;
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
        return <Pos />;
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

/**
 * Decide qué mostrar según el estado real del negocio:
 * empresa sin configurar -> asistente; configurada -> aplicación.
 */
function AppGate() {
  const { boot, loading, error, connected, reload } = useSession();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <p className="text-sm text-text-2">Abriendo Cuadra...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <h1 className="text-base font-semibold text-text-1">No se pudo abrir la base de datos</h1>
        <p className="max-w-md text-xs text-text-2">{error}</p>
        <button
          onClick={() => void reload()}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (connected && boot?.needsOnboarding) {
    return <Onboarding onComplete={() => void reload()} />;
  }

  return <AppContent />;
}

export function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <AppGate />
      </SessionProvider>
    </ToastProvider>
  );
}

export default App;
