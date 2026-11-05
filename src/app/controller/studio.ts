/** Orchestrates the active robot: loading, draft edits, modes, teardown view, and picking. */
import { chainFrames } from '../../core/chain/kinematics/frames';
import { limbQ } from '../../core/chain/limbs/types';
import { applyTransform } from '../../core/math/linear/transform';
import type { MotionClip } from '../../core/motion/types';
import { misplacedJoint } from '../../core/robot/joints/placement';
import { parseRobot } from '../../core/robot/schema/parse';
import * as THREE from 'three';
import { compile } from '../../core/trajectory/plan';
import { OverlaySet } from '../../scene/overlays';
import { Viewport } from '../../scene/viewport/viewport';
import type { Raw } from '../../ui/builder/edit';
import { specEntry } from '../library/entries';
import { LiveBus } from '../live/bus';
import type { Catalog } from '../robots/catalog';
import { armFit } from '../../cad/assembly/mjcf/mounts';
import { fittedTool, settleTool } from '../robots/fitted';
import { jointLimits } from '../robots/focus';
import { type RobotSession, pose } from '../robots/session';
import { stanceOf } from '../robots/body';
import { ORIGIN, relativeBase } from '../scene/frame';
import { pinAll, withTarget } from './targets';
import type { Store } from '../state/store';
import type { LibraryEntry, RobotBase, SceneRobot, StudioState } from '../state/types';
import { addToScene } from './scene';
import { DRIVEN_MODES, isPassive } from '../../core/robot/config/passive';
import { frameLoop } from './frame-loop';
import { addMine, persist } from './library-actions';
import { IkMode } from './modes/ik';
import { MotionPlayer } from './motion/player';
import { PhysicsMode } from './modes/physics';
import { TrajectoryRecorder } from './render/recorder';
import { MAX_ROBOTS, RobotLoader } from './robots';
import { bindLimbDrag } from './limb-drag';
import { planOf } from './modes/trajectory';
import { bindStopDrag } from './stop-drag';
import { DEFAULT_DURATION, defaultPlan, loadPreset, presetsFor } from './trajectory-presets';
import type { TrajectoryPreset } from '../../core/trajectory/presets/build';
import { StudioAnalysis } from './studio-analysis';
import { TaskController } from './task/controller';
import { PilotController } from './pilot/controller';
import { GraspController } from './grasp/controller';
import { RubikController } from './rubik/controller';
import { wireTeardownHud } from './tour/wire';
import { bindPicking } from './viewport-input';

const groundingOf = (s: RobotSession) => (s.base === 'fixed' ? 'bolted' : 'settle');

export class Studio {
  readonly bus = new LiveBus();
  readonly viewport: Viewport;
  readonly overlays: OverlaySet;
  readonly ik = new IkMode();
  readonly motion = new MotionPlayer();
  readonly analysis: StudioAnalysis;
  readonly task: TaskController;
  readonly pilot: PilotController;
  readonly rubik: RubikController;
  readonly recorder: TrajectoryRecorder;
  physics: PhysicsMode | null = null;
  private readonly loader: RobotLoader;
  private rebuildTimer = 0;
  /** Bystanders still loading, by placement, so a sync doesn't start them twice. */
  private readonly loading = new Map<string, LibraryEntry>();
  /** Frame every robot once they all stand: after an add, and when a saved stage comes back. */
  private frameNext: boolean;

