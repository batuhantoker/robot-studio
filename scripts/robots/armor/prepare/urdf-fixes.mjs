// boundmass/boundinertia lift these to MuJoCo's minimum.
export const TINY_INERTIA = { ixx: '1e-9', iyy: '1e-9', izz: '1e-9', ixy: '0', ixz: '0', iyz: '0' };

const nums = (v, n) => (v ?? '').trim().split(/\s+/).map(Number).slice(0, n);

// Primitives with a zero or negative size are rejected by MuJoCo.
export function degenerate(geometry) {
  const shape = geometry?.children[0];
  if (!shape) return true;
  const a = shape.attrs;
  const sizes = {
    box: nums(a.size, 3),
    cylinder: [Number(a.radius), Number(a.length)],
    capsule: [Number(a.radius), Number(a.length)],
    sphere: [Number(a.radius)],
    mesh: a.scale ? nums(a.scale, 3).map(Math.abs) : [1],
  }[shape.name];
  return sizes ? !sizes.every((x) => Number.isFinite(x) && x > 0) : false;
}

// Smallest eigenvalue of a symmetric 3x3 matrix (closed form).
function minEigen(xx, yy, zz, xy, xz, yz) {
  const p1 = xy * xy + xz * xz + yz * yz;
  if (p1 === 0) return Math.min(xx, yy, zz);
  const q = (xx + yy + zz) / 3;
  const p = Math.sqrt(((xx - q) ** 2 + (yy - q) ** 2 + (zz - q) ** 2 + 2 * p1) / 6);
  const [a, b, c] = [(xx - q) / p, (yy - q) / p, (zz - q) / p];
  const [d, e, f] = [xy / p, xz / p, yz / p];
  const r = (a * (b * c - f * f) - d * (d * c - f * e) + e * (d * f - b * e)) / 2;
  return q + 2 * p * Math.cos(Math.acos(Math.max(-1, Math.min(1, r))) / 3 + (2 * Math.PI) / 3);
}

// MuJoCo needs every inertia eigenvalue above its epsilon; otherwise keep a clamped diagonal.
export function fixInertia(inertia) {
  if (!inertia) return false;
  const k = ['ixx', 'iyy', 'izz', 'ixy', 'ixz', 'iyz'];
  const [xx, yy, zz, xy, xz, yz] = k.map((n) => Number(inertia.attrs[n] ?? 0) || 0);
  if (minEigen(xx, yy, zz, xy, xz, yz) > 1e-12) return false;
  [xx, yy, zz].forEach((d, i) => (inertia.attrs[k[i]] = String(Math.max(Math.abs(d), 1e-9))));
  for (const n of k.slice(3)) inertia.attrs[n] = '0';
  return true;
}
