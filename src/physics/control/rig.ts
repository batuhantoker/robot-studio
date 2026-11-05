/** One compiled model and how a controller reaches it: the session's own on its stand, or a copy on a floor. */
import { lowestZ } from '../collision/floor';
import { FLOOR_GEOM, FREE_JOINT, ROOT_BODY } from '../model/floor-copy';
import type { ModelHandle } from '../model/handle';
import { OBJ, arrays, state } from '../runtime/arrays';
import { Plant, type PlantRobot } from './plant';
import { StandTest } from './stand';

export interface Rig extends PlantRobot {
  plant: Plant;
  /** Set on the floor. */
  stand: StandTest | null;
  /** Height of the floor plane in model coordinates. */
  floorZ: number;
}

type Source = Omit<PlantRobot, 'onFloor'>;

export const standRig = (robot: Source): Rig => ({ ...robot, plant: new Plant(robot), stand: null, floorZ: 0 });

/** Whether anything on this model could touch a floor. */
export function hasCollision(h: ModelHandle): boolean {
  const m = arrays(h.model);
  for (let g = 0; g < m.ngeom; g++) if (m.geom_contype[g] || m.geom_conaffinity[g]) return true;
  return false;
}

export function floorRig(robot: Source, handle: ModelHandle): Rig {
  const from = arrays(robot.handle.model), m = arrays(handle.model), d = state(handle.data);
  // The free joint moves every address, so joints are matched by name.
  const adrOf = (j: number) => {
    const name = robot.handle.name(OBJ.joint, j);
    const id = name ? handle.id(OBJ.joint, name) : -1;
    if (id < 0) throw new Error(`joint ${j} has no match on the floor copy`);
    return id;
  };
  const rest = Float64Array.from(m.qpos0);
  for (let j = 0; j < from.njnt; j++) rest[m.jnt_qposadr[adrOf(j)]] = robot.rest[from.jnt_qposadr[j]];
  const joints = robot.dofAdr.map((v) => adrOf(from.dof_jntid[v]));
  const qposAdr = joints.map((j) => m.jnt_qposadr[j]);
  const dofAdr = joints.map((j) => m.jnt_dofadr[j]);
  qposAdr.forEach((a, k) => (rest[a] = robot.home[k]));

  // URDFs overlap themselves, and the floor is what this copy is for: robot geoms touch only the plane.
  const floor = handle.id(OBJ.geom, FLOOR_GEOM);
  const solid: number[] = [];
  for (let g = 0; g < m.ngeom; g++) {
    if (g === floor || !(m.geom_contype[g] || m.geom_conaffinity[g])) continue;
    m.geom_contype[g] = 1;
    m.geom_conaffinity[g] = 0;
    solid.push(g);
  }
  // The broad phase reads per-body masks fixed at compile time, not the geoms'.
  for (let b = 1; b < m.nbody; b++) {
    m.body_contype[b] = 1;
    m.body_conaffinity[b] = 0;
  }
  d.qpos.set(rest);
  handle.mj.mj_forward(handle.model, handle.data);
  const floorZ = Math.min(...solid.map((g) => lowestZ(handle.model, handle.data, g)));
  m.geom_pos[3 * floor + 2] = floorZ;

  const comHeight = d.subtree_com[3 * ROOT_BODY + 2] - floorZ;
  const dt = (handle.model.opt as unknown as { timestep: number }).timestep;
  const free = handle.id(OBJ.joint, FREE_JOINT);
  const stand = new StandTest(m.jnt_qposadr[free], m.jnt_dofadr[free], comHeight, m.body_subtreemass[ROOT_BODY], dt);
  const copy: PlantRobot = { handle, qposAdr, dofAdr, rest, home: robot.home, torqueLimits: robot.torqueLimits, limbs: robot.limbs, onFloor: true };
  return { ...copy, plant: new Plant(copy), stand, floorZ };
}