  constructor(host: HTMLElement, readonly store: Store<StudioState>, catalog: () => Catalog | null, private readonly status: (s: string | null) => void) {
    this.viewport = new Viewport(host);
    this.overlays = new OverlaySet(this.viewport.stage, (point) => store.set({ targets: withTarget(store.state.targets, store.state.focus, point) }));
    this.viewport.overlay.add(this.overlays.group);
    this.loader = new RobotLoader(catalog);
    this.loader.activeKey = store.state.activeKey;
    this.viewport.activeKey = store.state.activeKey;
    this.frameNext = store.state.scene.length > 1;
    this.analysis = new StudioAnalysis(this);
    this.task = new TaskController(this);
    this.pilot = new PilotController(this);
    this.rubik = new RubikController(this);
    new GraspController(this);
    this.recorder = new TrajectoryRecorder(this);
    const tick = frameLoop({
      store, bus: this.bus, overlays: this.overlays, ik: this.ik,
      session: () => this.session, physics: () => this.physics, motion: () => this.motion.clip, task: () => this.task.clip,
      body: (pose) => this.viewport.setBodyPose(pose),
      pilot: (s, dt) => this.pilot.step(s, dt),
      focusJoint: () => this.analysis.focusJoint(),
    });
    const hud = wireTeardownHud(this, host);
    this.viewport.onFrame((dt) => {
      tick(dt);
      hud(dt);
      this.physics?.tick(dt);
    });
    // A switch changes activeKey (and usually activeId) in one update; a library pick changes only activeId.
    store.on(['activeId', 'activeKey'], (s, changed) => void (changed.has('activeKey') ? this.activate(s.q.length === 0, false, true) : this.activate(true)));
    store.on(['scene', 'library'], () => this.syncBystanders());
    // A fitted tool is compiled into the model, so it arrives as a new session, never a swap inside the live one.
    store.on(['library'], (s) => {
      const id = s.library.find((e) => e.id === s.activeId)?.catalogId;
      // An arm whose home moves with its tool restarts from it: the old pose would leave the tool buried.
      if (id && this.session && this.session.fitted !== fittedTool(id)) void this.activate(!!armFit(id)?.home, false).then(() => this.session && settleTool(store, id, this.session.fitted));
    });
    store.on(['focus'], (s) => {
      this.analysis.refreshProfile();
      this.pinLimbs(s, false);
      this.placeGizmo();
    });
    store.on(['cut', 'look', 'explode', 'isolate', 'section'], (s) => this.viewport.applyView({ cut: s.cut, look: s.look, explode: s.explode, isolate: s.isolate, section: s.section }));
    store.on(['targets'], (s) => {
      this.placeGizmo();
      if (s.mode === 'ik' && this.session) this.ik.solve(this.session, s.targets, s.q);
    });
    store.on(['waypoints', 'duration', 'stopOpts', 'pace'], () => this.analysis.refreshProfile());
    store.on(['waypoints', 'stopOpts', 'focus', 'selectedStop'], () => this.analysis.refreshStops());
    store.on(['selectedStop'], (s) => s.selectedStop !== null && this.keepStopsInView(s.selectedStop));
    store.on(['selectedStop', 'waypoints', 'duration', 'stopOpts', 'pace'], (s) => {
      if (s.selectedStop === null) return;
      const i = Math.min(s.selectedStop, s.waypoints.length - 1);
      const time = compile(planOf(s)).arrive[i];
      if (i !== s.selectedStop || time !== s.time) store.set({ selectedStop: i, time });
    });
    store.on(['playing', 'mode'], (s) => s.selectedStop !== null && (s.playing || s.mode !== 'trajectory') && store.set({ selectedStop: null }));
    // Deferred: leaving Workspace mode switches the cloud off in a later listener of the same change.
    store.on(['overlays', 'mode', 'focus'], () => queueMicrotask(() => store.state.overlays.workspace && this.analysis.ensureWorkspace()));
    store.on(['mode'], (s) => this.enterMode(s));
    store.on(['motion', 'mode'], (s) => {
      if (s.mode !== 'motion' || !this.session) return;
      const was = this.motion.clip, clip = this.motion.ensure(this.session, s.motion.preset, s.motion.size, s.q);
      if (clip?.body && clip !== was) this.keepClipInView(clip, clip.body);
    });
    bindPicking(host, this.viewport, store);
    bindStopDrag(this.viewport, this.overlays, store, () => this.analysis.stopTips(), (i, p) => this.analysis.moveStop(i, p, 40));
    bindLimbDrag(this.viewport, this.overlays, store, (limb, p) => {
      const s = store.state;
      if (s.mode === 'ik') store.set({ targets: withTarget(s.targets, limb, p) });
      else if (s.selectedStop !== null) this.analysis.moveStop(s.selectedStop, p, 40);
    });
  }

