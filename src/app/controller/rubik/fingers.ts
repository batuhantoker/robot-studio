/**
 * A hand working the cube: every beat's fingertip targets reached by least squares in motor space (coupled joints
 * move as their motor does), each finger's links kept out of the cube and off its neighbours. Solved per beat into
 * short tables the clip interpolates, and scored on how close the fingertips came, since not every hand can do this.
 */
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import { matVec, transpose } from '../../../core/math/linear/mat3';
import { type Transform, compose, invert } from '../../../core/math/linear/transform';
import type { Vec3 } from '../../../core/math/linear/vec';
import { jointsFor } from '../../../core/prosthesis/motors';
import { HALF, type Layout, PAD, SHADOW_LAYOUT, type ThumbSpots, TOP, cubeBoxes, fingerTarget, touching } from '../../../core/rubik/script';
import type { Beat } from '../../../core/rubik/timeline';
import type { HandRig, RigFinger } from './rig';

type Obstacle = { p: Vec3; clear: number };
type Box = ReturnType<typeof cubeBoxes>[number];

const W_TIP = 1, W_REG = 0.004, W_POSTURE = 0.003;
const W_CLEAR = 3;
/** Gap kept between neighbouring fingers' links beyond their radii; links may graze the cube by CUBE_TOUCH. */
const FINGER_GAP = 0.0025, CUBE_TOUCH = 0.0015;
const SAMPLES = 41;
const KINDS: Beat['kind'][] = ['cw', 'ccw', 'yawL', 'yawR', 'flipFar', 'flipNear', 'scramble'];

/** A left hand plays the right hand's script reflected across its midline, so its turns run the other way round. */
const SWAP: Partial<Record<Beat['kind'], Beat['kind']>> = { cw: 'ccw', ccw: 'cw', yawL: 'yawR', yawR: 'yawL' };

/** Signed distance from a point to a box (centre, rotation, half sizes). */
function boxDistance(p: Vec3, b: Box): number {
  const d = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]];
  const q = [0, 1, 2].map((i) => Math.abs(b.R[i] * d[0] + b.R[3 + i] * d[1] + b.R[6 + i] * d[2]) - b.half[i]);
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  return outside + Math.min(Math.max(q[0], q[1], q[2]), 0);
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

export interface HandMotion {
  /** Motor vector at `phase` of a beat. */
  at(kind: Beat['kind'], phase: number): number[];
  /** The resting grip round the cube, as motors. */
  cradle: number[];
  /** Hand frame to the model frame, for the palm as it is in `q`. */
  palm(q: number[]): Transform;
  /** Share of the moments a fingertip should be on the cube that it is, within 5 mm, over the beats solved so far. */
  reach(): number;
}

