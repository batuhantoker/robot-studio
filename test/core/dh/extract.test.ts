import { describe, expect, it } from 'vitest';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { extractDH } from '@/core/dh/extract/table';
import { verifyDH } from '@/core/dh/forward/transform';
import { rng, uniform } from '@/core/math/random/rng';
import { parseRobot } from '@/core/robot/schema/parse';
import { presetNames, presetSpec } from '../../support/fixtures';

const KINDS = ['revolute', 'revolute', 'revolute', 'prismatic', 'cylindrical', 'universal', 'spherical', 'planar'];

const unit = (next: () => number) => {
  const v = [uniform(next, -1, 1), uniform(next, -1, 1), uniform(next, -1, 1)];
  return next() < 0.5 ? v : [[1, 0, 0], [0, 1, 0], [0, 0, 1]][Math.floor(next() * 3)];
};

describe('DH extraction reproduces chain FK', () => {
  for (const name of presetNames) {
    it(name, () => {
      const chain = chainFromSpec(presetSpec(name));
      expect(verifyDH(extractDH(chain), chain)).toBeLessThan(1e-10);
    });
  }

  it('fuzzed chains mixing every joint kind', () => {
    const next = rng(11);
    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + Math.floor(next() * 7);
      let spec;
      try {
        spec = parseRobot({
        units: 'SI',
        base: [uniform(next, -0.1, 0.1), uniform(next, -0.1, 0.1), uniform(next, 0, 0.2)],
        tool: next() < 0.5 ? [0, 0, 0] : [uniform(next, -0.05, 0.05), 0, uniform(next, 0, 0.1)],
        links: Array.from({ length: n }, (_, k) => ({
          name: `j${k}`,
          joint: KINDS[Math.floor(next() * KINDS.length)],
          axis: unit(next),
          axis2: unit(next),
          offset: next() < 0.2 ? [0, 0, 0] : [uniform(next, -0.3, 0.3), uniform(next, -0.3, 0.3), uniform(next, -0.3, 0.3)],
          mass: 0.1,
        })),
        });
      } catch {
        continue; // random axis2 parallel to axis
      }
      const chain = chainFromSpec(spec);
      expect(verifyDH(extractDH(chain), chain), `trial ${trial}`).toBeLessThan(1e-9);
    }
  });
});
