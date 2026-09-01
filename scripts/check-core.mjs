import fs from 'fs';
import path from 'path';

const FORBIDDEN_MODULES = [
  'electron',
  'better-sqlite3',
  'fs',
  'path',
  'os',
  'child_process',
  'crypto',
  'http',
  'https',
  'net',
  'node:'
];

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

const coreDir = path.resolve(process.cwd(), 'src/core');
const coreFiles = getAllFiles(coreDir);
const violations = [];

for (const file of coreFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const importMatch = line.match(/(?:import\s+.*?from\s+['"](.*?)['"]|require\(['"](.*?)['"]\))/);
    if (importMatch) {
      const importedModule = importMatch[1] || importMatch[2];
      if (importedModule) {
        const isForbidden = FORBIDDEN_MODULES.some((mod) =>
          importedModule === mod || importedModule.startsWith(mod + '/') || importedModule.startsWith('node:')
        );
        if (isForbidden) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: index + 1,
            content: line.trim()
          });
        }
      }
    }
    // Check Date.now() prohibition (rule: clock must be injected in core)
    if (line.includes('Date.now()')) {
      violations.push({
        file: path.relative(process.cwd(), file),
        line: index + 1,
        content: line.trim() + ' (Date.now() está prohibido en src/core/, debe inyectarse)'
      });
    }
  });
}

if (violations.length > 0) {
  console.error('❌ Error de arquitectura: src/core/ importa infraestructura o usa APIs prohibidas:');
  violations.forEach((v) => {
    console.error(`  ${v.file}:${v.line} -> ${v.content}`);
  });
  process.exit(1);
} else {
  console.log('✅ Verificación de arquitectura de src/core/ superada con éxito (0 dependencias de infraestructura).');
  process.exit(0);
}
