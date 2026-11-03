import path from 'node:path';
import { MANIFEST, STUDIO } from '../paths.mjs';

const COLUMNS = [
  ['robot', (r) => r.id],
  ['dof', (r) => r.dof],
  ['chains', (r) => r.chains],
  ['nbody', (r) => r.nbody],
  ['njnt', (r) => r.njnt],
  ['nmesh', (r) => r.nmesh],
  ['ntex', (r) => r.ntex],
  ['mesh verts', (r) => r.verts?.toLocaleString('en-US')],
  ['files', (r) => r.files],
  ['size', (r) => (r.bytes === undefined ? undefined : `${(r.bytes / 1e6).toFixed(2)} MB`)],
  ['status', (r) => (r.errors.length ? 'FAIL' : 'ok')],
];

// Prints the table plus FAIL/note lines and returns how many robots failed.
export function printReport(rows, manifest) {
  const cells = rows.map((r) => COLUMNS.map(([, get]) => String(get(r) ?? '-')));
  const widths = COLUMNS.map(([title], c) => Math.max(title.length, ...cells.map((row) => row[c].length)));
  const line = (values) => values.map((v, c) => (c === 0 ? v.padEnd(widths[c]) : v.padStart(widths[c]))).join('  ');
  console.log(`menagerie ${manifest.menagerie_commit.slice(0, 12)}  ·  ${path.relative(STUDIO, MANIFEST)}\n`);
  console.log(line(COLUMNS.map(([title]) => title)));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of cells) console.log(line(row));
  console.log();
  for (const r of rows) {
    for (const e of r.errors) console.log(`FAIL ${r.id}: ${e}`);
    for (const n of r.notes) console.log(`     ${r.id}: ${n}`);
  }
  const failed = rows.filter((r) => r.errors.length).length;
  console.log(failed ? `\n${failed} of ${rows.length} robot(s) failed` : `\nall ${rows.length} robots ok`);
  return failed;
}
