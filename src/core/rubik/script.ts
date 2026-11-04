/**
 * Where each fingertip goes during every beat of the solve, in the hand frame of plan.ts with the cube's centre at
 * rest as origin. A key is fixed in the hand, or rides the cube or its turning top layer, so a pushing fingertip
 * stays on the face it pushes. The fingers that turn things: the middle finger and thumb turn the top clockwise (and
 * yaw the cube clockwise), the ring finger and thumb counter-clockwise, the four fingers roll the far face up and
 * the thumb rolls the near face up. This is choreography, not contact physics: the cube is not simulated.
 */
import type { Vec3 } from '../math/linear/vec';
import { type Mat3, apply, rotation } from './pieces';
import { type Beat, TIMING, progress } from './timeline';

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'] as const;
export type Finger = (typeof FINGERS)[number];

export const HALF = 0.0285;
/** Fingertip pad radii: where a fingertip's centre sits off a face it touches. */
export const PAD = { finger: 0.0078, thumb: 0.0095 };

const A = HALF, F = HALF + PAD.finger, T = HALF + PAD.thumb;
const TOP = (2 * HALF) / 3, LOW = -0.009;

interface Key {
  at: number;
  p: Vec3;
  /** 'hand' stays put; 'cube' and 'layer' move with the cube or its top layer. */
  on?: 'hand' | 'cube' | 'layer';
  /** Ride the cube as it was at this phase instead of now: a fingertip leaving the face where it let go. */
  frozen?: number;
}

type Track = Key[];

/** Holding the cube between turns: the fingertips on the far face, the thumb lying along the near one. */
export const CRADLE: Record<Finger, Vec3> = {
  thumb: [-0.012, -T - 0.0005, 0.002],
  index: [0.023, F + 0.0005, 0.002],
  middle: [0.003, F + 0.0005, 0.009],
  ring: [-0.014, F + 0.0005, 0.001],
  little: [-0.029, F + 0.0005, -0.008],
};

/** The hand opened flat, for the cube hopping off the palm as it shuffles itself. */
const OPEN: Record<Finger, Vec3> = {
  thumb: [0.05, -0.052, -0.022],
  index: [0.04, 0.085, -0.03],
  middle: [0.014, 0.09, -0.03],
  ring: [-0.01, 0.086, -0.03],
  little: [-0.034, 0.075, -0.032],
};

/** Clear of a cube turning on the palm (its corners sweep √2 · half its size). */
const CLEAR: Record<Finger, Vec3> = {
  thumb: [0.03, -0.056, 0.0],
  index: [0.036, 0.054, -0.006],
  middle: [0.01, 0.058, -0.004],
  ring: [-0.014, 0.056, -0.006],
  little: [-0.036, 0.05, -0.012],
};

const hand = (p: Vec3, at: number): Key => ({ at, p, on: 'hand' });
const rest = (f: Finger, at: number) => hand(CRADLE[f], at);
const out = (p: Vec3, by: number): Vec3 => {
  const n = Math.hypot(p[0], p[1]) || 1;
  return [p[0] + (p[0] / n) * by, p[1] + (p[1] / n) * by, p[2]];
};

