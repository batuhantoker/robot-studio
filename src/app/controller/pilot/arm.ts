/**
 * Pilot on a fixed arm: the tool itself is what you drive. Drag it on the stage, or jog it with the keys or the
 * stick relative to the camera; the joints follow at their own pace and stop at limits, reach, scenery and contact.
 */
import * as THREE from 'three';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { enforceLimits } from '../../../core/chain/limbs/limits';
import { limbQ } from '../../../core/chain/limbs/types';
import { type Mat3, matMul, matVec, rodrigues } from '../../../core/math/linear/mat3';
import { applyTransform } from '../../../core/math/linear/transform';
import { type Vec3, add, cross, dot, norm, normalize, scale, sub } from '../../../core/math/linear/vec';
import { rotationError } from '../../../core/motion/stepping/limb-pose';
import { isPendulum } from '../../../core/robot/config/pendulum';
import { type Stop, servo } from '../../../core/solvers/ik/servo';
import { ToolHandle } from '../../../scene/overlays/tool-handle';
import type { Prop } from '../../../scene/stage/environment';
import { jog } from '../../collision/jog';
import { bodyFor } from '../../robots/body';
import type { RobotSession } from '../../robots/session';
import type { Studio } from '../studio';
import { toolLimb } from '../task/setup';
import type { PilotInput } from './input';

/** Screen distance from the tool at which a press grabs it (px). */
const GRAB_PX = 44;
const GRAB_TOUCH_PX = 64;
/** Joint rate (rad/s), when asked gently and when hurried or dragged. */
const RATE = 1.1;
const FAST_RATE = 2.2;
/** Jog speed as a share of the arm's length per second, and how quickly it gets there (s). */
const JOG = 0.17;
const FAST_JOG = 0.45;
const EASE = 0.15;
/** Depth moved per wheel unit, and per pixel of a Shift-drag, as shares of the arm's length. */
const WHEEL = 0.0005;
const SHIFT_DRAG = 0.003;
/** A stop stays on the bar this long, so creeping along an edge does not flicker it (ms). */
const STOP_MS = 500;
/** How far the working end stays off a surface (m). */
const SURFACE = 0.003;
/** Seconds the jaws take from fully open to shut. */
const JAWS = 0.6;
/** What the Pilot bar covers of the stage's foot (px). */
const DOCK = 84;
/** Radius framed round the base, as a share of the arm's length: most of a table's worth of work. */
const WORK = 0.5;
const DOWN: Vec3 = [0, 0, -1];

export interface ArmState {
  grips: boolean;
  closed: boolean;
  holding: string | null;
  /** Whether the setting has anything loose to pick up. */
  loose: boolean;
  /** Holds the tool's orientation, so it can be pointed. */
  holds: boolean;
  /** Arms to switch between. */
  arms: number;
  stop: string | null;
  dragging: boolean;
}

/** The limb Pilot drives: the focused arm's gripper, else the focused arm, else the first arm. */
export function armLimb(s: RobotSession, focus: number): number {
  const tool = toolLimb(s, focus);
  if (tool !== null && tool !== undefined) return tool;
  const body = bodyFor(s), part = body.partOf[focus];
  const arm = part?.kind === 'arm' ? part : body.parts.find((p) => p.kind === 'arm');
  return arm?.limb ?? s.limbs.findIndex((l) => l.index.length > 0);
}

/** A robot with an arm to steer: hands, pendulums, drones and anything that is not a machine with a tool have none. */
export function drivesArm(s: RobotSession): boolean {
  if (s.prosthesis || s.category === 'aerial' || s.category === 'hand' || s.category === 'other' || isPendulum(s.spec)) return false;
  return bodyFor(s).parts.some((p) => p.kind === 'arm') || (s.category === 'arm' && s.limbs.some((l) => l.index.length > 1));
}

/** The rotation that takes the tool's approach axis straight down, the shortest way round. */
function pointedDown(R: Mat3, approach: Vec3): Mat3 {
  const d = normalize(matVec(R, approach)), axis = cross(d, DOWN), s = norm(axis);
  if (s > 1e-6) return matMul(rodrigues(scale(axis, 1 / s), Math.atan2(s, dot(d, DOWN))), R);
  return dot(d, DOWN) > 0 ? R : matMul(rodrigues([1, 0, 0], Math.PI), R);
}

