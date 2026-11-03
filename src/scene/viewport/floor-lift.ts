/**
 * Keep robots out of the floor. Floating-base robots (legged, humanoid, wheeled) settle so their
 * lowest point rests on the ground, as their real base would; bolted arms only rise while exploded.
 */
import * as THREE from 'three';
import { partOf } from '../../cad/common/part';

export type Grounding = 'bolted' | 'settle';

const box = new THREE.Box3();
const corner = new THREE.Vector3();

/** Lowest world z of visible solid parts (inertia boxes and other kinematic helpers ignored). */
function lowestZ(root: THREE.Object3D): number {
  let min = Infinity;
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || partOf(mesh)?.layer === 'kinematic') return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox!);
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      min = Math.min(min, corner.applyMatrix4(mesh.matrixWorld).z);
    }
  });
  return min;
}

export function groundRobot(holder: THREE.Object3D, assembly: THREE.Object3D, floorZ: number, grounding: Grounding, exploded: boolean): void {
  holder.position.z = 0;
  if (grounding === 'bolted' && !exploded) return;
  holder.updateMatrixWorld(true);
  const min = lowestZ(assembly);
  if (!Number.isFinite(min)) return;
  holder.position.z = grounding === 'settle' ? floorZ - min : Math.max(0, floorZ - min);
}
