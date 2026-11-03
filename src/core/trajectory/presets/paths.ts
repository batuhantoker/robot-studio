/**
 * Tool paths for trajectory presets, in a local frame measured in limb reaches: (a, b) span the
 * work surface and c is lift off it. Corners and work points are stops; the drawn lines are vias.
 */
export type P3 = [number, number, number];

export interface PathPoint {
  p: P3;
  via: boolean;
  hold?: number;
}

const TAU = Math.PI * 2;
/** Spacing of via points along a drawn line, in reaches; dense enough that joint interpolation tracks it. */
const STEP = 0.03;
const LIFT = 0.06;

const lerp = (a: P3, b: P3, u: number): P3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const up = (p: P3, h: number): P3 => [p[0], p[1], p[2] + h];
const stop = (p: P3, hold?: number): PathPoint => ({ p, via: false, hold });
const via = (p: P3): PathPoint => ({ p, via: true });

/** Vias from a (exclusive) to b, then b itself as a stop or a via. */
function line(a: P3, b: P3, end: 'stop' | 'via'): PathPoint[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / STEP));
  return Array.from({ length: n }, (_, i) => (i === n - 1 && end === 'stop' ? stop(b) : via(lerp(a, b, (i + 1) / n))));
}

/** A closed polyline drawn with the pen: approach, down, corners as stops, back up. */
function drawn(corners: P3[]): PathPoint[] {
  const out = [via(up(corners[0], LIFT)), stop(corners[0])];
  corners.forEach((c, i) => out.push(...line(c, corners[(i + 1) % corners.length], 'stop')));
  return [...out, via(up(corners[0], LIFT))];
}

/** A smooth curve sampled every STEP of arc length, pen down at both ends. */
function curve(f: (u: number) => P3, length: number): PathPoint[] {
  const n = Math.max(8, Math.ceil(length / STEP));
  const pts = Array.from({ length: n + 1 }, (_, i) => f(i / n));
  return [via(up(pts[0], LIFT)), stop(pts[0]), ...pts.slice(1, -1).map(via), stop(pts[n]), via(up(pts[n], LIFT))];
}

export function square(s: number): PathPoint[] {
  const h = 0.15 * s;
  return drawn([[-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0]]);
}

/** A pentagram: every second vertex, so the pen crosses its own lines. */
export function star(s: number): PathPoint[] {
  const R = 0.17 * s;
  const v = (k: number): P3 => [R * Math.sin((TAU * k) / 5), R * Math.cos((TAU * k) / 5), 0];
  return drawn([0, 2, 4, 1, 3].map(v));
}

export function spiral(s: number, turns = 3): PathPoint[] {
  const r0 = 0.02 * s, r1 = 0.17 * s;
  const f = (u: number): P3 => {
    const r = r0 + (r1 - r0) * u, a = TAU * turns * u;
    return [r * Math.cos(a), r * Math.sin(a), 0];
  };
  return curve(f, Math.PI * turns * (r0 + r1));
}

/** Lemniscate of Gerono, twice round. */
export function figureEight(s: number): PathPoint[] {
  const R = 0.17 * s;
  return curve((u) => [R * Math.sin(2 * TAU * u), R * Math.sin(2 * TAU * u) * Math.cos(2 * TAU * u), 0], 2 * 3.0 * 2 * R);
}

/** A weld seam woven side to side, with a dwell to strike the arc and another to fill the crater. */
export function weave(s: number, cycles = 8): PathPoint[] {
  const half = 0.2 * s, amp = 0.025 * s;
  const pts = curve((u) => [-half + 2 * half * u, amp * Math.sin(TAU * cycles * u), 0], 2 * half + 4 * amp * cycles);
  pts[1].hold = 0.6;
  pts[pts.length - 2].hold = 0.6;
  return pts;
}

/** A lawnmower scan: straight rows joined by half-turns, never stopping in between. */
export function raster(s: number, rows = 5): PathPoint[] {
  const w = 0.15 * s, gap = 0.055 * s, r = gap / 2;
  const y0 = (-(rows - 1) * gap) / 2;
  const out: PathPoint[] = [];
  for (let i = 0; i < rows; i++) {
    const y = y0 + i * gap, dir = i % 2 ? -1 : 1;
    const a: P3 = [-dir * w, y, 0], b: P3 = [dir * w, y, 0];
    if (i === 0) out.push(via(up(a, LIFT)), stop(a));
    out.push(...line(a, b, i === rows - 1 ? 'stop' : 'via'));
    if (i === rows - 1) break;
    const n = 6;
    for (let k = 1; k < n; k++) {
      const t = (Math.PI * k) / n;
      out.push(via([dir * (w + r * Math.sin(t)), y + r - r * Math.cos(t), 0]));
    }
  }
  return [...out, via(up(out[out.length - 1].p, LIFT))];
}

/** Rising helix about the surface normal: a 3D path, not a drawing. */
export function helix(s: number, turns = 3): PathPoint[] {
  const R = 0.11 * s, rise = 0.2 * s;
  const pts = curve((u) => [R * Math.cos(TAU * turns * u), R * Math.sin(TAU * turns * u), rise * u], TAU * R * turns + rise);
  return pts.slice(1, -1);
}

/** Over A, down, grip, up, carry over the top, down at B, release, up. */
export function pickAndPlace(s: number): PathPoint[] {
  const d = 0.17 * s, h = 0.12 * s, grip = 0.5;
  const A: P3 = [-d, 0, 0], B: P3 = [d, 0, 0];
  return [via(up(A, h)), stop(A, grip), via(up(A, h)), via([0, 0, 1.5 * h]), via(up(B, h)), stop(B, grip), via(up(B, h))];
}

/** One pick station feeding a 2×2 pallet, place by place. */
export function palletize(s: number): PathPoint[] {
  const h = 0.11 * s, grip = 0.35, pitch = 0.09 * s;
  const P: P3 = [-0.2 * s, 0, 0];
  const slots: P3[] = [[0.1 * s, -pitch / 2, 0], [0.1 * s + pitch, -pitch / 2, 0], [0.1 * s, pitch / 2, 0], [0.1 * s + pitch, pitch / 2, 0]];
  return slots.flatMap((g) => [via(up(P, h)), stop(P, grip), via(up(P, h)), via(up(g, h)), stop(g, grip), via(up(g, h))]);
}
