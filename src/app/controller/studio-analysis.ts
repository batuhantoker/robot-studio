/** Analysis services for the panels: trajectory profiles, physics histories, workspace studies. */
import { chainFrames } from '../../core/chain/kinematics/frames';
import type { WorkspaceMetric } from '../../scene/overlays/workspace';
import type { AnalysisContext } from '../../ui/analysis/context';
import { focusLimb, jointLimits } from '../robots/focus';
import { type PathProfile, profile } from './modes/trajectory';
import { type WorkspaceStudy, runStudy, studyKey } from './workspace/study';
import type { Studio } from './studio';

export class StudioAnalysis implements AnalysisContext {
  private path: PathProfile | null = null;
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
  profile = () => this.path;

  physics() {
    const p = this.studio.physics;
    return p ? { history: p.history, reason: p.reason, limits: this.studio.session?.torqueLimits ?? [] } : null;
  }

  refreshProfile(): void {
    const s = this.studio.session;
    const st = this.studio.store.state;
    if (!s || !s.joints.length || st.waypoints[0]?.length !== s.joints.length) return;
    this.path = profile(jointLimits(s), focusLimb(s, st.focus), st.waypoints, st.duration);
    if (st.mode === 'trajectory') this.studio.overlays.trail.setPath(this.path.tool);
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
    const s = this.studio.session;
    const base = s?.limbs[0]?.chain;
    const axis = base ? chainFrames(base, base.joints.map((j) => j.q0)).origins[0] ?? base.base.p : ([0, 0, 0] as const);
    this.studio.overlays.workspace.show(st.samples, metric, this.studio.overlays.reach * 0.02, [axis[0], axis[1], axis[2]]);
  }

  restartPhysics(): void {
    const st = this.studio.store.state;
    this.studio.physics?.reset(st.waypoints, st.duration);
    this.studio.overlays.trail.clear();
  }
}
