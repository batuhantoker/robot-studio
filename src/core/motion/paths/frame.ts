/** A limb's working frame: outward (horizontal, base → tip), up, and side. */
import { type Vec3, add, cross, normalize, scale, sub } from '../../math/linear/vec';
import type { LimbRole } from '../roles';

export interface WorkFrame {
  origin: Vec3;
  out: Vec3;
  up: Vec3;
  side: Vec3;
  reach: number;
}

export function workFrame(r: LimbRole): WorkFrame {
  const d = sub(r.tip, r.base);
  const flat: Vec3 = [d[0], d[1], 0];
  const out = Math.hypot(flat[0], flat[1]) > 1e-6 ? normalize(flat) : ([1, 0, 0] as Vec3);
  const up: Vec3 = [0, 0, 1];
  // A fully stretched arm is singular; work a little inside its reach.
  const dist = Math.hypot(...d);
  const origin = dist > 0.85 * r.length ? add(r.base, scale(d, (0.75 * r.length) / dist)) : r.tip;
  return { origin, out, up, side: cross(up, out), reach: r.length };
}

export const at = (f: WorkFrame, o: number, s: number, u: number): Vec3 =>
  add(f.origin, add(scale(f.out, o), add(scale(f.side, s), scale(f.up, u))));
