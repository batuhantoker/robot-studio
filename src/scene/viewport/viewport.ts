/** Owns the stage, the active robot's assembly and the other robots on the stage; applies teardown state and renders. */
import * as THREE from 'three';
import { ORIGIN, reanchorPoint, relativeBase, sceneRadius, stageBase } from '../../app/scene/frame';
import type { RobotBase } from '../../app/state/types';
import type { Assembly } from '../../cad/assembly/types';
import { moduleOf } from '../../cad/assembly/types';
import { lowestZ, solids } from '../../cad/common/lowest';
import type { PropShelf } from '../stage/environment';
import { createStudio } from '../stage/lights';
import { type Post, createPost } from '../stage/post';
import { QualityGovernor, TIERS, type Tier } from '../stage/quality';
import { GroundContactOverlay } from '../overlays/contact/overlay';
import { type Grounding, groundRobot } from './floor-lift';
import { renderFrame } from './render-frame';
import { type Stage, createStage } from '../stage/renderer';
import { BACKDROP_LAYER } from '../stage/backdrop';
import { BACKDROPS, DEFAULT_SURROUNDINGS, type Surroundings, backdropCss } from '../stage/surroundings';
import type { Stance } from '../stage/scenery/kit';
import { Cutaway } from '../teardown/cutaway';
import { explodeParts } from '../teardown/explode';
import { type Section, type SectionAxis, SectionPlane } from '../teardown/section';
import type { Look } from '../look/types';
import type { Cut } from '../teardown/materials';

export interface TeardownView {
  cut: Cut;
  look: Look;
  explode: number;
  isolate: string | null;
  section: Section;
}

interface Bystander {
  holder: THREE.Group;
  assembly: Assembly;
  cutaway: Cutaway;
  grounding: Grounding;
}

export class Viewport {
  readonly stage: Stage;
  private readonly studio = createStudio();
  private assembly: Assembly | null = null;
  private cutaway: Cutaway | null = null;
  readonly overlay = new THREE.Group();
  private readonly holder = new THREE.Group();
  /** The placement the holder carries. */
  activeKey = 'main';
  /** The other robots, each at its stage base; the group undoes the world shift as the setting does. */
  readonly bystanders = new THREE.Group();
  private readonly others = new Map<string, Bystander>();
  /** The active robot's placement on the stage, and how far Pilot has driven it from there. */
  private anchor: RobotBase = { ...ORIGIN };
  private drive: RobotBase = { ...ORIGIN };
  private readonly post: Post;
  private tier: Tier = TIERS[0];
  private readonly governor = new QualityGovernor((t) => {
    this.tier = t;
    this.studio.setShadowSize(t.shadowSize);
  });
  private floorZ = 0;
  private scale = 0.5;
  private grounding: Grounding = 'bolted';
  /** As the robot describes it: `hand` in its own frame, turned into height above the floor once it is grounded. */
  private stance: Stance | undefined;
  private readonly contacts = new GroundContactOverlay();
  private last = performance.now();
  private clock = performance.now();
  private view: TeardownView = { cut: 'solid', look: 'studio', explode: 0, isolate: null, section: { axis: 'y', offset: 0 } };
  /** World-space section extras: the cutaway's caps and ghost, and the plane's outline. */
  private readonly sectionLayer = new THREE.Group();
  private readonly sectionPlane = new SectionPlane();
  private readonly listeners: ((dt: number) => void)[] = [];
  /** Hidden while ambient occlusion samples the scene. */
  readonly aoHidden: THREE.Object3D[] = [this.overlay, ...this.studio.aoHidden];
  private offline: { width: number; height: number; pixelRatio: number } | null = null;
  private inset = { bottom: 0, left: 0, right: 0 };
  private insetNow = { bottom: 0, left: 0, right: 0 };

