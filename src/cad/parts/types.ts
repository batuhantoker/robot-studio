/** The contract every joint module, link body, effector, and base builder implements. */
import type * as THREE from 'three';
import type { LinkSpec } from '../../core/robot/schema/types';
import type { MaterialSet } from '../materials/library';

export interface ModuleContext {
  mats: MaterialSet;
  link: LinkSpec;
  index: number;
}

export interface JointModule {
  /** stages[0] rides the parent side; stages[i] rides the frame after DOF i−1. */
  stages: THREE.Group[];
  /** Distance from the joint origin to the module surface along a unit direction (last stage frame). */
  exit(dir: THREE.Vector3): number;
  /** Per DOF, the part that glows with load. */
  indicators: THREE.Mesh[];
  /** Characteristic size, for spacing exploded views and sizing neighbours. */
  size: number;
}

export type JointModuleBuilder = (ctx: ModuleContext) => JointModule;

/** Module size from the link's structural radius. */
export const moduleRadius = (link: LinkSpec) => Math.max(link.radius * 1.9, 0.012);
