/** Live MuJoCo tracking, one scored run after another, for any robot: on its stand, or on a floor it can fall over on. */
import type { SimReadout } from '../../live/bus';
import type { RobotSession } from '../../robots/session';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import { movesJoints } from '../../../core/control/motion';
import type { RunScore, RunStats } from '../../../core/control/score';
import { type Transform, quatToMat } from '../../../core/math/linear/transform';
import type { Vec3 } from '../../../core/math/linear/vec';
import { isPassive } from '../../../core/robot/config/passive';
import type { Plan } from '../../../core/trajectory/plan';
import { defaultWaypoints } from '../../../core/trajectory/quintic/sample';
import { type Rig, floorRig, hasCollision, standRig } from '../../../physics/control/rig';
import { type Reference, type RunFrame, runScore, sampleReference } from '../../../physics/control/rollout';
import { STAND_SECONDS } from '../../../physics/control/stand';
import { TrackingSim } from '../../../physics/control/tracking';
import { compileFloorCopy } from '../../../physics/model/floor-copy';
import { catalog, fetchRobotFiles } from '../../robots/catalog';
import { jointLimits } from '../../robots/focus';
import { ControlLab } from '../learn/lab';
import type { Method } from '../learn/run';
import { player } from './trajectory';

export interface PhysicsHistory {
  t: number[];
  error: number[][];
  applied: number[][];
  requested: number[][];
}

/** What the mode draws on the stage. */
export interface PhysicsStage {
  newRun(): void;
  addRun(path: Vec3[], score: number): void;
  clearRuns(): void;
  /** Carry the robot on its simulated root; null hands it back to its grounding. */
  setBody(pose: Transform | null): void;
}

interface Bench {
  rig: Rig;
  sim: TrackingSim;
  lab: ControlLab;
}

interface Replay {
  frames: RunFrame[];
  stats: RunStats;
  /** Share of the run shown so far. */
  at: number;
}

const KEEP = 600;
/** Seconds the robot takes to replay one practice run; whatever finishes meanwhile only reaches the fan. */
const REPLAY_SECONDS = 0.9;
/** Physics gets this much of a frame (ms); heavy robots fall behind real time instead of stalling the page. */
const STEP_BUDGET = 6;
/** A learner's share of each frame, so it practises as fast as the machine allows and no faster. */
const LEARN_SHARE = 0.55;
const LEARN_MAX = 40;
const MAX_LAG = 0.05;
/** A balance lesson runs past the scored test, or the network learns to last exactly that long. */
const BALANCE_SECONDS = 8;
/** A robot with no motors has nothing to track: it is simply let go, for this long. */
const FREE_SECONDS = 60;

const emptyHistory = (): PhysicsHistory => ({ t: [], error: [], applied: [], requested: [] });

export class PhysicsMode {
  readonly reason: string | null = null;
  readonly passive: boolean;
  history = emptyHistory();
  last: SimReadout | null = null;
  /** The run in progress, so far. */
  current: RunStats | null = null;
  /** The trajectory leaves the judged joints still, so the lab is running its own test motion. */
  ownMotion = false;
  private readonly onStand: Bench | null = null;
  private floorBench: Bench | null = null;
  private bench: Bench | null = null;
  private wall = 0;
  private step = 0;
  private run: RunScore | null = null;
  /** Gains changed partway, so this run says nothing about either set. */
  private mixed = false;
  private reference: Reference | null = null;
  private referencePlan: Plan | null = null;
  private referenceLimb = -1;
  private holdHome: Reference | null = null;
  private restartPending = false;
  private disposed = false;
  /** The limb this run is judging. */
  private limb = 0;
  private replay: Replay | null = null;
  private waiting: Replay | null = null;
  /** Step the robot fell on, this run. */
  private fell: number | null = null;
  private shoveLeft = 0;
  private target = new Float64Array(0);

  constructor(readonly session: RobotSession, private readonly focus: () => number, private readonly stage: PhysicsStage) {
    this.passive = isPassive(session.spec);
    if (!session.joints.length) {
      this.reason = 'This model has no joints to drive.';
      return;
    }
    const rig = standRig(session);
    if (!rig.plant.driven.some(Boolean)) {
      this.reason = 'Nothing on this model can be driven: an equality constraint moves every joint.';
      return;
    }
    this.onStand = this.bench = this.benchFor(rig);
    // The lab's private MjData and the plant's restore both need the model still alive.
    const dispose = session.dispose;
    session.dispose = () => {
      this.dispose();
      dispose.call(session);
    };
  }

  get sim(): TrackingSim | null {
    return this.bench?.sim ?? null;
  }

  get lab(): ControlLab | null {
    return this.bench?.lab ?? null;
  }

  get onFloor(): boolean {
    return !!this.bench?.rig.stand;
  }

