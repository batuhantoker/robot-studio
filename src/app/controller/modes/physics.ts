/** Live MuJoCo tracking of the current trajectory, one scored run after another, for any robot. */
import type { SimReadout } from '../../live/bus';
import type { RobotSession } from '../../robots/session';
import { movesJoints } from '../../../core/control/motion';
import { RunScore, type RunStats } from '../../../core/control/score';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import type { Vec3 } from '../../../core/math/linear/vec';
import { defaultWaypoints } from '../../../core/trajectory/quintic/sample';
import { Plant } from '../../../physics/control/plant';
import { type Reference, type RunFrame, sampleReference } from '../../../physics/control/rollout';
import { TrackingSim } from '../../../physics/control/tracking';
import { jointLimits } from '../../robots/focus';
import type { Plan } from '../../../core/trajectory/plan';
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

export class PhysicsMode {
  readonly sim: TrackingSim | null = null;
  readonly plant: Plant | null = null;
  readonly lab: ControlLab | null = null;
  readonly reason: string | null = null;
  history: PhysicsHistory = { t: [], error: [], applied: [], requested: [] };
  last: SimReadout | null = null;
  /** The run in progress, so far. */
  current: RunStats | null = null;
  /** The trajectory leaves the judged joints still, so the lab is running its own test motion. */
  ownMotion = false;
  private wall = 0;
  private step = 0;
  private run: RunScore | null = null;
  /** Gains changed partway, so this run says nothing about either set. */
  private mixed = false;
  private reference: Reference | null = null;
  private referencePlan: Plan | null = null;
  private referenceLimb = -1;
  private restartPending = false;
  private disposed = false;
  /** The limb this run is judging. */
  private limb = 0;
  private replay: Replay | null = null;
  private waiting: Replay | null = null;

  constructor(readonly session: RobotSession, private readonly focus: () => number, private readonly stage: PhysicsStage) {
    if (!session.joints.length) {
      this.reason = 'This model has no joints to drive.';
      return;
    }
    const plant = new Plant(session);
    if (!plant.driven.some(Boolean)) {
      this.reason = 'Nothing on this model can be driven: an equality constraint moves every joint.';
      return;
    }
    this.plant = plant;
    const lab = new ControlLab(session, plant, focus, (restart) => this.gainsChanged(restart), (frames, stats) => this.practised(frames, stats));
    this.lab = lab;
    this.sim = new TrackingSim(session.handle, session.qposAdr, session.dofAdr, lab.toGains(lab.gains), session.rest, { driven: plant.driven, held: plant.held, routes: plant.routes, compensate: lab.compensate });
    // The lab's private MjData and the plant's restore both need the model still alive.
    const dispose = session.dispose;
    session.dispose = () => {
      this.dispose();
      dispose.call(session);
    };
  }

  reset(plan: Plan): void {
    if (!this.sim || this.disposed) return;
    this.plant!.enter();
    this.begin(this.referenceFor(plan));
  }

  /** Leaving the mode: the shared model goes back to what the other modes expect. */
  release(): void {
    this.lab?.stopLearning();
    this.plant?.leave();
    this.stage.clearRuns();
  }

  learn(method: Method, plan: Plan): void {
    this.stage.clearRuns();
    this.replay = this.waiting = null;
    this.lab?.learn(method, this.referenceFor(plan));
  }

  /** Advance simulated time to follow wall time; returns joint positions. */
  advance(dtWall: number, plan: Plan): number[] | null {
    const { sim } = this;
    if (!sim) return null;
    // A robot loaded while already in this mode never got the mode's entry reset.
    if (!this.run) this.reset(plan);
    if (this.lab!.running) return this.showPractice(dtWall);
    const ref = this.referenceFor(plan);
    if (this.restartPending || ref !== this.reference || this.limb !== this.focus()) this.begin(ref);
    this.wall += Math.min(dtWall, MAX_LAG);
    const deadline = performance.now() + STEP_BUDGET;
    while (sim.time < this.wall) {
      if (this.step >= ref.q.length) {
        this.endRun();
        this.begin(ref);
        break;
      }
      this.last = sim.step(ref.q[this.step], ref.qd[this.step]);
      this.run!.add(this.last.error, this.last.applied, this.last.saturated);
      this.step++;
      if ((this.step & 15) === 0 && performance.now() > deadline) break;
    }
    this.wall = Math.min(this.wall, sim.time + MAX_LAG);
    sim.sync();
    this.current = this.run!.stats();
    if (this.last) this.record(sim.time);
    return sim.q();
  }

  /** Give a running learner its slice of this frame. */
  tick(dt: number): void {
    this.lab?.tick(performance.now() + Math.min(LEARN_SHARE * dt * 1000, LEARN_MAX));
  }

  dispose(): void {
    if (this.disposed) return;
    this.release();
    this.disposed = true;
  }

  private referenceFor(plan: Plan): Reference {
    const p = this.referencePlan;
    const same = p && p.waypoints === plan.waypoints && p.duration === plan.duration && p.opts === plan.opts && p.pace === plan.pace;
    if (same && this.reference && this.referenceLimb === this.focus()) return this.reference;
    this.referencePlan = plan;
    this.referenceLimb = this.focus();
    const limits = jointLimits(this.session);
    this.ownMotion = !movesJoints(plan.waypoints, this.lab!.judged());
    const played = this.ownMotion ? { waypoints: defaultWaypoints(limits, this.session.home), duration: plan.duration } : plan;
    return (this.reference = sampleReference(player(limits, played), plan.duration, this.sim!.dt));
  }

  private begin(ref: Reference): void {
    const { sim, lab } = this;
    this.reference = ref;
    sim!.gains = lab!.toGains(lab!.gains);
    sim!.compensate = lab!.compensate;
    sim!.reset(Array.from(ref.q[0]));
    this.run = new RunScore(lab!.judged(), lab!.limits);
    this.history = { t: [], error: [], applied: [], requested: [] };
    this.limb = this.focus();
    this.stage.newRun();
    this.replay = this.waiting = null;
    this.wall = 0;
    this.step = 0;
    this.mixed = false;
    this.restartPending = false;
    this.current = null;
    this.last = null;
  }

  private endRun(): void {
    if (!this.mixed) this.lab!.record(this.run!.stats());
  }

  private gainsChanged(restart: boolean): void {
    const { sim, lab } = this;
    if (!sim || !lab) return;
    sim.gains = lab.toGains(lab.gains);
    sim.compensate = lab.compensate;
    this.mixed = true;
    if (restart) this.restartPending = true;
    if (!lab.running) this.stage.clearRuns();
  }

  private practised(frames: RunFrame[], stats: RunStats): void {
    const { limbs } = this.session;
    const limb = limbs[Math.min(this.focus(), limbs.length - 1)];
    this.stage.addRun(frames.map((f) => chainFrames(limb.chain, limbQ(limb, f.q)).tip.p), stats.score);
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
      this.history = { t: [], error: [], applied: [], requested: [] };
    }
    const r = this.replay;
    r.at += dtWall / REPLAY_SECONDS;
    const i = Math.min(Math.floor(r.at * r.frames.length), r.frames.length - 1);
    const f = r.frames[i];
    sim.show(f.q);
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
