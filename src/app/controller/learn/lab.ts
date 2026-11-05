/** The control lab behind Physics mode: the gains on the robot, every attempt at them, and the learner. */
import { type GainKey, type Pid, clampGain, firstGuess, gainRange, inertiaRule, jointRole } from '../../../core/control/gains';
import type { RunStats } from '../../../core/control/score';
import type { Rig } from '../../../physics/control/rig';
import { Rollout, type Reference, type RolloutSetup, type RunFrame } from '../../../physics/control/rollout';
import type { Gains } from '../../../physics/control/tracking';
import type { RobotSession } from '../../robots/session';
import { BalancePolicy } from '../../../physics/control/balance';
import { type BalanceResult, BalanceRun } from './balance-run';
import { LearnRun, type Lesson, type Method } from './run';
import { type SavedGains, loadGains, saveGains } from './saved';

export interface Attempt {
  who: 'you' | 'ai';
  stats: RunStats;
  gains: Pid[];
  compensate: boolean;
}

export interface GainGroup {
  label: string;
  joints: number[];
}

export type Scope = 'limb' | 'robot';

export interface LabHooks {
  /** New gains are on the robot; `restart` runs the motion again from the top. */
  onGains(restart: boolean): void;
  /** A learner finished one more run. */
  onPractice(frames: RunFrame[], stats: RunStats): void;
  /** The motion runs are judged on, once there is one. */
  reference(): Reference | null;
}

export class ControlLab {
  gains: Pid[];
  compensate = false;
  learner: Lesson | null = null;
  scope: Scope;
  /** The balance network on the robot now, if any. */
  theta: number[] | null = null;
  readonly balance: BalancePolicy | null;
  private readonly boards = new Map<string, Attempt[]>();
  /** Where a running learner reports; set only while one runs. */
  private board: Attempt[] | null = null;
  private readonly start: Pid[];
  private readonly listeners = new Set<() => void>();
  private seed = 1;
  /** A headless try of what the faders just set, so a score comes back at once. */
  private trial: Rollout | null = null;

  constructor(
    private readonly session: RobotSession,
    private readonly rig: Rig,
    private readonly focus: () => number,
    private readonly hooks: LabHooks,
  ) {
    const spec = rig.stand ? null : session.spec;
    this.start = spec ? spec.links.flatMap((l) => l.dofs.map(() => ({ kp: l.kp, ki: 0, kd: l.kd }))) : firstGuess(rig.plant.inertia);
    this.gains = this.start.map((g) => ({ ...g }));
    this.scope = rig.stand ? 'robot' : 'limb';
    const dt = (rig.handle.model.opt as unknown as { timestep: number }).timestep;
    const policy = rig.stand ? new BalancePolicy(rig.stand, session.joints.map((j) => j.name), rig.plant.driven, rig.home, dt) : null;
    this.balance = policy?.usable ? policy : null;
  }

  /** Joints that can't hold the robot up at home, and what they'd need. */
  get overloaded(): { name: string; needs: number; has: number }[] {
    const { holding, limits, driven } = this.rig.plant;
    return this.session.joints.flatMap((j, k) => (driven[k] && holding[k] > limits[k] ? [{ name: j.name, needs: holding[k], has: limits[k] }] : []));
  }

  get result(): BalanceResult | null {
    return this.learner instanceof BalanceRun ? this.learner.result : null;
  }

  get running(): boolean {
    return !!this.board;
  }

  get limits(): number[] {
    return this.rig.plant.limits;
  }

  get onFloor(): boolean {
    return !!this.rig.stand;
  }

  /** Whether the torque limits in view are our estimate. */
  get estimatedLimits(): boolean {
    return this.judged().some((k) => this.rig.plant.estimated[k]);
  }

  /** The base stays where it is. */
  get onStand(): boolean {
    return !this.rig.stand && this.session.base !== 'fixed';
  }

  /** What the faders move: joint by joint on one limb, or by role across the robot, so a robot's four knees are one fader. */
  groups(): GainGroup[] {
    const { driven } = this.rig.plant;
    const names = this.session.joints.map((j) => j.name);
    if (this.scope === 'limb') {
      const limb = this.session.limbs[Math.min(this.focus(), this.session.limbs.length - 1)];
      const own = limb.index.filter((k) => driven[k]);
      // A soft hand's fingers all follow one tendon joint elsewhere on the robot.
      const joints = own.length ? own : driven.flatMap((d, k) => (d ? [k] : []));
      return joints.map((k) => ({ label: jointRole(names[k]), joints: [k] }));
    }
    const roles = new Map<string, number[]>();
    driven.forEach((d, k) => {
      if (d) roles.set(jointRole(names[k]), [...(roles.get(jointRole(names[k])) ?? []), k]);
    });
    return [...roles].map(([label, joints]) => ({ label, joints }));
  }

  /** The joints being tuned and scored. */
  judged(): number[] {
    return this.groups().flatMap((g) => g.joints);
  }

  range(k: number, key: GainKey) {
    return gainRange(this.rig.plant.inertia[k], key, this.start[k][key]);
  }

  attempts(): Attempt[] {
    const slot = this.boardSlot();
    if (!this.boards.has(slot)) this.boards.set(slot, []);
    return this.boards.get(slot)!;
  }

  best(who: Attempt['who']): Attempt | null {
    return this.attempts().filter((a) => a.who === who).reduce<Attempt | null>((b, a) => (!b || a.stats.score > b.stats.score ? a : b), null);
  }

