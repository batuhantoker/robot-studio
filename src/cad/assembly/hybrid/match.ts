/** A twin link keeps its real CAD while its joint stays what it was: mass and radius never touch it, and an offset edit reshapes it. */
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
  const delta = new THREE.Vector3(...link.offset).sub(restOffset);
  const restLength = restOffset.length();
  const along = restLength > 1e-9 ? restOffset.normalize() : delta.clone().normalize();
  return { dir: along.lengthSq() > 0 ? along : new THREE.Vector3(1, 0, 0), restLength, delta };
}