/** Solve the cradle now and each beat on first use (the rest warm up in the background). */
export function handMotion(rig: HandRig): HandMotion {
  const { map } = rig;
  const toHand = invert(rig.hand);
  const inHand = (palm: Transform, p: Vec3): Vec3 => {
    const local = matVec(transpose(palm.R), [p[0] - palm.p[0], p[1] - palm.p[1], p[2] - palm.p[2]]);
    const r = matVec(toHand.R, local);
    return [r[0] + toHand.p[0], r[1] + toHand.p[1], r[2] + toHand.p[2]];
  };

  /** Points along a finger in the hand frame with the clearance each needs; the first is the pad. */
  const points = (f: RigFinger, q: number[]): Obstacle[] => {
    const fr = chainFrames(f.limb.chain, limbQ(f.limb, q));
    const palm = rig.palmFrame(q);
    const pts: Obstacle[] = [{ p: inHand(palm, f.pad(fr)), clear: f.padRadius - 0.0015 * rig.scale }];
    pts.push({ p: inHand(palm, f.end(fr)), clear: f.padRadius - 0.002 * rig.scale });
    const joints = fr.origins.slice(f.knuckle).map((o) => inHand(palm, o));
    for (let i = 0; i + 1 < joints.length; i++) {
      for (const s of [0, 0.35, 0.7]) {
        const a = joints[i], b = joints[i + 1];
        pts.push({ p: [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s], clear: f.linkRadius });
      }
    }
    if (joints.length) pts.push({ p: joints[joints.length - 1], clear: f.linkRadius });
    return pts;
  };

  /** What a finger shows the others: its links, and the ends of its knuckle (the thumb's base ball). */
  const body = (f: RigFinger, q: number[]): Obstacle[] => {
    const fr = chainFrames(f.limb.chain, limbQ(f.limb, q));
    const palm = rig.palmFrame(q);
    const base = fr.frames[Math.max(f.knuckle - 1, 0)];
    const extra = f.role === 'thumb'
      ? [{ p: inHand(palm, fr.origins[Math.max(f.knuckle - 1, 0)]), clear: 1.35 * f.linkRadius }]
      : [-0.8, 0.8].map((x) => ({ p: inHand(palm, matVec(base.R, [x * f.linkRadius, 0, 0]).map((v, k) => v + base.p[k]) as Vec3), clear: 0.95 * f.linkRadius }));
    return [...points(f, q).slice(1), ...extra];
  };

  let layout: Layout = { columns: rig.columns, thumb: SHADOW_LAYOUT.thumb };
  let probing: Vec3 | null = null;
  const target = (kind: Beat['kind'], f: RigFinger, phase: number): Vec3 => {
    if (probing) return probing;
    const p = fingerTarget(rig.mirror ? SWAP[kind] ?? kind : kind, f.role, phase, layout);
    const x = (rig.mirror ? -p[0] : p[0]) * rig.scale, y = p[1] * rig.scale, n = Math.hypot(x, y) || 1;
    return [x + (x / n) * ease, y + (y / n) * ease, p[2] * rig.scale];
  };
  const boxes = (kind: Beat['kind'], phase: number): Box[] =>
    cubeBoxes(kind, phase).map((b) => ({ c: b.c.map((v) => v * rig.scale) as Vec3, R: b.R, half: b.half.map((v) => v * rig.scale) as Vec3 }));

  let hits = 0, tries = 0;

  /** Damped Gauss–Newton over one group's motors: its pads onto their targets, every link clear. */
  const reachGroup = (g: HandRig['groups'][number], u: number[], kind: Beat['kind'], phase: number, cube: Box[], iterations: number) => {
    const idx = g.motors;
    const fingers = g.fingers.map((i) => rig.fingers[i]);
    const goals = fingers.map((f) => target(kind, f, phase));
    const ranges = idx.map((i) => [map.motors[i].range[0], Math.min(map.motors[i].range[1], rig.ceiling.get(i) ?? Infinity)]);
    const ref = idx.map((i) => u[i]);
    const q0 = jointsFor(map, u, rig.q0);
    const others = rig.fingers.filter((f) => !fingers.includes(f)).flatMap((f) => body(f, q0));
    const residual = (x: number[]) => {
      const v = [...u];
      idx.forEach((i, k) => (v[i] = x[k]));
      const q = jointsFor(map, v, rig.q0);
      const res: number[] = [];
      fingers.forEach((f, n) => {
        const pts = points(f, q);
        pts[0].p.forEach((c, k) => res.push(W_TIP * (c - goals[n][k])));
        pts.forEach((pt, i) => {
          const d = Math.min(...cube.map((b) => boxDistance(pt.p, b)));
          res.push(W_CLEAR * Math.max(0, pt.clear - (i < 2 ? 0 : CUBE_TOUCH) - d));
          let worst = 0;
          for (const o of others) {
            const need = pt.clear + o.clear + FINGER_GAP - Math.hypot(pt.p[0] - o.p[0], pt.p[1] - o.p[1], pt.p[2] - o.p[2]);
            if (need > worst) worst = need;
          }
          res.push(W_CLEAR * worst);
        });
      });
      x.forEach((xi, k) => res.push(W_REG * (xi - ref[k])));
      idx.forEach((i, k) => {
        const want = rig.posture.get(i);
        if (want !== undefined) res.push(W_POSTURE * (x[k] - want));
      });
      return res;
    };
    let x = ref.map((v, k) => Math.min(Math.max(v, ranges[k][0]), ranges[k][1]));
    let res = residual(x);
    let cost = res.reduce((s, v) => s + v * v, 0);
    let lambda = 1e-4;
    for (let it = 0; it < iterations; it++) {
      const J = x.map((_, k) => {
        const xs = [...x];
        xs[k] += 1e-4;
        return residual(xs).map((v, i) => (v - res[i]) / 1e-4);
      });
      const A = J.map((a) => J.map((b) => a.reduce((s, v, i) => s + v * b[i], 0)));
      const grad = J.map((a) => a.reduce((s, v, i) => s + v * res[i], 0));
      let improved = false;
      for (let t = 0; t < 4 && !improved; t++) {
        const M = A.map((row, i) => row.map((v, j) => v + (i === j ? lambda * (1 + A[i][i]) : 0)));
        const step = solveSmall(M, grad.map((v) => -v));
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
      if (!improved) break;
    }
    idx.forEach((i, k) => (u[i] = x[k]));
    const q = jointsFor(map, u, rig.q0);
    fingers.forEach((f, n) => {
      if (!touching(rig.mirror ? SWAP[kind] ?? kind : kind, f.role, phase, layout)) return;
      const pad = points(f, q)[0].p;
      const miss = Math.hypot(pad[0] - goals[n][0], pad[1] - goals[n][1], pad[2] - goals[n][2]);
      tries++;
      if (miss < 0.005 * rig.scale) hits++;
    });
  };

  /** Targets eased off the cube, for a pose whose links still touch each other. */
  let ease = 0;
  const solveAt = (kind: Beat['kind'], phase: number, from: number[], iterations: number) => {
    const cube = boxes(kind, phase);
    let u = [...from];
    for (const off of [0, 0.003, 0.006, 0.01]) {
      ease = off * rig.scale;
      u = [...from];
      // Two sweeps, so every finger has seen where all the others ended up.
      for (let sweep = 0; sweep < 2; sweep++) for (const g of rig.groups) reachGroup(g, u, kind, phase, cube, iterations);
      if (!rig.touches(jointsFor(map, u, rig.q0))) {
        ease = 0;
        return u;
      }
    }
    // Nothing clean nearby: hold the last pose that was, rather than play into a contact.
    ease = 0;
    return rig.touches(jointsFor(map, from, rig.q0)) ? u : [...from];
  };

  /**
   * Where on its own face this hand's thumb can actually press: a grid of spots tried from the open hand, the nearest
   * reach kept for each job (twists on the top layer, clockwise towards the wrist, counter-clockwise towards the fingers).
   */
  const probeThumb = (): ThumbSpots => {
    const thumb = rig.fingers.findIndex((f) => f.role === 'thumb');
    const group = rig.groups.find((g) => g.fingers.includes(thumb));
    if (!group) return SHADOW_LAYOUT.thumb;
    const S = HALF + PAD.thumb;
    const tried: { y: number; z: number; miss: number }[] = [];
    for (const y of [-0.018, -0.012, -0.006, 0, 0.006, 0.012, 0.018]) for (const z of [0, 0.006, 0.012, 0.018, 0.024]) {
      const u = [...rig.open];
      probing = [(rig.mirror ? -S : S) * rig.scale, y * rig.scale, z * rig.scale];
      reachGroup({ ...group, fingers: [thumb] }, u, 'hold', 0, boxes('hold', 0), 30);
      const q = jointsFor(map, u, rig.q0);
      const pad = points(rig.fingers[thumb], q)[0].p;
      const miss = Math.hypot(pad[0] - probing[0], pad[1] - probing[1], pad[2] - probing[2]) / rig.scale;
      tried.push({ y, z, miss: rig.touches(q) ? miss + 1 : miss });
      probing = null;
    }
    const best = (ok: (t: (typeof tried)[number]) => boolean): [number, number] => {
      const pick = tried.filter(ok).reduce((a, b) => (b.miss < a.miss ? b : a), { y: 0, z: TOP, miss: Infinity });
      return [pick.y, pick.z];
    };
    const top = (t: { z: number }) => t.z >= 0.012;
    return {
      rest: best(() => true),
      cw: best((t) => top(t) && t.y <= 0),
      ccw: best((t) => top(t) && t.y >= 0),
      yawR: best((t) => t.y <= 0),
      yawL: best((t) => t.y >= 0),
      flip: best((t) => Math.abs(t.y) <= 0.012),
    };
  };
  if (!rig.tuned) layout = { columns: rig.columns, thumb: probeThumb() };

  let cradle = rig.open;
  for (let i = 0; i < 4; i++) cradle = solveAt('hold', 0, cradle, 40);
  [hits, tries] = [0, 0];
  const brushes = (a: number[], b: number[]) => [1, 2, 3, 4, 5, 6, 7, 8].some((n) => rig.touches(jointsFor(map, a.map((v, k) => v + ((b[k] - v) * n) / 8), rig.q0)));
  const tables = new Map<Beat['kind'], number[][]>();
  const table = (kind: Beat['kind']) => {
    let t = tables.get(kind);
    if (t) return t;
    t = [cradle];
    for (let i = 1; i < SAMPLES - 1; i++) {
      const u = solveAt(kind, i / (SAMPLES - 1), t[i - 1], 12);
      // Playback runs between the samples too; a step that brushes two links together holds still instead.
      t.push(brushes(t[i - 1], u) ? t[i - 1] : u);
    }
    t.push(cradle);
    // The first and last steps leave and reach the cradle on their own branch; where that brushes, glide straight
    // between the cradle and the nearest pose with a clean way to it.
    const straight = (a: number[], b: number[]) => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].every((w) => !rig.touches(jointsFor(map, a.map((v, j) => v + (b[j] - v) * w), rig.q0)));
    const glide = (from: number, to: number) => {
      for (let i = Math.min(from, to) + 1; i < Math.max(from, to); i++) {
        const w = (i - from) / (to - from);
        t![i] = t![from].map((v, j) => v + (t![to][j] - v) * w);
      }
    };
    const end = SAMPLES - 1;
    if (brushes(t[end - 1], cradle)) for (let k = end - 2; k > 0; k--) if (straight(t[k], cradle)) { glide(k, end); break; }
    if (brushes(cradle, t[1])) for (let k = 2; k < end; k++) if (straight(cradle, t[k])) { glide(0, k); break; }
    tables.set(kind, t);
    return t;
  };
  const warm = () => {
    const next = KINDS.find((k) => !tables.has(k));
    if (next) {
      table(next);
      setTimeout(warm, 30);
    }
  };
  setTimeout(warm, 300);
  return {
    cradle,
    at(kind, phase) {
      if (kind === 'hold') return cradle;
      const t = table(kind);
      const x = Math.min(Math.max(phase, 0), 1) * (SAMPLES - 1);
      const i = Math.min(Math.floor(x), SAMPLES - 2), w = x - i;
      return t[i].map((v, k) => v + (t[i + 1][k] - v) * w);
    },
    palm: (q) => compose(rig.palmFrame(q), rig.hand),
    reach: () => (tries ? hits / tries : 1),
  };
}
