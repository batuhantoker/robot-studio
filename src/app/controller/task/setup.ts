/** What pick and place needs from a loaded robot: one chain, a gripping tool, the floor and a contact probe. */
import type { EffectorRig } from '../../../cad/assembly/types';
import { contactText } from '../../../core/collision/hull';
import { type Vec3, add } from '../../../core/math/linear/vec';
import { reachEstimate } from '../../../core/robot/config/pose';
import { approachIk } from '../../../core/solvers/ik/approach';
import { taskObject } from '../../../core/task/objects';
import type { PlanContext } from '../../../core/task/plan/poses';
import { workingEnd, solveAt } from '../../../core/task/plan/poses';
import type { TaskClip, TaskObject } from '../../../core/task/types';
import { isClip, planTask } from '../../../core/task/plan/check';
import type { RobotSession } from '../../robots/session';
import { bodyFor } from '../../robots/body';
import { limbSetup } from './limb-setup';

export interface TaskSetup {
  ctx: PlanContext;
  /** The studio gripper it drives; null for a CAD hand, which holds the object in its palm. */
  rig: EffectorRig | null;
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
  /** One arm of a multi-limb robot: the limb planned with, and its chain pose as a whole-robot pose. */
  limb?: number;
  expand?: (q: number[]) => number[];
  /** Preferred work height (a standing robot's bench) and the heading the opening spots face. */
  work?: number;
  heading?: number;
  label?: string;
}

/** A single studio arm with a gripper, or one arm (the focused one, else the right) of a multi-limb robot. */
export function taskSetup(s: RobotSession, focus = 0): TaskSetup | null {
  // Several parts, not just several chains: a single arm whose extra chains are its fingertips keeps the gripper path.
  if (s.limbs.length > 1 && bodyFor(s).parts.length > 1) return limbSetup(s, focus);
  const rig = s.assembly.effector;
  const object = rig?.grip ? taskObject(rig.kind, rig.size, rig.grip) : null;
  if (!rig || !object || !s.spec || s.limbs.length !== 1) return null;
  const radius = reachEstimate(s.spec);
  const probe = (q: number[]) => {
    const hit = s.collision?.hit(q);
    return hit ? contactText(hit) : null;
  };
  const ctx = { chain: s.limbs[0].chain, tool: rig.tool, length: 0.3 * radius, maxTilt: 0.5, probe };
  const base = s.spec.base, floorZ = s.assembly.floorZ;
  const tip = workingEnd(ctx, s.home);
  const heading = Math.atan2(tip[1] - base[1], tip[0] - base[0]);
  const ahead: Vec3 = [base[0] + 0.45 * radius * Math.cos(heading), base[1] + 0.45 * radius * Math.sin(heading), Math.max(floorZ + 0.1 * radius, base[2] - 0.2 * radius)];
  const seed = approachIk(ctx.chain, add(ahead, [0, 0, rig.tool.beyond]), [0, 0, -1], rig.tool.approach, s.home, ctx.length).q;
  return {
    ctx, rig, object, home: s.home, seed, floorZ, surfaceZ: floorZ, lift: rig.size * 1.5, base, radius, probe,
  };
}

/**
 * A loose part of the setting to start from: the one nearest `spots[0]` whose whole cycle to `spots[1]` plans.
 * A hand takes it as it is; a gripper keeps the object sized to its jaws, standing in the part's place.
 */
export function partPick(t: TaskSetup, spots: [Vec3, Vec3], parts: { label: string; size: [number, number, number]; base: Vec3; color?: string }[]):
  { pick: Vec3; object: TaskObject; index: number } | null {
  const near = parts.map((p, index) => ({ ...p, index }))
    .filter((p) => Math.hypot(p.base[0] - t.base[0], p.base[1] - t.base[1]) < 1.2 * t.radius)
    .sort((a, b) => Math.hypot(a.base[0] - spots[0][0], a.base[1] - spots[0][1]) - Math.hypot(b.base[0] - spots[0][0], b.base[1] - spots[0][1]))
    .slice(0, 4);
  for (const p of near) {
    const object: TaskObject = t.rig
      ? { ...t.object, color: t.object.kind === 'block' ? p.color : undefined }
      : { kind: 'block', label: p.label, size: p.size, hold: 0, open: 0, graspZ: 1.05 * p.size[2], color: p.color };
    if (isClip(planTask({ ctx: t.ctx, home: t.home, pick: p.base, place: spots[1], object, lift: t.lift, base: t.base }, t.probe))) {
      return { pick: p.base, object, index: p.index };
    }
  }
  return null;
}

/** A clip planned on one arm's chain, played as whole-robot poses. */
export const wholeBody = (clip: TaskClip, expand: (q: number[]) => number[]): TaskClip =>
  ({ ...clip, at: (t) => { const p = clip.at(t); return { q: expand(p.q), gap: p.gap }; } });

/** Opening spots either side of where the arm points at home, pulled in until the tool reaches both. */
export function defaultSpots(t: TaskSetup, accept: (a: Vec3, b: Vec3) => boolean = () => true): [Vec3, Vec3] | null {
  const tip = workingEnd(t.ctx, t.home);
  const heading = t.heading ?? Math.atan2(tip[1] - t.base[1], tip[0] - t.base[0]);
  const z = t.surfaceZ + t.object.graspZ;
  for (const f of [0.5, 0.42, 0.6, 0.35, 0.7, 0.28]) {
    for (const spread of [0.7, 0.45, 1.0]) {
      const spot = (sign: number): Vec3 => [t.base[0] + f * t.radius * Math.cos(heading + sign * spread), t.base[1] + f * t.radius * Math.sin(heading + sign * spread), t.surfaceZ];
      const [a, b] = [spot(-1), spot(1)];
      // Each spot must take the grasp and a small lift clear of the object, without touching anything.
      const fits = (p: Vec3, from: number[]) => {
        const grasp = solveAt(t.ctx, [p[0], p[1], z], from, 3);
        const lifted = grasp && solveAt(t.ctx, [p[0], p[1], z + t.object.size[2] + 0.2 * t.lift], grasp, 1);
        return lifted ? grasp : null;
      };
      const qa = fits(a, t.seed);
      if (qa && fits(b, qa) && accept(a, b)) return [a, b];
    }
  }
  return null;
}

/**
 * The lowest work height with reachable opening spots: the floor first, then ever taller stands (SCARAs work on
 * tables). A standing robot starts at its bench and tries a little lower and higher around it.
 */
export function arrange(t: TaskSetup, clear: (p: Vec3) => boolean = () => true): { setup: TaskSetup; spots: [Vec3, Vec3] | null } {
  const step = 0.04 * t.radius;
  const heights = t.work !== undefined
    ? [0, 1, -1, 2, -2, 3, 4, 5].map((k) => t.work! + k * step).filter((z) => z >= t.floorZ)
    : Array.from({ length: 13 }, (_, k) => t.floorZ + k * step);
  for (const surfaceZ of heights) {
    const setup = { ...t, surfaceZ };
    // A hand's carry is less sure than a gripper arm's: check the whole cycle plans before offering the spots.
    const plans = (a: Vec3, b: Vec3) => !t.expand || isClip(planTask({ ctx: t.ctx, home: t.home, pick: a, place: b, object: t.object, lift: t.lift, base: t.base }, t.probe));
    const spots = defaultSpots(setup, (a, b) => clear(a) && clear(b) && plans(a, b));
    if (spots) return { setup, spots };
  }
  return { setup: t, spots: null };
}
