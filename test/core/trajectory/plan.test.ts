import { describe, expect, it } from 'vitest';
import { dofLimits } from '@/core/robot/config/pose';
import { compile, samplePlan } from '@/core/trajectory/plan';
import { quinticAt } from '@/core/trajectory/quintic/profile';
import { defaultWaypoints, sampleQuintic } from '@/core/trajectory/quintic/sample';
import { trajectoryRecord } from '@/core/trajectory/export';
import { expectClose, presetSpec, python } from '../../support/fixtures';

const W = [[0, 0], [0.4, 0.1], [0.8, 0.5], [0.9, 1], [0.5, 1.2], [0, 0]];

describe('plan', () => {
  it('with plain stops and even pacing, is exactly the quintic profile analyze() uses', () => {
    const c = compile({ waypoints: W, duration: 7.3 });
    for (let k = 0; k <= 500; k++) {
      const t = (7.3 * k) / 500;
      const a = c.at(t), b = quinticAt(W, 7.3, t);
      expectClose(a.q, b.q, 1e-12);
      expectClose(a.qd, b.qd, 1e-11);
      expectClose(a.qdd, b.qdd, 1e-10);
    }
    const m = python.trajectory.default;
    const limits = dofLimits(presetSpec(m.robot));
    const w = m.waypoints ?? defaultWaypoints(limits);
    const ours = samplePlan({ waypoints: w, duration: m.duration }, m.timestep, limits);
    const theirs = sampleQuintic(w, m.duration, m.timestep, limits);
    expectClose(ours.q.flat(), theirs.q.flat(), 1e-12);
    expectClose(ours.qd.flat(), theirs.qd.flat(), 1e-11);
  });

  it('passes through vias with continuous, nonzero velocity', () => {
    const opts = W.map((_, i) => ({ via: i > 0 && i < W.length - 1 }));
    const c = compile({ waypoints: W, duration: 6, opts, pace: 'distance' });
    for (let i = 1; i < W.length - 1; i++) {
      const t = c.arrive[i];
      const before = c.at(t - 1e-7), at = c.at(t), after = c.at(t + 1e-7);
      expectClose(at.q, W[i], 1e-12);
      expect(Math.hypot(...at.qd)).toBeGreaterThan(1e-3);
      expectClose(before.qd, at.qd, 1e-5);
      expectClose(after.qd, at.qd, 1e-5);
      expectClose(before.q, after.q, 1e-6);
    }
  });

  it('rests for the hold, and holds come out of the total', () => {
    const opts = [{}, { hold: 0.5 }, { via: true }, { hold: 1 }, {}, {}];
    const c = compile({ waypoints: W, duration: 8, opts, pace: 'distance' });
    expect(c.leave[1] - c.arrive[1]).toBeCloseTo(0.5, 12);
    expect(c.leave[3] - c.arrive[3]).toBeCloseTo(1, 12);
    for (const t of [c.arrive[3] + 0.01, c.arrive[3] + 0.5, c.leave[3] - 0.01]) {
      const s = c.at(t);
      expect(s.holding).toBe(3);
      expectClose(s.q, W[3], 0);
      expectClose(s.qd, [0, 0], 0);
    }
    const moving = W.slice(1).reduce((sum, _, i) => sum + (c.arrive[i + 1] - c.leave[i]), 0);
    expect(moving).toBeCloseTo(8 - 1.5, 10);
    expect(c.arrive.at(-1)).toBeCloseTo(8, 10);
  });

  it('distance pacing gives longer moves more time', () => {
    const w = [[0], [0.1], [1.1], [1.2]];
    const c = compile({ waypoints: w, duration: 3, pace: 'distance' });
    const T = w.slice(1).map((_, i) => c.arrive[i + 1] - c.leave[i]);
    expect(T[1]).toBeGreaterThan(4 * T[0]);
    expect(T.reduce((a, b) => a + b, 0)).toBeCloseTo(3, 12);
  });

  it('never lets holds eat the whole duration', () => {
    const c = compile({ waypoints: [[0], [1], [0]], duration: 2, opts: [{}, { hold: 10 }, {}] });
    expect(c.leave[1] - c.arrive[1]).toBeCloseTo(1.6, 12);
    expect(c.arrive[2]).toBeCloseTo(2, 12);
  });

  it('exports what plays: vias and holds reach the sampled data', () => {
    const opts = [{}, { via: true }, { hold: 0.5 }, { via: true }, { via: true }, {}];
    const limits: [number, number][] = [[-5, 5], [-5, 5]];
    const rec = trajectoryRecord({ robot: 'r', joints: ['a', 'b'], limits, waypoints: W, duration: 6, timestep: 0.01, opts, pace: 'distance' });
    const c = compile({ waypoints: W, duration: 6, opts, pace: 'distance' });
    rec.t.forEach((t, k) => expectClose(rec.q[k], c.at(t).q, 1e-12));
    const plain = trajectoryRecord({ robot: 'r', joints: ['a', 'b'], limits, waypoints: W, duration: 6, timestep: 0.01 });
    expect(Math.max(...rec.q.map((q, k) => Math.abs(q[0] - plain.q[k][0])))).toBeGreaterThan(0.01);
  });

  it('a via turning back does not overshoot its neighbours', () => {
    const w = [[0], [1], [0.2], [0.9], [0]];
    const c = compile({ waypoints: w, duration: 4, opts: w.map(() => ({ via: true })), pace: 'distance' });
    for (let k = 0; k <= 400; k++) {
      const q = c.at((4 * k) / 400).q[0];
      expect(q).toBeGreaterThanOrEqual(-1e-12);
      expect(q).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
});
