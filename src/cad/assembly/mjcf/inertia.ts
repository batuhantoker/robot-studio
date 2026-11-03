/** Equivalent uniform box of a body's principal inertia: the "inside" of a CAD part in x-ray. */
import * as THREE from 'three';
import type { BodyInfo } from '../../../physics/extract/bodies';
import { tag } from '../../common/part';

/** Box edge lengths with the same mass and principal moments (Ixx = m(b² + c²)/12, …). */
export function inertiaBoxSize(b: BodyInfo): THREE.Vector3 | null {
  const [I1, I2, I3] = b.inertia;
  if (!(b.mass > 0)) return null;
  const k = 6 / b.mass;
  const edges = [I2 + I3 - I1, I1 + I3 - I2, I1 + I2 - I3].map((v) => Math.sqrt(Math.max(v * k, 0)));
  return edges.every((e) => e > 0) ? new THREE.Vector3(...edges) : null;
}

export function inertiaBox(b: BodyInfo): THREE.Object3D | null {
  const size = inertiaBoxSize(b);
  if (!size) return null;
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#d6182b', transparent: true, opacity: 0.04, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#d6182b', transparent: true, opacity: 0.45 }));
  fill.add(edges);
  fill.position.set(...b.ipos);
  fill.quaternion.set(b.iquat[1], b.iquat[2], b.iquat[3], b.iquat[0]);
  tag(fill, { label: `Equivalent-inertia box · ${b.mass.toFixed(2)} kg`, layer: 'kinematic' });
  return fill;
}
