/** The joint catalogue: each kind is an ordered stack of elementary hinge/slide DOFs. */
import type { DofType, JointKind } from '../schema/types';

/** Which link axis a DOF uses: the primary axis, axis2, or axis × axis2. */
export type AxisRole = 'axis' | 'axis2' | 'axis3';

export interface DofTemplate {
  suffix: string;
  type: DofType;
  axis: AxisRole;
  limits: [number, number];
}

export interface JointKindInfo {
  kind: JointKind;
  label: string;
  motion: string;
  useCase: string;
  dofs: DofTemplate[];
}

const PI = Math.PI;
const turn = (suffix: string, axis: AxisRole, limits: [number, number] = [-PI, PI]): DofTemplate =>
  ({ suffix, type: 'hinge', axis, limits });
const slide = (suffix: string, axis: AxisRole, limits: [number, number] = [-0.1, 0.1]): DofTemplate =>
  ({ suffix, type: 'slide', axis, limits });

export const JOINT_KINDS: Record<JointKind, JointKindInfo> = {
  revolute: {
    kind: 'revolute', label: 'Revolute', motion: 'Rotation about one axis', useCase: 'Articulated arms',
    dofs: [turn('', 'axis')],
  },
  prismatic: {
    kind: 'prismatic', label: 'Prismatic', motion: 'Translation along one axis', useCase: 'Gantry and Cartesian robots',
    dofs: [slide('', 'axis')],
  },
  cylindrical: {
    kind: 'cylindrical', label: 'Cylindrical', motion: 'Slide and rotate about the same axis', useCase: 'Telescoping reach',
    dofs: [slide('slide', 'axis', [-0.05, 0.05]), turn('turn', 'axis')],
  },
  universal: {
    kind: 'universal', label: 'Universal', motion: 'Two intersecting perpendicular hinges', useCase: 'Cardan wrists, parallel mechanisms',
    dofs: [turn('a', 'axis', [-0.8, 0.8]), turn('b', 'axis2', [-0.8, 0.8])],
  },
  spherical: {
    kind: 'spherical', label: 'Spherical', motion: 'Three intersecting hinges (intrinsic Euler angles)', useCase: 'Wrists and hips',
    dofs: [turn('a', 'axis'), turn('b', 'axis2', [-0.8, 0.8]), turn('c', 'axis3', [-0.8, 0.8])],
  },
  planar: {
    kind: 'planar', label: 'Planar', motion: 'Two in-plane slides and a turn about the normal', useCase: 'XY stages, mobile bases',
    dofs: [slide('u', 'axis2'), slide('v', 'axis3'), turn('turn', 'axis')],
  },
};

export const JOINT_KIND_LIST = Object.values(JOINT_KINDS);
export const isJointKind = (v: unknown): v is JointKind => typeof v === 'string' && v in JOINT_KINDS;
export const dofName = (link: string, t: DofTemplate) => (t.suffix ? `${link}_${t.suffix}` : link);
