/**
 * Robot configuration shared with `four_dof_arm.serial_arm.SerialArm` (SI units).
 * Studio extensions (`joint` kinds other than revolute, `axis2`, per-DOF limits) make a robot
 * studio/MJCF-only; Python export is refused for those. `effector` is visual only, so Python export drops it.
 */
import type { Vec3 } from '../../math/linear/vec';
import type { RobotDesign } from './design';

export type JointKind = 'revolute' | 'prismatic' | 'cylindrical' | 'universal' | 'spherical' | 'planar';
export type DofType = 'hinge' | 'slide';
export type EffectorKind = 'parallel' | 'three_finger' | 'suction' | 'torch' | 'spindle' | 'flange';

/** One elementary degree of freedom; its axis is in the frame left by the previous DOF. */
export interface DofSpec {
  name: string;
  type: DofType;
  axis: Vec3;
  limits: [number, number];
}

export interface LinkSpec {
  name: string;
  joint: JointKind;
  axis: Vec3;
  /** Secondary unit axis, orthogonal to `axis` (universal, spherical, planar). */
  axis2: Vec3;
  offset: Vec3;
  mass: number;
  radius: number;
  damping: number;
  armature: number;
  torque_limit: number;
  kp: number;
  kd: number;
  dofs: DofSpec[];
  /** A revolute joint with no stops; `limits` are then only the range its slider shows. */
  continuous?: boolean;
}

export interface RobotSpec {
  name: string;
  units: 'SI';
  base: Vec3;
  tool: Vec3;
  payload_mass: number;
  /** What the last link carries; the tool point stays `tool`. */
  effector: EffectorKind;
  links: LinkSpec[];
  /** Joint values it starts at, in DOF order; zero when absent or when links were added since. */
  home?: number[];
  /** How its CAD is dressed; never read by kinematics, dynamics or the MJCF writer. */
  design?: RobotDesign;
}

export class SpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecError';
  }
}

/** Python dataclass field order, which `to_dict` preserves. */
export const LINK_FIELDS = [
  'name', 'axis', 'offset', 'mass', 'limits', 'radius', 'damping', 'armature', 'torque_limit', 'kp', 'kd',
] as const;
export const STUDIO_LINK_FIELDS = ['joint', 'axis2', 'continuous'] as const;

export const LINK_DEFAULTS = {
  radius: 0.015,
  damping: 0.05,
  armature: 0.01,
  torque_limit: 10,
  kp: 20,
  kd: 2,
};
