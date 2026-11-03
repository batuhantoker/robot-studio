import { describe, expect, it } from 'vitest';
import { forwardKinematics } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { kaneFK, kaneLengths } from '@/core/legacy/kane/closed-form';
import { expectClose, presetSpec, python } from '../../support/fixtures';

describe('Kane closed form', () => {
  it('detects the original arm and matches the legacy millimetre FK', () => {
    const spec = presetSpec('original_4dof');
    const L = kaneLengths(spec);
    expect(L).toEqual({ Laz: 0.055, Lax: 0.05, Lb: 0.1, Lt: 0.09 });
    const chain = chainFromSpec(spec);
    for (const c of python.kane) {
      expectClose(kaneFK(c.q, L!).map((v) => v * 1000), c.position_mm, 1e-9);
      expectClose(forwardKinematics(chain, c.q).p, kaneFK(c.q, L!), 1e-15);
    }
  });

  it('ignores robots with other structure', () => {
    expect(kaneLengths(presetSpec('spatial_6link'))).toBeNull();
  });
});
