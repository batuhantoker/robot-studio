/** Stepping on the spot on four or six legs: alternate sets or one at a time, the body riding above its feet. */
import { dot } from '../../math/linear/vec';
import type { Body, BodyPart } from '../body';
import type { Footing, MotionClip, MotionRobot } from '../types';
import { type Gait, steppingClip } from './clip';
import { firstRung } from './ladder';

const G = 9.81;
/** A cycle no shorter than this (s): a small robot's scaled time is quicker than its servos or the eye. */
const BRISK = 0.6;

export type LegGait = 'trot' | 'tripod' | 'walk';

/** Along each side the legs alternate, and the two sides are opposite: diagonal pairs on four legs, tripods on six. */
function alternate(legs: BodyPart[], body: Body): number[] {
  const along = (p: BodyPart) => dot(p.role.tip, body.forward);
  return legs.map((p) => {
    const rank = legs.filter((o) => o.side === p.side).sort((a, b) => along(b) - along(a)).indexOf(p);
    return ((rank + (p.side === 'left' ? 0 : 1)) % 2) * 0.5;
  });
}

/** One foot at a time, hind then front up one side and then the other. */
const fourBeat = (legs: BodyPart[]) => legs.map((p) => (p.side === 'left' ? 0 : 0.5) + (p.front ? 0.25 : 0));

/** A gait with nothing but its legs at work: feet that stay flat of the ground's say, a body held square, arms left alone. */
export const QUIET = {
  peel: 0, heelRise: 0, height: 0, ahead: 0, landing: 0, descent: 0, stance: Infinity, outward: 0, knee: 0, dip: 0,
  hipTurn: 0, shoulderTurn: 0, hipRoll: 0, lean: 0, trunkShare: 0, armForward: 0, armBack: 0, handShare: 1, handFold: 0, armOut: 0, armTwist: 0,
};

export function leggedGait(body: Body, footing: Footing, kind: LegGait, size: number, slower = 1): Gait {
  const legs = body.parts.filter((p) => p.kind === 'leg'), L = body.hip - footing.floor;
  const beats = kind === 'walk' ? 4 : 2, period = slower * Math.max((kind === 'walk' ? 7 : 3.6) * Math.sqrt(L / G), beats * 0.5 * BRISK);
  return {
    ...QUIET, period, lead: 1.5 * period, lifts: kind === 'walk' ? fourBeat(legs) : alternate(legs, body), air: 0.84 / beats,
    // Six legs stand low and wide: the same step would hardly show.
    height: (legs.length > 4 ? 0.3 : 0.2) * L * size, ahead: 0.04 * L * size, dip: 0.012 * L, crouch: 0.12,
  };
}

/** Size and slowness to try in turn. */
const EASIER: [number, number][] = [[1, 1], [0.8, 1.1], [0.6, 1.25], [0.45, 1.4]];

export function leggedAt(kind: LegGait, robot: MotionRobot, q0: number[], footing: Footing, body: Body, size: number, rung: number): MotionClip | null {
  const [k, slower] = EASIER[rung];
  return steppingClip(robot, q0, footing, body, leggedGait(body, footing, kind, size * k, slower));
}

export const leggedRung = (kind: LegGait, robot: MotionRobot, q0: number[], footing: Footing, body: Body, size = 1, budget = Infinity): number | null =>
  firstRung(EASIER.length, (rung) => leggedAt(kind, robot, q0, footing, body, size, rung), footing.touches, budget);