  get session(): RobotSession | null {
    return this.loader.current;
  }

  trajectoryPresets(): TrajectoryPreset[] {
    const s = this.session;
    return s ? presetsFor(s, this.store.state.focus) : [];
  }

  /** Load a trajectory preset and frame it; returns a note for the user, if any. */
  loadTrajectoryPreset(id: string): string | null {
    const s = this.session;
    if (!s) return null;
    const note = loadPreset(this.store, s, id);
    this.keepStopsInView();
    return note;
  }

  /**
   * In IK mode untargeted limbs get a target where they are, so dragging one leaves the others in place:
   * every limb on entering the mode, only the focused one on a focus change (an untick stays free).
   */
  private pinLimbs(s: StudioState, all: boolean): void {
    if (s.mode !== 'ik' || !this.session) return;
    const pinned = pinAll(this.session, s.targets, s.q);
    const targets = all ? pinned : withTarget(s.targets, s.focus, pinned[s.focus] ?? null);
    if (targets.some((t, i) => t !== s.targets[i])) this.store.set({ targets });
  }

  /** The drag gizmo always edits the focused limb's target. */
  private placeGizmo(): void {
    const t = this.store.state.targets[this.store.state.focus];
    if (t && !this.overlays.target.gizmo.dragging) this.overlays.target.place(t);
  }

  /** A raised hand can leave the framing of the robot at rest. */
  private keepClipInView(clip: MotionClip, body: NonNullable<MotionClip['body']>): void {
    const span = clip.period + (clip.lead ?? 0), { limbs } = this.session!;
    this.viewport.keepPlacedInView(Array.from({ length: 24 }, (_, i) => (span * i) / 24).flatMap((t) => {
      const q = clip.at(t), B = body(t);
      return limbs.map((l) => applyTransform(B, chainFrames(l.chain, limbQ(l, q)).tip.p));
    }));
  }

  /** Reframe on every stop when the given one (or any) would be off-screen; paths often leave the robot's framing. */
  private keepStopsInView(only?: number): void {
    const world = (p: readonly number[]) => this.overlays.group.localToWorld(new THREE.Vector3(p[0], p[1], p[2]));
    const tips = this.analysis.stopTips();
    const check = only === undefined ? tips : tips.slice(only, only + 1);
    if (check.length) this.viewport.keepInView(check.map(world), tips.map(world));
  }

