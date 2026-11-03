/** Pick and place for the loaded arm: plans the cycle, keeps pads and object in the scene, drives the jaws. */
import { compose } from '../../../core/math/linear/transform';
import type { Vec3 } from '../../../core/math/linear/vec';
import { isClip, planTask } from '../../../core/task/plan/check';
import { type ReachCell, nearestReachable } from '../../../core/task/reach';
import type { PlanProblem, TaskClip } from '../../../core/task/types';
import { type Spot, TaskPads } from '../../../scene/overlays/task-pads';
import { TaskProp } from '../../../scene/task/prop';
import type { Snapshot } from '../../live/bus';
import type { Studio } from '../studio';
import { bindFloorClicks } from './floor-click';
import { reachJob } from './reach-job';
import { TaskStands } from '../../../scene/task/stands';
import { type TaskSetup, arrange, taskSetup } from './setup';

export class TaskController {
  clip: TaskClip | null = null;
  problem: PlanProblem | null = null;
  setup: TaskSetup | null = null;
  private reach: ReachCell[] = [];
  private cancelReach = () => {};
  private timer = 0;
  private readonly prop = new TaskProp();
  private readonly stands = new TaskStands();
  private readonly pads: TaskPads;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly studio: Studio) {
    const { store, viewport } = studio;
    this.pads = new TaskPads(viewport.stage, (spot, p, done) => this.move(spot, p, done));
    viewport.overlay.add(this.pads.group);
    viewport.stage.root.add(this.prop.group, this.stands.group);
    bindFloorClicks(viewport.stage, () => (store.state.mode === 'task' && this.setup && !this.pads.gizmo.axis ? this.setup : null),
      () => studio.session?.assembly.root ?? null, (p) => this.move(store.state.task.moving, p, true));
    store.on(['sessionVersion'], () => this.load());
    store.on(['task'], () => (this.refresh(), this.schedule()));
    store.on(['mode'], () => this.refresh());
    studio.bus.on((snap) => this.sync(snap), 1000);
    this.refresh();
  }

  available = () => !!this.setup;
  object = () => this.setup?.object.label ?? null;
  onChange = (fn: () => void) => void this.listeners.push(fn);
  status(): { text: string; bad: boolean } {
    if (this.problem) return { text: this.problem.message, bad: true };
    if (!this.clip) return { text: 'Place both spots', bad: true };
    return { text: `${this.clip.period.toFixed(1)} s cycle · drag the arrows or click the floor to move a spot`, bad: false };
  }

  private load(): void {
    this.cancelReach();
    const s = this.studio.session;
    const found = s ? taskSetup(s) : null;
    const arranged = found ? arrange(found) : null;
    const t = (this.setup = arranged?.setup ?? null);
    this.prop.set(t?.object ?? null);
    this.pads.setReach([], 0);
    this.reach = [];
    if (t) this.cancelReach = reachJob(t, (cells) => ((this.reach = cells), this.pads.setReach(cells, 0.011 * t.radius)));
    const { task } = this.studio.store.state;
    this.plan();
    const stale = !task.pick || Math.abs(task.pick[2] - (t?.surfaceZ ?? 0)) > 1e-9;
    if (t && (!this.clip || stale) && arranged?.spots) this.studio.store.set({ task: { ...task, pick: arranged.spots[0], place: arranged.spots[1] } });
    this.refresh();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.plan(), 40);
  }

  private plan(): void {
    clearTimeout(this.timer);
    const t = this.setup;
    const { pick, place } = this.studio.store.state.task;
    const result = t && pick && place ? planTask({ ctx: t.ctx, home: t.home, pick, place, object: t.object, floorZ: t.surfaceZ, lift: t.lift, base: t.base }, t.probe) : null;
    [this.clip, this.problem] = result && isClip(result) ? [result, null] : [null, result];
    this.refresh();
    this.listeners.forEach((fn) => fn());
  }

  /** A spot dropped out of reach snaps back to the nearest reachable one. */
  private move(spot: Spot, p: Vec3, done: boolean): void {
    const { store } = this.studio;
    store.set({ task: { ...store.state.task, [spot]: p }, playing: false, time: 0 });
    if (!done) return;
    this.plan();
    const snap = this.problem?.where === spot ? nearestReachable(this.reach, p) : null;
    if (snap) store.set({ task: { ...store.state.task, [spot]: snap } });
    if (store.state.mode === 'task') store.set({ playing: true });
  }

  private refresh(): void {
    const st = this.studio.store.state;
    const t = this.setup;
    const on = st.mode === 'task' && !!t;
    this.pads.selected = st.task.moving;
    this.pads.show(on);
    this.prop.group.visible = on;
    this.stands.group.visible = on;
    const rig = this.studio.session?.assembly.effector;
    if (rig?.payload) rig.payload.visible = !on;
    if (!on) rig?.grip?.set(rig.grip.rest);
    if (!t) return;
    const bad = this.problem && this.problem.where !== 'path' ? this.problem.where : null;
    // Sized to be found at arm scale, not just to the (often small) object.
    const pad = Math.max(Math.hypot(t.object.size[0], t.object.size[1]) * 0.75, 0.035 * t.radius);
    this.pads.setSpots(st.task.pick, st.task.place, pad, t.surfaceZ, bad);
    this.stands.set([st.task.pick, st.task.place], pad, t.floorZ, t.surfaceZ);
    const at = st.task.pick;
    if (!this.clip && at) this.prop.place({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [at[0], at[1], t.surfaceZ + t.object.size[2] / 2] });
  }

  private sync(snap: Snapshot): void {
    const t = this.setup, clip = this.clip;
    if (this.studio.store.state.mode !== 'task' || !t || !clip || snap.session !== this.studio.session) return;
    t.rig.grip?.set(clip.at(snap.time).gap);
    const s = clip.object(snap.time);
    this.prop.place(s.held ? compose(snap.posed.frames.tip, s.offset) : s.pose);
  }
}