/** The phase at which a beat's motion reaches `f` of the way. */
export function phaseAt(kind: Beat['kind'], f: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (progress(kind, mid) < f) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Touch `p` on the moving body, push until `upto` of the motion, then lift `by` off where it let go. */
function push(kind: Beat['kind'], f: Finger, p: Vec3, on: 'cube' | 'layer', upto: number, opts: { lift?: Vec3; via?: Vec3 } = {}): Track {
  const t = TIMING[kind];
  const off = phaseAt(kind, upto);
  const hover = out(p, 0.008);
  const leave = opts.lift ?? out(p, 0.009);
  return [
    rest(f, 0),
    { at: t.from * 0.45, p: hover, on },
    { at: t.from, p, on },
    { at: off, p, on },
    { at: off + 0.1, p: leave, on, frozen: off },
    ...(opts.via ? [hand(opts.via, Math.min(off + 0.18, 0.92))] : []),
    rest(f, 1),
  ];
}

/** Press the lower layers still while the top turns. */
const hold = (f: Finger, p: Vec3): Track => [rest(f, 0), hand(out(p, 0.006), 0.12), hand(p, 0.24), hand(p, 0.8), rest(f, 1)];
const away = (f: Finger, p: Vec3 = CLEAR[f]): Track => [rest(f, 0), hand(p, 0.22), hand(p, 0.84), rest(f, 1)];

type Script = Record<Finger, Track>;

const TWIST_UPTO = 0.62;
const YAW_UPTO = 0.62;
const FLIP_UPTO = 0.7;

export const SCRIPTS: Record<Beat['kind'], Script> = {
  cw: {
    middle: push('cw', 'middle', [-0.35 * A, F, TOP], 'layer', TWIST_UPTO),
    thumb: push('cw', 'thumb', [0.35 * A, -T, TOP], 'layer', TWIST_UPTO),
    ring: hold('ring', [-0.006, F, LOW]),
    little: hold('little', [-0.027, F, LOW - 0.006]),
    index: away('index', [0.04, 0.05, -0.012]),
  },
  ccw: {
    ring: push('ccw', 'ring', [0.35 * A, F, TOP], 'layer', TWIST_UPTO),
    thumb: push('ccw', 'thumb', [-0.35 * A, -T, TOP], 'layer', TWIST_UPTO),
    index: hold('index', [0.024, F, LOW]),
    middle: hold('middle', [0.003, F, LOW]),
    little: away('little', [-0.04, 0.05, -0.012]),
  },
  yawR: {
    middle: push('yawR', 'middle', [-0.35 * A, F, 0], 'cube', YAW_UPTO),
    thumb: push('yawR', 'thumb', [0.35 * A, -T, 0], 'cube', YAW_UPTO),
    index: away('index'),
    ring: away('ring'),
    little: away('little'),
  },
  yawL: {
    ring: push('yawL', 'ring', [0.35 * A, F, 0], 'cube', YAW_UPTO),
    thumb: push('yawL', 'thumb', [-0.35 * A, -T, 0], 'cube', YAW_UPTO),
    index: away('index'),
    middle: away('middle'),
    little: away('little'),
  },
  flipFar: {
    index: push('flipFar', 'index', [0.017, F, -0.012], 'cube', FLIP_UPTO, { via: [0.03, 0.05, 0.03] }),
    middle: push('flipFar', 'middle', [0.0, F, -0.012], 'cube', FLIP_UPTO, { via: [0.006, 0.052, 0.032] }),
    ring: push('flipFar', 'ring', [-0.016, F, -0.012], 'cube', FLIP_UPTO, { via: [-0.014, 0.05, 0.03] }),
    little: push('flipFar', 'little', [-0.025, F, -0.016], 'cube', FLIP_UPTO, { via: [-0.028, 0.048, 0.022] }),
    thumb: push('flipFar', 'thumb', [0.006, -T, 0.012], 'cube', 0.3),
  },
  flipNear: {
    thumb: push('flipNear', 'thumb', [0.004, -T, -0.012], 'cube', FLIP_UPTO, { via: [0.03, -0.05, 0.03] }),
    index: push('flipNear', 'index', [0.017, F, 0.012], 'cube', 0.3),
    middle: push('flipNear', 'middle', [0.0, F, 0.012], 'cube', 0.3),
    ring: push('flipNear', 'ring', [-0.016, F, 0.012], 'cube', 0.3),
    little: away('little'),
  },
  scramble: Object.fromEntries(FINGERS.map((f) => [f, [rest(f, 0), hand(OPEN[f], 0.14), hand(OPEN[f], 0.86), rest(f, 1)]])) as Script,
  hold: Object.fromEntries(FINGERS.map((f) => [f, [rest(f, 0)]])) as Script,
};

/** The cube's own motion in a beat: how a point riding the cube, or its top layer, moves at `phase`. */
export function bodyMotion(kind: Beat['kind'], phase: number): { cube: (p: Vec3) => Vec3; layer: (p: Vec3) => Vec3 } {
  const f = progress(kind, phase);
  const turn = (R: Mat3, lift = 0) => (p: Vec3): Vec3 => {
    const q = apply(R, p);
    return [q[0], q[1], q[2] + lift];
  };
  const still = (p: Vec3) => p;
  const quarter = (f * Math.PI) / 2;
  switch (kind) {
    case 'cw': return { cube: still, layer: turn(rotation([0, 0, 1], -quarter)) };
    case 'ccw': return { cube: still, layer: turn(rotation([0, 0, 1], quarter)) };
    case 'yawL': return { cube: turn(rotation([0, 0, 1], quarter)), layer: still };
    case 'yawR': return { cube: turn(rotation([0, 0, 1], -quarter)), layer: still };
    case 'flipFar':
    case 'flipNear': {
      const R = rotation([1, 0, 0], kind === 'flipFar' ? quarter : -quarter);
      const lift = HALF * (Math.cos(quarter) + Math.sin(quarter) - 1);
      return { cube: turn(R, lift), layer: turn(R, lift) };
    }
    default: return { cube: still, layer: still };
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** The fingertip's target at `phase` of a beat, hand frame. */
export function fingerTarget(kind: Beat['kind'], finger: Finger, phase: number): Vec3 {
  const keys = SCRIPTS[kind][finger];
  const where = (k: Key): Vec3 => {
    if (!k.on || k.on === 'hand') return k.p;
    const m = bodyMotion(kind, k.frozen ?? phase);
    return m[k.on](k.p);
  };
  if (phase <= keys[0].at) return where(keys[0]);
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i], b = keys[i + 1];
    if (phase > b.at) continue;
    const s = smooth((phase - a.at) / Math.max(1e-9, b.at - a.at));
    const pa = where(a), pb = where(b);
    return [0, 1, 2].map((k) => pa[k] + (pb[k] - pa[k]) * s) as Vec3;
  }
  return where(keys[keys.length - 1]);
}

/** The cube's solid shape at `phase` as boxes (centre, rotation, half sizes), hand frame: the turning top separate. */
export function cubeBoxes(kind: Beat['kind'], phase: number): { c: Vec3; R: Mat3; half: Vec3 }[] {
  const f = progress(kind, phase), quarter = (f * Math.PI) / 2;
  if (kind === 'cw' || kind === 'ccw') {
    const I = rotation([0, 0, 1], 0);
    return [
      { c: [0, 0, -A / 3], R: I, half: [A, A, (2 * A) / 3] },
      { c: [0, 0, TOP], R: rotation([0, 0, 1], kind === 'cw' ? -quarter : quarter), half: [A, A, A / 3] },
    ];
  }
  const m = bodyMotion(kind, phase);
  const c = m.cube([0, 0, 0]);
  const R = kind === 'yawL' || kind === 'yawR'
    ? rotation([0, 0, 1], (kind === 'yawL' ? 1 : -1) * quarter)
    : kind === 'flipFar' || kind === 'flipNear' ? rotation([1, 0, 0], (kind === 'flipFar' ? 1 : -1) * quarter) : rotation([0, 0, 1], 0);
  return [{ c, R, half: [A, A, A] }];
}

