/** Keep a whole-robot pose inside its joint ranges: clamp limited joints, wrap continuous ones. */
import type { RobotJoint } from './types';

const TAU = 2 * Math.PI;

export function enforceLimits(joints: RobotJoint[], q: number[]): number[] {
  return q.map((v, i) => {
    const [lo, hi] = joints[i].limits;
    if (joints[i].continuous) return lo + ((((v - lo) % TAU) + TAU) % TAU);
    return Math.min(Math.max(v, lo), hi);
  });
}

/** Which joints sit on (or within `tol` of) a limit; continuous joints never do. */
export const atLimit = (joints: RobotJoint[], q: number[], tol = 1e-3): boolean[] =>
  q.map((v, i) => !joints[i].continuous && (v <= joints[i].limits[0] + tol || v >= joints[i].limits[1] - tol));
