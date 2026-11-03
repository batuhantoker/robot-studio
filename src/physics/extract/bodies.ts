/** Plain-JS snapshot of the body tree, joints, and inertias of a compiled model. */
import type { Quat } from '../../core/math/linear/transform';
import type { Vec3 } from '../../core/math/linear/vec';
import { OBJ, arrays } from '../runtime/arrays';
import type { ModelHandle } from '../model/handle';

export interface BodyInfo {
  id: number;
  name: string;
  parent: number;
  pos: Vec3;
  quat: Quat;
  mass: number;
  ipos: Vec3;
  iquat: Quat;
  inertia: Vec3;
  joints: number[];
}

export interface JointInfo {
  id: number;
  name: string;
  type: number;
  body: number;
  pos: Vec3;
  axis: Vec3;
  range: [number, number];
  limited: boolean;
  qpos: number;
  dof: number;
  q0: number;
}

const v3 = (a: ArrayLike<number>, i: number): Vec3 => [a[3 * i], a[3 * i + 1], a[3 * i + 2]];
const q4 = (a: ArrayLike<number>, i: number): Quat => [a[4 * i], a[4 * i + 1], a[4 * i + 2], a[4 * i + 3]];

export function readBodies(h: ModelHandle): BodyInfo[] {
  const m = arrays(h.model);
  return Array.from({ length: m.nbody }, (_, id) => ({
    id,
    name: h.name(OBJ.body, id) || `body_${id}`,
    parent: m.body_parentid[id],
    pos: v3(m.body_pos, id),
    quat: q4(m.body_quat, id),
    mass: m.body_mass[id],
    ipos: v3(m.body_ipos, id),
    iquat: q4(m.body_iquat, id),
    inertia: v3(m.body_inertia, id),
    joints: Array.from({ length: m.body_jntnum[id] }, (_, k) => m.body_jntadr[id] + k),
  }));
}

export function readJoints(h: ModelHandle): JointInfo[] {
  const m = arrays(h.model);
  return Array.from({ length: m.njnt }, (_, id) => ({
    id,
    name: h.name(OBJ.joint, id) || `joint_${id}`,
    type: m.jnt_type[id],
    body: m.jnt_bodyid[id],
    pos: v3(m.jnt_pos, id),
    axis: v3(m.jnt_axis, id),
    range: [m.jnt_range[2 * id], m.jnt_range[2 * id + 1]],
    limited: m.jnt_limited[id] !== 0,
    qpos: m.jnt_qposadr[id],
    dof: m.jnt_dofadr[id],
    q0: m.qpos0[m.jnt_qposadr[id]],
  }));
}
