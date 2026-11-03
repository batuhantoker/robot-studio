/** Analysis services for the panels: trajectory profiles, physics histories, workspace studies. */
import type { Vec3 } from '../../core/math/linear/vec';
import type { WorkspaceMetric } from '../../scene/overlays/workspace';
import type { AnalysisContext } from '../../ui/analysis/context';
import { focusLimb, jointLimits } from '../robots/focus';
import { type PathProfile, dragStop, planOf, profile, stopTips } from './modes/trajectory';
import { type WorkspaceStudy, runStudy, studyKey } from './workspace/study';
import type { Studio } from './studio';

export class StudioAnalysis implements AnalysisContext {
  private path: PathProfile | null = null;
  private tips: Vec3[] = [];
  private study: WorkspaceStudy | null = null;
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
    return p ? { history: p.history, reason: p.reason, limits: this.studio.session?.torqueLimits ?? [] } : null;
  }

  refreshProfile(): void {
    const s = this.studio.session;
    const st = this.studio.store.state;
    if (!s || !s.joints.length || st.waypoints[0]?.length !== s.joints.length) return;
    this.path = profile(jointLimits(s), focusLimb(s, st.focus), planOf(st));
    if (st.mode === 'trajectory') this.studio.overlays.trail.setPath(this.path.tool);
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
    this.studio.overlays.stops.show(this.tips, st.selectedStop);
  }

  workspace = () => this.study;
  onWorkspace = (fn: (s: WorkspaceStudy | null) => void) => void this.listeners.push(fn);

  /** Sample every limb so the cloud is the whole robot's reachable space. */
  runWorkspace(count: number, metric = this.metric): WorkspaceStudy | null {
    const s = this.studio.session;
    this.metric = metric;
    this.study = s ? runStudy(s, count) : null;
    this.recolorWorkspace(metric);
    this.listeners.forEach((fn) => fn(this.study));
    return this.study;
  }

  /** Run once per robot when the workspace is asked for (mode or overlay), not on every toggle. */
  ensureWorkspace(): void {
    const s = this.studio.session;
    if (!s || this.study?.key === studyKey(s, 2500)) return;
    this.runWorkspace(2500);
    this.studio.viewport.fitBox(this.studio.overlays.workspace.bounds());
  }

  clearWorkspace(): void {
    this.study = null;
    this.studio.overlays.workspace.clear();
    this.listeners.forEach((fn) => fn(null));
  }

  recolorWorkspace(metric: WorkspaceMetric): void {
    this.metric = metric;
    const st = this.study;
    if (!st) return;
    this.studio.overlays.workspace.show(st.samples, st.shell, metric, this.studio.overlays.reach * 0.02);
  }

  restartPhysics(): void {
    const st = this.studio.store.state;
    this.studio.physics?.reset(planOf(st));
    this.studio.overlays.trail.clear();
  }
}
