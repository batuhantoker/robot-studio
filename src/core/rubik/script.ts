/**
 * Where each fingertip goes during every beat of the solve, in the hand frame of plan.ts with the cube's centre at
 * rest as origin, for a cube 57 mm across (other hands scale it). A curled finger can't move sideways, so each
 * finger works in its own column (its knuckle's sideways position) and the thumb on the cube's face on its side.
 * Turns are pressed, not dragged: a fingertip pressing the far face off-centre and the thumb pressing its own face
 * off-centre make a turning moment, the face slides under them, and they let go early so the layer flicks on to its
 * detent. Flips are pushed just past tipping and the cube falls onto its new face. This is choreography, not contact
 * physics: the cube is not simulated.
 */
import type { Vec3 } from '../math/linear/vec';
import { type Mat3, apply, rotation } from './pieces';
import { type Beat, TIMING, progress } from './timeline';

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'] as const;
export type Finger = (typeof FINGERS)[number];

export const HALF = 0.0285;
/** Fingertip pad radii: where a fingertip's centre sits off a face it touches. */
export const PAD = { finger: 0.0078, thumb: 0.0095 };

const A = HALF, F = HALF + PAD.finger, S = HALF + PAD.thumb;
export const TOP = (2 * HALF) / 3;
const LOW = -0.009;

/** Sideways position of each finger's knuckle in the hand frame (thumb side positive). */
export type Columns = Partial<Record<Finger, number>>;
/** Where on its own face (depth towards the fingertips, height) the thumb rests, presses each way, and steadies a flip. */
export type ThumbSpots = Record<'rest' | 'cw' | 'ccw' | 'yawR' | 'yawL' | 'flip', [number, number]>;
export interface Layout {
  columns: Columns;
  thumb: ThumbSpots;
}

/**
 * The Shadow right hand's. Its thumb is long: it reaches the upper, far part of its face lying along it, and can't fold
 * onto the low near part, so clockwise presses sit only just towards the wrist.
 */
export const SHADOW_LAYOUT: Layout = {
  columns: { index: 0.038, middle: 0.016, ring: -0.006, little: -0.028 },
  thumb: { rest: [0.008, 0.012], cw: [-0.006, TOP], ccw: [0.014, TOP], yawR: [-0.006, 0.014], yawL: [0.014, 0.014], flip: [0.008, 0.012] },
};

interface Key {
  at: number;
  p: Vec3;
  /** 'hand' stays put; 'cube' and 'layer' move with the cube or its top layer. */
  on?: 'hand' | 'cube' | 'layer';
  /** Pressed against a turning face where it crosses this column ('far') or depth ('side'), the face sliding under it. */
  slide?: 'far' | 'side';
  /** Ride the cube as it was at this phase instead of now: a fingertip leaving the face where it let go. */
  frozen?: number;
  /** Riding just off the face on the way in, not yet touching. */
  hover?: boolean;
}

type Track = Key[];
type Script = Partial<Record<Finger, Track>>;

const hand = (p: Vec3, at: number): Key => ({ at, p, on: 'hand' });
/** A column on the face; a finger whose knuckle is just past the edge presses the edge rather than crowding its neighbour. */
const clampFace = (x: number) => Math.min(Math.max(x, -A), A);

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

/** How far the turning body has rotated about the palm normal (radians, counter-clockwise seen from above). */
function spin(kind: Beat['kind'], phase: number): number {
  const q = (progress(kind, phase) * Math.PI) / 2;
  return kind === 'cw' || kind === 'yawR' ? -q : kind === 'ccw' || kind === 'yawL' ? q : 0;
}

/** Pressing fingers let go a little over a third of the way through a turn; past that the face slides away from them. */
const TURN_UPTO = 0.4;
/** Flipping fingers push the cube just past tipping over, then let it fall onto its new face. */
const FLIP_UPTO = 0.42;

