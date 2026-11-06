/**
 * One control step of a limb toward a tool goal, for driving it by hand: damped so a singularity slows it instead
 * of flinging it, capped so no joint outruns `maxStep`, and able to say why it stopped short.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import { jacobianAt } from '../../chain/kinematics/jacobian';
import { type Limb, type RobotJoint, limbQ } from '../../chain/limbs/types';
import { solveN } from '../../math/decompose/solve-n';
import type { Mat3 } from '../../math/linear/mat3';
import { applyTransform } from '../../math/linear/transform';
import { type Vec3, norm, scale, sub } from '../../math/linear/vec';
import { rotationError } from '../../motion/stepping/limb-pose';

export interface ToolGoal {
  p: Vec3;
  /** Held too when given; leave it out on a limb short of six joints. */
  R?: Mat3;
}

export interface ServoOptions {
  /** Most a hinge turns in this step (rad); a slide moves a quarter of that in metres. */
  maxStep: number;
  /** The point driven, in the tip frame. */
  point?: Vec3;
  /** Robot joints left where they are. */
  held?: ReadonlySet<number>;
  /** A whole-robot pose spare joints drift back toward, so a 7-axis arm keeps its elbow. */
  posture?: number[];
}

export type Stop = { kind: 'limit'; joint: number } | { kind: 'reach' } | null;

export interface ServoResult {
  q: number[];
  /** Distance still to go (m), with any turn weighed in. */
  left: number;
  /** Why it stalled; null while it is getting somewhere. */
  stop: Stop;
}

const PASSES = 3;
/** Metres one radian of tool error counts for. */
const TURN = 0.3;
const DAMP = 0.01;
/** Damping grows until the raw step is within this many capped steps: past that the arm is at a singularity. */
const WILD = 6;
const POSTURE = 0.05;
const DONE = 1e-5;
/** Under this share of the way there, with no cap holding it back, the limb has stalled. */
const STALLED = 0.25;

function dampedStep(J: number[][], e: number[], free: boolean[], damp: number): { dq: number[]; solve: (v: number[]) => number[] } {
  const rows = J.length, n = free.length;
  const A = J.map((a, i) => J.map((b, j) => a.reduce((s, v, k) => s + (free[k] ? v * b[k] : 0), 0) + (i === j ? damp * damp : 0)));
  const solve = (v: number[]) => {
    const y = solveN(A, v);
    return Array.from({ length: n }, (_, k) => (free[k] ? Array.from({ length: rows }, (__, r) => J[r][k] * y[r]).reduce((s, x) => s + x, 0) : 0));
  };
  return { dq: solve(e), solve };
}

export function servo(limb: Limb, joints: RobotJoint[], q: number[], goal: ToolGoal, { maxStep, point = [0, 0, 0], held, posture }: ServoOptions): ServoResult {
  const { chain, index } = limb, n = index.length;
  const cap = index.map((i) => (joints[i].type === 'hinge' ? maxStep : 0.25 * maxStep));
  const start = limbQ(limb, q), cur = [...start];
  const clamp = (k: number, v: number) => (joints[index[k]].continuous ? v : Math.min(Math.max(v, joints[index[k]].limits[0]), joints[index[k]].limits[1]));
  const onStop = (k: number, v: number) => !joints[index[k]].continuous && ((v > 0 && cur[k] >= joints[index[k]].limits[1] - 1e-9) || (v < 0 && cur[k] <= joints[index[k]].limits[0] + 1e-9));
  const errorAt = (x: number[]) => {
    const f = chainFrames(chain, x), at = applyTransform(f.tip, point);
    return { f, at, e: [...sub(goal.p, at), ...(goal.R ? scale(rotationError(goal.R, f.tip.R), TURN) : [])] };
  };
  const first = errorAt(cur), before = Math.hypot(...first.e);
  let pushing = -1;
  for (let pass = 0; pass < PASSES; pass++) {
    const { f, at, e } = errorAt(cur);
    if (Math.hypot(...e) < DONE) break;
    const { Jv, Jw } = jacobianAt(chain, f, at);
    const J = goal.R ? [...Jv, ...Jw.map((r) => r.map((v) => v * TURN))] : Jv;
    const free = index.map((i) => !held?.has(i));
    let damp = DAMP, step = dampedStep(J, e, free, damp);
    const wild = () => step.dq.some((v, k) => Math.abs(v) > WILD * cap[k]);
    for (let i = 0; i < 6 && wild(); i++) step = dampedStep(J, e, free, (damp *= 3));
    // A joint pushing into its stop gets nowhere and drags the rest with it: solve again without it.
    pushing = -1;
    step.dq.forEach((v, k) => {
      if (!free[k] || !onStop(k, v)) return;
      free[k] = false;
      pushing = index[k];
    });
    if (pushing >= 0) step = dampedStep(J, e, free, damp);
    const dq = [...step.dq];
    if (posture && n > J.length) {
      const z = index.map((i, k) => (free[k] ? POSTURE * (posture[i] - cur[k]) : 0));
      const back = step.solve(J.map((r) => r.reduce((s, v, k) => s + v * z[k], 0)));
      dq.forEach((_, k) => (dq[k] += z[k] - back[k]));
    }
    dq.forEach((v, k) => (cur[k] = clamp(k, cur[k] + v)));
  }
  // One uniform scale keeps the tool on its line when the cap bites.
  const over = Math.max(1, ...cur.map((v, k) => Math.abs(v - start[k]) / cap[k]));
  const out = cur.map((v, k) => start[k] + (v - start[k]) / over);
  const next = [...q];
  index.forEach((i, k) => (next[i] = out[k]));
  const last = errorAt(out), left = Math.hypot(...last.e);
  const moved = Math.hypot(...sub(last.at, first.at)) + (goal.R ? TURN * norm(rotationError(last.f.tip.R, first.f.tip.R)) : 0);
  const stalled = before > 1e-4 && moved < STALLED * (over > 1 ? 0.2 * before : before);
  return { q: next, left, stop: !stalled ? null : pushing >= 0 ? { kind: 'limit', joint: pushing } : { kind: 'reach' } };
}
