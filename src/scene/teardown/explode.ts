/** Part-level explode: every tagged part slides from its rest position along its own vector. */
import type * as THREE from 'three';
import { partOf } from '../../cad/common/part';

export function explodeParts(root: THREE.Object3D, amount: number, focus: string | null, moduleOf: (o: THREE.Object3D) => string | null): void {
  root.traverse((o) => {
    const meta = partOf(o);
    if (!meta) return;
    // The isolated module opens further so its internals read clearly.
    const k = focus && moduleOf(o) === focus ? 1.6 : 1;
    o.position.copy(meta.rest).addScaledVector(meta.explode, amount * k);
  });
}
