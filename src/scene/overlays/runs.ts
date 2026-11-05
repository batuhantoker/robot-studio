/** Every run a learner tries, as a faint tool path coloured by score: a fan that tightens as it learns. */
import * as THREE from 'three';
import type { Vec3 } from '../../core/math/linear/vec';
import { PALETTE } from '../stage/palette';

/** Runs on show at once; older ones have faded out by then. */
const KEEP = 90;
const MAX_POINTS = 100;
const SEGMENT_VERTS = 2 * (MAX_POINTS - 1);
const PEAK_ALPHA = 0.55;

const bad = new THREE.Color(PALETTE.amber);
const good = new THREE.Color(PALETTE.green);

export const runColor = (score: number): THREE.Color => bad.clone().lerp(good, Math.min(Math.max(score / 90, 0), 1));

interface Slot {
  verts: number;
  color: THREE.Color;
}

export class RunsOverlay {
  readonly group = new THREE.Group();
  private readonly positions = new Float32Array(KEEP * SEGMENT_VERTS * 3);
  private readonly colors = new Float32Array(KEEP * SEGMENT_VERTS * 4);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly slots: (Slot | null)[] = new Array(KEEP).fill(null);
  private next = 0;

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    const lines = new THREE.LineSegments(this.geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    lines.frustumCulled = false;
    this.group.add(lines);
  }

  add(points: Vec3[], score: number): void {
    const n = Math.min(points.length, MAX_POINTS);
    const base = this.next * SEGMENT_VERTS * 3;
    for (let i = 0; i + 1 < n; i++) {
      this.positions.set(points[i], base + i * 6);
      this.positions.set(points[i + 1], base + i * 6 + 3);
    }
    this.slots[this.next] = { verts: 2 * (n - 1), color: runColor(score) };
    this.next = (this.next + 1) % KEEP;
    this.paint();
    this.geometry.attributes.position.needsUpdate = true;
  }

  clear(): void {
    this.slots.fill(null);
    this.next = 0;
    this.paint();
  }

  /** Newest runs brightest; a slot left empty stays fully transparent. */
  private paint(): void {
    this.colors.fill(0);
    this.slots.forEach((slot, i) => {
      if (!slot) return;
      const age = (this.next - 1 - i + KEEP) % KEEP;
      const alpha = PEAK_ALPHA * (1 - age / KEEP) ** 2;
      const { r, g, b } = slot.color;
      for (let v = 0; v < slot.verts; v++) this.colors.set([r, g, b, alpha], (i * SEGMENT_VERTS + v) * 4);
    });
    this.geometry.attributes.color.needsUpdate = true;
  }
}
