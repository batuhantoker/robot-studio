import { describe, expect, it } from 'vitest';
import { SwingController } from '@/core/control/pendulum/controller';
import { balance } from '@/core/control/pendulum/lqr';
import { type Motors, type Rig, type Torque, type X, accel, fromUpright, mechanicalEnergy } from '@/core/control/pendulum/model';
import { energy, rates } from '@/core/motion/generators/double-pendulum';

// RealAIGym design C.1, model 1.1; I here is about each centre of mass.
const RIG: Rig = { m: [0.5234602, 0.6255677], l: [0.2, 0.3], c: [0.2, 0.2556931], I: [0.0109488, 0.0099709], g: 9.81, armature: [0.003, 0.003], limit: 6 };
const H = 0.002;

/** The controller's model made wrong, so nothing passes by matching itself. */
const wrong = (by: number): Rig => ({ ...RIG, m: [RIG.m[0] * (1 + by), RIG.m[1] * (1 + by)], I: [RIG.I[0] * (1 - by), RIG.I[1] * (1 - by)], armature: [0.0025, 0.0035] });

/** Semi-implicit Euler, as MuJoCo steps. */
function euler(r: Rig, x: X, t: Torque): X {
  const [a, b] = accel(r, x, t), w1 = x[2] + a * H, w2 = x[3] + b * H;
  return [x[0] + w1 * H, x[1] + w2 * H, w1, w2];
}

function planned(motors: Motors): SwingController {
  const c = new SwingController(RIG, motors);
  while (c.phase === 'planning') c.think(performance.now() + 50);
  return c;
}

/** `seconds` of closed loop from `x`; torque is checked at every step. */
function run(c: SwingController, plant: Rig, x: X, seconds: number, each?: (x: X) => void): X {
  for (let t = 0; t < seconds; t += H) {
    const u = c.torque(x, H);
    for (const v of u) expect(Math.abs(v)).toBeLessThanOrEqual(RIG.limit + 1e-9);
    x = euler(plant, x, u);
    each?.(x);
  }
  return x;
}

const off = (x: X) => Math.hypot(...fromUpright(x).slice(0, 2));

describe('the rig model', () => {
  it('is the same machine the free run integrates, in joint angles', () => {
    for (const [q1, q2, w1, w2] of [[0.3, -1.1, 0.7, -0.2], [2.4, 0.6, -1.5, 2], [-1, 2.5, 3, 1]]) {
      const [, , a1, a2] = rates(RIG, [q1, q1 + q2, w1, w1 + w2]);
      const [b1, b2] = accel({ ...RIG, armature: [0, 0] }, [q1, q2, w1, w2], [0, 0]);
      expect(b1).toBeCloseTo(a1, 9);
      expect(b1 + b2).toBeCloseTo(a2, 9);
      expect(mechanicalEnergy(RIG, [q1, q2, w1, w2])).toBeCloseTo(energy(RIG, [q1, q1 + q2, w1, w1 + w2]), 9);
    }
  });

  it('puts motor torque on the right joints', () => {
    const x: X = [0, 0, 0, 0], free = accel(RIG, x, [1, 0]);
    expect(free[0]).toBeGreaterThan(0);
    // The elbow's torque reacts on the first bar.
    const elbow = accel(RIG, x, [0, 1]);
    expect(elbow[1]).toBeGreaterThan(0);
    expect(elbow[0]).toBeLessThan(0);
  });
});

describe('balance', () => {
  for (const [name, motors] of [['both motors', [0, 1]], ['the shoulder alone', [0]], ['the elbow alone', [1]]] as const) {
    it(`returns to upright from a small offset with ${name}`, () => {
      const { K } = balance(RIG, motors);
      let x: X = [Math.PI + 0.03, -0.02, 0, 0];
      for (let t = 0; t < 6; t += H) {
        const e = fromUpright(x), u: Torque = [0, 0];
        motors.forEach((j, i) => (u[j] = -K[i].reduce((s, g, c) => s + g * e[c], 0)));
        x = euler(RIG, x, u);
      }
      expect(off(x)).toBeLessThan(1e-3);
    });
  }
});

describe('swing up and hold', () => {
  for (const [name, motors, seconds] of [['both motors', [0, 1], 4], ['the shoulder alone, a pendubot', [0], 5], ['the elbow alone, an acrobot', [1], 7]] as const) {
    it(`gets there with ${name}, on a model 3% wrong, and stays`, () => {
      const c = planned(motors);
      expect(c.phase).toBe('swinging');
      const plant = wrong(0.03);
      const x = run(c, plant, [0, 0, 0, 0], seconds);
      expect(c.phase).toBe('balancing');
      const end = run(c, plant, x, 5, (s) => expect(off(s)).toBeLessThan(0.7));
      expect(off(end)).toBeLessThan(0.01);
      expect(Math.hypot(end[2], end[3])).toBeLessThan(0.05);
    }, 30_000);
  }

  for (const [name, motors, knock] of [['both motors', [0, 1], 1], ['the shoulder alone', [0], 0.6], ['the elbow alone', [1], 0.15]] as const) {
    it(`takes the knock Nudge gives it with ${name}`, () => {
      const c = planned(motors), plant = wrong(0.03);
      const x = run(c, plant, [0, 0, 0, 0], 8);
      const after = run(c, plant, [x[0], x[1], x[2] + knock, x[3] - knock], 5);
      expect(c.phase).toBe('balancing');
      expect(off(after)).toBeLessThan(0.01);
    }, 30_000);

    it(`plans again from wherever it fell with ${name}, and gets back up`, () => {
      const c = planned(motors), plant = wrong(0.03);
      let x = run(c, plant, [0, 0, 0, 0], 8);
      x = [x[0] + 1.2, x[1] - 0.9, x[2] + 5, x[3] - 6];
      const seen = new Set<string>();
      for (let t = 0; t < 40; t += H) {
        while (c.phase === 'planning') c.think(performance.now() + 50);
        x = euler(plant, x, c.torque(x, H));
        seen.add(c.phase);
      }
      if (motors.length === 1) expect(seen).toContain('settling');
      expect(c.phase).toBe('balancing');
      expect(off(x)).toBeLessThan(0.01);
    }, 60_000);
  }

  it('goes back to the plan from hanging on a restart, even after planning from a fall', () => {
    const c = planned([0]), plant = wrong(0.03);
    run(c, plant, [0, 0, 0, 0], 6);
    c.restart();
    expect(c.phase).toBe('swinging');
    const x = run(c, plant, [0, 0, 0, 0], 8);
    expect(c.phase).toBe('balancing');
    expect(off(x)).toBeLessThan(0.01);
  }, 30_000);
});
