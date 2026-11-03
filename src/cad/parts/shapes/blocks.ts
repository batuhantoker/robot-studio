/** Rounded blocks and pins, the building stock for non-rotary modules. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const block = (x: number, y: number, z: number, round = Math.min(x, y, z) * 0.12) =>
  new RoundedBoxGeometry(x, y, z, 2, round);

/** A cylinder along local `axis` ('x' | 'y' | 'z'). */
export function pin(radius: number, length: number, axis: 'x' | 'y' | 'z', segments = 28): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}

export const torusAbout = (axis: 'x' | 'y' | 'z', radius: number, tube: number) => {
  const g = new THREE.TorusGeometry(radius, tube, 12, 64);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  if (axis === 'y') g.rotateX(Math.PI / 2);
  return g;
};
