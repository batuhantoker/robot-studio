/** What pick and place needs from a loaded robot: one chain, a gripping tool, the floor and a contact probe. */
import type { EffectorRig } from '../../../cad/assembly/types';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import type { Chain, ChainFrames } from '../../../core/chain/model/types';
import { contactText } from '../../../core/collision/hull';
import { type Vec3, add, sub } from '../../../core/math/linear/vec';
import { nameSide, workStance } from '../../../core/motion/body';
import { easeOffLimits } from '../../../core/motion/ready';
import { reachEstimate } from '../../../core/robot/config/pose';
import { approachIk } from '../../../core/solvers/ik/approach';
import { taskObject } from '../../../core/task/objects';
import type { PlanContext } from '../../../core/task/plan/poses';
import { workingEnd, solveAt } from '../../../core/task/plan/poses';
import type { TaskClip, TaskObject } from '../../../core/task/types';
import { isClip, planTask } from '../../../core/task/plan/check';
import type { RobotSession } from '../../robots/session';
import { bodyFor } from '../../robots/body';

/** Leans (rad) tried in turn: square to the base if the arm can, else what still reads as a grasp from above. */
const UPRIGHT = [0.03, 0.1];

export interface TaskSetup {
  ctx: PlanContext;
  /** The gripper it drives. */
  rig: EffectorRig;
  object: TaskObject;
  home: number[];
  /** A bent, well-conditioned pose reaching forward and down; straight-arm homes are singular starts. */
  seed: number[];
  floorZ: number;
  /** Where objects stand: the floor, or the top of a stand when the tool cannot reach down to it. */
  surfaceZ: number;
  lift: number;
  base: Vec3;
  radius: number;
  probe: (q: number[]) => string | null;
  /** One arm of a multi-limb robot: the limb planned with, and its chain pose (and jaw opening) as a whole-robot pose. */
  limb?: number;
  expand?: (q: number[], gap?: number) => number[];
  /** Preferred work height (a standing robot's bench) and the heading the opening spots face. */
  work?: number;
  heading?: number;
  label?: string;
}

/** The limb with a gripper that works: the focused arm's, else the right one's, else the only one. */
export function toolLimb(s: RobotSession, focus: number): number | null {
  const held = s.rigs.flatMap((r, i) => (r?.grip ? [i] : []));
  const part = bodyFor(s).partOf[focus];
  return held.find((l) => part?.limbs.includes(l)) ?? held.find((l) => nameSide(s.limbs[l].name) === 'right') ?? held[0] ?? null;
}

/** One limb's chain for planning: a waist shared with another gripping arm may turn, but a pitched or rolled torso reads as the robot toppling, so those hold. */
function armChain(s: RobotSession, limb: number, home: number[]): Chain {
  const l = s.limbs[limb], body = bodyFor(s);
  const f = chainFrames(l.chain, home);
  const others = new Set(body.parts.filter((p) => p.limbs.some((i) => s.rigs[i]) && !p.limbs.includes(limb)).flatMap((p) => s.limbs[p.limb].index));
  return { ...l.chain, joints: l.chain.joints.map((j, k) => (others.has(l.index[k]) && Math.abs(f.axes[k][2]) < 0.9 ? { ...j, limits: [home[k], home[k]] as [number, number] } : j)) };
}

/** With a second arm beside it, an arm works on its own side: turned this far (rad) away from the other. */
function outward(s: RobotSession, limb: number, f: ChainFrames, tip: Vec3): number {
  const other = s.rigs.findIndex((r, i) => r && i !== limb);
  if (other < 0) return 0;
  const o = chainFrames(s.limbs[other].chain, limbQ(s.limbs[other], s.home)).tip.p;
  const away = sub(f.tip.p, o), ahead = sub(tip, f.origins[0]);
  return Math.sign(ahead[0] * away[1] - ahead[1] * away[0]) * 0.6;
}

