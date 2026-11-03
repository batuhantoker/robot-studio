import { describe, expect, it } from 'vitest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { approachIk } from '@/core/solvers/ik/approach';
import { homePose } from '@/core/robot/config/pose';
import { presetSpec } from '../../support/fixtures';

const down: [number, number, number] = [0, 0, -1];

describe('approach IK', () => {
  it('spatial_6link reaches a floor-level point with the tool pointing straight down', () => {
    const spec = presetSpec('spatial_6link');
    const chain = chainFromSpec(spec);
    const r = approachIk(chain, [0.35, 0.15, 0.08], down, [1, 0, 0], homePose(spec), 0.2);
    expect(r.position).toBeLessThan(1e-4);
    expect(r.tilt).toBeLessThan(0.03);
    expect(chainFrames(chain, r.q).tip.p[2]).toBeCloseTo(0.08, 4);
  });

  it('a 3-DOF arm still lands on the point and reports the tilt it cannot remove', () => {
    const spec = presetSpec('spatial_3link');
    const r = approachIk(chainFromSpec(spec), [0.35, 0.1, 0.1], down, [1, 0, 0], homePose(spec), 0.2);
    expect(r.position).toBeLessThan(1e-4);
    expect(r.tilt).toBeGreaterThan(0);
    expect(Number.isFinite(r.tilt)).toBe(true);
  });
});
