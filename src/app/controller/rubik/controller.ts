/**
 * Dactyl in the studio: a Motion preset that bolts a hand palm up to a wall and solves a scrambled cube with
 * Kociemba's two-phase solution, one top turn or regrip at a time. The Shadow hand was made for it; every other hand
 * tries, and the bar says how close its fingertips came. Only while the preset plays is the hand shown palm up; the
 * model, its collision checks and its floor stay in the upright frame they were built in.
 */
import * as THREE from 'three';
import type { MotionClip, MotionPreset } from '../../../core/motion/types';
import { jointsFor } from '../../../core/prosthesis/motors';
import { moveText } from '../../../core/rubik/cube';
import { solvedPieces } from '../../../core/rubik/pieces';
import { type CubeAt, type SolveClip, solveClip } from '../../../core/rubik/timeline';
import { CubeMesh } from '../../../scene/rubik/cube-mesh';
import { WallMount } from '../../../scene/rubik/mount';
import type { Snapshot } from '../../live/bus';
import type { RobotSession } from '../../robots/session';
import type { Studio } from '../studio';
import { type HandMotion, handMotion } from './fingers';
import { type HandRig, handRig } from './rig';
import { type Solved, SolverClient } from './solver-client';

export const RUBIK_PRESET = 'rubik';

/** Height of the hand's underside above the floor once it is bolted to the wall. */
const RAISED = 0.15;
/** Seconds to lie the hand down or stand it back up. */
const TURN = 0.9;
const ease = (x: number) => x * x * (3 - 2 * x);

const BEAT_TEXT: Record<string, string> = {
  cw: 'turning the top clockwise',
  ccw: 'turning the top counter-clockwise',
  yawL: 'regrip: yaw left',
  yawR: 'regrip: yaw right',
  flipFar: 'regrip: roll the far face up',
  flipNear: 'regrip: roll the near face up',
};

export class RubikController {
  private seed = 1 + Math.floor(Math.random() * 1e6);
  private solved: Solved | null = null;
  private clip: SolveClip | null = null;
  private rigs = new WeakMap<RobotSession, HandRig | null>();
  private motion: { session: RobotSession; hand: HandMotion } | null = null;
  /** The palm-up turn for the hand being laid down. */
  private palmUp = new THREE.Quaternion();
  private readonly solver = new SolverClient();
  private readonly cube = new CubeMesh();
  private readonly mount = new WallMount();
  /** Carries the presentation, so the cube inside it lives in the model frame like the hand. */
  private readonly presented = new THREE.Group();
  private readonly listeners: (() => void)[] = [];
  /** The session that was laid down, so a robot switch can stand it back up. */
  private laid: RobotSession | null = null;
  private lay = 0;
  private settled = false;
  private final = new THREE.Vector3();
  /** Where the hand's back end meets the wall, holder frame, and how big a flange it needs. */
  private readonly base = new THREE.Vector3();
  private baseRadius = 0.05;
  /** The cube's centre at rest once the hand lies down, holder frame. */
  private readonly rest = new THREE.Vector3();
  private camera: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private last: CubeAt | null = null;

  constructor(private readonly studio: Studio) {
    const holder = studio.viewport.overlay.parent!;
    this.presented.add(this.cube.group);
    this.cube.group.matrixAutoUpdate = false;
    holder.add(this.presented, this.mount.group);
    this.presented.visible = this.mount.group.visible = false;
    studio.motion.extras.push((s) => this.presets(s));
    studio.viewport.onFrame((dt) => this.animate(dt));
    studio.bus.on((snap) => this.sync(snap), 1000);
    studio.bus.on(() => this.listeners.forEach((fn) => fn()), 8);
    studio.store.on(['sessionVersion', 'mode', 'motion'], () => this.refresh());
  }

  onChange = (fn: () => void) => void this.listeners.push(fn);

  /** The preset is on screen. */
  active = (): boolean => {
    const s = this.studio.session, st = this.studio.store.state;
    return !!s && st.mode === 'motion' && st.motion.preset === RUBIK_PRESET && !!this.rig(s);
  };

  /** How close this hand's fingertips come to their marks, over the beats solved so far. */
  reach(): string {
    const s = this.studio.session;
    if (!s || this.motion?.session !== s) return '';
    const r = Math.round(this.motion.hand.reach() * 100);
    return `Fingertips on their marks: ${r}%${r < 50 ? ', so the cube is mostly moving by script here' : ''}`;
  }

  newScramble(): void {
    this.seed += 1;
    this.request();
  }

