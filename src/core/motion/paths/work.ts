/**
 * Work at a bench for a robot with a pair of arms (a humanoid): hand targets keyed through a cycle in
 * the robot's own forward frame, held inside each arm's reach. The waist joints the arms share are
 * pinned (IK would otherwise lean the torso into an arm), except a waist yaw turned on the script.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import { limbQ } from '../../chain/limbs/types';
import { type Vec3, add, dot, norm, scale, sub } from '../../math/linear/vec';
import { type Body, armPair, workStance } from '../body';
import type { MotionRobot } from '../types';

export interface Arm {
  limb: number;
  /** The first joint the arm does not share with its twin, and the hand at the ready pose. */
  shoulder: Vec3;
  rest: Vec3;
  /** The rest hand eased forward and out, clear of hips some robots park their hands against. */
  ready: Vec3;
  length: number;
}

export interface BenchFrame {
  left: Arm;
  right: Arm;
  forward: Vec3;
  side: Vec3;
  /** Bench top (robot frame z) and how far ahead its edge is. */
  bench: number;
  front: number;
  /** Robot joints both arms hang from, and the one among them that turns the torso about the vertical. */
  shared: number[];
  yaw: { joint: number; sense: number; at: Vec3 } | null;
}

export interface Pose {
  hands: [Vec3, Vec3];
  /** Waist turn (rad, counter-clockwise from above). */
  yaw: number;
}

function arm(robot: MotionRobot, q: number[], limb: number, twin: number, forward: Vec3, side: Vec3): Arm {
  const l = robot.limbs[limb];
  const f = chainFrames(l.chain, limbQ(l, q));
  const shared = new Set(robot.limbs[twin].index);
  const k = Math.max(0, l.index.findIndex((i) => !shared.has(i)));
  const pts = [...f.origins.slice(k), f.tip.p];
  const length = pts.slice(1).reduce((s, p, i) => s + norm(sub(p, pts[i])), 0);
  const out = Math.sign(dot(sub(f.tip.p, pts[0]), side)) || 1;
  const lift = add(scale(forward, 0.15 * length), add(scale(side, 0.06 * length * out), [0, 0, 0.08 * length]));
  return { limb, shoulder: pts[0], rest: f.tip.p, ready: add(f.tip.p, lift), length };
}

/** `q` poses the arms; `body` (read at the robot's home) says where the bench is. */
export function benchFrame(robot: MotionRobot, q: number[], body: Body): BenchFrame | null {
  const pair = armPair(body);
  if (!pair) return null;
  const [l, r] = pair;
  const lf = robot.limbs[l.limb];
  const shared = lf.index.filter((i) => robot.limbs[r.limb].index.includes(i));
  const f = chainFrames(lf.chain, limbQ(lf, q));
  const k = shared.map((i) => lf.index.indexOf(i)).find((c) => Math.abs(f.axes[c][2]) > 0.9);
  const st = workStance(body);
  return {
    left: arm(robot, q, l.limb, r.limb, body.forward, body.left), right: arm(robot, q, r.limb, l.limb, body.forward, body.left),
    forward: body.forward, side: body.left, bench: st.hand, front: st.front, shared,
    yaw: k === undefined ? null : { joint: lf.index[k], sense: Math.sign(f.axes[k][2]), at: f.origins[k] },
  };
}

/** A point `ahead` along forward, `across` to the left, at height z, all in the robot frame. */
const at = (w: BenchFrame, ahead: number, across: number, z: number): Vec3 =>
  add(add(scale(w.forward, ahead), scale(w.side, across)), [0, 0, z]);

/** Pulled toward the shoulder until a comfortably bent arm reaches it. */
function within(a: Arm, p: Vec3, k = 0.85): Vec3 {
  const d = sub(p, a.shoulder), n = norm(d), r = k * a.length;
  return n > r ? add(a.shoulder, scale(d, r / n)) : p;
}

function turn(p: Vec3, pivot: Vec3, angle: number): Vec3 {
  const [x, y] = [p[0] - pivot[0], p[1] - pivot[1]], [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [pivot[0] + c * x - s * y, pivot[1] + s * x + c * y, p[2]];
}

type Key = [phase: number, left: Vec3, right: Vec3, yaw?: number];
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(x, 0), 1));
const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Poses eased key to key; the last key runs back into the first, so the loop closes. */
export function keyed(keys: Key[]): (s: number) => Pose {
  return (s) => {
    const u = ((s % 1) + 1) % 1;
    let i = keys.length - 1;
    while (i > 0 && keys[i][0] > u) i--;
    const [t0, l0, r0, y0 = 0] = keys[i], [t1, l1, r1, y1 = 0] = keys[(i + 1) % keys.length];
    const span = (t1 <= t0 ? t1 + 1 : t1) - t0;
    const k = ease(span > 0 ? (u - t0) / span : 1);
    return { hands: [lerp(l0, l1, k), lerp(r0, r1, k)], yaw: y0 + (y1 - y0) * k };
  };
}

const lateral = (w: BenchFrame, p: Vec3) => dot(p, w.side);

