/** What pick and place needs from a loaded robot: one chain, a gripping tool, the floor and a contact probe. */
import type { EffectorRig } from '../../../cad/assembly/types';
import { contactText } from '../../../core/collision/hull';
import type { Vec3 } from '../../../core/math/linear/vec';
import { reachEstimate } from '../../../core/robot/config/pose';
import { taskObject } from '../../../core/task/objects';
import type { PlanContext } from '../../../core/task/plan/poses';
import { workingEnd, solveAt } from '../../../core/task/plan/poses';
import type { TaskObject } from '../../../core/task/types';
import type { RobotSession } from '../../robots/session';

export interface TaskSetup {
  ctx: PlanContext;
  rig: EffectorRig;
  object: TaskObject;
  home: number[];
  floorZ: number;
  /** Where objects stand: the floor, or the top of a stand when the tool cannot reach down to it. */
  surfaceZ: number;
  lift: number;
  base: Vec3;
  radius: number;
  probe: (q: number[]) => string | null;
}

/** Null unless the robot is a single studio arm carrying a gripper. */
export function taskSetup(s: RobotSession): TaskSetup | null {
  const rig = s.assembly.effector;
  const object = rig?.grip ? taskObject(rig.kind, rig.size, rig.grip) : null;
  if (!rig || !object || !s.spec || s.limbs.length !== 1) return null;
  const radius = reachEstimate(s.spec);
  return {
    ctx: { chain: s.limbs[0].chain, tool: rig.tool, length: 0.3 * radius, maxTilt: 0.35 },
    rig, object, home: s.home, floorZ: s.assembly.floorZ, surfaceZ: s.assembly.floorZ, lift: rig.size * 1.5, base: s.spec.base, radius,
    probe: (q) => {
      const hit = s.collision?.hit(q);
      return hit ? contactText(hit) : null;
    },
  };
}

/** Opening spots either side of where the arm points at home, pulled in until the tool reaches both. */
export function defaultSpots(t: TaskSetup): [Vec3, Vec3] | null {
  const tip = workingEnd(t.ctx, t.home);
  const heading = Math.atan2(tip[1] - t.base[1], tip[0] - t.base[0]);
  const z = t.surfaceZ + t.object.graspZ;
  for (const f of [0.5, 0.42, 0.6, 0.35, 0.7, 0.28]) {
    for (const spread of [0.7, 0.45, 1.0]) {
      const spot = (sign: number): Vec3 => [t.base[0] + f * t.radius * Math.cos(heading + sign * spread), t.base[1] + f * t.radius * Math.sin(heading + sign * spread), t.surfaceZ];
      const [a, b] = [spot(-1), spot(1)];
      // Each spot must take the grasp and a small lift clear of the object, without touching anything.
      const fits = (p: Vec3, from: number[]) => {
        const grasp = solveAt(t.ctx, [p[0], p[1], z], from, 1);
        const lifted = grasp && solveAt(t.ctx, [p[0], p[1], z + t.object.size[2] + 0.2 * t.lift], grasp, 1);
        return grasp && lifted && !t.probe(grasp) && !t.probe(lifted) ? grasp : null;
      };
      const qa = fits(a, t.home);
      if (qa && fits(b, qa)) return [a, b];
    }
  }
  return null;
}

/** The lowest work height with reachable opening spots: the floor first, then ever taller stands (SCARAs work on tables). */
export function arrange(t: TaskSetup): { setup: TaskSetup; spots: [Vec3, Vec3] | null } {
  for (let k = 0; k <= 12; k++) {
    const setup = { ...t, surfaceZ: t.floorZ + k * 0.04 * t.radius };
    const spots = defaultSpots(setup);
    if (spots) return { setup, spots };
  }
  return { setup: t, spots: null };
}
