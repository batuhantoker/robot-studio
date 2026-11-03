import { describe, expect, it } from 'vitest';
import { atLimit, enforceLimits } from '@/core/chain/limbs/limits';
import type { RobotJoint } from '@/core/chain/limbs/types';

const joints: RobotJoint[] = [
  { name: 'elbow', type: 'hinge', limits: [-1, 2], q0: 0 },
  { name: 'wheel', type: 'hinge', limits: [-Math.PI, Math.PI], q0: 0, continuous: true },
  { name: 'rail', type: 'slide', limits: [0, 0.3], q0: 0 },
];

describe('joint ranges', () => {
  it('clamps limited joints and wraps continuous ones into one turn', () => {
    const q = enforceLimits(joints, [2.5, 3 * Math.PI + 0.25, -0.1]);
    expect(q[0]).toBe(2);
    expect(q[1]).toBeCloseTo(-Math.PI + 0.25, 12);
    expect(q[2]).toBe(0);
    expect(atLimit(joints, q)).toEqual([true, false, true]);
  });
});
