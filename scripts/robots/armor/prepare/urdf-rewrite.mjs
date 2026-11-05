import { parseXmlTree } from '../../mjcf/parse-xml.mjs';
import { degenerate, fixInertia, TINY_INERTIA } from './urdf-fixes.mjs';
import { childrenNamed, element, firstChild, writeXml } from './xml-write.mjs';

const DROP = new Set(['gazebo', 'transmission', 'ros2_control', 'mujoco']);
const COMPILER = {
  meshdir: 'meshes',
  balanceinertia: 'true',
  discardvisual: 'false',
  fusestatic: 'false',
  strippath: 'true',
  boundmass: '1e-4',
  boundinertia: '1e-8',
};

// Parses a URDF and normalises joints for a fixed-base MuJoCo import; mesh references are collected.
export function loadUrdf(text, label) {
  const robot = firstChild(parseXmlTree(text, label), 'robot');
  if (!robot) throw new Error(`${label}: no <robot> element`);
  const notes = [];
  robot.children = robot.children.filter((c) => !DROP.has(c.name));
  const links = childrenNamed(robot, 'link');
  const meshRefs = [];
  const badInertia = [];
  for (const mat of childrenNamed(robot, 'material')) stripTextures(mat);
  for (const link of links) {
    const inertial = firstChild(link, 'inertial');
    if (inertial && !firstChild(inertial, 'mass')) inertial.children.push(element('mass', { value: '0' }));
    if (inertial && !firstChild(inertial, 'inertia')) inertial.children.push(element('inertia', TINY_INERTIA));
    if (fixInertia(firstChild(inertial, 'inertia'))) badInertia.push(link.attrs.name);
    for (const part of link.children.filter((c) => c.name === 'visual' || c.name === 'collision')) {
      if (degenerate(firstChild(part, 'geometry'))) {
        link.children = link.children.filter((c) => c !== part);
        notes.push(`zero-size ${part.name} geometry dropped on ${link.attrs.name}`);
        continue;
      }
      // Some exporters emit one <material> per Collada effect; MuJoCo accepts one.
      const [keep, ...extra] = childrenNamed(part, 'material');
      part.children = part.children.filter((c) => !extra.includes(c));
      if (keep) stripTextures(keep);
      const mesh = firstChild(firstChild(part, 'geometry'), 'mesh');
      if (mesh) meshRefs.push({ link, part, mesh, ref: mesh.attrs.filename ?? '', hull: part.name === 'collision' });
    }
  }
  if (badInertia.length) {
    notes.push(`${badInertia.length} link inertia(s) not positive definite, diagonal kept (e.g. ${badInertia[0]})`);
  }
  for (const joint of childrenNamed(robot, 'joint')) fixJoint(joint, notes);
  return { robot, links: links.length, meshRefs, notes };
}

function stripTextures(material) {
  material.children = material.children.filter((c) => c.name !== 'texture');
}

function fixJoint(joint, notes) {
  const type = joint.attrs.type;
  if (!type || type === 'floating' || type === 'planar') {
    notes.push(`${type ?? 'untyped'} joint ${joint.attrs.name} made fixed`);
    joint.attrs.type = 'fixed';
    return;
  }
  const axis = firstChild(joint, 'axis');
  if (type !== 'fixed' && axis) {
    const v = (axis.attrs.xyz ?? '1 0 0').trim().split(/\s+/).map(Number);
    if (v.length !== 3 || v.some((x) => !Number.isFinite(x)) || Math.hypot(...v) < 1e-9) {
      notes.push(`joint ${joint.attrs.name} has a zero axis; made fixed`);
      joint.attrs.type = 'fixed';
      return;
    }
  }
  const limit = firstChild(joint, 'limit');
  if ((type === 'revolute' || type === 'prismatic') && limit) {
    const lo = Number(limit.attrs.lower ?? 0);
    const hi = Number(limit.attrs.upper ?? 0);
    if (lo > hi) [limit.attrs.lower, limit.attrs.upper] = [String(hi), String(lo)];
  }
}

// Corrects joint limits the source has wrong, by joint name.
export function setLimits(model, limits = {}) {
  for (const joint of model.robot.children.filter((c) => c.name === 'joint' && limits[c.attrs.name])) {
    const limit = firstChild(joint, 'limit');
    [limit.attrs.lower, limit.attrs.upper] = limits[joint.attrs.name].map(String);
  }
}

// Points mesh references at the flattened files (dropping parts whose mesh failed) and adds MuJoCo flags.
export function finishUrdf(model, fileFor) {
  for (const meshRef of model.meshRefs) {
    const { link, part, mesh } = meshRef;
    const file = fileFor(meshRef);
    if (file) mesh.attrs.filename = file;
    else link.children = link.children.filter((c) => c !== part);
  }
  model.robot.children.unshift(element('mujoco', {}, [element('compiler', COMPILER)]));
  return `<?xml version="1.0"?>\n${writeXml(model.robot)}`;
}
