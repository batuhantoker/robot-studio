/** Instanced hex socket-head bolts on a circle, lying in the local XZ plane facing ±Y. */
import * as THREE from 'three';
import type { MaterialSet } from '../materials/library';
import { type PartOptions, tag } from './part';

export function boltCircle(
  mats: MaterialSet,
  count: number,
  radius: number,
  head: number,
  y: number,
  facing: 1 | -1,
  opts: PartOptions,
): THREE.InstancedMesh {
  const geometry = new THREE.CylinderGeometry(head, head, head * 0.7, 6);
  geometry.translate(0, (facing * head * 0.35), 0);
  const mesh = new THREE.InstancedMesh(geometry, mats.get('steel'), count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count;
    m.makeTranslation(Math.cos(a) * radius, y, Math.sin(a) * radius);
    mesh.setMatrixAt(i, m);
  }
  mesh.castShadow = true;
  tag(mesh, opts, 'steel');
  return mesh;
}

/** Instanced hex-head screws at given points, heads facing ±`axis`. */
export function screwsAt(
  mats: MaterialSet,
  points: THREE.Vector3[],
  head: number,
  axis: 'x' | 'y' | 'z',
  facing: 1 | -1,
  opts: PartOptions,
): THREE.InstancedMesh {
  const geometry = new THREE.CylinderGeometry(head, head, head * 0.7, 6).translate(0, facing * head * 0.35, 0);
  if (axis === 'x') geometry.rotateZ(-Math.PI / 2);
  if (axis === 'z') geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geometry, mats.get('steel'), points.length);
  points.forEach((p, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p)));
  mesh.castShadow = true;
  tag(mesh, opts, 'steel');
  return mesh;
}

/** A ring of identical boxes (stator teeth, magnets, encoder ticks) around local Y. */
export function ringOf(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  radius: number,
  y: number,
  opts: PartOptions,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m.compose(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  }
  mesh.castShadow = true;
  tag(mesh, opts);
  return mesh;
}
