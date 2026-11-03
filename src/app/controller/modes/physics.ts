/** Live MuJoCo tracking of the current trajectory, in real time, with rolling histories. */
import type { SimReadout } from '../../live/bus';
import type { RobotSession } from '../../robots/session';
import { TrackingSim } from '../../../physics/control/tracking';
import { jointLimits } from '../../robots/focus';
import { stateAt } from './trajectory';

export interface PhysicsHistory {
  t: number[];
  error: number[][];
  applied: number[][];
  requested: number[][];
}

const KEEP = 600;

export class PhysicsMode {
  readonly sim: TrackingSim | null;
  readonly reason: string | null;
  history: PhysicsHistory = { t: [], error: [], applied: [], requested: [] };
  last: SimReadout | null = null;
  private wall = 0;

  constructor(private readonly session: RobotSession) {
    const spec = session.spec;
    if (!spec) {
      this.sim = null;
      this.reason = 'Live tracking uses the generated torque-motor model; open a built robot or make this one editable.';
      return;
    }
    const gains = spec.links.flatMap((l) => l.dofs.map(() => ({ kp: l.kp, kd: l.kd, limit: l.torque_limit })));
    this.sim = new TrackingSim(session.handle, session.qposAdr, session.dofAdr, gains, session.rest);
    this.reason = null;
  }

  reset(waypoints: number[][], duration: number): void {
    if (!this.sim) return;
    this.sim.reset(stateAt(jointLimits(this.session), waypoints, duration, 0).q);
    this.history = { t: [], error: [], applied: [], requested: [] };
    this.wall = 0;
  }

  /** Advance simulated time to follow wall time (bounded per frame); returns joint positions. */
  advance(dtWall: number, waypoints: number[][], duration: number): number[] | null {
    const sim = this.sim;
    if (!sim) return null;
    this.wall += Math.min(dtWall, 0.05);
    let guard = 0;
    while (sim.time < this.wall && guard++ < 400) {
      const t = sim.time % duration;
      const ref = stateAt(jointLimits(this.session), waypoints, duration, t);
      this.last = sim.step(ref.q, ref.qd);
    }
    if (this.last) this.record(sim.time);
    return sim.q();
  }

  private record(t: number): void {
    const h = this.history;
    h.t.push(t);
    h.error.push(this.last!.error);
    h.applied.push(this.last!.applied);
    h.requested.push(this.last!.requested);
    if (h.t.length > KEEP) for (const k of ['t', 'error', 'applied', 'requested'] as const) h[k].shift();
  }
}
