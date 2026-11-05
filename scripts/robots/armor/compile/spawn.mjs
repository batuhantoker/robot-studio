import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../process/run.mjs';

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'child.mjs');

// Runs child.mjs in a fresh Node process and returns its parsed result.
export async function compileInChild(rel, category, rootQuat, options = {}) {
  const args = [CHILD, rel, category, rootQuat?.join(',') ?? '', JSON.stringify(options)];
  const stdout = await run(process.execPath, args, { capture: true, errTail: true });
  const line = stdout.split('\n').findLast((l) => l.startsWith('@@RESULT '));
  if (!line) throw new Error('compile child printed no result');
  return JSON.parse(line.slice('@@RESULT '.length));
}
