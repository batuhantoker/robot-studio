/**
 * A grip around a real object. A stand brings it into the open hand, every digit closes until it meets the surface and
 * stops there, the stand drops away so the fingers hold it alone, then comes back, the hand opens and it is carried off.
 */
import type { Mat3 } from '../math/linear/mat3';
import type { Transform } from '../math/linear/transform';
import type { Vec3 } from '../math/linear/vec';
import type { MotionClip } from '../motion/types';
import { along, closeOn, type HandSurface, type Held, lowestPoint } from './closure';
import { type HeldShape, scaledShape } from './held';
import { gripMotors, jointsFor, type MotorMap } from './motors';
import { armHeight, type Stand } from './stand';

export interface Digit {
  /** Motors set before it closes, by name: a thumb's swing across the palm, a finger's spread, a finger folded aside. */
  set?: Record<string, number>;
  /** Motors that close it, with how fast each goes against the others, signed towards the palm. */
  close?: Record<string, number>;
  /** Where a closing motor gives up, if short of its range. */
  stop?: Record<string, number>;
}

export interface Grasp {
  name: string;
  label: string;
  hint: string;
  shape: HeldShape;
  /** The object's seat in the hand, in a right hand's model frame. */
  at: Transform;
  /** What brings the object to the hand and takes it away. */
  stand: Stand;
  /** Closing order: digits in one group move together, each group a beat behind the last. */
  order: string[][];
  /** By limb name; `hand` closes every finger at once, for a hand with one synergy. */
  digits: Record<string, Digit>;
  /** Fingers meant to end on the surface, when not every closing digit can (a synergy stops at its first contact). */
  touch?: string[];
  /** The hand's open pose where it differs from the catalog's, wide enough for every object it takes. */
  open?: Record<string, number>;
  /** The object sizes this grip stays clean at, when narrower than the slider's reach. */
  sizes?: [number, number];
}

export interface DigitPath {
  name: string;
  motors: number[];
  /** Whole motor vectors from the open hand to contact. */
  path: number[][];
  delay: number;
  touching: number[];
}

export interface GraspPlan {
  grasp: Grasp;
  held: Held;
  stand: Stand;
  /** What the hand stands on. */
  floor: number;
  open: number[];
  shut: number[];
  digits: DigitPath[];
}

export interface GraspClip extends MotionClip {
  shape: HeldShape;
  standing: Stand;
  /** When each stage of the cycle plays, for sampling it. */
  beats: { arriving: number; open: number; closing: number; contact: number; hold: number; release: number };
  /** Where the object is at time t: on the stand, or still in the grip. */
  held(t: number): Transform;
  /** The stand's offset from its seat at time t. */
  stand(t: number): Vec3;
}

const BEAT = { bring: 1.5, close: 1.2, settle: 0.1, drop: 0.65, hold: 1.2, raise: 0.65, release: 0.9, take: 1.5, rest: 0.4 };
/** A rail stays where it is, so there is nothing to bring, drop or take. */
const RAIL = { ...BEAT, bring: 0.7, settle: 0, drop: 0, raise: 0, take: 0.1 };
const STAGGER = 0.035;
const LEAD = 0.6;
/** Where the stand waits with the object, and where it stands off while the fingers hold it alone, per side. */
const PARK: Vec3 = [0.15, -0.02, -0.11];
const CLEAR: Vec3 = [0.035, 0, -0.06];
/** The stand's arm stays this far off the floor. */
const FLOOR_GAP = 0.008;
/** How far the Size slider moves the object: past this the hand's grip no longer fits it. */
const SIZES: [number, number] = [0.8, 1.2];
/** No joint step larger than this when a digit is walked from open to where it starts closing. */
const STEP = 0.03;

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const ease = (x: number) => x * x * x * (10 + x * (6 * x - 15));
/** Quick off the mark, slowing into the contact, as a reach does. */
const reach = (x: number) => ease(1 - (1 - x) ** 1.6);

/** The open hand: the hand's own "open" grip, else its home, with any wider pose the grip asks for. */
export function openMotors(map: MotorMap, wide: Record<string, number> = {}): number[] {
  const home = map.motors.map((m) => m.home);
  const open = map.grips.find((g) => g.name === 'open');
  const u = open ? gripMotors(map, open, home) : home;
  for (const [n, v] of Object.entries(wide)) u[map.motors.findIndex((m) => m.name === n)] = v;
  return u;
}

const mirrorPose = ({ p, R }: Transform): Transform => ({
  p: [-p[0], p[1], p[2]],
  R: [R[0], -R[1], -R[2], -R[3], R[4], R[5], -R[6], R[7], R[8]] as Mat3,
});

/** The same grip on the other hand: the object and stand reflected, the motors renamed by `rename`. */
export function mirrored(g: Grasp, rename: (motor: string) => string = (n) => n): Grasp {
  const names = (t?: Record<string, number>) => t && Object.fromEntries(Object.entries(t).map(([n, v]) => [rename(n), v]));
  const flip = ([x, y, z]: Vec3): Vec3 => [-x, y, z];
  return {
    ...g,
    at: mirrorPose(g.at),
    stand: { ...g.stand, at: flip(g.stand.at), side: -g.stand.side, posts: g.stand.posts && [flip(g.stand.posts[0]), flip(g.stand.posts[1])] },
    open: names(g.open),
    digits: Object.fromEntries(Object.entries(g.digits).map(([k, d]) => [k, { set: names(d.set), close: names(d.close), stop: names(d.stop) }])),
  };
}

