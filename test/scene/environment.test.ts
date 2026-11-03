import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ENVIRONMENTS, createEnvironment } from '@/scene/stage/environment';

// Scenery paints small canvas textures; node has no canvas, and nothing here draws them.
beforeAll(() => {
  const noop = new Proxy({}, { get: () => () => undefined, set: () => true });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
});

const down = (x: number, y: number) => new THREE.Ray(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1));

describe('settings around the robot', () => {
  it('builds, poses and rebuilds every setting', () => {
    const env = createEnvironment();
    for (const [id] of ENVIRONMENTS) {
      env.apply(id);
      env.fit(0.5, 0);
      env.update(0.5);
      env.update(3);
      expect(env.group.children.length).toBe(id === 'open' ? 0 : 1);
    }
  });

  it('moves the work cell parcels along the belt while motion is on, and holds them when off', () => {
    const env = createEnvironment();
    env.apply('cell');
    env.fit(0.5, 0);
    const parcels = () => {
      const out: number[] = [];
      env.group.traverse((o) => o.userData.moving && o.type === 'Group' && out.push(o.position.x));
      return out;
    };
    env.update(0);
    const a = parcels();
    env.update(0.1);
    const b = parcels();
    expect(a.length).toBeGreaterThan(3);
    expect(b.some((x, i) => Math.abs(x - a[i]) > 1e-4)).toBe(true);
    env.motion = false;
    env.update(0.1);
    expect(parcels()).toEqual(b);
  });

  it('finds the belt top for a pick spot, and the floor beside it', () => {
    const env = createEnvironment();
    env.apply('cell');
    env.fit(0.5, 0.1);
    const s = 0.5, beltTop = 0.1 + 0.5 * s + 0.0175 * s;
    // Behind the robot, between the hoods; parcels ride the belt but are skipped as moving.
    const x = 0;
    const hit = env.hit(down(x, 1.3 * s));
    expect(hit?.top).toBe(true);
    expect(hit?.point.z).toBeCloseTo(beltTop, 4);
    const side = env.hit(new THREE.Ray(new THREE.Vector3(x, -3, beltTop - 0.04 * s), new THREE.Vector3(0, 1, 0)));
    expect(side?.top).toBe(false);
    expect(env.supportBelow(x, 1.3 * s, beltTop + 0.05)).toBeCloseTo(beltTop, 4);
    expect(env.supportBelow(0.6 * s, -0.6 * s, 0.3)).toBeCloseTo(0.1, 6);
  });

  it('puts a raised setting under the robot and its floor a table height below', () => {
    const env = createEnvironment();
    env.apply('lab');
    env.fit(0.4, 0);
    expect(env.drop).toBeGreaterThan(0.4);
    expect(env.supportBelow(0.3, -0.1, 0.05)).toBeCloseTo(0, 4);
    expect(env.supportBelow(3, -2, 0.05)).toBeCloseTo(-env.drop, 6);
  });

  it('brings the belt, the vise and the pick station to a standing robot\'s hands', () => {
    const hand = 0.7, front = 0.2, u = hand / 1.6;
    const stance = { standing: true, hand, front };
    const env = createEnvironment();
    env.apply('cell');
    env.fit(0.4, 0, stance);
    const belt = front + 0.25 * u + 0.06 * u;
    expect(env.supportBelow(belt, 0, hand + 0.05)).toBeCloseTo(hand, 3);
    env.apply('warehouse');
    env.fit(0.4, 0, stance);
    expect(env.supportBelow(front + 0.3 * u, 0, hand + 0.05)).toBeCloseTo(hand, 2);
    env.apply('machine');
    env.fit(0.4, 0, stance);
    // The mill stands at the robot's left with its vise at hand height; the parts table is in front.
    const vise = env.supportBelow(0, front + 0.06 * u + 0.55 * u, hand + 0.05);
    expect(Math.abs(vise - hand)).toBeLessThan(0.05 * u);
    expect(env.supportBelow(front + 0.36 * u, -0.2 * u, hand + 0.05)).toBeCloseTo(hand, 3);
  });
});
