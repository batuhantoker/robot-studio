/** A marker on every end effector; the focused limb's in the accent. */
import * as THREE from 'three';
import type { ChainFrames } from '../../core/chain/model/types';
import { PALETTE } from '../stage/palette';

export class EffectorsOverlay {
  readonly group = new THREE.Group();
  private marks: THREE.Mesh[] = [];

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
    limbs.forEach((f, i) => {
      const m = this.marks[i];
      if (!m) return;
      m.position.set(...f.tip.p);
      (m.material as THREE.MeshBasicMaterial).color.set(i === focus ? PALETTE.accent : PALETTE.ink);
    });
  }
}
