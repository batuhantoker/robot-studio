import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stretchGeometry } from '@/cad/assembly/hybrid/stretch';

describe('slice stretching', () => {
  it('keeps both housings rigid and moves the far end by the length change (float32 buffers)', () => {
    const tube = new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 20).translate(0, 0.5, 0);
    const plan = { dir: new THREE.Vector3(0, 1, 0), restLength: 1, delta: new THREE.Vector3(0, 0.4, 0) };
    const out = stretchGeometry(tube, new THREE.Matrix4(), plan);
    const a = tube.attributes.position, b = out.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const y0 = a.getY(i), y1 = b.getY(i);
      if (y0 <= 0.33) expect(y1).toBeCloseTo(y0, 6);
      if (y0 >= 0.67) expect(y1).toBeCloseTo(y0 + 0.4, 6);
      expect(Math.hypot(b.getX(i), b.getZ(i))).toBeCloseTo(Math.hypot(a.getX(i), a.getZ(i)), 6);
    }
  });

  it('leans the mesh when the far end moves sideways, near end staying put', () => {
    const tube = new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 20).translate(0, 0.5, 0);
    const out = stretchGeometry(tube, new THREE.Matrix4(), { dir: new THREE.Vector3(0, 1, 0), restLength: 1, delta: new THREE.Vector3(0.2, 0, 0) });
    const a = tube.attributes.position, b = out.attributes.position;
    for (let i = 0; i < a.count; i++) {
      if (a.getY(i) <= 0.33) expect(b.getX(i)).toBeCloseTo(a.getX(i), 6);
      if (a.getY(i) >= 0.67) expect(b.getX(i)).toBeCloseTo(a.getX(i) + 0.2, 6);
    }
  });

  it('moves what stands past the joint on a link with no length', () => {
    const block = new THREE.BoxGeometry(0.1, 0.1, 0.1, 1, 1, 1);
    const out = stretchGeometry(block, new THREE.Matrix4(), { dir: new THREE.Vector3(1, 0, 0), restLength: 0, delta: new THREE.Vector3(0.05, 0, 0) });
    const a = block.attributes.position, b = out.attributes.position;
    for (let i = 0; i < a.count; i++) expect(b.getX(i) - a.getX(i)).toBeCloseTo(a.getX(i) > 0 ? 0.05 : 0, 6);
  });
});
