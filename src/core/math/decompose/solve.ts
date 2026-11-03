/** Gram matrices and small linear solves for 3×n Jacobians. */
import type { Mat3 } from '../linear/mat3';
import type { Vec3 } from '../linear/vec';

/** J Jᵀ for a 3×n matrix given as rows. */
export function gram(J: number[][]): Mat3 {
  const G = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < J[i].length; k++) s += J[i][k] * J[j][k];
      G[i * 3 + j] = s;
    }
  }
  return G;
}

/** Gaussian elimination with partial pivoting. */
export function solve3(A: Mat3, b: Vec3): Vec3 {
  const M = [0, 1, 2].map((r) => [A[r * 3], A[r * 3 + 1], A[r * 3 + 2], b[r]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (M[c][c] === 0) throw new Error('singular 3x3 system');
    for (let r = c + 1; r < 3; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x: Vec3 = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let s = M[r][3];
    for (let k = r + 1; k < 3; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Jᵀ x for a 3×n J. */
export const transposeTimes = (J: number[][], x: Vec3): number[] =>
  J[0].map((_, k) => J[0][k] * x[0] + J[1][k] * x[1] + J[2][k] * x[2]);

export function frobenius(J: number[][]): number {
  let s = 0;
  for (const row of J) for (const v of row) s += v * v;
  return Math.sqrt(s);
}
