/** Arms and shoulders in a gait: which joints swing them, found from the model, and how each one sits. */
import { chainFrames } from '../../chain/kinematics/frames';
import { limbQ } from '../../chain/limbs/types';
import { type Vec3, dot, norm, sub } from '../../math/linear/vec';
import type { Body, BodyPart } from '../body';
import type { MotionRobot } from '../types';

export interface ArmSwing {
  part: BodyPart;
  /** The joint that carries the arm fore and aft, its sense for forward, and its value that hangs the hand under the shoulder with the elbow at `elbowAt`. */
  swing: number;
  sense: number;
  hang(elbowAt: number): number;
  /** The joint that folds the arm (null if it has none), and its value that brings the hand to a share of full stretch from the shoulder. */
  elbow: number | null;
  foldTo(share: number): number;
  /** The joint that lifts the arm out to the side (null if it has none), its sense for out, and its value with the arm down at the side. */
  out: number | null;
  outSense: number;
  down: number;
  /** The joint that turns the arm about its own length (null if it has none), and its sense for taking the hand outboard. */
  twist: number | null;
  twistSense: number;
}

/** How square to the body's side an axis must lie to swing an arm fore and aft. */
const LATERAL = 0.6;

/** How far off the shoulder a lowered arm's hand sits per drop below it: clear of the hips, not pinned to them. */
const CARRY = 0.3;
/** Arms further out than this (hand off the shoulder per drop below it) count as raised. */
const RAISED = 0.6;

/** The value in a joint's range, sampled finely, that scores lowest. */
function best(lo: number, hi: number, score: (v: number) => number): number {
  let at = lo, low = Infinity;
  for (let i = 0; i <= 200; i++) {
    const v = lo + ((hi - lo) * i) / 200, s = score(v);
    if (s < low) [at, low] = [v, s];
  }
  return at;
}

export function armSwings(robot: MotionRobot, q0: number[], body: Body): ArmSwing[] {
  const arms = body.parts.filter((p) => p.kind === 'arm' && p.side !== 'centre' && p.shoulder);
  return arms.flatMap((part) => {
    const l = robot.limbs[part.limb], shoulder = part.shoulder!;
    const others = new Set(arms.filter((a) => a !== part).flatMap((a) => robot.limbs[a.limb].index));
    const own = l.index.map((_, k) => k).filter((k) => !others.has(l.index[k]));
    const framesAt = (q: number[]) => chainFrames(l.chain, limbQ(l, q));
    const withJoint = (q: number[], i: number, v: number) => {
      const out = [...q];
      out[i] = v;
      return framesAt(out);
    };
    /** Which joint does what, judged with the arm as it is at `q`: held out level, a twist axis lies across the body like a hinge. */
    const read = (q: number[]) => {
      const f = framesAt(q), across = (k: number) => Math.abs(dot(f.axes[k], body.left));
      const k = own.find((j) => across(j) > LATERAL);
      if (k === undefined) return null;
      // The elbow is the hinge that brings the hand furthest in: a wrist on the same axis only tips it.
      const sweep = (j: number) => {
        const [a, b] = robot.joints[l.index[j]].limits;
        const span = Array.from({ length: 13 }, (_, i) => norm(sub(withJoint(q, l.index[j], a + ((b - a) * i) / 12).tip.p, shoulder)));
        return Math.max(...span) - Math.min(...span);
      };
      const fold = own.filter((j) => j > k && across(j) > LATERAL).sort((a, b) => sweep(b) - sweep(a))[0];
      const upper = (j: number) => fold === undefined || j < fold;
      return {
        swing: l.index[k], fold,
        lift: own.find((j) => upper(j) && Math.abs(dot(f.axes[j], body.forward)) > LATERAL),
        turning: own.find((j) => upper(j) && Math.abs(f.axes[j][2]) > LATERAL),
      };
    };
    const asHeld = read(q0);
    if (!asHeld) return [];
    const out = asHeld.lift === undefined ? null : l.index[asHeld.lift];
    const outward = part.side === 'left' ? 1 : -1;
    // Some robots stand with their arms held out: a walking arm starts from hanging, not from that.
    const beside = (v: number) => {
      const hand = sub(withJoint(q0, out!, v).tip.p, shoulder);
      return Math.abs(dot(hand, body.left)) / Math.max(-hand[2], 1e-3);
    };
    const held = out === null ? 0 : beside(q0[out]);
    const down = out === null ? 0 : held < RAISED ? q0[out] : best(...robot.joints[out].limits, (v) => (sub(withJoint(q0, out, v).tip.p, shoulder)[2] < 0 ? Math.abs(beside(v) - CARRY) : Infinity));
    const low = [...q0];
    if (out !== null) low[out] = down;
    const { swing, fold, turning } = read(low) ?? asHeld;
    const f = framesAt(low), with1 = (i: number, v: number) => withJoint(low, i, v);
    const moved = sub(with1(swing, low[swing] + 1e-3).tip.p, f.tip.p);
    const [lo, hi] = robot.joints[swing].limits;
    const elbow = fold === undefined ? null : l.index[fold];
    const away = (v: number) => norm(sub(with1(elbow!, v).tip.p, shoulder));
    // Which way is out, measured with the arm down: held level, the same joint can read the other way.
    const spread = out === null ? 0 : dot(sub(with1(out, down + 1e-3).tip.p, f.tip.p), body.left) * outward;
    const twist = turning === undefined ? null : l.index[turning];
    const flare = twist === null ? 0 : dot(sub(with1(twist, low[twist] + 1e-3).tip.p, f.tip.p), body.left) * outward;
    return [{
      part, swing, sense: Math.sign(dot(moved, body.forward)) || 1,
      hang(elbowAt) {
        const below = (v: number) => {
          const q = [...low];
          q[swing] = v;
          if (elbow !== null) q[elbow] = elbowAt;
          const hand: Vec3 = sub(framesAt(q).tip.p, shoulder);
          return hand[2] < 0 ? Math.abs(dot(hand, body.forward)) : Infinity;
        };
        return best(Math.max(lo, q0[swing] - 1.5), Math.min(hi, q0[swing] + 1.5), below);
      },
      elbow,
      foldTo(share) {
        if (elbow === null) return 0;
        const [a, b] = robot.joints[elbow].limits;
        const straight = best(a, b, (v) => -away(v));
        // Fold the way the joint folds at rest, away from straight.
        const way = q0[elbow] < straight ? [a, straight] : [straight, b];
        const full = away(straight);
        return best(way[0], way[1], (v) => Math.abs(away(v) - share * full));
      },
      out, outSense: Math.sign(spread) || 1, down,
      twist, twistSense: Math.sign(flare) || 1,
    }];
  });
}

/** A joint both arms hang from that turns about the vertical, and its sense for turning left: the waist. */
export function waistTurn(robot: MotionRobot, q0: number[], arms: ArmSwing[]): { joint: number; sense: number } | null {
  if (arms.length < 2) return null;
  const [a, b] = arms.map((x) => robot.limbs[x.part.limb]);
  const shared = new Set(b.index);
  const f = chainFrames(a.chain, limbQ(a, q0));
  const k = a.index.findIndex((i, j) => shared.has(i) && Math.abs(f.axes[j][2]) > 0.8);
  return k < 0 ? null : { joint: a.index[k], sense: Math.sign(f.axes[k][2]) };
}
