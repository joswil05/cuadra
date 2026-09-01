import React, { useState } from 'react';
import { useTheme, Theme, Density } from '../../hooks/useTheme';
import { Kbd } from '../ui/Kbd';
import { Badge } from '../ui/Badge';
import { visibleGroups, NavItem } from '../../lib/navigation';
import { useSession } from '../../lib/session';

export type { NavItem };

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
  const { can } = useSession();
  const esDesarrollo = import.meta.env.DEV;
  const grupos = visibleGroups(can, esDesarrollo);
  const navItems: NavItem[] = grupos.flatMap((g) => g.items);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);


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
        <nav className="flex-1 overflow-y-auto p-2">
          {grupos.map((grupo, gi) => (
            <div key={grupo.id} className={gi > 0 ? 'mt-4' : ''}>
              {grupo.label && (
                <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-3">
                  {grupo.label}
                </p>
              )}
              {!grupo.label && <div className="mb-2 border-t border-border" />}
              <div className="space-y-0.5">
                {grupo.items.map((item) => {
                  const isActive = activeNavId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate?.(item.id)}
                      aria-current={isActive ? 'page' : undefined}
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
              </div>
            </div>
          ))}
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
