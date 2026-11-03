/**
 * A trajectory over stops: quintic segments that come to rest at each stop (holding there for
 * `hold` s) or pass through a via at a finite velocity. With plain stops and even pacing this is
 * exactly `quinticAt`, the profile `analyze()` samples.
 */
import type { SampledMotion } from './quintic/sample';
import { blend } from './quintic/profile';

export interface StopOpts {
  /** Pass through without stopping; ignored at the ends and on a held stop. */
  via?: boolean;
  /** Seconds to rest at the stop. */
  hold?: number;
}

/** Even: every move takes the same time. Distance: time follows joint travel, so speed is steady. */
export type Pace = 'even' | 'distance';

export interface Plan {
  waypoints: number[][];
  /** Total time, holds included. */
  duration: number;
  /** Per stop; missing entries are plain stops. */
  opts?: StopOpts[];
  pace?: Pace;
}

export interface PlanState {
  q: number[];
  qd: number[];
  qdd: number[];
  /** Segment from stop `segment` to `segment + 1`, at fraction u. */
  segment: number;
  u: number;
  /** Stop being held, if the robot is resting at one. */
  holding: number | null;
}

export interface Compiled {
  duration: number;
  /** When each stop is reached and left; they differ by its hold. */
  arrive: number[];
  leave: number[];
  /** Velocity at each stop: zero except at vias. */
  v: number[][];
  at(t: number): PlanState;
  /** The stop whose outgoing segment (or hold) holds time t. */
  segmentAt(t: number): number;
}

// Holds never take more than this share of the total, so the robot always has time to move.
const MAX_HELD = 0.8;
// Rest-to-rest moves peak at 1.875× their mean speed; weight them so peak speeds match vias'.
const REST_WEIGHT = 0.4375;

export const isVia = (plan: Plan, i: number): boolean =>
  i > 0 && i < plan.waypoints.length - 1 && !!plan.opts?.[i]?.via && !((plan.opts[i].hold ?? 0) > 0);

const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, k) => b[k] - v));

function segmentTimes(plan: Plan, moving: number): number[] {
  const w = plan.waypoints, n = w.length - 1;
  if (plan.pace !== 'distance') return Array.from({ length: n }, () => moving / n);
  const rest = (i: number) => (isVia(plan, i) ? 0 : 1);
  const len = Array.from({ length: n }, (_, i) => dist(w[i], w[i + 1]) * (1 + REST_WEIGHT * (rest(i) + rest(i + 1))));
  const mean = len.reduce((a, b) => a + b, 0) / n;
  if (!(mean > 1e-12)) return len.map(() => moving / n);
  const weight = len.map((l) => Math.max(l, 0.15 * mean));
  const sum = weight.reduce((a, b) => a + b, 0);
  return weight.map((x) => (moving * x) / sum);
}

/** Catmull–Rom velocity at a via, zeroed per joint where that joint turns back (no overshoot). */
function viaVelocity(a: number[], p: number[], b: number[], ta: number, tb: number): number[] {
  return p.map((x, k) => {
    const sa = (x - a[k]) / ta, sb = (b[k] - x) / tb;
    if (sa * sb <= 0) return 0;
    const v = (b[k] - a[k]) / (ta + tb);
    return Math.sign(v) * Math.min(Math.abs(v), 3 * Math.min(Math.abs(sa), Math.abs(sb)));
  });
}

export function compile(plan: Plan): Compiled {
  const w = plan.waypoints, n = w.length, duration = plan.duration;
  if (n < 2) throw new Error('a trajectory needs at least two stops');
  const holds = w.map((_, i) => (isVia(plan, i) ? 0 : Math.max(plan.opts?.[i]?.hold ?? 0, 0)));
  const held = holds.reduce((a, b) => a + b, 0);
  const k = held > MAX_HELD * duration ? (MAX_HELD * duration) / held : 1;
  const T = segmentTimes(plan, duration - held * k);
  const arrive: number[] = [], leave: number[] = [];
  for (let i = 0; i < n; i++) {
    arrive.push(i === 0 ? 0 : leave[i - 1] + T[i - 1]);
    leave.push(arrive[i] + holds[i] * k);
  }
  arrive[n - 1] = Math.min(arrive[n - 1], duration);
  leave[n - 1] = duration;
  const zero = w[0].map(() => 0);
  const v = w.map((p, i) => (isVia(plan, i) ? viaVelocity(w[i - 1], p, w[i + 1], T[i - 1], T[i]) : zero));

  const segmentAt = (t: number) => {
    let i = 0;
    // On a stop, t can land a hair below its arrival; count it as that stop.
    while (i < n - 2 && t >= arrive[i + 1] - 1e-9) i++;
    return i;
  };

  const at = (time: number): PlanState => {
    const t = Math.min(Math.max(time, 0), duration);
    const i = segmentAt(t);
    if (t < leave[i] && leave[i] > arrive[i]) return { q: [...w[i]], qd: [...zero], qdd: [...zero], segment: i, u: 0, holding: i };
    if (t >= arrive[n - 1] && i === n - 2) return { q: [...w[n - 1]], qd: [...zero], qdd: [...zero], segment: i, u: 1, holding: n - 1 };
    const Ti = arrive[i + 1] - leave[i];
    const u = Math.min(Math.max((t - leave[i]) / Ti, 0), 1);
    const { s, ds, dds } = blend(u);
    const u2 = u * u, u3 = u2 * u, u4 = u3 * u, u5 = u4 * u;
    // Quintic Hermite with zero end accelerations; the velocity terms vanish between plain stops.
    const h1 = u - 6 * u3 + 8 * u4 - 3 * u5, d1 = 1 - 18 * u2 + 32 * u3 - 15 * u4, dd1 = -36 * u + 96 * u2 - 60 * u3;
    const h4 = -4 * u3 + 7 * u4 - 3 * u5, d4 = -12 * u2 + 28 * u3 - 15 * u4, dd4 = -24 * u + 84 * u2 - 60 * u3;
    const a = w[i], b = w[i + 1], va = v[i], vb = v[i + 1];
    return {
      q: a.map((x, j) => x + (b[j] - x) * s + Ti * (va[j] * h1 + vb[j] * h4)),
      qd: a.map((x, j) => ((b[j] - x) * ds) / Ti + va[j] * d1 + vb[j] * d4),
      qdd: a.map((x, j) => ((b[j] - x) * dds) / Ti / Ti + (va[j] * dd1 + vb[j] * dd4) / Ti),
      segment: i,
      u,
      holding: null,
    };
  };

  return { duration, arrive, leave, v, at, segmentAt };
}

/** Uniform samples, as `sampleQuintic` takes them: steps = ceil(duration / dt), held to the limits. */
export function samplePlan(plan: Plan, maxTimestep: number, limits: [number, number][]): SampledMotion {
  const c = compile(plan);
  const ratio = plan.duration / maxTimestep;
  if (!Number.isFinite(ratio) || ratio > 1_000_000) throw new Error('motion exceeds 1,000,000 steps');
  const steps = Math.max(1, Math.ceil(ratio));
  const out: SampledMotion = { t: [], q: [], qd: [], qdd: [], dt: plan.duration / steps };
  for (let i = 0; i <= steps; i++) {
    const t = i === steps ? plan.duration : (i * plan.duration) / steps;
    const s = c.at(t);
    out.t.push(t);
    out.q.push(s.q.map((v, k) => Math.min(Math.max(v, limits[k][0]), limits[k][1])));
    out.qd.push(s.qd);
    out.qdd.push(s.qdd);
  }
  return out;
}
