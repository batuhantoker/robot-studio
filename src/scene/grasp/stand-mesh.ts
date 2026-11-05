/** The stand that presents a held object, drawn from the same rods the hand is checked against. */
import * as THREE from 'three';
import type { Vec3 } from '../../core/math/linear/vec';
import { type Stand, standRods } from '../../core/prosthesis/stand';

const UP = new THREE.Vector3(0, 1, 0);

function fit(mesh: THREE.Mesh, a: Vec3, b: Vec3, radius: number): void {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), d = to.clone().sub(from);
  mesh.position.copy(from).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.clone().normalize());
  mesh.scale.set(radius, d.length(), radius);
}

export class StandMesh {
  readonly group = new THREE.Group();
  private readonly steel = new THREE.MeshPhysicalMaterial({ color: '#70757d', roughness: 0.42, metalness: 0.6 });
  private readonly rods = [0, 1, 2, 3].map(() => new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20), this.steel));
  private readonly feet = [0, 1].map(() => new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.027, 0.006, 40).rotateX(Math.PI / 2), this.steel));
  private readonly cradle = new THREE.Mesh(new THREE.TorusGeometry(0.0058, 0.0016, 12, 28), this.steel);

  constructor() {
    for (const m of [...this.rods, ...this.feet, this.cradle]) {
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
  }

  /** `centre` is where the object sits, so the cradle faces it. */
  place(s: Stand, offset: Vec3, floor: number, centre: Vec3): void {
    const parts = standRods(s, offset, floor);
    this.rods.forEach((m, i) => (m.visible = i < parts.length));
    parts.forEach((r, i) => fit(this.rods[i], r.a, r.b, r.radius));
    const bases = s.posts ? [parts[0], parts[2]] : [parts[2]];
    this.feet.forEach((m, i) => (m.visible = i < bases.length));
    bases.forEach((r, i) => this.feet[i].position.set(r.b[0], r.b[1], floor + 0.003));
    this.cradle.visible = !s.posts;
    const top = parts[0].a;
    this.cradle.position.set(...top);
    const along = new THREE.Vector3(centre[0] - top[0], centre[1] - top[1], centre[2] - top[2]);
    const flat = along.lengthSq() < 1e-8 ? new THREE.Vector3(0, 0, 1) : along.normalize();
    this.cradle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flat);
  }

  dispose(): void {
    for (const m of [...this.rods, ...this.feet, this.cradle]) m.geometry.dispose();
    this.steel.dispose();
  }
}
