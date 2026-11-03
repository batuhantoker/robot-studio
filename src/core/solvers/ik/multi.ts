/**
 * Whole-body position IK: stack every targeted end effector's Jacobian (3m × n over the robot's
 * joint vector) and take the same bounded DLS step as the single-chain solver, so shared joints
 * compromise between limbs instead of fighting. With one limb it reduces to `inverseKinematics`.
 * A target may also hold its tip's orientation, as a foot on the ground must.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import { jacobianAt } from '../../chain/kinematics/jacobian';
import { type Limb, type RobotJoint, limbQ } from '../../chain/limbs/types';
import { solveN } from '../../math/decompose/solve-n';
import { matVec } from '../../math/linear/mat3';
import { type Vec3, cross, dot, norm, normalize, scale, sub } from '../../math/linear/vec';
import { rng, uniform } from '../../math/random/rng';
import type { IkOptions, IkResult, IkStep } from './types';

export interface IkTarget {
  limb: number;
  point: Vec3;
  /** Also keep this axis of the tip frame pointing straight up (a sole kept flat, free to turn about it), weighed `weight` m/rad. */
  level?: Vec3;
  weight?: number;
}

export interface WholeBodyOptions extends IkOptions {
  /** Robot joints held where they are (a waist kept still while the arms work). */
  fixed?: ReadonlySet<number>;
  /** A pose redundant joints drift back toward, in the targets' null space, so a 7-axis arm keeps its elbow where it was. */
  posture?: number[];
}

const UP: Vec3 = [0, 0, 1];

/** Rotation vector (world) tipping axis `a` onto vertical. */
function tilt(a: Vec3): Vec3 {
  const c = cross(a, UP), s = norm(c);
  return s > 1e-12 ? scale(c, Math.atan2(s, dot(a, UP)) / s) : [0, 0, 0];
}

/** Per target, its position error and (when it is kept level) its weighted tilt. */
function errors(limbs: Limb[], targets: IkTarget[], q: number[]) {
  return targets.flatMap((t) => {
    const tip = chainFrames(limbs[t.limb].chain, limbQ(limbs[t.limb], q)).tip;
    const p = sub(t.point, tip.p);
    return t.level ? [p, scale(tilt(normalize(matVec(tip.R, t.level))), t.weight ?? 0.1)] : [p];
  });
}

const stackedNorm = (e: Vec3[]) => Math.sqrt(e.reduce((s, v) => s + v[0] ** 2 + v[1] ** 2 + v[2] ** 2, 0));
const worst = (e: Vec3[]) => Math.max(0, ...e.map(norm));

function step(limbs: Limb[], n: number, targets: IkTarget[], q: number[], fixed?: ReadonlySet<number>, posture?: number[]) {
  const rows: number[][] = [];
  const e: number[] = [];
  for (const t of targets) {
    const limb = limbs[t.limb];
    const f = chainFrames(limb.chain, limbQ(limb, q));
    const { Jv, Jw } = jacobianAt(limb.chain, f, f.tip.p);
    const w = t.weight ?? 0.1;
    const blocks: [number[][], Vec3][] = [[Jv, sub(t.point, f.tip.p)]];
    if (t.level) {
      // Turning about the axis itself leaves it vertical: only the two tipping directions are held.
      const a = normalize(matVec(f.tip.R, t.level));
      const J = [0, 1, 2].map((r) => Jw[r].map((_, k) => w * (Jw[r][k] - a[r] * (a[0] * Jw[0][k] + a[1] * Jw[1][k] + a[2] * Jw[2][k]))));
      blocks.push([J, scale(tilt(a), w)]);
    }
    for (const [J, err] of blocks) {
      for (let r = 0; r < 3; r++) {
        const row = new Array<number>(n).fill(0);
        limb.index.forEach((i, k) => (fixed?.has(i) ? 0 : (row[i] += J[r][k])));
        rows.push(row);
        e.push(err[r]);
      }
    }
  }
  const fro = Math.sqrt(rows.reduce((s, r) => s + r.reduce((a, v) => a + v * v, 0), 0));
  const lambda = 1e-3 * Math.max(fro, 1e-3);
  const A = rows.map((ri, i) => rows.map((rj, j) => ri.reduce((s, v, k) => s + v * rj[k], 0) + (i === j ? lambda * lambda : 0)));
  const y = solveN(A, e);
  const dq = new Array<number>(n).fill(0);
  rows.forEach((r, i) => r.forEach((v, k) => (dq[k] += v * y[i])));
  if (posture) {
    const pull = q.map((v, k) => (fixed?.has(k) || !rows.some((r) => r[k] !== 0) ? 0 : 0.2 * (posture[k] - v)));
    const z = solveN(A, rows.map((r) => r.reduce((s, v, k) => s + v * pull[k], 0)));
    pull.forEach((v, k) => (dq[k] += v - rows.reduce((s, r, i) => s + r[k] * z[i], 0)));
  }
  const size = Math.hypot(...dq);
  const shrink = Math.min(1, 0.5 / Math.max(size, 1e-15));
  return { lambda, dq: dq.map((v) => v * shrink) };
}

