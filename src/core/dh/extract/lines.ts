/** Placement of DH frame i from the axis lines z_{i-1} (through O_{i-1}) and z_i (through P_i). */
import { type Vec3, add, cross, dot, norm, normalize, scale, sub } from '../../math/linear/vec';
import type { DHRow } from '../types';

const EPS = 1e-9;

export interface Placement {
  origin: Vec3;
  x: Vec3;
  /** Foot of the common normal on line i−1. */
  foot: Vec3;
  kind: DHRow['placement'];
}

export function placeFrame(prevOrigin: Vec3, prevZ: Vec3, prevX: Vec3, point: Vec3, z: Vec3): Placement {
  const c = cross(prevZ, z);
  const w = sub(point, prevOrigin);
  if (norm(c) > EPS) {
    const b = dot(prevZ, z);
    const dPrev = dot(prevZ, w);
    const dCur = dot(z, w);
    const s = (dPrev - b * dCur) / (1 - b * b);
    const t = (b * dPrev - dCur) / (1 - b * b);
    const foot = add(prevOrigin, scale(prevZ, s));
    const origin = add(point, scale(z, t));
    const gap = sub(origin, foot);
    if (norm(gap) > EPS) return { origin, x: normalize(gap), foot, kind: 'skew' };
    const x = normalize(c);
    // Either sign is valid DH; keep x near the previous x so θ offsets stay small.
    return { origin, x: dot(x, prevX) < 0 ? scale(x, -1) : x, foot, kind: 'intersecting' };
  }
  const radial = sub(w, scale(prevZ, dot(w, prevZ)));
  if (norm(radial) > EPS) {
    return { origin: add(prevOrigin, radial), x: normalize(radial), foot: prevOrigin, kind: 'parallel' };
  }
  const origin = add(prevOrigin, scale(prevZ, dot(w, prevZ)));
  return { origin, x: prevX, foot: origin, kind: 'coincident' };
}

/** Angle from u to v about axis n. */
export const angleAbout = (u: Vec3, v: Vec3, n: Vec3) => Math.atan2(dot(cross(u, v), n), dot(u, v));
