import { describe, expect, it } from 'vitest';
import { forwardKinematics } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import type { Chain } from '@/core/chain/model/types';
import { twinFromChain } from '@/core/chain/twin/spec-from-chain';
import { matMul, rodrigues } from '@/core/math/linear/mat3';
import { normalize, type Vec3 } from '@/core/math/linear/vec';
import { rng, uniform } from '@/core/math/random/rng';
import { expectClose } from '../../support/fixtures';

/** Chains with arbitrary fixed rotations between joints, like compiled MJCF/URDF models. */
function randomChain(next: () => number): Chain {
  const v = (s: number): Vec3 => [uniform(next, -s, s), uniform(next, -s, s), uniform(next, -s, s)];
  const n = 1 + Math.floor(next() * 7);
  return {
    name: 'fuzz',
    base: { R: rodrigues(normalize(v(1)), uniform(next, -3, 3)), p: v(0.2) },
    joints: Array.from({ length: n }, (_, k) => ({
      name: `joint ${k}`,
      type: next() < 0.2 ? ('slide' as const) : ('hinge' as const),
      fixed: { R: rodrigues(normalize(v(1)), uniform(next, -3, 3)), p: v(0.3) },
      axis: normalize(v(1)),
      limits: [-2, 2] as [number, number],
      q0: 0,
    })),
    tip: { R: rodrigues(normalize(v(1)), 1), p: v(0.1) },
    masses: [],
    gravity: [0, 0, -9.81],
  };
}

describe('kinematic twin', () => {
  it('matches tool position for every pose and rotation up to the constant C_n', () => {
    const next = rng(5);
    for (let trial = 0; trial < 150; trial++) {
      const chain = randomChain(next);
      const twin = twinFromChain(chain, { name: 'twin', radius: [] });
      const twinChain = chainFromSpec(twin.spec);
      expect(twinChain.joints.length).toBe(chain.joints.length);
      for (let s = 0; s < 5; s++) {
        const q = chain.joints.map(() => uniform(next, -2, 2));
        const a = forwardKinematics(chain, q);
        const b = forwardKinematics(twinChain, q);
        expectClose(b.p, a.p, 1e-12);
        expectClose(matMul(b.R, twin.toolRotation), a.R, 1e-12);
      }
    }
  });
});
