/** Geometric Jacobians: column k is [z_k × (p − o_k); z_k] for hinges and [z_k; 0] for slides. */
import { type Vec3, cross, sub } from '../../math/linear/vec';
import { chainFrames } from './frames';
import type { Chain, ChainFrames } from '../model/types';

export interface GeometricJacobian {
  Jv: number[][];
  Jw: number[][];
}

/** Jacobian at a world point rigidly attached to joint `upTo - 1`'s moving frame. */
export function jacobianAt(chain: Chain, f: ChainFrames, point: Vec3, upTo = chain.joints.length): GeometricJacobian {
  const Jv: number[][] = [[], [], []];
  const Jw: number[][] = [[], [], []];
  chain.joints.forEach((joint, k) => {
    let lin: Vec3 = [0, 0, 0];
    let ang: Vec3 = [0, 0, 0];
    if (k < upTo) {
      if (joint.type === 'hinge') {
        lin = cross(f.axes[k], sub(point, f.origins[k]));
        ang = f.axes[k];
      } else {
        lin = f.axes[k];
      }
    }
    for (let r = 0; r < 3; r++) {
      Jv[r].push(lin[r]);
      Jw[r].push(ang[r]);
    }
  });
  return { Jv, Jw };
}

export function toolJacobian(chain: Chain, q: ArrayLike<number>): GeometricJacobian {
  const f = chainFrames(chain, q);
  return jacobianAt(chain, f, f.tip.p);
}

export const positionJacobian = (chain: Chain, q: ArrayLike<number>): number[][] => toolJacobian(chain, q).Jv;
