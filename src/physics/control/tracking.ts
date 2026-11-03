/**
 * Port of serial_arm/simulation.py: PD tracking with MuJoCo bias compensation through unit-gear
 * torque motors, torque clipped to each motor's limit; mj_forward after every step.
 */
import type { SimReadout } from '../../app/live/bus';
import type { ModelHandle } from '../model/handle';
import { state } from '../runtime/arrays';

export interface Gains {
  kp: number;
  kd: number;
  limit: number;
}

export class TrackingSim {
  private readonly d;

  constructor(
    private readonly h: ModelHandle,
    private readonly qposAdr: number[],
    private readonly dofAdr: number[],
    private readonly gains: Gains[],
    private readonly rest: Float64Array,
  ) {
    this.d = state(h.data);
  }

  get time(): number {
    return (this.h.data as unknown as { time: number }).time;
  }

  get dt(): number {
    return (this.h.model.opt as unknown as { timestep: number }).timestep;
  }

  reset(q: number[]): void {
    this.h.mj.mj_resetData(this.h.model, this.h.data);
    this.d.qpos.set(this.rest);
    this.qposAdr.forEach((a, k) => (this.d.qpos[a] = q[k]));
    this.h.mj.mj_forward(this.h.model, this.h.data);
  }

  q(): number[] {
    return this.qposAdr.map((a) => this.d.qpos[a]);
  }

  /** One control interval toward the reference; returns what the motors were asked and gave. */
  step(targetQ: number[], targetQd: number[]): SimReadout {
    const { d, gains } = this;
    const requested = gains.map((g, k) =>
      g.kp * (targetQ[k] - d.qpos[this.qposAdr[k]]) + g.kd * (targetQd[k] - d.qvel[this.dofAdr[k]]) + d.qfrc_bias[this.dofAdr[k]]);
    requested.forEach((r, k) => (d.ctrl[k] = Math.min(Math.max(r, -gains[k].limit), gains[k].limit)));
    const error = targetQ.map((t, k) => d.qpos[this.qposAdr[k]] - t);
    this.h.mj.mj_step(this.h.model, this.h.data);
    this.h.mj.mj_forward(this.h.model, this.h.data);
    return {
      requested,
      applied: this.dofAdr.map((_, k) => d.ctrl[k]),
      error,
      saturated: requested.map((r, k) => Math.abs(r) > gains[k].limit),
    };
  }
}
