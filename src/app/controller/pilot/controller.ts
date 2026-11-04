/**
 * Pilot: drive the active robot with WASD and the mouse at speeds its legs or wheels allow. The robot
 * stays at the origin and the world moves under it; the camera rides behind it or looks out from it.
 */
import * as THREE from 'three';
import { type Vec3, add, norm, scale } from '../../../core/math/linear/vec';
import { type Command, STILL, Stepper, advanceBase, fitCommand, wheelState } from '../../../core/motion/locomotion';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import { type IkTarget, solveWholeBody } from '../../../core/solvers/ik/multi';
import type { Prop } from '../../../scene/stage/environment';
import { bodyFor } from '../../robots/body';
import type { RobotSession } from '../../robots/session';
import type { Studio } from '../studio';
import { type HandAction, blendOf, handActions } from './actions';
import { Hands, type Side } from './hands';
import { PilotInput } from './input';
import { type PilotRig, pilotRig } from './rig';

export type PilotCamera = 'chase' | 'pov';

/** The studio lens is a narrow 32°; looking out needs a driver's field of view. */
const POV_FOV = 66;

const approach = (v: number, to: number, step: number) => (Math.abs(to - v) <= step ? to : v + Math.sign(to - v) * step);

export class PilotController {
  camera: PilotCamera = 'chase';
  /** Base pose in the world, and the command as eased toward the keys. */
  pose = { x: 0, y: 0, yaw: 0 };
  cmd: Command = { ...STILL };
  /** Milliseconds the last step took, for keeping an eye on the frame budget. */
  cost = 0;
  /** When scenery last stood in the way of the commanded motion (ms). */
  private blockedAt = -Infinity;
  private hands: ReturnType<typeof handActions> = null;
  private act: { action: HandAction; t: number } | null = null;
  /** Hands driven directly (humanoids): targets nudged by keys or the pad, and a grip. */
  private handCtl: Hands | null = null;
  /** What each hand holds, riding a group kept on that hand's frame. */
  private readonly held: [Prop | null, Prop | null] = [null, null];
  private readonly grasps: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  /** Ground radius the body sweeps, and its height, for stopping short of scenery. */
  private footprint = 0.3;
  private height = 1;
  private rig: PilotRig | null = null;
  private rigFor: RobotSession | null = null;
  private stepper: Stepper | null = null;
  private q: number[] = [];
  private spun: number[] = [];
  private steerIn = 0;
  /** Yaw still asked for by the mouse (rad), and the look-out camera's tilt. */
  private pending = 0;
  private pitch = -0.4;
  private eye: Vec3 = [0, 0, 1];
  private saved: { position: THREE.Vector3; target: THREE.Vector3; near: number; fov: number } | null = null;
  private readonly input: PilotInput;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly studio: Studio) {
    const { store, viewport } = studio;
    this.input = new PilotInput(viewport.canvas, () => store.state.mode === 'pilot' && !!this.rig, () => this.toggleCamera(), () => this.camera === 'pov',
      (n) => { const a = this.actions()[n - 1]; if (a) this.play(a.id); }, (code) => this.press(code));
    store.on(['mode'], (s) => (s.mode === 'pilot' ? this.enter() : this.exit()));
    store.on(['sessionVersion'], (s) => {
      this.exit();
      if (s.mode !== 'pilot') return;
      if (this.available()) this.enter();
      else store.set({ mode: 'pose' });
    });
  }

  onChange = (fn: () => void) => void this.listeners.push(fn);

  /** Held a moment past the last block: creeping up to an edge would otherwise flicker it. */
  get blocked(): boolean {
    return performance.now() - this.blockedAt < 400;
  }

  /** Legs or wheels to move on; flying robots and fixed arms have neither. */
  available(): boolean {
    const s = this.studio.session;
    if (!s || s.category === 'aerial') return false;
    const parts = bodyFor(s).parts;
    return parts.filter((p) => p.kind === 'leg').length >= 2 || parts.filter((p) => p.kind === 'wheel').length >= 2;
  }

  kind(): 'legs' | 'wheels' | null {
    return this.rig?.drive.kind ?? null;
  }

  speed(): number {
    return Math.hypot(this.cmd.forward, this.cmd.lateral);
  }

  /** Hand moves on offer while piloting (humanoids). */
  actions(): HandAction[] {
    return this.hands?.actions ?? [];
  }

  playing(): string | null {
    return this.act?.action.id ?? null;
  }

  /** The hand the controls move, whether it grips, and whether the hands are off their swing. */
  handState(): { side: Side; closed: boolean; fingers: boolean; holding: string | null; moved: boolean } | null {
    const h = this.handCtl;
    return h && { side: h.side, closed: h.closed[h.side], fingers: h.hasFingers(h.side), holding: this.held[h.side]?.label ?? null, moved: !!(h.targets[0] || h.targets[1]) };
  }

  setHand(side: Side): void {
    if (!this.handCtl) return;
    this.handCtl.side = side;
    this.listeners.forEach((fn) => fn());
  }

  toggleGrip(): void {
    const h = this.handCtl, s = this.studio.session;
    if (!h || !s) return;
    const side = h.side;
    h.closed[side] = !h.closed[side];
    if (h.closed[side]) this.grab(s, side);
    else this.letGo(side);
    this.listeners.forEach((fn) => fn());
  }

  /** Close on the loose object nearest the hand, if one is within a hand's span of it. */
  private grab(s: RobotSession, side: Side): void {
    const h = this.handCtl!;
    this.followHands(s);
    const at = this.studio.viewport.overlay.localToWorld(new THREE.Vector3(...h.tip(this.q, side)));
    const prop = this.studio.viewport.props().near(at, 0.25 * h.arm(side).length);
    if (!prop) return;
    this.studio.viewport.props().take(prop, this.grasps[side]);
    this.held[side] = prop;
  }

  private letGo(side: Side): void {
    const prop = this.held[side];
    if (!prop) return;
    this.held[side] = null;
    this.studio.viewport.props().put(prop);
  }

  /** Keep each grasp group on its hand's frame (robot frame, so it rides the robot as the world moves). */
  private followHands(s: RobotSession): void {
    const h = this.handCtl;
    if (!h) return;
    for (const side of [0, 1] as Side[]) {
      const g = this.grasps[side];
      if (g.parent !== this.studio.viewport.overlay) this.studio.viewport.overlay.add(g);
      const l = s.limbs[h.limb(side)], T = chainFrames(l.chain, limbQ(l, this.q)).tip, R = T.R;
      g.matrix.set(R[0], R[1], R[2], T.p[0], R[3], R[4], R[5], T.p[1], R[6], R[7], R[8], T.p[2], 0, 0, 0, 1);
      g.matrix.decompose(g.position, g.quaternion, g.scale);
      g.updateMatrixWorld(true);
    }
  }

  restHands(): void {
    this.handCtl?.reset();
    this.listeners.forEach((fn) => fn());
  }

  /** Touch driving: the stick (x right, y forward), side step (+1 left), and running. */
  steer(x: number, y: number): void {
    this.input.stick = { x, y };
  }

  sideStep(v: number): void {
    this.input.side = v;
  }

  get running(): boolean {
    return this.input.run;
  }

  set running(on: boolean) {
    this.input.run = on;
    this.listeners.forEach((fn) => fn());
  }

  /** Hold an on-screen hand button: (forward, left, up), or null to let go. */
  nudge(dir: [number, number, number] | null): void {
    this.input.pad = dir ?? [0, 0, 0];
  }

  private press(code: string): void {
    if (code === 'Tab' && this.handCtl) this.setHand(this.handCtl.side === 0 ? 1 : 0);
    if (code === 'Space') this.toggleGrip();
    if (code === 'KeyR') this.restHands();
  }

  play(id: string): void {
    const action = this.actions().find((a) => a.id === id);
    if (!action) return;
    this.act = { action, t: 0 };
    this.listeners.forEach((fn) => fn());
  }

  toggleCamera(): void {
    this.camera = this.camera === 'chase' ? 'pov' : 'chase';
    if (this.camera === 'chase') {
      this.input.release();
      this.chase();
    }
    this.listeners.forEach((fn) => fn());
  }

  private enter(): void {
    const s = this.studio.session;
    if (!s || !this.available()) return;
    if (this.rigFor !== s) {
      // The world floor sits at the assembly's resting floor, not at z = 0.
      const ground = this.studio.viewport.overlay.worldToLocal(new THREE.Vector3(0, 0, s.assembly.floorZ)).z;
      this.rig = pilotRig(s, bodyFor(s), ground);
      this.rigFor = s;
    }
    const rig = this.rig;
    if (!rig) return;
    this.pose = { x: 0, y: 0, yaw: 0 };
    this.cmd = { ...STILL };
    this.pending = this.steerIn = 0;
    // Looking a little down frames the ground ahead and the hands, not the empty studio horizon.
    this.pitch = s.category === 'humanoid' ? -0.7 : -0.32;
    this.q = [...rig.ready];
    this.spun = rig.drive.kind === 'wheels' ? rig.drive.wheels.map(() => 0) : [];
    this.stepper = rig.drive.kind === 'legs' ? new Stepper(rig.drive.gait) : null;
    this.hands = s.category === 'humanoid' && rig.drive.kind === 'legs' ? handActions(s, rig.ready, bodyFor(s)) : null;
    this.handCtl = this.hands ? new Hands(s, rig.ready, this.hands.frame, bodyFor(s)) : null;
    this.act = null;
    this.blockedAt = -Infinity;
    this.footprint = this.measureFootprint(s, rig);
    const { camera, controls } = this.studio.viewport.stage;
    this.saved ??= { position: camera.position.clone(), target: controls.target.clone(), near: camera.near, fov: camera.fov };
    this.measureEye(s);
    if (this.camera === 'chase') this.chase();
    this.listeners.forEach((fn) => fn());
  }

  private exit(): void {
    this.input.release();
    // Set down what the hands hold while the world is still where they carried it to.
    this.letGo(0);
    this.letGo(1);
    if (this.handCtl) this.handCtl.closed[0] = this.handCtl.closed[1] = false;
    this.studio.viewport.setWorldShift(0, 0, 0);
    this.pose = { x: 0, y: 0, yaw: 0 };
    this.cmd = { ...STILL };
    const { camera, controls } = this.studio.viewport.stage;
    controls.enabled = true;
    if (this.saved) {
      camera.position.copy(this.saved.position);
      controls.target.copy(this.saved.target);
      camera.near = this.saved.near;
      camera.fov = this.saved.fov;
      camera.updateProjectionMatrix();
      this.saved = null;
    }
    this.listeners.forEach((fn) => fn());
  }

  /** The joint pose for this frame; also moves the world and, looking out, the camera. */
  step(s: RobotSession, dt: number): number[] | null {
    const rig = this.rig;
    if (!rig || this.rigFor !== s || this.q.length !== s.joints.length) return null;
    const t0 = performance.now();
    const look = this.input.takeLook();
    if (this.camera === 'pov') {
      this.pending -= look.x * 0.0025;
      this.pitch = Math.min(Math.max(this.pitch - look.y * 0.0025, -1.1), 0.8);
    }
    const pace = this.input.fast ? 1 : 0.55;
    const turnIn = Math.min(Math.max(this.input.axis('KeyA', 'KeyD') + this.pending / 0.25, -1), 1);
    const accel = (rig.topSpeed / 0.6) * dt;
    const forward = approach(this.cmd.forward, this.input.axis('KeyW', 'KeyS') * rig.topSpeed * pace, accel);
    let cmd: Command;
    if (rig.drive.kind === 'legs') {
      const lateral = approach(this.cmd.lateral, this.input.axis('KeyQ', 'KeyE') * 0.5 * rig.topSpeed * pace, accel);
      const turn = approach(this.cmd.turn, turnIn * rig.topTurn * pace, (rig.topTurn / 0.4) * dt);
      cmd = this.clear(s, rig, fitCommand(rig.drive.gait, { forward, lateral, turn }));
      this.legs(s, rig, cmd, dt);
    } else {
      this.steerIn = approach(this.steerIn, turnIn, 2.5 * dt);
      const curvature = this.steerIn * rig.drive.curvature;
      const free = this.clear(s, rig, { forward, lateral: 0, turn: 0 }).forward;
      const turn = rig.drive.curvature > 0 ? free * curvature : this.steerIn * rig.topTurn;
      cmd = { forward: free, lateral: 0, turn };
      this.wheels(rig, free, curvature, turn, dt);
    }
    this.cmd = cmd;
    this.pending = Math.abs(this.pending) < 1e-3 ? 0 : this.pending - cmd.turn * dt;
    this.pose = advanceBase(this.pose, cmd, rig.forward, dt);
    this.studio.viewport.setWorldShift(this.pose.x, this.pose.y, this.pose.yaw);
    if (this.camera === 'pov') this.lookOut(rig);
    this.cost = performance.now() - t0;
    return this.q;
  }

  private legs(s: RobotSession, rig: PilotRig, cmd: Command, dt: number): void {
    const drive = rig.drive;
    if (drive.kind !== 'legs' || !this.stepper) return;
    const was = this.stepper.walking;
    const feet = this.stepper.step(cmd, dt);
    const act = this.act;
    if (act && (act.t += dt) >= act.action.period) {
      this.act = null;
      this.listeners.forEach((fn) => fn());
    }
    const ctl = this.handCtl, nudge = this.input.hand();
    if (ctl && (nudge[0] || nudge[1] || nudge[2])) {
      ctl.move(this.q, nudge, dt, this.input.fast ? 0.45 : 0.22);
      // Taking a hand over ends a canned move.
      if (act && act.t > 0.2) this.act = null;
    }
    const steering = !!ctl && (!!ctl.targets[0] || !!ctl.targets[1] || ctl.grip[0] !== +ctl.closed[0] || ctl.grip[1] !== +ctl.closed[1]);
    if (!was && !this.stepper.walking && !act && !steering) return;
    const targets: IkTarget[] = drive.legs.map((limb, i) => ({ limb, point: feet[i], level: drive.level[i] }));
    const u = act ? Math.min(act.t / act.action.period, 1) : 0;
    const moves = act ? act.action.at(u) : null;
    const k = act ? blendOf(u) : 0;
    for (const a of drive.arms) {
      const f = feet[a.leg], h = drive.gait.legs[a.leg].home, fw = rig.forward;
      // Arms swing with the opposite leg, as a walker's do.
      const swing = 0.6 * ((f[0] - h[0]) * fw[0] + (f[1] - h[1]) * fw[1]);
      const free: Vec3 = [a.home[0] + fw[0] * swing, a.home[1] + fw[1] * swing, a.home[2]];
      const hand = a.limb === this.hands?.frame.left.limb ? 0 : a.limb === this.hands?.frame.right.limb ? 1 : null;
      const move = this.act && moves && hand !== null ? moves[hand] : null;
      const own = hand !== null ? ctl?.targets[hand] : null;
      targets.push({ limb: a.limb, point: own ?? (move ? add(scale(free, 1 - k), scale(move, k)) : free) });
    }
    // The torso holds still while the hands work, as in the presets; fingers follow the grip, not the IK.
    const working = !!this.act || !!ctl?.targets[0] || !!ctl?.targets[1];
    const fixed = new Set([...(working && this.hands ? this.hands.frame.shared : []), ...(ctl?.fingerJoints() ?? [])]);
    this.q = solveWholeBody(s.limbs, s.joints, targets, this.q, { restarts: 0, maxIter: working ? 10 : 6, tol: 5e-5, fixed }).q;
    if (ctl) {
      this.q = ctl.fingers(this.q, dt);
      this.followHands(s);
    }
  }

  private wheels(rig: PilotRig, v: number, curvature: number, turn: number, dt: number): void {
    const drive = rig.drive;
    if (drive.kind !== 'wheels') return;
    const w = wheelState(drive.wheels, rig.forward, v, curvature, turn);
    const q = [...this.q];
    drive.wheels.forEach((wheel, i) => {
      this.spun[i] += w.rate[i] * dt;
      q[wheel.spin] = rig.ready[wheel.spin] + wheel.spinSign * this.spun[i];
      if (wheel.steer !== null) q[wheel.steer] = rig.ready[wheel.steer] + wheel.steerSign * w.steer[i];
    });
    this.q = q;
  }

  /**
   * Hold back motion that would run the body into scenery: anything standing taller than a step within the
   * footprint ahead (a bench, a belt, a shelf), or a wall or machine side the body would meet. Turning stays free.
   */
  private clear(s: RobotSession, rig: PilotRig, cmd: Command): Command {
    const left: Vec3 = [-rig.forward[1], rig.forward[0], 0];
    const v = add(scale(rig.forward, cmd.forward), scale(left, cmd.lateral)), speed = norm(v);
    if (speed < 1e-4 || !this.obstructed(s, scale(v, 1 / speed), this.footprint + 0.25 * speed + 0.02)) return cmd;
    this.blockedAt = performance.now();
    return { ...cmd, forward: 0, lateral: 0 };
  }

  private obstructed(s: RobotSession, dir: Vec3, reach: number): boolean {
    const { viewport } = this.studio;
    const floor = s.assembly.floorZ, step = Math.min(0.1, 0.1 * this.height);
    for (const a of [-0.5, 0, 0.5]) {
      const [c, n] = [Math.cos(a), Math.sin(a)];
      const d = [c * dir[0] - n * dir[1], n * dir[0] + c * dir[1]];
      if (viewport.supportBelow(d[0] * reach, d[1] * reach, floor + this.height) > floor + step) return true;
    }
    for (const h of [0.2, 0.5, 0.8]) {
      const hit = viewport.sceneryHit(new THREE.Ray(new THREE.Vector3(0, 0, floor + h * this.height), new THREE.Vector3(dir[0], dir[1], 0)));
      if (hit && Math.hypot(hit.point.x, hit.point.y) < reach) return true;
    }
    return false;
  }

  /** How far from its centre the robot meets the ground: feet or wheels, plus a toe or a tyre. */
  private measureFootprint(s: RobotSession, rig: PilotRig): number {
    const parts = bodyFor(s).parts.filter((p) => p.kind === (rig.drive.kind === 'legs' ? 'leg' : 'wheel'));
    const far = Math.max(...parts.map((p) => Math.hypot(p.role.tip[0], p.role.tip[1])), 0.05);
    return far + 0.08 * this.height;
  }

  /** A point on the robot to look out from: a humanoid's eyes, else above the front of the body. */
  private measureEye(s: RobotSession): void {
    const { overlay } = this.studio.viewport;
    const box = new THREE.Box3().setFromObject(s.assembly.root);
    const origin = overlay.localToWorld(new THREE.Vector3());
    const f = this.rig!.forward;
    const ground = overlay.worldToLocal(new THREE.Vector3(0, 0, s.assembly.floorZ)).z;
    const top = box.max.z - origin.z, height = Math.max(top - ground, 0.05);
    this.height = height;
    const front = Math.max(...[box.min, box.max].flatMap((a) => [box.min, box.max].map((b) => f[0] * (a.x - origin.x) + f[1] * (b.y - origin.y))));
    if (s.category !== 'humanoid') {
      this.eye = [f[0] * 0.5 * front, f[1] * 0.5 * front, top + 0.04 * height];
      return;
    }
    // Just in front of the face: CAD shells are often double-sided, and from inside one the view is a white wall.
    const z = top - 0.07 * height, dir = new THREE.Vector3(...f);
    const from = new THREE.Vector3(f[0] * 2 * height, f[1] * 2 * height, z).add(origin);
    const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
    const hit = new THREE.Raycaster(from, dir.clone().negate()).intersectObject(s.assembly.root, true).find((h) => shown(h.object));
    const face = hit ? hit.point.sub(origin).dot(dir) : 0.08 * height;
    const ahead = face + 0.03 * height;
    this.eye = [f[0] * ahead, f[1] * ahead, z];
  }

  private chase(): void {
    const s = this.studio.session, rig = this.rig;
    if (!s || !rig) return;
    const { camera, controls } = this.studio.viewport.stage;
    controls.enabled = true;
    const sphere = new THREE.Box3().setFromObject(s.assembly.root).getBoundingSphere(new THREE.Sphere());
    if (this.saved) [camera.near, camera.fov] = [this.saved.near, this.saved.fov];
    const f = new THREE.Vector3(...rig.forward);
    // Far enough back that the whole robot and the ground ahead fit the narrow studio lens.
    const back = (1.15 * sphere.radius) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
    controls.target.copy(sphere.center).addScaledVector(f, 0.5 * sphere.radius);
    camera.position.copy(sphere.center).addScaledVector(f, -0.88 * back).add(new THREE.Vector3(0, 0, 0.42 * back));
    camera.updateProjectionMatrix();
    controls.update();
  }

  private lookOut(rig: PilotRig): void {
    const { camera, controls } = this.studio.viewport.stage;
    controls.enabled = false;
    const eye = this.studio.viewport.overlay.localToWorld(new THREE.Vector3(...this.eye));
    const f = rig.forward, c = Math.cos(this.pitch);
    camera.position.copy(eye);
    controls.target.set(eye.x + f[0] * c, eye.y + f[1] * c, eye.z + Math.sin(this.pitch));
    if (camera.near > 0.01 || camera.fov !== POV_FOV) {
      camera.near = 0.01;
      camera.fov = POV_FOV;
      camera.updateProjectionMatrix();
    }
  }
}
