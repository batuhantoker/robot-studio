import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { repoCommit } from '../catalog/repos.mjs';

// `git lfs pull` scans the whole index of a blobless clone and fetches every blob one by one, so LFS
// objects come from GitHub's media endpoint at the pinned commit instead, checked against the pointer.
export async function pullLfs(key, dir, files) {
  let pulled = 0;
  for (const file of files) {
    const oid = pointerOid(file);
    if (!oid) continue;
    const rel = path.relative(dir, file).split(path.sep).map(encodeURIComponent).join('/');
    const url = `https://media.githubusercontent.com/media/${key}/${repoCommit(key)}/${rel}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LFS ${url}: HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    if (crypto.createHash('sha256').update(data).digest('hex') !== oid) throw new Error(`LFS ${rel}: sha256 mismatch`);
    fs.writeFileSync(file, data);
    pulled++;
  }
  return pulled;
}

function pointerOid(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size > 1024) return null;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.startsWith('version https://git-lfs.github.com/spec/')) return null;
  return /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1] ?? null;
}
