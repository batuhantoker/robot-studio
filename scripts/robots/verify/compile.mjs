import loadMujoco from '@mujoco/mujoco';
import fs from 'node:fs';
import path from 'node:path';
import { ROBOTS_DIR } from '../paths.mjs';

export const errorText = (err) => String(err?.message ?? err).replace(/^Error: /, '').split('\n')[0];

// MuJoCo WASM with FS.open wrapped to record every file a compile successfully opens.
export async function createLoader() {
  const mj = await loadMujoco();
  let reads = null;
  const open = mj.FS.open;
  mj.FS.open = function (p, ...rest) {
    const stream = open.call(this, p, ...rest);
    if (reads && typeof p === 'string') reads.add(path.posix.normalize(p));
    return stream;
  };

  // Writes each listed file at `${base}/${rel}`, as the browser does.
  const stage = (base, files, onDisk) => {
    const result = { bytes: 0, errors: [] };
    for (const rel of files) {
      if (!onDisk(rel)) {
        result.errors.push(`listed file missing on disk: ${rel}`);
        continue;
      }
      const data = fs.readFileSync(path.join(ROBOTS_DIR, ...rel.split('/')));
      result.bytes += data.length;
      mj.FS.mkdirTree(path.posix.dirname(`${base}/${rel}`));
      mj.FS.writeFile(`${base}/${rel}`, data);
    }
    return result;
  };

  const compile = (xmlPath) => {
    reads = new Set();
    try {
      return { model: mj.MjModel.from_xml_path(xmlPath), opened: reads };
    } catch (err) {
      return { error: errorText(err), opened: reads };
    } finally {
      reads = null;
    }
  };

  // Frees a staged tree; WASM memory is capped, so large collections must not accumulate.
  const unstage = (dir) => {
    for (const name of mj.FS.readdir(dir)) {
      if (name === '.' || name === '..') continue;
      const p = `${dir}/${name}`;
      if (mj.FS.isDir(mj.FS.stat(p).mode)) unstage(p);
      else mj.FS.unlink(p);
    }
    mj.FS.rmdir(dir);
  };

  return { mj, stage, compile, unstage };
}

// Listed files must be exactly what MuJoCo read from `base`.
export function readErrors(opened, base, files) {
  const errors = [];
  const prefix = `${base}/`;
  const outside = [...opened].filter((p) => !p.startsWith(prefix) && !p.startsWith('/dev/'));
  if (outside.length) errors.push(`read files outside its own set: ${outside.join(', ')}`);
  const read = new Set([...opened].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)));
  const unlisted = [...read].filter((rel) => !files.includes(rel));
  if (unlisted.length) errors.push(`read unlisted files: ${unlisted.join(', ')}`);
  const unused = files.filter((rel) => !read.has(rel));
  if (unused.length) errors.push(`listed but never read by MuJoCo: ${unused.join(', ')}`);
  return errors;
}
