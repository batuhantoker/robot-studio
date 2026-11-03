/**
 * Whole-body position IK: stack every targeted end effector's Jacobian (3m × n over the robot's
 * joint vector) and take the same bounded DLS step as the single-chain solver, so shared joints
 * compromise between limbs instead of fighting. With one limb it reduces to `inverseKinematics`.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import { jacobianAt } from '../../chain/kinematics/jacobian';
import { type Limb, type RobotJoint, limbQ } from '../../chain/limbs/types';
import { solveN } from '../../math/decompose/solve-n';
import { type Vec3, norm, sub } from '../../math/linear/vec';
import { rng, uniform } from '../../math/random/rng';
import type { IkOptions, IkResult, IkStep } from './types';

export interface IkTarget {
  limb: number;
  point: Vec3;
}

function errors(limbs: Limb[], targets: IkTarget[], q: number[]) {
  return targets.map((t) => sub(t.point, chainFrames(limbs[t.limb].chain, limbQ(limbs[t.limb], q)).tip.p));
}

const stackedNorm = (e: Vec3[]) => Math.sqrt(e.reduce((s, v) => s + v[0] ** 2 + v[1] ** 2 + v[2] ** 2, 0));
const worst = (e: Vec3[]) => Math.max(0, ...e.map(norm));

function step(limbs: Limb[], n: number, targets: IkTarget[], q: number[]) {
  const rows: number[][] = [];
  const e: number[] = [];
  for (const t of targets) {
    const limb = limbs[t.limb];
    const f = chainFrames(limb.chain, limbQ(limb, q));
    const { Jv } = jacobianAt(limb.chain, f, f.tip.p);
    const err = sub(t.point, f.tip.p);
    for (let r = 0; r < 3; r++) {
      const row = new Array<number>(n).fill(0);
      limb.index.forEach((i, k) => (row[i] += Jv[r][k]));
      rows.push(row);
      e.push(err[r]);
    }
  }
  const fro = Math.sqrt(rows.reduce((s, r) => s + r.reduce((a, v) => a + v * v, 0), 0));
  const lambda = 1e-3 * Math.max(fro, 1e-3);
  const A = rows.map((ri, i) => rows.map((rj, j) => ri.reduce((s, v, k) => s + v * rj[k], 0) + (i === j ? lambda * lambda : 0)));
  const y = solveN(A, e);
  const dq = new Array<number>(n).fill(0);
  rows.forEach((r, i) => r.forEach((v, k) => (dq[k] += v * y[i])));
  const size = Math.hypot(...dq);
  const shrink = Math.min(1, 0.5 / Math.max(size, 1e-15));
  return { lambda, dq: dq.map((v) => v * shrink) };
}

export function solveWholeBody(limbs: Limb[], joints: RobotJoint[], targets: IkTarget[], q0: number[], opts: IkOptions = {}): IkResult {
  const { tol = 1e-5, maxIter = 200, restarts = 4, seed = 0 } = opts;
  const clip = (q: number[]) => q.map((v, i) => Math.min(Math.max(v, joints[i].limits[0]), joints[i].limits[1]));
  const involved = new Set(targets.flatMap((t) => limbs[t.limb].index));
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
      const { lambda, dq } = step(limbs, joints.length, targets, q);
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
