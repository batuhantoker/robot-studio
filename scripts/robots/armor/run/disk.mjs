import fs from 'node:fs';

export const MIN_FREE_BYTES = 20e9;

export function freeBytes(dir) {
  const s = fs.statfsSync(dir);
  return s.bavail * s.bsize;
}
