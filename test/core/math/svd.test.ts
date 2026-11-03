import { describe, expect, it } from 'vitest';
import { jacobianSVD } from '@/core/math/decompose/svd';

describe('Jacobian conditioning', () => {
  it('measures 1- and 2-DOF chains over the joints that exist', () => {
    const one = jacobianSVD([[0.3], [0.4], [0]]);
    expect(one.manipulability).toBeCloseTo(0.5, 12);
    expect(one.condition).toBe(1);
    const two = jacobianSVD([[1, 0], [0, 2], [0, 0]]);
    expect(two.manipulability).toBeCloseTo(2, 12);
    expect(two.condition).toBeCloseTo(2, 12);
  });

  it('is √det(J Jᵀ) for three or more joints and flags real singularities', () => {
    const J = [[2, 0, 0, 1], [0, 3, 0, 0], [0, 0, 1, 0]];
    expect(jacobianSVD(J).manipulability).toBeCloseTo(Math.sqrt(5 * 9 * 1), 10);
    const singular = jacobianSVD([[1, 1, 0], [0, 0, 0], [0, 0, 1]]);
    expect(singular.rank).toBe(2);
    expect(singular.condition).toBe(Infinity);
  });
});