/** An arm with a gripper: the studio's, fitted, or its own. */
function gripperSetup(s: RobotSession, limb: number): TaskSetup | null {
  const rig = s.rigs[limb]!;
  const object = taskObject(rig.kind, rig.size, rig.grip!);
  if (!object) return null;
  const l = s.limbs[limb];
  const start = rig.ready ? s.joints.map((j, i) => rig.ready![j.name] ?? s.home[i]) : s.home;
  const home = s.spec ? s.home : limbQ(l, easeOffLimits(s, start, l.index, 0.05, 0.08));
  const f = chainFrames(l.chain, home);
  const chain = s.spec ? l.chain : armChain(s, limb, home);
  const body = bodyFor(s), part = body.partOf[limb];
  // A robot with a body reaches from the shoulder; its chain may start at the waist.
  const standing = s.category !== 'arm' && !!part?.shoulder;
  const radius = s.spec ? reachEstimate(s.spec) : standing ? 1.05 * part.reach! : [...f.origins, f.tip.p].slice(1).reduce((sum, p, i) => sum + Math.hypot(...sub(p, f.origins[i])), 0);
  const base = s.spec ? s.spec.base : standing ? part.shoulder! : f.origins[0];
  const fingers = (rig.fingers ?? []).map((g) => ({ ...g, at: s.qposAdr.indexOf(g.adr) })).filter((g) => g.at >= 0);
  const expand = s.spec ? undefined : (qc: number[], gap?: number) => {
    const q = [...s.home];
    l.index.forEach((i, k) => (q[i] = qc[k]));
    if (gap !== undefined) fingers.forEach((g) => (q[g.at] = g.shut + g.per * gap));
    return q;
  };
  const probe = (q: number[]) => {
    const hit = s.collision?.hit(expand ? expand(q) : q);
    return hit ? contactText(hit) : null;
  };
  const ctx = { chain, tool: rig.tool, length: 0.3 * radius, maxTilt: 0.5, probe };
  const floorZ = s.assembly.floorZ;
  // Standing robots work at their bench.
  const work = s.category === 'humanoid' ? Math.max(workStance(body).hand, floorZ) : undefined;
  const tip = workingEnd(ctx, home);
  const facing = s.category === 'humanoid' ? Math.atan2(body.forward[1], body.forward[0]) : Math.atan2(tip[1] - base[1], tip[0] - base[0]);
  const heading = facing + outward(s, limb, f, tip);
  const ahead: Vec3 = [base[0] + 0.45 * radius * Math.cos(heading), base[1] + 0.45 * radius * Math.sin(heading), Math.max(floorZ + 0.1 * radius, base[2] - 0.2 * radius)];
  const seed = approachIk(chain, add(ahead, [0, 0, rig.tool.beyond]), [0, 0, -1], rig.tool.approach, home, ctx.length).q;
  return {
    ctx, rig, object, home, seed, floorZ, surfaceZ: work ?? floorZ, lift: rig.size * 1.5, base, radius, probe,
    limb: s.spec ? undefined : limb, expand, heading, work, label: s.rigs.filter(Boolean).length > 1 ? body.labels[limb] : undefined,
  };
}

/** Pick and place for the limb with a gripper; nothing for a robot that cannot hold. */
export function taskSetup(s: RobotSession, focus = 0): TaskSetup | null {
  const limb = toolLimb(s, focus);
  return limb === null ? null : gripperSetup(s, limb);
}

/**
 * A loose part of the setting to start from: the one nearest `spots[0]` whose whole cycle to `spots[1]` plans.
 * A gripper keeps the object sized to its jaws, standing in the part's place.
 */
export function partPick(t: TaskSetup, spots: [Vec3, Vec3], parts: { label: string; size: [number, number, number]; base: Vec3; color?: string }[]):
  { pick: Vec3; object: TaskObject; index: number } | null {
  const near = parts.map((p, index) => ({ ...p, index }))
    .filter((p) => Math.hypot(p.base[0] - t.base[0], p.base[1] - t.base[1]) < 1.2 * t.radius)
    .sort((a, b) => Math.hypot(a.base[0] - spots[0][0], a.base[1] - spots[0][1]) - Math.hypot(b.base[0] - spots[0][0], b.base[1] - spots[0][1]))
    .slice(0, 4);
  for (const p of near) {
    const object: TaskObject = { ...t.object, color: t.object.kind === 'block' ? p.color : undefined };
    if (isClip(planTask({ ctx: t.ctx, home: t.home, pick: p.base, place: spots[1], object, lift: t.lift, base: t.base }, t.probe))) {
      return { pick: p.base, object, index: p.index };
    }
  }
  return null;
}

/** A clip planned on one arm's chain, played as whole-robot poses. */
export const wholeBody = (clip: TaskClip, expand: NonNullable<TaskSetup['expand']>): TaskClip =>
  ({ ...clip, at: (t) => { const p = clip.at(t); return { q: expand(p.q, p.gap), gap: p.gap }; } });

