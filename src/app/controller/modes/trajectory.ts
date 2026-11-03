/** Trajectory playback over the whole-robot joint vector; profiles follow the focused limb. */
import { gravityLoad } from '../../../core/analysis/statics/gravity';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { positionJacobian } from '../../../core/chain/kinematics/jacobian';
import { type Limb, type RobotJoint, limbQ } from '../../../core/chain/limbs/types';
import type { Vec3 } from '../../../core/math/linear/vec';
import { solveWholeBody } from '../../../core/solvers/ik/multi';
import { type Plan, compile } from '../../../core/trajectory/plan';
import { quinticAt } from '../../../core/trajectory/quintic/profile';
import type { StudioState } from '../../state/types';

export interface PathProfile {
  t: number[];
  q: number[][];
  tool: Vec3[];
  speed: number[];
  torque: number[][];
}

/** Plain stops, even pacing: the analyze() profile. */
export function stateAt(limits: [number, number][], waypoints: number[][], duration: number, t: number) {
  const s = quinticAt(waypoints, duration, Math.min(Math.max(t, 0), duration));
  return { q: s.q.map((v, k) => Math.min(Math.max(v, limits[k][0]), limits[k][1])), qd: s.qd };
}

export const planOf = (st: Pick<StudioState, 'waypoints' | 'duration' | 'stopOpts' | 'pace'>): Plan =>
  ({ waypoints: st.waypoints, duration: st.duration, opts: st.stopOpts, pace: st.pace });

/** The plan as played: held to the joint ranges. Compile once, then sample as often as needed. */
export function player(limits: [number, number][], plan: Plan): (t: number) => { q: number[]; qd: number[] } {
  const c = compile(plan);
  return (t) => {
    const s = c.at(t);
    return { q: s.q.map((v, k) => Math.min(Math.max(v, limits[k][0]), limits[k][1])), qd: s.qd };
  };
}

export function profile(limits: [number, number][], limb: Limb, plan: Plan, samples = 240): PathProfile {
  const out: PathProfile = { t: [], q: [], tool: [], speed: [], torque: [] };
  const play = player(limits, plan);
  for (let i = 0; i <= samples; i++) {
    const t = (plan.duration * i) / samples;
    const { q, qd } = play(t);
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

const clip = (limits: [number, number][], q: number[]) => q.map((v, k) => Math.min(Math.max(v, limits[k][0]), limits[k][1]));

/** The limb's tool point at every stop, as played back (held to the joint ranges). */
export const stopTips = (limits: [number, number][], limb: Limb, waypoints: number[][]): Vec3[] =>
  waypoints.map((w) => chainFrames(limb.chain, limbQ(limb, clip(limits, w))).tip.p);

/**
 * Move stop i so the focused limb's tool point follows `point`, starting from the stop's own pose.
 * Every other limb's tool point is pinned, so shared joints (waist, torso) don't drag them along.
 */
export function dragStop(limbs: Limb[], joints: RobotJoint[], focus: number, waypoints: number[][], i: number, point: Vec3, maxIter = 40): number[][] {
  const limb = Math.min(Math.max(focus, 0), limbs.length - 1);
  const w = waypoints[i];
  const targets = limbs.map((l, j) => ({ limb: j, point: j === limb ? point : chainFrames(l.chain, limbQ(l, w)).tip.p }));
  const q = solveWholeBody(limbs, joints, targets, w, { restarts: 0, maxIter }).q;
  return waypoints.map((v, j) => (j === i ? q : v));
}
