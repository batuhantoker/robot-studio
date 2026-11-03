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
import { type TaskSetup, arrange, taskSetup, wholeBody } from './setup';
import { workingArm } from './limb-setup';
import { bodyFor } from '../../robots/body';

export class TaskController {
  clip: TaskClip | null = null;
  problem: PlanProblem | null = null;
  setup: TaskSetup | null = null;
  /** Set when no floor or stand height gives this arm a contact-free grasp. */
  private noLayout: string | null = null;
  private reach: ReachCell[] = [];
  /** Height the reach map was built at: the selected spot's. */
  private reachZ: number | null = null;
  private cancelReach = () => {};
  private timer = 0;
  private readonly prop = new TaskProp();
  private readonly stands = new TaskStands();
  private readonly pads: TaskPads;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly studio: Studio) {
    const { store, viewport } = studio;
    this.pads = new TaskPads(viewport.stage, (spot, p, done) => this.move(spot, p, done));
    this.pads.limit = (p, vertical) => this.limit(p, vertical);
    viewport.overlay.add(this.pads.group);
    viewport.stage.root.add(this.prop.group, this.stands.group);
    bindFloorClicks(viewport.stage, () => (store.state.mode === 'task' && this.setup && !this.pads.gizmo.axis ? this.setup : null),
      () => studio.session?.assembly.root ?? null, (ray) => viewport.sceneryHit(ray), (p) => this.move(store.state.task.moving, p, true));
    // The viewport fits the setting to a new robot after this event; spots are chosen against that.
    store.on(['sessionVersion'], () => setTimeout(() => this.load(), 0));
    // On a multi-limb robot the focused arm is the one that works.
    store.on(['focus'], () => this.setup?.limb !== undefined && studio.session && workingArm(studio.session, store.state.focus) !== this.setup.limb && this.load());
    store.on(['task'], () => (this.refresh(), this.schedule()));
    store.on(['mode'], () => this.refresh());
    // The viewport rebuilds the setting in its own listener; measure what stands under the spots after it.
    store.on(['surroundings'], () => setTimeout(() => (this.reseat(), this.refresh()), 0));
    studio.bus.on((snap) => this.sync(snap), 1000);
    this.refresh();
  }

  available = () => !!this.setup;
  /** Why pick and place is off for this robot. */
  missing = (): string => {
    const s = this.studio.session;
    if (!s || s.source !== 'cad') return 'Needs a gripper: choose one under Build → End effector.';
    return bodyFor(s).parts.some((p) => p.kind === 'arm') ? 'This arm’s own hand is not driven yet; pick and place needs a studio gripper.' : 'This robot has no arm to pick with.';
  };
  object = () => this.setup?.object.label ?? null;
  onChange = (fn: () => void) => void this.listeners.push(fn);
  status(): { text: string; bad: boolean } {
    if (this.problem) return { text: this.problem.message, bad: true };
    if (this.noLayout) return { text: this.noLayout, bad: true };
    if (!this.clip) return { text: 'Place both spots', bad: true };
    const hand = this.setup?.label ? `${this.setup.label} · ` : '';
    return { text: `${hand}${this.clip.period.toFixed(1)} s cycle · drag the arrows (up too), or click the floor, a table or a belt`, bad: false };
  }

  private load(reset = false): void {
    this.cancelReach();
    this.reachZ = null;
    const s = this.studio.session;
    const found = s ? taskSetup(s, this.studio.store.state.focus) : null;
    // Clear of the setting if it can be; a crowded bench shouldn't leave the arm with no spots at all.
    const arranged = found ? arrange(found, (p) => this.clear(p, found)) : null;
    if (found && arranged && !arranged.spots) Object.assign(arranged, arrange(found));
    const before = this.setup?.surfaceZ;
    const t = (this.setup = arranged?.setup ?? null);
    this.prop.set(t?.object ?? null);
    this.pads.setReach([], 0);
    this.reach = [];
    const { task } = this.studio.store.state;
    this.plan();
    // Spots kept from a robot that worked at another height would hang in the air or sink into the floor.
    const stale = !task.pick || !task.place || before === undefined || Math.abs(before - (t?.surfaceZ ?? 0)) > 1e-9;
    this.noLayout = t && !arranged?.spots
      ? `No floor or stand height lets this arm grasp the ${t.object.label.toLowerCase()} without its links touching; click the floor to try a spot`
      : null;
    if (t && (!this.clip || stale || reset)) {
      const spots = arranged?.spots;
      this.studio.store.set({ task: { ...task, pick: spots?.[0] ?? null, place: spots?.[1] ?? null } });
    }
    this.refresh();
    setTimeout(() => this.refresh(), 0);
  }

  /** Nothing of the setting (a tote, an instrument, a blank) stands where the object would. */
  private clear(p: Vec3, t: TaskSetup): boolean {
    const r = 0.6 * Math.hypot(t.object.size[0], t.object.size[1]), top = p[2] + t.object.size[2];
    const { viewport } = this.studio;
    return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => viewport.supportBelow(p[0] + dx, p[1] + dy, top) <= p[2] + 0.002 * t.radius);
  }

  /** A new setting that buries a spot gets fresh, clear ones; spots it leaves clear stay where the user put them. */
  private reseat(): void {
    const t = this.setup, { pick, place } = this.studio.store.state.task;
    if (t && pick && place && !(this.clear(pick, t) && this.clear(place, t))) this.load(true);
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.plan(), 40);
  }

  private plan(): void {
    clearTimeout(this.timer);
    const t = this.setup;
    const { pick, place } = this.studio.store.state.task;
    const planned = t && pick && place ? planTask({ ctx: t.ctx, home: t.home, pick, place, object: t.object, lift: t.lift, base: t.base }, t.probe) : null;
    const result = planned && t?.expand && isClip(planned) ? wholeBody(planned, t.expand) : planned;
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
    // The reach map only speaks for the height it was built at.
    const mapped = this.reachZ !== null && Math.abs(this.reachZ - p[2]) < 1e-6;
    let snap = this.problem?.where === spot && mapped ? nearestReachable(this.reach, p) : null;
    // Don't slide a spot off the belt or bench it was set on.
    const { viewport } = this.studio;
    if (snap && Math.abs(viewport.supportBelow(snap[0], snap[1], snap[2]) - viewport.supportBelow(p[0], p[1], p[2])) > 1e-4) snap = null;
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
    this.pads.setSpots(st.task.pick, st.task.place, pad, bad);
    const { viewport } = this.studio;
    this.stands.set([st.task.pick, st.task.place].filter((p): p is Vec3 => !!p).map((p) => [p, viewport.supportBelow(p[0], p[1], p[2])]), pad);
    const at = st.task.pick;
    if (!this.clip && at) this.prop.place({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [at[0], at[1], at[2] + t.object.size[2] / 2] });
    if (on && !this.pads.gizmo.dragging) this.mapReach(t, (st.task.moving === 'pick' ? st.task.pick : st.task.place)?.[2] ?? t.surfaceZ);
  }

  /** Rebuild the reach dots when the selected spot sits at another height than the map. */
  private mapReach(t: TaskSetup, z: number): void {
    if (this.reachZ !== null && Math.abs(this.reachZ - z) < 1e-6) return;
    this.cancelReach();
    this.reachZ = z;
    this.reach = [];
    this.pads.setReach([], 0);
    this.cancelReach = reachJob(t, z, (cells) => ((this.reach = cells), this.pads.setReach(cells, 0.011 * t.radius)));
  }

  /** A dragged spot stays between the robot's floor and its reach, and lands on a surface lowered within a few millimetres of it. */
  private limit(p: Vec3, vertical: boolean): number {
    const t = this.setup;
    if (!t) return p[2];
    const z = Math.min(Math.max(p[2], t.floorZ), t.base[2] + t.radius);
    if (!vertical) return z;
    const below = this.studio.viewport.supportBelow(p[0], p[1], z + 0.03 * t.radius);
    return below >= t.floorZ && Math.abs(z - below) < 0.03 * t.radius ? below : z;
  }

  private sync(snap: Snapshot): void {
    const t = this.setup, clip = this.clip;
    if (this.studio.store.state.mode !== 'task' || !t || !clip || snap.session !== this.studio.session) return;
    t.rig?.grip?.set(clip.at(snap.time).gap);
    const s = clip.object(snap.time);
    const hand = t.limb !== undefined ? snap.posed.limbs[t.limb] : snap.posed.frames;
    this.prop.place(s.held ? compose(hand.tip, s.offset) : s.pose);
  }
}
