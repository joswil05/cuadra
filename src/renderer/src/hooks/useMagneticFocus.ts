import { useEffect, RefObject } from 'react';

export interface MagneticFocusOptions {
  enabled?: boolean;
  ignoredSelectors?: string[];
}

/**
 * Hook que re-enfoca automáticamente el elemento objetivo (ej. input de escaneo de POS)
 * cuando el usuario hace clic en un área neutra o cuando no hay otro control enfocado.
 */
export function useMagneticFocus(
  targetRef: RefObject<HTMLElement | null>,
  options: MagneticFocusOptions = {}
) {
  const { enabled = true, ignoredSelectors = ['input', 'button', 'select', 'textarea', 'dialog', '[role="dialog"]'] } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const isIgnored = ignoredSelectors.some((selector) => target.closest(selector));

      if (!isIgnored && targetRef.current) {
        targetRef.current.focus();
      }
    };

    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [targetRef, enabled, ignoredSelectors]);
}
