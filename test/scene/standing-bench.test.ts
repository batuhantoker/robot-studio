import { beforeAll, describe, expect, it } from 'vitest';
import { createEnvironment } from '@/scene/stage/environment';

// Scenery paints small canvas textures; node has no canvas, and nothing here draws them.
beforeAll(() => {
  const noop = new Proxy({}, { get: () => () => undefined, set: () => true });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
});

describe('a bench for a standing robot', () => {
  for (const id of ['desk', 'lab'] as const) {
    it(`${id}: stands on the floor in front of the robot, its top at the work height`, () => {
      const env = createEnvironment();
      env.apply(id);
      const stance = { standing: true, hand: 0.8, front: 0.2 };
      env.fit(0.4, 0, stance);
      expect(env.drop).toBe(0);
      // Ahead of the edge the bench top; behind it, where the robot stands, the floor.
      expect(env.supportBelow(0.35, 0, 1.5)).toBeCloseTo(0.8, 2);
      expect(env.supportBelow(-0.1, 0, 1.5)).toBeCloseTo(0, 6);
    });

    it(`${id}: turns with a robot that faces another way`, () => {
      const env = createEnvironment();
      env.apply(id);
      env.fit(0.4, 0, { standing: true, hand: 0.8, front: 0.2, facing: Math.PI });
      expect(env.supportBelow(-0.35, 0, 1.5)).toBeCloseTo(0.8, 2);
      expect(env.supportBelow(0.35, 0, 1.5)).toBeCloseTo(0, 6);
    });
  }

  it('still bolts a robot that is not standing on top of the desk', () => {
    const env = createEnvironment();
    env.apply('desk');
    env.fit(0.4, 0);
    expect(env.drop).toBeGreaterThan(0.4);
    expect(env.supportBelow(0.3, 0, 0.5)).toBeCloseTo(0, 2);
  });
});
