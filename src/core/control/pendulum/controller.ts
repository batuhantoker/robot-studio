/**
 * Swing up and balance. The plan's own feedback tracks it, the regulator takes over near the top, and a rig knocked
 * off it brakes for a moment and plans again from wherever it is.
 */
import { type Balance, balance, costToGo } from './lqr';
import { type Motors, type Rig, type Torque, type X, accel, fromUpright, torqueOf, wrap } from './model';
import { type SwingPlan, swingUp } from './swing';

export type Phase = 'planning' | 'swinging' | 'balancing' | 'settling' | 'failed';

/** Horizons to try in turn (s): which one works is chaotic, and more is not better. */
const HORIZONS: Record<string, number[]> = { '0,1': [2, 3], '0': [3, 4, 5], '1': [3.5, 5, 4, 4.5, 5.5, 6] };
/** A plan ending further than this from upright (rad, rad/s) is not one the regulator can catch. */
const CLOSE = 0.3;
/** Cost to go inside which the regulator can take over, and how far off upright it has lost it (rad). */
const CATCH = 60;
const LOST = 0.7;
/** Braking takes the worst out of a fall (N·m per rad/s), for at most this long (s); hanging this still (rad, rad/s) is where the plan starts. */
const BRAKE = 0.2;
const BRAKE_SECONDS = 3;
const STILL = 0.08;
const STILL_RATE = 0.25;
/** A plan is rehearsed on models this wrong in mass, for this long past its end (s), in steps of this (s). */
const DOUBT = 0.03;
const AFTER = 2;
const STEP = 0.002;

const clip = (v: number, limit: number) => Math.min(Math.max(v, -limit), limit);
const offTop = (e: X) => Math.hypot(e[0], e[1]);

/** The plan's feedforward and feedback at `t`, against a reference eased between its samples: held, it would look like error at speed. */
function tracked(p: SwingPlan, t: number, x: X): number[] {
  const at = t / p.h, k = Math.min(Math.floor(at), p.u.length - 1), f = Math.min(at - k, 1);
  const dx = x.map((v, i) => v - (p.x[k][i] + (p.x[k + 1][i] - p.x[k][i]) * f));
  return p.u[k].map((v, i) => v + p.K[k][i].reduce((s, g, c) => s + g * dx[c], 0));
}

const held = ({ K }: Balance, e: X) => K.map((r) => -r.reduce((s, g, c) => s + g * e[c], 0));

const seconds = (p: SwingPlan) => p.h * (p.x.length - 1);

export class SwingController {
  phase: Phase = 'planning';
  private plan: SwingPlan | null = null;
  /** The plan from hanging, which a restart goes back to. */
  private fromRest: SwingPlan | null = null;
  private start: X = [0, 0, 0, 0];
  private braked = 0;
  private readonly hold: Balance;
  private search: Generator<void, SwingPlan> | null;
  private horizon = 0;
  private best: SwingPlan | null = null;
  private time = 0;

  constructor(private readonly rig: Rig, private readonly motors: Motors) {
    this.hold = balance(rig, motors);
    this.search = swingUp(rig, motors, this.horizons[0], this.hold.S);
  }

  private get horizons(): number[] {
    return HORIZONS[[...this.motors].sort().join(',')];
  }

  /** Whether the plan really gets there and stays, on a model that is not the one it was made with. */
  private survives(p: SwingPlan): boolean {
    const { rig, motors, hold } = this;
    return [1 - DOUBT, 1 + DOUBT].every((k) => {
      const plant: Rig = { ...rig, m: [rig.m[0] * k, rig.m[1] * k], I: [rig.I[0] / k, rig.I[1] / k] };
      let x: X = p.x[0], caught = false;
      for (let t = 0; t < seconds(p) + AFTER; t += STEP) {
        const e = fromUpright(x);
        caught ||= t >= seconds(p) || costToGo(hold, e) < CATCH;
        if (caught && offTop(e) > LOST) return false;
        const u = (caught ? held(hold, e) : tracked(p, t, x)).map((v) => clip(v, rig.limit));
        const [a, b] = accel(plant, x, torqueOf(motors, u)), w1 = x[2] + a * STEP, w2 = x[3] + b * STEP;
        x = [x[0] + w1 * STEP, x[1] + w2 * STEP, w1, w2];
      }
      return offTop(fromUpright(x)) < LOST / 4;
    });
  }

  /** Work on the plan until `deadline` (ms on performance.now). */
  think(deadline: number): void {
    while (this.search && performance.now() < deadline) {
      const r = this.search.next();
      if (!r.done) continue;
      const good = r.value.miss < CLOSE && this.survives(r.value);
      if (!this.best || r.value.miss < this.best.miss) this.best = r.value;
      if (good || ++this.horizon >= this.horizons.length) {
        this.search = null;
        this.plan = good ? r.value : this.best.miss < CLOSE ? this.best : null;
        this.fromRest ??= this.plan;
        this.time = 0;
        // Out of a fall there is always another state to try from.
        this.phase = this.plan ? 'swinging' : this.fromRest ? 'settling' : 'failed';
        this.braked = 0;
      } else this.search = swingUp(this.rig, this.motors, this.horizons[this.horizon], this.hold.S, this.start);
    }
  }

  private replan(x: X): void {
    this.start = x;
    this.best = null;
    this.horizon = 0;
    this.phase = 'planning';
    this.search = swingUp(this.rig, this.motors, this.horizons[0], this.hold.S, x);
  }

  /** Hanging at rest, from the top of the plan. */
  restart(): void {
    this.time = 0;
    if (this.fromRest) {
      this.search = null;
      this.plan = this.fromRest;
      this.phase = 'swinging';
    }
  }

  /** The torque for state `x`, `dt` seconds on from the last call. */
  torque(x: X, dt: number): Torque {
    if (this.phase === 'planning' || this.phase === 'failed') return [0, 0];
    const e = fromUpright(x);
    if (this.phase === 'swinging') {
      this.time += dt;
      if (costToGo(this.hold, e) < CATCH || this.time >= seconds(this.plan!)) this.phase = 'balancing';
    }
    if (this.phase === 'balancing' && offTop(e) > LOST) {
      this.phase = 'settling';
      this.braked = 0;
    }
    if (this.phase === 'settling') {
      this.braked += dt;
      if (Math.hypot(wrap(x[0]), wrap(x[1])) < STILL && Math.hypot(x[2], x[3]) < STILL_RATE) {
        this.plan = this.fromRest;
        this.phase = 'swinging';
        this.time = 0;
      } else if (this.braked >= BRAKE_SECONDS) {
        this.replan(x);
        return [0, 0];
      } else return this.limited(this.motors.map((j) => -BRAKE * x[2 + j]));
    }
    return this.limited(this.phase === 'balancing' ? held(this.hold, e) : tracked(this.plan!, this.time, x));
  }

  private limited(u: number[]): Torque {
    return torqueOf(this.motors, u.map((v) => clip(v, this.rig.limit)));
  }
}
