import { describe, expect, it } from 'vitest';
import { movesJoints } from '@/core/control/motion';
import { RunScore, scoreOf } from '@/core/control/score';

const still = { rmsDeg: 0, peakDeg: 0, saturation: 0, jitter: 0, upright: 1 };

describe('scoreOf', () => {
  it('is 100 for perfect tracking and falls with error, saturation and buzz', () => {
    expect(scoreOf(still)).toBe(100);
    expect(scoreOf({ ...still, rmsDeg: 1 })).toBeLessThan(scoreOf({ ...still, rmsDeg: 0.5 }));
    expect(scoreOf({ ...still, saturation: 0.1 })).toBeLessThan(100);
    expect(scoreOf({ ...still, jitter: 0.1 })).toBeLessThan(100);
  });

  it('gives a robot that fell almost nothing, however still it lies', () => {
    expect(scoreOf({ ...still, upright: 0.3 })).toBeLessThan(10);
  });
});

describe('RunScore', () => {
  it('judges only the joints it was given', () => {
    const run = new RunScore([0], [10, 10]);
    run.add([0.01, 5], [1, 9], [false, true]);
    const s = run.stats();
    expect(s.rmsDeg).toBeCloseTo(0.573, 2);
    expect(s.saturation).toBe(0);
  });

  it('reads a torque that flips every step as buzz, and a steady one as none', () => {
    const buzzing = new RunScore([0], [10]);
    const steady = new RunScore([0], [10]);
    for (let i = 0; i < 100; i++) {
      buzzing.add([0], [i % 2 ? 5 : -5], [false]);
      steady.add([0], [5], [false]);
    }
    expect(buzzing.stats().jitter).toBeGreaterThan(0.9);
    expect(steady.stats().jitter).toBe(0);
  });
});

describe('movesJoints', () => {
  const plan = [[0, 1], [0, 1.5], [0, 1]];

  it('tells a motion from a plan that holds the joints being judged still', () => {
    expect(movesJoints(plan, [1])).toBe(true);
    expect(movesJoints(plan, [0])).toBe(false);
    expect(movesJoints(plan, [0, 1])).toBe(true);
  });
});
