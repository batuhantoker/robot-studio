import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ENVIRONMENTS, createEnvironment } from '@/scene/stage/environment';

// Scenery paints small canvas textures; node has no canvas, and nothing here draws them.
beforeAll(() => {
  const noop = new Proxy({}, { get: () => () => undefined, set: () => true });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
});

const bottom = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).min.z;

describe('loose parts in the settings', () => {
  it('puts parts to pick up in every setting, standing or bolted', () => {
    for (const [id] of ENVIRONMENTS.filter(([e]) => e !== 'open')) {
      for (const stance of [undefined, { standing: true, hand: 0.8, front: 0.2 }]) {
        const env = createEnvironment();
        env.apply(id);
        env.fit(0.5, 0, stance);
        expect(env.props.all().length, `${id} ${stance ? 'standing' : 'bolted'}`).toBeGreaterThan(0);
      }
    }
  });

  it('hands a part over, carries it, and sets it down on what is below', () => {
    const env = createEnvironment();
    env.apply('desk');
    env.fit(0.5, 0, { standing: true, hand: 0.8, front: 0.2 });
    const part = env.props.all()[0];
    const at = new THREE.Box3().setFromObject(part.object).getCenter(new THREE.Vector3());
    expect(env.props.near(at.clone().add(new THREE.Vector3(0, 0, 0.05)), 0.1)).toBe(part);
    const hand = new THREE.Group();
    env.props.take(part, hand);
    expect(env.props.all()).not.toContain(part);
    // Lift it, then drop it over the bench: it lands upright on the top.
    hand.position.set(0, 0, 0.3);
    hand.rotation.set(0.4, 0.2, 0);
    hand.updateMatrixWorld(true);
    env.props.put(part);
    expect(env.props.all()).toContain(part);
    expect(bottom(part.object)).toBeCloseTo(0.8, 3);
    // Carried off the bench toward the robot, it falls to the floor.
    env.props.take(part, hand);
    hand.position.set(-at.x - 0.1, -at.y, 0.3);
    hand.rotation.set(0, 0, 0);
    hand.updateMatrixWorld(true);
    env.props.put(part);
    expect(bottom(part.object)).toBeCloseTo(0, 3);
  });
});
