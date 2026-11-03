/**
 * Static gravity load: τ = −Σ_m J_v(c_m)ᵀ m g, the torque that holds the pose.
 * Equals MuJoCo's qfrc_bias at zero velocity for the same masses and centres.
 */
import { chainFrames, massPositions } from '../../chain/kinematics/frames';
import { jacobianAt } from '../../chain/kinematics/jacobian';
import type { Chain } from '../../chain/model/types';
import { type Vec3, scale } from '../../math/linear/vec';

export interface MassLoad {
  name: string;
  position: Vec3;
  force: Vec3;
  /** This mass's share of every joint torque. */
  torque: number[];
}

export interface GravityLoad {
  torque: number[];
  loads: MassLoad[];
  totalMass: number;
  centerOfMass: Vec3;
}

export function gravityLoad(chain: Chain, q: ArrayLike<number>): GravityLoad {
  const f = chainFrames(chain, q);
  const positions = massPositions(chain, f);
  const torque = chain.joints.map(() => 0);
  const com: Vec3 = [0, 0, 0];
  let total = 0;
  const loads = chain.masses.map((m, i) => {
    const force = scale(chain.gravity, m.mass);
    const { Jv } = jacobianAt(chain, f, positions[i], m.joint + 1);
    const share = Jv[0].map((_, k) => -(Jv[0][k] * force[0] + Jv[1][k] * force[1] + Jv[2][k] * force[2]));
    share.forEach((v, k) => (torque[k] += v));
    total += m.mass;
    for (let r = 0; r < 3; r++) com[r] += m.mass * positions[i][r];
    return { name: m.name, position: positions[i], force, torque: share };
  });
  return { torque, loads, totalMass: total, centerOfMass: total > 0 ? scale(com, 1 / total) : com };
}