  status(): string {
    if (!this.solved || !this.clip) return 'Solving the scramble…';
    const n = this.solved.solution.length;
    const c = this.last;
    if (!c) return `${n}-move solution`;
    const seg = this.clip.segments[c.segment];
    const kind = seg.beat.kind;
    if (kind === 'scramble') return `Scrambling: ${this.solved.scramble.length} random turns`;
    if (seg.move < 0) return `Scrambled. Kociemba's two-phase solver found ${n} moves`;
    if (seg.move >= n) return `Solved in ${n} moves`;
    return `Move ${seg.move + 1} of ${n} · ${moveText(this.solved.solution[seg.move])} · ${BEAT_TEXT[kind] ?? ''}`;
  }

  private rig(s: RobotSession): HandRig | null {
    if (!this.rigs.has(s)) this.rigs.set(s, handRig(s));
    return this.rigs.get(s)!;
  }

  private presets(s: RobotSession): MotionPreset[] {
    if (!this.rig(s)) return [];
    const clip: MotionClip = {
      get period() {
        return period();
      },
      at: (t) => this.q(s, t),
    };
    const period = () => this.clip?.period ?? 1;
    return [{
      id: RUBIK_PRESET,
      label: 'Rubik’s cube',
      hint: 'Palm up like OpenAI’s Dactyl: solves a scramble with Kociemba’s two-phase algorithm, turning only the top face and regripping between turns. Choreographed: the cube is animated, not simulated, and hands that can’t reach their marks show how far off they are.',
      build: () => clip,
    }];
  }

  private hand(s: RobotSession): HandMotion {
    if (this.motion?.session !== s) this.motion = { session: s, hand: handMotion(this.rig(s)!) };
    return this.motion.hand;
  }

  private q(s: RobotSession, t: number): number[] {
    const hand = this.hand(s);
    const c = this.clip?.at(t);
    const u = c ? hand.at(this.clip!.segments[c.segment].beat.kind, c.phase) : hand.cradle;
    return jointsFor(s.prosthesis!, u, s.home);
  }

  private request(): void {
    this.solver.solve(this.seed, (solved) => {
      this.solved = solved;
      this.clip = solveClip(solved.scramble, solved.solution);
      if (this.active()) this.studio.store.set({ time: 0, playing: true });
      this.listeners.forEach((fn) => fn());
    });
  }

  private refresh(): void {
    const s = this.studio.session;
    if (this.laid && this.laid !== s) this.standUp(this.laid);
    if (this.active() && !this.solved) this.request();
    if (this.active() && !this.camera) {
      const { camera, controls } = this.studio.viewport.stage;
      this.camera = { position: camera.position.clone(), target: controls.target.clone() };
      this.settled = false;
    }
    this.listeners.forEach((fn) => fn());
  }

  /** Put a laid-down hand straight back, at once (its robot is leaving the stage or being switched). */
  private standUp(s: RobotSession): void {
    if (s.collision) s.collision.floorTest = true;
    s.assembly.root.position.set(0, 0, 0);
    s.assembly.root.quaternion.identity();
    this.studio.viewport.overlay.position.set(0, 0, 0);
    this.studio.viewport.overlay.quaternion.identity();
    this.laid = null;
    this.lay = 0;
    this.presented.visible = this.mount.group.visible = false;
  }