export function heldAt(g: Grasp, size: number): { held: Held; stand: Stand } {
  const [lo, hi] = g.sizes ?? SIZES;
  const k = Math.min(Math.max(size, lo), hi);
  const c = g.at.p;
  return {
    held: { shape: scaledShape(g.shape, k), pose: g.at },
    stand: { ...g.stand, at: [0, 1, 2].map((i) => c[i] + (g.stand.at[i] - c[i]) * k) as Vec3 },
  };
}

/** Closes the hand on the object, digit by digit in order. `touches` says whether a pose touches the hand itself. */
export function solveGrasp(g: Grasp, map: MotorMap, surface: HandSurface, q: number[], touches: (q: number[]) => boolean, size = 1): GraspPlan {
  const motor = (n: string) => {
    const i = map.motors.findIndex((m) => m.name === n);
    if (i < 0) throw new Error(`grasp ${g.name}: no motor ${n}`);
    return i;
  };
  const open = openMotors(map, g.open);
  const ready = [...open];
  for (const d of Object.values(g.digits)) for (const [n, v] of Object.entries(d.set ?? {})) ready[motor(n)] = v;
  const { held, stand } = heldAt(g, size);
  let u = [...ready];
  const digits: DigitPath[] = [];
  const beats = [...g.order, Object.keys(g.digits).filter((n) => !g.order.flat().includes(n))];
  beats.forEach((group, beat) => {
    for (const name of group) {
      const d = g.digits[name];
      const closing = Object.entries(d.close ?? {}).map(([n, rate]) => {
        const m = motor(n);
        return { motor: m, rate, stop: d.stop?.[n] ?? map.motors[m].range[rate > 0 ? 1 : 0] };
      });
      const links = surface.links.flatMap((l, k) => (name === 'hand' ? !!l.finger : l.finger === name) ? [k] : []);
      const c = closeOn(surface, map, q, u, closing, links, held, (v) => touches(jointsFor(map, v, q)));
      const motors = [...new Set([...Object.keys(d.set ?? {}).map(motor), ...closing.map((m) => m.motor)])];
      const far = Math.max(0, ...motors.map((m) => Math.abs(ready[m] - open[m])));
      const steps = Math.ceil(far / STEP);
      const walk = Array.from({ length: steps }, (_, i) => c.path[0].map((v, m) => (motors.includes(m) ? open[m] + (ready[m] - open[m]) * (i / steps) : v)));
      digits.push({ name, motors, path: [...walk, ...c.path], delay: Math.min(beat, g.order.length - 1) * STAGGER, touching: c.touching });
      u = c.path[c.path.length - 1];
    }
  });
  return { grasp: g, held, stand, floor: lowestPoint(surface, q), open, shut: u, digits };
}

/** Plays a solved grasp. Starts by easing from `start` to the open hand. */
export function graspClip(plan: GraspPlan, map: MotorMap, q0: number[], start: number[]): GraspClip {
  const { open, digits, held, stand } = plan;
  const beat = stand.posts ? RAIL : BEAT;
  const last = Math.max(0, ...digits.map((d) => d.delay));
  const closed = beat.bring + beat.close + last;
  const dropped = closed + beat.settle + beat.drop;
  const back = dropped + beat.hold;
  const under = back + beat.raise;
  const opened = under + beat.release + last;
  const taken = opened + beat.take;
  const period = taken + beat.rest;
  const lead = start.some((v, i) => Math.abs(v - open[i]) > 1e-3) ? LEAD : 0;
  const local = (t: number) => (((t - lead) % period) + period) % period;
  // Under a low hand there is no room to sink, so the stand goes out to the side instead.
  const room = Math.max(armHeight(stand) - plan.floor - FLOOR_GAP, 0);
  const sunk = (v: Vec3): Vec3 => {
    const down = Math.min(-v[2], room);
    return stand.posts ? [0, 0, 0] : [stand.side * (v[0] + (-v[2] - down)), v[1], -down];
  };
  const park = sunk(PARK), clear = sunk(CLEAR);

  const motorsAt = (t: number): number[] => {
    const u = [...open];
    for (const d of digits) {
      const w = t < under ? reach(clamp01((t - beat.bring - d.delay) / beat.close)) : 1 - ease(clamp01((t - under - (last - d.delay)) / beat.release));
      const v = along(d.path, w);
      for (const m of d.motors) u[m] = v[m];
    }
    return u;
  };

  /** How far off its seat the object is: 1 parked, 0 in the hand. */
  const away = (t: number) => (t < beat.bring ? 1 - ease(t / beat.bring) : t > opened ? ease(clamp01((t - opened) / beat.take)) : 0);
  const stood = (t: number) => (t < back ? ease(clamp01((t - closed - beat.settle) / Math.max(beat.drop, 1e-6))) : 1 - ease(clamp01((t - back) / Math.max(beat.raise, 1e-6))));
  return {
    period,
    lead,
    shape: held.shape,
    standing: stand,
    beats: { arriving: beat.bring * 0.45, open: beat.bring * 0.98, closing: beat.bring + beat.close * 0.45, contact: closed, hold: dropped + beat.hold * 0.5, release: under + beat.release * 0.6 },
    at(t) {
      if (t < lead) {
        const w = ease(clamp01(t / lead));
        return jointsFor(map, start.map((v, i) => v + (open[i] - v) * w), q0);
      }
      return jointsFor(map, motorsAt(local(t)), q0);
    },
    held(t) {
      const w = t < lead ? 1 : away(local(t));
      return { R: held.pose.R, p: [0, 1, 2].map((i) => held.pose.p[i] + park[i] * w) as Vec3 };
    },
    stand(t) {
      const x = t < lead ? 0 : local(t), w = t < lead ? 1 : away(x), d = t < lead ? 0 : stood(x);
      return [0, 1, 2].map((i) => park[i] * w + clear[i] * d) as Vec3;
    },
  };
}
