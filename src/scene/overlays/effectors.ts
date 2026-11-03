/** A marker on every end effector; the focused limb's in the accent. The others are handles to grab. */
import * as THREE from 'three';
import type { ChainFrames } from '../../core/chain/model/types';
import { PALETTE } from '../stage/palette';

/** Grab radius as an angle from the eye, so a handle is as easy to hit near or far. */
const GRAB = 0.02;

export class EffectorsOverlay {
  readonly group = new THREE.Group();
  private marks: THREE.Mesh[] = [];
  private focus = 0;

  rebuild(count: number, scale: number): void {
    this.group.clear();
    this.marks = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.012, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.ink, depthTest: false }));
      m.renderOrder = 15;
      return m;
    });
    if (count > 1) this.group.add(...this.marks);
  }

  update(limbs: ChainFrames[], focus: number): void {
    this.focus = focus;
    limbs.forEach((f, i) => {
      const m = this.marks[i];
      if (!m) return;
      m.position.set(...f.tip.p);
      (m.material as THREE.MeshBasicMaterial).color.set(i === focus ? PALETTE.accent : PALETTE.ink);
    });
  }

  /** The unfocused limb whose marker is under the ray, or null. */
  hit(ray: THREE.Raycaster): number | null {
    if (this.marks.length < 2 || !this.group.visible) return null;
    let best: number | null = null, bestAngle = GRAB;
    this.marks.forEach((m, i) => {
      if (i === this.focus) return;
      const p = m.getWorldPosition(new THREE.Vector3());
      const angle = ray.ray.distanceToPoint(p) / Math.max(ray.ray.origin.distanceTo(p), 1e-9);
      if (angle < bestAngle) [best, bestAngle] = [i, angle];
    });
    return best;
  }

  /** World position of limb i's marker. */
  at(i: number): THREE.Vector3 {
    return this.marks[i].getWorldPosition(new THREE.Vector3());
  }
}
