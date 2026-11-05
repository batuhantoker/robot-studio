import { describe, expect, it } from 'vitest';
import { inertiaBox } from '@/cad/assembly/mjcf/inertia';
import type { BodyInfo } from '@/physics/extract/bodies';

const body = (mass: number, inertia: [number, number, number]) =>
  ({ id: 1, name: 'link', mass, inertia, ipos: [0, 0, 0], iquat: [1, 0, 0, 0] }) as unknown as BodyInfo;

describe('equivalent-inertia box', () => {
  it('keeps a box that fits its part', () => {
    expect(inertiaBox(body(8, [0.1, 0.1, 0.02]), 0.6)).not.toBeNull();
  });

  it('skips the 245 m box of a placeholder inertia on a boundmass link', () => {
    expect(inertiaBox(body(0.0001, [1, 1, 1]), 0.4)).toBeNull();
  });

  it('skips a placeholder inertia on a link of ordinary mass', () => {
    expect(inertiaBox(body(8, [1, 1, 1]), 0.46)).toBeNull();
  });
});