  /** Why this robot can't go on a floor, or null when it can; undefined when the idea doesn't apply. */
  get floorBlock(): string | null | undefined {
    const s = this.session;
    // A drone sitting on the ground would pass the stand test by doing nothing.
    if (s.base === 'fixed' || s.category === 'aerial' || s.source !== 'cad' || ('fitted' in s && s.fitted) || !this.catalogEntry()) return undefined;
    return hasCollision(s.handle) ? null : 'This model has no collision shapes, so nothing on it can touch a floor.';
  }

  /** Put the robot on the floor or back on its stand; returns why not, if it can't. */
  async setFloor(on: boolean, plan: Plan): Promise<string | null> {
    if (on === this.onFloor || !this.onStand) return null;
    this.bench?.lab.halt();
    this.bench?.rig.plant.leave();
    if (on && !this.floorBench) {
      const robot = this.catalogEntry();
      if (!robot) return 'This robot has no model to put on a floor.';
      try {
        const handle = await compileFloorCopy(await fetchRobotFiles(robot), robot.xml);
        if (this.disposed) {
          handle.dispose();
          return null;
        }
        this.floorBench = this.benchFor(floorRig(this.onStand.rig, handle));
      } catch (e) {
        this.bench!.rig.plant.enter();
        const why = (e as Error).message ?? String(e);
        return /alloc|memory/i.test(why) ? 'Not enough memory for a second copy of this robot, so it stays on its stand.' : `This model can’t go on a floor: ${why}`;
      }
    }
    this.bench = on ? this.floorBench : this.onStand;
    if (!on) this.stage.setBody(null);
    this.stage.clearRuns();
    this.reset(plan);
    return null;
  }

  /** Push the robot, right now. */
  shove(): void {
    const stand = this.bench?.rig.stand;
    if (!stand) return;
    this.shoveLeft = stand.shoveSteps;
    this.mixed = true;
  }

  reset(plan: Plan): void {
    if (!this.bench || this.disposed) return;
    this.bench.rig.plant.enter();
    this.begin(this.referenceFor(plan));
  }

  /** Leaving the mode: the shared model goes back to what the other modes expect. */
  release(): void {
    for (const b of [this.onStand, this.floorBench]) {
      b?.lab.halt();
      b?.rig.plant.leave();
    }
    this.stage.clearRuns();
    this.stage.setBody(null);
  }

  learn(method: Method, plan: Plan): void {
    this.stage.clearRuns();
    this.replay = this.waiting = null;
    const { rig, sim } = this.bench!;
    if (method === 'balance') {
      const hold = { q: rig.home, qd: rig.home.map(() => 0) };
      this.lab?.learn(method, sampleReference(() => hold, BALANCE_SECONDS, sim.dt));
    } else this.lab?.learn(method, this.referenceFor(plan));
  }

  /** Advance simulated time to follow wall time; returns joint positions. */
  advance(dtWall: number, plan: Plan): number[] | null {
    if (!this.bench) return null;
    // A robot loaded while already in this mode never got the mode's entry reset.
    if (!this.run) this.reset(plan);
    const { sim, lab, rig } = this.bench;
    if (lab.running) return this.showPractice(dtWall);
    const ref = this.referenceFor(plan);
    if (this.restartPending || ref !== this.reference || this.limb !== this.focus()) this.begin(ref);
    const target = this.target;
    this.wall += Math.min(dtWall, MAX_LAG);
    const deadline = performance.now() + STEP_BUDGET;
    while (sim.time < this.wall) {
      if (this.step >= ref.q.length) {
        this.endRun();
        this.begin(ref);
        break;
      }
      if (rig.stand) {
        const up = rig.stand.watch(rig.handle.data, this.step, this.shoveLeft > 0);
        if (this.shoveLeft > 0) this.shoveLeft--;
        if (!up && this.fell === null) this.fell = this.step;
      }
      const net = lab.balance && lab.theta;
      if (net && this.step % lab.balance!.every === 0) lab.balance!.update(rig.handle.data, net, target);
      this.last = sim.step(net ? target : ref.q[this.step], ref.qd[this.step]);
      if (this.fell === null) this.run!.add(this.last.error, this.last.applied, this.last.saturated);
      this.step++;
      if ((this.step & 15) === 0 && performance.now() > deadline) break;
    }
    this.wall = Math.min(this.wall, sim.time + MAX_LAG);
    sim.sync();
    this.current = this.statsNow(ref);
    if (this.last) this.record(sim.time);
    const q = sim.q();
    if (rig.stand) {
      const a = rig.stand.rootAdr;
      this.draw(q, Array.from((rig.handle.data as unknown as { qpos: Float64Array }).qpos.subarray(a, a + 7)));
    }
    return q;
  }

  /** Give whatever is running headless its slice of this frame. */
  tick(dt: number): void {
    this.lab?.tick(performance.now() + Math.min(LEARN_SHARE * dt * 1000, LEARN_MAX));
  }

  dispose(): void {
    if (this.disposed) return;
    this.release();
    this.disposed = true;
    this.floorBench?.rig.handle.dispose();
  }

