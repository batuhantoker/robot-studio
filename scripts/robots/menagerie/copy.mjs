import path from 'node:path';
import { copyInto, resetDir } from '../files/output-dir.mjs';
import { checkLicense } from '../licenses/check.mjs';
import { referencedFiles } from '../mjcf/references.mjs';
import { CACHE_DIR, ROBOTS_DIR } from '../paths.mjs';
import { MENAGERIE_COMMIT, MENAGERIE_URL } from './checkout.mjs';

// Copies one checked-out robot's MJCF, assets and LICENSE into public/robots and returns its manifest entry.
export function menagerieEntry(robot) {
  const src = path.join(CACHE_DIR, robot.dir);
  const deps = referencedFiles(src, robot.xml);
  const spdx = checkLicense(src, robot);

  const outRel = `menagerie/${robot.dir}`;
  const dest = path.join(ROBOTS_DIR, outRel);
  resetDir(dest);
  copyInto(src, dest, [...deps, 'LICENSE']);

  return {
    id: robot.id,
    title: robot.title,
    maker: robot.maker,
    dof: robot.chain.joints.length,
    description: robot.description,
    xml: `${outRel}/${robot.xml}`,
    files: deps.map((rel) => `${outRel}/${rel}`),
    chain: robot.chain,
    license: {
      spdx,
      file: `${outRel}/LICENSE`,
      source: `${MENAGERIE_URL}/tree/${MENAGERIE_COMMIT}/${robot.dir}`,
    },
  };
}
