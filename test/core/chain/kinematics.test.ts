import { describe, it } from 'vitest';
import { forwardKinematics } from '@/core/chain/kinematics/frames';
import { positionJacobian } from '@/core/chain/kinematics/jacobian';
import { chainFromSpec, specJointPositions } from '@/core/chain/model/from-spec';
import { expectClose, presetNames, presetSpec, python } from '../../support/fixtures';

describe('chain kinematics match SerialArm', () => {
  for (const name of presetNames) {
    it(name, () => {
      const spec = presetSpec(name);
      const chain = chainFromSpec(spec);
      for (const c of python.robots[name].kinematics) {
        const T = forwardKinematics(chain, c.q);
        expectClose(T.p, c.position, 1e-12);
        expectClose(T.R, c.rotation, 1e-12);
        expectClose(specJointPositions(spec, chain, c.q).flat(), c.points.flat(), 1e-12);
        expectClose(positionJacobian(chain, c.q).flat(), c.jacobian.flat(), 1e-12);
      }
    });
  }
});
