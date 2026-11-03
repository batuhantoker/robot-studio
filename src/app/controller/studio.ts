/** Orchestrates the active robot: loading, draft edits, modes, teardown view, and picking. */
import { parseRobot } from '../../core/robot/schema/parse';
import { defaultWaypoints } from '../../core/trajectory/quintic/sample';
import { clearWaypoints } from '../collision/waypoints';
import * as THREE from 'three';
import { compile } from '../../core/trajectory/plan';
import { OverlaySet } from '../../scene/overlays';
import { Viewport } from '../../scene/viewport/viewport';
import type { Raw } from '../../ui/builder/edit';
import { specEntry } from '../library/entries';
import { LiveBus } from '../live/bus';
import type { Catalog } from '../robots/catalog';
import { jointLimits } from '../robots/focus';
import { type RobotSession, pose } from '../robots/session';
import { pinAll, withTarget } from './targets';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';
import { frameLoop } from './frame-loop';
import { addMine, persist } from './library-actions';
import { IkMode } from './modes/ik';
import { MotionPlayer } from './motion/player';
import { PhysicsMode } from './modes/physics';
import { TrajectoryRecorder } from './render/recorder';
import { RobotLoader } from './robots';
import { bindLimbDrag } from './limb-drag';
import { planOf } from './modes/trajectory';
import { bindStopDrag } from './stop-drag';
import { loadPreset, presetsFor } from './trajectory-presets';
import type { TrajectoryPreset } from '../../core/trajectory/presets/build';
import { StudioAnalysis } from './studio-analysis';
import { TaskController } from './task/controller';
import { wireTeardownHud } from './tour/wire';
import { bindPicking } from './viewport-input';

const DEFAULT_DURATION = 6;

export class Studio {
  readonly bus = new LiveBus();
  readonly viewport: Viewport;
  readonly overlays: OverlaySet;
  readonly ik = new IkMode();
  readonly motion = new MotionPlayer();
  readonly analysis: StudioAnalysis;
  readonly task: TaskController;
  readonly recorder: TrajectoryRecorder;
  physics: PhysicsMode | null = null;
  private readonly loader: RobotLoader;
  private rebuildTimer = 0;

