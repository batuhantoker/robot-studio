import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { tag } from '@/cad/common/part';
import { solids } from '@/cad/common/lowest';
import { footprints } from '@/scene/overlays/contact/patches';

const TOL = 0.004, GAP = 0.01, DEPTH = 0.012;

function solid(root: THREE.Group, geometry: THREE.BufferGeometry, x: number, z: number, turn = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry);
  mesh.position.set(x, 0, z);
  mesh.rotation.x = turn;
  tag(mesh, { label: 'part', layer: 'housing', material: 'paint' });
  root.add(mesh);
  return mesh;
}

const patches = (root: THREE.Group) => {
  root.updateMatrixWorld(true);
  return footprints(solids(root), 0, TOL, GAP, DEPTH);
};

describe('floor contact', () => {
  it('calls a part resting on the floor normal contact', () => {
    const root = new THREE.Group();
    solid(root, new THREE.BoxGeometry(1, 1, 1), 0, 0.5);
    const list = patches(root);
    expect(list).toHaveLength(1);
    expect(list[0].sunk).toBe(false);
  });

  it('flags a part that really goes through the floor', () => {
    const root = new THREE.Group();
    solid(root, new THREE.BoxGeometry(1, 1, 1), 0, 0.3);
    expect(patches(root)[0].sunk).toBe(true);
  });

  it('tolerates a dip inside the contact depth', () => {
    const root = new THREE.Group();
    solid(root, new THREE.BoxGeometry(1, 1, 1), 0, 0.5 - DEPTH / 2);
    expect(patches(root)[0].sunk).toBe(false);
  });

  it('is not fooled by a loose bound on a turned part', () => {
    const root = new THREE.Group();
    // The turned box's corners dip below the floor; the sphere's surface never does.
    solid(root, new THREE.SphereGeometry(0.5, 48, 32), 0, 0.5, Math.PI / 4);
    root.updateMatrixWorld(true);
    expect(solids(root)[0].bound).toBeLessThan(-DEPTH);
    expect(patches(root).every((p) => !p.sunk)).toBe(true);
  });

  it('marks only the part that sank, not the base beside it', () => {
    const root = new THREE.Group();
    solid(root, new THREE.BoxGeometry(1, 1, 1), 0, 0.5);
    solid(root, new THREE.BoxGeometry(1, 1, 1), 5, 0.3);
    const list = patches(root);
    expect(list).toHaveLength(2);
    const sunk = list.filter((p) => p.sunk);
    expect(sunk).toHaveLength(1);
    expect(sunk[0].hull.every(([x]) => x > 4)).toBe(true);
  });

  it('keeps a sunk part apart from a resting one it touches', () => {
    const root = new THREE.Group();
    solid(root, new THREE.BoxGeometry(1, 1, 1), 0, 0.5);
    solid(root, new THREE.BoxGeometry(1, 1, 1), 1, 0.3);
    expect(patches(root).map((p) => p.sunk).sort()).toEqual([false, true]);
  });

  it('merges parts that rest side by side into one footprint', () => {
    const root = new THREE.Group();
    solid(root, new THREE.BoxGeometry(1, 1, 1), 0, 0.5);
    solid(root, new THREE.BoxGeometry(1, 1, 1), 1, 0.5);
    expect(patches(root)).toHaveLength(1);
  });
});
