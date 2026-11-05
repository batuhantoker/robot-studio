/**
 * Hand moves a piloted humanoid makes on the go, from the motion presets' work paths: each plays once,
 * blending in from the walking arm swing and back out to it, while the legs keep stepping.
 */
import type { Vec3 } from '../../../core/math/linear/vec';
import type { Body } from '../../../core/motion/body';
import { type BenchFrame, type Pose, benchFrame, benchReach, reachAhead, twoHandLift, waveHand } from '../../../core/motion/paths/work';
import type { MotionRobot } from '../../../core/motion/types';

export interface HandAction {
  id: string;
  label: string;
  period: number;
  /** Hand targets at phase u in [0, 1]; null leaves that hand to the arm swing. */
  at(u: number): [Vec3 | null, Vec3 | null];
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** How much of the action's targets to use: eased in from, and back out to, the walking swing. */
export const blendOf = (u: number, edge = 0.14) => smooth(u / edge) * smooth((1 - u) / edge);

export function handActions(robot: MotionRobot, ready: number[], body: Body): { frame: BenchFrame; actions: HandAction[] } | null {
  const w = benchFrame(robot, ready, body);
  if (!w) return null;
  const both = (path: (s: number) => Pose) => (u: number): [Vec3, Vec3] => path(u).hands;
  const wave = waveHand(w, w.right, 1);
  return {
    frame: w,
    actions: [
      { id: 'wave', label: 'Wave', period: 3.2, at: (u) => [null, wave(u)] },
      { id: 'reach', label: 'Reach', period: 2.6, at: both(reachAhead(w, 1)) },
      { id: 'work', label: 'Work', period: 4.8, at: both(benchReach(w, 1)) },
      { id: 'lift', label: 'Lift', period: 5.2, at: both(twoHandLift(w, 1)) },
    ],
  };
}
