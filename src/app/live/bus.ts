/** Per-frame results, published by the frame loop and read by panels at their own rate. */
import type { DexterityReport } from '../../core/analysis/dexterity/report';
import type { GravityLoad } from '../../core/analysis/statics/gravity';
import type { RobotSession, Posed } from '../robots/session';

export interface SimReadout {
  requested: number[];
  applied: number[];
  error: number[];
  saturated: boolean[];
}

export interface Snapshot {
  session: RobotSession;
  /** Whole-robot joint vector. */
  q: number[];
  focus: number;
  posed: Posed;
  /** Gravity load explained on the focused limb (TS). */
  gravity: GravityLoad;
  /** MuJoCo's whole-robot bias force per joint (gravity only when not simulating). */
  bias: number[];
  /** What the motors are applying: what they simulate, nothing on a free swing, otherwise what holds the pose. */
  torque: number[];
  /** Joint rates, where the source of the motion knows them. */
  qd?: number[];
  /** Dexterity of the focused limb, and of every limb. */
  dexterity: DexterityReport;
  limbs: DexterityReport[];
  time: number;
  sim: SimReadout | null;
}

type Sub = { fn: (s: Snapshot) => void; every: number; last: number };

export class LiveBus {
  latest: Snapshot | null = null;
  private subs: Sub[] = [];

  publish(s: Snapshot): void {
    this.latest = s;
    const now = performance.now();
    for (const sub of this.subs) {
      if (now - sub.last >= sub.every) {
        sub.last = now;
        sub.fn(s);
      }
    }
  }

  /** Subscribe at most `hz` times per second. */
  on(fn: (s: Snapshot) => void, hz = 15): void {
    this.subs.push({ fn, every: 1000 / hz, last: 0 });
  }
}
