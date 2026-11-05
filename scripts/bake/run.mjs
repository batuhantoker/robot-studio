#!/usr/bin/env node
// Bakes preset castings into dist/bake after `vite build`. Only speeds up opening a robot: if this fails the app ships and meshes live.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createServer } from 'vite';
import { castingsVersion } from './version.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const version = castingsVersion();
const out = path.join(ROOT, 'dist', 'bake', version);
const start = Date.now();

async function bake() {
  const server = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
  try {
    const { bakePresets } = await server.ssrLoadModule('/src/app/presets/bake.ts');
    const files = bakePresets((id, ms) => console.log(`bake: ${id} ${(ms / 1000).toFixed(1)} s`));
    fs.mkdirSync(out, { recursive: true });
    let bytes = 0;
    for (const { key, data } of files) {
      // Level and header fixed, so the same mesh is the same bytes on any machine.
      const packed = gzipSync(data, { level: 9 });
      fs.writeFileSync(path.join(out, `${key}.bin`), packed);
      bytes += packed.length;
    }
    console.log(`bake: ${files.length} presets, ${(bytes / 1e6).toFixed(1)} MB, ${((Date.now() - start) / 1000).toFixed(0)} s, in dist/bake/${version}`);
  } finally {
    await server.close();
  }
}

try {
  await bake();
} catch (e) {
  fs.rmSync(path.join(ROOT, 'dist', 'bake'), { recursive: true, force: true });
  console.warn(`bake: FAILED, shipping without baked meshes; robots will mesh live. ${e?.stack ?? e}`);
}
process.exit(0);
