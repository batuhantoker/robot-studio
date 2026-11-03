import { describe, expect, it } from 'vitest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { jacobianAt } from '@/core/chain/kinematics/jacobian';
import { jacobianSVD } from '@/core/math/decompose/svd';
import { chainFromModel } from '@/physics/extract/chain/from-model';
import { ModelHandle } from '@/physics/model/handle';
import { expectClose } from '../support/fixtures';

const PENDULUM = `<mujoco><worldbody><body name="rod" pos="0 0 1">
  <joint name="swing" type="hinge" axis="0 1 0"/>
  <geom type="capsule" fromto="0 0 0 0 0 -0.5" size="0.01" mass="0"/>
  <geom type="sphere" pos="0 0 -0.5" size="0.05" mass="2"/>
</body></worldbody></mujoco>`;

describe('tool point fallback', () => {
  it('moves a body-origin tip off the joint axis to the subtree centre of mass', async () => {
    const h = await ModelHandle.fromXml(PENDULUM);
    try {
      const { chain } = chainFromModel(h, ['swing'], { body: 'rod' });
      const f = chainFrames(chain, [0]);
      expectClose(f.tip.p, [0, 0, 0.5], 1e-12);
      expect(jacobianSVD(jacobianAt(chain, f, f.tip.p).Jv).manipulability).toBeCloseTo(0.5, 12);
      // An explicit offset is respected even when it lies on the axis.
      const explicit = chainFromModel(h, ['swing'], { body: 'rod', pos: [0, 0.2, 0] }).chain;
      expectClose(chainFrames(explicit, [0]).tip.p, [0, 0.2, 1], 1e-12);
    } finally {
      h.dispose();
    }
  });
});