  /** Where the laid-down hand sits: the cube's rest point over the stage origin, the hand's base against the wall. */
  private measure(s: RobotSession): void {
    const rig = this.rig(s)!;
    const hand = this.hand(s);
    const q = jointsFor(s.prosthesis!, hand.cradle, s.home);
    // Rows of the turn are the palm's axes in the model frame: thumb side to x, fingertips to y, palm normal up.
    const P = rig.palmFrame(q).R, A = rig.axes;
    const col = (j: number) => new THREE.Vector3(...[0, 1, 2].map((i) => P[3 * i] * A[j] + P[3 * i + 1] * A[3 + j] + P[3 * i + 2] * A[6 + j]));
    const [e1, e2, e3] = [0, 1, 2].map(col);
    this.palmUp.setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1, e2, e3).transpose());
    const root = s.assembly.root;
    root.position.set(0, 0, 0);
    root.quaternion.copy(this.palmUp);
    root.parent!.updateMatrixWorld(true);
    const holder = root.parent!.getWorldPosition(new THREE.Vector3());
    const box = new THREE.Box3().setFromObject(root).translate(holder.clone().negate());
    const c = new THREE.Vector3(...hand.palm(q).p).applyQuaternion(this.palmUp);
    this.final.set(-c.x, -c.y, s.assembly.floorZ + RAISED - box.min.z);
    this.rest.set(0, 0, c.z + this.final.z);
    // What meets the wall: the hand's cross-section within a centimetre of its back end.
    const end = new THREE.Box3();
    const v = new THREE.Vector3();
    root.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const at = mesh.geometry.getAttribute('position');
      for (let i = 0; i < at.count; i++) {
        v.fromBufferAttribute(at, i).applyMatrix4(mesh.matrixWorld).sub(holder);
        if (v.y < box.min.y + 0.01) end.expandByPoint(v);
      }
    });
    const centre = end.getCenter(new THREE.Vector3()).add(this.final);
    this.base.set(centre.x, box.min.y + this.final.y, centre.z);
    this.baseRadius = Math.min(Math.max(0.55 * Math.max(end.max.x - end.min.x, end.max.z - end.min.z), 0.025), 0.08);
  }

  private place(s: RobotSession, k: number): void {
    const e = ease(k);
    const q = new THREE.Quaternion().slerp(this.palmUp, e);
    const p = this.final.clone().multiplyScalar(e);
    for (const o of [s.assembly.root, this.studio.viewport.overlay, this.presented]) {
      o.position.copy(p);
      o.quaternion.copy(q);
    }
    // Mid-turn the hand would swing through the floor; lift it clear.
    if (k > 0 && k < 1) {
      s.assembly.root.updateMatrixWorld(true);
      const holder = s.assembly.root.parent!.getWorldPosition(new THREE.Vector3());
      const low = new THREE.Box3().setFromObject(s.assembly.root).min.z - holder.z;
      const dip = s.assembly.floorZ + 0.01 * e - low;
      if (dip > 0) for (const o of [s.assembly.root, this.studio.viewport.overlay, this.presented]) o.position.z += dip;
    }
    // The wall rises out of the floor as the hand lies down onto it.
    this.mount.group.visible = k > 0;
    this.mount.group.scale.set(1, 1, Math.max(e, 1e-3));
    this.mount.group.position.z = s.assembly.floorZ * (1 - e);
    if (k > 0 && !this.mount.group.children.length) this.mount.set(this.base, this.baseRadius, s.assembly.floorZ);
  }

  private animate(dt: number): void {
    const s = this.studio.session;
    if (!s) return;
    const want = this.active() ? 1 : 0;
    if (want && !this.laid) {
      this.mount.clear();
      this.measure(s);
      this.laid = s;
      if (s.collision) s.collision.floorTest = false;
    }
    if (!this.laid) return;
    const before = this.lay;
    this.lay = Math.min(1, Math.max(0, this.lay + (want ? dt : -dt) / TURN));
    if (this.lay !== before || want) this.place(s, this.lay);
    if (want && this.lay === 1 && !this.settled) {
      this.settled = true;
      this.frameCube();
    }
    if (!want && this.lay === 0) {
      this.standUp(s);
      this.studio.viewport.refitStage();
      if (this.camera) {
        const { camera, controls } = this.studio.viewport.stage;
        camera.position.copy(this.camera.position);
        controls.target.copy(this.camera.target);
        controls.update();
      }
      this.camera = null;
    }
  }

  /** Three-quarters from the thumb and fingertips' side and a little above: the cube in front, the wall behind. */
  private frameCube(): void {
    const rig = this.studio.session && this.rig(this.studio.session);
    const k = rig?.scale ?? 1;
    const { camera, controls } = this.studio.viewport.stage;
    const holder = this.studio.viewport.overlay.parent!;
    const target = holder.localToWorld(this.rest.clone().add(new THREE.Vector3(0, -0.06 * k, -0.02 * k)));
    const half = Math.min(camera.fov / 2, THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)));
    const distance = (0.2 * k) / Math.tan(THREE.MathUtils.degToRad(half));
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(new THREE.Vector3(rig?.mirror ? -0.82 : 0.82, 0.42, 0.5).normalize(), distance);
    controls.update();
  }

  private sync(snap: Snapshot): void {
    const on = this.active() && snap.session === this.studio.session && this.lay === 1 && this.studio.store.state.explode < 0.001;
    this.presented.visible = on;
    // The fingertip markers draw over everything; on the cube they read as dirt.
    this.studio.overlays.effectors.group.visible = !on;
    if (!on) return;
    const hand = this.hand(snap.session);
    const c = this.clip?.at(snap.time) ?? { segment: 0, phase: 0, pieces: solvedPieces(), turning: null, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], lift: 0 };
    this.last = this.clip ? c : null;
    this.cube.show(c);
    const palm = hand.palm(snap.q);
    const R = palm.R, k = this.rig(snap.session)!.scale;
    const lift = [R[2] * c.lift * k, R[5] * c.lift * k, R[8] * c.lift * k];
    const M = new THREE.Matrix4().set(
      R[0], R[1], R[2], palm.p[0] + lift[0],
      R[3], R[4], R[5], palm.p[1] + lift[1],
      R[6], R[7], R[8], palm.p[2] + lift[2],
      0, 0, 0, 1,
    );
    const O = c.R;
    M.multiply(new THREE.Matrix4().set(O[0], O[1], O[2], 0, O[3], O[4], O[5], 0, O[6], O[7], O[8], 0, 0, 0, 0, 1).scale(new THREE.Vector3(k, k, k)));
    this.cube.group.matrix.copy(M);
    this.cube.group.matrixWorldNeedsUpdate = true;
  }
}
