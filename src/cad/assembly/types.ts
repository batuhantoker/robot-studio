/** What the scene needs from any assembly, procedural or imported. */
import type * as THREE from 'three';
import type { ChainFrames } from '../../core/chain/model/types';
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

export interface Assembly {
  /** Procedural parts have modelled internals; imported CAD shows inertia boxes instead. */
  kind: 'procedural' | 'cad';
  root: THREE.Group;
  mats: MaterialSet;
  modules: ModuleInfo[];
  /** Per chain joint, the mesh that glows with its load. */
  indicators: (THREE.Mesh | null)[];
  floorZ: number;
  /** Pose every slot for each limb's frames and an explode factor (0..1). */
  update(limbs: ChainFrames[], explode: number): void;
  dispose(): void;
}

export const moduleOf = (o: THREE.Object3D | null): string | null => {
  for (let n = o; n; n = n.parent) if (typeof n.userData.module === 'string') return n.userData.module;
  return null;
};
