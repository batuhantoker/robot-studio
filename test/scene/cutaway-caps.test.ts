import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { part } from '@/cad/common/part';
import { MaterialSet } from '@/cad/materials/library';
import { Cutaway } from '@/scene/teardown/cutaway';

describe('section caps', () => {
  it('cut each body on its own plane, even when two bodies share a paint', () => {
    const mats = new MaterialSet();
    const root = new THREE.Group();
    const stepped = new THREE.Group();
    stepped.userData.cut = 0.05;
    const mesh = () => part(new THREE.BoxGeometry(1, 1, 1), mats, 'shell', { label: 'Casting', layer: 'housing' });
    const [plain, onStep] = [mesh(), mesh()];
    stepped.add(onStep);
    root.add(stepped, plain);
    const cut = new Cutaway(root, 'procedural');
    cut.apply('section', null);
    const planes = new Set<THREE.Plane>();
    cut.section.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m instanceof THREE.MeshBasicMaterial && m.side === THREE.BackSide) planes.add(m.clippingPlanes![0]);
    });
    expect(planes.size).toBe(2);
    cut.dispose();
    mats.dispose();
  });
});
