/** A foot on the floor: where it stands, and its path through the air from that spot back to it. */
import { chainFrames } from '../../chain/kinematics/frames';
import { limbQ } from '../../chain/limbs/types';
import { type Mat3, matMul, matVec, rodrigues } from '../../math/linear/mat3';
import { type Transform, applyTransform } from '../../math/linear/transform';
import { type Vec3, add, cross, dot, norm, normalize, scale, sub } from '../../math/linear/vec';
import { readyPose } from '../ready';
import { limbRoles } from '../roles';
import type { FootShape, MotionRobot } from '../types';

const UP: Vec3 = [0, 0, 1];

export interface Foot {
  limb: number;
  /** Tip pose as the foot stands flat on the floor. */
  rest: Transform;
  sole: Vec3[];
  /** Front and back of the sole in the tip frame: a foot peels off over the first and lands on the second. */
  toe: Vec3;
  heel: Vec3;
  floor: number;
}

export interface FootArc {
  /** Clearance at the top of the swing, how far ahead of its spot it peaks (m), and the toes-up tilt it lands with (rad). */
  height: number;
  ahead: number;
  landing: number;
  /** How much steeper the descent is than the ascent: 0 comes back down the same line, higher returns over the spot sooner. */
  descent: number;
  /** How gently the slant bends to plumb near the floor: the gentler, the less a heavy leg jolts the body as it stops. */
  bend?: number;
  /** Share of the swing spent peeling, the heel rising and the knee starting forward while the toe is still down, and how far the heel tips (rad). */
  peel: number;
  heelRise: number;
}

export interface LegShape {
  /** Joint indices along the limb's chain of the hip, knee and ankle, the three that hinge across the body. */
  hip: number;
  knee: number;
  ankle: number;
  thigh: number;
  shin: number;
  /** Angle at the knee centre with the leg at full stretch: offset hips and knees never quite line up. */
  straight: number;
}

/** A pose IK can bend legs from: off their stops, `held` joints as they stood, each knee started on the side that folds forward. */
export function kneesBent(robot: MotionRobot, q0: number[], legs: { limb: number; shape: LegShape | null }[], forward: Vec3, held: Iterable<number>): number[] {
  const ready = readyPose(robot, q0, limbRoles(robot, q0));
  for (const j of held) ready[j] = q0[j];
  // A knee free both ways must start on the side that folds forward, or the solver settles on a leg bent backwards.
  for (const { limb, shape } of legs) {
    if (!shape) continue;
    const l = robot.limbs[limb], knee = l.index[shape.knee], [lo, hi] = robot.joints[knee].limits;
    const shin = (v: number) => {
      const q = [...ready];
      q[knee] = v;
      return dot(chainFrames(l.chain, limbQ(l, q)).origins[shape.ankle], forward);
    };
    const sense = shin(ready[knee] + 1e-3) < shin(ready[knee]) ? 1 : -1;
    const bent = ready[knee] + sense * 0.3;
    if (sense * (ready[knee] - q0[knee]) < 0.2) ready[knee] = Math.min(Math.max(bent, lo), hi);
  }
  return ready;
}

/** A leg's hinges and lengths from its own joints, or null if it does not have three that swing it fore and aft. */
export function legShape(robot: MotionRobot, q: number[], limb: number, left: Vec3): LegShape | null {
  const l = robot.limbs[limb], f = chainFrames(l.chain, limbQ(l, q));
  const across = f.axes.flatMap((a, k) => (Math.abs(dot(a, left)) > 0.6 ? [k] : []));
  if (across.length < 3) return null;
  const hip = across[0], ankle = across.at(-1)!;
  const mid = 0.5 * (f.origins[hip][2] + f.origins[ankle][2]);
  const knee = across.slice(1, -1).reduce((a, b) => (Math.abs(f.origins[b][2] - mid) < Math.abs(f.origins[a][2] - mid) ? b : a));
  const angle = (qv: number[]) => {
    const o = chainFrames(l.chain, qv).origins, a = sub(o[knee], o[hip]), b = sub(o[ankle], o[knee]);
    return { bend: Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (norm(a) * norm(b))))), span: norm(sub(o[ankle], o[hip])) };
  };
  const [lo, hi] = robot.joints[l.index[knee]].limits, base = limbQ(l, q);
  const stretched = Array.from({ length: 41 }, (_, i) => {
    const v = [...base];
    v[knee] = lo + ((hi - lo) * i) / 40;
    return angle(v);
  }).reduce((a, b) => (b.span > a.span ? b : a));
  return { hip, knee, ankle, thigh: norm(sub(f.origins[knee], f.origins[hip])), shin: norm(sub(f.origins[ankle], f.origins[knee])), straight: stretched.bend };
}

