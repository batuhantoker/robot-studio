/** Two bars on pins, from the pose you set: Lagrange's equations integrated, for one run or a fan of runs a hair apart. */
import type { RobotSpec } from '../../robot/schema/types';
import { type Vec3, norm } from '../../math/linear/vec';
import type { ClipFan, MotionClip, MotionPreset } from '../types';

export interface Bars {
  /** Mass, pin to pin length, pin to centre of mass and inertia about that centre, per bar. */
  m: [number, number];
  l: [number, number];
  c: [number, number];
  I: [number, number];
  g: number;
}

/** Absolute angles from hanging, then their rates. */
export type State = [number, number, number, number];

/** Seconds per step, as MuJoCo's own. */
const STEP = 0.002;
/** Steps per stored sample. */
const STRIDE = 4;
const RUN = 40;
/** Seconds it takes to be lifted back to where it was let go. */
const BACK = 2.5;
/** Radians across the fan at size 1, and how many it holds. */
const SPREAD = 1e-6;
const FAN = 96;
/** The fan's plane, in front of everything on the rig (m). */
const FRONT = 0.08;
const G = 9.81;
const TAU = 2 * Math.PI;

/** The inertia MuJoCo gives a uniform capsule about its middle, across its length. */
function capsule(mass: number, r: number, h: number): number {
  const ball = (mass * 4 * r) / (4 * r + 3 * h), rod = mass - ball;
  return (rod * (3 * r * r + h * h)) / 12 + 0.4 * ball * r * r + (ball * h * (3 * r + 2 * h)) / 8;
}

/** The model MuJoCo compiles from this spec, about each centre of mass; null unless two frictionless bars hang from parallel level pins at zero. */
export function barsOf(spec: RobotSpec): Bars | null {
  const [a, b] = spec.links;
  const onLine = (p: number[] | undefined) => !p || (p[0] === 0 && p[1] === 0);
  const hangs = (l: typeof a) => l.axis[1] === 1 && onLine(l.offset) && onLine(l.com) && l.offset[2] < 0 && !l.damping && !l.armature;
  if (spec.links.length !== 2 || !hangs(a) || !hangs(b) || spec.payload_mass) return null;
  const l: [number, number] = [norm(a.offset), norm(b.offset)];
  const centre = (x: typeof a, length: number) => (x.com ? -x.com[2] : length / 2);
  const about = (x: typeof a, length: number) => x.inertia?.[1] ?? capsule(x.mass, x.radius, length);
  return { m: [a.mass, b.mass], l, c: [centre(a, l[0]), centre(b, l[1])], I: [about(a, l[0]), about(b, l[1])], g: G };
}

export const stateOf = (q: number[]): State => [q[0], q[0] + q[1], 0, 0];

export function rates({ m, l, c, I, g }: Bars, [a1, a2, w1, w2]: State): State {
  const d = a1 - a2, k = m[1] * l[0] * c[1], cos = Math.cos(d), sin = Math.sin(d);
  const M11 = I[0] + m[0] * c[0] * c[0] + m[1] * l[0] * l[0], M22 = I[1] + m[1] * c[1] * c[1], M12 = k * cos;
  const r1 = -k * sin * w2 * w2 - g * (m[0] * c[0] + m[1] * l[0]) * Math.sin(a1);
  const r2 = k * sin * w1 * w1 - g * m[1] * c[1] * Math.sin(a2);
  const det = M11 * M22 - M12 * M12;
  return [w1, w2, (M22 * r1 - M12 * r2) / det, (M11 * r2 - M12 * r1) / det];
}

export function energy({ m, l, c, I, g }: Bars, [a1, a2, w1, w2]: State): number {
  const M11 = I[0] + m[0] * c[0] * c[0] + m[1] * l[0] * l[0], M22 = I[1] + m[1] * c[1] * c[1];
  const kinetic = 0.5 * M11 * w1 * w1 + 0.5 * M22 * w2 * w2 + m[1] * l[0] * c[1] * w1 * w2 * Math.cos(a1 - a2);
  return kinetic - g * (m[0] * c[0] + m[1] * l[0]) * Math.cos(a1) - g * m[1] * c[1] * Math.cos(a2);
}

/** One classical Runge-Kutta step. */
export function step(b: Bars, s: State, h: number): State {
  const along = (k: State, by: number) => s.map((v, i) => v + k[i] * by) as State;
  const k1 = rates(b, s), k2 = rates(b, along(k1, h / 2)), k3 = rates(b, along(k2, h / 2)), k4 = rates(b, along(k3, h));
  return s.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as State;
}

