#!/usr/bin/env node
// Compiles one prepared robot in its own MuJoCo WASM instance (keeps memory per robot):
// robot.urdf -> robot.xml with collision geoms in group 3, lifted onto z=0, home-pose contacts excluded.
//   node child.mjs <dir relative to public/robots> <category> [root quat w,x,y,z]
import fs from 'node:fs';
import path from 'node:path';
import { parseXml } from '../../mjcf/parse-xml.mjs';
import { ROBOTS_DIR } from '../../paths.mjs';
import { createLoader, readErrors } from '../../verify/compile.mjs';
import { discoverChains } from '../chains/discover.mjs';
import { withHome } from '../../menagerie/studio.mjs';
import { pickChains } from '../chains/pick.mjs';
import { writeXml } from '../prepare/xml-write.mjs';
import { contactPairs, lowestPoint } from './measure.mjs';
import { excludeContacts, hideCollisionGeoms, liftRoots, meshFiles, rotateRoots } from './mjcf-post.mjs';

const [rel, category, rootQuat, options] = process.argv.slice(2);
const { home, maxChains, extraGeoms, dropGeoms } = JSON.parse(options ?? '{}');
const loader = await createLoader();
const { mj } = loader;
const abs = (p) => path.join(ROBOTS_DIR, ...p.split('/'));
const onDisk = (p) => fs.existsSync(abs(p));
const meshNames = () => (onDisk(`${rel}/meshes`) ? fs.readdirSync(abs(`${rel}/meshes`)) : []);
const meshesIn = () => meshNames().map((f) => `${rel}/meshes/${f}`);
let stageCount = 0;

function compileFiles(files, xmlRel) {
  const base = `/c${stageCount++}`;
  const staged = loader.stage(base, files, onDisk);
  if (staged.errors.length) throw new Error(staged.errors.join('; '));
  const res = loader.compile(`${base}/${xmlRel}`);
  if (res.error !== undefined) throw new Error(res.error);
  return { ...res, base, done: () => loader.unstage(base) };
}

function withData(m, fn) {
  const d = new mj.MjData(m);
  try {
    mj.mj_forward(m, d);
    return fn(d);
  } finally {
    d.delete();
  }
}

function main() {
  const out = { notes: [] };
  const urdf = compileFiles([`${rel}/robot.urdf`, ...meshesIn()], `${rel}/robot.urdf`);
  mj.mj_saveLastXML(`${urdf.base}/${rel}/robot.xml`, urdf.model);
  urdf.model.delete();
  const root = parseXml(new TextDecoder().decode(mj.FS.readFile(`${urdf.base}/${rel}/robot.xml`)), 'robot.xml');
  urdf.done();
  hideCollisionGeoms(root);
  if (rootQuat) rotateRoots(root, rootQuat.split(',').map(Number));

  const save = () => fs.writeFileSync(abs(`${rel}/robot.xml`), writeXml(root));
  const listed = () => [`${rel}/robot.xml`, ...meshFiles(root).map((f) => `${rel}/meshes/${f}`)];
  save();
  // Lifting moves the whole tree rigidly, so contacts measured before the lift still hold after it.
  const pass = compileFiles(listed(), `${rel}/robot.xml`);
  const [minz, pairs] = withData(pass.model, (d) => [lowestPoint(mj, pass.model, d), contactPairs(pass.model, d)]);
  pass.model.delete();
  pass.done();
  if (Number.isFinite(minz) && minz < -1e-4) {
    liftRoots(root, -minz);
    out.lift = +(-minz).toFixed(4);
  }
  excludeContacts(root, pairs);
  out.excluded = pairs.length;
  save();
  let finished = withHome(fs.readFileSync(abs(`${rel}/robot.xml`), 'utf8'), home, rel);
  if (dropGeoms) finished = finished.replace(new RegExp(`\\s*<geom\\b[^>]*${dropGeoms}[^>]*/>`, 'g'), '');
  if (extraGeoms) finished = finished.replace(/<worldbody>\s*<body\b[^>]*>/, `$&${extraGeoms}`);
  fs.writeFileSync(abs(`${rel}/robot.xml`), finished);

  for (const f of meshNames()) {
    if (!meshFiles(root).includes(f)) fs.rmSync(abs(`${rel}/meshes/${f}`));
  }
  const files = listed();
  const final = compileFiles(files, `${rel}/robot.xml`);
  const m = final.model;
  try {
    out.errors = readErrors(final.opened, final.base, files);
    out.ncon = withData(m, (d) => d.ncon);
    const { mjJNT_HINGE, mjJNT_SLIDE } = mj.mjtJoint;
    const types = Array.from(m.jnt_type);
    out.joints_total = types.filter((t) => t === mjJNT_HINGE.value || t === mjJNT_SLIDE.value).length;
    out.free_joints = types.filter((t) => t === mj.mjtJoint.mjJNT_FREE.value).length;
    const groups = Array.from(m.geom_group);
    Object.assign(out, { nbody: m.nbody, nmesh: m.nmesh, neq: m.neq, files });
    Object.assign(out, { visual_geoms: groups.filter((g) => g <= 2).length, collision_geoms: groups.filter((g) => g === 3).length });
    out.verts = Array.from(m.mesh_vertnum).reduce((a, b) => a + b, 0);
    Object.assign(out, pickChains(discoverChains(mj, m), category, maxChains));
  } finally {
    m.delete();
  }
  return out;
}

let result;
try {
  result = main();
} catch (err) {
  result = { error: String(err?.message ?? err).split('\n')[0] };
}
console.log(`@@RESULT ${JSON.stringify(result)}`);
