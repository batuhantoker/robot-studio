/**
 * Task-space motion: tool-point paths per limb, turned into joint motion by whole-body IK solved
 * around the cycle (each sample warm-starts from the last), then splined into a seamless loop.
 */
import type { Vec3 } from '../../math/linear/vec';
import { enforceLimits } from '../../chain/limbs/limits';
import { solveWholeBody } from '../../solvers/ik/multi';
import { periodicSpline } from '../interpolate';
import type { MotionClip, MotionRobot } from '../types';

/** Targets per limb at cycle phase s in [0, 1); null leaves a limb free. */
export type TargetPath = (s: number) => (Vec3 | null)[];

export function taskClip(robot: MotionRobot, q0: number[], path: TargetPath, period: number, samples = 48): MotionClip {
  const solve = (s: number, from: number[], restarts: number) => {
    const targets = path(s).flatMap((point, limb) => (point ? [{ limb, point }] : []));
    return targets.length ? solveWholeBody(robot.limbs, robot.joints, targets, from, { restarts, maxIter: 80 }).q : from;
  };
  let q = solve(0, q0, 2);
  const out: number[][] = [];
  // Two laps: the second starts from the end of the first, so the loop closes without a jump.
  for (let lap = 0; lap < 2; lap++) {
    for (let k = 0; k < samples; k++) {
      q = solve(k / samples, q, 0);
      if (lap === 1) out.push(q);
    }
  }
  const spline = periodicSpline(out, period);
  // The spline can overshoot between samples near a limit; samples themselves are already in range.
  return { period, at: (t) => enforceLimits(robot.joints, spline(t)) };
}
