/**
 * Collision volumes of a slotted assembly, each expressed in the chain frame its slot rides.
 * Slots without hull markers (bound CAD meshes of a twin) fall back to one box per mesh.
 */
import * as THREE from 'three';
import { chainFrames, zeroPose } from '../../../core/chain/kinematics/frames';
import type { Chain } from '../../../core/chain/model/types';
import type { HullShape, HullVolume } from '../../../core/collision/hull';
import { hullOf } from '../../common/hull';
import { matrixOf, transformOf } from '../../common/orient';
import { partOf } from '../../common/part';
import type { Slot } from '../spec/slots';
import { moduleOf } from '../types';

const SKIP = new Set(['kinematic', 'cable', 'fastener', 'sensor']);

export function collectHull(slots: Slot[], chain: Chain): HullVolume[] {
  const f = chainFrames(chain, zeroPose(chain));
  const out: HullVolume[] = [];
  for (const slot of slots) {
    slot.group.updateWorldMatrix(true, true);
    const toSlot = slot.group.matrixWorld.clone().invert();
    const body = slot.body < 0 ? new THREE.Matrix4() : matrixOf(f.frames[slot.body]);
    const inBody = body.invert().multiply(matrixOf(slot.frame(f)));
    const add = (o: THREE.Object3D, shape: HullShape, size: number[], local = new THREE.Matrix4()) => {
      const m = inBody.clone().multiply(toSlot.clone().multiply(o.matrixWorld)).multiply(local);
      out.push({ body: slot.body, shape, size, pose: transformOf(m), module: moduleOf(o) ?? '' });
    };
    const before = out.length;
    slot.group.traverse((o) => {
      const h = hullOf(o);
      if (h) add(o, h.shape, h.size);
    });
    if (out.length > before) continue;
    slot.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || SKIP.has(partOf(mesh)?.layer ?? '')) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      if (Math.min(half.x, half.y, half.z) <= 0) return;
      add(mesh, 'box', half.toArray(), new THREE.Matrix4().makeTranslation(box.getCenter(new THREE.Vector3())));
    });
  }
  return out;
}
