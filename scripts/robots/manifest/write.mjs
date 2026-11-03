import fs from 'node:fs';
import path from 'node:path';
import { bytesOf } from '../files/output-dir.mjs';
import { MENAGERIE_COMMIT } from '../menagerie/checkout.mjs';
import { MANIFEST, ROBOTS_DIR, STUDIO } from '../paths.mjs';
import { withCollectionFields } from './enrich.mjs';

const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

// Temp file + rename: the app may read index.json while a long fetch is still writing it.
export function writeManifest(robots) {
  const manifest = { version: 1, menagerie_commit: MENAGERIE_COMMIT, robots: robots.map(withCollectionFields) };
  const tmp = `${MANIFEST}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(tmp, MANIFEST);
}

export function printSummary(robots, built) {
  console.log(`\nwrote ${path.relative(STUDIO, ROBOTS_DIR)}/ (menagerie ${MENAGERIE_COMMIT.slice(0, 12)})`);
  let total = 0;
  const totals = new Map();
  for (const entry of robots) {
    const bytes = bytesOf(entry.files);
    total += bytes;
    const c = withCollectionFields(entry).collection;
    totals.set(c, (totals.get(c) ?? 0) + bytes);
    if (c === 'armor') continue;
    const tag = built.has(entry.id) ? 'updated' : 'kept';
    console.log(
      `  ${entry.id.padEnd(16)} ${String(entry.dof).padStart(2)} dof  ${String(entry.files.length).padStart(3)} files  ` +
        `${mb(bytes).padStart(9)}  ${tag.padEnd(7)}  ${path.posix.dirname(entry.xml)}/`,
    );
  }
  const armor = robots.filter((e) => e.collection === 'armor');
  if (armor.length) console.log(`  armor/           ${String(armor.length).padStart(3)} robots (per-robot sizes above)`);
  for (const [c, bytes] of totals) console.log(`  ${`total ${c}`.padEnd(16)}        ${mb(bytes).padStart(9)}`);
  const fileCount = robots.reduce((n, e) => n + e.files.length, 0);
  console.log(`  ${'total'.padEnd(16)}        ${String(fileCount).padStart(3)} files  ${mb(total).padStart(9)}`);
  console.log(`  manifest: ${path.relative(STUDIO, MANIFEST)} (${robots.length} robots)`);
}
