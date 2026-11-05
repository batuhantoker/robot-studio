/** Analysis services for the panels: trajectory profiles, physics histories, workspace studies. */
import type { Vec3 } from '../../core/math/linear/vec';
import type { WorkspaceMetric } from '../../scene/overlays/workspace';
import type { AnalysisContext } from '../../ui/analysis/context';
import { focusLimb, jointLimits } from '../robots/focus';
import type { RobotSession } from '../robots/session';
import { isVia } from '../../core/trajectory/plan';
import type { Method } from './learn/run';
import { type PathProfile, dragStop, planOf, profile, stopTips } from './modes/trajectory';
import { type WorkspaceStudy, runStudy, studyKey } from './workspace/study';
import type { Studio } from './studio';

export class StudioAnalysis implements AnalysisContext {
  private path: PathProfile | null = null;
  private tips: Vec3[] = [];
  private study: WorkspaceStudy | null = null;
  private limbStudy: WorkspaceStudy | null = null;
  private painted: WorkspaceStudy | null = null;
  private paintedMetric: WorkspaceMetric | null = null;
  private metric: WorkspaceMetric = 'manipulability';
  private listeners: ((s: WorkspaceStudy | null) => void)[] = [];

  constructor(private readonly studio: Studio) {}

  /** Index, within the focused limb, of the joint the isolated module moves. */
  focusJoint(): number {
    const s = this.studio.session;
    const { isolate, focus } = this.studio.store.state;
    if (!s || !isolate) return 0;
    const mod = s.assembly.modules.find((m) => m.id === isolate);
    return mod && (mod.limb ?? 0) === focus ? mod.joints[0] ?? 0 : 0;
  }

  ik = () => this.studio.ik.result;
  ikBlocked = () => this.studio.ik.blocked;
  profile = () => this.path;
  stopTips = () => this.tips;

  physics() {
    const p = this.studio.physics;
    return p ? { history: p.history, reason: p.reason, limits: p.lab?.limits ?? [], lab: p.lab, current: p.current, ownMotion: p.ownMotion, onFloor: p.onFloor, floorBlock: p.floorBlock } : null;
  }

  refreshProfile(): void {
    const s = this.studio.session;
    const st = this.studio.store.state;
    if (!s || !s.joints.length || st.waypoints[0]?.length !== s.joints.length) return;
    this.path = profile(jointLimits(s), focusLimb(s, st.focus), planOf(st));
    if (st.mode === 'trajectory') this.studio.overlays.trail.setPath(this.path.tool);
    if (st.mode === 'physics') this.studio.overlays.goal.setPath(this.path.tool);
  }

  /** Move stop i so the focused tool point goes to `point` (overlay frame); drags pass a small budget. */
  moveStop(i: number, point: Vec3, maxIter = 200): void {
    const s = this.studio.session;
    const st = this.studio.store.state;
    if (s && st.waypoints[i]) this.studio.store.set({ waypoints: dragStop(s.limbs, s.joints, st.focus, st.waypoints, i, point, maxIter) });
  }

  refreshStops(): void {
    const s = this.studio.session;
    const st = this.studio.store.state;
    this.tips = s && st.waypoints[0]?.length === s.joints.length ? stopTips(jointLimits(s), focusLimb(s, st.focus), st.waypoints) : [];
    const plan = planOf(st);
    this.studio.overlays.stops.show(this.tips, st.selectedStop, (i) => isVia(plan, i));
  }

  workspace = () => this.study;
  onWorkspace = (fn: (s: WorkspaceStudy | null) => void) => void this.listeners.push(fn);

  /** Sample every limb so the cloud is the whole robot's reachable space. */
  runWorkspace(count: number, metric = this.metric): WorkspaceStudy | null {
    const s = this.studio.session;
    this.metric = metric;
    this.study = s ? runStudy(s, count) : null;
    this.paint();
    this.listeners.forEach((fn) => fn(this.study));
    return this.study;
  }

  /** Run once per robot (or focused limb) when the workspace is asked for, not on every toggle. */
  ensureWorkspace(): void {
    const s = this.studio.session;
    if (!s) return;
    const limb = this.shownLimb(s);
    const have = limb === undefined ? this.study : this.limbStudy;
    const before = this.painted;
    if (have?.key !== studyKey(s, limb)) {
      if (limb === undefined) this.runWorkspace(2500);
      else this.limbStudy = runStudy(s, 2500, limb);
    }
    this.paint();
    // Frame a cloud that just appeared or grew to the whole robot; Pilot's camera rides with the driver.
    const grew = !before || (limb === undefined && before !== this.painted);
    if (grew && this.studio.store.state.mode !== 'pilot') this.studio.viewport.fitBox(this.studio.overlays.workspace.bounds());
  }

  clearWorkspace(): void {
    this.study = this.limbStudy = this.painted = null;
    this.studio.overlays.workspace.clear();
    this.listeners.forEach((fn) => fn(null));
  }

  recolorWorkspace(metric: WorkspaceMetric): void {
    this.metric = metric;
    this.paint();
  }

  /** Workspace mode studies the whole robot; elsewhere the cloud is the focused limb's, a humanoid's hand rather than its body. */
  private shownLimb(s: RobotSession): number | undefined {
    const { mode, focus } = this.studio.store.state;
    return mode === 'workspace' || s.limbs.filter((l) => l.chain.joints.length).length < 2 ? undefined : focus;
  }

  private paint(): void {
    const s = this.studio.session;
    const st = s ? (this.shownLimb(s) === undefined ? this.study : this.limbStudy) : null;
    if (st === this.painted && this.metric === this.paintedMetric) return;
    this.painted = st;
    this.paintedMetric = this.metric;
    if (st) this.studio.overlays.workspace.show(st.samples, st.shell, this.metric, this.studio.overlays.reach * 0.02);
    else this.studio.overlays.workspace.clear();
  }

  restartPhysics(): void {
    const st = this.studio.store.state;
    this.studio.physics?.reset(planOf(st));
    this.studio.overlays.trail.clear();
  }

  setFloor(on: boolean): Promise<string | null> {
    return this.studio.physics?.setFloor(on, planOf(this.studio.store.state)) ?? Promise.resolve(null);
  }

  shove(): void {
    this.studio.physics?.shove();
  }

  teach(method: Method): void {
    this.studio.physics?.learn(method, planOf(this.studio.store.state));
    this.studio.store.set({ playing: true });
  }
}
