import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/linear/vec';
import { FINGERS, PAD, SHADOW_LAYOUT, cubeBoxes, fingerTarget, touching } from '@/core/rubik/script';
import type { Beat } from '@/core/rubik/timeline';

/** Distance from a point to the cube as it stands at `phase` of a beat (the turning layer separate). */
function gap(kind: Beat['kind'], phase: number, p: Vec3): number {
  return Math.min(...cubeBoxes(kind, phase).map((b) => {
    const d = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]];
    const q = [0, 1, 2].map((i) => Math.abs(b.R[i] * d[0] + b.R[3 + i] * d[1] + b.R[6 + i] * d[2]) - b.half[i]);
    return Math.hypot(...q.map((v) => Math.max(v, 0))) + Math.min(Math.max(...q), 0);
  }));
}

const SWAP: Partial<Record<Beat['kind'], Beat['kind']>> = { cw: 'ccw', ccw: 'cw', yawL: 'yawR', yawR: 'yawL' };
const KINDS: Beat['kind'][] = ['cw', 'ccw', 'yawL', 'yawR', 'flipFar', 'flipNear'];

describe('finger script', () => {
  it('keeps every touching fingertip a pad radius off the turning cube', () => {
    for (const kind of KINDS) for (const f of FINGERS) for (let i = 0; i <= 40; i++) {
      const phase = i / 40;
      if (!touching(kind, f, phase)) continue;
      const pad = f === 'thumb' ? PAD.thumb : PAD.finger;
      expect(gap(kind, phase, fingerTarget(kind, f, phase))).toBeCloseTo(pad, 3);
    }
  });

  it('mirrors for a left hand: the reflected script of the opposite turn stays on the cube as it really turns', () => {
    for (const kind of KINDS) for (const f of FINGERS) for (let i = 0; i <= 40; i++) {
      const phase = i / 40, played = SWAP[kind] ?? kind;
      if (!touching(played, f, phase)) continue;
      const p = fingerTarget(played, f, phase);
      const pad = f === 'thumb' ? PAD.thumb : PAD.finger;
      expect(gap(kind, phase, [-p[0], p[1], p[2]])).toBeCloseTo(pad, 3);
    }
  });

  it('starts and ends every beat at the cradle, so beats join without a jump', () => {
    for (const kind of KINDS) for (const f of FINGERS) {
      const rest = fingerTarget('hold', f, 0);
      expect(fingerTarget(kind, f, 0)).toEqual(rest);
      fingerTarget(kind, f, 1).forEach((v, k) => expect(v).toBeCloseTo(rest[k], 9));
    }
  });

  it('presses clockwise turns on the thumb side of the far face, counter-clockwise on the little finger side', () => {
    const col = (kind: Beat['kind']) => FINGERS.filter((f) => f !== 'thumb' && touching(kind, f, 0.45)).map((f) => SHADOW_LAYOUT.columns[f]!);
    expect(col('cw').every((x) => x > 0)).toBe(true);
    expect(col('ccw').every((x) => x < 0)).toBe(true);
  });
});
