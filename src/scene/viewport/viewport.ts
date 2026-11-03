/** Owns the stage and the current assembly; applies teardown state and renders on demand. */
import * as THREE from 'three';
import type { Assembly } from '../../cad/assembly/types';
import { moduleOf } from '../../cad/assembly/types';
import { createStudio } from '../stage/lights';
import { type Post, createPost } from '../stage/post';
import { QualityGovernor, TIERS, type Tier } from '../stage/quality';
import { GroundContactOverlay } from '../overlays/contact/overlay';
import { type Grounding, groundRobot } from './floor-lift';
import { renderFrame } from './render-frame';
import { type Stage, createStage } from '../stage/renderer';
import { BACKDROP_LAYER } from '../stage/backdrop';
import { BACKDROPS, DEFAULT_SURROUNDINGS, type Surroundings, backdropCss } from '../stage/surroundings';
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
  private scale = 0.5;
  private grounding: Grounding = 'bolted';
  private readonly contacts = new GroundContactOverlay();
  private last = performance.now();
  private clock = performance.now();
  private view: TeardownView = { cut: 'solid', look: 'studio', explode: 0, isolate: null };
  private readonly listeners: ((dt: number) => void)[] = [];
  /** Hidden while ambient occlusion samples the scene. */
  readonly aoHidden: THREE.Object3D[] = [this.overlay, ...this.studio.aoHidden];
  private offline: { width: number; height: number; pixelRatio: number } | null = null;
  private inset = { bottom: 0, left: 0 };
  private insetNow = { bottom: 0, left: 0 };

  constructor(host: HTMLElement) {
    this.stage = createStage(host);
    this.stage.scene.add(this.studio.group);
    this.stage.camera.layers.enable(BACKDROP_LAYER);
    this.setSurroundings(DEFAULT_SURROUNDINGS);
    // Overlays ride with the robot so markers stay on it when a floating base settles.
    this.holder.add(this.overlay);
    this.overlay.add(this.contacts.group);
    this.stage.root.add(this.holder);
    this.post = createPost(this.stage.renderer, this.stage.scene, this.stage.camera, this.aoHidden);
    this.stage.renderer.setAnimationLoop(() => this.tick());
  }

  /** Runs before each frame is drawn, with the seconds since the last one. */
  onFrame(fn: (dt: number) => void): void {
    this.listeners.push(fn);
  }

  get canvas(): HTMLCanvasElement {
    return this.stage.renderer.domElement;
  }

  /** Backdrop (the canvas is transparent over it) and floor, with the light rig to match. */
  setSurroundings(s: Surroundings): void {
    this.studio.apply(s, this.stage.scene);
    this.canvas.style.background = backdropCss(BACKDROPS[s.backdrop]);
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
    this.floorZ = this.grounding === 'settle' ? 0 : this.assembly.floorZ;
    groundRobot(this.holder, this.assembly.root, this.floorZ, this.grounding, this.view.explode > 0.001);
    this.holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.assembly.root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.scale = sphere.radius;
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

  /** Reframe on `frame` plus the robot, but only when one of `check` is off-screen. */
  keepInView(check: THREE.Vector3[], frame = check): void {
    const off = check.some((p) => {
      const n = p.clone().project(this.stage.camera);
      return Math.abs(n.x) > 0.92 || Math.abs(n.y) > 0.88 || n.z > 1;
    });
    if (off) this.fitBox(new THREE.Box3().setFromPoints(frame));
  }

  /** Camera ray through a client pixel. */
  ray(x: number, y: number): THREE.Raycaster {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.stage.camera);
    return ray;
  }

  /** Module id under a canvas pixel, for click-to-isolate. */
  pick(x: number, y: number): string | null {
    if (!this.assembly) return null;
    const hit = this.ray(x, y).intersectObject(this.assembly.root, true).find((h) => (h.object as THREE.Mesh).visible);
    return hit ? moduleOf(hit.object) : null;
  }

  /** Keep the scene centred in what a bottom sheet or side bars leave of the stage; eases like they slide. */
  setInsets(bottom: number, left: number): void {
    this.inset = { bottom: Math.max(0, bottom), left: Math.max(0, left) };
  }

  private applyInset(dt: number): void {
    const k = Math.min(1, dt * 14);
    for (const side of ['bottom', 'left'] as const) {
      this.insetNow[side] += (this.inset[side] - this.insetNow[side]) * k;
      if (Math.abs(this.inset[side] - this.insetNow[side]) < 0.5) this.insetNow[side] = this.inset[side];
    }
    const { camera, renderer } = this.stage;
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const { bottom, left } = this.insetNow;
    // The view window moves half an inset, which centres the scene in the uncovered part.
    if ((bottom > 0 || left > 0) && h > 0) camera.setViewOffset(w, h, -left / 2, bottom / 2, w, h);
    else if (camera.view?.enabled) camera.clearViewOffset();
  }

  /** Stop the live loop and draw every frame at exactly width × height, with AO and full shadows. */
  beginOffline(width: number, height: number): void {
    if (this.offline) return;
    this.stage.camera.clearViewOffset();
    this.offline = { width, height, pixelRatio: this.stage.renderer.getPixelRatio() };
    this.studio.setShadowSize(TIERS[0].shadowSize);
  }

  /** One offline frame: the clock advances by exactly `dt`; `prepare` runs after the frame's state is set, before drawing. */
  stepOffline(dt: number, prepare?: () => void): void {
    const o = this.offline;
    if (!o) return;
    const { renderer, camera } = this.stage;
    // Re-asserted every frame: a window resize mid-render would otherwise resize the frames.
    if (renderer.getPixelRatio() !== 1) renderer.setPixelRatio(1);
    if (renderer.domElement.width !== o.width || renderer.domElement.height !== o.height) renderer.setSize(o.width, o.height, false);
    camera.aspect = o.width / o.height;
    camera.updateProjectionMatrix();
    this.post.setSize(o.width, o.height, 1);
    this.advance(dt);
    prepare?.();
    if (this.transparentView()) renderer.render(this.stage.scene, camera);
    else this.post.composer.render();
  }

  endOffline(): void {
    const o = this.offline;
    if (!o) return;
    this.offline = null;
    this.stage.renderer.setPixelRatio(o.pixelRatio);
    this.stage.resize();
    this.studio.setShadowSize(this.tier.shadowSize);
    this.clock = this.last = performance.now();
  }

  private transparentView(): boolean {
    // Glass and ghosts are transparent; AO would darken them as if they were solid.
    return this.view.cut === 'glass' || !!this.view.isolate;
  }

  private advance(dt: number): void {
    for (const fn of this.listeners) fn(dt);
    if (this.view.cut === 'section' && this.cutaway) {
      this.cutaway.aim(this.stage.controls.target, this.stage.camera);
    }
    if (this.assembly) {
      const solids = groundRobot(this.holder, this.assembly.root, this.floorZ, this.grounding, this.view.explode > 0.001);
      // Solids were measured with the holder at rest, the frame the overlay lives in.
      this.contacts.update(solids, this.floorZ - this.holder.position.z, this.scale);
    }
    this.post.setClipping(this.view.cut === 'section' && this.cutaway ? [this.cutaway.plane] : null);
    this.stage.controls.update();
  }

  private tick(): void {
    if (this.offline) return;
    const now = performance.now();
    this.advance((now - this.clock) / 1000);
    this.applyInset((now - this.clock) / 1000);
    this.clock = now;
    renderFrame(this.stage, this.post, this.tier, this.transparentView());
    const end = performance.now();
    this.governor.frame(end - this.last);
    this.last = end;
  }
}
