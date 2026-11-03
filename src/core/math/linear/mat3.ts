/** Row-major 3×3 matrices. */
import type { Vec3 } from './vec';

export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const identity3 = (): Mat3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function matMul(A: Mat3, B: Mat3): Mat3 {
  const C = new Array(9) as Mat3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
  }
  return C;
}

export const matVec = (A: Mat3, v: Vec3): Vec3 => [
  A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
  A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
  A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
];

export const transpose = (A: Mat3): Mat3 => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
export const column = (A: Mat3, j: number): Vec3 => [A[j], A[3 + j], A[6 + j]];

export function det3(A: Mat3): number {
  return A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);
}

/** [a]×, so that [a]× b = a × b. */
export function skew(a: Vec3): Mat3 {
  const [x, y, z] = a;
  return [0, -z, y, z, 0, -x, -y, x, 0];
}

/** Rodrigues: I + sin(q) K + (1 - cos q) K², as in SerialArm._frames. */
export function rodrigues(axis: Vec3, angle: number): Mat3 {
  const K = skew(axis);
  const K2 = matMul(K, K);
  const s = Math.sin(angle);
  const c = 1 - Math.cos(angle);
  return identity3().map((v, i) => v + s * K[i] + c * K2[i]) as Mat3;
}
