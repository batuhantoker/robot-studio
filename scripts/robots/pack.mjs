#!/usr/bin/env node
// Builds the public robot pack for GitHub Pages from public/robots/: only robots whose license allows republishing
// (plus Montaj1, the author's own CAD), every file gzipped, licenses kept readable, and an attribution page.
//
//   node scripts/robots/pack.mjs [--out DIR]
import fs from 'node:fs';
import path from 'node:path';
import { MANIFEST, ROBOTS_DIR, STUDIO } from './paths.mjs';
import { attributionPage } from './pack/page.mjs';
import { publishable } from './pack/select.mjs';
import { writePack } from './pack/write.mjs';

// GitHub Pages rejects sites over 1 GB.
const LIMIT_BYTES = 950e6;

const outArg = process.argv.indexOf('--out');
const out = path.resolve(outArg > 0 ? process.argv[outArg + 1] : path.join(STUDIO, '.cache', 'pages'));

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const { kept, dropped } = publishable(manifest.robots);
fs.rmSync(out, { recursive: true, force: true });
const bytes = writePack(ROBOTS_DIR, path.join(out, 'robots'), { ...manifest, robots: kept });
fs.writeFileSync(path.join(out, 'index.html'), attributionPage(kept, dropped.length));
fs.writeFileSync(path.join(out, '.nojekyll'), '');

console.log(`packed ${kept.length} robots (${(bytes / 1e6).toFixed(0)} MB) into ${path.relative(STUDIO, out)}`);
console.log(`left out ${dropped.length} without a republishable license: ${dropped.map((r) => r.id).join(', ')}`);
if (bytes > LIMIT_BYTES) {
  console.error(`pack is ${(bytes / 1e6).toFixed(0)} MB, over the ${LIMIT_BYTES / 1e6} MB GitHub Pages budget`);
  process.exit(1);
}