  toGains(pid: Pid[]): Gains[] {
    return pid.map((g, k) => ({ ...g, limit: this.limits[k] }));
  }

  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setGain(group: GainGroup, key: GainKey, value: number, restart: boolean): void {
    for (const k of group.joints) this.gains[k] = { ...this.gains[k], [key]: value === 0 ? 0 : clampGain(value, this.range(k, key)) };
    this.hooks.onGains(restart);
    if (restart) this.tryGains();
  }

  setCompensate(on: boolean): void {
    this.stopLearning();
    this.compensate = on;
    this.changed();
  }

  setScope(scope: Scope): void {
    this.stopLearning();
    this.scope = scope;
    this.changed();
  }

  /** Back to where the lab opened, or the textbook rule for the joints in view. */
  use(preset: 'start' | 'rule'): void {
    const rule = inertiaRule(this.rig.plant.inertia);
    for (const k of this.judged()) this.gains[k] = { ...(preset === 'rule' ? rule[k] : this.start[k]) };
    this.changed();
  }

  /** Put an earlier try back on the robot, to watch it against the others. */
  useAttempt(a: Pick<Attempt, 'gains' | 'compensate'>): void {
    this.stopLearning();
    this.gains = a.gains.map((g) => ({ ...g }));
    this.compensate = a.compensate;
    this.hooks.onGains(true);
    this.emit();
  }

  saved(): SavedGains | null {
    return loadGains(this.saveSlot(), this.session.joints.map((j) => j.name));
  }

  /** A clean run of the motion ended on these gains. */
  record(stats: RunStats): void {
    if (this.running) return;
    const list = this.attempts();
    const same = (a: Attempt) => a.compensate === this.compensate && a.gains.every((g, k) => g.kp === this.gains[k].kp && g.ki === this.gains[k].ki && g.kd === this.gains[k].kd);
    if (!list.some(same)) {
      const attempt: Attempt = { who: 'you', stats, gains: this.gains.map((g) => ({ ...g })), compensate: this.compensate };
      list.push(attempt);
      this.remember(attempt);
    }
    this.emit();
  }

  learn(method: Method, reference: Reference): void {
    this.halt();
    const groups = this.groups().map((g) => g.joints);
    this.board = this.attempts();
    if (method === 'balance' && this.balance) {
      this.theta = null;
      this.learner = new BalanceRun(this.setup(), reference, this.balance, this.toGains(this.gains), (frames, stats) => this.hooks.onPractice(frames, stats));
      this.emit();
      return;
    }
    this.learner = new LearnRun(this.setup(), reference, this.gains.map((g) => ({ ...g })), { groups, inertia: this.rig.plant.inertia }, method, this.seed++, {
      toGains: (g) => this.toGains(g),
      onBest: (gains) => this.adopt(gains),
      onRun: (frames, stats) => this.hooks.onPractice(frames, stats),
    });
    this.emit();
  }

  stopLearning(): void {
    if (!this.running) return;
    this.learner!.stop();
    this.concluded();
  }

  /** Stop everything running on a private MjData. */
  halt(): void {
    this.stopLearning();
    this.trial?.dispose();
    this.trial = null;
  }

  /** Spend this frame's budget on the learner, or on the latest try. */
  tick(deadline: number): void {
    if (this.running) {
      this.learner!.tick(deadline);
      if (this.learner!.done) this.concluded();
    } else if (this.trial?.run(deadline)) {
      const stats = this.trial.stats();
      this.trial.dispose();
      this.trial = null;
      this.record(stats);
    }
  }

  private setup(): RolloutSetup {
    const { rig } = this;
    return {
      handle: rig.handle,
      qposAdr: rig.qposAdr,
      dofAdr: rig.dofAdr,
      rest: rig.rest,
      options: { driven: rig.plant.driven, held: rig.plant.held, routes: rig.plant.routes, compensate: this.compensate },
      joints: this.judged(),
      limits: this.limits,
      stand: rig.stand,
    };
  }

  private changed(): void {
    this.hooks.onGains(true);
    this.tryGains();
    this.emit();
  }

  private tryGains(): void {
    const reference = this.hooks.reference();
    if (!reference || this.running) return;
    this.trial?.dispose();
    this.trial = new Rollout(this.setup(), reference, this.toGains(this.gains));
  }

  private adopt(gains: Pid[]): void {
    this.gains = gains.map((g) => ({ ...g }));
    this.hooks.onGains(true);
  }

  private concluded(): void {
    if (this.learner instanceof BalanceRun) {
      this.theta = this.learner.theta;
      this.board = null;
      this.hooks.onGains(true);
      this.emit();
      return;
    }
    const { best } = this.learner as LearnRun;
    if (best.stats.score >= 0) {
      this.adopt(best.gains);
      const attempt: Attempt = { who: 'ai', stats: best.stats, gains: best.gains, compensate: this.compensate };
      this.board!.push(attempt);
      this.remember(attempt);
    }
    this.board = null;
    this.emit();
  }

  private remember(a: Attempt): void {
    const kept = this.saved();
    if (kept && kept.score >= a.stats.score) return;
    saveGains(this.saveSlot(), { names: this.session.joints.map((j) => j.name), gains: a.gains, compensate: a.compensate, score: a.stats.score, who: a.who });
  }

  private boardSlot(): string {
    return this.scope === 'robot' ? 'robot' : `limb${this.focus()}`;
  }

  private saveSlot(): string {
    return `${this.session.id}:${this.rig.stand ? 'floor' : 'stand'}:${this.boardSlot()}`;
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
