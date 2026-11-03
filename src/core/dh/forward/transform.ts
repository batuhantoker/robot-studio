/** DH forward kinematics, used to verify an extracted table against the chain. */
import type { Chain } from '../../chain/model/types';
import { forwardKinematics } from '../../chain/kinematics/frames';
import { type Transform, compose } from '../../math/linear/transform';
import { maxAbsDiff } from '../../math/linear/vec';
import { rng, uniform } from '../../math/random/rng';
import type { DHRow, DHTable } from '../types';

export function dhMatrix(theta: number, d: number, a: number, alpha: number): Transform {
  const [ct, st, ca, sa] = [Math.cos(theta), Math.sin(theta), Math.cos(alpha), Math.sin(alpha)];
  return {
    R: [ct, -st * ca, st * sa, st, ct * ca, -ct * sa, 0, sa, ca],
    p: [a * ct, a * st, d],
  };
}

export function rowAt(row: DHRow, q: number) {
  const delta = q - row.q0;
  return row.type === 'hinge'
    ? { theta: row.theta + delta, d: row.d }
    : { theta: row.theta, d: row.d + delta };
}

export function dhForward(table: DHTable, q: ArrayLike<number>): Transform {
  return compose(table.rows.reduce((T, row, i) => {
    const { theta, d } = rowAt(row, q[i]);
    return compose(T, dhMatrix(theta, d, row.a, row.alpha));
  }, table.base), table.tool);
}

/** Largest position/rotation-entry disagreement over random poses inside the limits. */
export function verifyDH(table: DHTable, chain: Chain, samples = 24, seed = 7): number {
  const next = rng(seed);
  let worst = 0;
  for (let s = 0; s < samples; s++) {
    const q = chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
    const a = dhForward(table, q);
    const b = forwardKinematics(chain, q);
    worst = Math.max(worst, maxAbsDiff(a.p, b.p), maxAbsDiff(a.R, b.R));
  }
  return worst;
}
