/** Orientation helpers between core vectors and three.js frames. */
import * as THREE from 'three';
import type { Transform } from '../../core/math/linear/transform';
import type { Vec3 } from '../../core/math/linear/vec';

export const v3 = (v: Vec3): THREE.Vector3 => new THREE.Vector3(v[0], v[1], v[2]);

/** Rotation taking local +Y onto `dir`. */
export const yTo = (dir: THREE.Vector3): THREE.Quaternion =>
  new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

/** A group whose local +Y is `axis` (and +X lies along `side` when given). */
export function axisFrame(axis: THREE.Vector3, side?: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const y = axis.clone().normalize();
  if (!side) {
    g.quaternion.copy(yTo(y));
    return g;
  }
  const x = side.clone().sub(y.clone().multiplyScalar(side.dot(y))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return g;
}

export const matrixOf = ({ R, p }: Transform): THREE.Matrix4 =>
  new THREE.Matrix4().set(R[0], R[1], R[2], p[0], R[3], R[4], R[5], p[1], R[6], R[7], R[8], p[2], 0, 0, 0, 1);

/** Rigid part of a matrix (three.js stores it column-major). */
export function transformOf(m: THREE.Matrix4): Transform {
  const e = m.elements;
  return { R: [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]], p: [e[12], e[13], e[14]] };
}

export function setFromTransform(o: THREE.Object3D, t: Transform): void {
  matrixOf(t).decompose(o.position, o.quaternion, o.scale);
}

/** Distance from a cylinder's centre to its surface along a unit direction (axis = local Y). */
export function cylinderExit(radius: number, halfLength: number, axis: THREE.Vector3, dir: THREE.Vector3): number {
  const c = Math.abs(axis.dot(dir));
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  return Math.min(s > 1e-9 ? radius / s : Infinity, c > 1e-9 ? halfLength / c : Infinity);
}
