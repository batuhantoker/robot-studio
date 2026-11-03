import { describe, expect, it } from 'vitest';
import { type P2, convexHull, hullCandidates, offsetPolygon, roundedHull } from '@/core/math/planar/hull';
import { rng } from '@/core/math/random/rng';

const area = (poly: P2[]) => poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

describe('planar hulls', () => {
  it('keeps only the corners of a square, counter-clockwise', () => {
    const hull = convexHull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5], [0.5, 0], [0.2, 0.7]]);
    expect(hull).toHaveLength(4);
    expect(area(hull)).toBeCloseTo(1, 12);
  });

  it('octagon prefilter never drops a hull vertex', () => {
    const next = rng(7);
    for (let trial = 0; trial < 40; trial++) {
      const flat = Array.from({ length: 2 * (3 + Math.floor(next() * 400)) }, () => next() * 2 - 1);
      const all: P2[] = Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]]);
      expect(convexHull(hullCandidates(flat))).toEqual(convexHull(all));
    }
  });

  it('grows points and segments into areas, and offsets edges by the distance', () => {
    expect(area(roundedHull([[0, 0]], 0.1, 64))).toBeCloseTo(Math.PI * 0.01, 3);
    expect(area(roundedHull([[0, 0], [1, 0]], 0.1, 64))).toBeCloseTo(0.2 + Math.PI * 0.01, 3);
    expect(area(offsetPolygon([[0, 0], [1, 0], [1, 1], [0, 1]], 0.25))).toBeCloseTo(1.5 * 1.5, 12);
  });
});
