import fs from 'node:fs';
import path from 'node:path';
import { meshKey } from './convert-meshes.mjs';
import { runHelper } from './python.mjs';

// Above this many visual faces one robot no longer compiles inside MuJoCo's 4 GB WASM heap (cassie: 1.65M).
const TRIGGER_FACES = 1_200_000;
const TARGET_FACES = 1_000_000;
const SMALL = 20_000;

// Decimates the large visual meshes in place so the robot fits TARGET_FACES; returns a note or null.
export async function fitFaceBudget(meshes, items, meshDir, workDir, { upAxis = false } = {}) {
  const visual = items.filter((i) => !i.hull && meshes.get(meshKey(i.src, false))?.faces);
  const faces = (i) => meshes.get(meshKey(i.src, false)).faces;
  const total = visual.reduce((n, i) => n + faces(i), 0);
  if (total <= TRIGGER_FACES) return null;
  const big = visual.filter((i) => faces(i) > SMALL);
  const smallSum = total - big.reduce((n, i) => n + faces(i), 0);
  const ratio = Math.max(0.05, (TARGET_FACES - smallSum) / (total - smallSum));
  const jobs = big.map((i) => {
    const old = meshes.get(meshKey(i.src, false));
    const dest = path.join(meshDir, old.file.replace(/\.[^.]+$/, ''));
    return { src: i.src, dest, upAxis, decimate: Math.max(2000, Math.floor(faces(i) * ratio)) };
  });
  const results = JSON.parse(await runHelper('meshes.py', jobs, workDir));
  results.forEach((r, k) => {
    if (r.error) return;
    const key = meshKey(jobs[k].src, false);
    const old = meshes.get(key);
    const file = path.basename(r.file);
    if (file !== old.file) fs.rmSync(path.join(meshDir, old.file), { force: true });
    meshes.set(key, { ...old, file, faces: r.faces });
  });
  const after = visual.reduce((n, i) => n + faces(i), 0);
  return `visual meshes decimated from ${total.toLocaleString('en-US')} to ${after.toLocaleString('en-US')} faces to fit the MuJoCo WASM heap`;
}
