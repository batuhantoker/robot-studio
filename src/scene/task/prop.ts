/** The object a task moves, drawn as a stage prop: a painted block, a drinks can, or a taped carton. */
import * as THREE from 'three';
import { setFromTransform } from '../../cad/common/orient';
import { block } from '../../cad/parts/shapes/blocks';
import type { Transform } from '../../core/math/linear/transform';
import type { TaskObject } from '../../core/task/types';
import { PALETTE } from '../stage/palette';

const paint = (color: string, roughness: number, metalness = 0) => new THREE.MeshPhysicalMaterial({ color, roughness, metalness });

function meshes(o: TaskObject): THREE.Mesh[] {
  const [x, y, z] = o.size;
  if (o.kind === 'block') return [new THREE.Mesh(block(x, y, z), paint(o.color ?? '#e0782e', 0.45))];
  if (o.kind === 'can') {
    const body = new THREE.CylinderGeometry(x / 2, x / 2, z, 40).rotateX(Math.PI / 2);
    const band = new THREE.CylinderGeometry(x / 2 + 1e-4, x / 2 + 1e-4, z * 0.45, 40, 1, true).rotateX(Math.PI / 2);
    return [new THREE.Mesh(body, paint('#c9ced5', 0.3, 0.85)), new THREE.Mesh(band, paint(PALETTE.accent, 0.5))];
  }
  const tape = new THREE.BoxGeometry(x * 1.002, y * 0.22, z * 0.02).translate(0, 0, z / 2);
  return [new THREE.Mesh(block(x, y, z, Math.min(x, y, z) * 0.04), paint('#c49a5c', 0.85)), new THREE.Mesh(tape, paint('#9b7440', 0.6))];
}

export class TaskProp {
  readonly group = new THREE.Group();

  set(o: TaskObject | null): void {
    this.clear();
    for (const m of o ? meshes(o) : []) {
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
  }

  place(pose: Transform): void {
    setFromTransform(this.group, pose);
  }

  clear(): void {
    for (const m of this.group.children as THREE.Mesh[]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
