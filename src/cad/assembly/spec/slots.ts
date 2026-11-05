/** A slot is a group posed from one chain frame, displaced in exploded views. */
import * as THREE from 'three';
import type { ChainFrames } from '../../../core/chain/model/types';
import type { Transform } from '../../../core/math/linear/transform';
import { matVec } from '../../../core/math/linear/mat3';
import type { Vec3 } from '../../../core/math/linear/vec';
import { setFromTransform } from '../../common/orient';

/** How far a joint opens when exploded: along its axis, or along a direction of its own at the zero pose. */
export type Gap = number | { by: number; along: Vec3 };

export interface Slot {
  group: THREE.Group;
  frame: (f: ChainFrames) => Transform;
  /** Chain joint whose moved frame carries this slot rigidly; -1 is the world. */
  body: number;
  /** Chain joints whose motion precedes this slot; their axes set the explode direction. */
  before: number;
  /** Sits inside a casting whose hull already stands for it. */
  enclosed?: boolean;
}

/** Cumulative explode: each joint opens along its own axis, carrying everything downstream. */
export function poseSlots(slots: Slot[], f: ChainFrames, gaps: Gap[], explode: number): void {
  const shift = new THREE.Vector3();
  const offsets: THREE.Vector3[] = [new THREE.Vector3()];
  for (let j = 0; j < gaps.length; j++) {
    const g = gaps[j];
    if (typeof g === 'number') shift.addScaledVector(new THREE.Vector3(...f.axes[j]), g * explode);
    else shift.addScaledVector(new THREE.Vector3(...matVec(f.frames[j].R, g.along)), g.by * explode);
    offsets.push(shift.clone());
  }
  // Whatever opens downward would end under the floor, so all that rides the first joint rises to meet it.
  const rise = -Math.min(0, ...offsets.map((o) => o.z));
  for (const slot of slots) {
    setFromTransform(slot.group, slot.frame(f));
    slot.group.position.add(offsets[slot.before]);
    if (slot.before > 0) slot.group.position.z += rise;
  }
}
