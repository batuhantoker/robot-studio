/**
 * Keep robots out of the floor. Floating-base robots (legged, humanoid, wheeled) settle so their
 * lowest point rests on the ground, as their real base would; bolted arms only rise while exploded.
 */
import type * as THREE from 'three';
import { type Solid, lowestZ, solids } from '../../cad/common/lowest';

export type Grounding = 'bolted' | 'settle';

/** Lift the holder as its grounding needs; returns the solids as measured with the holder at rest. */
export function groundRobot(holder: THREE.Object3D, assembly: THREE.Object3D, floorZ: number, grounding: Grounding, exploded: boolean): Solid[] {
  holder.position.z = 0;
  holder.updateMatrixWorld(true);
  const list = solids(assembly);
  if (grounding === 'bolted' && !exploded) return list;
  const min = lowestZ(list);
  if (Number.isFinite(min)) holder.position.z = grounding === 'settle' ? floorZ - min : Math.max(0, floorZ - min);
  return list;
}
