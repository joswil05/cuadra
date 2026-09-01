import fs from 'fs';
import path from 'path';

function getAllFiles(dirPath, arrayOfFiles = []) {
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

const rendererDir = path.resolve(process.cwd(), 'src/renderer');
const allRendererFiles = getAllFiles(rendererDir);

// Allow design tokens file and html/config
const allowedPaths = [
  'src/renderer/design/tokens.css',
  'src/renderer/index.html'
];

const colorRegex = /(#[0-9a-fA-F]{3,8}\b|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\))/;

const violations = [];

for (const file of allRendererFiles) {
  const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');
  if (allowedPaths.some((p) => relativePath.endsWith(p))) {
    continue;
  }

  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Ignore comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return;
    }

    const match = line.match(colorRegex);
    if (match) {
      violations.push({
        file: relativePath,
        line: index + 1,
        match: match[0],
        content: line.trim()
      });
    }
  });
}

if (violations.length > 0) {
  console.error('❌ Error de diseño: Se encontraron colores literales en src/renderer/ fuera de design/tokens.css:');
  violations.forEach((v) => {
    console.error(`  ${v.file}:${v.line} -> '${v.match}' en: ${v.content}`);
  });
  process.exit(1);
} else {
  console.log('✅ Verificación de tokens de diseño superada (cero colores literales en renderer).');
  process.exit(0);
}
