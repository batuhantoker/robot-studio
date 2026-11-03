/**
 * A ready stance for leg motions. A straight leg is singular (no first-order way to lift the foot),
 * so IK from it pushes knees into hyperextension. Ease leg joints parked near a limit into range.
 */
import { type LimbRole } from './roles';
import type { MotionRobot } from './types';

const NEAR = 0.12;
const INSIDE = 0.18;

export function readyPose(robot: MotionRobot, q0: number[], roles: LimbRole[]): number[] {
  const q = [...q0];
  for (const r of roles) {
    if (r.role !== 'leg') continue;
    for (const i of robot.limbs[r.limb].index) {
      const j = robot.joints[i];
      if (j.continuous || j.type !== 'hinge') continue;
      const [lo, hi] = j.limits, span = hi - lo;
      if (q[i] - lo < NEAR * span) q[i] = lo + INSIDE * span;
      else if (hi - q[i] < NEAR * span) q[i] = hi - INSIDE * span;
    }
  }
  return q;
}
