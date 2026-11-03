/**
 * Slice stretching: along the link direction, the ends (joint housings) stay rigid and move
 * with their joints; only the middle section lengthens. Thickness scales across the axis.
 */
import * as THREE from 'three';

export interface StretchPlan {
  /** Unit link direction in the link frame. */
  dir: THREE.Vector3;
  restLength: number;
  length: number;
  thickness: number;
}

const RIGID_END = 0.33;

export function stretchGeometry(source: THREE.BufferGeometry, toLink: THREE.Matrix4, plan: StretchPlan): THREE.BufferGeometry {
  const g = source.clone().applyMatrix4(toLink);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const { dir, restLength: L, length, thickness } = plan;
  const grow = length - L;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const s = v.dot(dir);
    const along = dir.clone().multiplyScalar(s);
    const across = v.clone().sub(along).multiplyScalar(thickness);
    const t = L > 1e-9 ? THREE.MathUtils.clamp((s / L - RIGID_END) / (1 - 2 * RIGID_END), 0, 1) : 0;
    v.copy(along).add(across).addScaledVector(dir, grow * t);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
