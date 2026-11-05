/**
 * Slice stretching: along the link direction, the near end stays with its joint and the far end moves
 * with the next one; only the middle section gives, so an offset edit lengthens or leans the real mesh.
 */
import * as THREE from 'three';

export interface StretchPlan {
  /** Unit link direction in the link frame. */
  dir: THREE.Vector3;
  restLength: number;
  /** Where the far end moved to: edited offset minus rest offset. */
  delta: THREE.Vector3;
}

const RIGID_END = 0.33;

export function stretchGeometry(source: THREE.BufferGeometry, toLink: THREE.Matrix4, plan: StretchPlan): THREE.BufferGeometry {
  const g = source.clone().applyMatrix4(toLink);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const { dir, restLength: L, delta } = plan;
  // A link with no length has no middle: whatever stands past the joint goes with the next link.
  const soft = Math.max(delta.length(), 1e-3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const s = v.dot(dir);
    const t = L > 1e-9 ? THREE.MathUtils.clamp((s / L - RIGID_END) / (1 - 2 * RIGID_END), 0, 1) : THREE.MathUtils.clamp(0.5 + s / (2 * soft), 0, 1);
    v.addScaledVector(delta, t);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