interface Drag {
  id: number;
  plane: THREE.Plane;
  /** From where the pointer meets the plane to the tool, so a grab never jumps. */
  offset: THREE.Vector3;
  goal: THREE.Vector3;
  y: number;
}

export class ArmPilot {
  private s: RobotSession | null = null;
  private limb = 0;
  private q: number[] = [];
  private point: Vec3 = [0, 0, 0];
  private held = new Set<number>();
  private fingers: { at: number; shut: number; per: number }[] = [];
  private length = 1;
  /** The orientation kept while the tool moves; null short of six joints. */
  private hold: Mat3 | null = null;
  private vel: Vec3 = [0, 0, 0];
  private drag: Drag | null = null;
  /** Depth asked for with the wheel over the tool, used up by the next step (m). */
  private push = 0;
  private homing = false;
  private closed = false;
  private gap = 0;
  private part: Prop | null = null;
  private stopText: string | null = null;
  private stopAt = -Infinity;
  private hover = false;
  private readonly grasp = new THREE.Group();
  private readonly handle = new ToolHandle();
  /** Tool speed (m/s), for the readout. */
  speed = 0;

  constructor(private readonly studio: Studio, private readonly input: PilotInput, private readonly changed: () => void) {
    const canvas = studio.viewport.canvas;
    // Capture: a press on the tool must get here before the orbit controls start turning the camera.
    canvas.addEventListener('pointerdown', (e) => this.press(e), { capture: true });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { capture: true, passive: false });
    addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => this.release(e as PointerEvent));
    studio.store.on(['focus'], (st) => {
      if (this.s && armLimb(this.s, st.focus) !== this.limb) this.seat(this.s);
    });
  }

  get active(): boolean {
    return !!this.s;
  }

  private get rig() {
    return this.s?.rigs[this.limb] ?? null;
  }

  enter(s: RobotSession): void {
    this.s = s;
    this.q = enforceLimits(s.joints, this.studio.store.state.q);
    this.studio.viewport.overlay.add(this.grasp, this.handle.group);
    this.seat(s);
    this.frame(s);
  }

  /** The tool works low and close, right where the bar sits: frame that, clear of the bar. Phones keep their own insets. */
  private frame(s: RobotSession): void {
    const { viewport } = this.studio, l = s.limbs[this.limb], r = WORK * this.length;
    if (!document.documentElement.classList.contains('mobile')) viewport.setInsets(DOCK, 0);
    const b = this.toWorld(chainFrames(l.chain, limbQ(l, this.q)).origins[0]);
    viewport.fitBox(new THREE.Box3(new THREE.Vector3(b.x - r, b.y - r, b.z), new THREE.Vector3(b.x + r, b.y + r, b.z)));
  }

  /** Take up the focused arm from where it stands. */
  private seat(s: RobotSession): void {
    this.letGo();
    this.closed = false;
    this.limb = armLimb(s, this.studio.store.state.focus);
    const l = s.limbs[this.limb], rig = this.rig, body = bodyFor(s);
    this.point = rig ? scale(rig.tool.approach, rig.tool.beyond) : [0, 0, 0];
    this.fingers = (rig?.fingers ?? []).map((g) => ({ ...g, at: s.qposAdr.indexOf(g.adr) })).filter((g) => g.at >= 0);
    const others = body.parts.filter((p) => p.kind === 'arm' && p.limb !== this.limb).flatMap((p) => s.limbs[p.limb].index);
    this.held = new Set([...others, ...this.fingers.map((g) => g.at)]);
    const f = chainFrames(l.chain, limbQ(l, this.q));
    this.length = Math.max(0.05, [...f.origins, f.tip.p].slice(1).reduce((sum, p, i) => sum + norm(sub(p, f.origins[i])), 0));
    this.hold = l.index.filter((i) => !this.held.has(i)).length >= 6 ? f.tip.R : null;
    this.gap = rig?.grip?.rest ?? 0;
    this.vel = [0, 0, 0];
    this.homing = false;
    this.drag = null;
    this.changed();
  }

  /** Stops driving and hands back the pose it left the arm in. */
  exit(): number[] {
    this.letGo();
    this.drag = null;
    this.closed = false;
    this.rig?.grip?.set(this.rig.grip.rest);
    this.handle.group.removeFromParent();
    this.grasp.removeFromParent();
    this.studio.viewport.canvas.style.cursor = '';
    if (!document.documentElement.classList.contains('mobile')) this.studio.viewport.setInsets(0, 0);
    this.hover = false;
    this.s = null;
    return this.q;
  }

  state(): ArmState {
    const s = this.s;
    return {
      grips: !!this.rig?.grip, closed: this.closed, holding: this.part?.label ?? null, loose: this.studio.viewport.props().all().length > 0, holds: !!this.hold,
      arms: s ? bodyFor(s).parts.filter((p) => p.kind === 'arm').length : 0, stop: this.stopped, dragging: !!this.drag,
    };
  }

  get stopped(): string | null {
    return performance.now() - this.stopAt < STOP_MS ? this.stopText : null;
  }

  private tool(q: number[]) {
    const l = this.s!.limbs[this.limb], T = chainFrames(l.chain, limbQ(l, q)).tip;
    return { p: applyTransform(T, this.point), R: T.R, T };
  }

  private toWorld = (p: Vec3) => this.studio.viewport.overlay.localToWorld(new THREE.Vector3(...p));

  private toLocal(v: THREE.Vector3): Vec3 {
    const p = this.studio.viewport.overlay.worldToLocal(v.clone());
    return [p.x, p.y, p.z];
  }

  /** A world direction in the robot's frame. */
  private dirLocal(d: THREE.Vector3): Vec3 {
    return this.toLocal(d.clone().add(this.toWorld([0, 0, 0])));
  }

  private pixels(e: { clientX: number; clientY: number }): number {
    const { camera, renderer } = this.studio.viewport.stage, r = renderer.domElement.getBoundingClientRect();
    const n = this.toWorld(this.tool(this.q).p).project(camera);
    return Math.hypot((n.x * 0.5 + 0.5) * r.width + r.left - e.clientX, (0.5 - n.y * 0.5) * r.height + r.top - e.clientY);
  }

  private grabbable(e: PointerEvent): boolean {
    return this.pixels(e) < (e.pointerType === 'mouse' ? GRAB_PX : GRAB_TOUCH_PX);
  }

  private press(e: PointerEvent): void {
    if (!this.s || e.button !== 0 || !this.grabbable(e)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const { viewport } = this.studio, normal = viewport.stage.camera.getWorldDirection(new THREE.Vector3());
    const at = this.toWorld(this.tool(this.q).p), plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, at);
    const hit = viewport.ray(e.clientX, e.clientY).ray.intersectPlane(plane, new THREE.Vector3()) ?? at.clone();
    this.drag = { id: e.pointerId, plane, offset: at.clone().sub(hit), goal: at, y: e.clientY };
    viewport.canvas.setPointerCapture?.(e.pointerId);
    viewport.canvas.style.cursor = 'grabbing';
    this.homing = false;
    this.changed();
  }

  private deepen(by: number): void {
    const d = this.drag;
    if (!d) return;
    d.goal.addScaledVector(d.plane.normal, by);
    d.plane.setFromNormalAndCoplanarPoint(d.plane.normal, d.goal);
  }

  private move(e: PointerEvent): void {
    if (!this.s) return;
    const d = this.drag;
    if (!d || e.pointerId !== d.id) {
      const over = !d && e.target === this.studio.viewport.canvas && this.grabbable(e);
      if (over !== this.hover) this.studio.viewport.canvas.style.cursor = (this.hover = over) ? 'grab' : '';
      return;
    }
    if (e.shiftKey) this.deepen((d.y - e.clientY) * SHIFT_DRAG * this.length);
    else {
      const hit = this.studio.viewport.ray(e.clientX, e.clientY).ray.intersectPlane(d.plane, new THREE.Vector3());
      if (hit) d.goal.copy(hit).add(d.offset);
    }
    d.y = e.clientY;
  }

  private release(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    this.studio.viewport.canvas.style.cursor = this.hover ? 'grab' : '';
    this.changed();
  }

  private wheel(e: WheelEvent): void {
    if (!this.s || (!this.drag && !this.hover)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const by = -e.deltaY * WHEEL * this.length;
    if (this.drag) this.deepen(by);
    else this.push += by;
  }

  /** Close on the loose part between the jaws, or let go. */
  toggleGrip(): void {
    const grip = this.rig?.grip;
    if (!grip) return;
    this.closed = !this.closed;
    if (!this.closed) this.letGo();
    else {
      this.follow();
      const shelf = this.studio.viewport.props();
      const part = shelf.near(this.toWorld(this.tool(this.q).p), Math.max(0.015, 0.3 * grip.max));
      if (part) {
        shelf.take(part, this.grasp);
        this.part = part;
      }
    }
    this.changed();
  }

  private letGo(): void {
    const part = this.part;
    if (!part) return;
    this.part = null;
    this.studio.viewport.props().put(part);
  }

  /** Back to the robot's home, at the joints' pace. */
  goHome(): void {
    if (this.s) this.homing = true;
  }

  /** Turn the tool to point straight down, where it holds an orientation. */
  pointDown(): void {
    if (this.hold) this.hold = pointedDown(this.tool(this.q).R, this.rig?.tool.approach ?? this.flangeAxis());
  }

  /** A bare flange faces along the last joint's axis, away from the wrist; CAD tip frames agree on nothing else. */
  private flangeAxis(): Vec3 {
    const l = this.s!.limbs[this.limb], f = chainFrames(l.chain, limbQ(l, this.q)), k = f.axes.length - 1, R = f.tip.R;
    const a = dot(f.axes[k], sub(f.tip.p, f.origins[Math.max(k - 1, 0)])) < 0 ? scale(f.axes[k], -1) : f.axes[k];
    return [R[0] * a[0] + R[3] * a[1] + R[6] * a[2], R[1] * a[0] + R[4] * a[1] + R[7] * a[2], R[2] * a[0] + R[5] * a[1] + R[8] * a[2]];
  }

  /** On to the next arm. */
  nextArm(): void {
    const s = this.s;
    if (!s) return;
    const arms = bodyFor(s).parts.filter((p) => p.kind === 'arm');
    if (arms.length < 2) return;
    const next = arms[(arms.findIndex((p) => p.limbs.includes(this.limb)) + 1) % arms.length];
    this.studio.store.set({ focus: next.limb });
  }

  private follow(): void {
    const { R, T } = this.tool(this.q), g = this.grasp;
    g.matrix.set(R[0], R[1], R[2], T.p[0], R[3], R[4], R[5], T.p[1], R[6], R[7], R[8], T.p[2], 0, 0, 0, 1);
    g.matrix.decompose(g.position, g.quaternion, g.scale);
    g.updateMatrixWorld(true);
  }

  /** The keys and the stick as a velocity in the robot's frame: W away from the camera, D to its right, E up. */
  private asked(): Vec3 {
    const { input } = this, cam = this.studio.viewport.stage.camera;
    const look = cam.getWorldDirection(new THREE.Vector3());
    const ahead = look.clone().setZ(0).lengthSq() > 1e-4 ? look.clone().setZ(0).normalize() : new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).setZ(0).normalize();
    const right = new THREE.Vector3().crossVectors(ahead, new THREE.Vector3(0, 0, 1));
    const dir = ahead.multiplyScalar(input.axis('KeyW', 'KeyS')).addScaledVector(right, -input.axis('KeyA', 'KeyD')).add(new THREE.Vector3(0, 0, -input.axis('KeyQ', 'KeyE')));
    return scale(this.dirLocal(dir), (input.fast ? FAST_JOG : JOG) * this.length);
  }

  /** A tool stops at the top of what stands under it, a part it carries by that part's underside; open jaws go down round a loose part. */
  private offScenery(goal: Vec3): { goal: Vec3; met: boolean } {
    const { viewport } = this.studio, w = this.toWorld(goal), from = this.toWorld(this.tool(this.q).p), grip = this.rig?.grip;
    const box = new THREE.Box3();
    const loose = grip && !this.closed ? viewport.props().near(w, 0.3 * grip.max) : null;
    const under = this.part ? Math.max(from.z - box.setFromObject(this.part.object).min.z, 0) : 0;
    const top = (loose ? box.setFromObject(loose.object).min.z : viewport.supportBelow(w.x, w.y, Math.max(from.z, w.z)) + under) + SURFACE;
    if (w.z >= top) return { goal, met: false };
    w.z = top;
    return { goal: this.toLocal(w), met: true };
  }

  private say(text: string): void {
    const was = this.stopped;
    this.stopText = text;
    this.stopAt = performance.now();
    if (was !== text) this.changed();
  }

  private named(stop: NonNullable<Stop>): string {
    return stop.kind === 'limit' ? `${this.s!.joints[stop.joint].name} is at its limit` : 'At the edge of its reach';
  }

  /** The joint pose for this frame. */
  step(s: RobotSession, wall: number): number[] {
    const dt = Math.min(wall, 0.05), rate = this.input.fast || this.drag ? FAST_RATE : RATE;
    const from = this.tool(this.q);
    const want = this.asked(), reach = ((this.input.fast ? FAST_JOG : JOG) * this.length * dt) / EASE;
    const dv = sub(want, this.vel), n = norm(dv);
    this.vel = n <= reach ? want : add(this.vel, scale(dv, reach / n));
    const moving = norm(this.vel) > 1e-5;
    if (moving || this.drag || this.push) this.homing = false;
    let goal: Vec3 | null = this.drag ? this.toLocal(this.drag.goal) : moving ? add(from.p, scale(this.vel, dt)) : null;
    if (this.push) {
      const along = this.dirLocal(this.studio.viewport.stage.camera.getWorldDirection(new THREE.Vector3()));
      goal = add(goal ?? from.p, scale(along, this.push));
      this.push = 0;
    }
    const turning = !!this.hold && norm(rotationError(this.hold, from.R)) > 0.004;
    let to: number[] | null = null, stop: Stop = null, surface = false;
    if (this.homing) to = this.towardHome(s, rate * dt);
    else if (goal || turning) {
      const clear = this.offScenery(goal ?? from.p);
      surface = clear.met;
      const r = servo(s.limbs[this.limb], s.joints, this.q, { p: clear.goal, R: this.hold ?? undefined }, { maxStep: rate * dt, point: this.point, held: this.held, posture: s.home });
      to = r.q;
      stop = r.stop;
    }
    if (to) {
      const moved = jog(s, this.q, to);
      this.q = moved.q;
      if (moved.contact) this.say(`Touching: ${moved.contact}`);
      else if (surface) this.say('Stopped at the surface');
      else if (stop) this.say(this.named(stop));
    }
    this.jaws(dt);
    const now = this.tool(this.q);
    this.speed += (norm(sub(now.p, from.p)) / Math.max(dt, 1e-3) - this.speed) * Math.min(1, 10 * dt);
    this.follow();
    const { camera, renderer } = this.studio.viewport.stage;
    this.handle.place(new THREE.Vector3(...now.p), this.drag ? this.studio.viewport.overlay.worldToLocal(this.drag.goal.clone()) : null, camera, renderer.domElement.clientHeight, !!this.drag || !!this.stopped);
    return this.q;
  }

  private towardHome(s: RobotSession, step: number): number[] {
    const own = s.limbs[this.limb].index, to = [...this.q];
    for (const i of own) if (!this.fingers.some((g) => g.at === i)) to[i] = this.q[i] + Math.min(Math.max(s.home[i] - this.q[i], -step), step);
    if (own.every((i) => Math.abs(to[i] - s.home[i]) < 1e-3 || this.fingers.some((g) => g.at === i))) {
      this.homing = false;
      if (this.hold) this.hold = this.tool(to).R;
    }
    return to;
  }

  private jaws(dt: number): void {
    const grip = this.rig?.grip;
    if (!grip) return;
    const size = this.part ? Math.min(this.part.size[0], this.part.size[1]) : grip.min;
    const to = this.closed ? Math.min(Math.max(size, grip.min), grip.max) : grip.rest, step = ((grip.max - grip.min) / JAWS) * dt;
    this.gap += Math.min(Math.max(to - this.gap, -step), step);
    grip.set(this.gap);
    for (const g of this.fingers) this.q[g.at] = g.shut + g.per * this.gap;
  }
}
