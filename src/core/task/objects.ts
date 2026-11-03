/** What each gripper handles, sized to its jaws: a block for two jaws, a can for three fingers, a carton for a cup. */
import type { EffectorKind } from '../robot/schema/types';
import type { TaskObject } from './types';

export interface GripRange {
  min: number;
  max: number;
  rest: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** `s` is the effector's drawing scale; null for tools that do not grip. */
export function taskObject(kind: EffectorKind, s: number, grip: GripRange): TaskObject | null {
  if (kind === 'parallel') {
    const w = clamp(0.75 * s, grip.min * 2, grip.max * 0.7);
    const h = 1.15 * w;
    return { kind: 'block', label: 'Block', size: [w, w, h], hold: w, open: Math.min(grip.max, w + 0.5 * s), graspZ: 0.25 * h };
  }
  if (kind === 'three_finger') {
    const d = clamp(0.9 * grip.rest, grip.min * 1.3, grip.max * 0.75);
    const h = 1.3 * d;
    return { kind: 'can', label: 'Can', size: [d, d, h], hold: d, open: Math.min(grip.max, d + 0.6 * s), graspZ: 0.3 * h };
  }
  if (kind === 'suction') {
    const h = 0.7 * s;
    return { kind: 'carton', label: 'Carton', size: [1.9 * s, 1.4 * s, h], hold: grip.min, open: grip.max, graspZ: h };
  }
  return null;
}