  constructor(host: HTMLElement, readonly store: Store<StudioState>, catalog: () => Catalog | null, private readonly status: (s: string | null) => void) {
    this.viewport = new Viewport(host);
    this.overlays = new OverlaySet(this.viewport.stage, (point) => store.set({ targets: withTarget(store.state.targets, store.state.focus, point) }));
    this.viewport.overlay.add(this.overlays.group);
    this.loader = new RobotLoader(catalog);
    this.analysis = new StudioAnalysis(this);
    this.task = new TaskController(this);
    this.recorder = new TrajectoryRecorder(this);
    const tick = frameLoop({
      store, bus: this.bus, overlays: this.overlays, ik: this.ik,
      session: () => this.session, physics: () => this.physics, motion: () => this.motion.clip, task: () => this.task.clip,
      focusJoint: () => this.analysis.focusJoint(),
    });
    const hud = wireTeardownHud(this, host);
    this.viewport.onFrame((dt) => {
      tick(dt);
      hud(dt);
    });
    store.on(['activeId'], () => void this.activate(true));
    store.on(['focus'], (s) => {
      this.analysis.refreshProfile();
      this.pinLimbs(s, false);
      this.placeGizmo();
    });
    store.on(['cut', 'look', 'explode', 'isolate'], (s) => this.viewport.applyView({ cut: s.cut, look: s.look, explode: s.explode, isolate: s.isolate }));
    store.on(['targets'], (s) => {
      this.placeGizmo();
      if (s.mode === 'ik' && this.session) this.ik.solve(this.session, s.targets, s.q);
    });
    store.on(['waypoints', 'duration', 'stopOpts', 'pace'], () => this.analysis.refreshProfile());
    store.on(['waypoints', 'focus', 'selectedStop'], () => this.analysis.refreshStops());
    store.on(['selectedStop'], (s) => s.selectedStop !== null && this.keepStopsInView(s.selectedStop));
    store.on(['selectedStop', 'waypoints', 'duration', 'stopOpts', 'pace'], (s) => {
      if (s.selectedStop === null) return;
      const i = Math.min(s.selectedStop, s.waypoints.length - 1);
      const time = compile(planOf(s)).arrive[i];
      if (i !== s.selectedStop || time !== s.time) store.set({ selectedStop: i, time });
    });
    store.on(['playing', 'mode'], (s) => s.selectedStop !== null && (s.playing || s.mode !== 'trajectory') && store.set({ selectedStop: null }));
    store.on(['overlays'], (s) => s.overlays.workspace && this.analysis.ensureWorkspace());
    store.on(['mode'], (s) => this.enterMode(s));
    store.on(['motion', 'mode'], (s) => s.mode === 'motion' && this.session && this.motion.ensure(this.session, s.motion.preset, s.motion.size, s.q));
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

  /** Reframe on every stop when the given one (or any) would be off-screen; paths often leave the robot's framing. */
  private keepStopsInView(only?: number): void {
    const world = (p: readonly number[]) => this.overlays.group.localToWorld(new THREE.Vector3(p[0], p[1], p[2]));
    const tips = this.analysis.stopTips();
    const check = only === undefined ? tips : tips.slice(only, only + 1);
    if (check.length) this.viewport.keepInView(check.map(world), tips.map(world));
  }

  async activate(refit: boolean): Promise<void> {
    const entry = this.store.state.library.find((e) => e.id === this.store.state.activeId);
    if (!entry) return;
    const keep = this.store.state.q;
    let session;
    try {
      session = await this.loader.load(entry, this.status);
    } catch (e) {
      this.store.set({ draftError: (e as Error).message });
      return;
    }
    if (!session) return;
    this.bus.latest = null;
    const limits = jointLimits(session);
    const n = limits.length;
    const q = !refit && keep.length === n ? keep.map((v, k) => Math.min(Math.max(v, limits[k][0]), limits[k][1])) : [...session.home];
    const focus = refit ? session.defaultFocus : Math.min(this.store.state.focus, session.limbs.length - 1);
    this.viewport.setAssembly(session.assembly, session.base === 'fixed' ? 'bolted' : 'settle');
    this.analysis.clearWorkspace();
    this.physics = new PhysicsMode(session);
    this.motion.load(session, q);
    const fresh = refit || this.store.state.waypoints[0]?.length !== n;
    // A preset's length doesn't suit the default path that replaces it.
    const duration = fresh && this.store.state.pace === 'distance' ? DEFAULT_DURATION : this.store.state.duration;
    this.store.set({
      q, draft: entry.spec ?? null, draftError: null, time: 0, contact: null, sessionVersion: this.store.state.sessionVersion + 1,
      waypoints: fresh ? clearWaypoints(session, defaultWaypoints(limits), duration) : this.store.state.waypoints,
      selectedStop: fresh ? null : this.store.state.selectedStop,
      ...(fresh ? { stopOpts: [], pace: 'even' as const, duration } : {}),
      focus, targets: refit ? [] : this.store.state.targets.slice(0, session.limbs.length), isolate: refit ? null : this.store.state.isolate,
    });
    this.analysis.refreshProfile();
    pose(session, q, this.store.state.explode, focus);
    if (refit) this.viewport.fit();
    this.overlays.rebuild(session, this.viewport.radius());
    this.analysis.refreshStops();
    this.pinLimbs(this.store.state, true);
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
    const entry = this.store.state.library.find((e) => e.id === this.store.state.activeId);
    if (entry?.group !== 'mine') {
      addMine(this.store, spec);
      return;
    }
    const library = this.store.state.library.map((e) => (e.id === entry.id ? specEntry(e.id, 'mine', spec, e.twin) : e));
    persist(library);
    this.store.set({ library, draft: spec, draftError: null });
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => void this.activate(false), 120);
  }

  private enterMode(s: StudioState): void {
    if (s.mode === 'physics') this.physics?.reset(planOf(s));
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
