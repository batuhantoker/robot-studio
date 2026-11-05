/** Stops for a robot standing on its legs: the soles stay where they are, the knees bend and the hands come up. */
import { chainFrames } from '../chain/kinematics/frames';
import { limbQ } from '../chain/limbs/types';
import { add } from '../math/linear/vec';
import type { Body } from './body';
import { armSwings } from './stepping/arms';
import { kneesBent, legShape } from './stepping/foot';
import { reachPoint, reachPose } from './stepping/limb-pose';
import type { MotionRobot } from './types';

/** Share of the hip height the body sinks. */
const CROUCH = 0.12;
/** A leg further than this from its foot (m) has not got there. */
const MISSED = 2e-3;
/** Legs with fewer joints than this place a point, not a sole. */
const ANKLED = 5;

const within = (robot: MotionRobot, i: number, v: number) => Math.min(Math.max(v, robot.joints[i].limits[0]), robot.joints[i].limits[1]);

/** Soles held and the body lowered by `depth`, or null if a leg cannot do it. */
function crouched(robot: MotionRobot, q0: number[], body: Body, depth: number): number[] | null {
  const legs = body.parts.filter((p) => p.kind === 'leg');
  if (legs.length < 2) return null;
  const trunk = robot.limbs[legs[0].limb].index.filter((j) => legs.every((p) => robot.limbs[p.limb].index.includes(j)));
  const held = new Set(trunk);
  const q = kneesBent(robot, q0, legs.map((p) => ({ limb: p.limb, shape: legShape(robot, q0, p.limb, body.left) })), body.forward, held);
  // Only the legs change: whatever else readying touched stays as it stood.
  const own = new Set(legs.flatMap((p) => robot.limbs[p.limb].index));
  q.forEach((_, i) => { if (!own.has(i)) q[i] = q0[i]; });
  for (const p of legs) {
    const l = robot.limbs[p.limb], tip = chainFrames(l.chain, limbQ(l, q0)).tip, to = add(tip.p, [0, 0, depth]);
    const miss = l.index.length < ANKLED ? reachPoint(l, robot.joints, to, [0, 0, 0], q, held) : reachPose(l, robot.joints, { R: tip.R, p: to }, q, false, held);
    if (miss > MISSED) return null;
  }
  return q;
}

/** `raise` is how far the upper arms come up from hanging (rad), `share` how far the hands stay from full stretch. */
function handsUp(robot: MotionRobot, q0: number[], body: Body, q: number[], raise: number, share: number): void {
  for (const a of armSwings(robot, q0, body)) {
    const elbow = a.foldTo(share);
    q[a.swing] = within(robot, a.swing, a.hang(elbow) + a.sense * raise);
    if (a.elbow !== null) q[a.elbow] = elbow;
    if (a.out !== null) q[a.out] = within(robot, a.out, a.down + a.outSense * 0.15);
  }
}

/** Stand, crouch with the hands forward, rise with them high, stand; null if the body has nothing it can move this way. */
export function standingStops(robot: MotionRobot, home: number[], body: Body): number[][] | null {
  const low = crouched(robot, home, body, CROUCH * Math.max(body.hip - body.ground, 0));
  const reach = [...(low ?? home)], high = [...home];
  handsUp(robot, home, body, reach, 1.1, 0.8);
  handsUp(robot, home, body, high, 2, 0.9);
  const moved = (q: number[]) => q.some((v, i) => Math.abs(v - home[i]) > 1e-6);
  const stops = [reach, high].filter(moved);
  return stops.length ? [home, ...stops, home] : null;
}
