/**
 * A fixed-base serial chain: T = base · Π_k (F_k · M_k(q_k)) · tip, where F_k is a constant
 * transform into joint k's frame and M_k is Rot(axis, q - q0) or Trans(axis · (q - q0)).
 * Studio specs and compiled MuJoCo models both reduce to this form.
 */
import type { Transform } from '../../math/linear/transform';
import type { Vec3 } from '../../math/linear/vec';
import type { DofType } from '../../robot/schema/types';

export interface ChainJoint {
  name: string;
  type: DofType;
  fixed: Transform;
  axis: Vec3;
  limits: [number, number];
  /** Reference position (MuJoCo `ref`); motion is measured from it. */
  q0: number;
  /** An unlimited hinge (wheel, rotor): angles wrap instead of clamping. */
  continuous?: boolean;
}

export interface ChainMass {
  name: string;
  mass: number;
  /** Centre of mass in the moving frame of `joint`; -1 means fixed to the base. */
  com: Vec3;
  joint: number;
}

export interface Chain {
  name: string;
  base: Transform;
  joints: ChainJoint[];
  tip: Transform;
  masses: ChainMass[];
  gravity: Vec3;
}

export interface ChainFrames {
  /** Joint anchors in world, before each joint's motion. */
  origins: Vec3[];
  /** World joint axes. */
  axes: Vec3[];
  /** World frame of each joint before its motion. */
  pre: Transform[];
  /** World frame of each joint after its motion. */
  frames: Transform[];
  tip: Transform;
}
