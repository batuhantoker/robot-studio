import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { lowestSolidZ, solids } from '@/cad/common/lowest';
import { tag } from '@/cad/common/part';
import { contactPatches } from '@/scene/overlays/contact/patches';

/** A unit cube resting on z = 0, spun about its vertical axis so its box corners overreach. */
function block(x: number, spin = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2).translate(0, 0, 0.1));
  mesh.position.x = x;
  mesh.rotation.set(0, 0, spin);
  return mesh;
}

describe('lowest solid point', () => {
  it('is exact where box corners of a tilted mesh reach below it', () => {
    const root = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16));
    ball.rotation.set(0.6, 0.3, 0);
    ball.position.z = 0.5;
    root.add(ball);
    root.updateMatrixWorld(true);
    const p = ball.geometry.attributes.position;
    const exact = Math.min(...Array.from({ length: p.count }, (_, i) =>
      new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(ball.matrixWorld).z));
    expect(lowestSolidZ(root)).toBeCloseTo(exact, 6);
    expect(solids(root)[0].bound).toBeLessThan(exact - 0.02);
  });

  it('ignores hidden parts and kinematic helpers such as inertia boxes', () => {
    const root = new THREE.Group();
    const inertia = block(0);
    inertia.position.z = -0.4;
    tag(inertia, { label: 'Equivalent-inertia box', layer: 'kinematic' });
    const hidden = block(0.5);
    hidden.position.z = -1;
    hidden.visible = false;
    root.add(block(0), inertia, hidden);
    expect(lowestSolidZ(root)).toBeCloseTo(0, 6);
  });
});

describe('ground contact patches', () => {
  const patchesOf = (...meshes: THREE.Mesh[]) => {
    const root = new THREE.Group();
    root.add(...meshes);
    root.updateMatrixWorld(true);
    return contactPatches(solids(root), 0, 0.002, 0.01);
  };

  it('finds one footprint per separate foot and merges parts of one base', () => {
    expect(patchesOf(block(0), block(1))).toHaveLength(2);
    expect(patchesOf(block(0), block(0.1, 0.4))).toHaveLength(1);
  });

  it('outlines the whole sole of a foot', () => {
    const [sole] = patchesOf(block(0, Math.PI / 4));
    expect(sole).toHaveLength(4);
    expect(Math.max(...sole.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(Math.SQRT2 * 0.1, 6);
  });

  it('skips parts that hover above the tolerance', () => {
    const lifted = block(0);
    lifted.position.z = 0.01;
    expect(patchesOf(lifted)).toHaveLength(0);
  });
});
