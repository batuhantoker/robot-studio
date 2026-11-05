/** One learner teaching one limb's gains, a slice per frame so the robot keeps moving on the stage. */
import type { Pid } from '../../../core/control/gains';
import { type GainSpace, decode, encode } from '../../../core/control/learn/params';
import { type Search, crossEntropy, policyGradient } from '../../../core/control/learn/search';
import type { RunStats } from '../../../core/control/score';
import { Rollout, type Reference, type RolloutSetup, type RunFrame } from '../../../physics/control/rollout';
import type { Gains } from '../../../physics/control/tracking';

export type Method = 'policy' | 'evolution' | 'balance';

/** A lesson as the panel and the lab see it. */
export interface Lesson {
  readonly curve: LearnCurve;
  readonly history: number[];
  readonly total: number;
  readonly practice: number;
  runs: number;
  done: boolean;
  best: { stats: RunStats };
  tick(deadline: number): void;
  stop(): void;
}

const ROUNDS = 25;
const POPULATION = 16;
/** Log units: the first tries reach about 2.7× either side of where it starts. */
const SIGMA = 1;

export interface LearnCurve {
  runs: number[];
  best: number[];
  mean: number[];
}

export interface LearnHooks {
  toGains(g: Pid[]): Gains[];
  /** A round beat everything before it. */
  onBest(gains: Pid[]): void;
  /** A run finished, good or bad. */
  onRun(frames: RunFrame[], stats: RunStats): void;
}

export class LearnRun implements Lesson {
  readonly curve: LearnCurve = { runs: [], best: [], mean: [] };
  /** Every run's score, in order. */
  readonly history: number[] = [];
  readonly total = ROUNDS * POPULATION + 1;
  runs = 0;
  done = false;
  best: { gains: Pid[]; stats: RunStats };
  private readonly search: Search;
  private readonly rollout: Rollout;
  private batch: number[][];
  private scores: number[] = [];
  private round = -1;
  private announced = -Infinity;

  constructor(
    setup: RolloutSetup,
    private readonly reference: Reference,
    private readonly start: Pid[],
    private readonly space: GainSpace,
    method: Method,
    seed: number,
    private readonly hooks: LearnHooks,
  ) {
    const theta = encode(start, space);
    this.search = (method === 'policy' ? policyGradient : crossEntropy)({ start: theta, sigma: SIGMA, population: POPULATION, seed });
    this.rollout = new Rollout(setup, reference, hooks.toGains(start));
    // The starting gains run first, so the learner can only ever hand back something better.
    this.batch = [theta];
    this.best = { gains: start, stats: { rmsDeg: 0, peakDeg: 0, saturation: 0, jitter: 0, upright: 1, score: -1 } };
  }

  /** Seconds of robot time practised so far. */
  get practice(): number {
    return this.runs * this.reference.q.length * this.reference.dt;
  }

  tick(deadline: number): void {
    while (!this.done && performance.now() < deadline) {
      if (!this.rollout.run(deadline)) return;
      const stats = this.rollout.stats();
      this.scores.push(stats.score);
      this.history.push(stats.score);
      this.hooks.onRun(this.rollout.frames, stats);
      if (stats.score > this.best.stats.score) this.best = { gains: this.gainsAt(this.scores.length - 1), stats };
      this.runs++;
      if (this.scores.length === this.batch.length) this.endRound();
      if (!this.done) this.rollout.begin(this.hooks.toGains(this.gainsAt(this.scores.length)));
    }
  }

  stop(): void {
    if (this.done) return;
    this.done = true;
    this.rollout.dispose();
  }

  private gainsAt(i: number): Pid[] {
    return decode(this.batch[i], this.start, this.space);
  }

  private endRound(): void {
    const { curve, scores } = this;
    if (this.round >= 0) this.search.tell(scores);
    curve.runs.push(this.runs);
    curve.best.push(this.best.stats.score);
    curve.mean.push(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (this.best.stats.score > this.announced) {
      this.announced = this.best.stats.score;
      this.hooks.onBest(this.best.gains);
    }
    this.scores = [];
    if (++this.round === ROUNDS) return this.stop();
    this.batch = this.search.ask();
  }
}
