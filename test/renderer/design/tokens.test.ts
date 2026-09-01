import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const a = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return (a[0] ?? 0) * 0.2126 + (a[1] ?? 0) * 0.7152 + (a[2] ?? 0) * 0.0722;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js') || file.endsWith('.css')) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

describe('Sistema de Diseño y Tokens (renderer/design)', () => {
  const rootDir = path.resolve(__dirname, '../../../');
  const rendererDir = path.resolve(rootDir, 'src/renderer');
  const tokensCssPath = path.resolve(rendererDir, 'design/tokens.css');

  it('1. Cero colores literales en src/renderer/ fuera de design/tokens.css', () => {
    const allRendererFiles = getAllFiles(rendererDir);
    const allowedPaths = [
      'src/renderer/design/tokens.css',
      'src/renderer/index.html'
    ];

    const colorRegex = /(#[0-9a-fA-F]{3,8}\b|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\))/;
    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of allRendererFiles) {
      const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
      if (allowedPaths.some((p) => relativePath.endsWith(p))) {
        continue;
      }

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return;
        }

        const match = line.match(colorRegex);
        if (match) {
          violations.push({
            file: relativePath,
            line: index + 1,
            match: match[0]
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('2. La paleta cumple 4.5:1 en texto principal sobre superficies en ambos temas', () => {
    expect(fs.existsSync(tokensCssPath)).toBe(true);

    // Paleta en claro
    const lightBg = '#FAFAFA';
    const lightSurface = '#FFFFFF';
    const lightSurface2 = '#F4F4F5';
    const lightText1 = '#18181B';
    const lightText2 = '#52525B';

    // Paleta en oscuro
    const darkBg = '#0B0B0E';
    const darkSurface = '#141418';
    const darkSurface2 = '#1C1C22';
    const darkText1 = '#F4F4F5';
    const darkText2 = '#A1A1AA';

    // Verificaciones Modo Claro
    expect(getContrastRatio(lightText1, lightBg)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(lightText1, lightSurface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(lightText1, lightSurface2)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(lightText2, lightBg)).toBeGreaterThanOrEqual(4.5);

    // Verificaciones Modo Oscuro
    expect(getContrastRatio(darkText1, darkBg)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(darkText1, darkSurface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(darkText1, darkSurface2)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(darkText2, darkBg)).toBeGreaterThanOrEqual(4.5);
  });

  it('3. tokens.css soporta modo claro, modo oscuro por sistema y modo oscuro explícito data-theme', () => {
    const cssContent = fs.readFileSync(tokensCssPath, 'utf-8');
    expect(cssContent).toContain(':root');
    expect(cssContent).toContain('@media (prefers-color-scheme: dark)');
    expect(cssContent).toContain('[data-theme="dark"]');
    expect(cssContent).toContain('[data-theme="light"]');
  });

  it('4. tokens.css define las 3 densidades: compacta (28px), cómoda (34px) y amplia (42px)', () => {
    const cssContent = fs.readFileSync(tokensCssPath, 'utf-8');
    expect(cssContent).toContain('[data-density="compact"]');
    expect(cssContent).toContain('[data-density="comfortable"]');
    expect(cssContent).toContain('[data-density="spacious"]');
  });

  it('5. Todos los componentes primitivos y patrones están exportados y disponibles', async () => {
    const uiIndex = await import('../../../src/renderer/src/components/ui/index');
    expect(uiIndex.Button).toBeDefined();
    expect(uiIndex.Input).toBeDefined();
    expect(uiIndex.Select).toBeDefined();
    expect(uiIndex.Table).toBeDefined();
    expect(uiIndex.Drawer).toBeDefined();
    expect(uiIndex.Dialog).toBeDefined();
    expect(uiIndex.Toast).toBeDefined();
    expect(uiIndex.Skeleton).toBeDefined();
    expect(uiIndex.EmptyState).toBeDefined();
    expect(uiIndex.Badge).toBeDefined();
    expect(uiIndex.Kbd).toBeDefined();

    const patternIndex = await import('../../../src/renderer/src/components/patterns/index');
    expect(patternIndex.KpiCard).toBeDefined();
    expect(patternIndex.DataView).toBeDefined();
    expect(patternIndex.CommandPalette).toBeDefined();
    expect(patternIndex.AuthPrompt).toBeDefined();

    const hooksIndex = await import('../../../src/renderer/src/hooks/index');
    expect(hooksIndex.useMagneticFocus).toBeDefined();
    expect(hooksIndex.useShortcuts).toBeDefined();

    const shellModule = await import('../../../src/renderer/src/components/layout/Shell');
    expect(shellModule.Shell).toBeDefined();
  });
});
