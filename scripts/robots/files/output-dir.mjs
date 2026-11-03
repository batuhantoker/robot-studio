import fs from 'node:fs';
import path from 'node:path';
import { ROBOTS_DIR } from '../paths.mjs';

export function resetDir(dir) {
  if (path.relative(ROBOTS_DIR, dir).startsWith('..')) throw new Error(`refusing to delete ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

export function copyInto(srcRoot, destRoot, rels) {
  for (const rel of rels) {
    const dest = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(srcRoot, rel), dest);
  }
}

export const bytesOf = (rels) => rels.reduce((sum, rel) => sum + fs.statSync(path.join(ROBOTS_DIR, rel)).size, 0);