  /**
   * Drive the active placement's robot. `refit` starts it from its defaults (else from the restored fields), `frame`
   * fits the camera to it, and `switched` means another robot was driven before.
   */
  async activate(refit: boolean, frame = refit, switched = false): Promise<void> {
    const key = this.store.state.activeKey;
    const entry = this.store.state.library.find((e) => e.id === this.store.state.activeId);
    if (!entry) return;
    const keep = this.store.state.q;
    this.loader.activeKey = key;
    let session = this.loader.has(key, entry) ? this.loader.get(key) : null;
    if (!session) {
      try {
        session = await this.loader.load(entry, this.status, key);
      } catch (e) {
        this.store.set({ draftError: (e as Error).message });
        return;
      }
    }
    if (!session) return;
    // Another robot took over while this one loaded: it stands by instead.
    if (this.store.state.activeKey !== key) return this.syncBystanders();
    this.bus.latest = null;
    const limits = jointLimits(session);
    const n = limits.length;
    const q = !refit && keep.length === n ? keep.map((v, k) => Math.min(Math.max(v, limits[k][0]), limits[k][1])) : [...session.home];
    const focus = refit ? session.defaultFocus : Math.min(this.store.state.focus, session.limbs.length - 1);
    this.swapIn(key, session);
    this.analysis.clearWorkspace();
    this.physics?.dispose();
    this.physics = new PhysicsMode(session, () => this.store.state.focus, {
      newRun: () => this.overlays.trail.clear(),
      addRun: (path, score) => this.overlays.runs.add(path, score),
      clearRuns: () => this.overlays.runs.clear(),
      setBody: (pose) => this.viewport.setBodyPose(pose),
    });
    this.motion.load(session, q);
    const fresh = refit || this.store.state.waypoints[0]?.length !== n;
    // A preset's length doesn't suit the default path that replaces it.
    const duration = fresh && this.store.state.pace === 'distance' ? DEFAULT_DURATION : this.store.state.duration;
    this.store.set({
      q, draft: entry.spec ?? null, draftError: entry.spec ? misplacedJoint(entry.spec) : null, time: 0, contact: null, sessionVersion: this.store.state.sessionVersion + 1,
      selectedStop: fresh ? null : this.store.state.selectedStop,
      ...(fresh ? defaultPlan(session, duration) : {}),
      ...(isPassive(session.spec) && DRIVEN_MODES.includes(this.store.state.mode) ? { mode: 'pose' as const } : {}),
      focus, targets: refit ? [] : this.store.state.targets.slice(0, session.limbs.length), isolate: refit || switched ? null : this.store.state.isolate,
      section: refit || switched ? { axis: this.viewport.sectionAxis(), offset: 0 } : this.store.state.section,
    });
    this.analysis.refreshProfile();
    pose(session, q, this.store.state.explode, focus);
    if (frame) this.viewport.fit();
    else this.viewport.refitStage();
    this.overlays.rebuild(session, this.viewport.radius());
    this.analysis.refreshStops();
    this.pinLimbs(this.store.state, true);
    this.syncBystanders();
  }

  /** Put `session` in the holder; the robot it replaces stands by at its placement, if it is still on the stage. */
  private swapIn(key: string, session: RobotSession): void {
    const outgoing = this.viewport.activeKey;
    const previous = outgoing !== key ? this.loader.get(outgoing) : null;
    this.viewport.removeBystander(key);
    this.viewport.setAssembly(session.assembly, groundingOf(session), stanceOf(session));
    this.viewport.activeKey = key;
    const placed = this.store.state.scene.find((r) => r.key === outgoing);
    if (previous && placed) this.standBy(placed, previous);
    else if (outgoing !== key) this.loader.remove(outgoing);
    this.viewport.setAnchor(this.store.state.scene.find((r) => r.key === key)?.base ?? ORIGIN);
  }

  private standBy(r: SceneRobot, s: RobotSession): void {
    const q = r.parked?.q.length === s.joints.length ? r.parked.q : s.home;
    pose(s, q, 0, r.parked?.focus ?? s.defaultFocus);
    this.viewport.addBystander(r.key, s.assembly, groundingOf(s), r.base);
  }

  /** Bring the robots that aren't driven in line with the scene: load, stand, move and remove them. */
  syncBystanders(): void {
    const s = this.store.state;
    const others = s.scene.filter((r) => r.key !== s.activeKey);
    for (const key of this.viewport.bystanderKeys()) if (!others.some((r) => r.key === key)) this.viewport.removeBystander(key);
    // The robot still in the holder goes when the next one swaps in.
    for (const key of this.loader.keys()) if (key !== this.viewport.activeKey && !s.scene.some((r) => r.key === key)) this.loader.remove(key);
    let moved = false;
    for (const r of others) {
      const entry = s.library.find((e) => e.id === r.entryId);
      if (!entry || r.key === this.viewport.activeKey) continue;
      if (!this.loader.has(r.key, entry)) {
        void this.loadBystander(r.key, entry);
      } else if (this.viewport.bystanderKeys().includes(r.key)) {
        this.viewport.placeBystander(r.key, r.base);
        moved = true;
      } else {
        this.standBy(r, this.loader.get(r.key)!);
        moved = true;
      }
    }
    const active = s.scene.find((r) => r.key === s.activeKey);
    const here = this.viewport.placement;
    if (active && this.viewport.activeKey === active.key && (active.base.x !== here.x || active.base.y !== here.y || active.base.yaw !== here.yaw)) {
      this.viewport.setAnchor(active.base);
      moved = true;
    }
    if (moved) this.viewport.refitStage();
    this.frameWhenAllStand();
  }