function build({ columns: cols, thumb: spot }: Layout): Record<Beat['kind'], Script> {
  const has = (f: Finger) => cols[f] !== undefined;
  const col = (f: Finger) => cols[f] ?? 0;
  const digits = (['index', 'middle', 'ring', 'little'] as const).filter(has);
  const onFace = digits.filter((f) => Math.abs(col(f)) <= A + 0.002);
  // A finger at the face's edge curls in as it rolls the cube; next to a close neighbour it would land on it.
  const rollers = onFace.filter((f) => Math.abs(col(f)) <= A - 0.003 || onFace.every((g) => g === f || Math.abs(col(g) - col(f)) >= 0.026));
  const cradle: Script = { thumb: [hand([S + 0.0005, ...spot.rest], 0)] };
  for (const f of digits) cradle[f] = [hand([clampFace(col(f)), F + 0.0005, f === 'middle' ? 0.008 : 0.002], 0)];
  const rest = (f: Finger, at: number): Key => ({ ...cradle[f]![0], at });
  const flat = (f: Finger): Vec3 => (f === 'thumb' ? [0.07, -0.012, -0.03] : [col(f), 0.112, -0.04]);
  const back = (f: Finger): Vec3 => {
    const r = cradle[f]![0].p;
    return f === 'thumb' ? [r[0] + 0.012, r[1], r[2]] : [r[0], r[1] + 0.014, r[2] + 0.006];
  };
  /** Out of the way, and back to the cube from outside rather than sweeping up past a neighbour. */
  const away = (f: Finger): Track => [rest(f, 0), hand(flat(f), 0.22), hand(flat(f), 0.78), hand(back(f), 0.9), rest(f, 1)];
  const hold = (f: Finger, h: number): Track => {
    const p: Vec3 = [clampFace(col(f)), F, h];
    return [rest(f, 0), hand([p[0], p[1] + 0.006, h], 0.12), hand(p, 0.24), hand(p, 0.8), rest(f, 1)];
  };
  /** Press a turning face and ride it until it starts sliding away, then lift straight off it. */
  const press = (kind: Beat['kind'], f: Finger, p: Vec3, slide: 'far' | 'side', on: 'cube' | 'layer'): Track => {
    const t = TIMING[kind], off = phaseAt(kind, TURN_UPTO);
    const lifted: Vec3 = slide === 'far' ? [p[0], p[1] + 0.009, p[2]] : [p[0] + 0.009, p[1], p[2]];
    const near: Vec3 = slide === 'far' ? [p[0], p[1] + 0.007, p[2]] : [p[0] + 0.007, p[1], p[2]];
    return [rest(f, 0), { at: t.from * 0.45, p: near, slide, on, hover: true }, { at: t.from, p, slide, on }, { at: off, p, slide, on },
      { at: off + 0.1, p: lifted, slide, on, frozen: off }, rest(f, 1)];
  };
  /** Touch `p` on the cube from `from`, ride it until `upto` of a flip, then lift off to `leave` and come back round by `via`. */
  const ride = (kind: Beat['kind'], f: Finger, p: Vec3, upto: number, leave: Vec3, via?: Vec3, from: Vec3 = [0, 0.008, 0]): Track => {
    const t = TIMING[kind], off = phaseAt(kind, upto);
    const near: Vec3 = [p[0] + from[0], p[1] + from[1], p[2] + from[2]];
    return [rest(f, 0), { at: t.from * 0.45, p: near, on: 'cube', hover: true }, { at: t.from, p, on: 'cube' }, { at: off, p, on: 'cube' },
      { at: off + 0.1, p: leave, on: 'cube', frozen: off }, ...(via ? [hand(via, Math.min(off + 0.18, 0.92))] : []), rest(f, 1)];
  };
  /** The thumb steadies the cube from its own face through the start of a roll, then lifts clear. */
  const steady = (kind: Beat['kind']): Track => ride(kind, 'thumb', [S, ...spot.flip], FLIP_UPTO, [S + 0.009, ...spot.flip], undefined, [0.007, 0, 0]);

  // Clockwise needs a press on the thumb's half of the far face; counter-clockwise on the little finger's half.
  const thumbHalf = onFace.filter((f) => col(f) > 0.004);
  const littleHalf = onFace.filter((f) => col(f) <= 0.004);
  const cwPushers = thumbHalf.length ? thumbHalf.slice(-1) : onFace.slice(0, 1);
  const ccwPushers = littleHalf.length ? littleHalf : onFace.slice(-1);
  const turn = (kind: Beat['kind'], pushers: Finger[], at: [number, number], h: number, holders: Finger[], on: 'cube' | 'layer'): Script => {
    const sc: Script = { thumb: press(kind, 'thumb', [S, ...at], 'side', on) };
    for (const f of digits) {
      if (pushers.includes(f)) sc[f] = press(kind, f, [clampFace(col(f)), F, h], 'far', on);
      else if (holders.includes(f)) sc[f] = hold(f, LOW - 0.002);
      else sc[f] = away(f);
    }
    return sc;
  };
  const scripts: Record<Beat['kind'], Script> = {
    cw: turn('cw', cwPushers, spot.cw, TOP, littleHalf.filter((f) => !cwPushers.includes(f)), 'layer'),
    ccw: turn('ccw', ccwPushers, spot.ccw, TOP, thumbHalf.filter((f) => !ccwPushers.includes(f)), 'layer'),
    yawR: turn('yawR', cwPushers, spot.yawR, 0.014, [], 'cube'),
    yawL: turn('yawL', ccwPushers, spot.yawL, 0.014, [], 'cube'),
    flipFar: { thumb: steady('flipFar') },
    flipNear: { thumb: steady('flipNear') },
    scramble: {},
    hold: {},
  };
  for (const f of digits) {
    const x = clampFace(col(f));
    scripts.flipFar[f] = rollers.includes(f)
      // Pressed high, like tipping a box over: the contact rides up and in, clear of the bottom edge swinging out.
      ? ride('flipFar', f, [x, F, 0.014], FLIP_UPTO, [x, F + 0.009, 0.014], [x, 0.05, 0.03])
      : away(f);
    // The fingertips hook the top's far edge and pull it over towards them.
    scripts.flipNear[f] = rollers.includes(f)
      ? ride('flipNear', f, [x, A - 0.008, F], FLIP_UPTO, [x, A + 0.004, F + 0.008])
      : away(f);
  }
  for (const f of ['thumb', ...digits] as Finger[]) {
    scripts.scramble[f] = [rest(f, 0), hand(flat(f), 0.1), hand(flat(f), 0.9), rest(f, 1)];
    scripts.hold[f] = [rest(f, 0)];
  }
  return scripts;
}

