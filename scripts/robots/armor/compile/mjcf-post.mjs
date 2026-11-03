import { childrenNamed, element, firstChild } from '../prepare/xml-write.mjs';

function section(root, name, after = 'compiler') {
  let el = firstChild(root, name);
  if (!el) {
    el = element(name);
    const at = root.children.findIndex((c) => c.name === after);
    root.children.splice(at + 1, 0, el);
  }
  return el;
}

// URDF visuals come out with an explicit group 1; collision geoms have none, so a default sends them to 3.
export function hideCollisionGeoms(root) {
  const defaults = section(root, 'default');
  let geom = firstChild(defaults, 'geom');
  if (!geom) defaults.children.unshift((geom = element('geom')));
  geom.attrs.group = '3';
}

const mulQuat = ([aw, ax, ay, az], [bw, bx, by, bz]) => [
  aw * bw - ax * bx - ay * by - az * bz,
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
];

const rotate = (q, v) => mulQuat(mulQuat(q, [0, ...v]), [q[0], -q[1], -q[2], -q[3]]).slice(1);

// Re-orients the whole model about the world origin (e.g. a Z-down rover frame to Z-up).
export function rotateRoots(root, quat) {
  for (const body of childrenNamed(firstChild(root, 'worldbody'), 'body')) {
    if (['euler', 'axisangle', 'xyaxes', 'zaxis'].some((k) => k in body.attrs)) throw new Error('root orientation must be a quat');
    const q = (body.attrs.quat ?? '1 0 0 0').trim().split(/\s+/).map(Number);
    const p = (body.attrs.pos ?? '0 0 0').trim().split(/\s+/).map(Number);
    body.attrs.quat = mulQuat(quat, q).map((v) => +v.toFixed(9)).join(' ');
    body.attrs.pos = rotate(quat, p).map((v) => +v.toFixed(6)).join(' ');
  }
}

export function liftRoots(root, dz) {
  for (const body of childrenNamed(firstChild(root, 'worldbody'), 'body')) {
    const p = (body.attrs.pos ?? '0 0 0').trim().split(/\s+/).map(Number);
    p[2] += dz;
    body.attrs.pos = p.map((v) => +v.toFixed(6)).join(' ');
  }
}

export function excludeContacts(root, pairs) {
  if (!pairs.length) return;
  const contact = section(root, 'contact', 'worldbody');
  for (const [body1, body2] of pairs) contact.children.push(element('exclude', { body1, body2 }));
}

// One file can back several mesh assets (e.g. the same STL at two scales).
export const meshFiles = (root) => [
  ...new Set(childrenNamed(firstChild(root, 'asset') ?? element('asset'), 'mesh').map((m) => m.attrs.file).filter(Boolean)),
];
