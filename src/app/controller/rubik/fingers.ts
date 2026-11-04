/**
 * The Shadow hand working the cube: every beat's fingertip targets reached by least squares in motor space (the
 * coupled J1/J2 move as their tendon motor), with each finger's phalanges kept out of the cube. Solved once per
 * session into short tables that the clip interpolates.
 */
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { type Limb, limbQ } from '../../../core/chain/limbs/types';
import { type Mat3, matMul, matVec, transpose } from '../../../core/math/linear/mat3';
import type { Transform } from '../../../core/math/linear/transform';
import type { Vec3 } from '../../../core/math/linear/vec';
import { type MotorMap, jointsFor } from '../../../core/prosthesis/motors';
import { FINGERS, type Finger, PAD, cubeBoxes, fingerTarget } from '../../../core/rubik/script';
import type { Beat } from '../../../core/rubik/timeline';
import type { RobotSession } from '../../robots/session';

const MOTORS: Record<Finger, string[]> = {
  thumb: ['rh_THJ5', 'rh_THJ4', 'rh_THJ3', 'rh_THJ2', 'rh_THJ1'],
  index: ['rh_FFJ4', 'rh_FFJ3', 'rh_FFJ0'],
  middle: ['rh_MFJ4', 'rh_MFJ3', 'rh_MFJ0'],
  ring: ['rh_RFJ4', 'rh_RFJ3', 'rh_RFJ0'],
  little: ['rh_LFJ5', 'rh_LFJ4', 'rh_LFJ3', 'rh_LFJ0'],
};
/** Chain joints from the knuckle out (the thumb's from its base): the phalanges kept out of the cube. */
const KNUCKLE: Record<Finger, number> = { thumb: 3, index: 3, middle: 3, ring: 3, little: 4 };
const TIP: Record<Finger, { centre: Vec3; end: Vec3 }> = {
  thumb: { centre: [0, 0, 0.022], end: [0, 0, 0.031] },
  index: { centre: [0, 0, 0.021], end: [0, 0, 0.028] },
  middle: { centre: [0, 0, 0.021], end: [0, 0, 0.028] },
  ring: { centre: [0, 0, 0.021], end: [0, 0, 0.028] },
  little: { centre: [0, 0, 0.021], end: [0, 0, 0.028] },
};
const LINK_RADIUS = { thumb: 0.0105, finger: 0.0095 };
/** Motor ceilings for the choreography: J3 past ~80° and a cupped little finger press their links into the palm. */
const CEILING: Record<string, number> = { rh_FFJ3: 1.38, rh_MFJ3: 1.38, rh_RFJ3: 1.38, rh_LFJ3: 1.38, rh_LFJ5: 0.3 };

/**
 * The cube at rest in the palm frame: its near edge on the thenar pad and its far edge on the flat of the palm by
 * the finger bases, so it sits tipped 6° towards the fingers (measured against the palm mesh).
 */
export const CUBE_REST: Vec3 = [-0.005, -0.0434, 0.062];
const TILT = (6 * Math.PI) / 180;
/** Hand frame axes in the palm frame, as columns: e1 thumb side, e2 towards the fingertips, e3 out of the palm. */
const HAND: Mat3 = [1, 0, 0, 0, Math.sin(TILT), -Math.cos(TILT), 0, Math.cos(TILT), Math.sin(TILT)];

const palmToHand = (p: Vec3): Vec3 => matVec(transpose(HAND), [p[0] - CUBE_REST[0], p[1] - CUBE_REST[1], p[2] - CUBE_REST[2]]);

/** Whether this robot is a Shadow hand the solve is choreographed for. */
export function shadowHand(s: RobotSession): boolean {
  const names = new Set(s.prosthesis?.motors.map((m) => m.name) ?? []);
  return FINGERS.every((f) => MOTORS[f].every((n) => names.has(n)) && s.limbs.some((l) => l.name === f));
}

interface Rig {
  map: MotorMap;
  q0: number[];
  limb: Record<Finger, Limb>;
  motor: Record<Finger, number[]>;
}

const toPalm = (palm: Transform, p: Vec3): Vec3 => {
  const d: Vec3 = [p[0] - palm.p[0], p[1] - palm.p[1], p[2] - palm.p[2]];
  return palmToHand(matVec(transpose(palm.R), d));
};

const local = (T: Transform, v: Vec3): Vec3 => {
  const r = matVec(T.R, v);
  return [T.p[0] + r[0], T.p[1] + r[1], T.p[2] + r[2]];
};

