import { describe, expect, it } from 'vitest';
import { sampleWorkspace } from '@/core/analysis/workspace/sample';
import { summarize } from '@/core/analysis/workspace/summary';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { presetSpec } from '../../support/fixtures';

describe('workspace & limits', () => {
  it('bounds reach and flags poses the motors cannot hold', () => {
    const spec = presetSpec('planar_2link');
    const chain = chainFromSpec(spec);
    const weak = spec.links.map(() => 0.5);
    const s = summarize(sampleWorkspace(chain, 800, weak, 2));
    expect(s.reachMax).toBeLessThanOrEqual(0.55 + 0.1 + 1e-9);
    expect(s.zMin).toBeCloseTo(0.1, 12);
    expect(s.overTorque).toBe(0);
    const heavy = chainFromSpec({ ...spec, links: spec.links.map((l) => ({ ...l, axis: [0, 1, 0] as [number, number, number], dofs: l.dofs.map((d) => ({ ...d, axis: [0, 1, 0] as [number, number, number] })) })) });
    expect(summarize(sampleWorkspace(heavy, 800, weak, 2)).overTorque).toBeGreaterThan(0.5);
  });
});
