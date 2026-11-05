import { describe, expect, it } from 'vitest';
import { dofLimits } from '@/core/robot/config/pose';
import { defaultWaypoints, sampleQuintic } from '@/core/trajectory/quintic/sample';
import { expectClose, presetSpec, python } from '../../support/fixtures';

describe('quintic sampling matches analyze()', () => {
  for (const key of ['scenario', 'default'] as const) {
    it(key, () => {
      const m = python.trajectory[key];
      const spec = presetSpec(m.robot);
      const limits = dofLimits(spec);
      const motion = sampleQuintic(m.waypoints ?? defaultWaypoints(limits), m.duration, m.timestep, limits);
      expectClose(motion.t, m.t, 1e-12);
      expectClose(motion.q.flat(), m.q.flat(), 1e-12);
      expectClose(motion.qd.flat(), m.qd.flat(), 1e-11);
      expectClose(motion.qdd.flat(), m.qdd.flat(), 1e-10);
    });
  }
});

describe('default waypoints', () => {
  const limits: [number, number][] = [[-1, 1], [-3, 3]];

  it('starts from zero unless told otherwise, as analyze() does', () => {
    expect(defaultWaypoints(limits)[0]).toEqual([0, 0]);
  });

  it('swings around the given home and returns to it, within limits', () => {
    const w = defaultWaypoints(limits, [0.9, -1.5]);
    expect(w[0]).toEqual([0.9, -1.5]);
    expect(w.at(-1)).toEqual([0.9, -1.5]);
    expect(w[1]).toEqual([1, -1.15]);
  });
});
