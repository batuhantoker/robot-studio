/**
 * Teaching a network to react to tipping. Every round brings a shove from a new direction, or it would just
 * memorise one; afterwards it is tested on shoves it never met, which is the number worth believing.
 */
import { policyGradient, type Search } from '../../../core/control/learn/search';
import { rng } from '../../../core/math/random/rng';
import type { RunStats } from '../../../core/control/score';
import type { BalancePolicy } from '../../../physics/control/balance';
import { Rollout, type Reference, type RolloutSetup, type RunFrame } from '../../../physics/control/rollout';
import type { Gains } from '../../../physics/control/tracking';
import type { Lesson, LearnCurve } from './run';

const ROUNDS = 90;
const POPULATION = 16;
const SIGMA = 0.07;
/** Directions it never trains on, and no shove at all. */
const UNSEEN: (number | null)[] = [20, 110, 200, 290, null];

export interface BalanceResult {
  /** Mean seconds on its feet across the unseen shoves, without and with the network. */
  before: number;
  after: number;
  /** How long each test ran for. */
  horizon: number;
}

export class BalanceRun implements Lesson {
  readonly curve: LearnCurve = { runs: [], best: [], mean: [] };
  readonly history: number[] = [];
  readonly total = ROUNDS * POPULATION + 2 * UNSEEN.length;
  runs = 0;
  done = false;
  result: BalanceResult | null = null;
  best: { stats: RunStats };
  /** The network everything in the last round agreed on. */
  theta: number[];
  private readonly search: Search;
  private readonly rollout: Rollout;
  private readonly next = rng(7);
  private batch: number[][] = [];
  private scores: number[] = [];
  private angle = 0;
  private round = 0;
  /** Unseen tests still to run: without the network, then with it. */
  private tests: { theta: number[] | null; angle: number | null }[] | null = null;
  private seconds: { without: number[]; with: number[] } = { without: [], with: [] };

  constructor(
    setup: RolloutSetup,
    private readonly reference: Reference,
    private readonly policy: BalancePolicy,
    private readonly gains: Gains[],
    private readonly onRun: (frames: RunFrame[], stats: RunStats) => void,
  ) {
    this.theta = new Array<number>(policy.size).fill(0);
    this.search = policyGradient({ start: this.theta, sigma: SIGMA, population: POPULATION, seed: 3 });
    this.rollout = new Rollout(setup, reference, gains);
    this.best = { stats: { rmsDeg: 0, peakDeg: 0, saturation: 0, jitter: 0, upright: 0, score: -1 } };
    this.nextRound();
    this.beginRun();
  }

  get practice(): number {
    return this.runs * this.reference.q.length * this.reference.dt;
  }

  tick(deadline: number): void {
    while (!this.done && performance.now() < deadline) {
      if (!this.rollout.run(deadline)) return;
      this.finishRun();
      if (!this.done) this.beginRun();
    }
  }

  stop(): void {
    if (this.done) return;
    this.done = true;
    this.rollout.dispose();
  }

  private beginRun(): void {
    const test = this.tests?.[0];
    if (test) this.rollout.begin(this.gains, { policy: this.policy, theta: test.theta ?? new Array<number>(this.policy.size).fill(0), angle: test.angle });
    else this.rollout.begin(this.gains, { policy: this.policy, theta: this.batch[this.scores.length], angle: this.angle });
  }

  private finishRun(): void {
    const stats = this.rollout.stats();
    this.runs++;
    if (this.tests) {
      const test = this.tests.shift()!;
      (test.theta ? this.seconds.with : this.seconds.without).push(this.rollout.seconds);
      if (!this.tests.length) this.conclude();
      return;
    }
    this.scores.push(stats.score);
    this.history.push(stats.score);
    if (stats.score > this.best.stats.score) this.best = { stats };
    this.onRun(this.rollout.frames, stats);
    if (this.scores.length === this.batch.length) this.endRound();
  }

  private endRound(): void {
    const { curve, scores } = this;
    this.search.tell(scores);
    this.theta = this.search.mean();
    curve.runs.push(this.runs);
    curve.best.push(Math.max(...scores));
    curve.mean.push(scores.reduce((a, b) => a + b, 0) / scores.length);
    this.scores = [];
    if (++this.round === ROUNDS) {
      const theta = this.theta;
      this.tests = [...UNSEEN.map((angle) => ({ theta: null, angle })), ...UNSEEN.map((angle) => ({ theta, angle }))];
    } else this.nextRound();
  }

  private nextRound(): void {
    this.angle = Math.floor(this.next() * 360);
    this.batch = this.search.ask();
  }

  private conclude(): void {
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    this.result = { before: mean(this.seconds.without), after: mean(this.seconds.with), horizon: this.reference.q.length * this.reference.dt };
    this.stop();
  }
}
