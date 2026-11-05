/**
 * Port of serial_arm/simulation.py, for any model: PID tracking, optionally with MuJoCo's bias force,
 * torque clipped to each joint's limit and applied through qfrc_applied (see plant.ts).
 */
import type { SimReadout } from '../../app/live/bus';
import type { ModelHandle } from '../model/handle';
import { state } from '../runtime/arrays';
import type { HeldJoint, Route } from './plant';

export interface Gains {
  kp: number;
  kd: number;
  limit: number;
  ki?: number;
}

export interface TrackingOptions {
  /** Joints the controller may push; the rest follow an equality constraint. */
  driven?: boolean[];
  held?: HeldJoint[];
  routes?: Map<number, Route[]>;
  /** Cancel gravity and Coriolis with MuJoCo's bias force. */
  compensate?: boolean;
}

const clip = (v: number, limit: number) => Math.min(Math.max(v, -limit), limit);

export class TrackingSim {
  gains: Gains[];
  compensate: boolean;
  private readonly d;
  private readonly held: HeldJoint[];
  private readonly driven: boolean[] | null;
  private readonly routes: Map<number, Route[]>;
  private integral: number[];

  constructor(
    private readonly h: Pick<ModelHandle, 'mj' | 'model' | 'data'>,
    private readonly qposAdr: number[],
    private readonly dofAdr: number[],
    gains: Gains[],
    private readonly rest: Float64Array,
    opts: TrackingOptions = {},
  ) {
    this.d = state(h.data);
    this.gains = gains;
    this.held = opts.held ?? [];
    this.driven = opts.driven ?? null;
    this.routes = opts.routes ?? new Map();
    this.compensate = opts.compensate ?? true;
    this.integral = gains.map(() => 0);
  }

  get time(): number {
    return this.d.time;
  }

  get dt(): number {
    return (this.h.model.opt as unknown as { timestep: number }).timestep;
  }

  reset(q: number[]): void {
    this.h.mj.mj_resetData(this.h.model, this.h.data);
    this.d.qpos.set(this.rest);
    for (const j of this.held) this.d.qpos[j.qpos] = j.ref;
    this.qposAdr.forEach((a, k) => (this.d.qpos[a] = q[k]));
    this.integral = this.gains.map(() => 0);
    this.sync();
  }

  q(): number[] {
    return this.qposAdr.map((a) => this.d.qpos[a]);
  }

  /** Draw a recorded moment; the simulation itself goes no further. */
  show(q: ArrayLike<number>): void {
    this.qposAdr.forEach((a, k) => (this.d.qpos[a] = q[k]));
    this.sync();
  }

  /** Bring poses up to date; step() leaves them one step behind, which only drawing notices. */
  sync(): void {
    this.h.mj.mj_forward(this.h.model, this.h.data);
  }

  rates(): number[] {
    return this.dofAdr.map((a) => this.d.qvel[a]);
  }

  /** Joint rates jump by `by`, as a knock would make them. */
  knock(by: number[]): void {
    by.forEach((v, k) => (this.d.qvel[this.dofAdr[k]] += v));
  }

  /** One interval under torque worked out elsewhere; every motor is still held to its limit. */
  drive(torque: (q: number[], qd: number[]) => readonly number[], error: (q: number[]) => number[]): SimReadout {
    const { d, gains, h } = this;
    h.mj.mj_step1(h.model, h.data);
    const q = this.q(), requested = [...torque(q, this.rates())];
    const applied = requested.map((r, k) => clip(r, gains[k].limit));
    applied.forEach((a, k) => (d.qfrc_applied[this.dofAdr[k]] = a));
    h.mj.mj_step2(h.model, h.data);
    return { requested, applied, error: error(q), saturated: requested.map((r, k) => Math.abs(r) > gains[k].limit) };
  }

  /** One control interval toward the reference; returns what the motors were asked and gave. */
  step(targetQ: ArrayLike<number>, targetQd: ArrayLike<number>): SimReadout {
    const { d, gains, h } = this;
    // step1 computes the bias force for this state; the torque goes in before step2 integrates.
    h.mj.mj_step1(h.model, h.data);
    const dt = this.dt;
    const requested = gains.map((g, k) => {
      if (this.driven && !this.driven[k]) return 0;
      const dof = this.dofAdr[k];
      const e = targetQ[k] - d.qpos[this.qposAdr[k]];
      if (g.ki) this.integral[k] = clip(this.integral[k] + g.ki * e * dt, g.limit);
      return g.kp * e + g.kd * (targetQd[k] - d.qvel[dof]) + this.integral[k] + (this.compensate ? d.qfrc_bias[dof] : 0);
    });
    const applied = requested.map((r, k) => clip(r, gains[k].limit));
    applied.forEach((a, k) => {
      if (this.driven && !this.driven[k]) return;
      const route = this.routes.get(k);
      if (route) for (const r of route) d.qfrc_applied[r.dof] = r.scale * a;
      else d.qfrc_applied[this.dofAdr[k]] = a;
    });
    for (const j of this.held) {
      const r = j.kp * (j.ref - d.qpos[j.qpos]) - j.kd * d.qvel[j.dof] + d.qfrc_bias[j.dof];
      d.qfrc_applied[j.dof] = clip(r, j.limit);
    }
    const error = gains.map((_, k) => (!this.driven || this.driven[k] ? d.qpos[this.qposAdr[k]] - targetQ[k] : 0));
    h.mj.mj_step2(h.model, h.data);
    return { requested, applied, error, saturated: requested.map((r, k) => Math.abs(r) > gains[k].limit) };
  }
}
