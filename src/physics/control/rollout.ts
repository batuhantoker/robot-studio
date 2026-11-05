/** One headless run of the test motion on a private MjData, in slices small enough to share a frame. */
import type { MjData } from '@mujoco/mujoco';
import type { RunStats } from '../../core/control/score';
import { RunScore, STAND_ERROR_SCALE } from '../../core/control/score';
import type { ModelHandle } from '../model/handle';
import type { BalancePolicy } from './balance';
import type { StandTest } from './stand';
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
  /** On a floor: the free joint's position and quaternion. */
  root?: number[];
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
  stand?: StandTest | null;
}

/** A network riding on the PID for this run, and the shove it gets (null: none). */
export interface Rider {
  policy: BalancePolicy;
  theta: ArrayLike<number>;
  angle: number | null;
}

export const runScore = (s: Pick<RolloutSetup, 'joints' | 'limits' | 'stand'>) => new RunScore(s.joints, s.limits, s.stand ? STAND_ERROR_SCALE : undefined);

export class Rollout {
  private readonly data: MjData;
  private readonly sim: TrackingSim;
  private step = 0;
  private score: RunScore;
  private readonly every: number;
  /** Step the robot fell on. */
  private fell: number | null = null;
  private rider: Rider | null = null;
  private readonly target: Float64Array;
  /** The run so far, sampled. */
  frames: RunFrame[] = [];

  constructor(private readonly s: RolloutSetup, private readonly ref: Reference, gains: Gains[]) {
    this.data = new s.handle.mj.MjData(s.handle.model);
    this.sim = new TrackingSim({ ...s.handle, data: this.data }, s.qposAdr, s.dofAdr, gains, s.rest, s.options);
    this.score = runScore(s);
    this.every = Math.max(1, Math.round(ref.q.length / FRAMES));
    this.target = Float64Array.from(ref.q[0]);
    this.begin(gains);
  }

  begin(gains: Gains[], rider: Rider | null = null): void {
    this.rider = rider;
    this.target.set(this.ref.q[0]);
    this.sim.gains = gains;
    this.sim.reset(Array.from(this.ref.q[0]));
    this.score = runScore(this.s);
    this.frames = [];
    this.step = 0;
    this.fell = null;
  }

  /** Step until the run ends or `deadline` (performance.now) passes; true when it has ended. */
  run(deadline: number): boolean {
    const { ref, sim, score } = this;
    const { stand } = this.s;
    const { rider, target } = this;
    while (this.step < ref.q.length) {
      if (stand && !stand.watch(this.data, this.step, false, rider ? rider.angle : undefined)) {
        this.fell = this.step;
        return true;
      }
      if (rider && this.step % rider.policy.every === 0) rider.policy.update(this.data, rider.theta, target);
      const out = sim.step(rider ? target : ref.q[this.step], ref.qd[this.step]);
      score.add(out.error, out.applied, out.saturated);
      if (this.step % this.every === 0) this.frames.push({ q: sim.q(), error: out.error, applied: out.applied, root: stand ? this.rootPose() : undefined });
      this.step++;
      if ((this.step & 31) === 0 && performance.now() > deadline) return this.step >= ref.q.length;
    }
    return true;
  }

  stats(): RunStats {
    return this.score.stats((this.fell ?? this.ref.q.length) / this.ref.q.length);
  }

  /** Seconds on its feet this run. */
  get seconds(): number {
    return (this.fell ?? this.ref.q.length) * this.ref.dt;
  }

  private rootPose(): number[] {
    const a = this.s.stand!.rootAdr;
    return Array.from((this.data as unknown as { qpos: Float64Array }).qpos.subarray(a, a + 7));
  }

  dispose(): void {
    this.data.delete();
  }
}
