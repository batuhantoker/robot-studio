/** Invisible collision volumes, placed beside the meshes they stand for so they share every transform. */
import * as THREE from 'three';
import type { HullShape } from '../../core/collision/hull';

export interface HullMarker {
  shape: HullShape;
  /** MuJoCo sizes along the marker's local axes (cylinders run along local z). */
  size: number[];
}

export const hullOf = (o: THREE.Object3D) => o.userData.hull as HullMarker | undefined;

function marker(shape: HullShape, size: number[], at?: THREE.Vector3): THREE.Object3D {
  const o = new THREE.Object3D();
  o.userData.hull = { shape, size } satisfies HullMarker;
  if (at) o.position.copy(at);
  return o;
}

/** A cylinder about local `axis`, centred at `at`. */
export function hullPin(radius: number, length: number, axis: 'x' | 'y' | 'z', at?: THREE.Vector3): THREE.Object3D {
  const o = marker('cylinder', [radius, length / 2], at);
  if (axis === 'x') o.rotation.y = Math.PI / 2;
  if (axis === 'y') o.rotation.x = -Math.PI / 2;
  return o;
}

/** A lathe-style cylinder about local Y spanning y0..y1. */
export const hullCylinder = (radius: number, y0: number, y1: number) =>
  hullPin(radius, y1 - y0, 'y', new THREE.Vector3(0, (y0 + y1) / 2, 0));

export const hullBox = (x: number, y: number, z: number, at?: THREE.Vector3) => marker('box', [x / 2, y / 2, z / 2], at);

export const hullSphere = (radius: number, at?: THREE.Vector3) => marker('sphere', [radius], at);
