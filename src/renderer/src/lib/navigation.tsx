import { ReactNode } from 'react';

export interface NavItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: ReactNode;
  /** Permiso exigido para verlo. Sin permiso, el elemento no se dibuja. */
  requires?: string;
  /** Solo en desarrollo: nunca aparece en la aplicación instalada. */
  devOnly?: boolean;
}

export interface NavGroup {
  id: string;
  /** Título del grupo. Vacío para el grupo del pie. */
  label: string;
  items: NavItem[];
}

const ico = (d: string) => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={d} />
  </svg>
);

/**
 * Arquitectura de información.
 *
 * Agrupada por **ritmo de uso**, no por módulo del código, que es como la
 * ordenan Odoo, SAP Business One y Square: lo que se toca cada minuto arriba,
 * lo que se consulta cada mes abajo, y la configuración fuera del camino.
 *
 * El punto de venta es `Ctrl+1` porque es donde vive el cajero ocho horas.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'operacion',
    label: 'Operación diaria',
    items: [
      {
        id: 'pos',
        label: 'Punto de Venta',
        shortcut: 'Ctrl+1',
        icon: ico(
          'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'
        )
      },
      {
        id: 'cash',
        label: 'Caja y Arqueo',
        shortcut: 'Ctrl+2',
        icon: ico(
          'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z'
        )
      }
    ]
  },
  {
    id: 'catalogo',
    label: 'Catálogo y relaciones',
    items: [
      {
        id: 'inventory',
        label: 'Productos',
        shortcut: 'Ctrl+3',
        icon: ico(
          'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
        )
      },
      {
        id: 'customers',
        label: 'Clientes',
        shortcut: 'Ctrl+4',
        icon: ico(
          'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'
        )
      },
      {
        id: 'purchases',
        label: 'Compras y Proveedores',
        shortcut: 'Ctrl+5',
        icon: ico(
          'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4'
        )
      }
    ]
  },
  {
    id: 'analisis',
    label: 'Análisis',
    items: [
      {
        id: 'dashboard',
        label: 'Resumen',
        shortcut: 'Ctrl+6',
        requires: 'dashboard.view',
        icon: ico('M13 7h8m0 0v8m0-8l-8 8-4-4-6 6')
      },
      {
        id: 'reports',
        label: 'Reportes',
        shortcut: 'Ctrl+7',
        icon: ico(
          'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
        )
      },
      {
        id: 'taxes',
        label: 'Impuestos (DGI)',
        shortcut: 'Ctrl+8',
        icon: ico(
          'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
        )
      }
    ]
  },
  {
    id: 'sistema',
    label: '',
    items: [
      {
        id: 'settings',
        label: 'Configuración',
        icon: ico(
          'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z'
        )
      },
      {
        id: 'showcase',
        label: 'Sistema de Diseño',
        icon: ico(
          'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01'
        ),
        devOnly: true
      }
    ]
  }
];

/** Aplana los grupos, ya filtrados por permiso y por entorno. */
export function visibleItems(can: (p: string) => boolean, isDev: boolean): NavItem[] {
  return NAV_GROUPS.flatMap((g) =>
    g.items.filter((i) => (!i.requires || can(i.requires)) && (!i.devOnly || isDev))
  );
}

/** Grupos con sus elementos ya filtrados; los grupos vacíos se descartan. */
export function visibleGroups(can: (p: string) => boolean, isDev: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.requires || can(i.requires)) && (!i.devOnly || isDev))
  })).filter((g) => g.items.length > 0);
}