/** One hand then the other reaches out over the bench, taps the work, and comes back. */
export function benchReach(w: BenchFrame, size: number): (s: number) => Pose {
  const reach = (a: Arm) => {
    // At the hand's own width: reaching in toward the midline swings the upper arm into the torso.
    const over = within(a, at(w, w.front + 0.2 * a.length * size, lateral(w, a.ready), w.bench + 0.1 * a.length));
    return { over, tap: within(a, add(over, [0, 0, -0.08 * a.length])) };
  };
  const [L, R] = [reach(w.left), reach(w.right)];
  const [l0, r0] = [w.left.ready, w.right.ready];
  return keyed([
    [0, l0, r0], [0.14, L.over, r0], [0.22, L.tap, r0], [0.3, L.over, r0], [0.44, l0, r0],
    [0.5, l0, r0], [0.64, l0, R.over], [0.72, l0, R.tap], [0.8, l0, R.over], [0.94, l0, r0],
  ]);
}

/** Hands either side of a box `ahead` at height z, `open` wider than its width, turned `yaw` about the waist. */
function holding(w: BenchFrame, ahead: number, z: number, open: number, yaw = 0): [Vec3, Vec3] {
  const shoulders = 0.5 * Math.abs(lateral(w, w.left.shoulder) - lateral(w, w.right.shoulder));
  const len = Math.min(w.left.length, w.right.length);
  const half = Math.min(Math.max(0.45 * Math.abs(lateral(w, w.left.ready) - lateral(w, w.right.ready)), shoulders), shoulders + 0.3 * len);
  const pivot = w.yaw?.at ?? lerp(w.left.shoulder, w.right.shoulder, 0.5);
  // Hands drawn in close to the chest fold the upper arms into the torso.
  const out = Math.max(ahead, dot(lerp(w.left.shoulder, w.right.shoulder, 0.5), w.forward) + 0.45 * len);
  // Clamped to the reach before turning: the shoulders turn with the waist.
  return [
    turn(within(w.left, at(w, out, half + open, z)), pivot, yaw), turn(within(w.right, at(w, out, -half - open, z)), pivot, yaw),
  ];
}

/** Both hands close on a box on the bench, lift it to the chest, hold, and set it back down. */
export function twoHandLift(w: BenchFrame, size: number): (s: number) => Pose {
  const len = Math.min(w.left.length, w.right.length);
  const box = w.bench + 0.18 * len, ahead = w.front + 0.18 * len * size, open = 0.12 * len;
  const chestZ = Math.max(w.left.shoulder[2], w.right.shoulder[2]) - 0.45 * len + 0.15 * len * size;
  const chest = holding(w, Math.max(0.35 * len, w.front * 0.6), chestZ, 0);
  return keyed([
    [0, w.left.ready, w.right.ready], [0.14, ...holding(w, ahead, box + 0.2 * len, open)], [0.24, ...holding(w, ahead, box, open)],
    [0.31, ...holding(w, ahead, box, 0)], [0.48, ...chest], [0.62, ...chest], [0.78, ...holding(w, ahead, box, 0)],
    [0.85, ...holding(w, ahead, box, open)], [0.92, ...holding(w, ahead, box + 0.2 * len, open)],
  ]);
}

/** Pick a box up off the bench in front, turn at the waist, set it down to the side, and turn back. */
export function turnAndPlace(w: BenchFrame, size: number): (s: number) => Pose {
  const len = Math.min(w.left.length, w.right.length);
  // Without a waist yaw the arms alone swing the box, and only a little.
  const angle = (w.yaw ? 0.75 : 0.3) * size;
  const ahead = w.front + 0.15 * len, box = w.bench + 0.18 * len, carry = box + 0.22 * len, open = 0.12 * len;
  const k = (phase: number, z: number, o: number, a: number): Key => [phase, ...holding(w, ahead, z, o, a), w.yaw ? a : 0];
  return keyed([
    k(0, carry, open, 0), k(0.1, box, open, 0), k(0.16, box, 0, 0), k(0.28, carry, 0, 0), k(0.46, carry, 0, angle),
    k(0.56, box, 0, angle), k(0.62, box, open, angle), k(0.72, carry, open, angle), k(0.9, carry, open, 0),
  ]);
}

/** Reach both hands straight ahead along the robot's forward axis, not each arm's own outward. */
export function reachAhead(w: BenchFrame, size: number): (s: number) => Pose {
  const out = (a: Arm) => within(a, add(a.shoulder, add(scale(w.forward, 0.8 * a.length * size), [0, 0, -0.25 * a.length])));
  return keyed([[0, w.left.ready, w.right.ready], [0.4, out(w.left), out(w.right)], [0.55, out(w.left), out(w.right)]]);
}

/** Waist joints held at the pose `q`, with the yaw turned as the script says. */
export function waistPins(w: BenchFrame, q: number[], pose: (s: number) => Pose): (s: number) => Map<number, number> {
  return (s) => {
    const m = new Map(w.shared.map((i) => [i, q[i]]));
    if (w.yaw) m.set(w.yaw.joint, q[w.yaw.joint] + w.yaw.sense * pose(s).yaw);
    return m;
  };
}
