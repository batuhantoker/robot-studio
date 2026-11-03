/** Cyclic Jacobi eigen-decomposition for symmetric 3×3 matrices. */
import type { Mat3 } from '../linear/mat3';
import type { Vec3 } from '../linear/vec';

function rotate(m: number[][], p: number, q: number, c: number, s: number, columns: boolean) {
  for (let k = 0; k < 3; k++) {
    if (columns) {
      const [x, y] = [m[k][p], m[k][q]];
      m[k][p] = c * x - s * y;
      m[k][q] = s * x + c * y;
    } else {
      const [x, y] = [m[p][k], m[q][k]];
      m[p][k] = c * x - s * y;
      m[q][k] = s * x + c * y;
    }
  }
}

/** Eigenvalues sorted descending; eigenvectors are the matching columns. */
export function eigSym3(A: Mat3): { values: Vec3; vectors: Mat3 } {
  const a = [0, 1, 2].map((r) => [A[r * 3], A[r * 3 + 1], A[r * 3 + 2]]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off <= 1e-32 * (a[0][0] ** 2 + a[1][1] ** 2 + a[2][2] ** 2) || off === 0) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (a[p][q] === 0) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      rotate(a, p, q, c, t * c, true);
      rotate(a, p, q, c, t * c, false);
      rotate(v, p, q, c, t * c, true);
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  const vectors = new Array(9) as Mat3;
  order.forEach((src, dst) => { for (let k = 0; k < 3; k++) vectors[k * 3 + dst] = v[k][src]; });
  return { values: order.map((i) => a[i][i]) as Vec3, vectors };
}
