/** Rigid transforms and MuJoCo-order (w, x, y, z) quaternions. */
import { type Mat3, identity3, matMul, matVec, transpose } from './mat3';
import { type Vec3, add, scale } from './vec';

export type Quat = [number, number, number, number];

export interface Transform {
  R: Mat3;
  p: Vec3;
}

export const identityTransform = (): Transform => ({ R: identity3(), p: [0, 0, 0] });
export const translation = (p: Vec3): Transform => ({ R: identity3(), p: [...p] as Vec3 });

export const compose = (a: Transform, b: Transform): Transform => ({
  R: matMul(a.R, b.R),
  p: add(a.p, matVec(a.R, b.p)),
});

export const applyTransform = (t: Transform, v: Vec3): Vec3 => add(t.p, matVec(t.R, v));

export function invert(t: Transform): Transform {
  const Rt = transpose(t.R);
  return { R: Rt, p: scale(matVec(Rt, t.p), -1) };
}

export function quatToMat(q: ArrayLike<number>): Mat3 {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const [a, b, c, d] = [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  return [
    1 - 2 * (c * c + d * d), 2 * (b * c - a * d), 2 * (b * d + a * c),
    2 * (b * c + a * d), 1 - 2 * (b * b + d * d), 2 * (c * d - a * b),
    2 * (b * d - a * c), 2 * (c * d + a * b), 1 - 2 * (b * b + c * c),
  ];
}

export function matToQuat(R: Mat3): Quat {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = R;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [0.25 / s, (m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [(m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s];
}

/** Z-Y-X (yaw, pitch, roll) angles in radians. */
export function eulerZYX(R: Mat3): Vec3 {
  const pitch = Math.asin(Math.max(-1, Math.min(1, -R[6])));
  return [Math.atan2(R[3], R[0]), pitch, Math.atan2(R[7], R[8])];
}
