/** Trajectory playback over the whole-robot joint vector; profiles follow the focused limb. */
import { gravityLoad } from '../../../core/analysis/statics/gravity';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { positionJacobian } from '../../../core/chain/kinematics/jacobian';
import { type Limb, limbQ } from '../../../core/chain/limbs/types';
import type { Vec3 } from '../../../core/math/linear/vec';
import { quinticAt } from '../../../core/trajectory/quintic/profile';

export interface PathProfile {
  t: number[];
  q: number[][];
  tool: Vec3[];
  speed: number[];
  torque: number[][];
}

export function stateAt(limits: [number, number][], waypoints: number[][], duration: number, t: number) {
  const s = quinticAt(waypoints, duration, Math.min(Math.max(t, 0), duration));
  return { q: s.q.map((v, k) => Math.min(Math.max(v, limits[k][0]), limits[k][1])), qd: s.qd };
}

export function profile(limits: [number, number][], limb: Limb, waypoints: number[][], duration: number, samples = 240): PathProfile {
  const out: PathProfile = { t: [], q: [], tool: [], speed: [], torque: [] };
  for (let i = 0; i <= samples; i++) {
    const t = (duration * i) / samples;
    const { q, qd } = stateAt(limits, waypoints, duration, t);
    const lq = limbQ(limb, q), lqd = limbQ(limb, qd);
    const J = positionJacobian(limb.chain, lq);
    out.t.push(t);
    out.q.push(q);
    out.tool.push(chainFrames(limb.chain, lq).tip.p);
    out.speed.push(Math.hypot(...J.map((row) => row.reduce((s, x, k) => s + x * lqd[k], 0))));
    out.torque.push(gravityLoad(limb.chain, lq).torque);
  }
  return out;
}
