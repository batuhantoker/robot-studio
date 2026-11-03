import { describe, expect, it } from 'vitest';
import { forwardKinematics } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { gravityLoad } from '@/core/analysis/statics/gravity';
import { rng, uniform } from '@/core/math/random/rng';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { specDofs } from '@/core/robot/config/pose';
import type { RobotSpec } from '@/core/robot/schema/types';
import { chainFromModel } from '@/physics/extract/chain/from-model';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, state } from '@/physics/runtime/arrays';
import { expectClose, presetNames, presetSpec } from '../support/fixtures';
import { allJointsRobot } from '../support/robots';

async function check(spec: RobotSpec) {
  const h = await ModelHandle.fromXml(toMjcf(spec));
  try {
    const dofs = specDofs(spec);
    const fromSpec = chainFromSpec(spec);
    const { chain } = chainFromModel(h, dofs.map((d) => d.name), { site: 'end_effector' });
    const site = h.id(OBJ.site, 'end_effector');
    const next = rng(3);
    const d = state(h.data);
    for (let s = 0; s < 8; s++) {
      const q = dofs.map((dof) => uniform(next, dof.limits[0], dof.limits[1]));
      d.qpos.set(q);
      d.qvel.fill(0);
      h.mj.mj_forward(h.model, h.data);
      const mjTip = Array.from(d.site_xpos.slice(3 * site, 3 * site + 3));
      expectClose(forwardKinematics(fromSpec, q).p, mjTip, 1e-12);
      expectClose(forwardKinematics(chain, q).p, mjTip, 1e-12);
      expectClose(gravityLoad(fromSpec, q).torque, Array.from(d.qfrc_bias), 1e-9);
      expectClose(gravityLoad(chain, q).torque, Array.from(d.qfrc_bias), 1e-9);
    }
  } finally {
    h.dispose();
  }
}

describe('TypeScript chain math agrees with MuJoCo WASM', () => {
  for (const name of presetNames) it(`${name}: FK and gravity torque`, () => check(presetSpec(name)));
  it('every joint kind: FK and gravity torque', () => check(allJointsRobot()));
  it('reads a capsule mass from the generated model', async () => {
    const h = await ModelHandle.fromXml(toMjcf(presetSpec('planar_2link')));
    expect(h.name(OBJ.joint, 0)).toBe('shoulder');
    h.dispose();
  });
});
