import React, { useState } from 'react';
import { useTheme, Theme, Density } from '../../hooks/useTheme';
import { Kbd } from '../ui/Kbd';
import { Badge } from '../ui/Badge';

export interface NavItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
}

export interface ShellProps {
  children: React.ReactNode;
  activeNavId?: string;
  onNavigate?: (id: string) => void;
  inspectionPanel?: React.ReactNode;
  userFullName?: string;
  shiftStatus?: 'open' | 'closed';
  shiftFolio?: string;
  onOpenCommandPalette?: () => void;
}

export function Shell({
  children,
  activeNavId = 'showcase',
  onNavigate,
  inspectionPanel,
  userFullName = 'Administrador',
  shiftStatus = 'open',
  shiftFolio = 'TURNO-00001',
  onOpenCommandPalette
}: ShellProps) {
  const { theme, setTheme, density, setDensity } = useTheme();
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  const navItems: NavItem[] = [
    {
      id: 'pos',
      label: 'Punto de Venta',
      shortcut: 'Ctrl+1',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    },
    {
      id: 'inventory',
      label: 'Inventario',
      shortcut: 'Ctrl+2',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    },
    {
      id: 'purchases',
      label: 'Compras',
      shortcut: 'Ctrl+3',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      )
    },
    {
      id: 'customers',
      label: 'Clientes y Crédito',
      shortcut: 'Ctrl+4',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    },
    {
      id: 'reports',
      label: 'Reportes',
      shortcut: 'Ctrl+5',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    {
      id: 'dashboard',
      label: 'Panel del Dueño',
      shortcut: 'Ctrl+6',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      )
    },
    {
      id: 'showcase',
      label: 'Sistema de Diseño',
      shortcut: 'Ctrl+7',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      )
    }
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text-1">
      {/* ZONA 1: NAVEGACIÓN (Sidebar) */}
      <aside className="w-60 flex-shrink-0 bg-surface border-r border-border flex flex-col justify-between select-none">
        {/* App Brand & Quick Search */}
        <div className="p-3.5 border-b border-border">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-white font-bold text-xs">
                C
              </div>
              <span className="font-semibold text-sm tracking-tight text-text-1">Cuadra</span>
            </div>
            <Badge variant="neutral">v0.1</Badge>
          </div>

          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-text-3 bg-surface-2 hover:bg-surface-3 border border-border rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Buscar...</span>
            </div>
            <Kbd>Ctrl+K</Kbd>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = activeNavId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate?.(item.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                  isActive
                    ? 'bg-accent-soft text-accent font-semibold'
                    : 'text-text-2 hover:bg-surface-2 hover:text-text-1'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={isActive ? 'text-accent' : 'text-text-3'}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.shortcut && <Kbd className="text-[10px]">{item.shortcut}</Kbd>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer: Shift Status, Theme, Density & User */}
        <div className="p-3 border-t border-border bg-surface-2/40 flex flex-col gap-2.5">
          {/* Shift status */}
          <div className="flex items-center justify-between text-xs px-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${shiftStatus === 'open' ? 'bg-success' : 'bg-text-3'}`} />
              <span className="text-text-2 font-medium">{shiftFolio}</span>
            </div>
            <Badge variant={shiftStatus === 'open' ? 'success' : 'neutral'}>
              {shiftStatus === 'open' ? 'Abierto' : 'Cerrado'}
            </Badge>
          </div>

          {/* Controls: Theme & Density */}
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            {/* Theme switcher */}
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              className="bg-surface text-text-2 border border-border rounded px-1.5 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <option value="system">Tema: Auto</option>
              <option value="light">Tema: Claro</option>
              <option value="dark">Tema: Oscuro</option>
            </select>

            {/* Density switcher */}
            <select
              value={density}
              onChange={(e) => setDensity(e.target.value as Density)}
              className="bg-surface text-text-2 border border-border rounded px-1.5 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <option value="compact">Dens: 28px</option>
              <option value="comfortable">Dens: 34px</option>
              <option value="spacious">Dens: 42px</option>
            </select>
          </div>

          {/* User profile */}
          <div className="flex items-center justify-between pt-1 border-t border-border/60 text-xs px-1">
            <span className="text-text-1 font-medium truncate">{userFullName}</span>
            <span className="text-text-3 text-[10px]">Cajero 1</span>
          </div>
        </div>
      </aside>

      {/* ZONA 2: TRABAJO (Main Workspace) */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg">
        <header className="h-12 border-b border-border bg-surface px-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-text-1 capitalize">
              {navItems.find((n) => n.id === activeNavId)?.label || 'Cuadra'}
            </h1>
          </div>

          {inspectionPanel && (
            <button
              onClick={() => setIsInspectorOpen(!isInspectorOpen)}
              className={`p-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                isInspectorOpen
                  ? 'bg-surface-2 text-text-1 border-border'
                  : 'bg-transparent text-text-3 border-transparent hover:bg-surface-2'
              }`}
              title="Alternar panel de inspección"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
              <span>Inspección</span>
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </main>

      {/* ZONA 3: INSPECCIÓN (Inspector contextual) */}
      {inspectionPanel && isInspectorOpen && (
        <aside className="w-80 flex-shrink-0 bg-surface border-l border-border flex flex-col overflow-y-auto">
          <div className="h-12 border-b border-border px-4 flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-semibold text-text-2">Detalles / Inspección</span>
            <button
              onClick={() => setIsInspectorOpen(false)}
              className="text-text-3 hover:text-text-1 p-1 rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-4 flex-1">{inspectionPanel}</div>
        </aside>
      )}
    </div>
  );
}
