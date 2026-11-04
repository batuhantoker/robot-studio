// Hands whose MJCF already moves through actuators (MuJoCo Menagerie): a motor per actuator, fingertips from the
// distal meshes, an upright mount, and grips from one table of finger closures shared by every hand.
import fs from 'node:fs';
import path from 'node:path';
import { referencedFiles } from '../mjcf/references.mjs';

const TRN_JOINT = 0, TRN_TENDON = 3, WRAP_JOINT = 1;

const nameOf = (m, adr) => { let s = ''; for (let i = adr; m.names[i]; i++) s += String.fromCharCode(m.names[i]); return s; };
const clamp = (v, [lo, hi]) => Math.min(Math.max(v, lo), hi);

export function compileHand(mj, dir, xml, base) {
  for (const rel of referencedFiles(dir, xml)) {
    mj.FS.mkdirTree(path.posix.dirname(`${base}/${rel}`));
    mj.FS.writeFile(`${base}/${rel}`, fs.readFileSync(path.join(dir, rel)));
  }
  return mj.MjModel.from_xml_path(`${base}/${xml}`);
}

// One motor per actuator: on a joint it is that joint; on a fixed tendon it spreads its travel over the tendon's joints.
export function actuatedMotors(m, hand) {
  const joint = (j) => nameOf(m, m.name_jntadr[j]);
  const range = (j) => [m.jnt_range[2 * j], m.jnt_range[2 * j + 1]];
  const moved = new Set();
  const motors = Array.from({ length: m.nu }, (_, a) => {
    const type = m.actuator_trntype[a], id = m.actuator_trnid[2 * a];
    if (type === TRN_JOINT) {
      moved.add(id);
      const name = joint(id);
      return { name, label: hand.label(name), range: range(id), joints: [{ joint: name }] };
    }
    if (type === TRN_TENDON) {
      const name = nameOf(m, m.name_tendonadr[id]);
      const wraps = Array.from({ length: m.tendon_num[id] }, (_, w) => m.tendon_adr[id] + w);
      if (wraps.some((w) => m.wrap_type[w] !== WRAP_JOINT)) throw new Error(`hand ${hand.id}: actuator on spatial tendon ${name}`);
      wraps.forEach((w) => moved.add(m.wrap_objid[w]));
      // Equal shares: the coupled joints of an underactuated finger curl together.
      const joints = wraps.map((w) => ({ joint: joint(m.wrap_objid[w]), scale: 1 / (wraps.length * m.wrap_prm[w]) }));
      return { name, label: hand.label(name), range: [m.actuator_ctrlrange[2 * a], m.actuator_ctrlrange[2 * a + 1]], joints };
    }
    throw new Error(`hand ${hand.id}: actuator ${nameOf(m, m.name_actuatoradr[a])} has transmission ${type}`);
  });
  const loose = Array.from({ length: m.njnt }, (_, j) => j).filter((j) => !moved.has(j)).map(joint);
  if (loose.length) throw new Error(`hand ${hand.id}: joints no actuator moves: ${loose.join(', ')}`);
  return motors;
}

// The far point of each distal body's visual mesh, for chains whose tip is { body, pos: 'auto' }.
export function autoTips(mj, m, chains) {
  const visual = (g) => m.geom_type[g] === 7 && m.geom_contype[g] === 0 && m.geom_conaffinity[g] === 0;
  const rot = ([w, x, y, z], [a, b, c]) => {
    const ix = w * a + y * c - z * b, iy = w * b + z * a - x * c, iz = w * c + x * b - y * a, iw = -x * a - y * b - z * c;
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  };
  return chains.map((c) => {
    if (c.tip.pos !== 'auto') return c;
    const b = mj.mj_name2id(m, mj.mjtObj.mjOBJ_BODY.value, c.tip.body);
    let far = null;
    for (let g = 0; g < m.ngeom; g++) {
      if (m.geom_bodyid[g] !== b || !visual(g)) continue;
      const mesh = m.geom_dataid[g], q = [0, 1, 2, 3].map((k) => m.geom_quat[4 * g + k]), p = [0, 1, 2].map((k) => m.geom_pos[3 * g + k]);
      for (let v = 0; v < m.mesh_vertnum[mesh]; v++) {
        const i = 3 * (m.mesh_vertadr[mesh] + v);
        const x = rot(q, [m.mesh_vert[i], m.mesh_vert[i + 1], m.mesh_vert[i + 2]]).map((s, k) => s + p[k]);
        if (!far || Math.hypot(...x) > Math.hypot(...far)) far = x;
      }
    }
    if (!far) throw new Error(`chain ${c.name}: ${c.tip.body} has no visual mesh for an automatic tip`);
    return { ...c, tip: { body: c.tip.body, pos: far.map((v) => +v.toFixed(4)) } };
  });
}

// How far each digit curls in each grip (0 straight, 1 at its stops), and how far the thumb swings across the palm.
const GRIPS = {
  open: { label: 'Open', index: 0, middle: 0, ring: 0, little: 0, thumb: 0, oppose: 0.2 },
  power: { label: 'Power', index: 0.62, middle: 0.62, ring: 0.62, little: 0.62, thumb: 0.45, oppose: 1 },
  pinch: { label: 'Pinch', index: 0.42, middle: 0.8, ring: 0.8, little: 0.8, thumb: 0.35, oppose: 0.95 },
  tripod: { label: 'Tripod', index: 0.42, middle: 0.42, ring: 0.8, little: 0.8, thumb: 0.35, oppose: 0.95 },
  point: { label: 'Point', index: 0, middle: 0.8, ring: 0.8, little: 0.8, thumb: 0.55, oppose: 0.7 },
};

// Grips in motor values: curling motors go a fraction of the way to their upper stop, opposing motors to a fraction
// of their full opposition, everything else stays at zero (held inside its range).
export function tableGrips(hand, motors) {
  const byName = new Map(motors.map((m) => [m.name, m]));
  return Object.entries(GRIPS).map(([name, g]) => {
    const t = { ...g, ...hand.gripTweaks?.[name] };
    const values = Object.fromEntries(motors.map((m) => [m.name, clamp(0, m.range)]));
    for (const [digit, names] of Object.entries(hand.curl)) {
      for (const n of names) values[n] = clamp(t[digit] * (hand.curlScale ?? 1) * byName.get(n).range[1], byName.get(n).range);
    }
    for (const [n, full] of Object.entries(hand.oppose)) values[n] = clamp(t.oppose * full, byName.get(n).range);
    if (name === 'open') for (const [n, v] of Object.entries(hand.open ?? {})) values[n] = clamp(v, byName.get(n).range);
    return { name, label: t.label, motors: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, +v.toFixed(4)])) };
  });
}