  private benchFor(rig: Rig): Bench {
    const lab = new ControlLab(this.session, rig, this.focus, {
      onGains: (restart) => this.gainsChanged(restart),
      onPractice: (frames, stats) => this.practised(frames, stats),
      reference: () => this.reference,
    });
    const sim = new TrackingSim(rig.handle, rig.qposAdr, rig.dofAdr, lab.toGains(lab.gains), rig.rest, {
      driven: rig.plant.driven, held: rig.plant.held, routes: rig.plant.routes, compensate: lab.compensate,
    });
    return { rig, sim, lab };
  }

  private catalogEntry() {
    return catalog()?.robots.find((r) => r.id === this.session.id);
  }

  /** The session's own model is what gets drawn, so the floor copy's pose is carried over to it. */
  private draw(q: ArrayLike<number>, root: number[]): void {
    this.onStand!.sim.show(q);
    const lift = this.session.assembly.floorZ - this.bench!.rig.floorZ;
    this.stage.setBody({ R: quatToMat(root.slice(3)), p: [root[0], root[1], root[2] + lift] });
  }

  private statsNow(ref: Reference): RunStats {
    return this.run!.stats((this.fell ?? ref.q.length) / ref.q.length);
  }

  private referenceFor(plan: Plan): Reference {
    const { rig, sim } = this.bench!;
    if (rig.stand) {
      this.ownMotion = false;
      const hold = { q: rig.home, qd: rig.home.map(() => 0) };
      return (this.holdHome ??= sampleReference(() => hold, STAND_SECONDS, sim.dt));
    }
    const p = this.referencePlan;
    const same = p && p.waypoints === plan.waypoints && p.duration === plan.duration && p.opts === plan.opts && p.pace === plan.pace;
    if (same && this.reference && this.reference !== this.holdHome && this.referenceLimb === this.focus()) return this.reference;
    this.referencePlan = plan;
    this.referenceLimb = this.focus();
    const limits = jointLimits(this.session);
    this.ownMotion = !movesJoints(plan.waypoints, this.lab!.judged());
    const played = this.ownMotion ? { waypoints: defaultWaypoints(limits, this.session.home), duration: plan.duration } : plan;
    return sampleReference(player(limits, played), this.passive ? FREE_SECONDS : plan.duration, sim.dt);
  }

  private begin(ref: Reference): void {
    const { sim, lab, rig } = this.bench!;
    this.reference = ref;
    this.target = Float64Array.from(ref.q[0]);
    sim.gains = lab.toGains(lab.gains);
    sim.compensate = lab.compensate;
    sim.reset(Array.from(ref.q[0]));
    this.run = runScore({ joints: lab.judged(), limits: lab.limits, stand: rig.stand });
    this.history = emptyHistory();
    this.limb = this.focus();
    this.stage.newRun();
    this.replay = this.waiting = null;
    this.fell = null;
    this.shoveLeft = 0;
    this.wall = 0;
    this.step = 0;
    this.mixed = false;
    this.restartPending = false;
    this.current = null;
    this.last = null;
  }

  private endRun(): void {
    if (!this.mixed) this.lab!.record(this.statsNow(this.reference!));
  }

  private gainsChanged(restart: boolean): void {
    const { sim, lab } = this.bench!;
    sim.gains = lab.toGains(lab.gains);
    sim.compensate = lab.compensate;
    this.mixed = true;
    if (restart) this.restartPending = true;
    if (!lab.running) this.stage.clearRuns();
  }

  private practised(frames: RunFrame[], stats: RunStats): void {
    const { limbs } = this.session;
    const limb = limbs[Math.min(this.focus(), limbs.length - 1)];
    // Overlays ride with a carried robot, so a path on a floor wouldn't stay where it was drawn.
    if (!this.onFloor) this.stage.addRun(frames.map((f) => chainFrames(limb.chain, limbQ(limb, f.q)).tip.p), stats.score);
    this.waiting = { frames, stats, at: 0 };
  }

  /** The robot on stage races through the newest finished run while the learner works behind it. */
  private showPractice(dtWall: number): number[] {
    const sim = this.sim!;
    if (!this.replay || this.replay.at >= 1) {
      if (!this.waiting) return sim.q();
      this.replay = this.waiting;
      this.waiting = null;
      this.stage.newRun();
      this.history = emptyHistory();
    }
    const r = this.replay;
    r.at += dtWall / REPLAY_SECONDS;
    const i = Math.min(Math.floor(r.at * r.frames.length), r.frames.length - 1);
    const f = r.frames[i];
    if (f.root) this.draw(f.q, f.root);
    else sim.show(f.q);
    this.current = r.stats;
    this.last = { requested: f.applied, applied: f.applied, error: f.error, saturated: f.applied.map(() => false) };
    this.record(((this.reference?.q.length ?? 0) * sim.dt * i) / r.frames.length);
    return f.q;
  }

  private record(t: number): void {
    const h = this.history;
    h.t.push(t);
    h.error.push(this.last!.error);
    h.applied.push(this.last!.applied);
    h.requested.push(this.last!.requested);
    if (h.t.length > KEEP) for (const k of ['t', 'error', 'applied', 'requested'] as const) h[k].shift();
  }
}
