/**
 * Any hand as the cube choreography needs it, read from its own model: which motors move which finger, where the
 * palm faces, which side the thumb is on, how big a cube suits it and where that cube rests. The Shadow hands keep
 * values measured against their meshes; every other hand is derived, so it can at least try.
 */
import * as THREE from 'three';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { type Limb, limbQ } from '../../../core/chain/limbs/types';
import type { ChainFrames } from '../../../core/chain/model/types';
import { type Mat3, matVec, transpose } from '../../../core/math/linear/mat3';
import { type Transform, compose, identityTransform, invert } from '../../../core/math/linear/transform';
import type { Vec3 } from '../../../core/math/linear/vec';
import { type MotorMap, gripMotors, jointsFor } from '../../../core/prosthesis/motors';
import { type Columns, type Finger, SHADOW_LAYOUT } from '../../../core/rubik/script';
import { GEOM, OBJ, arrays } from '../../../physics/runtime/arrays';
import { type RobotSession, pose } from '../../robots/session';

export interface RigFinger {
  role: Finger;
  limb: Limb;
  /** Chain index of the first joint this finger owns: its knuckle, or the thumb's base. */
  knuckle: number;
  /** The fingertip point that touches the cube, and the fingertip's far end. */
  pad(fr: ChainFrames): Vec3;
  end(fr: ChainFrames): Vec3;
  padRadius: number;
  linkRadius: number;
}

export interface HandRig {
  map: MotorMap;
  q0: number[];
  fingers: RigFinger[];
  /** Fingers moved by the same motors are solved together (a synergy closes them all at once). */
  groups: { fingers: number[]; motors: number[] }[];
  /** Motor values between beats before the cradle is solved: the open grip, the wrist held where it is. */
  open: number[];
  /** The palm in the model frame for joint vector `q`; the model frame itself for a hand with no wrist. */
  palmFrame(q: number[]): Transform;
  /** The hand frame in the palm frame: e1 thumb side, e2 towards the fingertips, e3 out of the palm, origin at the cube. */
  hand: Transform;
  /** The palm's own axes in the palm frame (the hand frame before any rest tilt), for laying the hand palm up. */
  axes: Mat3;
  /** Cube edge over the 57 mm the choreography is written for. */
  scale: number;
  /** Each finger's knuckle sideways in the hand frame, at that 57 mm scale and as a right hand: where it can press. */
  columns: Columns;
  /** Thumb on the −e1 side: a left hand, which plays every beat mirrored. */
  mirror: boolean;
  /** The Shadow hands keep their measured thumb spots; any other hand's are found by probing its thumb. */
  tuned: boolean;
  /** Whether a joint vector touches itself, by the model's own collision geometry. */
  touches(q: number[]): boolean;
  ceiling: Map<number, number>;
  posture: Map<number, number>;
}

const ROLE: Record<string, Finger> = { thumb: 'thumb', index: 'index', middle: 'middle', ring: 'ring', little: 'little', pinky: 'little' };