const built = new Map<string, Record<Beat['kind'], Script>>();
const scriptsFor = (layout: Layout) => {
  const key = JSON.stringify(layout);
  if (!built.has(key)) built.set(key, build(layout));
  return built.get(key)!;
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

/** Where a pressing fingertip sits on a face turned by φ about the palm normal, at its fixed column (or depth). */
function slid(p: Vec3, slide: 'far' | 'side', phi: number): Vec3 {
  const c = Math.cos(phi), s = Math.sin(phi);
  if (slide === 'far') {
    const d = p[1], u = Math.min(Math.max((p[0] + d * s) / c, -A), A);
    return [u * c - d * s, u * s + d * c, p[2]];
  }
  const d = p[0], v = Math.min(Math.max((p[1] - d * s) / c, -A), A);
  return [d * c - v * s, d * s + v * c, p[2]];
}

const smooth = (x: number) => x * x * (3 - 2 * x);

function place(kind: Beat['kind'], k: Key, phase: number): Vec3 {
  if (!k.on || k.on === 'hand') return k.p;
  const at = k.frozen ?? phase;
  if (k.slide) return slid(k.p, k.slide, spin(kind, at));
  return bodyMotion(kind, at)[k.on](k.p);
}

/** The fingertip's target at `phase` of a beat, hand frame, for a hand laid out as `layout`. */
export function fingerTarget(kind: Beat['kind'], finger: Finger, phase: number, layout: Layout = SHADOW_LAYOUT): Vec3 {
  const sc = scriptsFor(layout);
  const keys = sc[kind][finger] ?? sc.hold[finger] ?? [hand([0, F, 0], 0)];
  if (phase <= keys[0].at) return place(kind, keys[0], phase);
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i], b = keys[i + 1];
    if (phase > b.at) continue;
    const s = smooth((phase - a.at) / Math.max(1e-9, b.at - a.at));
    const pa = place(kind, a, phase), pb = place(kind, b, phase);
    return [0, 1, 2].map((k) => pa[k] + (pb[k] - pa[k]) * s) as Vec3;
  }
  return place(kind, keys[keys.length - 1], phase);
}

/** Whether a finger is meant to be on the cube at `phase`, pressing it or riding it as it turns. */
export function touching(kind: Beat['kind'], finger: Finger, phase: number, layout: Layout = SHADOW_LAYOUT): boolean {
  const keys = scriptsFor(layout)[kind][finger] ?? [];
  const riding = (k: Key) => (k.on === 'cube' || k.on === 'layer') && k.frozen === undefined && !k.hover;
  return keys.some((a, i) => i + 1 < keys.length && riding(a) && riding(keys[i + 1]) && phase >= a.at && phase <= keys[i + 1].at);
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
