/** Counting on the fingers: a fist, then one digit up at a time, thumb last. Only a hand with a motor per digit can. */
import type { Limb } from '../chain/limbs/types';
import type { MotionClip } from '../motion/types';
import { openMotors } from './grasp';
import { gripMotors, jointsFor, type MotorMap } from './motors';

const BEAT = 0.62;
const RISE = 0.36;
const FOLD = 0.6;
const LEAD = 0.6;
/** How long the thumb takes to leave the fist, before the index rises past it. */
const CLEAR = 0.32;

/** The thumb's two places while counting. */
export interface Tuck {
  /** Wrapped across the front of the fist. */
  over?: Record<string, number>;
  /** Folded across the palm, out of the count, from one to four. */
  across?: Record<string, number>;
  /** How far the fingers fold, of the pointing grip's curl: a hand whose fingers touch at the full curl stops short. */
  curl?: number;
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const ease = (x: number) => x * x * x * (10 + x * (6 * x - 15));

/** Through the hand's catalog grips and back: what its synergies do, on a hand with too few motors to count. */
export function synergyClip(map: MotorMap, q0: number[], start: number[]): MotionClip {
  const open = openMotors(map);
  const stops = [open, ...map.grips.filter((g) => g.name !== 'open').map((g) => gripMotors(map, g, open)), open];
  const hold = 0.35, move = 1.1, period = (stops.length - 1) * (hold + move);
  const lead = start.some((v, i) => Math.abs(v - open[i]) > 1e-3) ? LEAD : 0;
  return {
    period,
    lead,
    at(t) {
      if (t < lead) {
        const w = ease(clamp01(t / lead));
        return jointsFor(map, start.map((v, i) => v + (open[i] - v) * w), q0);
      }
      const x = (t - lead) % period, i = Math.min(Math.floor(x / (hold + move)), stops.length - 2);
      const w = ease(clamp01((x - i * (hold + move) - hold) / move));
      return jointsFor(map, stops[i].map((v, k) => v + (stops[i + 1][k] - v) * w), q0);
    },
  };
}

/** Each digit's own motors, by limb; null when a motor moves more than one digit, as a synergy does. */
export function digitMotors(map: MotorMap, limbs: Limb[]): Map<string, number[]> | null {
  const uses = new Map<number, number>();
  for (const l of limbs) for (const k of l.index) uses.set(k, (uses.get(k) ?? 0) + 1);
  const out = new Map<string, number[]>(limbs.map((l) => [l.name, []]));
  for (const [m, drives] of map.drives.entries()) {
    const own = limbs.filter((l) => drives.some((d) => l.index.includes(d.k) && uses.get(d.k) === 1));
    if (own.length > 1) return null;
    if (own.length) out.get(own[0].name)!.push(m);
  }
  return [...out.values()].every((ms) => ms.length) ? out : null;
}

/** The fist: the hand's pointing grip with the index folded the way the middle finger is. */
function fist(map: MotorMap, digits: Map<string, number[]>, open: number[], { over = {}, curl = 1 }: Tuck): number[] | null {
  const point = map.grips.find((g) => g.name === 'point');
  const index = digits.get('index'), middle = digits.get('middle');
  if (!point || !index || !middle || index.length !== middle.length) return null;
  const u = gripMotors(map, point, open).map((v, i) => open[i] + (v - open[i]) * curl);
  index.forEach((m, i) => (u[m] = u[middle[i]]));
  for (const [n, v] of Object.entries(over)) u[map.motors.findIndex((m) => m.name === n)] = v;
  return u;
}

export function countClip(map: MotorMap, limbs: Limb[], q0: number[], start: number[], tuck: Tuck = {}): MotionClip | null {
  const digits = digitMotors(map, limbs);
  const open = openMotors(map);
  const closed = digits && fist(map, digits, open, tuck);
  if (!digits || !closed) return null;
  const across = [...closed];
  for (const [n, v] of Object.entries(tuck.across ?? {})) across[map.motors.findIndex((m) => m.name === n)] = v;
  const names = new Set(limbs.map((l) => l.name));
  // Counting runs index to little, whatever order the model lists them.
  const fingers = ['index', 'middle', 'ring', 'little', 'pinky'].filter((n) => names.has(n));
  // The thumb only comes over once the fingers have curled under it.
  const curled = FOLD + 0.1;
  const folded = curled + 0.5;
  const first = folded + CLEAR;
  const thumbUp = first + fingers.length * BEAT;
  const period = thumbUp + BEAT + 0.55;
  const lead = start.some((v, i) => Math.abs(v - open[i]) > 1e-3) ? LEAD : 0;
  const motors = (t: number) => {
    const u = [...open];
    for (const [i, name] of fingers.entries()) {
      const down = ease(clamp01((t - 0.08 * (fingers.length - 1 - i)) / FOLD));
      const up = ease(clamp01((t - first - i * BEAT) / RISE));
      for (const m of digits.get(name)!) u[m] = open[m] + (closed[m] - open[m]) * down * (1 - up);
    }
    const leave = ease(clamp01((t - folded) / CLEAR)), out = ease(clamp01((t - thumbUp) / RISE));
    const thumb = digits.get('thumb')!;
    for (const [j, m] of thumb.entries()) {
      // Swings out over the fist first, then bends down onto it: straight there it would cut through the index.
      const over = ease(clamp01((t - curled - (j >= thumb.length - 2 ? 0.2 : 0)) / 0.28));
      const a = open[m] + (closed[m] - open[m]) * over;
      const b = a + (across[m] - a) * leave;
      u[m] = b + (open[m] - b) * out;
    }
    return u;
  };
  return {
    period,
    lead,
    at(t) {
      if (t < lead) {
        const w = ease(clamp01(t / lead));
        return jointsFor(map, start.map((v, i) => v + (open[i] - v) * w), q0);
      }
      return jointsFor(map, motors((t - lead) % period), q0);
    },
  };
}
