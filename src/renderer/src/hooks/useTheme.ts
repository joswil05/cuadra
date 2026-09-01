import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'comfortable' | 'spacious';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('cuadra_theme') as Theme) || 'system';
  });

  const [density, setDensity] = useState<Density>(() => {
    return (localStorage.getItem('cuadra_density') as Density) || 'comfortable';
  });

  useEffect(() => {
    const root = document.documentElement;
    localStorage.setItem('cuadra_theme', theme);

    if (theme === 'system') {
      root.removeAttribute('data-theme');
      root.classList.remove('dark');
    } else if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
    } else {
      root.setAttribute('data-theme', 'light');
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    localStorage.setItem('cuadra_density', density);
    root.setAttribute('data-density', density);
  }, [density]);

  return {
    theme,
    setTheme,
    density,
    setDensity
  };
}
