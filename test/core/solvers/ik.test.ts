import { describe, expect, it } from 'vitest';
import { forwardKinematics } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import type { Vec3 } from '@/core/math/linear/vec';
import { inverseKinematics } from '@/core/solvers/ik/dls';
import { expectClose, presetNames, presetSpec, python } from '../../support/fixtures';

describe('DLS IK reproduces SerialArm.inverse_kinematics from the same start', () => {
  for (const name of presetNames) {
    it(name, () => {
      const chain = chainFromSpec(presetSpec(name));
      for (const c of python.robots[name].ik) {
        const result = inverseKinematics(chain, c.target as Vec3, c.q0, { restarts: 0 });
        expect(result.success).toBe(c.success);
        if (c.success) {
          expect(result.residual).toBeLessThanOrEqual(1e-5);
          expectClose(forwardKinematics(chain, result.q).p, c.target, 1e-5);
          expectClose(result.q, c.q, 1e-6);
        }
        expect(result.steps.length).toBeGreaterThan(0);
      }
    });
  }
});
