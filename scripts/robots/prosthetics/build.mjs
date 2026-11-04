import fs from 'node:fs';
import path from 'node:path';
import { runHelper } from '../armor/prepare/python.mjs';
import { copyInto, resetDir } from '../files/output-dir.mjs';
import { sparseCheckout } from '../git/sparse.mjs';
import { checkLicense } from '../licenses/check.mjs';
import { referencedFiles } from '../mjcf/references.mjs';
import { ROBOTS_DIR, STUDIO } from '../paths.mjs';
import { createLoader, errorText } from '../verify/compile.mjs';
import { PROSTHETICS_HOSTS, PROSTHETICS_REPOS } from './catalog.mjs';
import { routeTendon, withTendon } from './tendon.mjs';

export const PROSTHETICS_CACHE = path.join(STUDIO, '.cache', 'prosthetics');
const repoDir = (repo) => path.join(PROSTHETICS_CACHE, repo.split('/')[1]);
const host = (repo) => PROSTHETICS_HOSTS[repo] ?? 'https://github.com';
const browse = (repo, commit, dir) => `${host(repo)}/${repo}/${host(repo).includes('bitbucket') ? 'src' : 'tree'}/${commit}/${dir}`;

export async function ensureProstheticRepos(hands) {
  for (const repo of new Set(hands.map((h) => h.repo))) {
    const dirs = [...new Set(hands.filter((h) => h.repo === repo).map((h) => h.dir))];
    await sparseCheckout({ url: `${host(repo)}/${repo}`, commit: PROSTHETICS_REPOS[repo], dir: repoDir(repo), dirs, label: repo });
  }
}

// Exactly one match, so an upstream change fails the fetch instead of silently building something else.
function once(text, pattern, replacement, what) {
  const hits = text.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))?.length ?? 0;
  if (hits !== 1) throw new Error(`prosthesis source: expected one ${what}, found ${hits}`);
  return text.replace(pattern, replacement);
}

const motorJoints = (p) => p.motors.flatMap((m) => m.joints.map((j) => ({ ...j, lead: m.joints[0].joint, motor: m })));
const attr = (tag, key) => tag.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1];
// Model joints in document order; equality <joint> elements (joint1/joint2) are not joints.
const modelJoints = (xml) =>
  [...xml.matchAll(/<joint\b[^>]*>/g)]
    .filter(([tag]) => !/\bjoint1=/.test(tag))
    .map(([tag]) => ({ name: attr(tag, 'name'), range: attr(tag, 'range')?.trim().split(/\s+/).map(Number) }))
    .filter((j) => j.name);

// Upstream MJCF (Ability Hand): bolted at the wrist, its four-bar fit as joint equalities, one actuator per motor.
function fromMjcf(hand) {
  const dir = path.join(repoDir(hand.repo), hand.dir);
  const coupled = motorJoints(hand.prosthesis).filter((j) => j.joint !== j.lead);
  let xml = once(fs.readFileSync(path.join(dir, hand.src), 'utf8'), /^\s*<joint type="free"[^>]*\/>\s*\n/m, '', 'free joint');
  xml = once(xml, /meshdir="\.\/assets"/, 'meshdir="assets"', 'meshdir');
  for (const j of coupled) {
    xml = once(xml, new RegExp(`^\\s*<position[^>]*joint="${j.joint}"[^>]*/>\\s*\\n`, 'm'), '', `${j.joint} actuator`);
  }
  const equality = coupled
    .map((j) => `    <joint name="${j.joint}_coupling" joint1="${j.joint}" joint2="${j.lead}" polycoef="${j.offset} ${j.scale} 0 0 0"/>`)
    .join('\n');
  xml = once(xml, /<\/mujoco>\s*$/, `  <equality>\n${equality}\n  </equality>\n</mujoco>\n`, 'closing </mujoco>');
  return { dir, xml, prosthesis: hand.prosthesis, from: `${hand.dir}/${hand.src}`, change: 'the free joint is removed (mounted at the wrist), and each coupled joint follows its motor through an equality' };
}

let loader = null;

