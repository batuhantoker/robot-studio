/** Owns the stage and the current assembly; applies teardown state and renders on demand. */
import * as THREE from 'three';
import type { Assembly } from '../../cad/assembly/types';
import { moduleOf } from '../../cad/assembly/types';
import { createStudio } from '../stage/lights';
import { type Post, createPost } from '../stage/post';
import { QualityGovernor, TIERS, type Tier } from '../stage/quality';
import { type Grounding, groundRobot } from './floor-lift';
import { renderFrame } from './render-frame';
import { type Stage, createStage } from '../stage/renderer';
import { Cutaway } from '../teardown/cutaway';
import { explodeParts } from '../teardown/explode';
import type { Look } from '../look/types';
import type { Cut } from '../teardown/materials';

export interface TeardownView {
  cut: Cut;
  look: Look;
  explode: number;
  isolate: string | null;
}

export class Viewport {
  readonly stage: Stage;
  private readonly studio = createStudio();
  private assembly: Assembly | null = null;
  private cutaway: Cutaway | null = null;
  readonly overlay = new THREE.Group();
  private readonly holder = new THREE.Group();
  private readonly post: Post;
  private tier: Tier = TIERS[0];
  private readonly governor = new QualityGovernor((t) => {
    this.tier = t;
    this.studio.setShadowSize(t.shadowSize);
  });
  private floorZ = 0;
  private grounding: Grounding = 'bolted';
  private last = performance.now();
  private view: TeardownView = { cut: 'solid', look: 'studio', explode: 0, isolate: null };
  private readonly listeners: (() => void)[] = [];

  constructor(host: HTMLElement) {
    this.stage = createStage(host);
    this.stage.scene.add(this.studio.group);
    // Overlays ride with the robot so markers stay on it when a floating base settles.
    this.holder.add(this.overlay);
    this.stage.root.add(this.holder);
    this.post = createPost(this.stage.renderer, this.stage.scene, this.stage.camera, [this.overlay]);
    this.stage.renderer.setAnimationLoop(() => this.tick());
  }

  onFrame(fn: () => void): void {
    this.listeners.push(fn);
  }

  setAssembly(assembly: Assembly, grounding: Grounding = 'bolted'): void {
    this.grounding = grounding;
    if (this.assembly) {
      this.holder.remove(this.assembly.root);
      this.cutaway?.dispose();
    }
    this.assembly = assembly;
    this.holder.add(assembly.root);
    this.cutaway = new Cutaway(assembly.root, assembly.kind);
    this.applyView(this.view);
  }

  /** Bounding radius of the assembly as currently posed. */
  radius(): number {
    if (!this.assembly) return 0.5;
    return new THREE.Box3().setFromObject(this.assembly.root).getBoundingSphere(new THREE.Sphere()).radius || 0.5;
  }

  /** Frame the camera on an arbitrary box (e.g. a workspace envelope) plus the robot. */
  fitBox(box: THREE.Box3): void {
    if (!this.assembly || box.isEmpty()) return;
    box.union(new THREE.Box3().setFromObject(this.assembly.root));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.stage.frame(sphere.radius, sphere.center);
  }

  /** Frame the camera on the assembly as currently posed. */
  fit(): void {
    if (!this.assembly) return;
    const box = new THREE.Box3().setFromObject(this.assembly.root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.floorZ = this.grounding === 'settle' ? 0 : Math.min(this.assembly.floorZ, box.min.z);
    this.studio.fit(sphere.radius, this.floorZ);
    this.stage.frame(sphere.radius, sphere.center);
  }

  applyView(view: TeardownView): void {
    this.view = view;
    if (!this.assembly || !this.cutaway) return;
    this.cutaway.apply(view.cut, view.isolate, view.look);
    explodeParts(this.assembly.root, view.explode, view.isolate, moduleOf);
  }

  /** Briefly paint a part in the accent so it can be found on the model. */
  flash(o: THREE.Object3D): void {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material;
    mesh.material = new THREE.MeshBasicMaterial({ color: '#d6182b', depthTest: false, transparent: true, opacity: 0.9 });
    mesh.renderOrder = 30;
    window.setTimeout(() => {
      (mesh.material as THREE.Material).dispose();
      mesh.material = original;
      mesh.renderOrder = 0;
      this.applyView(this.view);
    }, 1100);
  }

  /** Module id under a canvas pixel, for click-to-isolate. */
  pick(x: number, y: number): string | null {
    if (!this.assembly) return null;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.stage.camera);
    const hit = ray.intersectObject(this.assembly.root, true).find((h) => (h.object as THREE.Mesh).visible);
    return hit ? moduleOf(hit.object) : null;
  }

  private tick(): void {
    for (const fn of this.listeners) fn();
    if (this.view.cut === 'section' && this.cutaway) {
      this.cutaway.aim(this.stage.controls.target, this.stage.camera);
    }
    if (this.assembly) groundRobot(this.holder, this.assembly.root, this.floorZ, this.grounding, this.view.explode > 0.001);
    this.post.setClipping(this.view.cut === 'section' && this.cutaway ? [this.cutaway.plane] : null);
    this.stage.controls.update();
    renderFrame(this.stage, this.post, this.tier, this.view.cut === 'glass' || !!this.view.isolate);
    const now = performance.now();
    this.governor.frame(now - this.last);
    this.last = now;
  }
}
