/** A twin link keeps its real CAD while its joint and direction match the source robot. */
import * as THREE from 'three';
import type { Twin } from '../../../core/chain/twin/spec-from-chain';
import type { LinkSpec } from '../../../core/robot/schema/types';
import type { StretchPlan } from './stretch';

export function cadPlan(link: LinkSpec, k: number, rest: Twin): StretchPlan | null {
  const restLink = rest.spec.links[k];
  if (!restLink || link.joint !== restLink.joint) return null;
  const axis = new THREE.Vector3(...link.axis);
  if (axis.dot(new THREE.Vector3(...restLink.axis)) < 0.9999) return null;
  const restOffset = new THREE.Vector3(...rest.restOffsets[k]);
  const offset = new THREE.Vector3(...link.offset);
  const restLength = restOffset.length();
  if (restLength < 1e-9 || offset.length() < 1e-9) {
    if (Math.abs(offset.length() - restLength) > 1e-6) return null;
  } else if (offset.clone().normalize().dot(restOffset.clone().normalize()) < 0.9998) {
    return null;
  }
  return {
    dir: restLength > 1e-9 ? restOffset.normalize() : new THREE.Vector3(1, 0, 0),
    restLength,
    length: offset.length(),
    thickness: link.radius / restLink.radius,
  };
}
