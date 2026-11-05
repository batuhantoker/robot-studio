/** Draggable IK target: a ring-and-dot marker with a translate gizmo. */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Vec3 } from '../../core/math/linear/vec';
import { PALETTE } from '../stage/palette';

export class TargetOverlay {
  readonly group = new THREE.Group();
  readonly marker = new THREE.Group();
  readonly gizmo: TransformControls;

  constructor(camera: THREE.Camera, dom: HTMLElement, orbit: OrbitControls, onMove: (p: Vec3) => void) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: PALETTE.accent, depthTest: false }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 48), new THREE.MeshBasicMaterial({ color: PALETTE.accent, depthTest: false }));
    dot.renderOrder = ring.renderOrder = 20;
    this.marker.add(dot, ring);
    this.gizmo = new TransformControls(camera, dom);
    this.gizmo.setSize(0.7);
    this.gizmo.attach(this.marker);
    this.gizmo.addEventListener('dragging-changed', (e) => (orbit.enabled = !(e as unknown as { value: boolean }).value));
    this.gizmo.addEventListener('objectChange', () => onMove([this.marker.position.x, this.marker.position.y, this.marker.position.z]));
    this.group.add(this.marker, this.gizmo.getHelper());
    // Unit-sized until the first robot scales it: shown then, the dot fills the frame.
    this.group.visible = this.gizmo.enabled = false;
  }

  setScale(reach: number): void {
    this.marker.scale.setScalar(reach * 0.008);
  }

  place(p: Vec3): void {
    this.marker.position.set(...p);
  }
}
