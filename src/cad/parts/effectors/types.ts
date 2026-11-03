/** The contract every end-effector builder implements. */
import type * as THREE from 'three';
import type { MaterialSet } from '../../materials/library';

export interface EffectorOptions {
  mats: MaterialSet;
  /** Flange centre and tool point in the last link frame. */
  flange: THREE.Vector3;
  tip: THREE.Vector3;
  approach: THREE.Vector3;
  size: number;
  payload: number;
}

/** Opening between the contact faces (m). A vacuum cup reads `min` as suction on. */
export interface GripControl {
  min: number;
  max: number;
  /** Opening when nothing is being handled. */
  rest: number;
  set(gap: number): void;
}

export interface Effector {
  group: THREE.Group;
  /** Null for tools that do not grip (torch, spindle, bare flange). */
  grip: GripControl | null;
  /** Flange to working end (fingertips, cup lip, nozzle) along the approach; may exceed the tool point. */
  reach: number;
  /** The static payload marker, hidden while a task object stands in for it. */
  payload: THREE.Object3D | null;
}

export type EffectorBuilder = (o: EffectorOptions) => Effector;