// URDF xacro (SoftHand): expanded without ROS, compiled by MuJoCo, whose URDF import turns <mimic> into equalities.
async function fromXacro(hand) {
  const { package: pkg, include, instance } = hand.xacro;
  const dir = path.join(PROSTHETICS_CACHE, 'work', hand.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const wrap = path.join(dir, 'hand.urdf.xacro');
  fs.writeFileSync(wrap, `<?xml version="1.0"?>\n<robot name="${hand.id}" xmlns:xacro="http://www.ros.org/wiki/xacro">\n` +
    `  <xacro:include filename="$(find ${pkg})/${include}"/>\n  <link name="world"/>\n  ${instance}\n</robot>\n`);
  const urdfPath = path.join(dir, 'hand.urdf');
  await runHelper('expand_xacro.py', { input: wrap, output: urdfPath, args: {}, packages: { [pkg]: path.join(repoDir(hand.repo), hand.dir) } }, dir);
  let urdf = fs.readFileSync(urdfPath, 'utf8')
    .replace(/<gazebo[\s\S]*?<\/gazebo>/g, '')
    .replace(/<transmission[\s\S]*?<\/transmission>/g, '')
    .replace(/<ros2_control[\s\S]*?<\/ros2_control>/g, '')
    .replaceAll(`package://${pkg}/meshes/`, '')
    // Upstream inertials are about 1000× too large; masses from the collision hulls land near the real hand's.
    .replace(/(<robot[^>]*>)/, '$1\n  <mujoco><compiler meshdir="meshes" discardvisual="false" fusestatic="false" strippath="false" ' +
      'inertiafromgeom="true" boundmass="0.001" boundinertia="1e-8"/></mujoco>');
  for (const joint of hand.flipAxes ?? []) {
    const axis = new RegExp(`(<joint name="${joint}"[^>]*>(?:(?!</joint>)[\\s\\S])*?<axis xyz=")([^"]+)(")`);
    urdf = once(urdf, axis, (_, a, xyz, b) => `${a}${xyz.trim().split(/\s+/).map((v) => String(-Number(v))).join(' ')}${b}`, `${joint} axis`);
  }
  const meshes = [...new Set([...urdf.matchAll(/<mesh filename="([^"]+)"/g)].map((m) => m[1]))];
  copyInto(path.join(repoDir(hand.repo), hand.dir, 'meshes'), path.join(dir, 'meshes'), meshes);

  loader ??= await createLoader();
  const { mj } = loader;
  const base = `/prosthesis/${hand.id}`;
  for (const rel of meshes) {
    mj.FS.mkdirTree(path.posix.dirname(`${base}/meshes/${rel}`));
    mj.FS.writeFile(`${base}/meshes/${rel}`, fs.readFileSync(path.join(dir, 'meshes', rel)));
  }
  mj.FS.writeFile(`${base}/hand.urdf`, urdf);
  let model;
  try {
    model = mj.MjModel.from_xml_path(`${base}/hand.urdf`);
  } catch (err) {
    throw new Error(`prosthesis ${hand.id}: MuJoCo: ${errorText(err)}`);
  }
  mj.mj_saveLastXML(`${base}/hand.xml`, model);
  const tendon = hand.tendon && routeTendon(mj, model, hand);
  model.delete();
  let xml = new TextDecoder().decode(mj.FS.readFile(`${base}/hand.xml`));
  if (tendon) xml = withTendon(xml, tendon, hand.tendon);
  // URDF visuals come out in group 1; collision geoms have no group, so this default hides them.
  xml = once(xml, /(<compiler[^>]*\/>)/, '$1\n\n  <default>\n    <geom group="3"/>\n  </default>', 'compiler');
  return { dir, xml, prosthesis: synergyMotors(hand, xml), from: `${hand.dir}/${include}`, change: `expanded from xacro and compiled by MuJoCo from URDF, every <mimic> kept as an equality${hand.tendon ? '; a tendon routed through the fingers is added for display' : ''}${hand.flipAxes?.length ? `; axis flipped on ${hand.flipAxes.join(', ')} to mirror the right hand` : ''}` };
}

// One motor for the whole hand: every equality that leads back to the synergy joint becomes a drive.
export function synergyMotors(hand, xml) {
  const { joint: motorJoint, label, home } = hand.synergy;
  const ranges = new Map(modelJoints(xml).map((j) => [j.name, j.range]));
  const links = new Map([...xml.matchAll(/<joint\b[^>]*\bjoint1="[^"]*"[^>]*>/g)].map(([tag]) => {
    // MuJoCo omits polycoef when it is the default, 0 1 0 0 0.
    const [offset, scale, ...rest] = (attr(tag, 'polycoef') ?? '0 1 0 0 0').trim().split(/\s+/).map(Number);
    if (rest.some((c) => c !== 0)) throw new Error(`prosthesis ${hand.id}: ${attr(tag, 'joint1')} follows a polynomial, not a line`);
    return [attr(tag, 'joint1'), { to: attr(tag, 'joint2'), offset, scale }];
  }));
  // A rolling joint's second hinge mimics the first, so follow each chain down to the motor.
  const resolve = (joint, seen = new Set()) => {
    const l = links.get(joint);
    if (!l || seen.has(joint)) throw new Error(`prosthesis ${hand.id}: ${[...seen, joint].join(' → ')} does not lead to ${motorJoint}`);
    if (l.to === motorJoint) return { offset: l.offset, scale: l.scale };
    const inner = resolve(l.to, new Set([...seen, joint]));
    return { offset: l.offset + l.scale * inner.offset, scale: l.scale * inner.scale };
  };
  const drives = [...links.keys()].map((joint) => ({ joint, ...resolve(joint) }));
  const range = ranges.get(motorJoint);
  // The motor reads back from the strongest drive that never reaches its stop before the motor does.
  const free = (d) => {
    const [lo, hi] = ranges.get(d.joint);
    const end = d.offset + d.scale * range[1];
    return d.scale !== 0 && end >= lo - 1e-6 && end <= hi + 1e-6;
  };
  const lead = drives.filter(free).sort((a, b) => Math.abs(b.scale) - Math.abs(a.scale))[0];
  if (!lead) throw new Error(`prosthesis ${hand.id}: no drive can report the motor position`);
  const motors = [{ name: 'synergy', label, unit: 'fraction', range, home, hint: hand.synergy.hint, joints: [lead, ...drives.filter((d) => d !== lead)] }];
  if (hand.secondSynergy) motors.push(secondSynergy(hand, drives, lead));
  return { ...hand.prosthesis, motors, motorJoint };
}

// The friction-driven second synergy: the same joints, each moved in proportion to its first-synergy share and
// signed per finger, so one side of the hand closes while the other opens (see the catalog for the source).
function secondSynergy(hand, drives, synergyLead) {
  const { gain, weights, ...motor } = hand.secondSynergy;
  const finger = new Map(hand.chains.flatMap((c) => c.joints.map((j) => [j, c.name])));
  const joints = drives
    .map((d) => ({ joint: d.joint, scale: d.scale * gain * (weights[finger.get(d.joint)] ?? 0), offset: 0 }))
    .filter((d) => d.scale !== 0);
  const lead = joints.filter((d) => d.joint !== synergyLead.joint).sort((a, b) => Math.abs(b.scale) - Math.abs(a.scale))[0];
  return { ...motor, unit: 'fraction', joints: [lead, ...joints.filter((d) => d !== lead)] };
}

// Every model joint at home: where its motors put it (a joint two motors move gets both shares), held to range.
export function homeValues(hand, prosthesis, joints) {
  const byJoint = new Map();
  for (const j of motorJoints(prosthesis)) byJoint.set(j.joint, [...(byJoint.get(j.joint) ?? []), j]);
  return joints.map(({ name, range }) => {
    if (name === prosthesis.motorJoint) return prosthesis.motors[0].home;
    if (hand.idle?.includes(name)) return range ? Math.min(Math.max(0, range[0]), range[1]) : 0;
    const shares = byJoint.get(name);
    if (!shares) throw new Error(`prosthesis ${hand.id}: joint ${name} has no motor`);
    const v = shares.reduce((s, j) => s + (j.offset ?? 0) + (j.scale ?? 1) * j.motor.home, 0);
    return range ? Math.min(Math.max(v, range[0]), range[1]) : v;
  });
}

// Mount yaw, a home keyframe with every joint where its motor puts it, and a note on what changed.
function finish(hand, src) {
  let xml = once(src.xml, new RegExp(`(<body name="${hand.mount.body}"[^>]*?)(\\s*childclass=|>)`), `$1 euler="0 0 ${hand.mount.yaw}"$2`, 'mounted body');
  if (hand.recolor) {
    if (!xml.includes(`rgba="${hand.recolor.from}"`)) throw new Error(`prosthesis ${hand.id}: no geom is rgba ${hand.recolor.from}`);
    xml = xml.replaceAll(`rgba="${hand.recolor.from}"`, `rgba="${hand.recolor.to}"`);
  }
  const home = homeValues(hand, src.prosthesis, modelJoints(xml));
  const driven = new Set(motorJoints(src.prosthesis).map((j) => j.joint));
  const unchained = hand.chains.flatMap((c) => c.joints).filter((n) => !driven.has(n));
  if (unchained.length) throw new Error(`prosthesis ${hand.id}: chain joints with no motor: ${unchained.join(', ')}`);
  if (hand.exclude?.length) {
    const pairs = hand.exclude.map(([a, b]) => `    <exclude body1="${a}" body2="${b}"/>`).join('\n');
    xml = once(xml, /<\/mujoco>\s*$/, `  <contact>\n${pairs}\n  </contact>\n</mujoco>\n`, 'closing </mujoco>');
  }
  xml = once(xml, /<\/mujoco>\s*$/, `  <keyframe>\n    <key name="home" qpos="${home.map((v) => v.toFixed(5)).join(' ')}"/>\n  </keyframe>\n</mujoco>\n`, 'closing </mujoco>');
  const note = `<!-- Robot Studio copy of ${hand.repo}@${PROSTHETICS_REPOS[hand.repo].slice(0, 12)}/${src.from}:\n     ${src.change}${hand.recolor ? '; the mount is recoloured' : ''}${hand.exclude?.length ? `; contact excluded for ${hand.exclude.map((p) => p.join('/')).join(', ')}` : ''}. -->\n`;
  return note + xml.replace(/^<\?xml[^>]*\?>\s*/, '');
}

// A second license that covers part of the files (SoftHand meshes are CC BY 4.0); it must allow republishing.
function extraLicense(root, extra) {
  const text = fs.readFileSync(path.join(root, extra.file), 'utf8');
  if (!extra.expect.test(text) || /NonCommercial|NoDerivatives|ShareAlike/i.test(text)) {
    throw new Error(`${extra.file} no longer reads as ${extra.spdx}`);
  }
  return `\n\n---- ${extra.file} (${extra.spdx}) ----\n\n${text}`;
}

// Writes one hand's studio MJCF, meshes and LICENSE into public/robots/prosthetics and returns its manifest entry.
export async function prosthesisEntry(hand) {
  const root = repoDir(hand.repo);
  const spdx = checkLicense(root, { dir: hand.repo, spdx: hand.spdx });
  const extra = hand.extraLicense ? extraLicense(root, hand.extraLicense) : '';
  const src = hand.xacro ? await fromXacro(hand) : fromMjcf(hand);
  fs.writeFileSync(path.join(src.dir, hand.xml), finish(hand, src));
  const deps = referencedFiles(src.dir, hand.xml);

  const outRel = `prosthetics/${hand.id}`;
  const dest = path.join(ROBOTS_DIR, outRel);
  resetDir(dest);
  copyInto(src.dir, dest, deps);
  fs.writeFileSync(path.join(dest, 'LICENSE'), fs.readFileSync(path.join(root, 'LICENSE'), 'utf8') + extra);
  const commit = PROSTHETICS_REPOS[hand.repo];
  const [chain] = hand.chains;
  const { motorJoint, ...prosthesis } = src.prosthesis;

  return {
    id: hand.id,
    title: hand.title,
    maker: hand.maker,
    vendor: hand.maker,
    dof: chain.joints.length,
    description: hand.description,
    xml: `${outRel}/${hand.xml}`,
    files: deps.map((rel) => `${outRel}/${rel}`),
    chain,
    chains: hand.chains,
    collection: 'prosthetics',
    category: 'hand',
    format: hand.xacro ? 'urdf' : 'mjcf',
    base: 'fixed',
    joints_total: new Set(motorJoints(prosthesis).map((j) => j.joint)).size,
    tags: hand.tags,
    upstream: { repo: hand.repo, commit, path: src.from },
    prosthesis,
    license: {
      spdx: hand.extraLicense ? `${spdx} AND ${hand.extraLicense.spdx}` : spdx,
      file: `${outRel}/LICENSE`,
      source: browse(hand.repo, commit, hand.dir),
    },
  };
}
