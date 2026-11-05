/** One headless run of the test motion on a private MjData, in slices small enough to share a frame. */
import type { MjData } from '@mujoco/mujoco';
import type { RunStats } from '../../core/control/score';
import { RunScore } from '../../core/control/score';
import type { ModelHandle } from '../model/handle';
import { type Gains, TrackingSim, type TrackingOptions } from './tracking';

export interface Reference {
  dt: number;
  q: Float64Array[];
  qd: Float64Array[];
}

/** Sample the motion once: a learner replays it thousands of times, and sampling costs as much as stepping. */
export function sampleReference(at: (t: number) => { q: number[]; qd: number[] }, duration: number, dt: number): Reference {
  const steps = Math.round(duration / dt);
  const ref: Reference = { dt, q: [], qd: [] };
  for (let i = 0; i < steps; i++) {
    const s = at(i * dt);
    ref.q.push(Float64Array.from(s.q));
    ref.qd.push(Float64Array.from(s.qd));
  }
  return ref;
}

/** One sampled moment of a run, enough to replay it on the stage. */
export interface RunFrame {
  q: number[];
  error: number[];
  applied: number[];
}

const FRAMES = 96;

export interface RolloutSetup {
  handle: Pick<ModelHandle, 'mj' | 'model'>;
  qposAdr: number[];
  dofAdr: number[];
  rest: Float64Array;
  options: TrackingOptions;
  /** Judged joints and every joint's limit. */
  joints: number[];
  limits: number[];
}

export class Rollout {
  private readonly data: MjData;
  private readonly sim: TrackingSim;
  private step = 0;
  private score: RunScore;
  private readonly every: number;
  /** The run so far, sampled. */
  frames: RunFrame[] = [];

  constructor(private readonly s: RolloutSetup, private readonly ref: Reference, gains: Gains[]) {
    this.data = new s.handle.mj.MjData(s.handle.model);
    this.sim = new TrackingSim({ ...s.handle, data: this.data }, s.qposAdr, s.dofAdr, gains, s.rest, s.options);
    this.score = new RunScore(s.joints, s.limits);
    this.every = Math.max(1, Math.round(ref.q.length / FRAMES));
    this.begin(gains);
  }

  begin(gains: Gains[]): void {
    this.sim.gains = gains;
    this.sim.reset(Array.from(this.ref.q[0]));
    this.score = new RunScore(this.s.joints, this.s.limits);
    this.frames = [];
    this.step = 0;
  }

  /** Step until the run ends or `deadline` (performance.now) passes; true when it has ended. */
  run(deadline: number): boolean {
    const { ref, sim, score } = this;
    while (this.step < ref.q.length) {
      const out = sim.step(ref.q[this.step], ref.qd[this.step]);
      score.add(out.error, out.applied, out.saturated);
      if (this.step % this.every === 0) this.frames.push({ q: sim.q(), error: out.error, applied: out.applied });
      this.step++;
      if ((this.step & 31) === 0 && performance.now() > deadline) return this.step >= ref.q.length;
    }
    return true;
  }

  stats(): RunStats {
    return this.score.stats();
  }

  dispose(): void {
    this.data.delete();
  }
}
