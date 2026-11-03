import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/app/presets/load';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { lowestSolidZ } from '@/cad/common/lowest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { homePose } from '@/core/robot/config/pose';

describe('every preset stands on its floor at home', () => {
  for (const { id, spec } of PRESETS) {
    it(id, () => {
      const assembly = buildSpecAssembly(spec);
      assembly.update([chainFrames(chainFromSpec(spec), homePose(spec))], 0);
      expect(lowestSolidZ(assembly.root)).toBeCloseTo(assembly.floorZ, 6);
    });
  }
});
