/** Greetings on planted feet: a squat's solver with a script for its timing, so the legs, hips and weight take part. */
import { chainFrames } from '../../chain/kinematics/frames';
import { enforceLimits } from '../../chain/limbs/limits';
import { limbQ } from '../../chain/limbs/types';
import { type Vec3, add, dot, norm, normalize, scale, sub } from '../../math/linear/vec';
import type { Body } from '../body';
import type { Footing, MotionClip, MotionRobot } from '../types';
import { type ArmSwing, armSwings } from './arms';
import { type Gait, steppingClip } from './clip';
import { ease } from './foot';
import { firstRung } from './ladder';
import { QUIET } from './legged';

const G = 9.81;
const TAU = 2 * Math.PI;
/** How much of each gesture to try in turn. */
const EASIER = [1, 0.85, 0.7, 0.55];
/** Waves of the hand, and how far the forearm goes each way (rad). */
const WAVES = 3;
const SWAY = 0.38;
/** A joint keeps this much room from its stop (rad). */
const ROOM = 0.05;

/** Up over `rise`, held, down over `fall`: nothing after that, so the loop rests before it starts again. */
const held = (s: number, up: number, top: number, end: number, down: number) => ease((s - up) / (top - up)) * (1 - ease((s - end) / (down - end)));

const stands = (body: Body, period: number, size: number): Gait => {
  const legs = body.parts.filter((p) => p.kind === 'leg');
  return {
    ...QUIET, period, lead: 0.12 * period, lifts: legs.map(() => 0), air: 0, knee: 0.17, crouch: 0.05,
    bob: 0, bow: 0, handShare: 0.97, armOut: 0.12 * Math.min(size, 1),
  };
};

/** The arm's joints for a hand up beside the head, forearm upright: fitted to its own ranges, as joint orders and senses differ. */
function handUp(robot: MotionRobot, q0: number[], body: Body, a: ArmSwing): Map<number, number> {
  const l = robot.limbs[a.part.limb], L = a.part.reach!, out = a.part.side === 'left' ? 1 : -1;
  const want = add(a.part.shoulder!, add(scale(body.left, out * 0.45 * L), add(scale(body.forward, 0.12 * L), [0, 0, 0.42 * L] as Vec3)));
  const elbow = a.elbow === null ? -1 : l.index.indexOf(a.elbow);
  const joints = [a.swing, a.out, a.twist, a.elbow].filter((j): j is number => j !== null);
  const score = (q: number[]) => {
    const f = chainFrames(l.chain, limbQ(l, q)), miss = norm(sub(f.tip.p, want)) / L;
    return elbow < 0 ? miss : miss + 0.35 * (1 - normalize(sub(f.tip.p, f.origins[elbow]))[2]);
  };
  const range = (j: number) => [robot.joints[j].limits[0] + ROOM, robot.joints[j].limits[1] - ROOM];
  const q = [...q0];
  let low = Infinity, top = [...q];
  const sweep = (depth: number) => {
    if (depth === joints.length) {
      const v = score(q);
      if (v < low) [low, top] = [v, [...q]];
      return;
    }
    const j = joints[depth], [lo, hi] = range(j);
    for (let i = 0; i < 8; i++) {
      q[j] = lo + ((hi - lo) * i) / 7;
      sweep(depth + 1);
    }
  };
  sweep(0);
  // The grid finds the right family of poses; this settles it.
  for (let pass = 0; pass < 4; pass++) {
    for (const j of joints) {
      const [lo, hi] = range(j), at = top[j];
      for (let i = -12; i <= 12; i++) {
        const t = [...top];
        t[j] = Math.min(Math.max(at + 0.03 * i, lo), hi);
        const v = score(t);
        if (v < low) [low, top] = [v, t];
      }
    }
  }
  return new Map(joints.map((j) => [j, top[j]]));
}

/** The joint that carries the raised hand furthest across the body, with its centre moved in enough to swing both ways. */
function swayOf(robot: MotionRobot, q0: number[], body: Body, a: ArmSwing, pose: Map<number, number>): { joint: number; centre: number; reach: number } {
  const l = robot.limbs[a.part.limb], q = [...q0];
  for (const [j, v] of pose) q[j] = v;
  const hand = (p: number[]) => chainFrames(l.chain, limbQ(l, p)).tip.p;
  const across = (j: number) => {
    const p = [...q];
    p[j] += 1e-3;
    return Math.abs(dot(sub(hand(p), hand(q)), body.left));
  };
  const joint = [a.twist, a.out, a.swing].filter((j): j is number => j !== null).reduce((x, y) => (across(y) > across(x) ? y : x));
  const [lo, hi] = robot.joints[joint].limits, reach = Math.min(SWAY, 0.45 * (hi - lo) - ROOM);
  return { joint, centre: Math.min(Math.max(q[joint], lo + reach + ROOM), hi - reach - ROOM), reach };
}

