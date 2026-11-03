/** What the scene needs from any assembly, procedural or imported. */
import type * as THREE from 'three';
import type { ChainFrames } from '../../core/chain/model/types';
import type { HullVolume } from '../../core/collision/hull';
import type { EffectorKind } from '../../core/robot/schema/types';
import type { ToolGeometry } from '../../core/task/types';
import type { Effector } from '../parts/effectors/types';
import type { MaterialSet } from '../materials/library';

export interface ModuleInfo {
  id: string;
  label: string;
  kind: string;
  /** Chain joint indices this module moves within its limb (empty for structure). */
  joints: number[];
  /** Limb the module belongs to (imported CAD); absent means limb 0. */
  limb?: number;
}

/** The procedural end effector, with its jaw control; `size` is the scale its parts are drawn at. */
export interface EffectorRig extends Effector {
  kind: EffectorKind;
  size: number;
  /** Approach, jaw axis and working-end offset in the last chain frame, for task planning. */
  tool: ToolGeometry;
}

export interface Assembly {
  /** Procedural parts have modelled internals; imported CAD shows inertia boxes instead. */
  kind: 'procedural' | 'cad';
  root: THREE.Group;
  mats: MaterialSet;
  modules: ModuleInfo[];
  /** Per chain joint, the mesh that glows with its load. */
  indicators: (THREE.Mesh | null)[];
  floorZ: number;
  /** Collision volumes per chain frame; imported CAD uses its model's own geoms instead. */
  hull?: HullVolume[];
  /** Procedural robots only; imported CAD keeps its own hand. */
  effector?: EffectorRig;
  /** Pose every slot for each limb's frames and an explode factor (0..1). */
  update(limbs: ChainFrames[], explode: number): void;
  dispose(): void;
}

export const moduleOf = (o: THREE.Object3D | null): string | null => {
  for (let n = o; n; n = n.parent) if (typeof n.userData.module === 'string') return n.userData.module;
  return null;
};
