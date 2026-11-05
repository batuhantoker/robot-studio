/** The control lab behind Physics mode: the gains on the robot, every attempt at them, and the learner. */
import { type GainKey, type Pid, clampGain, firstGuess, gainRange, inertiaRule } from '../../../core/control/gains';
import type { RunStats } from '../../../core/control/score';
import type { Plant } from '../../../physics/control/plant';
import type { Reference, RolloutSetup, RunFrame } from '../../../physics/control/rollout';
import type { Gains } from '../../../physics/control/tracking';
import type { RobotSession } from '../../robots/session';
import { LearnRun, type Method } from './run';

export interface Attempt {
  who: 'you' | 'ai';
  stats: RunStats;
  gains: Pid[];
  compensate: boolean;
}

export class ControlLab {
  gains: Pid[];
  compensate = false;
  learner: LearnRun | null = null;
  private readonly boards = new Map<number, Attempt[]>();
  /** Where a running learner reports; set only while one runs. */
  private board: Attempt[] | null = null;
  private readonly start: Pid[];
  private readonly listeners = new Set<() => void>();
  private seed = 1;

  constructor(
    private readonly session: RobotSession,
    private readonly plant: Plant,
    private readonly focus: () => number,
    /** New gains are on the robot; `restart` runs the motion again from the top. */
    private readonly onGains: (restart: boolean) => void,
    /** A learner finished one more run. */
    private readonly onPractice: (frames: RunFrame[], stats: RunStats) => void,
  ) {
    const spec = session.spec;
    this.start = spec ? spec.links.flatMap((l) => l.dofs.map(() => ({ kp: l.kp, ki: 0, kd: l.kd }))) : firstGuess(plant.inertia);
    this.gains = this.start.map((g) => ({ ...g }));
  }

  get running(): boolean {
    return !!this.board;
  }

  get limits(): number[] {
    return this.plant.limits;
  }

  /** Whether the torque limits on the focused limb are our estimate. */
  get estimatedLimits(): boolean {
    return this.judged().some((k) => this.plant.estimated[k]);
  }

  /** Joints on the focused limb a controller can actually drive: the ones tuned and scored. */
  judged(): number[] {
    const limb = this.session.limbs[Math.min(this.focus(), this.session.limbs.length - 1)];
    const own = limb.index.filter((k) => this.plant.driven[k]);
    // A soft hand's fingers all follow one tendon joint elsewhere on the robot.
    return own.length ? own : this.plant.driven.flatMap((d, k) => (d ? [k] : []));
  }

  /** The base stays where it is: no model here has a free joint, so nothing can fall over yet. */
  get onStand(): boolean {
    return this.session.base !== 'fixed';
  }

  range(k: number, key: GainKey) {
    return gainRange(this.plant.inertia[k], key, this.start[k][key]);
  }

  attempts(): Attempt[] {
    const limb = this.focus();
    if (!this.boards.has(limb)) this.boards.set(limb, []);
    return this.boards.get(limb)!;
  }

  best(who: Attempt['who']): Attempt | null {
    return this.attempts().filter((a) => a.who === who).reduce<Attempt | null>((b, a) => (!b || a.stats.score > b.stats.score ? a : b), null);
  }

  toGains(pid: Pid[]): Gains[] {
    return pid.map((g, k) => ({ ...g, limit: this.plant.limits[k] }));
  }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setGain(k: number, key: GainKey, value: number, restart: boolean): void {
    this.gains[k] = { ...this.gains[k], [key]: value === 0 ? 0 : clampGain(value, this.range(k, key)) };
    this.onGains(restart);
  }

  setCompensate(on: boolean): void {
    this.stopLearning();
    this.compensate = on;
    this.onGains(true);
    this.emit();
  }

  /** Back to where the lab opened, or the textbook rule for the joints in view. */
  use(preset: 'start' | 'rule'): void {
    const rule = inertiaRule(this.plant.inertia);
    for (const k of this.judged()) this.gains[k] = { ...(preset === 'rule' ? rule[k] : this.start[k]) };
    this.onGains(true);
    this.emit();
  }

  /** A clean run of the motion ended on these gains. */
  record(stats: RunStats): void {
    if (this.running) return;
    const list = this.attempts();
    const same = (a: Attempt) => a.compensate === this.compensate && a.gains.every((g, k) => g.kp === this.gains[k].kp && g.ki === this.gains[k].ki && g.kd === this.gains[k].kd);
    if (!list.some(same)) list.push({ who: 'you', stats, gains: this.gains.map((g) => ({ ...g })), compensate: this.compensate });
    this.emit();
  }

  learn(method: Method, reference: Reference): void {
    this.stopLearning();
    const joints = this.judged();
    const setup: RolloutSetup = {
      handle: this.session.handle,
      qposAdr: this.session.qposAdr,
      dofAdr: this.session.dofAdr,
      rest: this.session.rest,
      options: { driven: this.plant.driven, held: this.plant.held, routes: this.plant.routes, compensate: this.compensate },
      joints,
      limits: this.plant.limits,
    };
    this.board = this.attempts();
    this.learner = new LearnRun(setup, reference, this.gains.map((g) => ({ ...g })), { joints, inertia: this.plant.inertia }, method, this.seed++, {
      toGains: (g) => this.toGains(g),
      onBest: (gains) => this.adopt(gains),
      onRun: (frames, stats) => this.onPractice(frames, stats),
    });
    this.emit();
  }

  stopLearning(): void {
    if (!this.running) return;
    this.learner!.stop();
    this.concluded();
  }

  /** Spend this frame's budget on the learner. */
  tick(deadline: number): void {
    if (!this.running) return;
    this.learner!.tick(deadline);
    if (this.learner!.done) this.concluded();
  }

  private adopt(gains: Pid[]): void {
    this.gains = gains.map((g) => ({ ...g }));
    this.onGains(true);
  }

  private concluded(): void {
    const { best } = this.learner!;
    if (best.stats.score >= 0) {
      this.adopt(best.gains);
      this.board!.push({ who: 'ai', stats: best.stats, gains: best.gains, compensate: this.compensate });
    }
    this.board = null;
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