/** How far the knee is bent from full stretch at pose `q` (rad), from the three joint centres. */
export function kneeFlex(robot: MotionRobot, q: number[], limb: number, s: LegShape): number {
  const l = robot.limbs[limb], o = chainFrames(l.chain, limbQ(l, q)).origins;
  const a = sub(o[s.knee], o[s.hip]), b = sub(o[s.ankle], o[s.knee]);
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (norm(a) * norm(b))))) - s.straight;
}

/** The turn that stands axis `a` straight up. */
function upright(a: Vec3): Mat3 {
  const c = cross(a, UP), s = norm(c);
  return rodrigues(s > 1e-9 ? scale(c, 1 / s) : [1, 0, 0], Math.atan2(s, dot(a, UP)));
}

/** The foot as it stands at `q`, then laid flat with its sole on the floor, where it stays. */
export function plantedFoot(robot: MotionRobot, q: number[], limb: number, shape: FootShape, floor: number, forward: Vec3): Foot {
  const l = robot.limbs[limb], tip = chainFrames(l.chain, limbQ(l, q)).tip;
  const R = matMul(upright(matVec(tip.R, shape.up)), tip.R);
  const low = Math.min(...shape.sole.map((p) => matVec(R, p)[2]));
  const rest: Transform = { R, p: [tip.p[0], tip.p[1], floor - low] };
  const ahead = (p: Vec3) => dot(matVec(R, p), forward);
  const front = Math.max(...shape.sole.map(ahead)), back = Math.min(...shape.sole.map(ahead));
  const end = (near: (p: Vec3) => boolean) => {
    const list = shape.sole.filter(near);
    return scale(list.reduce(add, [0, 0, 0] as Vec3), 1 / list.length);
  };
  const edge = 0.05 * (front - back);
  return { limb, rest, sole: shape.sole, toe: end((p) => ahead(p) > front - edge), heel: end((p) => ahead(p) < back + edge), floor };
}

/** Minimum jerk from 0 to 1: at rest at both ends. */
export const ease = (x: number) => {
  const u = Math.min(Math.max(x, 0), 1);
  return u * u * u * (10 + u * (6 * u - 15));
};

/** Share of the flight at the top of the swing, for the rise and fall exponents used below. */
const TOP = 2.6 / 6;
/** Share of the flight by which a foot stepping to a new spot has moved across to it. */
const ACROSS = 0.7;
/** Share of the flight after which the foot rolls down from its heel. */
const ROLL = 0.8;
/** Share of the rise that goes nearly straight up at the floor, leaving it and coming back to it, and how gently that bends into the slanted line. */
const PLUMB = 0.15;
const BEND = 0.08;

/** Share of the reach at a share of the rise: none near the floor, then in step with the rise. */
function reachAt(lift: number, bend = BEND): number {
  const soft = (x: number) => (x - PLUMB + Math.hypot(x - PLUMB, bend)) / 2;
  return (soft(lift) - soft(0)) / (soft(1) - soft(0));
}

/** One hump from 0 to 1 and back, with no hold at the top, gentle at both ends. */
function hump(v: number, rise: number, fall: number): number {
  if (v <= 0 || v >= 1) return 0;
  const top = rise / (rise + fall);
  return (v / top) ** rise * ((1 - v) / (1 - top)) ** fall;
}

/**
 * Pose of a foot `u` of the way through its swing. Height and reach share one profile, as hip and knee flex and extend
 * together, so the foot goes up and comes back down the same slanted line, bending to plumb only near the floor.
 * It peels off over the toe and rolls down from the heel. `shift` moves the landing spot.
 */
export function swingPose(f: Foot, u: number, arc: FootArc, forward: Vec3, shift: Vec3 = [0, 0, 0]): Transform {
  const left = normalize(cross(UP, forward));
  // Off the floor, v runs from toe-off to landing.
  const v = Math.max(0, (u - arc.peel) / (1 - arc.peel));
  const rolling = v > ROLL;
  // One sweep through toe-off, so the leg never pauses between peeling and lifting.
  const tipped = u / (arc.peel + 0.3 * (1 - arc.peel));
  const w = (v - ROLL) / (1 - ROLL);
  const tilt = rolling ? -arc.landing * hump(w, 2, 2) : arc.heelRise * (ease(tipped) - ease((v - 0.3) / (ROLL - 0.3)));
  const R = matMul(rodrigues(left, tilt), f.rest.R);
  const lift = hump(v, 2.6, 3.4), falling = v > TOP, out = reachAt(falling ? lift ** (1 + arc.descent) : lift, arc.bend);
  const pivot = rolling ? f.heel : f.toe;
  const travel = add(scale(forward, arc.ahead * out), add(scale(UP, arc.height * lift), scale(shift, ease(v / ACROSS))));
  const p = sub(add(applyTransform(f.rest, pivot), travel), matVec(R, pivot));
  // A curved sole can dip below its pivot as it tips; it stays on the floor.
  const low = p[2] + Math.min(...f.sole.map((c) => matVec(R, c)[2]));
  return { R, p: [p[0], p[1], p[2] + Math.max(0, f.floor - low)] };
}
