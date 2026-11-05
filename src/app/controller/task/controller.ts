/** Pick and place for the loaded arm: plans the cycle, keeps pads and object in the scene, drives the jaws. */
import { armFit } from '../../../cad/assembly/mjcf/mounts';
import { fixedTool, ownTool } from '../../../cad/assembly/mjcf/own-tools';
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
import { layoutJob } from './layout-job';
import { reachJob } from './reach-job';
import { TaskStands } from '../../../scene/task/stands';
import { type Arranged, type TaskSetup, partPick, taskSetup, toolLimb, wholeBody } from './setup';
import type { Prop } from '../../../scene/stage/environment';
import * as THREE from 'three';

/** A part's footprint centre on the surface it stands on. */
const fits = (id: string) => !!armFit(id) || !!ownTool(id);

const baseOf = (p: Prop) => {
  const b = new THREE.Box3().setFromObject(p.object), c = b.getCenter(new THREE.Vector3());
  const paint = ((p.object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined)?.color;
  return { label: p.label, size: p.size, base: [c.x, c.y, b.min.z] as Vec3, color: paint ? `#${paint.getHexString()}` : undefined };
};
import { EFFECTOR_KINDS } from '../../../core/robot/effectors/kinds';
import { bodyFor } from '../../robots/body';
import { twinToolIssue } from '../../robots/fitted';

export class TaskController {
  clip: TaskClip | null = null;
  problem: PlanProblem | null = null;
  setup: TaskSetup | null = null;
  /** The setting's loose part the pick starts from, hidden while the planned object stands in for it. */
  private part: Prop | null = null;
  /** Set when no floor or stand height gives this arm a contact-free grasp. */
  private noLayout: string | null = null;
  /** The search for spots can take seconds, so it waits for the user to enter Pick & place, never a robot's load. */
  private laidOut = false;
  private cancelLayout: (() => void) | null = null;
  /** A load that asked for fresh spots, waiting for its layout. */
  private fresh = false;
  /** Height the current spots were chosen for. */
  private spotsZ: number | undefined;
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
    bindFloorClicks(viewport.stage, () => (store.state.mode === 'task' && this.laidOut && !this.pads.gizmo.axis ? this.setup : null),
      () => viewport.robotBodies(), (ray) => viewport.sceneryHit(ray), (p) => this.move(store.state.task.moving, p, true));
    // The viewport fits the setting to a new robot after this event; spots are chosen against that.
    store.on(['sessionVersion'], () => setTimeout(() => this.load(), 0));
    // On a multi-limb robot the focused arm is the one that works.
    store.on(['focus'], () => this.setup?.limb !== undefined && studio.session && toolLimb(studio.session, store.state.focus) !== this.setup.limb && this.load());
    store.on(['task'], () => (this.refresh(), this.schedule()));
    store.on(['mode', 'playing'], () => (this.layOut(), this.refresh()));
    // The viewport rebuilds the setting in its own listener; measure what stands under the spots after it.
    store.on(['surroundings'], () => setTimeout(() => (this.reseat(), this.refresh()), 0));
    studio.bus.on((snap) => this.sync(snap), 1000);
    this.refresh();
  }

  available = () => !!this.setup;
  /** Why pick and place is off for this robot. */
  missing = (): string => {
    const s = this.studio.session;
    const kind = s?.fitted ?? s?.spec?.effector;
    const tool = kind ? EFFECTOR_KINDS[kind] : null;
    if (s?.spec && s.rigs[0] === null) {
      const twin = this.studio.store.state.library.find((e) => e.id === s.id)?.twin;
      return (twin && twinToolIssue(twin)) ?? 'Nothing on the flange. Choose a gripper under Build → End effector.';
    }
    if (tool && !s!.grips) return `A ${tool.label.toLowerCase()} cannot hold anything. Choose a gripper under Build → End effector.`;
    if (s?.prosthesis) return 'A hand on its own has no arm to reach with.';
    const fixed = s && fixedTool(s.id);
    if (fixed) return `This arm carries a ${fixed}, which cannot hold anything.`;
    if (s && !s.spec && !fits(s.id)) return bodyFor(s).parts.some((p) => p.kind === 'arm') ? 'This robot has no hand or gripper to hold anything with.' : 'This robot has no arm to pick with.';
    return `This ${s?.category === 'humanoid' ? 'robot' : 'arm'} has no gripper. Fit one under Build → End effector.`;
  };
  object = () => this.setup?.object.label ?? null;
  onChange = (fn: () => void) => void this.listeners.push(fn);
  status(): { text: string; bad: boolean; busy?: boolean } {
    if (this.cancelLayout) return { text: `Finding spots for the ${this.setup?.object.label.toLowerCase()}…`, bad: false, busy: true };
    if (this.problem) return { text: this.problem.message, bad: true };
    if (this.noLayout) return { text: this.noLayout, bad: true };
    if (!this.clip) return { text: 'Place both spots', bad: true };
    const hand = this.setup?.label ? `${this.setup.label} · ` : '';
    return { text: `${hand}${this.clip.period.toFixed(1)} s cycle · drag the arrows (up too), or click the floor, a table or a belt`, bad: false };
  }

  private load(reset = false): void {
    this.cancelReach();
    this.cancelLayout?.();
    this.cancelLayout = null;
    this.reachZ = null;
    const s = this.studio.session;
    this.setup = s ? taskSetup(s, this.studio.store.state.focus) : null;
    if (!this.setup) this.spotsZ = undefined;
    this.laidOut = false;
    this.fresh ||= reset;
    this.clip = this.problem = this.noLayout = null;
    this.showPart(null);
    this.prop.set(this.setup?.object ?? null);
    this.pads.setReach([], 0);
    this.reach = [];
    this.layOut();
    this.refresh();
    this.listeners.forEach((fn) => fn());
  }

  /** Starts the search for spots once the user is in Pick & place. */
  private layOut(): void {
    const t = this.setup, s = this.studio.session;
    if (!t || this.laidOut || this.cancelLayout || this.studio.store.state.mode !== 'task') return;
    this.cancelLayout = layoutJob(t, (p) => this.clear(p, t), () => this.studio.session === s, (found) => this.settle(found));
    this.listeners.forEach((fn) => fn());
  }

  private settle(arranged: Arranged): void {
    this.cancelLayout = null;
    this.laidOut = true;
    const t = (this.setup = arranged.setup);
    let reset = this.fresh;
    this.fresh = false;
    // Start from a real part on the bench when one is in reach.
    const parts = this.studio.viewport.props().all();
    const real = arranged.spots && parts.length ? partPick(t, arranged.spots, parts.map(baseOf)) : null;
    if (real && arranged.spots) {
      arranged.spots[0] = real.pick;
      t.object = real.object;
      this.part = parts[real.index];
      reset = true;
    }
    this.prop.set(t.object);
    const { task } = this.studio.store.state;
    this.plan();
    // Spots kept from a robot that worked at another height would hang in the air or sink into the floor.
    const stale = !task.pick || !task.place || this.spotsZ === undefined || Math.abs(this.spotsZ - t.surfaceZ) > 1e-9;
    this.spotsZ = t.surfaceZ;
    this.noLayout = !arranged.spots
      ? `No floor or stand height gives this arm a clear grasp from above on the ${t.object.label.toLowerCase()}; click the floor to try a spot`
      : null;
    if (!this.clip || stale || reset) {
      const spots = arranged.spots;
      this.studio.store.set({ task: { ...task, pick: spots?.[0] ?? null, place: spots?.[1] ?? null } });
      // Now, not after the debounce: the panel would flash "Place both spots" as a fault.
      this.plan();
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
    // A new setting with loose parts starts from one of them; otherwise only buried spots move.
    if (t && (this.studio.viewport.props().all().length || (pick && place && !(this.clear(pick, t) && this.clear(place, t))))) this.load(true);
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.plan(), 40);
  }

  private plan(): void {
    clearTimeout(this.timer);
    const t = this.laidOut ? this.setup : null;
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

  private showPart(next: Prop | null): void {
    if (this.part) this.part.object.visible = true;
    this.part = next;
  }

  private refresh(): void {
    const st = this.studio.store.state;
    const t = this.laidOut ? this.setup : null;
    const on = st.mode === 'task' && !!t;
    this.pads.selected = st.task.moving;
    this.pads.show(on);
    // The gizmo and reach dots are for placing spots; over a running cycle they read as debug marks.
    const editing = on && !st.playing;
    this.pads.gizmo.getHelper().visible = editing;
    if (t) this.pads.setReach(editing ? this.reach : [], 0.011 * t.radius);
    this.prop.group.visible = on;
    this.stands.group.visible = on;
    if (this.part) this.part.object.visible = !on;
    const rigs = this.studio.session?.rigs ?? [];
    // Limb markers grab a limb in IK and Trajectory; anywhere else they only read as holes in the robot.
    this.markers(st.mode === 'ik' || st.mode === 'trajectory');
    for (const rig of rigs) {
      if (rig?.payload) rig.payload.visible = st.mode === 'physics';
      if (!on) rig?.grip?.set(rig.grip.rest);
    }
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

  /** Each marker, not the group: the Rubik controller owns the group's flag. */
  private markers(on: boolean): void {
    this.studio.overlays.effectors.group.children.forEach((m) => (m.visible = on));
  }

  private sync(snap: Snapshot): void {
    const t = this.setup, clip = this.clip;
    if (this.studio.store.state.mode !== 'task' || !t || !clip || snap.session !== this.studio.session) return;
    t.rig.grip?.set(clip.at(snap.time).gap);
    const s = clip.object(snap.time);
    const hand = t.limb !== undefined ? snap.posed.limbs[t.limb] : snap.posed.frames;
    this.prop.place(s.held ? compose(hand.tip, s.offset) : s.pose);
  }
}
