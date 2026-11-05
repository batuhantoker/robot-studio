/**
 * Where a chain's bodies meet. A revolute joint is a flat interface on its axis with the parent on one side
 * and the child on the other, so the two cannot touch at any angle of that joint. Coordinates are the zero pose,
 * where every chain frame is a pure translation.
 */
import { type Vec3, add, cross, dot, norm, normalize, perpendicular, scale, sub } from '../../../core/math/linear/vec';
import type { DriveDesign, JointDesign, SideDesign, SlideDesign } from '../../../core/robot/schema/design';
import type { LinkSpec, RobotSpec } from '../../../core/robot/schema/types';
import { moduleRadius } from '../types';

export interface Side {
  radius: number;
  depth: number;
  /** Bulge centre along the axis, from the joint origin. */
  centre: number;
  waist: number;
  fork?: number;
}

/** A rack on the bar, driven from the guide through a wheel and worm by a motor lying alongside. Offsets are along `side`, spans along the axis. */
export interface SlideDrive {
  /** Height of the rack above the bar, and its half width. */
  rack: number;
  rackWidth: number;
  wheel: number;
  worm: number;
  motor: number;
  /** Length of the motor. */
  length: number;
  /** Where the wheel sits along the axis, and which way the motor lies from it. */
  at: number;
  away: 1 | -1;
  wheelAt: number;
  wormAt: number;
  /** Radius of the pod round the motor, and its span along the axis. */
  pod: number;
  span: [number, number];
}

/** A bar on one body through a guide on the other. Spans run along the joint axis from the joint origin, each in the frame of the body that holds it. */
export interface Slide {
  form: 'rail' | 'quill';
  r: number;
  square: boolean;
  side: Vec3;
  outer: number;
  guide: [number, number];
  bar: [number, number];
  stroke: [number, number];
  /** The end of a rail that stands on its parent. */
  foot: 0 | 1;
  free: boolean;
  drive: SlideDrive | null;
  /** How far it opens when exploded. */
  opens: number;
  cut?: number;
  paint?: string;
}

export interface Joint {
  index: number;
  link: LinkSpec;
  /** Roll: the link runs along the axis. Hinge: across it. Slide: a bar through a guide. Module: hardware of its own. Virtual: none at all. */
  kind: 'roll' | 'hinge' | 'slide' | 'module' | 'virtual';
  origin: Vec3;
  /** Unit, from the parent's side to the child's. */
  axis: Vec3;
  /** Interface along `axis`, from `origin`. */
  plane: number;
  parent: Side;
  child: Side;
  drive?: DriveDesign;
  slide?: Slide;
}

export interface Plan {
  joints: Joint[];
  /** Interface between the last body and the tool. */
  flange: { at: Vec3; normal: Vec3; radius: number };
  /** No flange to end on. */
  bare: boolean;
  /** Clear space left at every interface. */
  gap: number;
}

const isZero = (v: Vec3) => norm(v) < 1e-9;
const firstOf = (list: Vec3[]) => list.find((v) => !isZero(v)) ?? null;

function side(d: SideDesign | undefined, jd: JointDesign | undefined, radius: number, plane: number): Side {
  const r = d?.radius ?? jd?.radius ?? radius;
  return { radius: r, depth: d?.depth ?? r * 1.15, centre: d?.centre ?? plane, waist: d?.waist ?? r * 0.8, ...(d?.fork ? { fork: d.fork } : {}) };
}

const barWidth = (d: SlideDesign | undefined, radius: number) => d?.r ?? radius * 0.6;
const guideWidth = (d: SlideDesign | undefined, radius: number) => d?.outer ?? barWidth(d, radius) * 1.9 + 0.004;

function planDrive(r: number, guide: [number, number], d: SlideDesign | undefined): SlideDrive {
  const rack = r * 0.24, wheel = Math.max(r * 0.42, 0.005), worm = wheel * 0.42, motor = d?.motor ?? Math.max(r * 0.52, 0.007), length = motor * 2.8;
  const wheelAt = r + rack + wheel * 0.9;
  const wormAt = wheelAt + wheel + worm * 0.75;
  const half = wheel * 0.75;
  const away = d?.away ?? 1;
  const at = d?.wheel ?? (guide[0] + guide[1]) / 2 - (away * (length + half - wheel)) / 2;
  const pad = Math.max(0.011, r * 0.26);
  const [near, far] = [at - away * (wheel + pad), at + away * (half + length + pad)];
  return { rack, rackWidth: r * 0.38, wheel, worm, motor, length, at, away, wheelAt, wormAt, pod: motor + pad, span: [Math.min(near, far), Math.max(near, far)] };
}