const period = RUN + BACK;
const SAMPLE = STEP * STRIDE;
const SAMPLES = Math.round(RUN / SAMPLE) + 1;
const ease = (x: number) => x * x * (3 - 2 * x);
const shortest = (from: number, to: number) => ((((to - from) % TAU) + 3 * Math.PI) % TAU) - Math.PI;

/** Runs from `starts`, stepped only as far as they have been asked for: a big fan costs a frame's worth at a time. */
class Runs {
  private readonly state: State[];
  private readonly table: Float64Array[];
  private done = 1;

  constructor(private readonly bars: Bars, readonly starts: State[]) {
    this.state = starts.map((s) => [...s] as State);
    this.table = starts.map((s) => {
      const t = new Float64Array(4 * SAMPLES);
      t.set(s);
      return t;
    });
  }

  private reach(n: number): void {
    for (; this.done <= n; this.done++) {
      this.state.forEach((s, k) => {
        let next = s;
        for (let i = 0; i < STRIDE; i++) next = step(this.bars, next, STEP);
        this.state[k] = next;
        this.table[k].set(next, 4 * this.done);
      });
    }
  }

  /** Run `k` at time `t` into `out`: free for RUN seconds, then lifted back along the shortest way. */
  at(k: number, t: number, out: State): void {
    const u = ((t % period) + period) % period, x = Math.min(u, RUN) / SAMPLE, i = Math.min(Math.floor(x), SAMPLES - 2), f = x - i;
    this.reach(i + 1);
    const T = this.table[k];
    for (let c = 0; c < 4; c++) out[c] = T[4 * i + c] + (T[4 * i + 4 + c] - T[4 * i + c]) * f;
    if (u <= RUN) return;
    const x0 = (u - RUN) / BACK, e = ease(x0), rate = (6 * x0 * (1 - x0)) / BACK;
    for (let c = 0; c < 2; c++) {
      const gap = shortest(out[c], this.starts[k][c]);
      out[c] += gap * e;
      out[2 + c] = gap * rate;
    }
  }
}

function fanOf(runs: Runs, bars: Bars, pivot: Vec3, count: number): ClipFan {
  const s: State = [0, 0, 0, 0];
  return {
    count,
    pivot,
    at(t, out) {
      for (let k = 0; k < count; k++) {
        runs.at(k, t, s);
        const ex = pivot[0] - bars.l[0] * Math.sin(s[0]), ez = pivot[2] - bars.l[0] * Math.cos(s[0]);
        out[4 * k] = ex;
        out[4 * k + 1] = ez;
        out[4 * k + 2] = ex - bars.l[1] * Math.sin(s[1]);
        out[4 * k + 3] = ez - bars.l[1] * Math.cos(s[1]);
      }
    },
  };
}

/** Runs from `q0`, each started `spread` wide of the last across the first bar; the robot itself plays the one from `q0`. */
export function pendulumClip(spec: RobotSpec, bars: Bars, q0: number[], count: number, spread: number): MotionClip {
  const start = stateOf(q0), n = Math.max(count, 1);
  const starts = Array.from({ length: n }, (_, k): State => {
    const off = n > 1 ? spread * (k / (n - 1) - 0.5) : 0;
    return [start[0] + off, start[1] + off, 0, 0];
  });
  const runs = new Runs(bars, [start]), others = new Runs(bars, starts);
  const s: State = [0, 0, 0, 0];
  const [x, y, z] = spec.base;
  return {
    period,
    at(t) {
      runs.at(0, t, s);
      return [s[0], s[1] - s[0]];
    },
    qd(t) {
      runs.at(0, t, s);
      return [s[2], s[3] - s[2]];
    },
    fan: fanOf(others, bars, [x, y - FRONT, z], n),
  };
}

/** What a pair of bars does let go: alone, or as a fan. */
export function pendulumMotions(spec: RobotSpec): MotionPreset[] {
  const bars = barsOf(spec);
  if (!bars) return [];
  return [
    { id: 'release', label: 'Release', hint: 'Let go from the pose you set, with no torque: gravity alone', build: (_, q0) => pendulumClip(spec, bars, q0, 1, 0) },
    {
      id: 'fan', label: 'Fan', hint: `${FAN} pendulums let go a millionth of a radian apart: one bar, then a flower. Size sets the gap`,
      build: (_, q0, size) => pendulumClip(spec, bars, q0, FAN, SPREAD * size),
    },
  ];
}
