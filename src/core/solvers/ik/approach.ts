/**
 * Position IK that also turns the tool's approach axis onto a direction (a top-down grasp).
 * DLS on [Jv; L·Jw] against [goal − p; L·θ·n] (axis-angle from tool axis to goal direction), then a
 * position-only polish, so arms that cannot point the tool still land exactly and report the tilt.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import { jacobianAt } from '../../chain/kinematics/jacobian';
import type { Chain } from '../../chain/model/types';
import { solveN } from '../../math/decompose/solve-n';
import { matVec } from '../../math/linear/mat3';
import { type Vec3, cross, dot, norm, normalize, perpendicular, scale, sub } from '../../math/linear/vec';
import { rng, uniform } from '../../math/random/rng';
import { inverseKinematics } from './dls';

export interface ApproachResult {
  q: number[];
  /** Tool point error (m) and angle between the tool axis and the wanted direction (rad). */
  position: number;
  tilt: number;
}

/** `axis` is the tool's approach in the last chain frame; `length` weighs radians against metres. */
export function approachIk(chain: Chain, goal: Vec3, dir: Vec3, axis: Vec3, q0: number[], length: number, attempts = 4, seed = 0): ApproachResult {
  const d = normalize(dir);
  const clip = (q: number[]) => q.map((v, i) => Math.min(Math.max(v, chain.joints[i].limits[0]), chain.joints[i].limits[1]));
  const errors = (q: number[]) => {
    const f = chainFrames(chain, q);
    const a = normalize(matVec(f.tip.R, axis));
    const tilt = Math.acos(Math.min(Math.max(dot(a, d), -1), 1));
    const n = norm(cross(a, d)) > 1e-9 ? normalize(cross(a, d)) : perpendicular(a);
    return { f, e: [...sub(goal, f.tip.p), ...scale(n, tilt * length)], tilt };
  };
  const cost = (q: number[]) => Math.hypot(...errors(q).e);
  const next = rng(seed);
  let best = clip(q0);
  for (let attempt = 0; attempt < attempts; attempt++) {
    let q = attempt === 0 ? [...best] : chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
    for (let it = 0; it < 120; it++) {
      const { f, e } = errors(q);
      const { Jv, Jw } = jacobianAt(chain, f, f.tip.p);
      const J = [...Jv, ...Jw.map((row) => row.map((v) => v * length))];
      const lambda = 1e-3 + 0.05 * Math.hypot(...e);
      const A = J.map((ri, i) => J.map((rj, j) => ri.reduce((s, v, k) => s + v * rj[k], 0) + (i === j ? lambda * lambda : 0)));
      const y = solveN(A, e);
      const dq = q.map((_, k) => J.reduce((s, row, r) => s + row[k] * y[r], 0));
      const shrink = Math.min(1, 0.5 / Math.max(Math.hypot(...dq), 1e-15));
      const now = Math.hypot(...e);
      let moved = false;
      for (let b = 0; b < 8 && !moved; b++) {
        const c = clip(q.map((v, k) => v + dq[k] * shrink * 0.5 ** b));
        if (cost(c) < now) [q, moved] = [c, true];
      }
      if (!moved || now < 1e-6) break;
    }
    if (cost(q) < cost(best)) best = q;
    if (errors(best).tilt < 0.02 && norm(sub(goal, chainFrames(chain, best).tip.p)) < 1e-3) break;
  }
  // The orientation rows can hold position off its goal on arms that cannot point the tool.
  const polished = inverseKinematics(chain, goal, best, { restarts: 0, maxIter: 60 });
  const q = polished.residual < norm(sub(goal, chainFrames(chain, best).tip.p)) ? polished.q : best;
  return { q, position: norm(sub(goal, chainFrames(chain, q).tip.p)), tilt: errors(q).tilt };
}
