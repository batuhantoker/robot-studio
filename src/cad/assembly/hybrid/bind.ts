/** Which real CAD geoms ride each twin link, expressed in that link's zero-pose frame. */
import * as THREE from 'three';
import type { Twin } from '../../../core/chain/twin/spec-from-chain';
import type { ModelChain } from '../../../physics/extract/chain/from-model';
import { type GeomInfo, readGeoms, visibleGeom } from '../../../physics/extract/geoms';
import type { ModelHandle } from '../../../physics/model/handle';

export interface BoundGeom {
  geom: GeomInfo;
  /** Geom → twin link frame (rotation C_k, origin at the joint anchor). */
  toLink: THREE.Matrix4;
}

export const matrixOf = (R: ArrayLike<number>, p: ArrayLike<number>) =>
  new THREE.Matrix4().set(R[0], R[1], R[2], p[0], R[3], R[4], R[5], p[1], R[6], R[7], R[8], p[2], 0, 0, 0, 1);

/** Geoms per chain joint (index n is unused; index -1 entries land in `base`). */
export function bindGeoms(h: ModelHandle, mc: ModelChain, twin: Twin, hides?: (geom: GeomInfo) => boolean) {
  const links: BoundGeom[][] = mc.chain.joints.map(() => []);
  const base: BoundGeom[] = [];
  for (const geom of readGeoms(h).filter((g) => visibleGeom(g) && !hides?.(g))) {
    const at = mc.attach[geom.body];
    const geomPose = new THREE.Matrix4().compose(
      new THREE.Vector3(...geom.pos),
      new THREE.Quaternion(geom.quat[1], geom.quat[2], geom.quat[3], geom.quat[0]),
      new THREE.Vector3(1, 1, 1),
    );
    const attach = matrixOf(at.T.R, at.T.p);
    if (at.joint < 0) {
      base.push({ geom, toLink: matrixOf(mc.chain.base.R, mc.chain.base.p).multiply(attach).multiply(geomPose) });
      continue;
    }
    const rotate = matrixOf(twin.rotations[at.joint], [0, 0, 0]);
    links[at.joint].push({ geom, toLink: rotate.multiply(attach).multiply(geomPose) });
  }
  return { links, base };
}