/** Signed distance from a point to a box (centre, rotation, half sizes). */
function boxDistance(p: Vec3, b: { c: Vec3; R: number[]; half: Vec3 }): number {
  const d = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]];
  const q = [0, 1, 2].map((i) => Math.abs(b.R[i] * d[0] + b.R[3 + i] * d[1] + b.R[6 + i] * d[2]) - b.half[i]);
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  return outside + Math.min(Math.max(q[0], q[1], q[2]), 0);
}

/** Points along a finger in the hand frame, with the clearance each needs; the first is the fingertip's pad centre. */
function fingerPoints(r: Rig, f: Finger, q: number[]): { p: Vec3; clear: number }[] {
  const limb = r.limb[f];
  const fr = chainFrames(limb.chain, limbQ(limb, q));
  const palm = fr.frames[1];
  const last = fr.frames[fr.frames.length - 1];
  const radius = f === 'thumb' ? LINK_RADIUS.thumb : LINK_RADIUS.finger;
  const pad = f === 'thumb' ? PAD.thumb : PAD.finger;
  const pts: { p: Vec3; clear: number }[] = [{ p: toPalm(palm, local(last, TIP[f].centre)), clear: pad - 0.0015 }];
  pts.push({ p: toPalm(palm, local(last, TIP[f].end)), clear: pad - 0.002 });
  const joints = fr.origins.slice(KNUCKLE[f]).map((o) => toPalm(palm, o));
  for (let i = 0; i + 1 < joints.length; i++) {
    for (const s of [0, 0.35, 0.7]) {
      const a = joints[i], b = joints[i + 1];
      pts.push({ p: [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s], clear: radius });
    }
  }
  pts.push({ p: joints[joints.length - 1], clear: radius });
  return pts;
}

/** What a finger shows its neighbours: its links past the pad, and the ends of its knuckle (the thumb's base ball). */
function fingerBody(r: Rig, f: Finger, q: number[]): Obstacle[] {
  const limb = r.limb[f];
  const fr = chainFrames(limb.chain, limbQ(limb, q));
  const palm = fr.frames[1];
  if (f === 'thumb') return [...fingerPoints(r, f, q).slice(1), { p: toPalm(palm, fr.origins[2]), clear: 0.013 }];
  const knuckle = fr.frames[KNUCKLE[f] - 1];
  const ends = [-0.0075, 0.0075].map((x) => ({ p: toPalm(palm, local(knuckle, [x, 0, 0])), clear: 0.009 }));
  return [...fingerPoints(r, f, q).slice(1), ...ends];
}

const W_TIP = 1, W_REG = 0.004, W_CLEAR = 3, W_POSTURE = 0.012;
/** A thumb kept long, turning at its base rather than hooking its last joints over the cube. */
const POSTURE: Record<string, number> = { rh_THJ3: 0, rh_THJ2: 0, rh_THJ1: 0.25 };
/** Gap kept between neighbouring fingers' links, beyond their radii. */
const FINGER_GAP = 0.002;

type Obstacle = { p: Vec3; clear: number };

/** Damped Gauss–Newton on one finger's motors: pad centre onto `target`, every link clear of the cube and the other fingers. */
function reach(r: Rig, f: Finger, u: number[], target: Vec3, boxes: ReturnType<typeof cubeBoxes>, others: Obstacle[], iterations: number): number[] {
  const idx = r.motor[f];
  const ranges = idx.map((i) => {
    const m = r.map.motors[i];
    return [m.range[0], Math.min(m.range[1], CEILING[m.name] ?? Infinity)];
  });
  const ref = idx.map((i) => u[i]);
  const residual = (x: number[]) => {
    const v = [...u];
    idx.forEach((i, k) => (v[i] = x[k]));
    const pts = fingerPoints(r, f, jointsFor(r.map, v, r.q0));
    const res = pts[0].p.map((c, k) => W_TIP * (c - target[k]));
    x.forEach((xi, k) => res.push(W_REG * (xi - ref[k])));
    idx.forEach((i, k) => {
      const want = POSTURE[r.map.motors[i].name];
      if (want !== undefined) res.push(W_POSTURE * (x[k] - want));
    });
    for (const pt of pts) {
      const d = Math.min(...boxes.map((b) => boxDistance(pt.p, b)));
      res.push(W_CLEAR * Math.max(0, pt.clear - d));
      let worst = 0;
      for (const o of others) {
        const need = pt.clear + o.clear + FINGER_GAP - Math.hypot(pt.p[0] - o.p[0], pt.p[1] - o.p[1], pt.p[2] - o.p[2]);
        if (need > worst) worst = need;
      }
      res.push(W_CLEAR * worst);
    }
    return res;
  };
  let x = [...ref];
  let res = residual(x);
  let cost = res.reduce((s, v) => s + v * v, 0);
  let lambda = 1e-4;
  for (let it = 0; it < iterations; it++) {
    const J = x.map((_, k) => {
      const h = 1e-4;
      const xs = [...x];
      xs[k] += h;
      return residual(xs).map((v, i) => (v - res[i]) / h);
    });
    const n = x.length;
    const A = J.map((a) => J.map((b) => a.reduce((s, v, i) => s + v * b[i], 0)));
    const g = J.map((a) => a.reduce((s, v, i) => s + v * res[i], 0));
    let improved = false;
    for (let tries = 0; tries < 4 && !improved; tries++) {
      const M = A.map((row, i) => row.map((v, j) => v + (i === j ? lambda * (1 + A[i][i]) : 0)));
      const step = solveSmall(M, g.map((v) => -v));
      if (!step) break;
      const next = x.map((v, k) => Math.min(Math.max(v + step[k], ranges[k][0]), ranges[k][1]));
      const nres = residual(next);
      const ncost = nres.reduce((s, v) => s + v * v, 0);
      if (ncost < cost) {
        const moved = Math.max(...next.map((v, k) => Math.abs(v - x[k])));
        [x, res, cost] = [next, nres, ncost];
        lambda = Math.max(1e-7, lambda / 3);
        improved = true;
        if (moved < 1e-5) it = iterations;
      } else lambda *= 10;
    }
    if (!improved || n === 0) break;
  }
  return x;
}

