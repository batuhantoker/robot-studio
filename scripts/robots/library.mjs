#!/usr/bin/env node
// Writes the robot library into README.md from the manifest and presets. Run after robots:fetch.
import fs from 'node:fs';
import path from 'node:path';
import { libraryEntries, updateReadme } from './library/render.mjs';
import { MANIFEST, STUDIO } from './paths.mjs';

const presets = ['serial-arm', 'studio'].flatMap((dir) => {
  const folder = path.join(STUDIO, 'presets', dir);
  return fs.readdirSync(folder).filter((f) => f.endsWith('.json')).map((f) => ({ id: f.replace('.json', ''), spec: JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8')) }));
}).filter((p) => p.spec.links);

const readme = path.join(STUDIO, 'README.md');
const entries = libraryEntries(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).robots, presets);
fs.writeFileSync(readme, updateReadme(fs.readFileSync(readme, 'utf8'), entries));
console.log(`README lists ${entries.length} robots`);
