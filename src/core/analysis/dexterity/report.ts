/** Jacobian conditioning and joint-limit margins at one pose. */
import { chainFrames } from '../../chain/kinematics/frames';
import { type GeometricJacobian, jacobianAt } from '../../chain/kinematics/jacobian';
import type { Chain } from '../../chain/model/types';
import { type JacobianSVD, jacobianSVD } from '../../math/decompose/svd';

export interface DexterityReport {
  jacobian: GeometricJacobian;
  svd: JacobianSVD;
  /** Fraction of travel left before the nearest limit, per joint (0 at a limit, 0.5 centred). */
  limitMargin: number[];
  nearSingular: boolean;
}

export function dexterity(chain: Chain, q: ArrayLike<number>): DexterityReport {
  const f = chainFrames(chain, q);
  const jacobian = jacobianAt(chain, f, f.tip.p);
  const svd = jacobianSVD(jacobian.Jv);
  const limitMargin = chain.joints.map((j, k) => {
    const span = j.limits[1] - j.limits[0];
    return Math.min(q[k] - j.limits[0], j.limits[1] - q[k]) / span;
  });
  const expected = Math.min(3, chain.joints.length);
  return { jacobian, svd, limitMargin, nearSingular: svd.rank < expected || svd.condition > 1e3 };
}
