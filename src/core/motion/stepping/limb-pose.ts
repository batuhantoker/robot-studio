/** One limb to a full tip pose by damped least squares: a planted foot holds its heading as well as its spot and tilt. */
import { chainFrames } from '../../chain/kinematics/frames';
import { jacobianAt } from '../../chain/kinematics/jacobian';
import { type Limb, type RobotJoint, limbQ } from '../../chain/limbs/types';
import { solveN } from '../../math/decompose/solve-n';
import { type Mat3, matMul, transpose } from '../../math/linear/mat3';
import { type Transform, applyTransform } from '../../math/linear/transform';
import { type Vec3, norm, scale, sub } from '../../math/linear/vec';

/** Metres one radian of tip error counts for; a limb short of six joints gives up tilt before position. */
const TURN = 0.2;
const LOOSE = 0.03;
/** For a limb short of six joints: a sole may lean a little rather than the foot miss its spot. */
const SHORT = 0.06;
const DAMP = 1e-4;

/** World rotation vector taking `from` onto `to`. */
export function rotationError(to: Mat3, from: Mat3): Vec3 {
  const E = matMul(to, transpose(from));
  const v: Vec3 = [E[7] - E[5], E[2] - E[6], E[3] - E[1]];
  const s = norm(v) / 2, c = (E[0] + E[4] + E[8] - 1) / 2;
  return s > 1e-12 ? scale(v, Math.atan2(s, c) / (2 * s)) : [0, 0, 0];
}

const UP: Vec3 = [0, 0, 1];

/** One damped step of the limb's joints along the rows of `J` toward closing `e`, with those in `held` left alone. */
function descend(J: number[][], e: number[], cur: number[], { index }: Limb, joints: RobotJoint[], held?: ReadonlySet<number>): void {
  const n = index.length, movable = index.map((i) => !held?.has(i));
  const solve = (free: boolean[]) => {
    const A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (__, b) => (free[a] && free[b] ? J.reduce((s, r) => s + r[a] * r[b], 0) : 0) + (a === b ? DAMP : 0)));
    return solveN(A, Array.from({ length: n }, (_, a) => (free[a] ? J.reduce((s, r, k) => s + r[a] * e[k], 0) : 0)));
  };
  let dq = solve(movable);
  // A joint pushing into its stop gets nowhere and drags the rest with it: solve again without it.
  const free = cur.map((v, i) => {
    const [lo, hi] = joints[index[i]].limits;
    return movable[i] && !((dq[i] > 0 && v >= hi - 1e-9) || (dq[i] < 0 && v <= lo + 1e-9));
  });
  if (free.some((f, i) => f !== movable[i])) dq = solve(free);
  const size = Math.hypot(...dq), k = Math.min(1, 0.4 / Math.max(size, 1e-12));
  dq.forEach((d, i) => {
    const [lo, hi] = joints[index[i]].limits;
    cur[i] = Math.min(Math.max(cur[i] + d * k, lo), hi);
  });
}

/**
 * Writes the limb's joints into `q`; returns the remaining position error plus weighted tilt (m). A limb short of six
 * joints cannot also hold its heading, so it keeps position and level and lets the foot turn about the vertical. `loose`
 * is for a foot in the air: where it points is a wish, and an ankle on its stop must not fail the step.
 */
export function reachPose(limb: Limb, joints: RobotJoint[], target: Transform, q: number[], loose = false, held?: ReadonlySet<number>, iterations = 30, tol = 2e-6): number {
  const { chain, index } = limb, n = index.length, level = n < 6, turn = loose ? LOOSE : level ? SHORT : TURN;
  const flat = (v: Vec3): Vec3 => (level ? sub(v, scale(UP, v[2])) : v);
  const cur = limbQ(limb, q);
  let left = Infinity;
  for (let it = 0; it <= iterations; it++) {
    const f = chainFrames(chain, cur);
    const tilt = flat(rotationError(target.R, f.tip.R));
    const e = [...sub(target.p, f.tip.p), ...scale(tilt, turn)];
    left = loose ? norm(sub(target.p, f.tip.p)) : Math.hypot(...e);
    if (Math.hypot(...e) < tol || it === iterations) break;
    const { Jv, Jw } = jacobianAt(chain, f, f.tip.p);
    descend([...Jv, ...Jw.map((r, k) => r.map((v) => (level && k === 2 ? 0 : v * turn)))], e, cur, limb, joints, held);
  }
  index.forEach((i, k) => (q[i] = cur[k]));
  return left;
}

/** A foot too simple to set flat: only `point`, fixed to the tip, goes to `spot`. Writes the limb's joints into `q`; returns how far it is left (m). */
export function reachPoint(limb: Limb, joints: RobotJoint[], spot: Vec3, point: Vec3, q: number[], held?: ReadonlySet<number>, iterations = 30, tol = 2e-6): number {
  const { chain, index } = limb, cur = limbQ(limb, q);
  let left = Infinity;
  for (let it = 0; it <= iterations; it++) {
    const f = chainFrames(chain, cur), at = applyTransform(f.tip, point), e = sub(spot, at);
    left = norm(e);
    if (left < tol || it === iterations) break;
    descend(jacobianAt(chain, f, at).Jv, e, cur, limb, joints, held);
  }
  index.forEach((i, k) => (q[i] = cur[k]));
  return left;
}
