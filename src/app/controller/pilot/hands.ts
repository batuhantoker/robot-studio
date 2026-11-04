/**
 * Driving a humanoid's hands while piloting: a target per hand nudged by keys (in the robot's own forward
 * frame, kept inside the arm's reach), and a grip that curls the fingers a hand has and holds what it closes on.
 */
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import { type Vec3, add, norm, scale, sub } from '../../../core/math/linear/vec';
import type { Body } from '../../../core/motion/body';
import type { BenchFrame } from '../../../core/motion/paths/work';
import type { MotionRobot } from '../../../core/motion/types';

export type Side = 0 | 1;

/** A finger joint, the way it curls, and how far. */
interface Curl {
  i: number;
  by: number;
}

export class Hands {
  /** The hand the keys move (0 left, 1 right). */
  side: Side = 1;
  /** Robot-frame targets; null leaves a hand to the walking swing. */
  readonly targets: [Vec3 | null, Vec3 | null] = [null, null];
  readonly closed: [boolean, boolean] = [false, false];
  /** Eased grip, 0 open to 1 closed. */
  readonly grip: [number, number] = [0, 0];
  private readonly curls: [Curl[], Curl[]];

  constructor(private readonly robot: MotionRobot, private readonly ready: number[], readonly frame: BenchFrame, body: Body) {
    this.curls = [curlsOf(robot, ready, body, frame.left.limb), curlsOf(robot, ready, body, frame.right.limb)];
  }

  limb = (side: Side) => (side === 0 ? this.frame.left.limb : this.frame.right.limb);
  arm = (side: Side) => (side === 0 ? this.frame.left : this.frame.right);
  hasFingers = (side: Side) => this.curls[side].length > 0;

  /** Where a hand is now, in the robot frame. */
  tip(q: number[], side: Side): Vec3 {
    const l = this.robot.limbs[this.limb(side)];
    return chainFrames(l.chain, limbQ(l, q)).tip.p;
  }

  /** Nudge the active hand: `dir` is (forward, left, up) in the robot's facing; the target starts where the hand is. */
  move(q: number[], dir: Vec3, dt: number, speed: number): void {
    if (!norm(dir)) return;
    const s = this.side, a = this.arm(s), f = this.frame.forward, l = this.frame.side;
    const from = this.targets[s] ?? this.tip(q, s);
    const step = add(add(scale(f, dir[0]), scale(l, dir[1])), [0, 0, dir[2]]);
    const next = add(from, scale(step, speed * dt));
    // Inside a comfortably bent reach, so the arm never locks straight at a target it cannot meet.
    const d = sub(next, a.shoulder), n = norm(d), r = 0.92 * a.length;
    this.targets[s] = n > r ? add(a.shoulder, scale(d, r / n)) : next;
  }

  fingerJoints = (): number[] => [...this.curls[0], ...this.curls[1]].map((c) => c.i);

  reset(): void {
    this.targets[0] = this.targets[1] = null;
  }

  /** Ease grips toward open or closed and write the finger curl into q. */
  fingers(q: number[], dt: number): number[] {
    const out = [...q];
    for (const s of [0, 1] as Side[]) {
      this.grip[s] += Math.max(-4 * dt, Math.min(4 * dt, (this.closed[s] ? 1 : 0) - this.grip[s]));
      for (const c of this.curls[s]) out[c.i] = this.ready[c.i] + c.by * this.grip[s];
    }
    return out;
  }
}

/**
 * Finger joints: those of a hand's fingertip chains that the whole hand does not share, each turned the way
 * that brings its tip in toward the wrist, most of the way to its stop.
 */
function curlsOf(robot: MotionRobot, ready: number[], body: Body, limb: number): Curl[] {
  const part = body.partOf[limb];
  if (!part || part.limbs.length < 2) return [];
  const sets = part.limbs.map((i) => new Set(robot.limbs[i].index));
  const common = sets.reduce((a, b) => new Set([...a].filter((i) => b.has(i))));
  const wrist = (() => {
    const l = robot.limbs[limb], f = chainFrames(l.chain, limbQ(l, ready));
    const k = l.index.map((i) => common.has(i)).lastIndexOf(true);
    return f.origins[Math.max(k, 0)];
  })();
  const out = new Map<number, Curl>();
  for (const m of part.limbs) {
    const l = robot.limbs[m];
    const tipAt = (q: number[]) => chainFrames(l.chain, limbQ(l, q)).tip.p;
    const reach = (q: number[]) => norm(sub(tipAt(q), wrist));
    for (const i of l.index) {
      if (common.has(i) || out.has(i)) continue;
      const q = [...ready];
      q[i] += 1e-3;
      const sense = reach(q) < reach(ready) ? 1 : -1;
      const [lo, hi] = robot.joints[i].limits;
      out.set(i, { i, by: 0.75 * (sense > 0 ? hi - ready[i] : lo - ready[i]) });
    }
  }
  return [...out.values()];
}
