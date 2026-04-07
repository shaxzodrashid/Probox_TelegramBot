import * as fs from 'fs';
import * as path from 'path';

export function loadSQL(relativePath: string): string {
  const root: string = process.cwd();
  const devPath: string = path.join(root, 'src', relativePath);
  const prodPath: string = path.join(root, 'dist', 'src', relativePath);
  const fullPath: string = fs.existsSync(devPath) ? devPath : prodPath;

  if (!fs.existsSync(fullPath)) {
    throw new Error(`❌ SQL file not found: ${fullPath}`);
  }

  return fs.readFileSync(fullPath, 'utf8');
}
