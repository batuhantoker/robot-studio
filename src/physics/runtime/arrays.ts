/** Typed views onto MjModel/MjData buffers (the bindings type them as `any`). */
import type { MjData, MjModel } from '@mujoco/mujoco';

type Num = ArrayLike<number>;

export interface ModelArrays {
  nbody: number; njnt: number; ngeom: number; nsite: number; nmesh: number; nu: number; nq: number; nv: number;
  body_parentid: Num; body_pos: Num; body_quat: Num; body_mass: Num; body_ipos: Num; body_iquat: Num; body_inertia: Num;
  body_jntadr: Num; body_jntnum: Num;
  jnt_type: Num; jnt_bodyid: Num; jnt_pos: Num; jnt_axis: Num; jnt_range: Num; jnt_limited: Num; jnt_qposadr: Num; jnt_dofadr: Num;
  qpos0: Num;
  geom_type: Num; geom_bodyid: Num; geom_size: Num; geom_pos: Num; geom_quat: Num; geom_rgba: Num; geom_dataid: Num; geom_matid: Num;
  geom_group: Num;
  mat_rgba: Num;
  site_bodyid: Num; site_pos: Num; site_quat: Num;
  mesh_vertadr: Num; mesh_vertnum: Num; mesh_vert: Num; mesh_faceadr: Num; mesh_facenum: Num; mesh_face: Num;
  actuator_trnid: Num; actuator_gear: Num; actuator_forcerange: Num; actuator_ctrlrange: Num;
  dof_M0: Num; dof_jntid: Num; dof_armature: Float64Array; body_subtreemass: Num;
  neq: number; eq_type: Num; eq_obj1id: Num; eq_obj2id: Num; eq_data: Num;
}

export interface DataArrays {
  qpos: Float64Array; qvel: Float64Array; qacc: Float64Array; ctrl: Float64Array;
  xpos: Float64Array; xquat: Float64Array; site_xpos: Float64Array;
  qfrc_bias: Float64Array; qfrc_actuator: Float64Array; qfrc_applied: Float64Array; time: number;
  subtree_com: Float64Array; xanchor: Float64Array;
}

export const arrays = (m: MjModel) => m as unknown as ModelArrays;
export const state = (d: MjData) => d as unknown as DataArrays;

/** mjtJoint: free 0, ball 1, slide 2, hinge 3. mjtGeom: plane 0 … box 6, mesh 7. */
export const JOINT = { free: 0, ball: 1, slide: 2, hinge: 3 } as const;
export const GEOM = { plane: 0, hfield: 1, sphere: 2, capsule: 3, ellipsoid: 4, cylinder: 5, box: 6, mesh: 7 } as const;
export const OBJ = { body: 1, joint: 3, geom: 5, site: 6, mesh: 10, actuator: 19, key: 24 } as const;