  /** Frame every robot once all of them stand on the stage, after one was added or a saved stage came back. */
  private frameWhenAllStand(): void {
    if (!this.frameNext || !this.session || this.viewport.bystanderKeys().length < this.store.state.scene.length - 1) return;
    this.frameNext = false;
    this.viewport.frameAll();
  }

  private async loadBystander(key: string, entry: LibraryEntry): Promise<void> {
    if (this.loading.get(key) === entry) return;
    this.loading.set(key, entry);
    try {
      await this.loader.load(entry, this.status, key);
    } catch (e) {
      this.store.set({ draftError: (e as Error).message });
    } finally {
      if (this.loading.get(key) === entry) this.loading.delete(key);
    }
    this.syncBystanders();
  }

  /** Move a robot live while it is dragged; the scene's setBase saves it. */
  previewBase(key: string, base: RobotBase): void {
    if (key === this.viewport.activeKey) this.viewport.previewActive(relativeBase(this.viewport.placement, base));
    else this.viewport.placeBystander(key, base);
  }

  /** Put another robot on the stage and drive it; returns why not, if it can't. */
  addRobot(entryId: string): string | null {
    if (this.store.state.scene.length >= MAX_ROBOTS) return `The stage holds up to ${MAX_ROBOTS} robots.`;
    const why = this.loader.roomForAnother();
    if (why) return why;
    this.frameNext = true;
    addToScene(this.store, entryId);
    return null;
  }

  /** Validate a builder edit; presets fork into "My robots" on their first change. */
  commitDraft(raw: Raw): void {
    let spec;
    try {
      spec = parseRobot(raw);
    } catch (e) {
      this.store.set({ draftError: (e as Error).message });
      return;
    }
    const misplaced = misplacedJoint(spec);
    if (misplaced) {
      this.store.set({ draftError: misplaced });
      return;
    }
    const entry = this.store.state.library.find((e) => e.id === this.store.state.activeId);
    if (entry?.group !== 'mine') {
      addMine(this.store, spec);
      return;
    }
    const library = this.store.state.library.map((e) => (e.id === entry.id ? specEntry(e.id, 'mine', spec, e.twin) : e));
    // Only a new or removed link changes the robot's size enough to move the camera for.
    const resized = spec.links.length !== this.session?.spec?.links.length;
    persist(library);
    this.store.set({ library, draft: spec, draftError: null });
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => void this.activate(false, resized), 120);
  }

  private enterMode(s: StudioState): void {
    if (s.mode === 'physics') {
      this.physics?.reset(planOf(s));
      this.analysis.refreshProfile();
      if (!s.touring && s.tab !== 'analysis') this.store.set({ tab: 'analysis' });
    } else this.physics?.release();
    // Pins left over from an earlier IK visit would snap the robot back to that pose on the next drag.
    if (s.mode !== 'ik' && s.targets.length) this.store.set({ targets: [] });
    this.pinLimbs(s, true);
    this.overlays.trail.clear();
    if (s.mode === 'trajectory') {
      this.analysis.refreshProfile();
      if (!s.touring) this.keepStopsInView();
    }
    if (s.mode === 'workspace') this.store.set({ tab: 'analysis', overlays: { ...s.overlays, workspace: true } });
  }
}
