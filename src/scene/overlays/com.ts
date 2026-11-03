/** Centre-of-mass markers sized by mass, gravity arrows, and the whole-arm CoM. */
import * as THREE from 'three';
import type { GravityLoad } from '../../core/analysis/statics/gravity';
import { PALETTE } from '../stage/palette';

export class ComOverlay {
  readonly group = new THREE.Group();
  private marks: THREE.Mesh[] = [];
  private arrows: THREE.ArrowHelper[] = [];
  private total = new THREE.Mesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ color: PALETTE.accent, depthTest: false }));

  rebuild(masses: number[], scale: number): void {
    this.group.clear();
    const heaviest = Math.max(...masses, 1e-6);
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.ink, depthTest: false });
    this.marks = masses.map((m) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
      s.scale.setScalar(scale * 0.012 * Math.cbrt(m / heaviest + 0.05));
      s.renderOrder = 12;
      return s;
    });
    this.arrows = masses.map((m) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), scale * 0.18 * (m / heaviest) + scale * 0.03, PALETTE.blue, scale * 0.025, scale * 0.015);
      a.renderOrder = 12;
      return a;
    });
    this.total.scale.setScalar(scale * 0.02);
    this.total.renderOrder = 13;
    this.group.add(...this.marks, ...this.arrows, this.total);
  }

  update(load: GravityLoad): void {
    load.loads.forEach((l, i) => {
      this.marks[i]?.position.set(...l.position);
      this.arrows[i]?.position.set(...l.position);
    });
    this.total.position.set(...load.centerOfMass);
  }
}
