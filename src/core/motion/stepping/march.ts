/** Marching on the spot at a brisk pace, every length and time in proportion to the legs. */
import { chainFrames } from '../../chain/kinematics/frames';
import { limbQ } from '../../chain/limbs/types';
import { matVec } from '../../math/linear/mat3';
import { type Vec3, dot } from '../../math/linear/vec';
import type { Body } from '../body';
import type { Footing, MotionClip, MotionRobot } from '../types';
import { type Gait, steppingClip } from './clip';
import { legShape } from './foot';
import { firstRung } from './ladder';

/** What a rung of the ladder changes from the full march. */
interface Easier {
  slower?: number;
  wider?: number;
  descent?: number;
  toes?: number;
  bend?: number;
}

const G = 9.81;
const THIGH = 0.96;
const SHIN = 0.15;

/** Half the width of the widest sole across the body, as the feet stand at `q0`. */
function soleHalf(robot: MotionRobot, q0: number[], footing: Footing, body: Body): number {
  return Math.max(...[...footing.feet].map(([limb, shape]) => {
    const l = robot.limbs[limb], R = chainFrames(l.chain, limbQ(l, q0)).tip.R;
    const across = shape.sole.map((p) => dot(matVec(R, p), body.left));
    return 0.5 * (Math.max(...across) - Math.min(...across));
  }));
}

export function marchGait(robot: MotionRobot, q0: number[], body: Body, footing: Footing, size: number, { slower = 1, wider = 1, descent = 0.3, toes = 1, bend }: Easier = {}): Gait {
  const legs = body.parts.filter((p) => p.kind === 'leg');
  const L = body.hip - footing.floor;
  const period = 4.5 * slower * Math.sqrt(L / G);
  const shape = legs.map((p) => legShape(robot, q0, p.limb, body.left)).find(Boolean);
  const thigh = Math.min(THIGH * size, 1.3), shin = SHIN * size;
  // The thigh raised and the shin hanging a little behind plumb fix where the foot goes.
  const [ahead, height] = shape
    ? [shape.thigh * Math.sin(thigh) - shape.shin * Math.sin(shin), shape.thigh * (1 - Math.cos(thigh)) + shape.shin * (1 - Math.cos(shin))]
    : [0.27 * L * size, 0.21 * L * size];
  const across = (pick: (p: (typeof legs)[number]) => Vec3) => legs.reduce((sum, p) => sum + Math.abs(dot(pick(p), body.left)), 0) / legs.length;
  // The first joint can sit well inboard of where the thigh really starts, so the feet as they stand count too.
  const hips = across((p) => p.role.base), feet = across((p) => p.role.tip);
  return {
    period, lead: 0.45 * period, air: 0.5, peel: 0.12, heelRise: 0.2,
    lifts: legs.map((p, i) => (p.side === 'left' || (p.side === 'centre' && i === 0) ? 0 : 0.5)),
    height, ahead, landing: 0.08 * size * toes, descent, bend,
    stance: Math.max(1.1 * hips, 0.595 * feet, 1.8 * soleHalf(robot, q0, footing, body)), outward: 0.6,
    knee: 0.17, dip: 0.024 * L,
    hipTurn: 0.03 * size, shoulderTurn: 0.03 * size, hipRoll: 0.05, lean: 0.045, trunkShare: 0.1,
    armForward: 0.38 * size, armBack: 0.38 * size, handShare: 0.975, handFold: 0.005 * size, armOut: 0.125 * wider, armTwist: 0.05,
  };
}

/**
 * Steps to try in turn until the ZMP stays under the feet and nothing touches, the cheapest changes first: a steep
 * descent costs balance, wider arms cost nothing, a light body may need a flat landing or a softer one, a smaller step costs the march.
 */
const EASIER: (Easier & { size?: number })[] = [
  {}, { descent: 0 }, { descent: 0, wider: 2 }, { descent: 0, wider: 3.2 },
  { descent: 0, toes: 0.3 }, { descent: 0, wider: 2, toes: 0 }, { descent: 0, wider: 2, toes: 0, slower: 1.15 },
  { descent: 0, wider: 2, bend: 0.3, slower: 1.15 }, { descent: 0, wider: 2.5, bend: 0.3, slower: 1.3 }, { descent: 0, wider: 2.5, toes: 0, slower: 1.3 }, { descent: 0, wider: 2.5, bend: 0.3, slower: 1.45 },
  { size: 0.9, descent: 0, wider: 2, slower: 1.1 }, { size: 0.8, descent: 0, wider: 2.5, slower: 1.2 }, { size: 0.8, descent: 0, wider: 2.5, bend: 0.3, slower: 1.3 },
  { size: 0.7, descent: 0, wider: 3.2, slower: 1.3 }, { size: 0.7, descent: 0, wider: 3.2, bend: 0.3, slower: 1.4 },
];

/** March at a known rung of EASIER. */
export function marchAt(robot: MotionRobot, q0: number[], footing: Footing, body: Body, size: number, rung: number): MotionClip | null {
  const { size: k = 1, ...easier } = EASIER[rung];
  return steppingClip(robot, q0, footing, body, marchGait(robot, q0, body, footing, size * k, easier));
}

/** The first rung the body can balance on without touching itself, or null. */
export const marchRung = (robot: MotionRobot, q0: number[], footing: Footing, body: Body, size = 1, budget = Infinity): number | null =>
  firstRung(EASIER.length, (rung) => marchAt(robot, q0, footing, body, size, rung), footing.touches, budget);

/** As big as the body can balance without touching itself; null if it cannot march. */
export function marchClip(robot: MotionRobot, q0: number[], footing: Footing, body: Body, size: number): MotionClip | null {
  const rung = marchRung(robot, q0, footing, body, size);
  return rung === null ? null : marchAt(robot, q0, footing, body, size, rung);
}
