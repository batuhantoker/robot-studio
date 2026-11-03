/** Tool path: a precomputed trajectory or a rolling history of recent tool positions. */
import * as THREE from 'three';
import type { Vec3 } from '../../core/math/linear/vec';
import { PALETTE } from '../stage/palette';

const MAX = 2000;

export class TrailOverlay {
  readonly group = new THREE.Group();
  private positions = new Float32Array(MAX * 3);
  private geometry = new THREE.BufferGeometry();
  private count = 0;

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.group.add(new THREE.Line(this.geometry, new THREE.LineBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.8 })));
  }

  setPath(points: Vec3[]): void {
    this.count = Math.min(points.length, MAX);
    points.slice(0, MAX).forEach((p, i) => this.positions.set(p, i * 3));
    this.flush();
  }

  push(p: Vec3): void {
    if (this.count === MAX) this.positions.copyWithin(0, 3);
    else this.count++;
    this.positions.set(p, (this.count - 1) * 3);
    this.flush();
  }

  clear(): void {
    this.count = 0;
    this.flush();
  }

  private flush(): void {
    this.geometry.setDrawRange(0, this.count);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}
