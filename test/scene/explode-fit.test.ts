import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OPEN_LENS, fitLens } from '@/scene/viewport/explode-fit';

const room = { x: 1, y: 1 };
function view(at: [number, number, number] = [2, -3, 1.2]) {
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.01, 50);
  camera.up.set(0, 0, 1);
  const pivot = new THREE.Vector3(0.2, 0, 0.5);
  camera.position.set(...at);
  camera.lookAt(pivot);
  camera.updateMatrixWorld();
  return { camera, pivot };
}
const box = (zTop: number) => new THREE.Box3(new THREE.Vector3(-0.15, -0.15, 0), new THREE.Vector3(0.75, 0.15, zTop));

/** Where the corners land through a lens, on screen, with the camera turned round the pivot. */
function reach(b: THREE.Box3, lens: typeof OPEN_LENS, camera: THREE.PerspectiveCamera, pivot: THREE.Vector3, turn = 0) {
  const c = camera.clone();
  c.position.sub(pivot).applyAxisAngle(new THREE.Vector3(0, 0, 1), turn).add(pivot);
  c.lookAt(pivot);
  c.zoom = lens.zoom;
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  let most = 0;
  for (let k = 0; k < 8; k++) {
    const p = new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).project(c);
    most = Math.max(most, Math.abs(p.x), Math.abs(p.y + lens.lift));
  }
  return most;
}

describe('the lens that frames an opened robot', () => {
  it('leaves a robot that has not grown alone', () => {
    const { camera, pivot } = view();
    const lens = fitLens(box(1), box(1), camera, pivot, room);
    expect(lens.zoom).toBe(1);
    expect(lens.lift).toBeCloseTo(0, 9);
  });

  it('brings a stack that would leave the frame back inside it', () => {
    const { camera, pivot } = view();
    const open = box(2.2);
    expect(reach(open, OPEN_LENS, camera, pivot)).toBeGreaterThan(1);
    const lens = fitLens(box(1), open, camera, pivot, room);
    expect(lens.zoom).toBeLessThan(1);
    expect(reach(open, lens, camera, pivot)).toBeLessThan(1);
  });

  it('holds the frame all the way round, so an orbit needs no refit', () => {
    const { camera, pivot } = view();
    const open = box(2.2);
    const lens = fitLens(box(1), open, camera, pivot, room);
    for (let t = 0; t < 6.3; t += 0.3) expect(reach(open, lens, camera, pivot, t)).toBeLessThan(1.02);
  });

  it('never zooms in, and keeps a user who was close up as close as they were', () => {
    const near = view([0.6, -0.8, 0.7]);
    const lens = fitLens(box(1), box(1.25), near.camera, near.pivot, room);
    expect(lens.zoom).toBeLessThanOrEqual(1);
    expect(lens.zoom).toBeGreaterThan(0.69);
  });

  it('leaves room for what covers the view', () => {
    const { camera, pivot } = view();
    const open = box(2.2);
    expect(fitLens(box(1), open, camera, pivot, { x: 1, y: 0.6 }).zoom).toBeLessThan(fitLens(box(1), open, camera, pivot, room).zoom);
  });
});