  constructor(host: HTMLElement) {
    this.stage = createStage(host);
    this.stage.scene.add(this.studio.group);
    this.stage.camera.layers.enable(BACKDROP_LAYER);
    this.setSurroundings(DEFAULT_SURROUNDINGS);
    // Overlays ride with the robot so markers stay on it when a floating base settles.
    this.holder.add(this.overlay);
    this.overlay.add(this.contacts.group);
    this.stage.root.add(this.holder, this.bystanders);
    this.sectionLayer.add(this.sectionPlane.group);
    this.stage.scene.add(this.sectionLayer);
    this.aoHidden.push(this.sectionLayer);
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

  /** Highest still scenery top under (x, y) at or below `z`, else the floor; for pick and place spots. */
  supportBelow(x: number, y: number, z: number): number {
    return this.studio.supportBelow(x, y, z);
  }

  /** Where a ray first meets still scenery, and whether that is a top (a belt, a bench) a spot can stand on. */
  /** Loose objects in the setting, for hands and grippers to take. */
  props(): PropShelf {
    return this.studio.props;
  }

  sceneryHit(ray: THREE.Ray): { point: THREE.Vector3; top: boolean } | null {
    return this.studio.sceneryHit(ray);
  }

  /**
   * How far the active robot has moved from its placement (m, rad), as Pilot drives it. The robot stays at the
   * origin and everything that belongs to the world (setting, floor pattern, other robots) is drawn the other way.
   */
  setWorldShift(x: number, y: number, yaw: number): void {
    this.drive = { x, y, yaw };
    this.applyShift();
  }

  /** The active robot's placement on the stage. */
  get placement(): RobotBase {
    return this.anchor;
  }

  /** Make `base` the active robot's placement; the camera moves with the frame so the view holds still. */
  setAnchor(base: RobotBase): void {
    const from = stageBase(this.anchor, this.drive);
    this.anchor = { ...base };
    this.drive = { ...ORIGIN };
    const { camera, controls } = this.stage;
    for (const p of [camera.position, controls.target]) [p.x, p.y] = reanchorPoint(from, this.anchor, p.x, p.y);
    controls.update();
    this.holder.position.x = this.holder.position.y = this.holder.rotation.z = 0;
    this.contacts.group.visible = true;
    this.applyShift();
  }

  /** Draw the active robot at `local` (in its own frame) while it is dragged; setAnchor ends the preview. */
  previewActive(local: RobotBase): void {
    this.holder.position.x = local.x;
    this.holder.position.y = local.y;
    this.holder.rotation.z = local.yaw;
    // Contact patches are measured in world xy and drawn in the holder: they'd move twice.
    this.contacts.group.visible = false;
  }

  private applyShift(): void {
    const at = stageBase(this.anchor, this.drive);
    this.studio.shift(at.x, at.y, at.yaw);
    const origin = relativeBase(at, ORIGIN);
    this.bystanders.position.set(origin.x, origin.y, 0);
    this.bystanders.rotation.z = origin.yaw;
    this.bystanders.updateMatrixWorld(true);
  }

  /** Stand a posed robot that isn't driven at its stage base. */
  addBystander(key: string, assembly: Assembly, grounding: Grounding, base: RobotBase): void {
    this.removeBystander(key);
    const holder = new THREE.Group();
    holder.add(assembly.root);
    this.bystanders.add(holder);
    explodeParts(assembly.root, 0, null, moduleOf);
    const cutaway = new Cutaway(assembly.root, assembly.kind);
    cutaway.apply('solid', null, this.view.look);
    this.others.set(key, { holder, assembly, cutaway, grounding });
    this.placeBystander(key, base);
  }

  placeBystander(key: string, base: RobotBase): void {
    const b = this.others.get(key);
    if (!b) return;
    b.holder.position.set(base.x, base.y, 0);
    b.holder.rotation.z = base.yaw;
    this.ground(b);
  }

  removeBystander(key: string): void {
    const b = this.others.get(key);
    if (!b) return;
    b.cutaway.dispose();
    b.holder.remove(b.assembly.root);
    this.bystanders.remove(b.holder);
    this.others.delete(key);
  }

  bystanderKeys(): string[] {
    return [...this.others.keys()];
  }

  /** Stand a bystander on the active robot's floor: bolted ones on their base, settled ones on their lowest point. */
  private ground(b: Bystander): void {
    b.holder.position.z = 0;
    b.holder.updateMatrixWorld(true);
    const low = b.grounding === 'settle' ? lowestZ(solids(b.assembly.root)) : b.assembly.floorZ;
    if (Number.isFinite(low)) b.holder.position.z = this.floorZ - low;
    b.holder.updateMatrixWorld(true);
  }

  /** The placement key of the robot under a canvas pixel, the active one included. */
  robotAt(x: number, y: number): string | null {
    const ray = this.ray(x, y);
    let best: { key: string; d: number } | null = null;
    for (const [key, root] of this.robots()) {
      // Ink outlines are lines, which rays catch from a metre away; only solid meshes count.
      const hit = ray.intersectObject(root, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible);
      if (hit && (!best || hit.distance < best.d)) best = { key, d: hit.distance };
    }
    return best?.key ?? null;
  }

  /** The object that carries a robot's base, for gizmos to follow. */
  robotRoot(key: string): THREE.Object3D | null {
    return key === this.activeKey ? this.holder : this.others.get(key)?.holder ?? null;
  }

  /** Every robot's model, for rays that should stop at robots but not at overlays. */
  robotBodies(): THREE.Object3D[] {
    return this.robots().map(([, root]) => root);
  }

  private robots(): [string, THREE.Object3D][] {
    const list: [string, THREE.Object3D][] = this.assembly ? [[this.activeKey, this.assembly.root]] : [];
    for (const [key, b] of this.others) list.push([key, b.assembly.root]);
    return list;
  }

  /** Frame the camera on every robot on the stage. */
  frameAll(): void {
    const box = new THREE.Box3();
    for (const [, root] of this.robots()) box.expandByObject(root);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // Fit into what panels and sheets leave of the stage; frame() fits the whole canvas.
    const { camera, renderer } = this.stage;
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const v = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const half = (width: number, height: number) => Math.min(Math.atan(v * height / Math.max(h, 1)), Math.atan(v * width / Math.max(h, 1)));
    const free = half(Math.max(1, w - this.inset.left - this.inset.right), Math.max(1, h - this.inset.bottom));
    this.stage.frame(sphere.radius * Math.sin(half(w, h)) / Math.sin(free), sphere.center);
  }

  /** Backdrop (the canvas is transparent over it) and floor, with the light rig to match. */
  setSurroundings(s: Surroundings): void {
    this.studio.apply(s, this.stage.scene);
    this.canvas.style.background = backdropCss(BACKDROPS[s.backdrop]);
  }

  setAssembly(assembly: Assembly, grounding: Grounding = 'bolted', stance?: Stance): void {
    this.grounding = grounding;
    this.stance = stance;
    if (this.assembly) {
      this.holder.remove(this.assembly.root);
      this.cutaway?.dispose();
    }
    this.assembly = assembly;
    this.holder.add(assembly.root);
    this.sectionPlane.measure(assembly.root, this.holder);
    this.cutaway = new Cutaway(assembly.root, assembly.kind);
    this.sectionLayer.add(this.cutaway.section);
    this.applyView(this.view, true);
  }

  /** The section axis that suits the active robot's shape. */
  sectionAxis(): SectionAxis {
    return this.sectionPlane.defaultAxis();
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
    const sphere = this.refitStage();
    if (sphere) this.stage.frame(sphere.radius, sphere.center);
  }

  /** Ground the robots and size the floor, light and setting to the whole stage; returns the active robot's sphere. */
  refitStage(): THREE.Sphere | null {
    if (!this.assembly) return null;
    // A settled robot's assembly floor is its lowest point at home, so it rests there with the holder unmoved.
    this.floorZ = this.assembly.floorZ;
    groundRobot(this.holder, this.assembly.root, this.floorZ, this.grounding, this.view.explode > 0.001);
    this.holder.updateMatrixWorld(true);
    const sphere = new THREE.Box3().setFromObject(this.assembly.root).getBoundingSphere(new THREE.Sphere());
    this.scale = sphere.radius;
    const others = [...this.others.values()].map((b) => {
      this.ground(b);
      const s = new THREE.Box3().setFromObject(b.assembly.root).getBoundingSphere(new THREE.Sphere());
      return { x: s.center.x, y: s.center.y, r: s.radius };
    });
    const st = this.stance && { ...this.stance, hand: this.stance.hand + this.holder.position.z - this.floorZ };
    this.studio.fit(sceneRadius(sphere.radius, others), this.floorZ, st);
    return sphere;
  }

  /** `force` re-applies materials even when cut, isolate and look are unchanged (a new robot, a flash undone). */
  applyView(view: TeardownView, force = false): void {
    const was = this.view;
    if (view.look !== was.look) for (const b of this.others.values()) b.cutaway.apply('solid', null, view.look);
    this.view = view;
    this.sectionPlane.group.visible = view.cut === 'section';
    if (!this.assembly || !this.cutaway) return;
    // Explode and the section's position change every frame on a tour; swapping materials then is wasted work.
    if (force || view.cut !== was.cut || view.isolate !== was.isolate || view.look !== was.look) this.cutaway.apply(view.cut, view.isolate, view.look);
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
      this.applyView(this.view, true);
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
    const hit = this.ray(x, y).intersectObject(this.assembly.root, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible);
    return hit ? moduleOf(hit.object) : null;
  }

  /** Keep the scene centred in what a bottom sheet or side bars leave of the stage; eases like they slide. */
  setInsets(bottom: number, left: number): void {
    this.inset = { ...this.inset, bottom: Math.max(0, bottom), left: Math.max(0, left) };
  }

  /** Room a stage panel takes on the right; separate from setInsets, which the phone layout calls on every change. */
  setPanelInset(right: number): void {
    this.inset = { ...this.inset, right: Math.max(0, right) };
  }

  private applyInset(dt: number): void {
    const k = Math.min(1, dt * 14);
    for (const side of ['bottom', 'left', 'right'] as const) {
      this.insetNow[side] += (this.inset[side] - this.insetNow[side]) * k;
      if (Math.abs(this.inset[side] - this.insetNow[side]) < 0.5) this.insetNow[side] = this.inset[side];
    }
    const { camera, renderer } = this.stage;
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const { bottom, left, right } = this.insetNow;
    // The view window moves half an inset, which centres the scene in the uncovered part.
    if ((bottom > 0 || left > 0 || right > 0) && h > 0) camera.setViewOffset(w, h, (right - left) / 2, bottom / 2, w, h);
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
    this.studio.update(dt);
    if (this.assembly) {
      const solids = groundRobot(this.holder, this.assembly.root, this.floorZ, this.grounding, this.view.explode > 0.001);
      // Solids were measured with the holder at rest, the frame the overlay lives in.
      this.contacts.update(solids, this.floorZ - this.holder.position.z, this.scale);
    }
    const cutting = this.view.cut === 'section' ? this.cutaway : null;
    if (cutting) {
      // Grounding lifted the holder after its last matrix update; the section copies need this frame's.
      this.holder.updateMatrixWorld(true);
      cutting.cutAt(this.sectionPlane.place(this.view.section, this.holder, this.stage.camera));
    }
    this.post.setClipping(cutting ? [cutting.plane] : null);
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
