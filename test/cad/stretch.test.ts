import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stretchGeometry } from '@/cad/assembly/hybrid/stretch';

describe('slice stretching', () => {
  it('keeps both housings rigid and moves the far end by the length change (float32 buffers)', () => {
    const tube = new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 20).translate(0, 0.5, 0);
    const plan = { dir: new THREE.Vector3(0, 1, 0), restLength: 1, length: 1.4, thickness: 1 };
    const out = stretchGeometry(tube, new THREE.Matrix4(), plan);
    const a = tube.attributes.position, b = out.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const y0 = a.getY(i), y1 = b.getY(i);
      if (y0 <= 0.33) expect(y1).toBeCloseTo(y0, 6);
      if (y0 >= 0.67) expect(y1).toBeCloseTo(y0 + 0.4, 6);
      expect(Math.hypot(b.getX(i), b.getZ(i))).toBeCloseTo(Math.hypot(a.getX(i), a.getZ(i)), 6);
    }
  });
});
