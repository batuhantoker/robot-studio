/** MuJoCo tendons drawn as cable through their wrap points, re-read from the model after every pose. */
import * as THREE from 'three';
import type { ModelHandle } from '../../../physics/model/handle';
import { tag } from '../../common/part';
import type { MaterialSet } from '../../materials/library';

interface TendonModel {
  ntendon: number;
  tendon_adr: ArrayLike<number>;
  tendon_num: ArrayLike<number>;
  wrap_type: ArrayLike<number>;
  tendon_width: ArrayLike<number>;
  tendon_rgba: ArrayLike<number>;
}
interface TendonData {
  ten_wrapadr: ArrayLike<number>;
  ten_wrapnum: ArrayLike<number>;
  wrap_obj: ArrayLike<number>;
  wrap_xpos: ArrayLike<number>;
}

const UP = new THREE.Vector3(0, 1, 0);
const WRAP_JOINT = 1;
const PULLEY = -2;

export interface TendonCables {
  root: THREE.Group;
  update(): void;
  dispose(): void;
}

export function tendonCables(h: ModelHandle, mats: MaterialSet): TendonCables | null {
  const m = h.model as unknown as TendonModel;
  // Fixed tendons only couple joints (the Shadow Hand's finger tips); just spatial ones run through space.
  const spatial = Array.from({ length: m.ntendon }, (_, t) => t).filter((t) => m.wrap_type[m.tendon_adr[t]] !== WRAP_JOINT);
  if (!spatial.length) return null;
  const d = h.data as unknown as TendonData;
  const root = new THREE.Group();
  root.userData.module = 'tendon';
  const segment = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const knot = new THREE.SphereGeometry(1, 10, 8);
  const label = spatial.length > 1 ? `Tendons (${spatial.length})` : 'Tendon';
  // One pair of instanced meshes per colour, so 700 muscles cost two draw calls, not 1400.
  const byColour = new Map<string, number[]>();
  for (const t of spatial) {
    const key = Array.from({ length: 4 }, (_, k) => m.tendon_rgba[4 * t + k].toFixed(3)).join(',');
    byColour.set(key, [...(byColour.get(key) ?? []), t]);
  }
  const batches = [...byColour.entries()].map(([key, tendons]) => {
    const { material, cls } = mats.cad(key.split(',').map(Number), 'tendon cable');
    // A wrap object contributes at most two path points (a geom's tangent points).
    const room = tendons.reduce((s, t) => s + 2 * m.tendon_num[t], 0);
    const segs = new THREE.InstancedMesh(segment, material, room);
    const knots = new THREE.InstancedMesh(knot, material, room);
    for (const im of [segs, knots]) {
      im.frustumCulled = false;
      im.castShadow = true;
      tag(im, { label, layer: 'cable', material: cls });
      root.add(im);
    }
    return { tendons, segs, knots };
  });
  const a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3(), size = new THREE.Vector3();
  const q = new THREE.Quaternion(), mat = new THREE.Matrix4();
  const at = (i: number, v: THREE.Vector3) => v.set(d.wrap_xpos[3 * i], d.wrap_xpos[3 * i + 1], d.wrap_xpos[3 * i + 2]);
  return {
    root,
    update() {
      for (const batch of batches) {
        let k = 0, s = 0;
        for (const t of batch.tendons) {
          const r = m.tendon_width[t], adr = d.ten_wrapadr[t], n = d.ten_wrapnum[t];
          for (let i = adr; i < adr + n; i++) {
            if (d.wrap_obj[i] === PULLEY) continue;
            batch.knots.setMatrixAt(k++, mat.compose(at(i, a), q.identity(), size.setScalar(r)));
            // A pulley splits the path into branches: no segment crosses it.
            if (i + 1 >= adr + n || d.wrap_obj[i + 1] === PULLEY) continue;
            dir.subVectors(at(i + 1, b), at(i, a));
            const len = dir.length();
            if (len > 1e-9) q.setFromUnitVectors(UP, dir.divideScalar(len));
            batch.segs.setMatrixAt(s++, mat.compose(a.add(b).multiplyScalar(0.5), q, size.set(r, len, r)));
          }
        }
        batch.knots.count = k;
        batch.segs.count = s;
        batch.knots.instanceMatrix.needsUpdate = batch.segs.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      segment.dispose();
      knot.dispose();
      for (const batch of batches) {
        batch.segs.dispose();
        batch.knots.dispose();
      }
    },
  };
}
