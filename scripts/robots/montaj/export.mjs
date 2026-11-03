import path from 'node:path';
import { MONTAJ } from '../catalog/robots.mjs';
import { resetDir } from '../files/output-dir.mjs';
import { referencedFiles } from '../mjcf/references.mjs';
import { ROBOTS_DIR } from '../paths.mjs';
import { run } from '../process/run.mjs';
import { FOUR_DOF_CACHE, ensureFourDof } from './checkout.mjs';

// Converts the 4-DOF study's STEP assembly with its python/scripts/preview_cad.py and returns its manifest entry.
export async function montajEntry() {
  const dest = path.join(ROBOTS_DIR, MONTAJ.dir);
  resetDir(dest);
  await ensureFourDof();
  console.log('building montaj1 from STEP via 4dof-robotic-arm python/scripts/preview_cad.py (uv)');
  try {
    await run('uv', ['run', '--script', 'python/scripts/preview_cad.py', '--no-render', '--output-dir', dest], {
      cwd: FOUR_DOF_CACHE,
    });
  } catch (err) {
    throw new Error(`${err.message}\n(montaj1 needs uv: https://docs.astral.sh/uv/ — or pass --skip-montaj)`);
  }
  const deps = referencedFiles(dest, MONTAJ.xml);
  return {
    id: MONTAJ.id,
    title: MONTAJ.title,
    maker: MONTAJ.maker,
    dof: MONTAJ.chain.joints.length,
    description: MONTAJ.description,
    xml: `${MONTAJ.dir}/${MONTAJ.xml}`,
    files: deps.map((rel) => `${MONTAJ.dir}/${rel}`),
    chain: MONTAJ.chain,
    license: MONTAJ.license,
  };
}
