/** One score for a run of the test motion, the same for a person and for a learner, or the two can't be compared. */

export interface RunStats {
  /** Tracking error over the run: joint angles in degrees, a slide's metres read as radians. */
  rmsDeg: number;
  peakDeg: number;
  /** Share of joint-steps the motor was asked for more than it has. */
  saturation: number;
  /** RMS change of torque between steps, as a share of the limit: motors buzzing. */
  jitter: number;
  /** Share of the run the robot stayed on its feet; 1 on a stand. */
  upright: number;
  score: number;
}

/** RMS error that costs one e-fold of score (°). Effort stays out: holding a robot up costs the same whatever the gains. */
const ERROR_SCALE = 1.5;
const SATURATION_WEIGHT = 3;
const JITTER_WEIGHT = 25;

/** Standing holds still, so a few degrees of sag are fine; what counts is staying up. */
export const STAND_ERROR_SCALE = 8;

export const scoreOf = (s: Omit<RunStats, 'score'>, errorScale = ERROR_SCALE): number =>
  100 * s.upright ** 2 * Math.exp(-(s.rmsDeg / errorScale + SATURATION_WEIGHT * s.saturation + JITTER_WEIGHT * s.jitter));

export class RunScore {
  private n = 0;
  private error = 0;
  private peak = 0;
  private saturated = 0;
  private jitter = 0;
  private last: number[] | null = null;

  /** `joints` are the ones being judged. */
  constructor(private readonly joints: number[], private readonly limits: number[], private readonly errorScale?: number) {}

  add(error: number[], applied: number[], saturated: boolean[]): void {
    for (const k of this.joints) {
      const u = applied[k] / this.limits[k];
      this.error += error[k] ** 2;
      this.peak = Math.max(this.peak, Math.abs(error[k]));
      if (saturated[k]) this.saturated++;
      if (this.last) this.jitter += (u - this.last[k] / this.limits[k]) ** 2;
      this.n++;
    }
    this.last = applied;
  }

  stats(upright = 1): RunStats {
    const n = Math.max(this.n, 1);
    const raw = {
      rmsDeg: (Math.sqrt(this.error / n) * 180) / Math.PI,
      peakDeg: (this.peak * 180) / Math.PI,
      saturation: this.saturated / n,
      jitter: Math.sqrt(this.jitter / n),
      upright,
    };
    return { ...raw, score: scoreOf(raw, this.errorScale) };
  }
}