const local = (T: Transform, v: Vec3): Vec3 => {
  const r = matVec(T.R, v);
  return [T.p[0] + r[0], T.p[1] + r[1], T.p[2] + r[2]];
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
const mean = (vs: Vec3[]): Vec3 => [0, 1, 2].map((k) => vs.reduce((s, v) => s + v[k], 0) / Math.max(vs.length, 1)) as Vec3;
const basis = (a: Vec3, b: Vec3, c: Vec3): Mat3 => [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];

/** The Shadow hands (rh_ or lh_), measured against their meshes: see shadowProfile. */
const shadowSide = (map: MotorMap): 'rh' | 'lh' | null => {
  const names = new Set(map.motors.map((m) => m.name));
  for (const side of ['rh', 'lh'] as const) if (['THJ5', 'FFJ0', 'MFJ0', 'RFJ0', 'LFJ5', 'WRJ1'].every((n) => names.has(`${side}_${n}`))) return side;
  return null;
};

/**
 * Hands that can place a fingertip anywhere near the cube: a thumb and two or more fingers, each moved by three or more
 * motors of its own. A hand closed by one synergy, or fingers that only curl, can't turn a layer.
 */
export function handRig(s: RobotSession): HandRig | null {
  const map = s.prosthesis;
  if (!map) return null;
  const limbs = s.limbs.filter((l) => ROLE[l.name]);
  if (!limbs.some((l) => ROLE[l.name] === 'thumb') || limbs.length < 3) return null;
  const count = new Map<number, number>();
  for (const l of s.limbs) for (const k of l.index) count.set(k, (count.get(k) ?? 0) + 1);
  const shared = (k: number) => (count.get(k) ?? 0) > 1;
  const owner = new Map<number, number>();
  limbs.forEach((l, f) => l.index.forEach((k) => !shared(k) && owner.set(k, f)));
  // A motor belongs to the fingers whose own joints it drives; one driving only shared joints is the wrist.
  const fingersOf = map.drives.map((ds) => [...new Set(ds.map((d) => owner.get(d.k)).filter((f): f is number => f !== undefined))]);
  const parent = limbs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const fs of fingersOf) for (const f of fs.slice(1)) parent[find(f)] = find(fs[0]);
  const groups = [...new Set(limbs.map((_, i) => find(i)))].map((root) => ({
    fingers: limbs.map((_, i) => i).filter((i) => find(i) === root),
    motors: fingersOf.map((fs, m) => (fs.length && find(fs[0]) === root ? m : -1)).filter((m) => m >= 0),
  })).filter((g) => g.motors.length);
  if (groups.length !== limbs.length || groups.some((g) => g.motors.length < 3)) return null;

  const shadow = shadowSide(map);
  const open = map.grips.find((g) => g.name === 'open');
  const home = map.motors.map((m) => m.home);
  const openMotors = open ? gripMotors(map, open, home) : home;
  fingersOf.forEach((fs, m) => !fs.length && (openMotors[m] = Math.min(Math.max(0, map.motors[m].range[0]), map.motors[m].range[1])));
  const power = map.grips.find((g) => g.name === 'power');
  const closed = power ? gripMotors(map, power, openMotors) : map.motors.map((m) => m.range[1]);
  const qOpen = jointsFor(map, openMotors, s.home), qClosed = jointsFor(map, closed, s.home);
  // MuJoCo posed open: its geoms say where each fingertip really is.
  pose(s, qOpen, 0, s.defaultFocus);

  // The palm is the frame after the last joint every finger shares (the wrist); with no wrist, the model frame.
  const ref = limbs[0];
  const lastShared = ref.index.reduce((last, k, i) => (shared(k) ? i : last), -1);
  const palmFrame = (q: number[]): Transform => (lastShared < 0 ? identityTransform() : chainFrames(ref.chain, limbQ(ref, q)).frames[lastShared]);
  const toPalm = (q: number[], p: Vec3): Vec3 => local(invert(palmFrame(q)), p);
  const firstOwn = (l: Limb) => Math.max(0, l.index.findIndex((k) => !shared(k)));
  const frames = (l: Limb, q: number[]) => chainFrames(l.chain, limbQ(l, q));
  const knuckleOf = (l: Limb, q: number[]) => toPalm(q, frames(l, q).origins[firstOwn(l)]);
  const tipOf = (l: Limb, q: number[]) => toPalm(q, frames(l, q).tip.p);

  const thumb = limbs.find((l) => ROLE[l.name] === 'thumb')!;
  const digits = limbs.filter((l) => l !== thumb);
  const knuckles = digits.map((l) => knuckleOf(l, qOpen));
  const e2 = unit(mean(digits.map((l, i) => sub(tipOf(l, qOpen), knuckles[i]))));
  const curl = mean(digits.map((l) => sub(tipOf(l, qClosed), tipOf(l, qOpen))));
  let e3 = unit(sub(curl, e2.map((v) => v * dot(curl, e2)) as Vec3));
  const e1 = unit(cross(e2, e3));
  e3 = cross(e1, e2);
  const row = mean(knuckles);
  const mirror = dot(sub(knuckleOf(thumb, qOpen), row), e1) < 0;
  const axes = shadow ? basis([1, 0, 0], [0, 0, 1], [0, -1, 0]) : basis(e1, e2, e3);
  const length = digits.reduce((sum, l, i) => sum + Math.hypot(...sub(tipOf(l, qOpen), knuckles[i])), 0) / digits.length;
  const scale = shadow ? 1 : Math.min(Math.max(length / 0.096, 0.75), 1.7);

  const names = map.motors.map((m) => m.name);
  const byName = (table: Record<string, number>) =>
    new Map(Object.entries(table).map(([n, v]) => [names.indexOf(`${shadow}_${n}`), v] as const).filter(([i]) => i >= 0));
  const fingers: RigFinger[] = limbs.map((l) => {
    const role = ROLE[l.name];
    if (shadow) {
      const tip = role === 'thumb' ? { c: 0.022, e: 0.031 } : { c: 0.021, e: 0.028 };
      const last = (fr: ChainFrames) => fr.frames[fr.frames.length - 1];
      return {
        role, limb: l, knuckle: role === 'little' ? 4 : 3,
        pad: (fr) => local(last(fr), [0, 0, tip.c]),
        end: (fr) => local(last(fr), [0, 0, tip.e]),
        padRadius: role === 'thumb' ? 0.0095 : 0.0078,
        linkRadius: role === 'thumb' ? 0.0102 : 0.0092,
      };
    }
    const tip = fingertip(s, l, qOpen);
    const last = (fr: ChainFrames) => fr.frames[fr.frames.length - 1];
    return {
      role, limb: l, knuckle: firstOwn(l),
      pad: tip ? (fr) => local(last(fr), tip.centre) : (fr) => fr.tip.p,
      end: tip ? (fr) => local(last(fr), tip.end) : (fr) => fr.tip.p,
      padRadius: tip?.radius ?? (role === 'thumb' ? 0.0085 : 0.0072) * scale,
      linkRadius: Math.max(tip?.radius ?? 0, 0.0092 * scale),
    };
  });

  const hand = shadow ? shadowRest(shadow) : restOn(s, qOpen, palmFrame(qOpen), axes, row, scale, mirror);
  const inHand = invert(hand);
  const columns: Columns = shadow ? SHADOW_LAYOUT.columns : Object.fromEntries(digits.map((l, i) => {
    const x = local(inHand, knuckles[i])[0] / scale;
    return [ROLE[l.name], mirror ? -x : x];
  }));
  return {
    map, q0: s.home, fingers, groups, open: openMotors, palmFrame, hand, axes, scale, columns, mirror, tuned: !!shadow,
    touches: (q) => !!s.collision?.hit(q),
    // J3 past ~80° and a cupped little finger press the Shadow's links into its palm.
    ceiling: shadow ? byName({ FFJ3: 1.38, MFJ3: 1.38, RFJ3: 1.38, LFJ3: 1.38, LFJ5: 0.3 }) : new Map(),
    // A thumb kept long, turning at its base rather than hooking its last joints over the cube.
    posture: shadow ? byName({ THJ3: 0, THJ2: 0, THJ1: 0.25 }) : new Map(),
  };
}

