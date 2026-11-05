/** A flexible conduit across a joint: it arches between two bodies and re-forms on every pose, so no casting can hold it. */
import * as THREE from 'three';
import { part } from '../../common/part';
import type { MaterialSet } from '../../materials/library';

const STEPS = 36;
const SIDES = 12;

export interface Conduit {
  mesh: THREE.Mesh;
  /** Re-forms it between two points in the assembly's frame, leaving both straight up. */
  form(from: THREE.Vector3, to: THREE.Vector3): void;
}

export function buildConduit(mats: MaterialSet, r: number, rise: number): Conduit {
  const g = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array((STEPS + 1) * SIDES * 3), 3);
  const normal = new THREE.BufferAttribute(new Float32Array((STEPS + 1) * SIDES * 3), 3);
  g.setAttribute('position', position);
  g.setAttribute('normal', normal);
  const index: number[] = [];
  for (let i = 0; i < STEPS; i++) for (let j = 0; j < SIDES; j++) {
    const [a, b] = [i * SIDES + j, i * SIDES + ((j + 1) % SIDES)];
    index.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
  }
  g.setIndex(index);
  const mesh = part(g, mats, 'rubber', { label: 'Cable conduit', layer: 'cable' });
  // Its vertices move every pose, so a stored bounding sphere would go stale.
  mesh.frustumCulled = false;
  const up = new THREE.Vector3(0, 0, 1);
  const curve = new THREE.CubicBezierCurve3();
  const t = new THREE.Vector3(), n = new THREE.Vector3(1, 0, 0), b = new THREE.Vector3(), p = new THREE.Vector3(), out = new THREE.Vector3();
  return {
    mesh,
    form(from, to) {
      curve.v0.copy(from);
      curve.v1.copy(from).addScaledVector(up, rise);
      curve.v2.copy(to).addScaledVector(up, rise);
      curve.v3.copy(to);
      n.set(1, 0, 0);
      for (let i = 0; i <= STEPS; i++) {
        const u = i / STEPS;
        curve.getPoint(u, p);
        curve.getTangent(u, t);
        // Transported along the curve, so the tube cannot twist flat at the top of the arch.
        n.addScaledVector(t, -n.dot(t)).normalize();
        b.crossVectors(t, n);
        for (let j = 0; j < SIDES; j++) {
          const a = (j / SIDES) * Math.PI * 2;
          out.copy(n).multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
          const k = i * SIDES + j;
          position.setXYZ(k, p.x + out.x * r, p.y + out.y * r, p.z + out.z * r);
          normal.setXYZ(k, out.x, out.y, out.z);
        }
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;
    },
  };
}
