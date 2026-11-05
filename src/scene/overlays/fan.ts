/** Runs beside the clip: many as thin translucent bars opening from one, a single one as its tip's fading trace. */
import * as THREE from 'three';
import type { ClipFan } from '../../core/motion/types';

const WIDTH = 0.004;
const MOST = 128;
const TRACE = 240;
const LOOK_BACK = 1 / 60;
/** One hue, dark to light across the fan. */
const RAMP = ['#17365f', '#8fb8e6'];

const spin = new THREE.Object3D();

export class FanOverlay {
  readonly group = new THREE.Group();
  private readonly bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }), 2 * MOST);
  private readonly points = new Float32Array(TRACE * 6);
  private readonly tints = new Float32Array(TRACE * 8);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly trace: THREE.LineSegments;
  private readonly at = new Float32Array(4 * MOST);
  private readonly was = new Float32Array(4);
  private fan: ClipFan | null = null;

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.tints, 4));
    this.trace = new THREE.LineSegments(this.geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
    this.bars.frustumCulled = this.trace.frustumCulled = false;
    this.bars.renderOrder = this.trace.renderOrder = 6;
    this.group.add(this.trace, this.bars);
    this.group.visible = false;
  }

  private start(fan: ClipFan): void {
    const [dark, light] = RAMP.map((c) => new THREE.Color(c)), c = new THREE.Color();
    for (let k = 0; k < fan.count; k++) {
      c.lerpColors(dark, light, k / Math.max(fan.count - 1, 1));
      this.bars.setColorAt(2 * k, c);
      this.bars.setColorAt(2 * k + 1, c);
    }
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
  }

  private bar(i: number, y: number, x0: number, z0: number, x1: number, z1: number): void {
    spin.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    spin.rotation.set(0, Math.atan2(x1 - x0, z1 - z0), 0);
    spin.scale.set(WIDTH, WIDTH, Math.hypot(x1 - x0, z1 - z0));
    spin.updateMatrix();
    this.bars.setMatrixAt(i, spin.matrix);
  }

  private drawBars(fan: ClipFan, t: number): void {
    const n = Math.min(fan.count, MOST), [px, y, pz] = fan.pivot;
    fan.at(t, this.at);
    this.bars.count = 2 * n;
    for (let k = 0; k < n; k++) {
      const [ex, ez, tx, tz] = this.at.subarray(4 * k, 4 * k + 4);
      this.bar(2 * k, y, px, pz, ex, ez);
      this.bar(2 * k + 1, y, ex, ez, tx, tz);
    }
    this.bars.instanceMatrix.needsUpdate = true;
  }

  private drawTrace(fan: ClipFan, t: number): void {
    const y = fan.pivot[1];
    fan.at(t, this.was);
    let seg = 0;
    for (let j = 1; j <= TRACE && t - j * LOOK_BACK >= 0; j++, seg++) {
      fan.at(t - j * LOOK_BACK, this.at);
      const fade = 0.7 * (1 - j / TRACE);
      this.points.set([this.was[2], y, this.was[3], this.at[2], y, this.at[3]], seg * 6);
      this.tints.set([0.84, 0.09, 0.17, fade, 0.84, 0.09, 0.17, fade], seg * 8);
      this.was[2] = this.at[2];
      this.was[3] = this.at[3];
    }
    this.geometry.setDrawRange(0, seg * 2);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  show(fan: ClipFan | null, t: number): void {
    this.group.visible = !!fan;
    if (fan && fan !== this.fan) this.start(fan);
    this.fan = fan;
    if (!fan) return;
    const alone = fan.count === 1;
    this.bars.visible = !alone;
    this.trace.visible = alone;
    if (alone) this.drawTrace(fan, t);
    else this.drawBars(fan, t);
  }
}
