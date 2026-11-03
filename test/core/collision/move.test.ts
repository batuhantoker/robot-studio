import { describe, expect, it } from 'vitest';
import { guardMove } from '@/core/collision/move';
import { freeSample } from '@/core/collision/sample';

const wall = (at: number) => (q: number[]) => (q[0] > at ? 'wall' : null);

describe('guardMove', () => {
  it('passes a free move unchanged', () => {
    expect(guardMove(wall(5), [0, 0], [2, 1], [0.02, 0.02])).toEqual({ q: [2, 1], contact: null });
  });

  it('stops just short of the first contact, keeping the path straight', () => {
    const g = guardMove(wall(1), [0, 0], [2, 0.5], [0.02, 0.02]);
    expect(g.contact).toBe('wall');
    expect(g.q[0]).toBeLessThanOrEqual(1);
    expect(g.q[0]).toBeGreaterThan(1 - 1e-4);
    expect(g.q[1]).toBeCloseTo(g.q[0] / 4, 12);
  });

  it('does not tunnel through an obstacle thinner than the jump', () => {
    const slab = (q: number[]) => (q[0] > 0.5 && q[0] < 0.52 ? 'slab' : null);
    const g = guardMove(slab, [0], [2], [0.01]);
    expect(g.contact).toBe('slab');
    expect(g.q[0]).toBeLessThanOrEqual(0.5);
    expect(g.q[0]).toBeGreaterThan(0.49);
  });

  it('lets a pose that already touches move out', () => {
    expect(guardMove(wall(1), [1.5], [0], [0.02])).toEqual({ q: [0], contact: null });
  });
});

describe('freeSample', () => {
  it('returns the first free draw, or null when none is free', () => {
    let i = 0;
    const draws = [[3], [2], [0.5], [0.2]];
    expect(freeSample(wall(1), () => draws[i++])).toEqual([0.5]);
    expect(freeSample(wall(1), () => [9], 5)).toBeNull();
  });
});