const raising = (s: number) => held(s, 0.04, 0.24, 0.74, 0.9);
const waving = (s: number) => held(s, 0.2, 0.28, 0.68, 0.76) * Math.sin(TAU * WAVES * (s - 0.24) / 0.48);

/** What the raised arm does at phase `s`, starting from whatever `q` holds; null if the body has no arm to wave. */
function waveArm(robot: MotionRobot, q0: number[], body: Body, size: number): { arm: ArmSwing; write(s: number, q: number[]): void } | null {
  const arms = armSwings(robot, q0, body), arm = arms.find((a) => a.part.side === 'right') ?? arms[0];
  if (!arm) return null;
  const pose = handUp(robot, q0, body, arm), sway = swayOf(robot, q0, body, arm, pose);
  pose.set(sway.joint, sway.centre);
  return {
    arm,
    write(s, q) {
      const k = raising(s) * Math.min(size, 1);
      for (const [j, v] of pose) q[j] += (v - q[j]) * k;
      q[sway.joint] += sway.reach * Math.min(size, 1) * waving(s);
    },
  };
}

function waveGait(robot: MotionRobot, q0: number[], body: Body, footing: Footing, size: number): Gait | null {
  const hand = waveArm(robot, q0, body, size);
  if (!hand) return null;
  const legs = body.parts.filter((p) => p.kind === 'leg'), L = body.hip - footing.floor;
  const apart = 0.5 * Math.abs(dot(sub(legs[0].role.tip, legs[1].role.tip), body.left));
  // Weight onto the far foot and a lean away, as the raised arm asks of a person.
  const away = hand.arm.part.side === 'left' ? -1 : 1;
  return {
    ...stands(body, Math.min(Math.max(20 * Math.sqrt(L / G), 4.5), 6), size), bob: 0.02 * L,
    script: {
      sink: raising, bend: () => 0, arms: hand.write,
      weight: (s) => away * 0.35 * apart * raising(s),
      lean: (s) => away * 0.04 * raising(s),
    },
  };
}

const bowing = (s: number) => held(s, 0.06, 0.34, 0.54, 0.84);

function bowGait(body: Body, footing: Footing, size: number): Gait {
  const L = body.hip - footing.floor;
  return {
    ...stands(body, Math.min(Math.max(18 * Math.sqrt(L / G), 4), 5.5), size),
    bob: 0.05 * L * size, bow: 0.8 * size, script: { sink: bowing, bend: bowing },
  };
}

export const waveAt = (robot: MotionRobot, q0: number[], footing: Footing, body: Body, size: number, rung: number): MotionClip | null => {
  const gait = waveGait(robot, q0, body, footing, size * EASIER[rung]);
  return gait && steppingClip(robot, q0, footing, body, gait);
};

export const bowAt = (robot: MotionRobot, q0: number[], footing: Footing, body: Body, size: number, rung: number): MotionClip | null =>
  steppingClip(robot, q0, footing, body, bowGait(body, footing, size * EASIER[rung]));

export const waveRung = (robot: MotionRobot, q0: number[], footing: Footing, body: Body, size = 1, budget = Infinity): number | null =>
  firstRung(EASIER.length, (rung) => waveAt(robot, q0, footing, body, size, rung), footing.touches, budget);

export const bowRung = (robot: MotionRobot, q0: number[], footing: Footing, body: Body, size = 1, budget = Infinity): number | null =>
  firstRung(EASIER.length, (rung) => bowAt(robot, q0, footing, body, size, rung), footing.touches, budget);

/** The wave with the rest of the robot as it stands: for a body that cannot be balanced, or has nothing to stand on. */
export function armWave(robot: MotionRobot, q0: number[], body: Body, size: number): MotionClip | null {
  const hand = waveArm(robot, q0, body, size);
  if (!hand) return null;
  const period = 5;
  return {
    period,
    at(t) {
      const q = [...q0];
      hand.write((((t / period) % 1) + 1) % 1, q);
      return enforceLimits(robot.joints, q);
    },
  };
}
