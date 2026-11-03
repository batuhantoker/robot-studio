/** Joint axis lines through each anchor, plus small frame triads; the focused joint in accent. */
import * as THREE from 'three';
import type { ChainFrames } from '../../core/chain/model/types';
import { setFromTransform } from '../../cad/common/orient';
import { PALETTE } from '../stage/palette';

export class AxesOverlay {
  readonly group = new THREE.Group();
  private lines: THREE.Line[] = [];
  private triads: THREE.AxesHelper[] = [];

  rebuild(count: number, scale: number): void {
    this.group.clear();
    this.lines = Array.from({ length: count }, () => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0)]);
      const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: PALETTE.ink, dashSize: 0.06, gapSize: 0.04, depthTest: false, transparent: true, opacity: 0.7 }));
      line.computeLineDistances();
      line.renderOrder = 10;
      line.scale.setScalar(scale * 0.22);
      return line;
    });
    this.triads = Array.from({ length: count + 1 }, () => {
      const t = new THREE.AxesHelper(scale * 0.07);
      (t.material as THREE.Material).depthTest = false;
      t.renderOrder = 11;
      return t;
    });
    this.group.add(...this.lines, ...this.triads);
  }

  update(f: ChainFrames, focus: number): void {
    const y = new THREE.Vector3(0, 1, 0);
    f.axes.forEach((axis, k) => {
      const line = this.lines[k];
      if (!line) return;
      line.position.set(...f.origins[k]);
      line.quaternion.setFromUnitVectors(y, new THREE.Vector3(...axis));
      (line.material as THREE.LineDashedMaterial).color.set(k === focus ? PALETTE.accent : PALETTE.ink);
    });
    [...f.frames, f.tip].forEach((frame, k) => frame && this.triads[k] && setFromTransform(this.triads[k], frame));
  }
}
