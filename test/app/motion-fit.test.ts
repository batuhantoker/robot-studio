import { describe, expect, it, vi } from 'vitest';
import { clearClip } from '@/app/controller/motion/player';
import type { RobotSession } from '@/app/robots/session';
import type { MotionPreset } from '@/core/motion/types';

const swing = (): MotionPreset => ({
  id: 'swing', label: 'Swing', hint: '',
  build: vi.fn((_r, q0: number[], size: number) => ({ period: 4, at: (t: number) => [q0[0] + size * Math.sin((2 * Math.PI * t) / 4)] })),
});

const robot = (wall: number, extra = {}) => ({
  joints: [{ name: 'j', type: 'hinge', limits: [-3, 3] }],
  collision: { hit: (q: number[]) => (q[0] > wall ? { a: 'link', b: 'wall' } : null) },
  ...extra,
}) as unknown as RobotSession;

const reach = (clip: ReturnType<typeof clearClip>) => Math.max(...Array.from({ length: 200 }, (_, i) => clip.at((clip.period * i) / 200)[0]));

describe('fitting a motion clear of contact', () => {
  it('leaves a clip that never touches at full size', () => {
    const p = swing();
    expect(reach(clearClip(robot(5), p, [0], 1))).toBeCloseTo(1, 2);
    expect(p.build).toHaveBeenCalledTimes(1);
  });

  it('shrinks a clip until it clears, staying as large as it can', () => {
    const clip = clearClip(robot(0.7), swing(), [0], 1);
    expect(reach(clip)).toBeLessThanOrEqual(0.7);
    expect(reach(clip)).toBeGreaterThan(0.5);
  });

  it('keeps the smallest size when nothing clears, for the playback stop to hold', () => {
    expect(reach(clearClip(robot(0.05), swing(), [0], 1))).toBeCloseTo(0.2, 2);
  });

  it('never rescales a hand, whose motions are choreography', () => {
    const p = swing();
    expect(reach(clearClip(robot(0.2, { prosthesis: {} }), p, [0], 1))).toBeCloseTo(1, 2);
    expect(p.build).toHaveBeenCalledTimes(1);
  });

  it('checks the lead-in as well as the loop', () => {
    const lead: MotionPreset = {
      id: 'lead', label: 'Lead', hint: '',
      build: (_r, q0: number[], size: number) => ({ period: 1, lead: 1, at: (t: number) => [q0[0] + (t < 1 ? size * Math.sin(Math.PI * t) : 0)] }),
    };
    const clip = clearClip(robot(0.7), lead, [0], 1);
    expect(Math.max(...Array.from({ length: 200 }, (_, i) => clip.at(i / 200)[0]))).toBeLessThanOrEqual(0.7);
  });

  it('starts as asked from a pose already touching', () => {
    expect(reach(clearClip(robot(-1), swing(), [0], 1))).toBeCloseTo(1, 2);
  });
});
