/** MuJoCo tendons drawn as cable through their wrap points, re-read from the model after every pose. */
import * as THREE from 'three';
import type { ModelHandle } from '../../../physics/model/handle';
import { tag } from '../../common/part';
import type { MaterialSet } from '../../materials/library';

interface TendonModel {
  ntendon: number;
  nwrap: number;
  tendon_width: ArrayLike<number>;
  tendon_rgba: ArrayLike<number>;
}
interface TendonData {
  ten_wrapadr: ArrayLike<number>;
  ten_wrapnum: ArrayLike<number>;
  wrap_xpos: ArrayLike<number>;
}

const UP = new THREE.Vector3(0, 1, 0);

export interface TendonCables {
  root: THREE.Group;
  update(): void;
  dispose(): void;
}

export function tendonCables(h: ModelHandle, mats: MaterialSet): TendonCables | null {
  const m = h.model as unknown as TendonModel;
  if (!m.ntendon) return null;
  const d = h.data as unknown as TendonData;
  const root = new THREE.Group();
  root.userData.module = 'tendon';
  const segment = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const knot = new THREE.SphereGeometry(1, 10, 8);
  // Site-only paths have one point per site, but a wrapped path can add two per geom.
  const room = 2 * m.nwrap;
  const cables = Array.from({ length: m.ntendon }, (_, t) => {
    const rgba = [0, 1, 2, 3].map((k) => m.tendon_rgba[4 * t + k]);
    const { material, cls } = mats.cad(rgba, 'tendon cable');
    const label = m.ntendon > 1 ? `Tendon ${t + 1}` : 'Tendon';
    const segs = new THREE.InstancedMesh(segment, material, room);
    const knots = new THREE.InstancedMesh(knot, material, room);
    for (const im of [segs, knots]) {
      im.frustumCulled = false;
      im.castShadow = true;
      tag(im, { label, layer: 'cable', material: cls });
      root.add(im);
    }
    return { segs, knots, r: m.tendon_width[t] };
  });
  const a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3(), size = new THREE.Vector3();
  const q = new THREE.Quaternion(), mat = new THREE.Matrix4();
  return {
    root,
    update() {
      cables.forEach((c, t) => {
        const adr = d.ten_wrapadr[t], n = Math.min(d.ten_wrapnum[t], room);
        const at = (i: number, v: THREE.Vector3) => v.set(d.wrap_xpos[3 * (adr + i)], d.wrap_xpos[3 * (adr + i) + 1], d.wrap_xpos[3 * (adr + i) + 2]);
        for (let i = 0; i < n; i++) c.knots.setMatrixAt(i, mat.compose(at(i, a), q.identity(), size.setScalar(c.r)));
        for (let i = 0; i + 1 < n; i++) {
          dir.subVectors(at(i + 1, b), at(i, a));
          const len = dir.length();
          if (len > 1e-9) q.setFromUnitVectors(UP, dir.divideScalar(len));
          c.segs.setMatrixAt(i, mat.compose(a.add(b).multiplyScalar(0.5), q, size.set(c.r, len, c.r)));
        }
        c.knots.count = n;
        c.segs.count = Math.max(n - 1, 0);
        c.knots.instanceMatrix.needsUpdate = c.segs.instanceMatrix.needsUpdate = true;
      });
    },
    dispose() {
      segment.dispose();
      knot.dispose();
      for (const c of cables) {
        c.segs.dispose();
        c.knots.dispose();
      }
    },
  };
}
