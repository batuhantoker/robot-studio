import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/linear/vec';
import { type GaitSpec, Stepper, type Wheel, advanceBase, fitCommand, gaitTopSpeed, maxCurvature, wheelState } from '@/core/motion/locomotion';

const biped = (forward: Vec3 = [1, 0, 0]): GaitSpec => ({
  legs: [{ home: [0.02, 0.12, 0], offset: 0 }, { home: [0.02, -0.12, 0], offset: 0.5 }],
  period: 1, lift: 0.06, stride: 0.25, forward,
});

/** A foot's world position, given the base pose the world shift follows. */
const world = (pose: { x: number; y: number; yaw: number }, p: Vec3): Vec3 =>
  [pose.x + Math.cos(pose.yaw) * p[0] - Math.sin(pose.yaw) * p[1], pose.y + Math.sin(pose.yaw) * p[0] + Math.cos(pose.yaw) * p[1], p[2]];

describe('stepping gait', () => {
  for (const [name, cmd] of [['straight', { forward: 0.4, lateral: 0, turn: 0 }], ['turning', { forward: 0.2, lateral: 0.05, turn: 0.6 }]] as const) {
    it(`keeps stance feet still on the ground while the body moves (${name})`, () => {
      const g = biped(), stepper = new Stepper(g), dt = 1 / 120;
      const c = fitCommand(g, cmd);
      let pose = { x: 0, y: 0, yaw: 0 };
      for (let k = 0; k < 240; k++) {
        stepper.step(c, dt);
        pose = advanceBase(pose, c, g.forward, dt);
      }
      // Track each foot through one more cycle: while it is down, its world position must not move.
      const down: Vec3[][] = [[], []];
      for (let k = 0; k < 120; k++) {
        const feet = stepper.step(c, dt);
        pose = advanceBase(pose, c, g.forward, dt);
        feet.forEach((f, i) => {
          if (f[2] < 1e-9 && (stepper.phase + g.legs[i].offset) % 1 > 0.52) down[i].push(world(pose, f));
        });
      }
      for (const pts of down) {
        expect(pts.length).toBeGreaterThan(30);
        const drift = Math.max(...pts.map((p) => Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1])));
        expect(drift).toBeLessThan(2e-3);
      }
    });
  }

  it('lifts swinging feet, and winds down to the home stance when the command stops', () => {
    const g = biped(), stepper = new Stepper(g);
    const c = { forward: gaitTopSpeed(g), lateral: 0, turn: 0 };
    let high = 0;
    for (let k = 0; k < 200; k++) high = Math.max(high, ...stepper.step(c, 1 / 100).map((f) => f[2]));
    expect(high).toBeGreaterThan(0.9 * g.lift);
    for (let k = 0; k < 300; k++) stepper.step({ forward: 0, lateral: 0, turn: 0 }, 1 / 100);
    expect(stepper.walking).toBe(false);
    stepper.feet.forEach((f, i) => expect(Math.hypot(f[0] - g.legs[i].home[0], f[1] - g.legs[i].home[1], f[2])).toBeLessThan(1e-3));
  });

  it('caps a command so no foot slides farther than a stride', () => {
    const g = biped();
    const c = fitCommand(g, { forward: 5, lateral: 0, turn: 3 });
    expect(Math.abs(c.forward)).toBeLessThanOrEqual(gaitTopSpeed(g) + 1e-9);
  });
});

describe('wheels', () => {
  const car = (): Wheel[] => [[0.5, 0.3], [0.5, -0.3], [-0.5, 0.3], [-0.5, -0.3]].map(([x, y], i) => ({
    spin: i * 2 + 1, spinSign: 1, steer: x > 0 ? i * 2 : null, steerSign: 1, at: [x, y, 0] as Vec3, radius: 0.12,
  }));

  it('rolls at v / r when driving straight', () => {
    const s = wheelState(car(), [1, 0, 0], 0.6, 0, 0);
    s.rate.forEach((r) => expect(r).toBeCloseTo(0.6 / 0.12, 9));
    s.steer.forEach((a) => expect(a).toBe(0));
  });

  it('steers the inner front wheel more than the outer one, and the outer wheels roll faster', () => {
    const wheels = car();
    const s = wheelState(wheels, [1, 0, 0], 0.5, 1.2, 0);
    // A left turn: the left wheel (+y) is inside.
    expect(s.steer[0]).toBeGreaterThan(s.steer[1]);
    expect(s.steer[1]).toBeGreaterThan(0);
    expect(s.rate[1]).toBeGreaterThan(s.rate[0]);
    expect(s.steer[2]).toBe(0);
    const k = maxCurvature(wheels, [1, 0, 0], 0.5);
    expect(Math.max(...wheelState(wheels, [1, 0, 0], 0, k, 0).steer.map(Math.abs))).toBeCloseTo(0.5, 3);
  });

  it('turns a differential drive by rolling its sides apart', () => {
    const wheels: Wheel[] = [{ spin: 0, spinSign: 1, steer: null, steerSign: 1, at: [0, 0.1, 0], radius: 0.05 }, { spin: 1, spinSign: 1, steer: null, steerSign: 1, at: [0, -0.1, 0], radius: 0.05 }];
    const s = wheelState(wheels, [1, 0, 0], 0, 0, 1);
    expect(s.rate[0]).toBeCloseTo(-2, 9);
    expect(s.rate[1]).toBeCloseTo(2, 9);
  });
});
