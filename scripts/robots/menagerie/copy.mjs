import fs from 'node:fs';
import path from 'node:path';
import { copyInto, resetDir } from '../files/output-dir.mjs';
import { checkLicense } from '../licenses/check.mjs';
import { referencedFiles } from '../mjcf/references.mjs';
import { CACHE_DIR, ROBOTS_DIR } from '../paths.mjs';
import { MENAGERIE_COMMIT, MENAGERIE_URL } from './checkout.mjs';
import { studioFacts, withHome, withoutFreeJoint } from './studio.mjs';

// Copies one checked-out robot's MJCF, assets and LICENSE into public/robots and returns its manifest entry.
// `studio` robots also lose their free joint and get their limbs from the compiled model (studio.mjs).
export async function menagerieEntry(robot) {
  const src = path.join(CACHE_DIR, robot.dir);
  const deps = referencedFiles(src, robot.xml);
  const spdx = checkLicense(src, robot);

  const outRel = `menagerie/${robot.dir}`;
  const dest = path.join(ROBOTS_DIR, outRel);
  resetDir(dest);
  copyInto(src, dest, [...deps, 'LICENSE']);
  const files = deps.map((rel) => `${outRel}/${rel}`);
  let facts = { chain: robot.chain };
  if (robot.studio) {
    const main = path.join(dest, robot.xml);
    fs.writeFileSync(main, withHome(withoutFreeJoint(fs.readFileSync(main, 'utf8'), robot.id), robot.home, robot.id));
    facts = await studioFacts(robot, outRel, files);
  }

  return {
    id: robot.id,
    title: robot.title,
    maker: robot.maker,
    dof: facts.chain.joints.length,
    description: robot.description,
    xml: `${outRel}/${robot.xml}`,
    files,
    chain: facts.chain,
    ...(facts.chains && { chains: facts.chains, joints_total: facts.joints_total }),
    ...(robot.category && { category: robot.category }),
    ...(robot.base && { base: robot.base }),
    ...(robot.tags && { tags: robot.tags }),
    license: {
      spdx,
      file: `${outRel}/LICENSE`,
      source: `${MENAGERIE_URL}/tree/${MENAGERIE_COMMIT}/${robot.dir}`,
    },
  };
}
