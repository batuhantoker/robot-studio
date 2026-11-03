import fs from 'node:fs';
import path from 'node:path';
import { STUDIO } from '../paths.mjs';
import { run } from '../process/run.mjs';

const output = async (dir, args) => {
  try {
    return await run('git', ['-C', dir, ...args], { capture: true, quiet: true });
  } catch {
    return null;
  }
};

// Shallow, blobless, sparse checkout of `dirs` from `url` at a pinned `commit` into `dir`.
export async function sparseCheckout({ url, commit, dir, dirs, label }) {
  const git = (args, opts) => run('git', ['-C', dir, ...args], opts);
  if (fs.existsSync(path.join(dir, '.git')) && (await output(dir, ['remote', 'get-url', 'origin'])) !== url) {
    console.log(`cache remote changed; recreating ${path.relative(STUDIO, dir)}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(dir, { recursive: true });
    await git(['init', '-q']);
    await git(['remote', 'add', 'origin', url]);
    await git(['config', 'core.autocrlf', 'false']);
  }
  await git(['sparse-checkout', 'init', '--cone']);
  await git(['sparse-checkout', 'set', ...dirs]);
  if ((await output(dir, ['rev-parse', '--verify', '-q', 'HEAD'])) !== commit) {
    console.log(`fetching ${label}@${commit.slice(0, 12)} (sparse: ${dirs.join(', ')})`);
    await git(['fetch', '--depth', '1', '--no-tags', '--filter=blob:none', 'origin', commit]);
  }
  await git(['-c', 'advice.detachedHead=false', 'checkout', '-q', '--force', '--detach', commit]);
  const actual = await output(dir, ['rev-parse', 'HEAD']);
  if (actual !== commit) throw new Error(`${label} cache is at ${actual}, expected ${commit}`);
}
