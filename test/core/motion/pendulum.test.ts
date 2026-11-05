import { describe, expect, it } from 'vitest';
import { identityTransform } from '@/core/math/linear/transform';
import { pendulumPresets, pendulumRow } from '@/core/motion/generators/pendulum';
import { presetsFor } from '@/core/motion/presets';
import type { MotionRobot } from '@/core/motion/types';

const joint = (i: number) => ({ name: `p${i}`, type: 'hinge', limits: [-1.57, 1.57] });
const pendulum = (i: number, x: number) => ({
  name: `p${i}`, index: [i],
  chain: {
    name: `p${i}`, base: { ...identityTransform(), p: [x, 0, 0.75] }, masses: [], gravity: [0, 0, -9.81],
    joints: [{ name: `p${i}`, type: 'hinge', fixed: identityTransform(), axis: [1, 0, 0], limits: [-1.57, 1.57], q0: 0 }],
    tip: { ...identityTransform(), p: [0, 0, -0.5] },
  },
});

const row = (xs: number[]) => ({ joints: xs.map((_, i) => joint(i)), limbs: xs.map((x, i) => pendulum(i, x)) }) as unknown as MotionRobot;

describe('pendulum row', () => {
  it('orders joints along the row, whatever order the manifest lists them', () => {
    const r = row([0.2, -0.9, 0.5, -0.1]);
    expect(pendulumRow(r, [0, 0, 0, 0])).toEqual([1, 3, 0, 2]);
  });

  it('is not a row unless every limb is one hinge', () => {
    const r = row([0, 1, 2]);
    r.limbs[1] = { ...r.limbs[1], index: [1, 2] };
    expect(pendulumRow(r, [0, 0, 0])).toBeNull();
  });

  it('offers row motions instead of tool paths', () => {
    const r = row([0, 0.1, 0.2, 0.3]);
    expect(presetsFor(r, [0, 0, 0, 0], 'other').map((p) => p.id)).toEqual(['wave', 'together', 'travel', 'alternate', 'pulse']);
  });

  it.each(pendulumPresets([0, 1, 2, 3]).map((p) => [p.id, p] as const))('%s starts at rest and stays within limits', (_, preset) => {
    const r = row([0, 0.1, 0.2, 0.3]);
    const q0 = [-0.785, -0.785, -0.785, -0.785];
    const c = preset.build(r, q0, 1);
    expect(c.at(0)).toEqual(q0);
    for (let t = 0; t < 40; t += 0.13) for (const v of c.at(t)) expect(Math.abs(v)).toBeLessThanOrEqual(1.57);
  });

  it('lines the pendulum wave up again after its period', () => {
    const r = row([0, 0.1, 0.2, 0.3]);
    const q0 = [0, 0, 0, 0];
    const c = pendulumPresets([0, 1, 2, 3])[0].build(r, q0, 1);
    const moved = (t: number) => Math.max(...c.at(t).map(Math.abs));
    expect(moved(c.period)).toBeLessThan(1e-9);
    expect(moved(c.period / 7)).toBeGreaterThan(0.1);
  });
});
