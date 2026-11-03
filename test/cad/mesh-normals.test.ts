import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { meshGeometry } from '@/cad/assembly/mjcf/geometry';

// A dense sphere in metres, as MuJoCo hands meshes over: many vertices within a centimetre of each other.
function denseSphere(radius: number, segments: number) {
  const g = new THREE.SphereGeometry(radius, segments, segments).toNonIndexed();
  const p = g.attributes.position.array as Float32Array;
  return { vertices: Float32Array.from(p), faces: Uint32Array.from({ length: p.length / 3 }, (_, i) => i) };
}

// Two 4 mm plates 2 mm apart, the second tilted 20° about x: closer than a centimetre, within the crease angle.
const tilt = (20 * Math.PI) / 180;
const plate = (z: number, a: number) => [[0, 0], [0.004, 0], [0.004, 0.004], [0, 0.004]].flatMap(([x, y]) => [x, y * Math.cos(a), z + y * Math.sin(a)]);
const plates = () => ({ vertices: Float32Array.from([...plate(0, 0), ...plate(0.002, tilt)]), faces: Uint32Array.from([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]) });

describe('mesh normals for compiled CAD meshes', () => {
  it('keeps the mesh at its size in metres', () => {
    const geo = meshGeometry(denseSphere(0.04, 24));
    geo.computeBoundingSphere();
    expect(geo.boundingSphere!.radius).toBeCloseTo(0.04, 4);
    const p = meshGeometry(plates()).attributes.position;
    expect(p.getX(1)).toBeCloseTo(0.004, 7);
    expect(p.getZ(8)).toBeCloseTo(0.002 + 0.004 * Math.sin(tilt), 7);
  });

  it('shades a dense small mesh smoothly and quickly', () => {
    const mesh = denseSphere(0.03, 400);
    const t0 = performance.now();
    const geo = meshGeometry(mesh);
    const ms = performance.now() - t0;
    // Welding on a 1 cm grid made this quadratic (tens of seconds); in millimetres it is linear.
    expect(ms).toBeLessThan(3000);
    const p = geo.attributes.position, n = geo.attributes.normal;
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    let worst = 1;
    for (let i = 0; i < p.count; i += 97) {
      v.fromBufferAttribute(p, i).normalize();
      nv.fromBufferAttribute(n, i);
      worst = Math.min(worst, v.dot(nv));
    }
    // A sphere's normals point out of its centre.
    expect(worst).toBeGreaterThan(0.99);
  });

  it('keeps separate nearby surfaces from smoothing into each other', () => {
    const n = meshGeometry(plates()).attributes.normal;
    const expectNormal = (i: number, want: number[]) => [n.getX(i), n.getY(i), n.getZ(i)].forEach((v, k) => expect(v).toBeCloseTo(want[k], 5));
    for (let i = 0; i < 6; i++) expectNormal(i, [0, 0, 1]);
    for (let i = 6; i < 12; i++) expectNormal(i, [0, -Math.sin(tilt), Math.cos(tilt)]);
  });
});
