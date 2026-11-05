#!/usr/bin/env node
// Writes the robot library into README.md from the manifest and presets. Run after robots:fetch.
import fs from 'node:fs';
import path from 'node:path';
import { libraryEntries, updateReadme } from './library/render.mjs';
import { MANIFEST, STUDIO } from './paths.mjs';

// Matches src/app/presets/load.ts: the other serial-arm files are test fixtures, not library robots.
const studio = path.join(STUDIO, 'presets', 'studio');
const presets = [
  path.join(STUDIO, 'presets', 'serial-arm', 'original_4dof.json'),
  ...fs.readdirSync(studio).filter((f) => f.endsWith('.json')).map((f) => path.join(studio, f)),
].map((file) => ({ id: path.basename(file, '.json'), spec: JSON.parse(fs.readFileSync(file, 'utf8')) }));

const readme = path.join(STUDIO, 'README.md');
const entries = libraryEntries(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).robots, presets);
fs.writeFileSync(readme, updateReadme(fs.readFileSync(readme, 'utf8'), entries));
console.log(`README lists ${entries.length} robots`);