/** Opening spots either side of where the arm points at home, pulled in until the tool reaches both. Steps once per candidate. */
function* defaultSpots(t: TaskSetup, accept: (a: Vec3, b: Vec3) => boolean): Generator<void, [Vec3, Vec3] | null> {
  const tip = workingEnd(t.ctx, t.home);
  const heading = t.heading ?? Math.atan2(tip[1] - t.base[1], tip[0] - t.base[0]);
  const z = t.surfaceZ + t.object.graspZ;
  const at = (f: number, turn: number): Vec3 => [t.base[0] + f * t.radius * Math.cos(heading + turn), t.base[1] + f * t.radius * Math.sin(heading + turn), t.surfaceZ];
  // Each spot must take the grasp and a small lift clear of the object, without touching anything.
  const fits = (p: Vec3, from: number[]) => {
    const grasp = solveAt(t.ctx, [p[0], p[1], z], from, 3);
    const lifted = grasp && solveAt(t.ctx, [p[0], p[1], z + t.object.size[2] + 0.2 * t.lift], grasp, 1);
    return lifted ? grasp : null;
  };
  const works = (a: Vec3, b: Vec3) => {
    const qa = fits(a, t.seed);
    return !!qa && !!fits(b, qa) && accept(a, b);
  };
  for (const f of [0.5, 0.42, 0.6, 0.35, 0.7, 0.28]) {
    for (const spread of [0.7, 0.45, 1.0]) {
      const [a, b] = [at(f, -spread), at(f, spread)];
      if (works(a, b)) return [a, b];
      yield;
    }
  }
  // An arm with no joint to swing it, like a telescoping one, works along the line it slides on.
  const f = chainFrames(t.ctx.chain, t.home);
  const slide = f.axes[t.ctx.chain.joints.map((j) => j.type).lastIndexOf('slide')];
  if (!slide || Math.abs(slide[2]) > 0.5) return null;
  const along = (d: number): Vec3 => [tip[0] + d * t.radius * slide[0], tip[1] + d * t.radius * slide[1], t.surfaceZ];
  for (const d of [0.12, 0.2, 0.08]) {
    const [a, b] = [along(-d), along(d)];
    if (works(a, b)) return [a, b];
    yield;
  }
  return null;
}

export interface Arranged {
  setup: TaskSetup;
  spots: [Vec3, Vec3] | null;
}

/**
 * The lowest work height with reachable opening spots: the floor first, then ever taller stands (SCARAs work on
 * tables). A standing robot starts at its bench and tries a little lower and higher around it.
 * Steps once per candidate, so a caller can spread the search over ticks; this can take seconds.
 */
export function* arrangeSteps(t: TaskSetup, clear: (p: Vec3) => boolean = () => true): Generator<void, Arranged> {
  const at = (maxTilt: number) => arrangeAt({ ...t, ctx: { ...t.ctx, maxTilt } }, clear);
  // A leaning grasp pushes jaws into the object it stands beside, so look for an upright one first.
  const upright = yield* at(UPRIGHT[0]);
  if (upright) return upright;
  // With no layout at the widest lean there is none between, so skip the tiers.
  const widest = yield* at(t.ctx.maxTilt);
  if (!widest) return { setup: t, spots: null };
  for (const maxTilt of UPRIGHT.slice(1)) {
    const found = yield* at(maxTilt);
    if (found) return found;
  }
  return widest;
}

/** The whole search at once. Off the page's thread only: in the app it goes through `layoutJob`. */
export function arrange(t: TaskSetup, clear: (p: Vec3) => boolean = () => true): Arranged {
  const steps = arrangeSteps(t, clear);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

function* arrangeAt(t: TaskSetup, clear: (p: Vec3) => boolean): Generator<void, { setup: TaskSetup; spots: [Vec3, Vec3] } | null> {
  const step = 0.04 * t.radius;
  const heights = t.work !== undefined
    ? [0, 1, -1, 2, -2, 3, 4, 5].map((k) => t.work! + k * step).filter((z) => z >= t.floorZ)
    : Array.from({ length: 30 }, (_, k) => t.floorZ + k * step);
  for (const surfaceZ of heights) {
    const setup = { ...t, surfaceZ };
    // Both ends reachable does not mean the path between them is.
    const plans = (a: Vec3, b: Vec3) => isClip(planTask({ ctx: t.ctx, home: t.home, pick: a, place: b, object: t.object, lift: t.lift, base: t.base }, t.probe));
    const spots = yield* defaultSpots(setup, (a, b) => clear(a) && clear(b) && plans(a, b));
    if (spots) return { setup, spots };
  }
  return null;
}
