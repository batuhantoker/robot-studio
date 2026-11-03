// Regenerate test/fixtures/python.json from the reference Python package at the pinned commit.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../robots/process/run.mjs';
import { FOUR_DOF_COMMIT, FOUR_DOF_URL } from './upstream.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = `four-dof-arm[simulation] @ git+${FOUR_DOF_URL}@${FOUR_DOF_COMMIT}#subdirectory=python`;
await run('uv', ['run', '--no-project', '--python', '3.12', '--with', pkg, 'python', path.join(here, 'make_fixtures.py')], {
  cwd: path.resolve(here, '..', '..'),
});