/**
 * A finger's tip as its collision geometry has it: the outermost collision geom on its last link (or a link fixed to
 * it), as a centre and radius in the last joint's frame, and the point beyond it along the finger.
 */
function fingertip(s: RobotSession, l: Limb, q: number[]): { centre: Vec3; end: Vec3; radius: number } | null {
  const h = s.handle, m = arrays(h.model);
  const d = h.data as unknown as { geom_xpos: Float64Array };
  const joint = h.id(OBJ.joint, l.chain.joints[l.chain.joints.length - 1]?.name ?? '');
  if (joint < 0) return null;
  const body = m.jnt_bodyid[joint];
  // The last link and any links welded to it (no joints of their own), such as a separate fingertip body.
  const welded = (b: number): boolean => b === body || (m.body_jntnum[b] === 0 && b > 0 && welded(m.body_parentid[b]));
  const frame = chainFrames(l.chain, limbQ(l, q)).frames[l.chain.joints.length - 1];
  const back = invert(frame);
  const g = (h.model as unknown as { geom_contype: ArrayLike<number>; geom_conaffinity: ArrayLike<number>; geom_rbound: ArrayLike<number> });
  let best: { centre: Vec3; radius: number; reach: number } | null = null;
  for (let i = 0; i < m.ngeom; i++) {
    if (!welded(m.geom_bodyid[i]) || !(g.geom_contype[i] || g.geom_conaffinity[i])) continue;
    const c = local(back, [d.geom_xpos[3 * i], d.geom_xpos[3 * i + 1], d.geom_xpos[3 * i + 2]]);
    const size = [m.geom_size[3 * i], m.geom_size[3 * i + 1], m.geom_size[3 * i + 2]];
    const t = m.geom_type[i];
    const radius = t === GEOM.sphere || t === GEOM.capsule || t === GEOM.cylinder ? size[0]
      : t === GEOM.box || t === GEOM.ellipsoid ? Math.min(size[0], size[1]) : 0.6 * g.geom_rbound[i];
    const reach = Math.hypot(...c);
    if (!best || reach > best.reach) best = { centre: c, radius, reach };
  }
  if (!best) return null;
  const out = unit(best.centre);
  const end: Vec3 = [0, 1, 2].map((k) => best!.centre[k] + out[k] * best!.radius * 0.6) as Vec3;
  return { centre: best.centre, end, radius: Math.min(Math.max(best.radius, 0.005), 0.016) };
}

