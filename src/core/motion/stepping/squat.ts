/** Sinking and rising with every foot planted: a squat on two legs, arms out to balance it, a bob on more. */
import type { Body } from '../body';
import type { Footing, MotionClip, MotionRobot } from '../types';
import { type Gait, steppingClip } from './clip';
import { firstRung } from './ladder';
import { QUIET } from './legged';

const G = 9.81;
/** Sizes to try in turn. */
const EASIER = [1, 0.8, 0.6, 0.45, 0.3];

export function squatGait(body: Body, footing: Footing, size: number): Gait {
  const legs = body.parts.filter((p) => p.kind === 'leg'), L = body.hip - footing.floor, two = legs.length === 2;
  const period = 9 * Math.sqrt(L / G);
  return {
    ...QUIET, period, lead: 0.5 * period, lifts: legs.map(() => 0), air: 0, knee: two ? 0.17 : 0, crouch: two ? 0.05 : 0.08,
    bob: (two ? 0.34 : 0.16) * L * size, bow: two ? 0.5 * size : 0, armForward: two ? 1.2 * size : 0,
    handShare: two ? 0.97 : 1, armOut: two ? 0.15 : 0,
  };
}

export function squatAt(robot: MotionRobot, q0: number[], footing: Footing, body: Body, size: number, rung: number): MotionClip | null {
  return steppingClip(robot, q0, footing, body, squatGait(body, footing, size * EASIER[rung]));
}

export const squatRung = (robot: MotionRobot, q0: number[], footing: Footing, body: Body, size = 1, budget = Infinity): number | null =>
  firstRung(EASIER.length, (rung) => squatAt(robot, q0, footing, body, size, rung), footing.touches, budget);
