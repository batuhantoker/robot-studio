/** A slot is a group posed from one chain frame, displaced in exploded views. */
import * as THREE from 'three';
import type { ChainFrames } from '../../../core/chain/model/types';
import type { Transform } from '../../../core/math/linear/transform';
import { setFromTransform } from '../../common/orient';

export interface Slot {
  group: THREE.Group;
  frame: (f: ChainFrames) => Transform;
  /** Chain joint whose moved frame carries this slot rigidly; -1 is the world. */
  body: number;
  /** Chain joints whose motion precedes this slot; their axes set the explode direction. */
  before: number;
}

/** Cumulative explode: each joint opens along its own axis, carrying everything downstream. */
export function poseSlots(slots: Slot[], f: ChainFrames, gaps: number[], explode: number): void {
  const shift = new THREE.Vector3();
  const offsets: THREE.Vector3[] = [new THREE.Vector3()];
  for (let j = 0; j < gaps.length; j++) {
    shift.addScaledVector(new THREE.Vector3(...f.axes[j]), gaps[j] * explode);
    offsets.push(shift.clone());
  }
  for (const slot of slots) {
    setFromTransform(slot.group, slot.frame(f));
    slot.group.position.add(offsets[slot.before]);
  }
}
