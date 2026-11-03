/** Arrows and a yaw ring that slide and turn one robot of the scene across the floor. */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { Stage } from '../stage/renderer';

export interface Base {
  x: number;
  y: number;
  yaw: number;
}

/**
 * A base moved by a drag measured in the view, whose frame is the active robot's: the offset turns by the
 * active robot's yaw into the stage frame the bases are kept in.
 */
export function movedBase(start: Base, activeYaw: number, dx: number, dy: number, dyaw: number): Base {
  const c = Math.cos(activeYaw), s = Math.sin(activeYaw);
  const yaw = Math.atan2(Math.sin(start.yaw + dyaw), Math.cos(start.yaw + dyaw));
  return { x: start.x + c * dx - s * dy, y: start.y + s * dx + c * dy, yaw };
}

export interface BaseGizmoHooks {
  root(key: string): THREE.Object3D | null;
  /** The drag so far, in the view frame; `done` on release. */
  moved(key: string, dx: number, dy: number, dyaw: number, done: boolean): void;
}

export class BaseGizmo {
  private readonly proxy = new THREE.Object3D();
  private readonly slide: TransformControls;
  private readonly turn: TransformControls;
  private readonly helpers: THREE.Object3D[];
  private start: { x: number; y: number; yaw: number } | null = null;
  private key: string | null = null;

  constructor(stage: Stage, private readonly hooks: BaseGizmoHooks) {
    stage.scene.add(this.proxy);
    this.slide = new TransformControls(stage.camera, stage.renderer.domElement);
    this.slide.showZ = false;
    this.slide.setSize(0.85);
    this.turn = new TransformControls(stage.camera, stage.renderer.domElement);
    this.turn.setMode('rotate');
    this.turn.showX = this.turn.showY = false;
    this.turn.setSize(1.15);
    this.helpers = [this.slide.getHelper(), this.turn.getHelper()];
    for (const g of [this.slide, this.turn]) {
      g.setSpace('world');
      g.attach(this.proxy);
      g.addEventListener('dragging-changed', (e) => {
        const dragging = (e as unknown as { value: boolean }).value;
        stage.controls.enabled = !dragging;
        if (dragging) this.start = { x: this.proxy.position.x, y: this.proxy.position.y, yaw: this.proxy.rotation.z };
        else this.report(true);
      });
      g.addEventListener('objectChange', () => this.report(false));
    }
    stage.scene.add(...this.helpers);
    this.show(null);
  }

  /** Whether a pointer is over, or dragging, one of the handles. */
  get busy(): boolean {
    return !!(this.slide.axis || this.turn.axis || this.slide.dragging || this.turn.dragging);
  }

  /** Put the handles on a robot, or take them away. */
  show(key: string | null): void {
    if (this.slide.dragging || this.turn.dragging) return;
    this.key = key;
    for (const h of this.helpers) h.visible = !!key;
    this.slide.enabled = this.turn.enabled = !!key;
    this.follow();
  }

  /** Keep the handles on the robot between drags (it settles, or the view re-anchors). */
  follow(): void {
    if (!this.key || this.start) return;
    const root = this.hooks.root(this.key);
    if (!root) return;
    root.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    root.matrixWorld.decompose(p, q, new THREE.Vector3());
    this.proxy.position.set(p.x, p.y, p.z);
    this.proxy.rotation.set(0, 0, new THREE.Euler().setFromQuaternion(q, 'ZYX').z);
  }

  private report(done: boolean): void {
    const s = this.start;
    if (!s || !this.key) return;
    const dyaw = this.proxy.rotation.z - s.yaw;
    this.hooks.moved(this.key, this.proxy.position.x - s.x, this.proxy.position.y - s.y, dyaw, done);
    if (done) {
      this.start = null;
      this.follow();
    }
  }
}
