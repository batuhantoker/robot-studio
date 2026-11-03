import { describe, expect, it } from 'vitest';
import { formatG17, pythonFloat } from '@/core/mjcf/format/numbers';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { presetNames, presetSpec, python } from '../../support/fixtures';

describe('MJCF writer is byte-identical to SerialArm.to_mjcf', () => {
  for (const name of presetNames) {
    it(name, () => {
      expect(toMjcf(presetSpec(name))).toBe(python.robots[name].mjcf);
      expect(toMjcf(presetSpec(name), 0.01)).toBe(python.robots[name].mjcf_dt_0_01);
    });
  }

  it('formats floats like Python', () => {
    expect([0.1, 1, 0, -0, 1e-5, 123456789012345680000, 2.5e-7].map(formatG17)).toEqual([
      '0.10000000000000001', '1', '0', '-0', '1.0000000000000001e-05', '1.2345678901234568e+20', '2.4999999999999999e-07',
    ]);
    expect([0.002, 1, 1e-5, 1e16, 123.25, -0.5, 0.0001].map(pythonFloat)).toEqual([
      '0.002', '1.0', '1e-05', '1e+16', '123.25', '-0.5', '0.0001',
    ]);
  });
});