export function solveWholeBody(limbs: Limb[], joints: RobotJoint[], targets: IkTarget[], q0: number[], opts: WholeBodyOptions = {}): IkResult {
  const { tol = 1e-5, maxIter = 200, restarts = 4, seed = 0, fixed, posture } = opts;
  const clip = (q: number[]) => q.map((v, i) => (fixed?.has(i) ? q0[i] : Math.min(Math.max(v, joints[i].limits[0]), joints[i].limits[1])));
  const involved = new Set(targets.flatMap((t) => limbs[t.limb].index).filter((i) => !fixed?.has(i)));
  const next = rng(seed);
  let bestQ = clip(q0), bestError = Infinity;
  const steps: IkStep[] = [];
  for (let attempt = 0; attempt <= restarts; attempt++) {
    let q = attempt === 0 ? [...bestQ] : bestQ.map((v, i) => (involved.has(i) ? uniform(next, joints[i].limits[0], joints[i].limits[1]) : v));
    for (let iteration = 0; iteration <= maxIter; iteration++) {
      const e = errors(limbs, targets, q);
      const residual = worst(e), total = stackedNorm(e);
      if (residual < bestError) [bestQ, bestError] = [[...q], residual];
      if (residual <= tol) {
        steps.push({ attempt, iteration, q: [...q], residual, lambda: 0, stepNorm: 0, backtracks: 0 });
        return { q, success: true, residual, steps };
      }
      if (iteration === maxIter) break;
      let { lambda, dq } = step(limbs, joints.length, targets, q, fixed, posture);
      // A step pushing joints past a limit would be clipped back to no progress; take them out and solve again.
      for (let pass = 0, held = new Set(fixed); pass < 3; pass++) {
        const stuck = dq.flatMap((d, i) => (!held.has(i) && ((d > 0 && q[i] >= joints[i].limits[1] - 1e-9) || (d < 0 && q[i] <= joints[i].limits[0] + 1e-9)) ? [i] : []));
        if (!stuck.length) break;
        stuck.forEach((i) => held.add(i));
        ({ lambda, dq } = step(limbs, joints.length, targets, q, held, posture));
      }
      let accepted = -1;
      for (let b = 0; b < 12 && accepted < 0; b++) {
        const candidate = clip(q.map((v, i) => v + dq[i] * 0.5 ** b));
        if (stackedNorm(errors(limbs, targets, candidate)) < total) [q, accepted] = [candidate, b];
      }
      steps.push({ attempt, iteration, q: [...q], residual, lambda, stepNorm: Math.hypot(...dq), backtracks: accepted });
      if (accepted < 0) break;
    }
  }
  return { q: bestQ, success: false, residual: bestError, steps };
}
