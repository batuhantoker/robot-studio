/** Uniform sampling identical to `analyze()`: steps = ceil(duration / dt), clipped, endpoints at rest. */
import { quinticAt } from './profile';

export interface SampledMotion {
  t: number[];
  q: number[][];
  qd: number[][];
  qdd: number[][];
  dt: number;
}

export function sampleQuintic(
  waypoints: number[][],
  duration: number,
  maxTimestep: number,
  limits: [number, number][],
): SampledMotion {
  if (waypoints.length < 2) throw new Error('waypoints must contain at least two joint vectors');
  const ratio = duration / maxTimestep;
  if (!Number.isFinite(ratio) || ratio > 1_000_000) throw new Error('motion exceeds 1,000,000 steps');
  const steps = Math.max(1, Math.ceil(ratio));
  const out: SampledMotion = { t: [], q: [], qd: [], qdd: [], dt: duration / steps };
  for (let i = 0; i <= steps; i++) {
    // np.linspace computes start + i * step, with the last sample pinned to the stop value.
    const t = i === steps ? duration : (i * duration) / steps;
    const s = quinticAt(waypoints, duration, t);
    out.t.push(t);
    out.q.push(s.q.map((v, k) => Math.min(Math.max(v, limits[k][0]), limits[k][1])));
    out.qd.push(s.qd);
    out.qdd.push(s.qdd);
  }
  out.q[0] = [...waypoints[0]];
  out.q[steps] = [...waypoints[waypoints.length - 1]];
  for (const i of [0, steps]) {
    out.qd[i] = out.qd[i].map(() => 0);
    out.qdd[i] = out.qdd[i].map(() => 0);
  }
  return out;
}

/** The default scenario: home → home+0.35 → home−0.35 → home, each clipped to limits; home is zero unless given. */
export function defaultWaypoints(limits: [number, number][], from?: number[]): number[][] {
  const clip = (v: number, k: number) => Math.min(Math.max(v, limits[k][0]), limits[k][1]);
  const home = limits.map((_, k) => clip(from?.[k] ?? 0, k));
  return [home, home.map((v, k) => clip(v + 0.35, k)), home.map((v, k) => clip(v - 0.35, k)), home];
}
