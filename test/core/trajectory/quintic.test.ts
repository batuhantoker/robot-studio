import { describe, it } from 'vitest';
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
