// The generator's hash: anything that changes what a casting's mesh would be. Shared by the app's build and the bake, so both agree.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SOURCES = ['src/cad/parts/castings', 'src/cad/assembly/spec'];

const filesIn = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
  .flatMap((e) => (e.isDirectory() ? filesIn(path.join(dir, e.name)) : [path.join(dir, e.name)]));

export function castingsVersion() {
  const hash = createHash('sha256');
  for (const dir of SOURCES) for (const file of filesIn(path.join(ROOT, dir))) {
    hash.update(path.relative(ROOT, file).split(path.sep).join('/'));
    // A checkout's line endings must not change the hash.
    hash.update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  }
  return hash.digest('hex').slice(0, 16);
}
