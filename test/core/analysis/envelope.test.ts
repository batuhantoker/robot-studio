import { describe, expect, it } from 'vitest';
import { envelopeOutline, sideEnvelope } from '@/core/analysis/workspace/envelope';
import type { Vec3 } from '@/core/math/linear/vec';
import { rng, uniform } from '@/core/math/random/rng';

describe('side envelope', () => {
  it('fills an annulus of reach and traces its inner and outer boundary', () => {
    const next = rng(4);
    const points: Vec3[] = Array.from({ length: 6000 }, () => {
      const r = uniform(next, 0.3, 0.8), a = uniform(next, 0, Math.PI * 2), z = uniform(next, -0.2, 0.4);
      return [r * Math.cos(a), r * Math.sin(a), z];
    });
    const e = sideEnvelope(points, [0, 0, 0], 40);
    const at = (r: number, z: number) => e.filled[Math.floor((z - e.z0) / e.cell) * e.nr + Math.floor(r / e.cell)];
    expect(at(0.55, 0.1)).toBe(1);
    expect(at(0.1, 0.1)).toBe(0);
    expect(at(0.95, 0.1)).toBe(0);
    const xs = envelopeOutline(e).flatMap(([a, , c]) => [Math.abs(a), Math.abs(c)]);
    expect(Math.max(...xs)).toBeGreaterThan(0.78);
    expect(Math.max(...xs)).toBeLessThan(0.86);
    expect(xs.some((x) => x > 0.25 && x < 0.33)).toBe(true);
  });
});