/** `next` is where the child's far end lies. Every span keeps clear by construction, at both ends of the stroke. */
function planSlide(j: Joint, prev: Joint | undefined, next: Vec3, d: SlideDesign | undefined, gap: number): Slide {
  const [lo, hi] = j.link.dofs[0].limits;
  const ahead = dot(sub(next, j.origin), j.axis);
  const form = d?.form ?? (j.index > 0 && norm(sub(next, j.origin)) > 1e-9 && Math.abs(ahead) >= 0.7 * norm(sub(next, j.origin)) ? 'quill' : 'rail');
  const r = barWidth(d, j.link.radius * 1.9), outer = guideWidth(d, j.link.radius * 1.9);
  const length = d?.guide ?? Math.max(outer * 2.4, 0.03);
  // Square to the world's y where it can be: a section is cut along y, so the drive then lies in its plane.
  const across = cross([0, 1, 0], j.axis);
  const common = { form, r, square: !!d?.square, side: d?.side ?? (norm(across) > 0.1 ? normalize(across) : perpendicular(j.axis)), outer, stroke: [lo, hi] as [number, number], free: !!d?.free, cut: d?.cut, paint: d?.paint };
  const driven = (guide: [number, number]) => (d?.drive === false ? null : planDrive(r, guide, d));
  if (form === 'rail') {
    const c = d?.centre ?? 0;
    const guide: [number, number] = [c - length / 2, c + length / 2];
    const towardsParent = prev ? dot(sub(prev.origin, j.origin), j.axis) : -j.axis[2];
    // Off the rail's free end from anywhere on it.
    return { ...common, guide, drive: driven(guide), opens: d?.opens ?? hi - lo + length + r * 2, bar: d?.bar ?? [lo + guide[0] - gap, hi + guide[1] + gap], foot: towardsParent > 1e-6 ? 1 : 0 };
  }
  const front = d?.front ?? ahead - Math.min(Math.abs(ahead) * 0.25, r * 1.5);
  const c = d?.centre ?? Math.min(0, front + lo - gap - length / 2);
  const guide: [number, number] = [c - length / 2, c + length / 2];
  const back = d?.back ?? guide[1] - length * 0.5 - hi;
  return { ...common, guide, drive: driven(guide), opens: d?.opens ?? guide[1] - back - lo + r * 2, bar: [back, front], foot: 0 };
}

export function planChain(spec: RobotSpec): Plan {
  const { links } = spec;
  const offsets = links.map((l) => l.offset);
  const radii = links.map(moduleRadius);
  const joints: Joint[] = [];
  let origin: Vec3 = [...spec.base];
  links.forEach((link, k) => {
    const out = firstOf([...offsets.slice(k), spec.tool]) ?? link.axis;
    const dir = normalize(out);
    const a = link.axis;
    const jd = spec.design?.joints?.[link.name];
    const prev = joints[k - 1];
    const coincident = k > 0 && isZero(offsets[k - 1]);
    let kind: Joint['kind'] = jd?.virtual || jd?.pin ? 'virtual' : link.joint === 'prismatic' ? 'slide' : link.joint !== 'revolute' ? 'module' : jd?.roll || (!jd?.hinge && Math.abs(dot(a, dir)) >= 0.7) ? 'roll' : 'hinge';
    let axis: Vec3 = a;
    let plane = 0;
    const length = norm(firstOf(offsets.slice(k)) ?? [0, 0, 0]);
    if (kind === 'roll') {
      axis = scale(a, Math.sign(dot(a, dir)) || 1);
      const lastRadius = k > 0 ? radii[k - 1] : 0;
      const nextRadius = k + 1 < links.length ? radii[k + 1] : radii[k] * 0.5;
      if (k === 0) plane = length * 0.42;
      else if (coincident) plane = Math.min(Math.max(length * 0.49, lastRadius * 1.25), Math.max(length - nextRadius * 1.25, length * 0.5));
      else {
        const along = Math.abs(dot(a, normalize(firstOf(offsets.slice(0, k).reverse()) ?? a))) >= 0.7;
        plane = along ? 0 : lastRadius * 1.05;
      }
    } else if (kind === 'hinge') {
      const across = dot(a, offsets[k]);
      if (Math.abs(across) > radii[k] * 0.25) {
        axis = scale(a, Math.sign(across));
        plane = across / 2;
      } else if (prev?.kind === 'hinge' && Math.abs(dot(prev.axis, a)) > 0.9) {
        axis = scale(prev.axis, -1);
      }
    }
    if (jd?.flip) axis = scale(axis, -1);
    plane = jd?.seat ?? plane;
    const radius = kind === 'slide' ? guideWidth(jd?.slide, radii[k]) : radii[k];
    joints.push({
      index: k, link, kind, origin, axis, plane,
      parent: side(jd?.parent, jd, radius, plane),
      child: side(jd?.child, jd, radius, plane),
      drive: jd?.drive,
    });
    origin = add(origin, offsets[k]);
  });
  const last = links[links.length - 1];
  const normal = normalize(firstOf([last.offset, spec.tool]) ?? last.axis);
  const end = joints[joints.length - 1];
  const gap = Math.min(0.003, Math.max(0.0008, Math.min(...radii) * 0.03));
  // A roll seated close past a hinge turns right beside its knuckle, which has to fit short of the seat. Only clearance at the zero pose would otherwise keep them apart.
  joints.forEach((j, k) => {
    const hinge = joints[k - 1];
    if (j.kind !== 'roll' || hinge?.kind !== 'hinge' || !isZero(offsets[k - 1]) || spec.design?.joints?.[hinge.link.name]) return;
    const fits = Math.max(j.plane - gap, 0.006) * 0.9;
    if (fits >= hinge.parent.radius) return;
    hinge.parent = side(undefined, undefined, fits, hinge.plane);
    hinge.child = side(undefined, undefined, fits, hinge.plane);
  });
  joints.forEach((j, k) => {
    if (j.kind !== 'slide') return;
    const after = joints[k + 1];
    j.slide = planSlide(j, joints[k - 1], after ? add(after.origin, scale(after.axis, after.plane)) : origin, spec.design?.joints?.[j.link.name]?.slide, gap);
  });
  return {
    joints,
    flange: { at: origin, normal, radius: end.child.radius * 0.85 },
    bare: !!spec.design?.bare,
    gap,
  };
}
