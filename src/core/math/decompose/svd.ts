/** Singular values of a 3×n position Jacobian via the eigenvalues of J Jᵀ. */
import { eigSym3 } from './eigen';
import type { Mat3 } from '../linear/mat3';
import { gram } from './solve';
import type { Vec3 } from '../linear/vec';

export interface JacobianSVD {
  /** Descending; zeros when the chain has fewer than three joints. */
  sigma: Vec3;
  /** Left singular vectors as columns: principal tool-velocity directions. */
  U: Mat3;
  rank: number;
  /** Product of the min(n, 3) singular values: √det(J Jᵀ) for n ≥ 3, √det(Jᵀ J) for n < 3. */
  manipulability: number;
  /** σ_max / σ_r with r = min(n, 3); Infinity at a singularity. */
  condition: number;
}

export function jacobianSVD(J: number[][]): JacobianSVD {
  const n = J[0]?.length ?? 0;
  const { values, vectors } = eigSym3(gram(J));
  const sigma = values.map((v) => Math.sqrt(Math.max(v, 0))) as Vec3;
  // numpy.linalg.matrix_rank's default tolerance.
  const tol = sigma[0] * Math.max(3, n) * Number.EPSILON;
  // With fewer than three joints J Jᵀ is always singular; measure over the joints that exist.
  const r = Math.min(n, 3);
  const last = r ? sigma[r - 1] : 0;
  return {
    sigma,
    U: vectors,
    rank: sigma.filter((s) => s > tol).length,
    manipulability: r ? sigma.slice(0, r).reduce((a, b) => a * b, 1) : 0,
    condition: r && last > tol ? sigma[0] / last : Infinity,
  };
}