/**
 * The Shadow's cube rests with its near edge on the thenar pad and its far edge on the flat of the palm by the
 * finger bases, tipped 6° towards the fingers (measured against palm.obj); the left hand is the mirror image.
 */
function shadowRest(side: 'rh' | 'lh'): Transform {
  const t = (6 * Math.PI) / 180;
  return { p: [side === 'rh' ? -0.005 : 0.005, -0.0434, 0.062], R: [1, 0, 0, 0, Math.sin(t), -Math.cos(t), 0, Math.cos(t), Math.sin(t)] };
}

/**
 * Where a cube of this hand's size comes to rest: just short of the knuckles, a little towards the little finger,
 * on whatever of the palm is highest under it, tipped to touch near and far if the palm slopes.
 */
function restOn(s: RobotSession, qOpen: number[], palm: Transform, axes: Mat3, row: Vec3, scale: number, mirror: boolean): Transform {
  const half = 0.0285 * scale;
  const toAxes = (p: Vec3) => matVec(transpose(axes), p);
  const fromAxes = (p: Vec3) => matVec(axes, p);
  const r = toAxes(row);
  const centre: Vec3 = [r[0] - 0.005 * scale * (mirror ? -1 : 1), r[1] - half - 0.007 * scale, r[2]];
  pose(s, qOpen, 0, s.defaultFocus);
  const root = s.assembly.root;
  root.updateMatrixWorld(true);
  const world = new THREE.Matrix4().copy(root.matrixWorld);
  const toWorld = (p: Vec3) => new THREE.Vector3(...local(palm, fromAxes(p))).applyMatrix4(world);
  const back = new THREE.Matrix4().copy(world).invert();
  const solids: THREE.Object3D[] = [];
  root.traverseVisible((o) => (o as THREE.Mesh).isMesh && solids.push(o));
  const ray = new THREE.Raycaster();
  const hits: { at: number; h: number }[] = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const top: Vec3 = [centre[0] + (i / 2) * half * 0.9, centre[1] + (j / 2) * half * 0.9, centre[2] + 0.25 * scale];
    const below: Vec3 = [top[0], top[1], top[2] - 1];
    const from = toWorld(top);
    ray.set(from, toWorld(below).sub(from).normalize());
    const hit = ray.intersectObjects(solids, false)[0];
    if (!hit) continue;
    const p = hit.point.clone().applyMatrix4(back);
    const inPalm = toAxes(local(invert(palm), [p.x, p.y, p.z]));
    hits.push({ at: inPalm[1] - centre[1], h: inPalm[2] });
  }
  // The lowest plane that clears every hit, over a range of tilts; the one that sits closest to the palm wins.
  let best = { slope: 0, base: hits.length ? Math.max(...hits.map((x) => x.h)) : centre[2], gap: Infinity };
  for (let deg = -6; deg <= 10 && hits.length; deg++) {
    const slope = -Math.tan((deg * Math.PI) / 180);
    const base = Math.max(...hits.map((x) => x.h - slope * x.at));
    const gap = hits.reduce((sum, x) => sum + base + slope * x.at - x.h, 0) / hits.length;
    if (gap < best.gap) best = { slope, base, gap };
  }
  const n = unit([0, -best.slope, 1]);
  const along = unit([0, 1, best.slope]);
  const bottom: Vec3 = [centre[0], centre[1], best.base];
  const c: Vec3 = [bottom[0] + n[0] * half, bottom[1] + n[1] * half, bottom[2] + n[2] * half];
  const e1: Vec3 = [1, 0, 0];
  return { p: fromAxes(c), R: compose({ R: axes, p: [0, 0, 0] }, { R: basis(e1, along, n), p: [0, 0, 0] }).R };
}
