/** A rolling record of the live data, kept in every mode so graphs open with history already on them. */
import type { Vec3 } from '../../core/math/linear/vec';
import type { RobotSession } from '../robots/session';
import type { Snapshot } from './bus';

export interface Sample {
  t: number;
  /** Whole-robot joint vector and joint efforts. */
  q: number[];
  tau: number[];
  /** Per limb, so the record survives a change of focus. */
  tips: Vec3[];
  manipulability: number[];
  /** Per joint, while Physics runs. */
  error: number[] | null;
}

export const HISTORY_SECONDS = 60;
export const HISTORY_HZ = 20;
/** A hidden tab stops the frame loop; the clock skips that gap instead of drawing it. */
const LONGEST_STEP = 0.25;

export class LiveHistory {
  samples: Sample[] = [];
  private session: RobotSession | null = null;
  private clock = 0;
  private last = 0;

  constructor(private readonly now: () => number = () => performance.now() / 1000) {}

  record(s: Snapshot): void {
    const now = this.now();
    if (s.session !== this.session) {
      this.session = s.session;
      this.samples = [];
      this.last = now;
    }
    // `Snapshot.time` can't drive this: it wraps in Trajectory, restarts in Physics and sits at 0 in Pose.
    this.clock += Math.min(now - this.last, LONGEST_STEP);
    this.last = now;
    this.samples.push({
      t: this.clock,
      q: [...s.q],
      tau: [...(s.sim?.applied ?? s.bias)],
      tips: s.posed.limbs.map((l) => [...l.tip.p] as Vec3),
      manipulability: s.limbs.map((l) => l.svd.manipulability),
      error: s.sim ? [...s.sim.error] : null,
    });
    const oldest = this.clock - HISTORY_SECONDS;
    while (this.samples[0].t < oldest) this.samples.shift();
  }
}

/** Rate of change between samples; the first has nothing to compare with. */
export function rates(t: number[], values: number[]): number[] {
  return values.map((v, i) => (i ? (v - values[i - 1]) / (t[i] - t[i - 1] || 1) : NaN));
}
