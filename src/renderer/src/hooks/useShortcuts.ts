import { useEffect } from 'react';

export type ShortcutHandler = (e: KeyboardEvent) => void;

export interface ShortcutMap {
  [key: string]: ShortcutHandler;
}

/**
 * Hook para registrar atajos de teclado globales (F1..F12, Ctrl+K, /, etc.)
 */
export function useShortcuts(shortcuts: ShortcutMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Evitar interceptar atajos de tipeo básico si se está escribiendo en un input, excepto teclas de función y Ctrl combos
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';

      // Normalizar clave
      let key = e.key;

      if (e.ctrlKey || e.metaKey) {
        key = `Ctrl+${e.key.toUpperCase()}`;
      } else if (e.altKey) {
        key = `Alt+${e.key.toUpperCase()}`;
      }

      const handler = shortcuts[key] || shortcuts[e.key] || shortcuts[e.code];

      if (handler) {
        // Permitir que F1..F12 y Ctrl+K funcionen incluso dentro de inputs
        const isSpecial = e.key.startsWith('F') || e.ctrlKey || e.metaKey || e.key === 'Escape';
        if (!isInput || isSpecial) {
          e.preventDefault();
          handler(e);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}
