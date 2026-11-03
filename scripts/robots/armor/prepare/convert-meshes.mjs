import fs from 'node:fs';
import path from 'node:path';
import { runHelper } from './python.mjs';

const STL_MAX_FACES = 199_999;
export const meshKey = (src, hull) => (hull ? `hull:${src}` : src);

// Converts each { src, hull } once into meshDir; returns Map(meshKey -> { file, faces, up? } | { error }).
// `upAxis`: rotate Collada files by their declared up_axis (ROS tools ignore it, so off by default).
export async function convertMeshes(items, meshDir, workDir, { upAxis = false } = {}) {
  fs.mkdirSync(meshDir, { recursive: true });
  const names = uniqueNames(items);
  const out = new Map();
  const jobs = [];
  for (const { src, hull } of items) {
    const key = meshKey(src, hull);
    const faces = hull ? 0 : binaryStlFaces(src);
    if (faces > 0 && faces <= STL_MAX_FACES) {
      const file = `${names.get(key)}.stl`;
      fs.copyFileSync(src, path.join(meshDir, file));
      out.set(key, { file, faces });
    } else jobs.push({ src, hull, key, upAxis, dest: path.join(meshDir, names.get(key)) });
  }
  if (jobs.length) {
    const results = JSON.parse(await runHelper('meshes.py', jobs, workDir));
    results.forEach((r, i) => {
      out.set(jobs[i].key, r.error ? { error: r.error } : { file: path.basename(r.file), faces: r.faces, up: r.up, unit: r.unit });
    });
  }
  return out;
}

function binaryStlFaces(file) {
  if (!/\.stl$/i.test(file)) return 0;
  const size = fs.statSync(file).size;
  if (size < 84) return 0;
  const head = Buffer.alloc(84);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, head, 0, 84, 0);
  fs.closeSync(fd);
  const n = head.readUInt32LE(80);
  return size === 84 + 50 * n ? n : 0;
}

// Lower-case, collision-free stems: MuJoCo names mesh assets by file stem, and macOS disks ignore case.
function uniqueNames(items) {
  const used = new Set();
  const names = new Map();
  for (const { src, hull } of items) {
    const base = path.basename(src).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').toLowerCase() || 'mesh';
    const stem = hull ? `${base}_hull` : base;
    let name = stem;
    for (let k = 2; used.has(name); k++) name = `${stem}_${k}`;
    used.add(name);
    names.set(meshKey(src, hull), name);
  }
  return names;
}
