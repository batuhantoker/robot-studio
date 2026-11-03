/** Stands that lift the pick and place spots to the work height, when the tool cannot reach the floor. */
import * as THREE from 'three';
import type { Vec3 } from '../../core/math/linear/vec';

export class TaskStands {
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshPhysicalMaterial({ color: '#d5d8dd', roughness: 0.6, metalness: 0.1 });

  set(spots: (Vec3 | null)[], radius: number, floorZ: number, topZ: number): void {
    for (const m of this.group.children as THREE.Mesh[]) m.geometry.dispose();
    this.group.clear();
    const height = topZ - floorZ;
    if (height < 1e-6) return;
    for (const p of spots) {
      if (!p) continue;
      const stand = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, radius * 2.4, height), this.material);
      stand.position.set(p[0], p[1], floorZ + height / 2);
      stand.castShadow = stand.receiveShadow = true;
      this.group.add(stand);
    }
  }
}
