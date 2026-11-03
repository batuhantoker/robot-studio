/** Orchestrates the active robot: loading, draft edits, modes, teardown view, and picking. */
import { parseRobot } from '../../core/robot/schema/parse';
import { defaultWaypoints } from '../../core/trajectory/quintic/sample';
import { OverlaySet } from '../../scene/overlays';
import { Viewport } from '../../scene/viewport/viewport';
import type { Raw } from '../../ui/builder/edit';
import { specEntry } from '../library/entries';
import { LiveBus } from '../live/bus';
import type { Catalog } from '../robots/catalog';
import { jointLimits } from '../robots/focus';
import { type RobotSession, pose } from '../robots/session';
import { focusTip, withTarget } from './targets';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';
import { frameLoop } from './frame-loop';
import { addMine, persist } from './library-actions';
import { IkMode } from './modes/ik';
import { MotionPlayer } from './motion/player';
import { PhysicsMode } from './modes/physics';
import { RobotLoader } from './robots';
import { StudioAnalysis } from './studio-analysis';
import { wireTeardownHud } from './tour/wire';
import { bindPicking } from './viewport-input';

export class Studio {
  readonly bus = new LiveBus();
  readonly viewport: Viewport;
  readonly overlays: OverlaySet;
  readonly ik = new IkMode();
  readonly motion = new MotionPlayer();
  readonly analysis: StudioAnalysis;
  physics: PhysicsMode | null = null;
  private readonly loader: RobotLoader;
  private rebuildTimer = 0;

  constructor(host: HTMLElement, readonly store: Store<StudioState>, catalog: () => Catalog | null, private readonly status: (s: string | null) => void) {
    this.viewport = new Viewport(host);
    this.overlays = new OverlaySet(this.viewport.stage, (point) => store.set({ targets: withTarget(store.state.targets, store.state.focus, point) }));
    this.viewport.overlay.add(this.overlays.group);
    this.loader = new RobotLoader(catalog);
    this.analysis = new StudioAnalysis(this);
    let last = performance.now();
    const tick = frameLoop({
      store, bus: this.bus, overlays: this.overlays, ik: this.ik,
      session: () => this.session, physics: () => this.physics, motion: () => this.motion.clip,
      focusJoint: () => this.analysis.focusJoint(),
    });
    const hud = wireTeardownHud(this, host);
    this.viewport.onFrame(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      tick(dt);
      hud(dt);
      last = now;
    });
    store.on(['activeId'], () => void this.activate(true));
    store.on(['focus'], (s) => {
      this.analysis.refreshProfile();
      if (s.mode === 'ik' && this.session && !s.targets[s.focus]) store.set({ targets: withTarget(s.targets, s.focus, focusTip(this.session, s)) });
      this.placeGizmo();
    });
    store.on(['cut', 'look', 'explode', 'isolate'], (s) => this.viewport.applyView({ cut: s.cut, look: s.look, explode: s.explode, isolate: s.isolate }));
    store.on(['targets'], (s) => {
      this.placeGizmo();
      if (s.mode === 'ik' && this.session) this.ik.solve(this.session, s.targets, s.q);
    });
    store.on(['waypoints', 'duration'], () => this.analysis.refreshProfile());
    store.on(['overlays'], (s) => s.overlays.workspace && this.analysis.ensureWorkspace());
    store.on(['mode'], (s) => this.enterMode(s));
    store.on(['motion', 'mode'], (s) => s.mode === 'motion' && this.session && this.motion.ensure(this.session, s.motion.preset, s.motion.size, s.q));
    bindPicking(host, this.viewport, store);
  }

  get session(): RobotSession | null {
    return this.loader.current;
  }

  /** The drag gizmo always edits the focused limb's target. */
  private placeGizmo(): void {
    const t = this.store.state.targets[this.store.state.focus];
    if (t && !this.overlays.target.gizmo.dragging) this.overlays.target.place(t);
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
    this.store.set({
      q, draft: entry.spec ?? null, draftError: null, time: 0, sessionVersion: this.store.state.sessionVersion + 1,
      waypoints: refit || this.store.state.waypoints[0]?.length !== n ? defaultWaypoints(limits) : this.store.state.waypoints,
      focus, targets: refit ? [] : this.store.state.targets.slice(0, session.limbs.length), isolate: refit ? null : this.store.state.isolate,
    });
    this.analysis.refreshProfile();
    pose(session, q, this.store.state.explode, focus);
    if (refit) this.viewport.fit();
    this.overlays.rebuild(session, this.viewport.radius());
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
    if (s.mode === 'physics') this.physics?.reset(s.waypoints, s.duration);
    if (s.mode === 'ik' && this.session && !s.targets[s.focus]) this.store.set({ targets: withTarget(s.targets, s.focus, focusTip(this.session, s)) });
    this.overlays.trail.clear();
    if (s.mode === 'trajectory') this.analysis.refreshProfile();
    if (s.mode === 'workspace') this.store.set({ tab: 'analysis', overlays: { ...s.overlays, workspace: true } });
  }
}
