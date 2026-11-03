/** Pick and place pads where objects stand, the reachable spots as faint dots, and a move gizmo with a height arrow. */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { Vec3 } from '../../core/math/linear/vec';
import type { ReachCell } from '../../core/task/reach';
import { PALETTE } from '../stage/palette';
import type { Stage } from '../stage/renderer';

export type Spot = 'pick' | 'place';
const COLOR: Record<Spot, string> = { pick: '#3d8fe0', place: '#2e9d6a' };
// Pulled towards the camera in depth: they win against the floor they lie on, yet the arm still hides them.
const flat = (color: string, opacity: number) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
});

function pad(color: string): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), flat(color, 0.95));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40), flat(color, 0.18));
  ring.renderOrder = 9;
  disc.renderOrder = 8;
  g.add(disc, ring);
  return g;
}

export class TaskPads {
  readonly group = new THREE.Group();
  readonly gizmo: TransformControls;
  private readonly pads: Record<Spot, THREE.Group> = { pick: pad(COLOR.pick), place: pad(COLOR.place) };
  private readonly handle = new THREE.Object3D();
  private dots = new THREE.Group();
  selected: Spot = 'pick';
  /** Height a dragged spot settles at: kept above the floor, and caught by a surface when lowered onto it. */
  limit: (p: Vec3, vertical: boolean) => number = (p) => p[2];

  constructor(stage: Stage, onMove: (spot: Spot, p: Vec3, done: boolean) => void) {
    this.gizmo = new TransformControls(stage.camera, stage.renderer.domElement);
    this.gizmo.setSize(0.6);
    this.gizmo.attach(this.handle);
    this.gizmo.addEventListener('dragging-changed', (e) => {
      const dragging = (e as unknown as { value: boolean }).value;
      stage.controls.enabled = !dragging;
      if (!dragging) onMove(this.selected, this.at(), true);
    });
    this.gizmo.addEventListener('objectChange', () => {
      this.handle.position.z = this.limit(this.at(), !!this.gizmo.axis?.includes('Z'));
      onMove(this.selected, this.at(), false);
    });
    this.group.add(this.dots, this.pads.pick, this.pads.place, this.handle, this.gizmo.getHelper());
  }

  private at = (): Vec3 => [this.handle.position.x, this.handle.position.y, this.handle.position.z];

  /** Each pad lies on its spot's own surface; `bad` marks the spot the plan failed at in the accent colour. */
  setSpots(pick: Vec3 | null, place: Vec3 | null, radius: number, bad: Spot | null): void {
    for (const [spot, p] of [['pick', pick], ['place', place]] as [Spot, Vec3 | null][]) {
      const g = this.pads[spot];
      g.visible = !!p;
      if (p) g.position.set(p[0], p[1], p[2] + radius * 0.01);
      g.scale.setScalar(radius);
      for (const m of g.children as THREE.Mesh[]) (m.material as THREE.MeshBasicMaterial).color.set(spot === bad ? PALETTE.accent : COLOR[spot]);
    }
    const sel = this.selected === 'pick' ? pick : place;
    if (sel && !this.gizmo.dragging) this.handle.position.set(sel[0], sel[1], sel[2]);
  }

  setReach(cells: ReachCell[], size: number): void {
    for (const d of this.dots.children as THREE.InstancedMesh[]) d.geometry.dispose();
    this.dots.clear();
    const ok = cells.filter((c) => c.ok);
    if (!ok.length) return;
    const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(size, 12), flat('#2e9d6a', 0.3), ok.length);
    dots.renderOrder = 7;
    const m = new THREE.Matrix4();
    ok.forEach((c, i) => dots.setMatrixAt(i, m.makeTranslation(c.p[0], c.p[1], c.p[2] + size * 0.05)));
    this.dots.add(dots);
  }

  /** Hidden gizmos still catch drags, so disable with the group; never mid-drag, or the drag never ends. */
  show(on: boolean): void {
    this.group.visible = on;
    if (!this.gizmo.dragging) this.gizmo.enabled = on;
  }
}
