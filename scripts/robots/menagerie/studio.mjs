// Menagerie robots that need more than a straight copy: the root free joint comes out (the studio settles
// floating bases itself), and limbs are found from the compiled model. A limb lists every joint on its path, even
// one an equality couples to another (the musculoskeletal knee), since the studio's chains treat skipped joints as rigid.
import fs from 'node:fs';
import path from 'node:path';
import { discoverChains } from '../armor/chains/discover.mjs';
import { pickChains } from '../armor/chains/pick.mjs';
import { ROBOTS_DIR } from '../paths.mjs';
import { createLoader, errorText } from '../verify/compile.mjs';

const FREE = /<freejoint\b[^>]*\/>|<joint\b[^>]*\btype="free"[^>]*\/>/g;

// Drops the root free joint and its 7 qpos / 6 qvel values from every keyframe.
export function withoutFreeJoint(xml, label) {
  const free = [...xml.matchAll(FREE)];
  if (!free.length) return xml;
  const world = xml.indexOf('<worldbody');
  const firstJoint = xml.slice(world).search(/<(?:free)?joint\b/);
  if (free.length > 1 || world < 0 || free[0].index !== world + firstJoint) {
    throw new Error(`${label}: expected one free joint, first in the worldbody`);
  }
  const drop = (attr, n) => (s) => s.replace(new RegExp(`(<key\\b[^>]*?\\b${attr}=")([^"]*)(")`, 'g'),
    (_, a, v, b) => `${a}${v.trim().split(/\s+/).slice(n).join(' ')}${b}`);
  return drop('qvel', 6)(drop('qpos', 7)(xml.replace(FREE, '')));
}

// The studio's home pose is the key named "home": rename one the model has, or add one from joint values.
export function withHome(xml, home, label) {
  if (home === undefined) return xml;
  if (typeof home === 'string') {
    const key = new RegExp(`(<key\\b[^>]*\\bname=")${home}(")`);
    if (!key.test(xml)) throw new Error(`${label}: no keyframe ${home}`);
    return xml.replace(key, '$1home$2');
  }
  const tail = `  <keyframe>\n    <key name="home" qpos="${home.join(' ')}"/>\n  </keyframe>\n</mujoco>`;
  return xml.replace(/<\/mujoco>\s*$/, `${tail}\n`);
}

let loader = null;

/** Limbs and movable-joint count from the copied model; `robot.limbs` names tip bodies, else ARMOR's discovery. */
export async function studioFacts(robot, outRel, files) {
  loader ??= await createLoader();
  const { mj, stage, compile, unstage } = loader;
  const base = `/studio/${robot.id}`;
  const staged = stage(base, files, (rel) => fs.existsSync(path.join(ROBOTS_DIR, rel)));
  if (staged.errors.length) throw new Error(`${robot.id}: ${staged.errors.join('; ')}`);
  const res = compile(`${base}/${outRel}/${robot.xml}`);
  if (res.error !== undefined) throw new Error(`${robot.id}: MuJoCo: ${errorText(res.error)}`);
  const m = res.model;
  try {
    const { mjJNT_HINGE, mjJNT_SLIDE } = mj.mjtJoint;
    const movable = (j) => m.jnt_type[j] === mjJNT_HINGE.value || m.jnt_type[j] === mjJNT_SLIDE.value;
    const toBody = (body) => {
      const b = mj.mj_name2id(m, mj.mjtObj.mjOBJ_BODY.value, body);
      if (b < 0) throw new Error(`${robot.id}: no body ${body}`);
      const joints = [];
      for (let x = b; x > 0; x = m.body_parentid[x]) {
        const own = [];
        for (let j = m.body_jntadr[x], n = 0; j >= 0 && n < m.body_jntnum[x]; j++, n++) if (movable(j)) own.push(m.jnt(j).name);
        joints.unshift(...own);
      }
      return joints;
    };
    const chains = robot.limbs
      ? robot.limbs.map(({ name, body }) => ({ name, joints: toBody(body), tip: { body, pos: [0, 0, 0] } }))
      : pickChains(discoverChains(mj, m), robot.category).chains;
    const total = Array.from({ length: m.njnt }, (_, j) => j).filter(movable).length;
    return { chain: { joints: chains[0].joints, tip: chains[0].tip }, chains, joints_total: total };
  } finally {
    m.delete();
    unstage(base);
  }
}
