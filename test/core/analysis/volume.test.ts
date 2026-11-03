import { describe, expect, it } from 'vitest';
import { moveFirstJoint, occupancy, surfaceMesh } from '@/core/analysis/workspace/volume';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { rodrigues } from '@/core/math/linear/mat3';
import type { Vec3 } from '@/core/math/linear/vec';
import { rng, uniform } from '@/core/math/random/rng';
import { expectClose, presetSpec } from '../../support/fixtures';

function annulus(n: number): Vec3[] {
  const next = rng(4);
  return Array.from({ length: n }, () => {
    const r = uniform(next, 0.3, 0.8), a = uniform(next, 0, Math.PI * 2), z = uniform(next, -0.2, 0.4);
    return [r * Math.cos(a), r * Math.sin(a), z];
  });
}

function signedVolume({ positions: p, indices: t }: { positions: Float32Array; indices: Uint32Array }): number {
  let v = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i], t[i + 1], t[i + 2]].map((k) => [p[3 * k], p[3 * k + 1], p[3 * k + 2]]);
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
}

describe('workspace volume', () => {
  it('moves the first joint exactly, for a tilted, offset base and for a slide', () => {
    const arm = chainFromSpec(presetSpec('spatial_6link'));
    const tilted = { ...arm, base: { R: rodrigues([0.6, 0.8, 0], 0.7), p: [0.3, -0.2, 0.5] as Vec3 } };
    const slide = { ...tilted, joints: [{ ...tilted.joints[0], type: 'slide' as const }, ...tilted.joints.slice(1)] };
    const next = rng(7);
    for (const chain of [tilted, slide]) {
      for (let i = 0; i < 20; i++) {
        const q = chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
        const to = uniform(next, chain.joints[0].limits[0], chain.joints[0].limits[1]);
        const moved = moveFirstJoint(chain, chainFrames(chain, q), q, to);
        expectClose(moved, chainFrames(chain, [to, ...q.slice(1)]).tip.p, 1e-9);
      }
    }
  });

  it('keeps the hole of an annulus and fills its ring', () => {
    const o = occupancy(annulus(60000), 30);
    const at = (p: Vec3) => {
      const [i, j, k] = [0, 1, 2].map((a) => Math.round((p[a] - o.origin[a]) / o.cell));
      return o.filled[i + o.dims[0] * (j + o.dims[1] * k)];
    };
    expect(at([0.55, 0, 0.1])).toBe(1);
    expect(at([0, -0.55, 0.1])).toBe(1);
    expect(at([0, 0, 0.1])).toBe(0);
    expect(at([0.95, 0, 0.1])).toBe(0);
  });

  it('meshes a closed, outward-facing shell of the right volume', () => {
    const m = surfaceMesh(occupancy(annulus(60000), 30));
    const edges = new Map<string, number>();
    for (let i = 0; i < m.indices.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        const key = `${m.indices[i + e]}>${m.indices[i + ((e + 1) % 3)]}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const [key, n] of edges) {
      const [a, b] = key.split('>');
      expect(n).toBe(1);
      expect(edges.get(`${b}>${a}`)).toBe(1);
    }
    const exact = Math.PI * (0.8 ** 2 - 0.3 ** 2) * 0.6;
    expect(signedVolume(m) / exact).toBeGreaterThan(0.95);
    expect(signedVolume(m) / exact).toBeLessThan(1.05);
  });
});
