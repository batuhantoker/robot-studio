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

/** Joints held at given values at phase s (a waist kept still, or turned on a script). */
export type Pins = (s: number) => Map<number, number>;

export interface ClipOptions {
  pins?: Pins;
  /** Per limb, a tip-frame axis kept pointing up while its target moves (feet kept flat on the ground). */
  level?: Map<number, Vec3>;
  /** Redundant joints drift back toward this pose (see solveWholeBody). */
  posture?: number[];
}

export function taskClip(robot: MotionRobot, q0: number[], path: TargetPath, period: number, samples = 48, { pins, posture, level }: ClipOptions = {}): MotionClip {
  const solve = (s: number, from: number[], restarts: number, maxIter = 80) => {
    const held = pins?.(s);
    const start = held?.size ? from.map((v, i) => held.get(i) ?? v) : from;
    const targets = path(s).flatMap((point, limb) => (point ? [{ limb, point, level: level?.get(limb) }] : []));
    const fixed = held?.size ? new Set(held.keys()) : undefined;
    return targets.length ? solveWholeBody(robot.limbs, robot.joints, targets, start, { restarts, maxIter, fixed, posture }).q : start;
  };
  // Long enough from the warm start that random restarts (and their odd poses) are a last resort.
  let q = solve(0, q0, 2, 300);
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
