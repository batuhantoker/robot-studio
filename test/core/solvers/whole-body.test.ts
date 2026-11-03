import { describe, expect, it } from 'vitest';
import { forwardKinematics } from '@/core/chain/kinematics/frames';
import { mergeLimbs, sharedJoints } from '@/core/chain/limbs/types';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import type { Vec3 } from '@/core/math/linear/vec';
import { parseRobot } from '@/core/robot/schema/parse';
import { solveWholeBody } from '@/core/solvers/ik/multi';
import { expectClose, presetNames, presetSpec, python } from '../../support/fixtures';

const arm = (side: 1 | -1) => chainFromSpec(parseRobot({
  units: 'SI',
  links: [
    { name: 'waist', axis: [0, 0, 1], offset: [0, 0.2 * side, 0.4], mass: 1 },
    { name: 'shoulder', axis: [0, 1, 0], offset: [0.25, 0, 0], mass: 0.5 },
    { name: 'elbow', axis: [0, 1, 0], offset: [0.2, 0, 0], mass: 0.3 },
    { name: 'wrist', axis: [1, 0, 0], offset: [0.05, 0, 0], mass: 0.1 },
  ],
}));

describe('whole-body IK', () => {
  it('with one limb, reproduces SerialArm.inverse_kinematics like the single-chain solver', () => {
    for (const name of presetNames) {
      const chain = chainFromSpec(presetSpec(name));
      const { joints, limbs } = mergeLimbs([{ name, chain, keys: chain.joints.map((j) => j.name) }]);
      for (const c of python.robots[name].ik) {
        const r = solveWholeBody(limbs, joints, [{ limb: 0, point: c.target as Vec3 }], c.q0, { restarts: 0 });
        expect(r.success, name).toBe(c.success);
        if (c.success) expectClose(r.q, c.q, 1e-6);
      }
    }
  });

  it('reaches two hand targets at once through a shared waist', () => {
    const left = arm(1), right = arm(-1);
    const keys = (prefix: string) => ['waist', `${prefix}_shoulder`, `${prefix}_elbow`, `${prefix}_wrist`];
    const { joints, limbs } = mergeLimbs([
      { name: 'left', chain: left, keys: keys('l') },
      { name: 'right', chain: right, keys: keys('r') },
    ]);
    expect(joints).toHaveLength(7);
    expect([...sharedJoints(limbs)]).toEqual([0]);
    const goal = [0.3, -0.5, 0.2, 0.1, 0.4, -0.3, 0];
    const pick = (l: number) => limbs[l].index.map((i) => goal[i]);
    const targets = [0, 1].map((l) => ({ limb: l, point: forwardKinematics(limbs[l].chain, pick(l)).p }));
    const r = solveWholeBody(limbs, joints, targets, new Array(7).fill(0), { seed: 3 });
    expect(r.success).toBe(true);
    for (const t of targets) {
      expectClose(forwardKinematics(limbs[t.limb].chain, limbs[t.limb].index.map((i) => r.q[i])).p, t.point, 1e-5);
    }
  });
});
