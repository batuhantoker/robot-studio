/**
 * Stop-at-waypoint quintic segments from `analyze()`: s(u) = 10u³ − 15u⁴ + 6u⁵ with equal
 * segment durations, so velocity and acceleration are zero at every waypoint.
 */
export interface QuinticState {
  q: number[];
  qd: number[];
  qdd: number[];
  segment: number;
  u: number;
}

export const blend = (u: number) => ({
  s: u ** 3 * (10 + u * (-15 + 6 * u)),
  ds: 30 * u ** 2 * (1 - u) ** 2,
  dds: 60 * u * (1 - u) * (1 - 2 * u),
});

export function quinticAt(waypoints: number[][], duration: number, t: number): QuinticState {
  const segments = waypoints.length - 1;
  const T = duration / segments;
  const segment = Math.min(Math.floor(t / T), segments - 1);
  const u = Math.min(Math.max(t / T - segment, 0), 1);
  const { s, ds, dds } = blend(u);
  const start = waypoints[segment];
  const delta = waypoints[segment + 1].map((v, i) => v - start[i]);
  return {
    q: start.map((v, i) => v + delta[i] * s),
    qd: delta.map((d) => (d * ds) / T),
    qdd: delta.map((d) => (d * dds) / T / T),
    segment,
    u,
  };
}
