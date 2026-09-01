import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Aislamiento arquitectónico de src/core/', () => {
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

  function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
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

  it('no contiene ningún import de infraestructura ni Node.js', () => {
    const coreDir = path.resolve(__dirname, '../../src/core');
    const coreFiles = getAllFiles(coreDir);

    const violations: { file: string; line: number; content: string }[] = [];

    for (const file of coreFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Detect import ... from '...' or require('...')
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
      });
    }

    expect(violations).toEqual([]);
  });
});