function solveSmall(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-14) return null;
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

const SAMPLES = 41;

export interface HandMotion {
  /** Motor vector at `phase` of a beat. */
  at(kind: Beat['kind'], phase: number): number[];
  /** The resting grip round the cube, as motors. */
  cradle: number[];
  /** Hand frame to the model frame, for the palm as it is in `q`. */
  palm(q: number[]): Transform;
}

/** Solve every beat for this hand; a few hundred milliseconds, once per session. */
export function handMotion(s: RobotSession): HandMotion {
  const map = s.prosthesis!;
  const names = map.motors.map((m) => m.name);
  const rig: Rig = {
    map,
    q0: s.home,
    limb: Object.fromEntries(FINGERS.map((f) => [f, s.limbs.find((l) => l.name === f)!])) as Record<Finger, Limb>,
    motor: Object.fromEntries(FINGERS.map((f) => [f, MOTORS[f].map((n) => names.indexOf(n))])) as Record<Finger, number[]>,
  };
  const home = map.motors.map((m) => m.home);
  const wrists = ['rh_WRJ2', 'rh_WRJ1'].map((n) => names.indexOf(n));
  wrists.forEach((i) => (home[i] = 0));
  const solveAt = (kind: Beat['kind'], phase: number, from: number[], iterations: number) => {
    const u = [...from];
    const boxes = cubeBoxes(kind, phase);
    // Two sweeps, so every finger has seen where all the others ended up.
    for (let sweep = 0; sweep < 2; sweep++) {
      for (const f of FINGERS) {
        const q = jointsFor(map, u, rig.q0);
        const others = FINGERS.filter((g) => g !== f).flatMap((g) => fingerBody(rig, g, q));
        const x = reach(rig, f, u, fingerTarget(kind, f, phase), boxes, others, iterations);
        rig.motor[f].forEach((i, k) => (u[i] = x[k]));
      }
    }
    return u;
  };
  let cradle = home;
  for (let i = 0; i < 4; i++) cradle = solveAt('hold', 0, cradle, 40);
  const tables = new Map<Beat['kind'], number[][]>();
  const table = (kind: Beat['kind']) => {
    let t = tables.get(kind);
    if (t) return t;
    t = [cradle];
    for (let i = 1; i < SAMPLES - 1; i++) t.push(solveAt(kind, i / (SAMPLES - 1), t[i - 1], 12));
    t.push(cradle);
    tables.set(kind, t);
    return t;
  };
  const anyLimb = rig.limb.index;
  return {
    cradle,
    at(kind, phase) {
      if (kind === 'hold') return cradle;
      const t = table(kind);
      const x = Math.min(Math.max(phase, 0), 1) * (SAMPLES - 1);
      const i = Math.min(Math.floor(x), SAMPLES - 2), w = x - i;
      return t[i].map((v, k) => v + (t[i + 1][k] - v) * w);
    },
    palm(q) {
      const palm = chainFrames(anyLimb.chain, limbQ(anyLimb, q)).frames[1];
      return { p: local(palm, CUBE_REST), R: matMul(palm.R, HAND) };
    },
  };
}
