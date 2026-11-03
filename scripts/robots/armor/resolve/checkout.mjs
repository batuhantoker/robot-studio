import fs from 'node:fs';
import path from 'node:path';
import { ARMOR_CACHE } from '../../paths.mjs';
import { run } from '../../process/run.mjs';
import { repoCommit, repoUrl } from '../catalog/repos.mjs';

export const repoDir = (key) => path.join(ARMOR_CACHE, 'repos', ...key.split('/'));

// LFS objects are pulled later, only for the files a robot references.
const NO_SMUDGE = { GIT_LFS_SKIP_SMUDGE: '1' };

// Network-backed steps (fetch, blob downloads during checkout) occasionally fail transiently.
async function retry(step) {
  try {
    return await step();
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
    return step();
  }
}
const locks = new Map();

// Shallow, blobless, sparse (cone) checkout of `dirs` at the pinned commit; grows the sparse set on reuse.
export function ensureRepo(key, dirs) {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => checkout(key, dirs));
  locks.set(key, next);
  return next;
}

async function checkout(key, dirs) {
  const commit = repoCommit(key);
  if (!commit) throw new Error(`${key} is not pinned in armor/catalog/repos.mjs`);
  const dir = repoDir(key);
  const git = (args, opts = {}) => run('git', ['-C', dir, ...args], { env: NO_SMUDGE, ...opts });
  const out = (args) => git(args, { capture: true, quiet: true }).catch(() => null);

  if (fs.existsSync(path.join(dir, '.git')) && (await out(['remote', 'get-url', 'origin'])) !== repoUrl(key)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(dir, { recursive: true });
    await git(['init', '-q']);
    await git(['remote', 'add', 'origin', repoUrl(key)]);
    await git(['config', 'core.autocrlf', 'false']);
    await git(['sparse-checkout', 'init', '--cone']);
  }
  const listed = (await out(['sparse-checkout', 'list'])) ?? '';
  const current = listed.split('\n').filter(Boolean);
  const wanted = [...new Set([...current, ...dirs])].sort();
  const head = await out(['rev-parse', '--verify', '-q', 'HEAD']);
  if (head === commit && wanted.length === current.length) return dir;

  await git(['sparse-checkout', 'set', '--cone', ...wanted]);
  if (head !== commit) {
    console.log(`  fetching ${key}@${commit.slice(0, 12)} (sparse: ${wanted.join(', ') || '<root files>'})`);
    await retry(() => git(['fetch', '--depth', '1', '--no-tags', '--filter=blob:none', 'origin', commit], { quiet: true }));
  }
  await retry(() => git(['-c', 'advice.detachedHead=false', 'checkout', '-q', '--force', '--detach', commit], { errTail: true }));
  if ((await out(['rev-parse', 'HEAD'])) !== commit) throw new Error(`${key} checkout is not at ${commit}`);
  return dir;
}
