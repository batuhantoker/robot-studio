/**
 * Joint-limit sampling with per-sample limits: dexterity (manipulability), static gravity load
 * against each motor's limit, and distance to the nearest joint limit.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import { jacobianAt } from '../../chain/kinematics/jacobian';
import type { Chain } from '../../chain/model/types';
import { jacobianSVD } from '../../math/decompose/svd';
import type { Vec3 } from '../../math/linear/vec';
import { rng, uniform } from '../../math/random/rng';
import { gravityLoad } from '../statics/gravity';

export interface WorkspaceSamples {
  points: Vec3[];
  manipulability: number[];
  /** max_k |τ_g,k| / τ_max,k; above 1 the arm cannot hold the pose statically. */
  torqueRatio: number[];
  /** Smallest normalized distance to a joint limit (0 at a limit, 0.5 centred). */
  limitMargin: number[];
  reach: number[];
}

export function sampleWorkspace(chain: Chain, count: number, torqueLimits: number[] | null, seed = 0): WorkspaceSamples {
  const next = rng(seed);
  const base = chain.base.p;
  const out: WorkspaceSamples = { points: [], manipulability: [], torqueRatio: [], limitMargin: [], reach: [] };
  for (let i = 0; i < count; i++) {
    const q = chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
    const f = chainFrames(chain, q);
    const p = f.tip.p;
    out.points.push(p);
    out.reach.push(Math.hypot(p[0] - base[0], p[1] - base[1], p[2] - base[2]));
    out.manipulability.push(jacobianSVD(jacobianAt(chain, f, p).Jv).manipulability);
    const tau = torqueLimits ? gravityLoad(chain, q).torque : null;
    out.torqueRatio.push(tau ? Math.max(...tau.map((t, k) => Math.abs(t) / torqueLimits![k])) : 0);
    out.limitMargin.push(Math.min(...chain.joints.map((j, k) => Math.min(q[k] - j.limits[0], j.limits[1] - q[k]) / (j.limits[1] - j.limits[0]))));
  }
  return out;
}
