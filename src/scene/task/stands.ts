/** Stands that hold a pick or place spot up where nothing else does: from the surface below to the spot. */
import * as THREE from 'three';
import type { Vec3 } from '../../core/math/linear/vec';

export class TaskStands {
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshPhysicalMaterial({ color: '#d5d8dd', roughness: 0.6, metalness: 0.1 });

  /** Each spot with the height of what is under it; spots already resting on something get no stand. */
  set(spots: [Vec3, number][], radius: number): void {
    for (const m of this.group.children as THREE.Mesh[]) m.geometry.dispose();
    this.group.clear();
    for (const [p, below] of spots) {
      const height = p[2] - below;
      if (height < 1e-4) continue;
      const stand = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, radius * 2.4, height), this.material);
      stand.position.set(p[0], p[1], below + height / 2);
      stand.castShadow = stand.receiveShadow = true;
      this.group.add(stand);
    }
  }
}
