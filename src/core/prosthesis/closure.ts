/**
 * Fingers closing on a held object, as a hand really does it: each joint keeps closing until the link it moves meets the
 * surface, and joints beyond that link carry on. Measured against the drawn surface, so the fingers stop where the eye says.
 */
import { compose, invert, type Transform } from '../math/linear/transform';
import type { HeldShape } from './held';
import { heldDistance } from './held';
import { jointsFor, type MotorMap } from './motors';

export interface HandLink {
  name: string;
  /** The limb it belongs to; null for the palm, wrist and forearm. */
  finger: string | null;
  /** Whole-robot joints that move it, nearest first. */
  joints: number[];
  /** Surface samples in the link's frame, xyz triples. */
  points: Float64Array;
}

export interface HandSurface {
  links: HandLink[];
  /** Each link's frame for a joint vector, in the model frame. */
  frames(q: number[]): Transform[];
}

export interface Held {
  shape: HeldShape;
  pose: Transform;
}

function scan(p: Float64Array, stride: number, T: Transform, shape: HeldShape): number {
  const R = T.R, t = T.p;
  let best = Infinity;
  for (let i = 0; i < p.length; i += stride) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const d = heldDistance(shape, R[0] * x + R[1] * y + R[2] * z + t[0], R[3] * x + R[4] * y + R[5] * z + t[1], R[6] * x + R[7] * y + R[8] * z + t[2]);
    if (d < best) best = d;
  }
  return best;
}

/** Past this a rough look at the surface will do: only a link this near pays for every sample. */
const NEAR = 0.003;
/** A sparse link has no samples to spare: one in eight would miss its nearest point by more than NEAR. */
const ROUGH_ABOVE = 3000;

/** Closest approach of a link's surface to the object; negative when it is inside. */
export function linkGap(link: HandLink, frame: Transform, held: Held): number {
  const T = compose(invert(held.pose), frame);
  const rough = link.points.length > ROUGH_ABOVE ? scan(link.points, 24, T, held.shape) : 0;
  return rough > NEAR ? rough : scan(link.points, 3, T, held.shape);
}

/** The lowest the hand's surface reaches for a joint vector: the floor it stands on. */
export function lowestPoint(surface: HandSurface, q: number[]): number {
  const frames = surface.frames(q);
  let low = Infinity;
  surface.links.forEach(({ points: p }, l) => {
    const { R, p: t } = frames[l];
    for (let i = 0; i < p.length; i += 3) low = Math.min(low, R[6] * p[i] + R[7] * p[i + 1] + R[8] * p[i + 2] + t[2]);
  });
  return low;
}

export interface ClosingMotor {
  /** Index into the motor map. */
  motor: number;
  /** Radians per unit of closure, signed towards the palm. */
  rate: number;
  /** Where it gives up, however far from the surface. */
  stop: number;
}

export interface Closed {
  /** Motor vectors from the start to contact, every step checked clear of the object. */
  path: number[][];
  /** Links touching the object at the end. */
  touching: number[];
}

const moves = (map: MotorMap, motor: number, link: HandLink) => map.drives[motor].some((d) => link.joints.includes(d.k));

/** Stop this far off the surface: touching even zoomed in, and clear of a sampled mesh's error. */
export const CONTACT = 0.00005;

/**
 * Closes `motors` from `start` until every one has stopped: at contact, at its own stop, or because `blocked` said the
 * next pose touches something else, such as another finger. `links` are what is tested against the object.
 */
export function closeOn(
  surface: HandSurface, map: MotorMap, q: number[], start: number[], motors: ClosingMotor[], links: number[], held: Held,
  blocked: (u: number[]) => boolean = () => false, step = 0.03,
): Closed {
  const gaps = (u: number[]) => {
    const f = surface.frames(jointsFor(map, u, q));
    return links.map((l) => linkGap(surface.links[l], f[l], held));
  };
  const advance = (u: number[], live: ClosingMotor[], h: number) => {
    const v = [...u];
    for (const c of live) v[c.motor] = c.rate > 0 ? Math.min(u[c.motor] + c.rate * h, c.stop) : Math.max(u[c.motor] + c.rate * h, c.stop);
    return v;
  };
  const clear = (u: number[]) => Math.min(...gaps(u)) >= CONTACT && !blocked(u);
  const open = (u: number[]) => (c: ClosingMotor) => (c.rate > 0 ? u[c.motor] < c.stop : u[c.motor] > c.stop);
  let u = [...start];
  let live = motors.filter(open(u));
  const path = [u];
  for (let i = 0; i < 400 && live.length; i++) {
    const next = advance(u, live, step);
    if (clear(next)) {
      path.push((u = next));
      live = live.filter(open(u));
      continue;
    }
    let lo = 0, hi = 1;
    for (let b = 0; b < 12; b++) {
      const mid = (lo + hi) / 2;
      if (clear(advance(u, live, step * mid))) lo = mid;
      else hi = mid;
    }
    if (lo > 0) path.push((u = advance(u, live, step * lo)));
    const g = gaps(advance(u, live, step * (hi - lo)));
    const hit = links.filter((_, k) => g[k] < CONTACT);
    if (!hit.length) break;
    live = live.filter((c) => !hit.some((l) => moves(map, c.motor, surface.links[l]))).filter(open(u));
  }
  const g = gaps(u);
  return { path, touching: links.filter((_, k) => g[k] < CONTACT * 2) };
}

/** Where a motor vector sits on a path, as a fraction of its length: for playing a finger's close at its own pace. */
export const along = (path: number[][], w: number): number[] => {
  const x = Math.min(Math.max(w, 0), 1) * (path.length - 1), i = Math.min(Math.floor(x), path.length - 2);
  if (i < 0) return path[0];
  return path[i].map((v, k) => v + (path[i + 1][k] - v) * (x - i));
};
