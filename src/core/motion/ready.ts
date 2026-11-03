/**
 * A ready stance for leg motions. A straight leg is singular (no first-order way to lift the foot),
 * so IK from it pushes knees into hyperextension. Ease leg joints parked near a limit into range.
 */
import { type LimbRole } from './roles';
import type { MotionRobot } from './types';

const NEAR = 0.12;
const INSIDE = 0.18;

export function readyPose(robot: MotionRobot, q0: number[], roles: LimbRole[]): number[] {
  return easeOffLimits(robot, q0, roles.filter((r) => r.role === 'leg').flatMap((r) => robot.limbs[r.limb].index));
}

/** Hinges parked within `near` of a limit move `inside` of the span into range (fractions of the span). */
export function easeOffLimits(robot: MotionRobot, q0: number[], joints: number[], near = NEAR, inside = INSIDE): number[] {
  const q = [...q0];
  for (const i of joints) {
    const j = robot.joints[i];
    if (j.continuous || j.type !== 'hinge') continue;
    const [lo, hi] = j.limits, span = hi - lo;
    if (q[i] - lo < near * span) q[i] = lo + inside * span;
    else if (hi - q[i] < near * span) q[i] = hi - inside * span;
  }
  return q;
}
