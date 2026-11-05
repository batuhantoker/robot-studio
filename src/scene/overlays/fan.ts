/** A fan of pendulums run beside the clip: thin coloured bars, and each tip's fading trace. */
import * as THREE from 'three';
import type { ClipFan } from '../../core/motion/types';

/** In front of the real bars, on their free side. */
const PLANE = -0.034;
const WIDTH = 0.0035;
const MOST = 200;
/** Trace segments across the whole fan, so a big one stays cheap. */
const TRACE = 6000;
const LOOK_BACK = 1 / 60;
/** Frames of trace: one run can show its whole path, a fan only its last moment or it is all scribble. */
const ALONE = 240;
const SHORT = 50;

const spin = new THREE.Object3D();

export class FanOverlay {
  readonly group = new THREE.Group();
  private readonly bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }), 2 * MOST);
  private readonly points = new Float32Array(TRACE * 6);
  private readonly tints = new Float32Array(TRACE * 8);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly at = new Float32Array(4 * MOST);
  private readonly was = new Float32Array(4 * MOST);
  private fan: ClipFan | null = null;

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.tints, 4));
    const trace = new THREE.LineSegments(this.geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
    this.bars.frustumCulled = trace.frustumCulled = false;
    this.bars.renderOrder = trace.renderOrder = 6;
    this.group.add(trace, this.bars);
    this.group.visible = false;
  }

  private start(fan: ClipFan): void {
    const c = new THREE.Color();
    for (let k = 0; k < fan.count; k++) {
      c.setHSL((0.72 * k) / Math.max(fan.count - 1, 1), 0.85, 0.5);
      this.bars.setColorAt(2 * k, c);
      this.bars.setColorAt(2 * k + 1, c);
    }
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
  }

  private bar(i: number, x0: number, z0: number, x1: number, z1: number): void {
    spin.position.set((x0 + x1) / 2, PLANE, (z0 + z1) / 2);
    spin.rotation.set(0, Math.atan2(x1 - x0, z1 - z0), 0);
    spin.scale.set(WIDTH, WIDTH, Math.hypot(x1 - x0, z1 - z0));
    spin.updateMatrix();
    this.bars.setMatrixAt(i, spin.matrix);
  }

  show(fan: ClipFan | null, t: number): void {
    this.group.visible = !!fan;
    if (fan && fan !== this.fan) this.start(fan);
    this.fan = fan;
    if (!fan) return;
    const n = Math.min(fan.count, MOST), alone = n === 1;
    fan.at(t, this.at);
    this.bars.count = alone ? 0 : 2 * n;
    for (let k = 0; k < n && !alone; k++) {
      const [ex, ez, tx, tz] = this.at.subarray(4 * k, 4 * k + 4);
      this.bar(2 * k, fan.pivot[0], fan.pivot[2], ex, ez);
      this.bar(2 * k + 1, ex, ez, tx, tz);
    }
    this.bars.instanceMatrix.needsUpdate = true;
    const steps = alone ? ALONE : Math.max(4, Math.min(Math.floor(TRACE / n), SHORT));
    const tint = new THREE.Color();
    let seg = 0;
    this.was.set(this.at);
    for (let j = 1; j <= steps; j++) {
      const back = t - j * LOOK_BACK;
      if (back < 0) break;
      fan.at(back, this.at);
      const fade = 0.75 * (1 - j / steps);
      for (let k = 0; k < n; k++, seg++) {
        tint.setHSL(alone ? 0.98 : (0.72 * k) / Math.max(n - 1, 1), 0.85, 0.5);
        this.points.set([this.was[4 * k + 2], PLANE, this.was[4 * k + 3], this.at[4 * k + 2], PLANE, this.at[4 * k + 3]], seg * 6);
        this.tints.set([tint.r, tint.g, tint.b, fade, tint.r, tint.g, tint.b, fade], seg * 8);
      }
      this.was.set(this.at);
    }
    this.geometry.setDrawRange(0, seg * 2);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
